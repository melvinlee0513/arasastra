CREATE TABLE public.class_bookmarks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  center_id uuid NOT NULL REFERENCES public.tuition_centers(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_user_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (student_user_id, class_id)
);

GRANT SELECT, INSERT, DELETE ON public.class_bookmarks TO authenticated;
GRANT ALL ON public.class_bookmarks TO service_role;

ALTER TABLE public.class_bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students read own bookmarks"
  ON public.class_bookmarks FOR SELECT TO authenticated
  USING (student_user_id = auth.uid() OR public._admin_can_manage_center(center_id));

CREATE POLICY "Students create own bookmarks"
  ON public.class_bookmarks FOR INSERT TO authenticated
  WITH CHECK (
    student_user_id = auth.uid()
    AND center_id = public.get_user_center(auth.uid())
    AND public.is_enrolled_in_class(class_id)
  );

CREATE POLICY "Students delete own bookmarks"
  ON public.class_bookmarks FOR DELETE TO authenticated
  USING (student_user_id = auth.uid());

CREATE INDEX class_bookmarks_student_idx ON public.class_bookmarks (student_user_id);