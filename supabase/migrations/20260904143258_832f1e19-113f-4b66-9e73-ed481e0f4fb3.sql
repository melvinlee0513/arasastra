CREATE OR REPLACE FUNCTION public.admin_authorize_email_verification(_invitation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inv          public.invitations;
  v_user_id      uuid;
  v_confirmed    timestamptz;
  v_auth_email   text;
  v_target_center uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF _invitation_id IS NULL THEN
    RAISE EXCEPTION 'invitation required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_inv FROM public.invitations WHERE id = _invitation_id LIMIT 1;
  IF v_inv.id IS NULL THEN
    RAISE EXCEPTION 'account not found' USING ERRCODE = 'P0002';
  END IF;

  -- Tenant authorisation is resolved from the invitation's own centre, never
  -- from anything the client supplied.
  IF NOT public._admin_can_manage_center(v_inv.center_id) THEN
    RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501';
  END IF;

  -- Only ordinary tenant roles are eligible for this fallback.
  IF v_inv.role NOT IN ('student', 'tutor') THEN
    RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501';
  END IF;

  SELECT u.id, u.email_confirmed_at, u.email
    INTO v_user_id, v_confirmed, v_auth_email
    FROM auth.users u
   WHERE lower(u.email) = lower(v_inv.email)
   LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'account not found' USING ERRCODE = 'P0002';
  END IF;

  -- Strongest available relationship: the account's own profile must sit in the
  -- same centre as the invitation.
  SELECT p.center_id INTO v_target_center
    FROM public.profiles p WHERE p.user_id = v_user_id LIMIT 1;
  IF v_target_center IS NULL OR v_target_center <> v_inv.center_id THEN
    RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_roles ur
     WHERE ur.user_id = v_user_id
       AND ur.role = 'superadmin'::public.app_role
  ) THEN
    RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501';
  END IF;

  IF v_confirmed IS NOT NULL THEN
    RAISE EXCEPTION 'already verified' USING ERRCODE = '23505';
  END IF;

  RETURN jsonb_build_object(
    'user_id',   v_user_id,
    'email',     v_auth_email,
    'center_id', v_inv.center_id,
    'role',      v_inv.role
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_authorize_email_verification(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_authorize_email_verification(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_authorize_email_verification(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_authorize_email_verification(uuid) TO service_role;