
-- Atomic tutor role assignment. Preserves any existing roles (e.g. admin).
CREATE OR REPLACE FUNCTION public.assign_tutor_role(_target_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_center uuid;
  v_target_center uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF _target_user IS NULL THEN
    RAISE EXCEPTION 'target user required' USING ERRCODE = '22023';
  END IF;

  IF NOT (public.is_superadmin() OR public.is_admin()) THEN
    RAISE EXCEPTION 'caller is not an admin' USING ERRCODE = '42501';
  END IF;

  SELECT center_id INTO v_caller_center FROM public.profiles WHERE user_id = v_caller LIMIT 1;
  SELECT center_id INTO v_target_center FROM public.profiles WHERE user_id = _target_user LIMIT 1;

  IF v_target_center IS NULL THEN
    RAISE EXCEPTION 'target has no centre' USING ERRCODE = '22023';
  END IF;

  IF NOT public.is_superadmin() THEN
    IF v_caller_center IS NULL OR v_caller_center IS DISTINCT FROM v_target_center THEN
      RAISE EXCEPTION 'target is in a different centre' USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_target_user, 'tutor'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN jsonb_build_object(
    'user_id', _target_user,
    'role', 'tutor',
    'center_id', v_target_center
  );
END;
$$;

REVOKE ALL ON FUNCTION public.assign_tutor_role(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_tutor_role(uuid) TO authenticated;

-- Atomic tutor role removal (preserves admin, student, etc.).
CREATE OR REPLACE FUNCTION public.revoke_tutor_role(_target_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_center uuid;
  v_target_center uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.is_superadmin() OR public.is_admin()) THEN
    RAISE EXCEPTION 'caller is not an admin' USING ERRCODE = '42501';
  END IF;

  SELECT center_id INTO v_caller_center FROM public.profiles WHERE user_id = v_caller LIMIT 1;
  SELECT center_id INTO v_target_center FROM public.profiles WHERE user_id = _target_user LIMIT 1;

  IF NOT public.is_superadmin() THEN
    IF v_caller_center IS NULL OR v_caller_center IS DISTINCT FROM v_target_center THEN
      RAISE EXCEPTION 'target is in a different centre' USING ERRCODE = '42501';
    END IF;
  END IF;

  DELETE FROM public.user_roles
  WHERE user_id = _target_user AND role = 'tutor'::public.app_role;

  RETURN jsonb_build_object('user_id', _target_user, 'role', 'tutor', 'removed', true);
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_tutor_role(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_tutor_role(uuid) TO authenticated;
