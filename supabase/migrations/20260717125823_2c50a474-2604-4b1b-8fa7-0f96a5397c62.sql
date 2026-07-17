
-- 1) New profile fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS avatar_path text,
  ADD COLUMN IF NOT EXISTS avatar_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

-- Length limits (control-char rejection handled in trigger)
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_display_name_len,
  DROP CONSTRAINT IF EXISTS profiles_bio_len;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_display_name_len
    CHECK (display_name IS NULL OR char_length(btrim(display_name)) BETWEEN 2 AND 50),
  ADD CONSTRAINT profiles_bio_len
    CHECK (bio IS NULL OR char_length(bio) <= 300);

-- 2) Sanitising trigger
CREATE OR REPLACE FUNCTION public.profiles_profile_fields_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.display_name IS NOT NULL THEN
    NEW.display_name := btrim(NEW.display_name);
    IF NEW.display_name = '' THEN
      NEW.display_name := NULL;
    ELSIF NEW.display_name ~ '[[:cntrl:]]' THEN
      RAISE EXCEPTION 'display_name contains control characters';
    END IF;
  END IF;

  IF NEW.bio IS NOT NULL THEN
    -- Strip null bytes; keep newlines. Block executable-looking payloads.
    NEW.bio := replace(NEW.bio, chr(0), '');
    IF NEW.bio = '' THEN
      NEW.bio := NULL;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND (
       NEW.display_name IS DISTINCT FROM OLD.display_name
    OR NEW.bio           IS DISTINCT FROM OLD.bio
    OR NEW.avatar_path   IS DISTINCT FROM OLD.avatar_path
  ) THEN
    NEW.updated_at := now();
    NEW.updated_by := auth.uid();
    IF NEW.avatar_path IS DISTINCT FROM OLD.avatar_path THEN
      NEW.avatar_updated_at := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_profile_fields_guard_trg ON public.profiles;
CREATE TRIGGER profiles_profile_fields_guard_trg
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profiles_profile_fields_guard();

-- 3) Safe classmate/tutor lookup (no email/phone leakage)
CREATE OR REPLACE FUNCTION public.get_public_profiles(_user_ids uuid[])
RETURNS TABLE (
  user_id uuid,
  display_name text,
  full_name text,
  avatar_path text,
  bio text,
  center_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_center uuid;
BEGIN
  IF v_caller IS NULL OR _user_ids IS NULL OR array_length(_user_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  SELECT p.center_id INTO v_caller_center
  FROM public.profiles p
  WHERE p.user_id = v_caller
  LIMIT 1;

  IF v_caller_center IS NULL AND NOT public.is_superadmin() THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.user_id, p.display_name, p.full_name, p.avatar_path, p.bio, p.center_id
  FROM public.profiles p
  WHERE p.user_id = ANY(_user_ids)
    AND (
      -- Own profile
      p.user_id = v_caller
      -- Same-centre admin / superadmin
      OR (public.is_admin() AND (p.center_id = v_caller_center OR public.is_superadmin()))
      -- Same-centre classmate via a shared active enrolment
      OR EXISTS (
        SELECT 1
        FROM public.class_enrollments ce1
        JOIN public.class_enrollments ce2 ON ce2.class_id = ce1.class_id
        WHERE ce1.student_user_id = v_caller
          AND ce1.status = 'active'
          AND ce2.student_user_id = p.user_id
          AND ce2.status = 'active'
      )
      -- Tutor viewing an enrolled student in a class they teach
      OR EXISTS (
        SELECT 1
        FROM public.class_tutors ct
        JOIN public.class_enrollments ce ON ce.class_id = ct.class_id
        WHERE ct.tutor_user_id = v_caller
          AND ce.student_user_id = p.user_id
          AND ce.status = 'active'
      )
      -- Student viewing an assigned tutor of a class they are enrolled in
      OR EXISTS (
        SELECT 1
        FROM public.class_enrollments ce
        JOIN public.class_tutors ct ON ct.class_id = ce.class_id
        WHERE ce.student_user_id = v_caller
          AND ce.status = 'active'
          AND ct.tutor_user_id = p.user_id
      )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_profiles(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_public_profiles(uuid[]) TO authenticated;

-- 4) Admin moderation
CREATE OR REPLACE FUNCTION public.admin_clear_student_profile(
  _target uuid,
  _clear_bio boolean DEFAULT false,
  _clear_avatar boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_target_center uuid;
  v_caller_center uuid;
  v_avatar text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.is_superadmin() OR public.is_admin()) THEN
    RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501';
  END IF;

  SELECT center_id, avatar_path INTO v_target_center, v_avatar
  FROM public.profiles WHERE user_id = _target LIMIT 1;
  IF v_target_center IS NULL THEN
    RAISE EXCEPTION 'target not found' USING ERRCODE = '22023';
  END IF;

  IF NOT public.is_superadmin() THEN
    SELECT center_id INTO v_caller_center FROM public.profiles WHERE user_id = v_caller LIMIT 1;
    IF v_caller_center IS DISTINCT FROM v_target_center THEN
      RAISE EXCEPTION 'target is in a different centre' USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE public.profiles
     SET bio = CASE WHEN _clear_bio THEN NULL ELSE bio END,
         avatar_path = CASE WHEN _clear_avatar THEN NULL ELSE avatar_path END,
         updated_by = v_caller,
         updated_at = now(),
         avatar_updated_at = CASE WHEN _clear_avatar THEN now() ELSE avatar_updated_at END
   WHERE user_id = _target;

  -- Best-effort remove the moderated avatar object; ignore failures.
  IF _clear_avatar AND v_avatar IS NOT NULL THEN
    BEGIN
      DELETE FROM storage.objects WHERE bucket_id = 'avatars' AND name = v_avatar;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  RETURN jsonb_build_object('target', _target, 'cleared_bio', _clear_bio, 'cleared_avatar', _clear_avatar);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_clear_student_profile(uuid, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_clear_student_profile(uuid, boolean, boolean) TO authenticated;

-- 5) Storage.objects policies for the private "avatars" bucket
DROP POLICY IF EXISTS "avatars owner insert"  ON storage.objects;
DROP POLICY IF EXISTS "avatars owner update"  ON storage.objects;
DROP POLICY IF EXISTS "avatars owner delete"  ON storage.objects;
DROP POLICY IF EXISTS "avatars same-centre read" ON storage.objects;
DROP POLICY IF EXISTS "avatars admin manage"  ON storage.objects;

CREATE POLICY "avatars owner insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND split_part(name, '/', 2) = auth.uid()::text
    AND split_part(name, '/', 1) = (
      SELECT center_id::text FROM public.profiles WHERE user_id = auth.uid() LIMIT 1
    )
  );

CREATE POLICY "avatars owner update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND split_part(name, '/', 2) = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND split_part(name, '/', 2) = auth.uid()::text
  );

CREATE POLICY "avatars owner delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND split_part(name, '/', 2) = auth.uid()::text
  );

CREATE POLICY "avatars same-centre read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'avatars'
    AND split_part(name, '/', 1) = (
      SELECT center_id::text FROM public.profiles WHERE user_id = auth.uid() LIMIT 1
    )
  );

CREATE POLICY "avatars admin manage"
  ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'avatars'
    AND public.is_admin()
    AND (
      public.is_superadmin()
      OR split_part(name, '/', 1) = (
        SELECT center_id::text FROM public.profiles WHERE user_id = auth.uid() LIMIT 1
      )
    )
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND public.is_admin()
    AND (
      public.is_superadmin()
      OR split_part(name, '/', 1) = (
        SELECT center_id::text FROM public.profiles WHERE user_id = auth.uid() LIMIT 1
      )
    )
  );
