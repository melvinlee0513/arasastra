-- 1. Fix profile field guard: chr(0) is rejected by Postgres (SQLSTATE 54000),
--    so every bio save raised "null character not permitted". Postgres text can
--    never contain a NUL byte, so the strip was both invalid and unnecessary.
CREATE OR REPLACE FUNCTION public.profiles_profile_fields_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    NEW.bio := btrim(NEW.bio);
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
$function$;

-- 2. Server-only invitation claim / release (used by the redeem-invitation
--    edge function under the service role). Atomic single-winner UPDATE.
CREATE OR REPLACE FUNCTION public.claim_invitation_for_signup(_token uuid)
RETURNS TABLE(id uuid, email text, role text, center_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  UPDATE public.invitations i
  SET status = 'accepted',
      used_at = now()
  WHERE i.id = (
    SELECT s.id FROM public.invitations s
    WHERE s.token = _token
      AND s.status = 'pending'
      AND s.used_at IS NULL
      AND s.revoked_at IS NULL
      AND s.expires_at > now()
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING i.id, i.email, i.role::text, i.center_id;
$function$;

CREATE OR REPLACE FUNCTION public.release_invitation_claim(_invitation_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH upd AS (
    UPDATE public.invitations
    SET status = 'pending', used_at = NULL
    WHERE id = _invitation_id AND status = 'accepted'
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM upd);
$function$;

CREATE OR REPLACE FUNCTION public.auth_user_exists(_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u WHERE lower(u.email) = lower(btrim(_email))
  );
$function$;

REVOKE ALL ON FUNCTION public.claim_invitation_for_signup(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_invitation_claim(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auth_user_exists(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_invitation_for_signup(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_invitation_claim(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.auth_user_exists(text) TO service_role;

-- 3. Bulk invitation creation, tenant-scoped and role-restricted.
CREATE OR REPLACE FUNCTION public.create_center_invitations(
  _center_id uuid,
  _invites jsonb,
  _ttl_hours integer DEFAULT 72
)
RETURNS TABLE(email text, role text, result text, invitation_id uuid, token uuid, expires_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_item      jsonb;
  v_email     text;
  v_role      text;
  v_seen      text[] := ARRAY[]::text[];
  v_ttl       interval := make_interval(hours => GREATEST(1, LEAST(COALESCE(_ttl_hours, 72), 24 * 14)));
  v_new_id    uuid;
  v_new_token uuid;
  v_expires   timestamptz;
BEGIN
  IF NOT public._admin_can_manage_center(_center_id) THEN
    RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501';
  END IF;
  IF _invites IS NULL OR jsonb_typeof(_invites) <> 'array' THEN
    RAISE EXCEPTION 'invalid payload' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(_invites) > 200 THEN
    RAISE EXCEPTION 'too many invitations' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_invites) LOOP
    v_email := lower(btrim(COALESCE(v_item->>'email', '')));
    v_role  := lower(btrim(COALESCE(v_item->>'role', 'student')));
    v_new_id := NULL; v_new_token := NULL; v_expires := NULL;

    IF v_email = '' OR v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' OR length(v_email) > 254 THEN
      RETURN QUERY SELECT v_email, v_role, 'invalid_email'::text, NULL::uuid, NULL::uuid, NULL::timestamptz;
      CONTINUE;
    END IF;
    IF v_role NOT IN ('student', 'tutor') THEN
      RETURN QUERY SELECT v_email, v_role, 'invalid_role'::text, NULL::uuid, NULL::uuid, NULL::timestamptz;
      CONTINUE;
    END IF;
    IF v_email = ANY (v_seen) THEN
      RETURN QUERY SELECT v_email, v_role, 'duplicate_in_batch'::text, NULL::uuid, NULL::uuid, NULL::timestamptz;
      CONTINUE;
    END IF;
    v_seen := array_append(v_seen, v_email);

    IF EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE lower(p.email) = v_email AND p.center_id = _center_id
    ) THEN
      RETURN QUERY SELECT v_email, v_role, 'already_member'::text, NULL::uuid, NULL::uuid, NULL::timestamptz;
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.invitations i
      WHERE lower(i.email) = v_email
        AND i.center_id = _center_id
        AND i.status = 'pending'
        AND i.used_at IS NULL
        AND i.revoked_at IS NULL
        AND i.expires_at > now()
    ) THEN
      RETURN QUERY SELECT v_email, v_role, 'already_invited'::text, NULL::uuid, NULL::uuid, NULL::timestamptz;
      CONTINUE;
    END IF;

    v_new_token := gen_random_uuid();
    v_expires := now() + v_ttl;

    INSERT INTO public.invitations (email, center_id, role, status, token, expires_at, invited_by)
    VALUES (v_email, _center_id, v_role, 'pending', v_new_token, v_expires, auth.uid())
    RETURNING id INTO v_new_id;

    RETURN QUERY SELECT v_email, v_role, 'created'::text, v_new_id, v_new_token, v_expires;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_center_invitations(uuid, jsonb, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_center_invitations(uuid, jsonb, integer) TO authenticated, service_role;

-- 4. Account verification status for a centre's own members (admin-gated).
CREATE OR REPLACE FUNCTION public.list_center_account_status(_center_id uuid)
RETURNS TABLE(user_id uuid, email text, email_verified boolean, last_sign_in_at timestamp with time zone)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public._admin_can_manage_center(_center_id) THEN
    RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.user_id,
         COALESCE(p.email, u.email) AS email,
         (u.email_confirmed_at IS NOT NULL) AS email_verified,
         u.last_sign_in_at
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.user_id
  WHERE p.center_id = _center_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.list_center_account_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_center_account_status(uuid) TO authenticated, service_role;