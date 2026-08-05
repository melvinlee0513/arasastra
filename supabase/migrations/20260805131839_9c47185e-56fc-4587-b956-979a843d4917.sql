REVOKE ALL ON FUNCTION public.class_content_folders_validate() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._validate_content_folder() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.class_content_folders_validate() TO service_role;
GRANT EXECUTE ON FUNCTION public._validate_content_folder() TO service_role;