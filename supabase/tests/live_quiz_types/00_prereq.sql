-- Bridges the Phase 3–5 fixture up to what the live-quiz migrations need.
--
-- This suite runs the live-quiz migrations and the Phase 3–5 migrations against
-- ONE database, in production filename order, because that is the only way to
-- prove that 20260904 works on top of the schema production will actually have.
-- `../quiz_phase345/00_fixture.sql` is the richer of the two fixtures, so it is
-- the base; the pieces below exist only in the live-quiz fixture.

-- Supabase ships this publication; 20260830 adds tables to it.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

-- Real RLS on quiz content, so "a student cannot read the answer key" is an
-- assertion about production's policies rather than about a thin fixture.
--   20260713053532  quiz_options read for enrolled or staff
--   20260704020459  Enrolled can view exclusive quiz questions
ALTER TABLE public.quizzes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_options   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quizzes read for enrolled or staff" ON public.quizzes;
CREATE POLICY "quizzes read for enrolled or staff"
  ON public.quizzes FOR SELECT TO authenticated
  USING (public.is_tutor_of_class(class_id) OR public.is_enrolled_in_class(class_id));

DROP POLICY IF EXISTS "quiz_questions read for enrolled or staff" ON public.quiz_questions;
CREATE POLICY "quiz_questions read for enrolled or staff"
  ON public.quiz_questions FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.quizzes q
             WHERE q.id = quiz_questions.quiz_id
               AND (public.is_tutor_of_class(q.class_id)
                    OR public.is_enrolled_in_class(q.class_id)))
  );

DROP POLICY IF EXISTS "quiz_options read for enrolled or staff" ON public.quiz_options;
CREATE POLICY "quiz_options read for enrolled or staff"
  ON public.quiz_options FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.quiz_questions qq
            JOIN public.quizzes q ON q.id = qq.quiz_id
            WHERE qq.id = quiz_options.question_id
              AND (public.is_tutor_of_class(q.class_id)
                   OR public.is_enrolled_in_class(q.class_id)))
  );
