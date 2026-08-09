CREATE OR REPLACE FUNCTION public._about_path_class(_name text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN split_part(_name, '/', 2) ~ '^[0-9a-fA-F-]{36}$' THEN split_part(_name, '/', 2)::uuid
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION public._about_path_class(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._about_path_class(text) TO authenticated;

CREATE POLICY "class_about images read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'class-about'
    AND public._about_path_class(name) IS NOT NULL
    AND (
      public.is_enrolled_in_class(public._about_path_class(name))
      OR public.can_manage_class(public._about_path_class(name))
    )
  );

CREATE POLICY "class_about images insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'class-about'
    AND public._about_path_class(name) IS NOT NULL
    AND public.can_manage_class(public._about_path_class(name))
  );

CREATE POLICY "class_about images update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'class-about'
    AND public._about_path_class(name) IS NOT NULL
    AND public.can_manage_class(public._about_path_class(name))
  )
  WITH CHECK (
    bucket_id = 'class-about'
    AND public._about_path_class(name) IS NOT NULL
    AND public.can_manage_class(public._about_path_class(name))
  );

CREATE POLICY "class_about images delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'class-about'
    AND public._about_path_class(name) IS NOT NULL
    AND public.can_manage_class(public._about_path_class(name))
  );