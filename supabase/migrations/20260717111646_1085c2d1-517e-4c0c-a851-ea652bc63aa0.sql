
-- 1. Schema changes
ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS token uuid,
  ADD COLUMN IF NOT EXISTS invited_by uuid;

UPDATE public.invitations SET token = id WHERE token IS NULL;

ALTER TABLE public.invitations
  ALTER COLUMN token SET NOT NULL,
  ALTER COLUMN token SET DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS invitations_token_key ON public.invitations(token);
CREATE INDEX IF NOT EXISTS invitations_center_created_idx ON public.invitations(center_id, created_at DESC);

-- 2. Update redemption helpers to look up by token (backward compatible: existing rows have token = id)
CREATE OR REPLACE FUNCTION public.get_invitation_by_token(_token uuid)
 RETURNS TABLE(id uuid, email text, role text, center_id uuid, status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT i.id, i.email, i.role::text, i.center_id, i.status
  FROM public.invitations i
  WHERE i.token = _token
    AND i.status = 'pending'
    AND i.used_at IS NULL
    AND i.revoked_at IS NULL
    AND i.expires_at > now()
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.get_invite_redirect(_token uuid)
 RETURNS TABLE(subdomain_slug text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT c.subdomain_slug
  FROM public.invitations i
  JOIN public.tuition_centers c
    ON c.id = i.center_id AND c.domain_status = 'active'
  WHERE i.token = _token
    AND i.status = 'pending'
    AND i.used_at IS NULL
    AND i.revoked_at IS NULL
    AND i.expires_at > now()
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user_bulletproof()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_meta         jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  v_full_name    text;
  v_role_text    text;
  v_role         public.app_role;
  v_center_id    uuid;
  v_invite_token uuid;
  v_invite       RECORD;
BEGIN
  v_full_name := NULLIF(TRIM(COALESCE(v_meta->>'full_name', '')), '');
  v_role_text := NULLIF(TRIM(COALESCE(v_meta->>'role', '')), '');

  BEGIN v_center_id := NULLIF(v_meta->>'center_id','')::uuid;
  EXCEPTION WHEN others THEN v_center_id := NULL; END;
  BEGIN v_invite_token := NULLIF(v_meta->>'invite_token','')::uuid;
  EXCEPTION WHEN others THEN v_invite_token := NULL; END;

  IF v_invite_token IS NOT NULL THEN
    SELECT * INTO v_invite
    FROM public.invitations
    WHERE token = v_invite_token
      AND status = 'pending'
      AND used_at IS NULL
      AND revoked_at IS NULL
      AND expires_at > now()
    LIMIT 1;

    IF FOUND THEN
      v_role_text := COALESCE(v_role_text, v_invite.role);
      v_center_id := COALESCE(v_center_id, v_invite.center_id);
    ELSE
      v_invite_token := NULL;
    END IF;
  END IF;

  BEGIN v_role := COALESCE(v_role_text,'student')::public.app_role;
  EXCEPTION WHEN others THEN v_role := 'student'::public.app_role; END;

  v_full_name := COALESCE(v_full_name, split_part(NEW.email,'@',1), 'Member');

  IF v_center_id IS NOT NULL THEN
    INSERT INTO public.profiles (id, user_id, email, full_name, center_id, is_registered)
    VALUES (NEW.id, NEW.id, NEW.email, v_full_name, v_center_id, true)
    ON CONFLICT (id) DO NOTHING;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, v_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.subscriptions (user_id, plan_name, status)
  VALUES (NEW.id, 'Free Tier', 'inactive')
  ON CONFLICT DO NOTHING;

  IF v_invite_token IS NOT NULL THEN
    UPDATE public.invitations
    SET status = 'accepted',
        used_at = now()
    WHERE id = v_invite.id
      AND used_at IS NULL
      AND revoked_at IS NULL
      AND status = 'pending';
  END IF;

  RETURN NEW;
EXCEPTION WHEN others THEN
  RAISE WARNING 'handle_new_user_bulletproof failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$function$;

-- 3. Authorisation helper (same-centre admin OR superadmin)
CREATE OR REPLACE FUNCTION public._admin_can_manage_center(_center_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_center uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF public.is_superadmin() THEN RETURN true; END IF;
  IF NOT public.is_admin() THEN RETURN false; END IF;
  SELECT center_id INTO v_caller_center FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
  RETURN v_caller_center IS NOT NULL AND v_caller_center = _center_id;
END;
$function$;

REVOKE ALL ON FUNCTION public._admin_can_manage_center(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._admin_can_manage_center(uuid) TO authenticated;

-- 4. List invitations for a centre (no raw token exposed here)
CREATE OR REPLACE FUNCTION public.list_center_invitations(_center_id uuid)
 RETURNS TABLE(
   id uuid,
   email text,
   role text,
   status text,
   created_at timestamptz,
   expires_at timestamptz,
   used_at timestamptz,
   revoked_at timestamptz,
   invited_by uuid,
   invited_by_name text,
   auth_account_created boolean,
   email_verified boolean,
   profile_created boolean,
   role_assigned boolean,
   accepted_at timestamptz
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public._admin_can_manage_center(_center_id) THEN
    RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    i.id,
    i.email,
    i.role::text,
    i.status,
    i.created_at,
    i.expires_at,
    i.used_at,
    i.revoked_at,
    i.invited_by,
    p_inv.full_name AS invited_by_name,
    (u.id IS NOT NULL) AS auth_account_created,
    (u.email_confirmed_at IS NOT NULL) AS email_verified,
    (p_target.id IS NOT NULL) AS profile_created,
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = u.id
        AND ur.role::text = i.role
    ) AS role_assigned,
    i.used_at AS accepted_at
  FROM public.invitations i
  LEFT JOIN auth.users u ON lower(u.email) = lower(i.email)
  LEFT JOIN public.profiles p_target ON p_target.user_id = u.id
  LEFT JOIN public.profiles p_inv ON p_inv.user_id = i.invited_by
  WHERE i.center_id = _center_id
  ORDER BY i.created_at DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.list_center_invitations(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_center_invitations(uuid) TO authenticated;

-- 5. Reveal invitation token (only for still-usable invitations)
CREATE OR REPLACE FUNCTION public.reveal_invitation_token(_invitation_id uuid)
 RETURNS TABLE(token uuid, expires_at timestamptz)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_center uuid;
BEGIN
  SELECT center_id INTO v_center FROM public.invitations WHERE id = _invitation_id LIMIT 1;
  IF v_center IS NULL THEN
    RAISE EXCEPTION 'invitation not found' USING ERRCODE = '22023';
  END IF;
  IF NOT public._admin_can_manage_center(v_center) THEN
    RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT i.token, i.expires_at
  FROM public.invitations i
  WHERE i.id = _invitation_id
    AND i.status = 'pending'
    AND i.used_at IS NULL
    AND i.revoked_at IS NULL
    AND i.expires_at > now();
END;
$function$;

REVOKE ALL ON FUNCTION public.reveal_invitation_token(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reveal_invitation_token(uuid) TO authenticated;

-- 6. Regenerate (rotate) invitation token; also resets expires_at
CREATE OR REPLACE FUNCTION public.regenerate_invitation_token(_invitation_id uuid, _ttl_hours integer DEFAULT 72)
 RETURNS TABLE(token uuid, expires_at timestamptz)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.invitations%ROWTYPE;
  v_new_token uuid := gen_random_uuid();
  v_new_expiry timestamptz := now() + make_interval(hours => GREATEST(1, LEAST(_ttl_hours, 24*14)));
BEGIN
  SELECT * INTO v_row FROM public.invitations WHERE id = _invitation_id LIMIT 1;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'invitation not found' USING ERRCODE = '22023';
  END IF;
  IF NOT public._admin_can_manage_center(v_row.center_id) THEN
    RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501';
  END IF;
  IF v_row.used_at IS NOT NULL OR v_row.status = 'accepted' THEN
    RAISE EXCEPTION 'invitation already redeemed' USING ERRCODE = '22023';
  END IF;

  UPDATE public.invitations
  SET token = v_new_token,
      expires_at = v_new_expiry,
      revoked_at = NULL,
      status = 'pending'
  WHERE id = _invitation_id;

  RETURN QUERY SELECT v_new_token, v_new_expiry;
END;
$function$;

REVOKE ALL ON FUNCTION public.regenerate_invitation_token(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.regenerate_invitation_token(uuid, integer) TO authenticated;
