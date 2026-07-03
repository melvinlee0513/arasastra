
REVOKE EXECUTE ON FUNCTION public.is_enrolled_in_class(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_enrolled_in_subject(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_enrolled_in_class(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_enrolled_in_subject(uuid) TO authenticated, service_role;
