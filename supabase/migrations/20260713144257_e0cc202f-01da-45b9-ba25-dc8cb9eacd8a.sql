CREATE OR REPLACE FUNCTION public.list_assignable_tutors(requested_center_id uuid)
RETURNS TABLE(user_id uuid, full_name text, email text, avatar_url text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_center uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF requested_center_id IS NULL THEN
    RAISE EXCEPTION 'center required' USING ERRCODE = '22023';
  END IF;

  IF public.is_superadmin() THEN
    -- allowed for any centre
    NULL;
  ELSE
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501';
    END IF;
    SELECT p.center_id INTO v_caller_center
    FROM public.profiles p WHERE p.user_id = v_caller LIMIT 1;
    IF v_caller_center IS NULL OR v_caller_center <> requested_center_id THEN
      RAISE EXCEPTION 'foreign centre' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  SELECT DISTINCT
    p.user_id,
    COALESCE(p.full_name, split_part(p.email, '@', 1), 'Tutor')::text AS full_name,
    p.email::text,
    p.avatar_url::text
  FROM public.user_roles ur
  JOIN public.profiles p ON p.user_id = ur.user_id
  WHERE ur.role = 'tutor'::public.app_role
    AND p.center_id = requested_center_id
  ORDER BY full_name;
END;
$$;

REVOKE ALL ON FUNCTION public.list_assignable_tutors(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_assignable_tutors(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_assignable_tutors(uuid) TO authenticated;