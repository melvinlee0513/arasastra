
-- ============ QUIZZES: metadata ============
ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS subject_id uuid,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS total_points integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_by uuid;

-- ============ QUIZ_QUESTIONS: metadata ============
ALTER TABLE public.quiz_questions
  ADD COLUMN IF NOT EXISTS question_type text NOT NULL DEFAULT 'multiple_choice',
  ADD COLUMN IF NOT EXISTS points integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS order_index integer,
  ADD COLUMN IF NOT EXISTS center_id uuid;

UPDATE public.quiz_questions SET order_index = sort_order WHERE order_index IS NULL;

-- Backfill center_id on quiz_questions from parent quiz
UPDATE public.quiz_questions qq
SET center_id = q.center_id
FROM public.quizzes q
WHERE qq.quiz_id = q.id AND qq.center_id IS NULL;

-- ============ QUIZ_OPTIONS ============
CREATE TABLE IF NOT EXISTS public.quiz_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL,
  question_id uuid NOT NULL REFERENCES public.quiz_questions(id) ON DELETE CASCADE,
  option_text text NOT NULL,
  is_correct boolean NOT NULL DEFAULT false,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_quiz_options_question ON public.quiz_options(question_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_options TO authenticated;
GRANT ALL ON public.quiz_options TO service_role;
ALTER TABLE public.quiz_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quiz_options read same center"
ON public.quiz_options FOR SELECT TO authenticated
USING (public.same_center_as_current_user(center_id));

CREATE POLICY "quiz_options admin manage"
ON public.quiz_options FOR ALL TO authenticated
USING (public.is_admin() AND public.same_center_as_current_user(center_id))
WITH CHECK (public.is_admin() AND public.same_center_as_current_user(center_id));

CREATE POLICY "quiz_options tutor manage own class"
ON public.quiz_options FOR ALL TO authenticated
USING (
  public.same_center_as_current_user(center_id)
  AND EXISTS (
    SELECT 1 FROM public.quiz_questions qq
    JOIN public.quizzes q ON q.id = qq.quiz_id
    WHERE qq.id = quiz_options.question_id
      AND q.class_id IS NOT NULL
      AND public.is_tutor_of_class(q.class_id)
  )
)
WITH CHECK (
  public.same_center_as_current_user(center_id)
  AND EXISTS (
    SELECT 1 FROM public.quiz_questions qq
    JOIN public.quizzes q ON q.id = qq.quiz_id
    WHERE qq.id = quiz_options.question_id
      AND q.class_id IS NOT NULL
      AND public.is_tutor_of_class(q.class_id)
  )
);

-- ============ CLASS_RESOURCES ============
CREATE TABLE IF NOT EXISTS public.class_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id uuid,
  uploaded_by uuid,
  title text NOT NULL,
  description text,
  resource_type text NOT NULL DEFAULT 'note',
  source_type text NOT NULL DEFAULT 'external_link',
  file_url text,
  file_path text,
  external_url text,
  embed_url text,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_class_resources_class ON public.class_resources(class_id);
CREATE INDEX IF NOT EXISTS idx_class_resources_center ON public.class_resources(center_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_resources TO authenticated;
GRANT ALL ON public.class_resources TO service_role;
ALTER TABLE public.class_resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "class_resources admin manage"
ON public.class_resources FOR ALL TO authenticated
USING (public.is_admin() AND public.same_center_as_current_user(center_id))
WITH CHECK (public.is_admin() AND public.same_center_as_current_user(center_id));

CREATE POLICY "class_resources assigned tutor manage"
ON public.class_resources FOR ALL TO authenticated
USING (public.same_center_as_current_user(center_id) AND public.is_tutor_of_class(class_id))
WITH CHECK (public.same_center_as_current_user(center_id) AND public.is_tutor_of_class(class_id));

CREATE POLICY "class_resources enrolled student read"
ON public.class_resources FOR SELECT TO authenticated
USING (
  status = 'published'
  AND public.same_center_as_current_user(center_id)
  AND EXISTS (
    SELECT 1 FROM public.class_enrollments ce
    WHERE ce.class_id = class_resources.class_id
      AND ce.student_user_id = auth.uid()
      AND ce.status = 'active'
  )
);

CREATE TRIGGER trg_class_resources_updated_at
BEFORE UPDATE ON public.class_resources
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============ QUIZ_RESULTS: extend ============
ALTER TABLE public.quiz_results
  ADD COLUMN IF NOT EXISTS center_id uuid,
  ADD COLUMN IF NOT EXISTS class_id uuid,
  ADD COLUMN IF NOT EXISTS percentage numeric(5,2),
  ADD COLUMN IF NOT EXISTS total_points integer;

UPDATE public.quiz_results qr
SET center_id = q.center_id, class_id = q.class_id
FROM public.quizzes q
WHERE qr.quiz_id = q.id AND qr.center_id IS NULL;

-- ============ STUDENT_QUIZ_ANSWERS ============
CREATE TABLE IF NOT EXISTS public.student_quiz_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL,
  result_id uuid NOT NULL REFERENCES public.quiz_results(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.quiz_questions(id) ON DELETE CASCADE,
  selected_option_id uuid,
  selected_answer text,
  is_correct boolean NOT NULL DEFAULT false,
  points_awarded integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sqa_result ON public.student_quiz_answers(result_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_quiz_answers TO authenticated;
GRANT ALL ON public.student_quiz_answers TO service_role;
ALTER TABLE public.student_quiz_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sqa student own"
ON public.student_quiz_answers FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.quiz_results qr
    WHERE qr.id = student_quiz_answers.result_id
      AND qr.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.quiz_results qr
    WHERE qr.id = student_quiz_answers.result_id
      AND qr.user_id = auth.uid()
  )
);

CREATE POLICY "sqa admin read"
ON public.student_quiz_answers FOR SELECT TO authenticated
USING (public.is_admin() AND public.same_center_as_current_user(center_id));

CREATE POLICY "sqa tutor read own class"
ON public.student_quiz_answers FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.quiz_results qr
    WHERE qr.id = student_quiz_answers.result_id
      AND qr.class_id IS NOT NULL
      AND public.is_tutor_of_class(qr.class_id)
  )
);

-- ============ TUTOR_CONNECTED_ACCOUNTS ============
CREATE TABLE IF NOT EXISTS public.tutor_connected_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL,
  tutor_user_id uuid NOT NULL,
  provider text NOT NULL,
  account_email text,
  connected_at timestamptz NOT NULL DEFAULT now(),
  disconnected_at timestamptz,
  UNIQUE (tutor_user_id, provider)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tutor_connected_accounts TO authenticated;
GRANT ALL ON public.tutor_connected_accounts TO service_role;
ALTER TABLE public.tutor_connected_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tca self manage"
ON public.tutor_connected_accounts FOR ALL TO authenticated
USING (tutor_user_id = auth.uid())
WITH CHECK (tutor_user_id = auth.uid());

CREATE POLICY "tca admin read same center"
ON public.tutor_connected_accounts FOR SELECT TO authenticated
USING (public.is_admin() AND public.same_center_as_current_user(center_id));
