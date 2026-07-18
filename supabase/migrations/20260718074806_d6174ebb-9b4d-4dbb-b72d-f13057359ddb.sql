
-- Class Hub Phase 1

ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS instructions       text,
  ADD COLUMN IF NOT EXISTS available_from     timestamptz,
  ADD COLUMN IF NOT EXISTS due_at             timestamptz,
  ADD COLUMN IF NOT EXISTS time_limit_seconds integer,
  ADD COLUMN IF NOT EXISTS attempt_limit      integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS shuffle_questions  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shuffle_options    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS result_visibility  text NOT NULL DEFAULT 'after_submit',
  ADD COLUMN IF NOT EXISTS updated_at         timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.quizzes DROP CONSTRAINT IF EXISTS quizzes_status_ck;
ALTER TABLE public.quizzes ADD CONSTRAINT quizzes_status_ck
  CHECK (status IN ('draft','published','archived'));

ALTER TABLE public.quizzes DROP CONSTRAINT IF EXISTS quizzes_result_visibility_ck;
ALTER TABLE public.quizzes ADD CONSTRAINT quizzes_result_visibility_ck
  CHECK (result_visibility IN ('never','after_submit','after_due','manual'));

CREATE OR REPLACE FUNCTION public._touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_quizzes_touch ON public.quizzes;
CREATE TRIGGER trg_quizzes_touch BEFORE UPDATE ON public.quizzes
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

ALTER TABLE public.quiz_questions
  ADD COLUMN IF NOT EXISTS explanation text,
  ADD COLUMN IF NOT EXISTS updated_at  timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.quiz_questions DROP CONSTRAINT IF EXISTS quiz_questions_type_ck;
ALTER TABLE public.quiz_questions ADD CONSTRAINT quiz_questions_type_ck
  CHECK (question_type IN ('mcq','multiple_choice','true_false'));

ALTER TABLE public.quiz_questions ALTER COLUMN correct_answer DROP NOT NULL;

DROP TRIGGER IF EXISTS trg_quiz_questions_touch ON public.quiz_questions;
CREATE TRIGGER trg_quiz_questions_touch BEFORE UPDATE ON public.quiz_questions
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

CREATE OR REPLACE FUNCTION public.is_tutor_of_class(_class_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.class_tutors
    WHERE class_id = _class_id AND tutor_user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_class(_class_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_center uuid;
BEGIN
  SELECT center_id INTO v_center FROM public.classes WHERE id = _class_id;
  IF v_center IS NULL THEN RETURN false; END IF;
  RETURN public._admin_can_manage_center(v_center)
      OR public.is_tutor_of_class(_class_id);
END; $$;

ALTER TABLE public.quiz_attempts
  ADD COLUMN IF NOT EXISTS center_id     uuid,
  ADD COLUMN IF NOT EXISTS class_id      uuid,
  ADD COLUMN IF NOT EXISTS started_at    timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS submitted_at  timestamptz,
  ADD COLUMN IF NOT EXISTS total_points  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_points    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS percentage    numeric,
  ADD COLUMN IF NOT EXISTS xp_awarded    boolean NOT NULL DEFAULT false;

ALTER TABLE public.quiz_attempts DROP CONSTRAINT IF EXISTS quiz_attempts_status_ck;
ALTER TABLE public.quiz_attempts ADD CONSTRAINT quiz_attempts_status_ck
  CHECK (status IN ('in_progress','submitted','abandoned'));

DROP TRIGGER IF EXISTS trg_quiz_attempts_touch ON public.quiz_attempts;
CREATE TRIGGER trg_quiz_attempts_touch BEFORE UPDATE ON public.quiz_attempts
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS quiz_attempts_one_active
  ON public.quiz_attempts (quiz_id, user_id)
  WHERE status = 'in_progress';

CREATE INDEX IF NOT EXISTS quiz_attempts_user_quiz
  ON public.quiz_attempts (user_id, quiz_id, status);

GRANT SELECT, INSERT, UPDATE ON public.quiz_attempts TO authenticated;
GRANT ALL ON public.quiz_attempts TO service_role;
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies
           WHERE schemaname='public'
             AND tablename IN ('quizzes','quiz_questions','quiz_options',
                               'quiz_attempts','quiz_results','student_quiz_answers')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_quiz_answers ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quizzes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_questions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_options TO authenticated;
GRANT SELECT, INSERT ON public.quiz_results TO authenticated;
GRANT SELECT, INSERT ON public.student_quiz_answers TO authenticated;
GRANT ALL ON public.quizzes, public.quiz_questions, public.quiz_options,
             public.quiz_results, public.student_quiz_answers TO service_role;

CREATE POLICY "quizzes manage by tutor/admin" ON public.quizzes
  FOR ALL USING (class_id IS NOT NULL AND public.can_manage_class(class_id))
  WITH CHECK (class_id IS NOT NULL AND public.can_manage_class(class_id));

CREATE POLICY "quizzes read by enrolled student" ON public.quizzes
  FOR SELECT USING (
    status = 'published'
    AND class_id IS NOT NULL
    AND public.is_enrolled_in_class(class_id)
    AND (available_from IS NULL OR available_from <= now())
  );

CREATE POLICY "quiz_questions manage by tutor/admin" ON public.quiz_questions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.quizzes q WHERE q.id = quiz_id AND public.can_manage_class(q.class_id))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.quizzes q WHERE q.id = quiz_id AND public.can_manage_class(q.class_id))
  );

CREATE POLICY "quiz_options manage by tutor/admin" ON public.quiz_options
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.quiz_questions qq
      JOIN public.quizzes q ON q.id = qq.quiz_id
      WHERE qq.id = question_id AND public.can_manage_class(q.class_id)
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.quiz_questions qq
      JOIN public.quizzes q ON q.id = qq.quiz_id
      WHERE qq.id = question_id AND public.can_manage_class(q.class_id)
    )
  );

CREATE POLICY "quiz_attempts read own or manager" ON public.quiz_attempts
  FOR SELECT USING (
    user_id = auth.uid()
    OR (class_id IS NOT NULL AND public.can_manage_class(class_id))
  );

CREATE POLICY "quiz_results read own or manager" ON public.quiz_results
  FOR SELECT USING (
    user_id = auth.uid()
    OR (class_id IS NOT NULL AND public.can_manage_class(class_id))
  );

CREATE POLICY "student_quiz_answers read own or manager" ON public.student_quiz_answers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.quiz_results r
      WHERE r.id = result_id
        AND (r.user_id = auth.uid()
             OR (r.class_id IS NOT NULL AND public.can_manage_class(r.class_id)))
    )
  );

CREATE OR REPLACE FUNCTION public.get_quiz_for_attempt(_attempt_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_att public.quiz_attempts%ROWTYPE;
  v_quiz public.quizzes%ROWTYPE;
  v_qs jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_att FROM public.quiz_attempts WHERE id = _attempt_id;
  IF v_att.id IS NULL OR v_att.user_id <> v_uid THEN
    RAISE EXCEPTION 'attempt not found' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_quiz FROM public.quizzes WHERE id = v_att.quiz_id;

  SELECT COALESCE(jsonb_agg(q ORDER BY (q->>'display_order')::int), '[]'::jsonb) INTO v_qs FROM (
    SELECT jsonb_build_object(
      'id', qq.id,
      'question_type', qq.question_type,
      'prompt', qq.question,
      'points', qq.points,
      'display_order', COALESCE(qq.sort_order, 0),
      'options', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id', o.id, 'text', o.option_text, 'order_index', o.order_index
        ) ORDER BY o.order_index), '[]'::jsonb)
        FROM public.quiz_options o WHERE o.question_id = qq.id
      )
    ) AS q
    FROM public.quiz_questions qq WHERE qq.quiz_id = v_quiz.id
  ) s;

  RETURN jsonb_build_object(
    'quiz', jsonb_build_object(
      'id', v_quiz.id, 'title', v_quiz.title, 'description', v_quiz.description,
      'instructions', v_quiz.instructions, 'time_limit_seconds', v_quiz.time_limit_seconds,
      'due_at', v_quiz.due_at, 'shuffle_questions', v_quiz.shuffle_questions,
      'shuffle_options', v_quiz.shuffle_options
    ),
    'attempt', jsonb_build_object(
      'id', v_att.id, 'status', v_att.status,
      'saved_answers', v_att.saved_answers,
      'started_at', v_att.started_at, 'submitted_at', v_att.submitted_at
    ),
    'questions', v_qs
  );
END; $$;

REVOKE ALL ON FUNCTION public.get_quiz_for_attempt(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_quiz_for_attempt(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.start_quiz_attempt(_quiz_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_q public.quizzes%ROWTYPE;
  v_existing uuid;
  v_used integer;
  v_new_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_q FROM public.quizzes WHERE id = _quiz_id;
  IF v_q.id IS NULL OR v_q.status <> 'published' OR v_q.class_id IS NULL THEN
    RAISE EXCEPTION 'quiz unavailable' USING ERRCODE = '22023';
  END IF;
  IF v_q.available_from IS NOT NULL AND v_q.available_from > now() THEN
    RAISE EXCEPTION 'quiz not yet available' USING ERRCODE = '22023';
  END IF;
  IF NOT public.is_enrolled_in_class(v_q.class_id) THEN
    RAISE EXCEPTION 'not enrolled in class' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_existing FROM public.quiz_attempts
   WHERE quiz_id = _quiz_id AND user_id = v_uid AND status = 'in_progress';
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  SELECT count(*) INTO v_used FROM public.quiz_attempts
   WHERE quiz_id = _quiz_id AND user_id = v_uid AND status = 'submitted';
  IF v_q.attempt_limit IS NOT NULL AND v_used >= v_q.attempt_limit THEN
    RAISE EXCEPTION 'attempt limit reached' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.quiz_attempts (quiz_id, user_id, center_id, class_id, status,
                                    score, saved_answers, streak, power_ups_used, current_question_index)
  VALUES (_quiz_id, v_uid, v_q.center_id, v_q.class_id, 'in_progress',
          0, '{}'::jsonb, 0, '{}'::jsonb, 0)
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END; $$;

REVOKE ALL ON FUNCTION public.start_quiz_attempt(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.start_quiz_attempt(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_quiz_progress(_attempt_id uuid, _answers jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_att public.quiz_attempts%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_att FROM public.quiz_attempts WHERE id = _attempt_id;
  IF v_att.id IS NULL OR v_att.user_id <> v_uid OR v_att.status <> 'in_progress' THEN
    RAISE EXCEPTION 'attempt not editable' USING ERRCODE = '42501';
  END IF;
  UPDATE public.quiz_attempts
     SET saved_answers = COALESCE(_answers,'{}'::jsonb)
   WHERE id = _attempt_id;
END; $$;

REVOKE ALL ON FUNCTION public.save_quiz_progress(uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.save_quiz_progress(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_quiz_attempt(_attempt_id uuid, _answers jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_att public.quiz_attempts%ROWTYPE;
  v_q public.quizzes%ROWTYPE;
  v_answers jsonb;
  v_total_points integer := 0;
  v_max_points integer := 0;
  v_correct_count integer := 0;
  v_q_count integer := 0;
  v_pct numeric;
  v_result_id uuid;
  v_qrec record;
  v_selected text;
  v_is_correct boolean;
  v_awarded integer;
  v_flags jsonb;
  v_quiz_xp_on boolean := true;
  v_gami_on boolean := true;
  v_xp_result jsonb := NULL;
  v_is_mcq boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;

  SELECT * INTO v_att FROM public.quiz_attempts WHERE id = _attempt_id FOR UPDATE;
  IF v_att.id IS NULL OR v_att.user_id <> v_uid THEN
    RAISE EXCEPTION 'attempt not found' USING ERRCODE = '42501';
  END IF;
  IF v_att.status = 'submitted' THEN
    SELECT id INTO v_result_id FROM public.quiz_results
     WHERE quiz_id = v_att.quiz_id AND user_id = v_uid ORDER BY completed_at DESC LIMIT 1;
    RETURN jsonb_build_object('attempt_id', v_att.id, 'already_submitted', true,
                              'result_id', v_result_id,
                              'total_points', v_att.total_points,
                              'max_points', v_att.max_points,
                              'percentage', v_att.percentage);
  END IF;
  IF v_att.status <> 'in_progress' THEN
    RAISE EXCEPTION 'attempt not submittable' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_q FROM public.quizzes WHERE id = v_att.quiz_id;

  v_answers := COALESCE(_answers, v_att.saved_answers, '{}'::jsonb);

  FOR v_qrec IN
    SELECT qq.id, qq.question_type, qq.points, qq.correct_answer
      FROM public.quiz_questions qq WHERE qq.quiz_id = v_q.id
  LOOP
    v_q_count := v_q_count + 1;
    v_max_points := v_max_points + COALESCE(v_qrec.points, 1);
    v_selected := v_answers->>v_qrec.id::text;
    v_is_correct := false;
    v_is_mcq := v_qrec.question_type IN ('mcq','multiple_choice');

    IF v_qrec.question_type = 'true_false' THEN
      v_is_correct := (v_selected IS NOT NULL
                       AND lower(v_selected) = lower(COALESCE(v_qrec.correct_answer, '')));
    ELSIF v_is_mcq THEN
      IF v_selected IS NOT NULL THEN
        BEGIN
          SELECT is_correct INTO v_is_correct FROM public.quiz_options
            WHERE id::text = v_selected AND question_id = v_qrec.id;
          v_is_correct := COALESCE(v_is_correct, false);
        EXCEPTION WHEN others THEN
          v_is_correct := false;
        END;
      END IF;
    END IF;

    v_awarded := CASE WHEN v_is_correct THEN COALESCE(v_qrec.points, 1) ELSE 0 END;
    v_total_points := v_total_points + v_awarded;
    IF v_is_correct THEN v_correct_count := v_correct_count + 1; END IF;
  END LOOP;

  v_pct := CASE WHEN v_max_points > 0
                THEN round((v_total_points::numeric / v_max_points) * 100, 2)
                ELSE 0 END;

  INSERT INTO public.quiz_results (quiz_id, user_id, score, total_questions,
                                   completed_at, center_id, class_id,
                                   percentage, total_points)
  VALUES (v_q.id, v_uid, v_correct_count, v_q_count, now(),
          v_q.center_id, v_q.class_id, v_pct, v_total_points)
  RETURNING id INTO v_result_id;

  INSERT INTO public.student_quiz_answers (center_id, result_id, question_id,
                                           selected_option_id, selected_answer,
                                           is_correct, points_awarded)
  SELECT
    v_q.center_id, v_result_id, qq.id,
    CASE WHEN qq.question_type IN ('mcq','multiple_choice')
         THEN (
           SELECT o.id FROM public.quiz_options o
            WHERE o.id::text = v_answers->>qq.id::text AND o.question_id = qq.id
            LIMIT 1
         )
         ELSE NULL END,
    CASE WHEN qq.question_type = 'true_false' THEN v_answers->>qq.id::text ELSE NULL END,
    CASE
      WHEN qq.question_type = 'true_false' THEN
        (v_answers->>qq.id::text) IS NOT NULL
          AND lower(v_answers->>qq.id::text) = lower(COALESCE(qq.correct_answer, ''))
      WHEN qq.question_type IN ('mcq','multiple_choice') THEN
        COALESCE((SELECT o.is_correct FROM public.quiz_options o
                   WHERE o.id::text = v_answers->>qq.id::text AND o.question_id = qq.id), false)
      ELSE false
    END,
    CASE
      WHEN qq.question_type = 'true_false' AND
           lower(COALESCE(v_answers->>qq.id::text,'')) = lower(COALESCE(qq.correct_answer,''))
        THEN COALESCE(qq.points,1)
      WHEN qq.question_type IN ('mcq','multiple_choice') AND
           COALESCE((SELECT o.is_correct FROM public.quiz_options o
                      WHERE o.id::text = v_answers->>qq.id::text AND o.question_id = qq.id), false)
        THEN COALESCE(qq.points,1)
      ELSE 0
    END
  FROM public.quiz_questions qq WHERE qq.quiz_id = v_q.id;

  UPDATE public.quiz_attempts
     SET status = 'submitted',
         submitted_at = now(),
         total_points = v_total_points,
         max_points = v_max_points,
         percentage = v_pct,
         score = v_correct_count,
         saved_answers = v_answers
   WHERE id = _attempt_id;

  IF NOT v_att.xp_awarded THEN
    SELECT feature_flags INTO v_flags FROM public.tuition_centers WHERE id = v_q.center_id;
    IF v_flags IS NOT NULL THEN
      IF (v_flags ? 'gamification') AND (v_flags->>'gamification')::boolean = false THEN v_gami_on := false; END IF;
      IF (v_flags ? 'quizXP') AND (v_flags->>'quizXP')::boolean = false THEN v_quiz_xp_on := false; END IF;
    END IF;
    IF v_gami_on AND v_quiz_xp_on AND v_total_points > 0 THEN
      v_xp_result := public.record_learning_activity(
        'quiz_completed',
        LEAST(v_total_points * 10, 500),
        v_q.id, 'quiz'
      );
    END IF;
    UPDATE public.quiz_attempts SET xp_awarded = true WHERE id = _attempt_id;
  END IF;

  RETURN jsonb_build_object(
    'attempt_id', _attempt_id,
    'result_id', v_result_id,
    'total_points', v_total_points,
    'max_points', v_max_points,
    'percentage', v_pct,
    'correct_count', v_correct_count,
    'question_count', v_q_count,
    'xp', v_xp_result
  );
END; $$;

REVOKE ALL ON FUNCTION public.submit_quiz_attempt(uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.submit_quiz_attempt(uuid, jsonb) TO authenticated;

-- FLASHCARDS
ALTER TABLE public.flashcard_decks
  ADD COLUMN IF NOT EXISTS class_id       uuid REFERENCES public.classes(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS status         text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS display_order  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS published_at   timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at     timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.flashcard_decks DROP CONSTRAINT IF EXISTS flashcard_decks_status_ck;
ALTER TABLE public.flashcard_decks ADD CONSTRAINT flashcard_decks_status_ck
  CHECK (status IN ('draft','published','archived'));

DROP TRIGGER IF EXISTS trg_flashcard_decks_touch ON public.flashcard_decks;
CREATE TRIGGER trg_flashcard_decks_touch BEFORE UPDATE ON public.flashcard_decks
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

ALTER TABLE public.flashcards
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_flashcards_touch ON public.flashcards;
CREATE TRIGGER trg_flashcards_touch BEFORE UPDATE ON public.flashcards
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

CREATE INDEX IF NOT EXISTS flashcard_decks_class_status
  ON public.flashcard_decks (class_id, status, display_order);

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies
           WHERE schemaname='public'
             AND tablename IN ('flashcard_decks','flashcards','flashcard_progress')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

ALTER TABLE public.flashcard_decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flashcards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flashcard_progress ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.flashcard_decks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.flashcards TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.flashcard_progress TO authenticated;
GRANT ALL ON public.flashcard_decks, public.flashcards, public.flashcard_progress TO service_role;

CREATE POLICY "flashcard_decks manage by tutor/admin" ON public.flashcard_decks
  FOR ALL USING (class_id IS NOT NULL AND public.can_manage_class(class_id))
  WITH CHECK (class_id IS NOT NULL AND public.can_manage_class(class_id));

CREATE POLICY "flashcard_decks read published by enrolled" ON public.flashcard_decks
  FOR SELECT USING (
    status = 'published'
    AND class_id IS NOT NULL
    AND public.is_enrolled_in_class(class_id)
  );

CREATE POLICY "flashcards manage by tutor/admin" ON public.flashcards
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.flashcard_decks d
             WHERE d.id = deck_id AND d.class_id IS NOT NULL
               AND public.can_manage_class(d.class_id))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.flashcard_decks d
             WHERE d.id = deck_id AND d.class_id IS NOT NULL
               AND public.can_manage_class(d.class_id))
  );

CREATE POLICY "flashcards read published by enrolled" ON public.flashcards
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.flashcard_decks d
             WHERE d.id = deck_id
               AND d.status = 'published'
               AND d.class_id IS NOT NULL
               AND public.is_enrolled_in_class(d.class_id))
  );

CREATE POLICY "flashcard_progress own" ON public.flashcard_progress
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
