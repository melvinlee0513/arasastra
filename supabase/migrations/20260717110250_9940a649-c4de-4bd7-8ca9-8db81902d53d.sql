CREATE OR REPLACE FUNCTION public.replace_tenant_member_role(
  target_user_id uuid,
  requested_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_center uuid;
  v_target_center uuid;
  v_new_role public.app_role;
  v_is_target_super boolean;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'target user required' USING ERRCODE = '22023';
  END IF;

  IF requested_role NOT IN ('student', 'tutor') THEN
    RAISE EXCEPTION 'only student or tutor may be assigned via this helper' USING ERRCODE = '22023';
  END IF;

  IF NOT (public.is_superadmin() OR public.is_admin()) THEN
    RAISE EXCEPTION 'caller is not an admin' USING ERRCODE = '42501';
  END IF;

  SELECT center_id INTO v_target_center FROM public.profiles WHERE user_id = target_user_id LIMIT 1;
  IF v_target_center IS NULL THEN
    RAISE EXCEPTION 'target has no centre' USING ERRCODE = '22023';
  END IF;

  IF NOT public.is_superadmin() THEN
    SELECT center_id INTO v_caller_center FROM public.profiles WHERE user_id = v_caller LIMIT 1;
    IF v_caller_center IS NULL OR v_caller_center IS DISTINCT FROM v_target_center THEN
      RAISE EXCEPTION 'target is in a different centre' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Never touch superadmin roles via tenant admin UI.
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = target_user_id AND role = 'superadmin'::public.app_role
  ) INTO v_is_target_super;
  IF v_is_target_super THEN
    RAISE EXCEPTION 'cannot modify superadmin via tenant administration' USING ERRCODE = '42501';
  END IF;

  v_new_role := requested_role::public.app_role;

  -- Atomically remove the other ordinary role and insert the requested one.
  -- Admin roles are preserved (only student/tutor rows are swapped).
  DELETE FROM public.user_roles
  WHERE user_id = target_user_id
    AND role IN ('student'::public.app_role, 'tutor'::public.app_role)
    AND role <> v_new_role;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (target_user_id, v_new_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN jsonb_build_object(
    'user_id', target_user_id,
    'role', requested_role,
    'center_id', v_target_center
  );
END;
$$;

REVOKE ALL ON FUNCTION public.replace_tenant_member_role(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_tenant_member_role(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.replace_tenant_member_role(uuid, text) TO authenticated;