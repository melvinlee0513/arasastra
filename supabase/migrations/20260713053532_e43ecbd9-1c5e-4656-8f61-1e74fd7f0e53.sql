-- 1) quiz_options: require class enrollment (or tutor assignment / admin) for reads
DROP POLICY IF EXISTS "quiz_options read same center" ON public.quiz_options;

CREATE POLICY "quiz_options read for enrolled or staff"
  ON public.quiz_options
  FOR SELECT
  TO authenticated
  USING (
    public.same_center_as_current_user(center_id) AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1
        FROM public.quiz_questions qq
        JOIN public.quizzes q ON q.id = qq.quiz_id
        WHERE qq.id = quiz_options.question_id
          AND q.class_id IS NOT NULL
          AND (public.is_tutor_of_class(q.class_id) OR public.is_enrolled_in_class(q.class_id))
      )
    )
  );

-- 2) storage.objects: restrict tutor role bypass to same-center / assigned class
DROP POLICY IF EXISTS "Enrolled users or admins can read course videos" ON storage.objects;
CREATE POLICY "Enrolled users or scoped staff can read course videos"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'course-videos'
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.video_resources vr
        WHERE vr.video_url LIKE '%' || objects.name || '%'
          AND vr.class_id IS NOT NULL
          AND (public.is_tutor_of_class(vr.class_id) OR public.is_enrolled_in_class(vr.class_id))
      )
    )
  );

DROP POLICY IF EXISTS "Enrolled users or admins can view notes files" ON storage.objects;
CREATE POLICY "Enrolled users or scoped staff can view notes files"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'notes'
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.notes n
        WHERE n.file_url LIKE '%' || objects.name || '%'
          AND n.class_id IS NOT NULL
          AND (public.is_tutor_of_class(n.class_id) OR public.is_enrolled_in_class(n.class_id))
      )
    )
  );

DROP POLICY IF EXISTS "Owner or staff can view homework files" ON storage.objects;
CREATE POLICY "Owner or admin can view homework files"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'homework'
    AND (
      (auth.uid())::text = (storage.foldername(name))[1]
      OR public.is_admin()
    )
  );
