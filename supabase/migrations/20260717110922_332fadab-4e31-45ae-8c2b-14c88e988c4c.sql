ALTER TABLE public.class_resources
  ADD COLUMN IF NOT EXISTS thumbnail_path text;

DROP POLICY IF EXISTS "Enrolled students can read class resource thumbnails" ON storage.objects;
CREATE POLICY "Enrolled students can read class resource thumbnails"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'notes'
  AND EXISTS (
    SELECT 1
    FROM public.class_resources cr
    WHERE cr.thumbnail_path = 'notes/' || storage.objects.name
      AND cr.status = 'published'
      AND public.is_enrolled_in_class(cr.class_id)
  )
);