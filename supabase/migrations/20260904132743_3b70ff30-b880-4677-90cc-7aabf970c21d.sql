-- ═══════════════════════════════════════════════════════════════════════
-- Part A — question media metadata
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE public.quiz_questions
  ADD COLUMN IF NOT EXISTS image_path   text,
  ADD COLUMN IF NOT EXISTS image_width  integer,
  ADD COLUMN IF NOT EXISTS image_height integer,
  ADD COLUMN IF NOT EXISTS image_alt    text,
  ADD COLUMN IF NOT EXISTS image_crop   jsonb;

ALTER TABLE public.question_bank_questions
  ADD COLUMN IF NOT EXISTS image_path   text,
  ADD COLUMN IF NOT EXISTS image_width  integer,
  ADD COLUMN IF NOT EXISTS image_height integer,
  ADD COLUMN IF NOT EXISTS image_alt    text,
  ADD COLUMN IF NOT EXISTS image_crop   jsonb;

CREATE INDEX IF NOT EXISTS idx_quiz_questions_image_path
  ON public.quiz_questions (image_path) WHERE image_path IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bank_questions_image_path
  ON public.question_bank_questions (image_path) WHERE image_path IS NOT NULL;

-- ── Storage guards ─────────────────────────────────────────────────────
-- Object names are `<center_id>/<scope>/<question_key>/<file>`; the centre is
-- always the first segment, so both guards derive tenancy server-side.
CREATE OR REPLACE FUNCTION public._quiz_media_center(_name text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v uuid;
BEGIN
  BEGIN
    v := split_part(COALESCE(_name, ''), '/', 1)::uuid;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.can_write_quiz_media(_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT auth.uid() IS NOT NULL
     AND public._quiz_media_center(_name) IS NOT NULL
     AND public._can_use_question_bank(public._quiz_media_center(_name));
$$;

CREATE OR REPLACE FUNCTION public.can_read_quiz_media(_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT public.can_write_quiz_media(_name)
      OR EXISTS (
           SELECT 1
             FROM public.quiz_questions qq
             JOIN public.quizzes q ON q.id = qq.quiz_id
            WHERE qq.image_path = 'quiz-question-media/' || _name
              AND q.status = 'published'
              AND public.is_enrolled_in_class(q.class_id)
         );
$$;

REVOKE ALL ON FUNCTION public._quiz_media_center(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_write_quiz_media(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_read_quiz_media(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_write_quiz_media(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_read_quiz_media(text) TO authenticated, service_role;

DROP POLICY IF EXISTS "quiz_media_read" ON storage.objects;
DROP POLICY IF EXISTS "quiz_media_insert" ON storage.objects;
DROP POLICY IF EXISTS "quiz_media_update" ON storage.objects;
DROP POLICY IF EXISTS "quiz_media_delete" ON storage.objects;

CREATE POLICY "quiz_media_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'quiz-question-media' AND public.can_read_quiz_media(name));

CREATE POLICY "quiz_media_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'quiz-question-media' AND public.can_write_quiz_media(name));

CREATE POLICY "quiz_media_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'quiz-question-media' AND public.can_write_quiz_media(name))
  WITH CHECK (bucket_id = 'quiz-question-media' AND public.can_write_quiz_media(name));

CREATE POLICY "quiz_media_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'quiz-question-media' AND public.can_write_quiz_media(name));

-- ═══════════════════════════════════════════════════════════════════════
-- Part B — solo quiz XP: best-score delta ledger
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.quiz_xp_awards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL,
  student_user_id uuid NOT NULL,
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  best_points integer NOT NULL DEFAULT 0,
  xp_total integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_user_id, quiz_id)
);

GRANT SELECT ON public.quiz_xp_awards TO authenticated;
GRANT ALL ON public.quiz_xp_awards TO service_role;
ALTER TABLE public.quiz_xp_awards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quiz_xp_awards_self_read" ON public.quiz_xp_awards;
CREATE POLICY "quiz_xp_awards_self_read" ON public.quiz_xp_awards
  FOR SELECT TO authenticated
  USING (student_user_id = auth.uid());

DROP TRIGGER IF EXISTS trg_quiz_xp_awards_touch ON public.quiz_xp_awards;
CREATE TRIGGER trg_quiz_xp_awards_touch
  BEFORE UPDATE ON public.quiz_xp_awards
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- Backfill the ledger from XP already granted so nobody is paid twice for a
-- quiz they have already been rewarded for.
INSERT INTO public.quiz_xp_awards (center_id, student_user_id, quiz_id, best_points, xp_total)
SELECT e.center_id, e.student_user_id, e.source_id,
       GREATEST(COALESCE(SUM(e.xp_amount), 0) / 10, 0),
       COALESCE(SUM(e.xp_amount), 0)
  FROM public.student_xp_events e
  JOIN public.quizzes q ON q.id = e.source_id
 WHERE e.event_type = 'quiz_completed' AND e.source_type = 'quiz' AND e.source_id IS NOT NULL
 GROUP BY e.center_id, e.student_user_id, e.source_id
ON CONFLICT (student_user_id, quiz_id) DO NOTHING;

-- The old index allowed exactly one quiz XP event per student per quiz, which
-- is incompatible with paying an improvement later. Idempotency now lives in
-- quiz_xp_awards, which is row-locked while grading.
DROP INDEX IF EXISTS public.student_xp_events_quiz_once;
CREATE INDEX IF NOT EXISTS idx_xp_events_quiz_source
  ON public.student_xp_events (student_user_id, source_id)
  WHERE event_type = 'quiz_completed' AND source_type = 'quiz';

ALTER TABLE public.quiz_results
  ADD COLUMN IF NOT EXISTS xp_awarded integer NOT NULL DEFAULT 0;

-- ═══════════════════════════════════════════════════════════════════════
-- Grading: XP = earned points × 10, best-score delta only
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._grade_and_finalize_attempt(_attempt_id uuid, _use_saved boolean, _answers jsonb, _reason_hint text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_att public.quiz_attempts%ROWTYPE;
  v_q   public.quizzes%ROWTYPE;
  v_answers jsonb;
  v_deadline timestamptz;
  v_now timestamptz := now();
  v_expired boolean := false;
  v_reason text;
  v_total_points int := 0;
  v_max_points int := 0;
  v_correct_count int := 0;
  v_q_count int := 0;
  v_pct numeric;
  v_result_id uuid;
  v_qrec record;
  v_is_correct boolean;
  v_flags jsonb;
  v_gami_on boolean := true;
  v_quiz_xp_on boolean := true;
  v_xp_amount int := 0;
  v_award public.quiz_xp_awards%ROWTYPE;
  v_prev_best int := 0;
  v_max_xp int := 0;
  v_target int := 0;
  v_activity jsonb;
  v_actual int := 0;
BEGIN
  SELECT * INTO v_att FROM public.quiz_attempts WHERE id=_attempt_id FOR UPDATE;
  IF v_att.id IS NULL THEN
    RAISE EXCEPTION 'attempt not found' USING ERRCODE='42704';
  END IF;

  IF v_att.status = 'submitted' THEN
    SELECT id, xp_awarded INTO v_result_id, v_xp_amount
      FROM public.quiz_results WHERE attempt_id = v_att.id;
    RETURN jsonb_build_object(
      'attempt_id', v_att.id, 'already_submitted', true,
      'result_id', v_result_id,
      'total_points', v_att.total_points, 'max_points', v_att.max_points,
      'percentage', v_att.percentage,
      'xp_awarded_amount', COALESCE(v_xp_amount, 0)
    );
  END IF;

  SELECT * INTO v_q FROM public.quizzes WHERE id = v_att.quiz_id;
  v_deadline := public._quiz_attempt_deadline(v_att, v_q);

  IF v_deadline IS NOT NULL AND v_now > v_deadline THEN
    v_expired := true;
    v_answers := COALESCE(v_att.saved_answers, '{}'::jsonb);
    IF v_q.time_limit_seconds IS NOT NULL
       AND v_att.started_at + make_interval(secs => v_q.time_limit_seconds) <= v_now
       AND (v_q.due_at IS NULL OR v_q.due_at > v_att.started_at + make_interval(secs => v_q.time_limit_seconds)) THEN
      v_reason := 'time_expired';
    ELSE
      v_reason := 'due_expired';
    END IF;
  ELSIF _use_saved THEN
    v_answers := COALESCE(v_att.saved_answers, '{}'::jsonb);
    v_reason  := COALESCE(_reason_hint, 'normal');
  ELSE
    v_answers := COALESCE(_answers, v_att.saved_answers, '{}'::jsonb);
    IF jsonb_typeof(v_answers) <> 'object' THEN v_answers := '{}'::jsonb; END IF;
    v_reason := 'normal';
  END IF;

  FOR v_qrec IN
    SELECT qq.id, qq.points
      FROM public.quiz_questions qq WHERE qq.quiz_id = v_q.id
  LOOP
    v_q_count := v_q_count + 1;
    v_max_points := v_max_points + COALESCE(v_qrec.points, 1);
    v_is_correct := public._quiz_answer_is_correct(
                      v_qrec.id, v_answers -> v_qrec.id::text);

    IF v_is_correct THEN
      v_total_points := v_total_points + COALESCE(v_qrec.points, 1);
      v_correct_count := v_correct_count + 1;
    END IF;
  END LOOP;

  v_pct := CASE WHEN v_max_points > 0
                THEN round((v_total_points::numeric / v_max_points) * 100, 2) ELSE 0 END;

  INSERT INTO public.quiz_results
    (quiz_id, user_id, attempt_id, score, total_questions, completed_at,
     center_id, class_id, percentage, total_points, submission_reason)
  VALUES
    (v_q.id, v_att.user_id, v_att.id, v_correct_count, v_q_count, v_now,
     v_q.center_id, v_q.class_id, v_pct, v_total_points, v_reason)
  ON CONFLICT (attempt_id) DO UPDATE
    SET score = EXCLUDED.score,
        total_questions = EXCLUDED.total_questions,
        completed_at = EXCLUDED.completed_at,
        percentage = EXCLUDED.percentage,
        total_points = EXCLUDED.total_points,
        submission_reason = EXCLUDED.submission_reason
  RETURNING id INTO v_result_id;

  DELETE FROM public.student_quiz_answers WHERE result_id = v_result_id;
  INSERT INTO public.student_quiz_answers
    (center_id, result_id, question_id, selected_option_id, selected_answer,
     is_correct, points_awarded)
  SELECT
    v_q.center_id, v_result_id, qq.id,
    CASE WHEN qq.question_type IN ('mcq','multiple_choice')
         THEN (SELECT o.id FROM public.quiz_options o
                WHERE o.id::text = v_answers->>qq.id::text AND o.question_id = qq.id LIMIT 1)
         ELSE NULL END,
    CASE WHEN qq.question_type IN ('mcq','multiple_choice') THEN NULL
         WHEN jsonb_typeof(v_answers -> qq.id::text) = 'array'
           THEN (v_answers -> qq.id::text)::text
         ELSE v_answers ->> qq.id::text END,
    public._quiz_answer_is_correct(qq.id, v_answers -> qq.id::text),
    CASE WHEN public._quiz_answer_is_correct(qq.id, v_answers -> qq.id::text)
         THEN COALESCE(qq.points, 1) ELSE 0 END
  FROM public.quiz_questions qq WHERE qq.quiz_id = v_q.id;

  UPDATE public.quiz_attempts
     SET status='submitted', submitted_at=v_now,
         total_points=v_total_points, max_points=v_max_points,
         percentage=v_pct, score=v_correct_count, saved_answers=v_answers
   WHERE id = _attempt_id;

  -- ── XP: 10 XP per earned point, paid as the improvement on the best
  -- rewarded score for this quiz. quiz_xp_awards is the idempotency record
  -- and is locked for the rest of this transaction.
  IF auth.uid() = v_att.user_id AND v_max_points > 0 THEN
    SELECT feature_flags INTO v_flags FROM public.tuition_centers WHERE id = v_q.center_id;
    IF v_flags IS NOT NULL THEN
      IF (v_flags ? 'gamification') AND (v_flags->>'gamification')::boolean = false THEN v_gami_on := false; END IF;
      IF (v_flags ? 'quizXP')       AND (v_flags->>'quizXP')::boolean       = false THEN v_quiz_xp_on := false; END IF;
    END IF;

    IF v_gami_on AND v_quiz_xp_on THEN
      INSERT INTO public.quiz_xp_awards (center_id, student_user_id, quiz_id)
      VALUES (v_q.center_id, v_att.user_id, v_q.id)
      ON CONFLICT (student_user_id, quiz_id) DO NOTHING;

      SELECT * INTO v_award FROM public.quiz_xp_awards
       WHERE student_user_id = v_att.user_id AND quiz_id = v_q.id FOR UPDATE;

      v_prev_best := GREATEST(COALESCE(v_award.best_points, 0), 0);
      v_max_xp    := v_max_points * 10;
      v_target    := LEAST(GREATEST(v_total_points, 0), v_max_points) * 10;
      v_xp_amount := GREATEST(0, LEAST(v_target - (v_prev_best * 10),
                                       v_max_xp - GREATEST(COALESCE(v_award.xp_total,0), 0)));

      IF v_xp_amount > 0 THEN
        v_activity := public.record_learning_activity(
          'quiz_completed', v_xp_amount, v_q.id, 'quiz');
        v_actual := GREATEST(COALESCE((v_activity->>'xp_awarded')::int, 0), 0);
        v_xp_amount := v_actual;
        IF v_actual > 0 THEN
          UPDATE public.quiz_xp_awards
             SET best_points = LEAST(v_prev_best + (v_actual / 10), v_max_points),
                 xp_total = xp_total + v_actual
           WHERE id = v_award.id;
        END IF;
      END IF;
    END IF;
  END IF;

  UPDATE public.quiz_results SET xp_awarded = v_xp_amount WHERE id = v_result_id;
  UPDATE public.quiz_attempts SET xp_awarded=true WHERE id=_attempt_id;

  RETURN jsonb_build_object(
    'attempt_id', _attempt_id,
    'result_id', v_result_id,
    'total_points', v_total_points,
    'max_points', v_max_points,
    'percentage', v_pct,
    'correct_count', v_correct_count,
    'question_count', v_q_count,
    'submission_reason', v_reason,
    'expired', v_expired,
    'xp_awarded_amount', v_xp_amount
  );
END $function$;