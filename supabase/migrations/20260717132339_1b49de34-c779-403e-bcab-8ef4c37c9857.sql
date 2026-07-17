
-- 1) Class cover fields on classes
ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS cover_image_path text,
  ADD COLUMN IF NOT EXISTS cover_image_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS cover_image_updated_by uuid REFERENCES auth.users(id);

-- 2) Helper: parse path segments safely
--    Path convention: {center_id}/{class_id}/<filename>
--    Returns null if the path is malformed or the ids are not valid UUIDs.
CREATE OR REPLACE FUNCTION public._cover_path_center(_name text)
RETURNS uuid LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE parts text[]; v uuid;
BEGIN
  parts := string_to_array(_name, '/');
  IF parts IS NULL OR array_length(parts,1) < 3 THEN RETURN NULL; END IF;
  BEGIN v := parts[1]::uuid; EXCEPTION WHEN others THEN RETURN NULL; END;
  RETURN v;
END; $$;

CREATE OR REPLACE FUNCTION public._cover_path_class(_name text)
RETURNS uuid LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE parts text[]; v uuid;
BEGIN
  parts := string_to_array(_name, '/');
  IF parts IS NULL OR array_length(parts,1) < 3 THEN RETURN NULL; END IF;
  BEGIN v := parts[2]::uuid; EXCEPTION WHEN others THEN RETURN NULL; END;
  RETURN v;
END; $$;

REVOKE ALL ON FUNCTION public._cover_path_center(text) FROM public;
REVOKE ALL ON FUNCTION public._cover_path_class(text) FROM public;
GRANT EXECUTE ON FUNCTION public._cover_path_center(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._cover_path_class(text) TO authenticated, service_role;

-- 3) Storage RLS on the class-covers bucket
--    (bucket row itself is created via storage_create_bucket tool)
DROP POLICY IF EXISTS "class-covers: enrolled student read"    ON storage.objects;
DROP POLICY IF EXISTS "class-covers: tutor manage assigned"    ON storage.objects;
DROP POLICY IF EXISTS "class-covers: admin manage same centre" ON storage.objects;

CREATE POLICY "class-covers: enrolled student read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'class-covers'
  AND public._cover_path_class(name) IS NOT NULL
  AND (
    public.is_enrolled_in_class(public._cover_path_class(name))
    OR public.is_tutor_of_class(public._cover_path_class(name))
    OR public._admin_can_manage_center(public._cover_path_center(name))
  )
);

CREATE POLICY "class-covers: tutor manage assigned"
ON storage.objects FOR ALL TO authenticated
USING (
  bucket_id = 'class-covers'
  AND public._cover_path_class(name) IS NOT NULL
  AND public.is_tutor_of_class(public._cover_path_class(name))
)
WITH CHECK (
  bucket_id = 'class-covers'
  AND public._cover_path_class(name) IS NOT NULL
  AND public.is_tutor_of_class(public._cover_path_class(name))
);

CREATE POLICY "class-covers: admin manage same centre"
ON storage.objects FOR ALL TO authenticated
USING (
  bucket_id = 'class-covers'
  AND public._cover_path_center(name) IS NOT NULL
  AND public._admin_can_manage_center(public._cover_path_center(name))
)
WITH CHECK (
  bucket_id = 'class-covers'
  AND public._cover_path_center(name) IS NOT NULL
  AND public._admin_can_manage_center(public._cover_path_center(name))
);
