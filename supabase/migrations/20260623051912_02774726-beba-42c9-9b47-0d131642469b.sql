
CREATE POLICY "Authenticated can read course videos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'course-videos');

CREATE POLICY "Authenticated can upload course videos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'course-videos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Owners can update course videos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'course-videos' AND owner = auth.uid());

CREATE POLICY "Owners or admins can delete course videos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'course-videos' AND (owner = auth.uid() OR public.is_admin()));
