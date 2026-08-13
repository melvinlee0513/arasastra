CREATE POLICY "Tutors and admins can upload own-folder course videos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'course-videos'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (
      public.is_admin()
      OR public.has_role(auth.uid(), 'tutor')
      OR EXISTS (SELECT 1 FROM public.class_tutors ct WHERE ct.tutor_user_id = auth.uid())
    )
  );

CREATE POLICY "Staff owners can update own course videos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'course-videos'
    AND owner = auth.uid()
    AND (
      public.is_admin()
      OR public.has_role(auth.uid(), 'tutor')
      OR EXISTS (SELECT 1 FROM public.class_tutors ct WHERE ct.tutor_user_id = auth.uid())
    )
  );

CREATE POLICY "Staff owners or admins can delete course videos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'course-videos'
    AND (
      public.is_admin()
      OR (
        owner = auth.uid()
        AND (
          public.has_role(auth.uid(), 'tutor')
          OR EXISTS (SELECT 1 FROM public.class_tutors ct WHERE ct.tutor_user_id = auth.uid())
        )
      )
    )
  );