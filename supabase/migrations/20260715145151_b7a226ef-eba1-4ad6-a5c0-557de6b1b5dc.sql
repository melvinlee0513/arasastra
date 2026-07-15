-- =============================================================
-- Storage RLS for class_resources file uploads
-- Bucket layout expected: {center_id}/{class_id}/{resource_id}/{filename}
-- Applies to the `notes` and `course-videos` private buckets.
-- =============================================================

-- ---------- notes bucket ----------
CREATE POLICY "Tutors and admins can upload class notes"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'notes'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND (storage.foldername(name))[2] IS NOT NULL
  AND (storage.foldername(name))[3] IS NOT NULL
  AND public.same_center_as_current_user(((storage.foldername(name))[1])::uuid)
  AND (
    public.is_admin()
    OR public.is_tutor_of_class(((storage.foldername(name))[2])::uuid)
  )
);

CREATE POLICY "Tutors and admins can read class notes"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'notes'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND (storage.foldername(name))[2] IS NOT NULL
  AND public.same_center_as_current_user(((storage.foldername(name))[1])::uuid)
  AND (
    public.is_admin()
    OR public.is_tutor_of_class(((storage.foldername(name))[2])::uuid)
  )
);

CREATE POLICY "Tutors and admins can update class notes"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'notes'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND (storage.foldername(name))[2] IS NOT NULL
  AND public.same_center_as_current_user(((storage.foldername(name))[1])::uuid)
  AND (
    public.is_admin()
    OR public.is_tutor_of_class(((storage.foldername(name))[2])::uuid)
  )
);

CREATE POLICY "Tutors and admins can delete class notes"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'notes'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND (storage.foldername(name))[2] IS NOT NULL
  AND public.same_center_as_current_user(((storage.foldername(name))[1])::uuid)
  AND (
    public.is_admin()
    OR public.is_tutor_of_class(((storage.foldername(name))[2])::uuid)
  )
);

CREATE POLICY "Enrolled students can read published class notes"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'notes'
  AND EXISTS (
    SELECT 1 FROM public.class_resources cr
    WHERE cr.file_path = 'notes/' || objects.name
      AND cr.status = 'published'
      AND public.is_enrolled_in_class(cr.class_id)
  )
);

-- ---------- course-videos bucket ----------
CREATE POLICY "Tutors and admins can upload class videos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'course-videos'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND (storage.foldername(name))[2] IS NOT NULL
  AND (storage.foldername(name))[3] IS NOT NULL
  AND public.same_center_as_current_user(((storage.foldername(name))[1])::uuid)
  AND (
    public.is_admin()
    OR public.is_tutor_of_class(((storage.foldername(name))[2])::uuid)
  )
);

CREATE POLICY "Tutors and admins can read class videos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'course-videos'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND (storage.foldername(name))[2] IS NOT NULL
  AND public.same_center_as_current_user(((storage.foldername(name))[1])::uuid)
  AND (
    public.is_admin()
    OR public.is_tutor_of_class(((storage.foldername(name))[2])::uuid)
  )
);

CREATE POLICY "Tutors and admins can update class videos"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'course-videos'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND (storage.foldername(name))[2] IS NOT NULL
  AND public.same_center_as_current_user(((storage.foldername(name))[1])::uuid)
  AND (
    public.is_admin()
    OR public.is_tutor_of_class(((storage.foldername(name))[2])::uuid)
  )
);

CREATE POLICY "Tutors and admins can delete class videos"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'course-videos'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND (storage.foldername(name))[2] IS NOT NULL
  AND public.same_center_as_current_user(((storage.foldername(name))[1])::uuid)
  AND (
    public.is_admin()
    OR public.is_tutor_of_class(((storage.foldername(name))[2])::uuid)
  )
);

CREATE POLICY "Enrolled students can read published class videos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'course-videos'
  AND EXISTS (
    SELECT 1 FROM public.class_resources cr
    WHERE cr.file_path = 'course-videos/' || objects.name
      AND cr.status = 'published'
      AND public.is_enrolled_in_class(cr.class_id)
  )
);