
DROP POLICY IF EXISTS "Anyone can view assignments" ON public.assignments;
CREATE POLICY "Enrolled or admin can view assignments"
ON public.assignments FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR (class_id IS NOT NULL AND public.is_enrolled_in_class(class_id))
);

DROP POLICY IF EXISTS "Anyone can view flashcards" ON public.flashcards;
CREATE POLICY "Public can view demo deck flashcards"
ON public.flashcards FOR SELECT TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.flashcard_decks d
    WHERE d.id = flashcards.deck_id
      AND d.access_level = 'demo'::material_access_level
  )
);
CREATE POLICY "Enrolled or owner can view exclusive deck flashcards"
ON public.flashcards FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.flashcard_decks d
    WHERE d.id = flashcards.deck_id
      AND d.access_level = 'exclusive'::material_access_level
      AND (
        public.is_admin()
        OR d.created_by = auth.uid()
        OR (d.subject_id IS NOT NULL AND public.is_enrolled_in_subject(d.subject_id))
      )
  )
);

DROP POLICY IF EXISTS "Anyone can view quiz questions" ON public.quiz_questions;
CREATE POLICY "Public can view demo quiz questions"
ON public.quiz_questions FOR SELECT TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.quizzes q
    WHERE q.id = quiz_questions.quiz_id
      AND q.access_level = 'demo'::material_access_level
  )
);
CREATE POLICY "Enrolled can view exclusive quiz questions"
ON public.quiz_questions FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.quizzes q
    WHERE q.id = quiz_questions.quiz_id
      AND q.access_level = 'exclusive'::material_access_level
      AND (
        public.is_admin()
        OR (q.class_id IS NOT NULL AND public.is_enrolled_in_class(q.class_id))
      )
  )
);

DROP POLICY IF EXISTS "Tutor assignments readable" ON public.tutor_assignments;
CREATE POLICY "Authenticated can read tutor assignments"
ON public.tutor_assignments FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "Users can view comments for classes" ON public.video_comments;
CREATE POLICY "Enrolled or author can view class comments"
ON public.video_comments FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR user_id = auth.uid()
  OR (class_id IS NOT NULL AND public.is_enrolled_in_class(class_id))
);

DROP POLICY IF EXISTS "Enrolled or owner can view exclusive flashcard decks" ON public.flashcard_decks;
CREATE POLICY "Enrolled or owner can view exclusive flashcard decks"
ON public.flashcard_decks FOR SELECT TO authenticated
USING (
  access_level = 'exclusive'::material_access_level
  AND (
    public.is_admin()
    OR created_by = auth.uid()
    OR (subject_id IS NOT NULL AND public.is_enrolled_in_subject(subject_id))
  )
);

DROP POLICY IF EXISTS "Enrolled or owner can view exclusive notes" ON public.notes;
CREATE POLICY "Enrolled or owner can view exclusive notes"
ON public.notes FOR SELECT TO authenticated
USING (
  access_level = 'exclusive'::material_access_level
  AND (
    public.is_admin()
    OR uploaded_by = auth.uid()
    OR (class_id IS NOT NULL AND public.is_enrolled_in_class(class_id))
  )
);

DROP POLICY IF EXISTS "Enrolled can view exclusive quizzes" ON public.quizzes;
CREATE POLICY "Enrolled can view exclusive quizzes"
ON public.quizzes FOR SELECT TO authenticated
USING (
  access_level = 'exclusive'::material_access_level
  AND (
    public.is_admin()
    OR (class_id IS NOT NULL AND public.is_enrolled_in_class(class_id))
  )
);

DROP POLICY IF EXISTS "Enrolled or owner can view exclusive videos" ON public.video_resources;
CREATE POLICY "Enrolled or owner can view exclusive videos"
ON public.video_resources FOR SELECT TO authenticated
USING (
  access_level = 'exclusive'::material_access_level
  AND (
    public.is_admin()
    OR created_by = auth.uid()
    OR (class_id IS NOT NULL AND public.is_enrolled_in_class(class_id))
  )
);

DROP POLICY IF EXISTS "Anyone can view homework files" ON storage.objects;
CREATE POLICY "Authenticated can view homework files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'homework');

DROP POLICY IF EXISTS "Anyone can view notes files" ON storage.objects;
CREATE POLICY "Authenticated can view notes files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'notes');

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_profile_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_enrolled_in_class(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_enrolled_in_subject(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.tutor_can_teach(uuid, uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_profile_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_enrolled_in_class(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_enrolled_in_subject(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tutor_can_teach(uuid, uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_subscription() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_trigger_func() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_updated_at() FROM PUBLIC, anon, authenticated;
