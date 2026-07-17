
-- 1. Storage RLS hardening. Add profile-existence gate to all auth.uid()-only
-- personal storage policies so a deleted user's stale JWT is denied.

-- Avatars: owner update / delete were auth.uid()-only. Require live profile.
DROP POLICY IF EXISTS "avatars owner update" ON storage.objects;
CREATE POLICY "avatars owner update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'avatars'
  AND split_part(name, '/', 2) = auth.uid()::text
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid())
)
WITH CHECK (
  bucket_id = 'avatars'
  AND split_part(name, '/', 2) = auth.uid()::text
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid())
);

DROP POLICY IF EXISTS "avatars owner delete" ON storage.objects;
CREATE POLICY "avatars owner delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'avatars'
  AND split_part(name, '/', 2) = auth.uid()::text
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid())
);

-- Homework: SELECT was auth.uid()-only. Require live profile.
DROP POLICY IF EXISTS "Owner or admin can view homework files" ON storage.objects;
CREATE POLICY "Owner or admin can view homework files" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'homework'
  AND (
    public.is_admin()
    OR (
      auth.uid()::text = (storage.foldername(name))[1]
      AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid())
    )
  )
);

-- Submissions: SELECT + INSERT.
DROP POLICY IF EXISTS "Users can view own submissions" ON storage.objects;
CREATE POLICY "Users can view own submissions" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'submissions'
  AND (
    public.is_admin()
    OR (
      auth.uid()::text = (storage.foldername(name))[1]
      AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid())
    )
  )
);

DROP POLICY IF EXISTS "Users can upload own submissions" ON storage.objects;
CREATE POLICY "Users can upload own submissions" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'submissions'
  AND auth.uid()::text = (storage.foldername(name))[1]
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid())
);

-- Payment receipts: SELECT (both duplicate policies) + INSERT.
DROP POLICY IF EXISTS "Users can view own payment receipts" ON storage.objects;
CREATE POLICY "Users can view own payment receipts" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'payment-receipts'
  AND (
    public.is_admin()
    OR (
      auth.uid()::text = (storage.foldername(name))[1]
      AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid())
    )
  )
);

DROP POLICY IF EXISTS "Users can view their own receipts" ON storage.objects;
CREATE POLICY "Users can view their own receipts" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'payment-receipts'
  AND (
    public.is_admin()
    OR (
      auth.uid()::text = (storage.foldername(name))[1]
      AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid())
    )
  )
);

DROP POLICY IF EXISTS "Users can upload their own receipts" ON storage.objects;
CREATE POLICY "Users can upload their own receipts" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'payment-receipts'
  AND auth.uid()::text = (storage.foldername(name))[1]
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid())
);

-- Course-videos owner INSERT / UPDATE / DELETE: legacy owner-folder policy.
-- Class resource uploads use {center_id}/{class_id}/{resource_id}/... paths,
-- so this is a rarely-used legacy path. Still, gate on live profile to close
-- the stale-JWT surface.
DROP POLICY IF EXISTS "Authenticated can upload course videos" ON storage.objects;
CREATE POLICY "Authenticated can upload course videos" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'course-videos'
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid())
);

DROP POLICY IF EXISTS "Owners can update course videos" ON storage.objects;
CREATE POLICY "Owners can update course videos" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'course-videos'
  AND owner = auth.uid()
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid())
);

DROP POLICY IF EXISTS "Owners or admins can delete course videos" ON storage.objects;
CREATE POLICY "Owners or admins can delete course videos" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'course-videos'
  AND (
    public.is_admin()
    OR (owner = auth.uid() AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid()))
  )
);

-- 2. Expand user_deletion_jobs status set to allow pending_storage_cleanup.
ALTER TABLE public.user_deletion_jobs
  DROP CONSTRAINT IF EXISTS user_deletion_jobs_status_check;
ALTER TABLE public.user_deletion_jobs
  ADD CONSTRAINT user_deletion_jobs_status_check
  CHECK (status = ANY (ARRAY['pending','processing','pending_storage_cleanup','completed','failed']));

-- 3. Extend admin_delete_user_account to return every personal-storage prefix
-- that must be cleaned. The edge function iterates these prefixes and only
-- marks the job completed once every bucket returns an empty listing.
CREATE OR REPLACE FUNCTION public.admin_delete_user_account(_target uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_center uuid;
  v_target_center uuid;
  v_avatar_path text;
  v_target_email text;
  v_target_is_super boolean;
  v_target_is_admin boolean;
  v_caller_is_super boolean;
  v_caller_is_admin boolean;
  v_super_count integer;
  v_storage_paths jsonb := '[]'::jsonb;
  v_storage_prefixes jsonb := '[]'::jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF _target IS NULL THEN
    RAISE EXCEPTION 'target required' USING ERRCODE = '22023';
  END IF;
  IF _target = v_caller THEN
    RAISE EXCEPTION 'cannot delete your own account' USING ERRCODE = '42501';
  END IF;

  v_caller_is_super := public.is_superadmin();
  v_caller_is_admin := public.is_admin();
  IF NOT (v_caller_is_super OR v_caller_is_admin) THEN
    RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _target AND role = 'superadmin'::public.app_role)
    INTO v_target_is_super;
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _target AND role = 'admin'::public.app_role)
    INTO v_target_is_admin;

  IF v_target_is_super THEN
    RAISE EXCEPTION 'superadmins cannot be deleted via this flow' USING ERRCODE = '42501';
  END IF;

  IF v_target_is_admin AND NOT v_caller_is_super THEN
    RAISE EXCEPTION 'only a superadmin may delete a tenant admin' USING ERRCODE = '42501';
  END IF;

  SELECT p.center_id, p.avatar_path, p.email
    INTO v_target_center, v_avatar_path, v_target_email
    FROM public.profiles p WHERE p.user_id = _target LIMIT 1;

  IF NOT v_caller_is_super THEN
    SELECT center_id INTO v_caller_center FROM public.profiles WHERE user_id = v_caller LIMIT 1;
    IF v_caller_center IS NULL OR v_target_center IS NULL OR v_caller_center <> v_target_center THEN
      RAISE EXCEPTION 'target is in a different centre' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_target_is_super THEN
    SELECT count(*) INTO v_super_count FROM public.user_roles WHERE role = 'superadmin'::public.app_role;
    IF v_super_count <= 1 THEN
      RAISE EXCEPTION 'cannot delete the final superadmin' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_avatar_path IS NOT NULL THEN
    v_storage_paths := v_storage_paths ||
      jsonb_build_array(jsonb_build_object('bucket', 'avatars', 'path', v_avatar_path));
  END IF;

  -- Mandatory personal-storage prefixes the edge function must fully drain.
  -- Every personal bucket uses `{user_id}/...` except avatars which uses
  -- `{center_id}/{user_id}/...`.
  v_storage_prefixes := jsonb_build_array(
    jsonb_build_object('bucket', 'avatars',          'prefix',
      COALESCE(v_target_center::text || '/' || _target::text, _target::text)),
    jsonb_build_object('bucket', 'homework',         'prefix', _target::text),
    jsonb_build_object('bucket', 'submissions',      'prefix', _target::text),
    jsonb_build_object('bucket', 'payment-receipts', 'prefix', _target::text)
  );

  -- 5. Anonymise centre-owned content and remove personal activity.
  UPDATE public.class_announcements SET author_user_id = NULL WHERE author_user_id = _target;
  UPDATE public.class_resources     SET uploaded_by    = NULL WHERE uploaded_by    = _target;
  UPDATE public.classes             SET created_by     = NULL WHERE created_by     = _target;
  UPDATE public.classes             SET cover_image_updated_by = NULL WHERE cover_image_updated_by = _target;
  UPDATE public.quizzes             SET created_by     = NULL WHERE created_by     = _target;
  UPDATE public.flashcard_decks     SET created_by     = NULL WHERE created_by     = _target;
  UPDATE public.class_about         SET updated_by     = NULL WHERE updated_by     = _target;
  UPDATE public.notes               SET uploaded_by    = NULL WHERE uploaded_by    = _target;
  UPDATE public.class_enrollments   SET enrolled_by    = NULL WHERE enrolled_by    = _target;
  UPDATE public.invitations         SET invited_by     = NULL WHERE invited_by     = _target;
  UPDATE public.admin_audit_log     SET admin_id       = NULL WHERE admin_id       = _target;
  UPDATE public.audit_logs          SET changed_by     = NULL WHERE changed_by     = _target;
  UPDATE public.content_versions    SET updated_by     = NULL WHERE updated_by     = _target;
  UPDATE public.video_resources     SET created_by     = NULL WHERE created_by     = _target;

  DELETE FROM public.class_enrollments       WHERE student_user_id = _target;
  DELETE FROM public.class_tutors            WHERE tutor_user_id  = _target;
  DELETE FROM public.tutor_connected_accounts WHERE tutor_user_id  = _target;
  DELETE FROM public.announcement_reads      WHERE student_user_id = _target;
  DELETE FROM public.student_streaks         WHERE student_user_id = _target;
  DELETE FROM public.student_xp_events       WHERE student_user_id = _target;
  DELETE FROM public.flashcard_progress      WHERE user_id         = _target;
  DELETE FROM public.quiz_attempts           WHERE user_id         = _target;
  DELETE FROM public.video_comments          WHERE user_id         = _target;
  DELETE FROM public.parent_student_links
    WHERE student_profile_id IN (SELECT id FROM public.profiles WHERE user_id = _target);
  UPDATE public.tutors SET user_id = NULL, is_active = false WHERE user_id = _target;

  IF v_target_email IS NOT NULL THEN
    DELETE FROM public.invitations
      WHERE lower(email) = lower(v_target_email)
        AND status IN ('pending','revoked');
  END IF;

  DELETE FROM public.user_roles WHERE user_id = _target;

  RETURN jsonb_build_object(
    'target_user_id', _target,
    'target_center_id', v_target_center,
    'storage_paths', v_storage_paths,
    'storage_prefixes', v_storage_prefixes
  );
END;
$function$;
