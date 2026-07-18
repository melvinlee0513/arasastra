
-- ============================================================================
-- QUIZ ENGINE PHASE 1 HARDENING (TURN A)
-- Student column = user_id. result_visibility values = never|after_submit|after_due|manual.
-- Partial unique index quiz_attempts_one_active already exists.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. quiz_results: per-attempt result, submission reason
-- ---------------------------------------------------------------------------
ALTER TABLE public.quiz_results
  ADD COLUMN IF NOT EXISTS attempt_id uuid REFERENCES public.quiz_attempts(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS submission_reason text NOT NULL DEFAULT 'normal';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quiz_results_submission_reason_ck') THEN
    ALTER TABLE public.quiz_results
      ADD CONSTRAINT quiz_results_submission_reason_ck
      CHECK (submission_reason IN ('normal','time_expired','due_expired'));
  END IF;
END $$;

-- Backfill attempt_id from the corresponding submitted attempt (best-effort)
UPDATE public.quiz_results r
   SET attempt_id = a.id
  FROM public.quiz_attempts a
 WHERE r.attempt_id IS NULL
   AND a.quiz_id = r.quiz_id
   AND a.user_id = r.user_id
   AND a.status  = 'submitted';

-- Replace (quiz_id,user_id) uniqueness with per-attempt uniqueness so
-- attempt_limit > 1 works. Only drop if all rows have attempt_id.
DO $$
DECLARE v_null int;
BEGIN
  SELECT count(*) INTO v_null FROM public.quiz_results WHERE attempt_id IS NULL;
  IF v_null = 0 THEN
    ALTER TABLE public.quiz_results ALTER COLUMN attempt_id SET NOT NULL;
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quiz_results_quiz_id_user_id_key') THEN
      ALTER TABLE public.quiz_results DROP CONSTRAINT quiz_results_quiz_id_user_id_key;
    END IF;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS quiz_results_attempt_uidx
  ON public.quiz_results (attempt_id);

-- ---------------------------------------------------------------------------
-- 2. RLS: force students through the safe RPC for results / answers
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "quiz_results read own or manager" ON public.quiz_results;
CREATE POLICY "quiz_results read manager only" ON public.quiz_results
  FOR SELECT TO authenticated
  USING (class_id IS NOT NULL AND public.can_manage_class(class_id));

DROP POLICY IF EXISTS "student_quiz_answers read own or manager" ON public.student_quiz_answers;
CREATE POLICY "student_quiz_answers read manager only" ON public.student_quiz_answers
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.quiz_results r
    WHERE r.id = student_quiz_answers.result_id
      AND r.class_id IS NOT NULL
      AND public.can_manage_class(r.class_id)
  ));

-- ---------------------------------------------------------------------------
-- 3. start_quiz_attempt — add due_at check, race-safe insert
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_quiz_attempt(_quiz_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_q public.quizzes%ROWTYPE;
  v_existing uuid;
  v_used int;
  v_new_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE='42501'; END IF;

  SELECT * INTO v_q FROM public.quizzes WHERE id = _quiz_id;
  IF v_q.id IS NULL OR v_q.status <> 'published' OR v_q.class_id IS NULL THEN
    RAISE EXCEPTION 'quiz unavailable' USING ERRCODE='22023';
  END IF;
  IF v_q.available_from IS NOT NULL AND v_q.available_from > now() THEN
    RAISE EXCEPTION 'quiz not yet available' USING ERRCODE='22023';
  END IF;
  IF v_q.due_at IS NOT NULL AND v_q.due_at <= now() THEN
    RAISE EXCEPTION 'quiz due date passed' USING ERRCODE='22023';
  END IF;
  IF NOT public.is_enrolled_in_class(v_q.class_id) THEN
    RAISE EXCEPTION 'not enrolled in class' USING ERRCODE='42501';
  END IF;

  SELECT id INTO v_existing FROM public.quiz_attempts
   WHERE quiz_id=_quiz_id AND user_id=v_uid AND status='in_progress';
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  SELECT count(*) INTO v_used FROM public.quiz_attempts
   WHERE quiz_id=_quiz_id AND user_id=v_uid AND status='submitted';
  IF v_q.attempt_limit IS NOT NULL AND v_used >= v_q.attempt_limit THEN
    RAISE EXCEPTION 'attempt limit reached' USING ERRCODE='22023';
  END IF;

  BEGIN
    INSERT INTO public.quiz_attempts
      (quiz_id, user_id, center_id, class_id, status, score, saved_answers,
       streak, power_ups_used, current_question_index)
    VALUES (_quiz_id, v_uid, v_q.center_id, v_q.class_id, 'in_progress',
            0, '{}'::jsonb, 0, '[]'::jsonb, 0)
    RETURNING id INTO v_new_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO v_new_id FROM public.quiz_attempts
     WHERE quiz_id=_quiz_id AND user_id=v_uid AND status='in_progress';
    IF v_new_id IS NULL THEN RAISE; END IF;
  END;
  RETURN v_new_id;
END $fn$;

-- ---------------------------------------------------------------------------
-- Helper: authoritative deadline for an attempt
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._quiz_attempt_deadline(_att public.quiz_attempts, _q public.quizzes)
RETURNS timestamptz
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN _q.due_at IS NOT NULL AND _q.time_limit_seconds IS NOT NULL
      THEN LEAST(_q.due_at, _att.started_at + make_interval(secs => _q.time_limit_seconds))
    WHEN _q.due_at IS NOT NULL
      THEN _q.due_at
    WHEN _q.time_limit_seconds IS NOT NULL
      THEN _att.started_at + make_interval(secs => _q.time_limit_seconds)
    ELSE NULL
  END
$$;

-- ---------------------------------------------------------------------------
-- 4. save_quiz_progress — validate + deadline + structured return
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.save_quiz_progress(uuid, jsonb);

CREATE OR REPLACE FUNCTION public.save_quiz_progress(_attempt_id uuid, _answers jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_att public.quiz_attempts%ROWTYPE;
  v_q   public.quizzes%ROWTYPE;
  v_deadline timestamptz;
  v_key text;
  v_val text;
  v_qid uuid;
  v_qtype text;
  v_qcount int;
  v_ocount int;
  v_now timestamptz := now();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE='42501'; END IF;

  SELECT * INTO v_att FROM public.quiz_attempts WHERE id=_attempt_id;
  IF v_att.id IS NULL OR v_att.user_id <> v_uid OR v_att.status <> 'in_progress' THEN
    RAISE EXCEPTION 'attempt not editable' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_q FROM public.quizzes WHERE id = v_att.quiz_id;
  IF v_q.status <> 'published' OR NOT public.is_enrolled_in_class(v_q.class_id) THEN
    RAISE EXCEPTION 'quiz no longer accessible' USING ERRCODE='42501';
  END IF;

  v_deadline := public._quiz_attempt_deadline(v_att, v_q);
  IF v_deadline IS NOT NULL AND v_now > v_deadline THEN
    RAISE EXCEPTION 'attempt deadline passed' USING ERRCODE='22023';
  END IF;

  IF _answers IS NOT NULL AND jsonb_typeof(_answers) <> 'object' THEN
    RAISE EXCEPTION 'answers must be a json object' USING ERRCODE='22023';
  END IF;

  -- Validate every submitted question_id + option belongs to this quiz
  IF _answers IS NOT NULL THEN
    FOR v_key, v_val IN SELECT * FROM jsonb_each_text(_answers) LOOP
      BEGIN v_qid := v_key::uuid;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'invalid question id %', v_key USING ERRCODE='22023';
      END;
      SELECT question_type INTO v_qtype FROM public.quiz_questions
       WHERE id = v_qid AND quiz_id = v_q.id;
      IF v_qtype IS NULL THEN
        RAISE EXCEPTION 'question % not in quiz', v_qid USING ERRCODE='22023';
      END IF;
      IF v_val IS NULL OR v_val = '' THEN CONTINUE; END IF;
      IF v_qtype IN ('mcq','multiple_choice') THEN
        BEGIN PERFORM v_val::uuid;
        EXCEPTION WHEN others THEN
          RAISE EXCEPTION 'invalid option id for question %', v_qid USING ERRCODE='22023';
        END;
        SELECT count(*) INTO v_ocount FROM public.quiz_options
         WHERE id::text = v_val AND question_id = v_qid;
        IF v_ocount = 0 THEN
          RAISE EXCEPTION 'option % not in question %', v_val, v_qid USING ERRCODE='22023';
        END IF;
      ELSIF v_qtype = 'true_false' THEN
        IF lower(v_val) NOT IN ('true','false') THEN
          RAISE EXCEPTION 'true_false answer must be true or false' USING ERRCODE='22023';
        END IF;
      END IF;
    END LOOP;
  END IF;

  UPDATE public.quiz_attempts
     SET saved_answers = COALESCE(_answers, '{}'::jsonb)
   WHERE id = _attempt_id;

  RETURN jsonb_build_object(
    'saved', true,
    'saved_at', v_now,
    'deadline', v_deadline
  );
END $fn$;

-- ---------------------------------------------------------------------------
-- 5. submit_quiz_attempt — deadline-aware, per-attempt result
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_quiz_attempt(_attempt_id uuid, _answers jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_att public.quiz_attempts%ROWTYPE;
  v_q   public.quizzes%ROWTYPE;
  v_answers jsonb;
  v_deadline timestamptz;
  v_now timestamptz := now();
  v_expired boolean := false;
  v_reason text := 'normal';
  v_total_points int := 0;
  v_max_points int := 0;
  v_correct_count int := 0;
  v_q_count int := 0;
  v_pct numeric;
  v_result_id uuid;
  v_qrec record;
  v_selected text;
  v_is_correct boolean;
  v_flags jsonb;
  v_gami_on boolean := true;
  v_quiz_xp_on boolean := true;
  v_xp_result jsonb := NULL;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE='42501'; END IF;

  SELECT * INTO v_att FROM public.quiz_attempts WHERE id=_attempt_id FOR UPDATE;
  IF v_att.id IS NULL OR v_att.user_id <> v_uid THEN
    RAISE EXCEPTION 'attempt not found' USING ERRCODE='42501';
  END IF;

  IF v_att.status = 'submitted' THEN
    SELECT id INTO v_result_id FROM public.quiz_results WHERE attempt_id = v_att.id;
    RETURN jsonb_build_object(
      'attempt_id', v_att.id,
      'already_submitted', true,
      'result_id', v_result_id,
      'total_points', v_att.total_points,
      'max_points', v_att.max_points,
      'percentage', v_att.percentage
    );
  END IF;
  IF v_att.status <> 'in_progress' THEN
    RAISE EXCEPTION 'attempt not submittable' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_q FROM public.quizzes WHERE id = v_att.quiz_id;
  v_deadline := public._quiz_attempt_deadline(v_att, v_q);

  IF v_deadline IS NOT NULL AND v_now > v_deadline THEN
    v_expired := true;
    v_answers := COALESCE(v_att.saved_answers, '{}'::jsonb);
    -- Reason: time-limit vs due-date. Time-limit only kicks in if time_limit_seconds
    -- is the binding constraint.
    IF v_q.time_limit_seconds IS NOT NULL
       AND v_att.started_at + make_interval(secs => v_q.time_limit_seconds) <= v_now
       AND (v_q.due_at IS NULL OR v_q.due_at > v_att.started_at + make_interval(secs => v_q.time_limit_seconds)) THEN
      v_reason := 'time_expired';
    ELSE
      v_reason := 'due_expired';
    END IF;
  ELSE
    v_answers := COALESCE(_answers, v_att.saved_answers, '{}'::jsonb);
    IF jsonb_typeof(v_answers) <> 'object' THEN v_answers := '{}'::jsonb; END IF;
  END IF;

  -- Grade
  FOR v_qrec IN
    SELECT qq.id, qq.question_type, qq.points, qq.correct_answer
      FROM public.quiz_questions qq WHERE qq.quiz_id = v_q.id
  LOOP
    v_q_count := v_q_count + 1;
    v_max_points := v_max_points + COALESCE(v_qrec.points, 1);
    v_selected := v_answers->>v_qrec.id::text;
    v_is_correct := false;

    IF v_qrec.question_type = 'true_false' THEN
      v_is_correct := (v_selected IS NOT NULL
                       AND lower(v_selected) = lower(COALESCE(v_qrec.correct_answer,'')));
    ELSIF v_qrec.question_type IN ('mcq','multiple_choice') THEN
      IF v_selected IS NOT NULL THEN
        BEGIN
          SELECT is_correct INTO v_is_correct FROM public.quiz_options
            WHERE id::text = v_selected AND question_id = v_qrec.id;
          v_is_correct := COALESCE(v_is_correct, false);
        EXCEPTION WHEN others THEN v_is_correct := false;
        END;
      END IF;
    END IF;

    IF v_is_correct THEN
      v_total_points := v_total_points + COALESCE(v_qrec.points, 1);
      v_correct_count := v_correct_count + 1;
    END IF;
  END LOOP;

  v_pct := CASE WHEN v_max_points > 0
                THEN round((v_total_points::numeric / v_max_points) * 100, 2) ELSE 0 END;

  -- Upsert per-attempt result (idempotent under retry / race)
  INSERT INTO public.quiz_results
    (quiz_id, user_id, attempt_id, score, total_questions, completed_at,
     center_id, class_id, percentage, total_points, submission_reason)
  VALUES
    (v_q.id, v_uid, v_att.id, v_correct_count, v_q_count, v_now,
     v_q.center_id, v_q.class_id, v_pct, v_total_points, v_reason)
  ON CONFLICT (attempt_id) DO UPDATE
    SET score = EXCLUDED.score,
        total_questions = EXCLUDED.total_questions,
        completed_at = EXCLUDED.completed_at,
        percentage = EXCLUDED.percentage,
        total_points = EXCLUDED.total_points,
        submission_reason = EXCLUDED.submission_reason
  RETURNING id INTO v_result_id;

  -- Replace per-question answer breakdown for this result
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
    CASE WHEN qq.question_type = 'true_false' THEN v_answers->>qq.id::text ELSE NULL END,
    CASE
      WHEN qq.question_type = 'true_false'
        THEN lower(COALESCE(v_answers->>qq.id::text,''))
             = lower(COALESCE(qq.correct_answer,''))
      WHEN qq.question_type IN ('mcq','multiple_choice')
        THEN COALESCE((SELECT o.is_correct FROM public.quiz_options o
                        WHERE o.id::text = v_answers->>qq.id::text
                          AND o.question_id = qq.id), false)
      ELSE false END,
    CASE
      WHEN qq.question_type = 'true_false'
           AND lower(COALESCE(v_answers->>qq.id::text,'')) = lower(COALESCE(qq.correct_answer,''))
        THEN COALESCE(qq.points,1)
      WHEN qq.question_type IN ('mcq','multiple_choice')
           AND COALESCE((SELECT o.is_correct FROM public.quiz_options o
                          WHERE o.id::text = v_answers->>qq.id::text
                            AND o.question_id = qq.id), false)
        THEN COALESCE(qq.points,1)
      ELSE 0 END
  FROM public.quiz_questions qq WHERE qq.quiz_id = v_q.id;

  UPDATE public.quiz_attempts
     SET status='submitted', submitted_at=v_now,
         total_points=v_total_points, max_points=v_max_points,
         percentage=v_pct, score=v_correct_count, saved_answers=v_answers
   WHERE id = _attempt_id;

  -- XP: once per attempt, gated by feature flags, keyed by attempt_id
  IF NOT v_att.xp_awarded THEN
    SELECT feature_flags INTO v_flags FROM public.tuition_centers WHERE id=v_q.center_id;
    IF v_flags IS NOT NULL THEN
      IF (v_flags ? 'gamification') AND (v_flags->>'gamification')::boolean = false THEN v_gami_on := false; END IF;
      IF (v_flags ? 'quizXP')      AND (v_flags->>'quizXP')::boolean      = false THEN v_quiz_xp_on := false; END IF;
    END IF;
    IF v_gami_on AND v_quiz_xp_on AND v_total_points > 0 THEN
      v_xp_result := public.record_learning_activity(
        'quiz_completed',
        LEAST(v_total_points * 10, 500),
        v_att.id,      -- source_id = ATTEMPT id (dedup key)
        'quiz_attempt'
      );
    END IF;
    UPDATE public.quiz_attempts SET xp_awarded=true WHERE id=_attempt_id;
  END IF;

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
    'xp', v_xp_result
  );
END $fn$;

-- ---------------------------------------------------------------------------
-- 6. get_quiz_for_attempt — deterministic shuffling + authoritative deadline
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_quiz_for_attempt(_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_att public.quiz_attempts%ROWTYPE;
  v_q   public.quizzes%ROWTYPE;
  v_deadline timestamptz;
  v_qs jsonb;
  v_seed text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_att FROM public.quiz_attempts WHERE id=_attempt_id;
  IF v_att.id IS NULL OR v_att.user_id <> v_uid THEN
    RAISE EXCEPTION 'attempt not found' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_q FROM public.quizzes WHERE id = v_att.quiz_id;
  v_deadline := public._quiz_attempt_deadline(v_att, v_q);
  v_seed := v_att.id::text;

  WITH qq AS (
    SELECT q.id, q.question_type, q.question AS prompt, q.points,
           COALESCE(q.sort_order, 0) AS base_order,
           CASE WHEN v_q.shuffle_questions
                THEN md5(v_seed || ':q:' || q.id::text) END AS shuf_key
      FROM public.quiz_questions q
     WHERE q.quiz_id = v_q.id
  ), qq_ord AS (
    SELECT qq.*,
           ROW_NUMBER() OVER (
             ORDER BY CASE WHEN v_q.shuffle_questions THEN qq.shuf_key END NULLS LAST,
                      qq.base_order, qq.id
           ) AS display_order
      FROM qq
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', qq_ord.id,
      'question_type', qq_ord.question_type,
      'prompt', qq_ord.prompt,
      'points', qq_ord.points,
      'display_order', qq_ord.display_order,
      'options', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'id', o.id,
            'text', o.option_text,
            'order_index', ROW_NUMBER() OVER (
              ORDER BY CASE WHEN v_q.shuffle_options
                            THEN md5(v_seed || ':o:' || o.id::text) END NULLS LAST,
                       o.order_index, o.id
            )
          )
        ), '[]'::jsonb)
        FROM public.quiz_options o
        WHERE o.question_id = qq_ord.id
      )
    ) ORDER BY qq_ord.display_order
  ), '[]'::jsonb) INTO v_qs
  FROM qq_ord;

  RETURN jsonb_build_object(
    'quiz', jsonb_build_object(
      'id', v_q.id, 'title', v_q.title, 'description', v_q.description,
      'instructions', v_q.instructions, 'time_limit_seconds', v_q.time_limit_seconds,
      'due_at', v_q.due_at, 'available_from', v_q.available_from,
      'shuffle_questions', v_q.shuffle_questions,
      'shuffle_options', v_q.shuffle_options,
      'attempt_limit', v_q.attempt_limit,
      'result_visibility', v_q.result_visibility
    ),
    'attempt', jsonb_build_object(
      'id', v_att.id, 'status', v_att.status,
      'saved_answers', v_att.saved_answers,
      'started_at', v_att.started_at,
      'submitted_at', v_att.submitted_at,
      'deadline', v_deadline
    ),
    'questions', v_qs
  );
END $fn$;

-- ---------------------------------------------------------------------------
-- 7. get_quiz_result — student-safe, visibility-aware
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_quiz_result(_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_att public.quiz_attempts%ROWTYPE;
  v_q   public.quizzes%ROWTYPE;
  v_res public.quiz_results%ROWTYPE;
  v_vis text;
  v_show_answers boolean := false;
  v_score_only boolean := false;
  v_answers jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_att FROM public.quiz_attempts WHERE id=_attempt_id;
  IF v_att.id IS NULL OR v_att.user_id <> v_uid THEN
    RAISE EXCEPTION 'attempt not found' USING ERRCODE='42501';
  END IF;
  IF v_att.status <> 'submitted' THEN
    RETURN jsonb_build_object('status','not_submitted','attempt_id',v_att.id);
  END IF;

  SELECT * INTO v_q  FROM public.quizzes      WHERE id=v_att.quiz_id;
  SELECT * INTO v_res FROM public.quiz_results WHERE attempt_id=v_att.id;
  IF v_res.id IS NULL THEN
    RETURN jsonb_build_object('status','no_result','attempt_id',v_att.id);
  END IF;

  v_vis := COALESCE(v_q.result_visibility, 'after_submit');

  IF v_vis = 'never' OR v_vis = 'manual' THEN
    RETURN jsonb_build_object(
      'status','hidden','visibility',v_vis,
      'attempt_id',v_att.id,'result_id',v_res.id
    );
  ELSIF v_vis = 'after_due' AND (v_q.due_at IS NULL OR v_q.due_at > now()) THEN
    v_score_only := true;
  ELSE
    v_show_answers := true;  -- after_submit, or after_due past due
  END IF;

  IF v_show_answers THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'question_id',      qq.id,
      'prompt',           qq.question,
      'question_type',    qq.question_type,
      'points',           qq.points,
      'explanation',      qq.explanation,
      'correct_answer',   qq.correct_answer,
      'options',          (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                             'id', o.id, 'text', o.option_text,
                             'is_correct', o.is_correct,
                             'order_index', o.order_index
                           ) ORDER BY o.order_index), '[]'::jsonb)
                           FROM public.quiz_options o WHERE o.question_id = qq.id),
      'selected_option_id', a.selected_option_id,
      'selected_answer',    a.selected_answer,
      'is_correct',         a.is_correct,
      'points_awarded',     a.points_awarded
    ) ORDER BY COALESCE(qq.sort_order,0)), '[]'::jsonb) INTO v_answers
    FROM public.quiz_questions qq
    LEFT JOIN public.student_quiz_answers a
           ON a.question_id = qq.id AND a.result_id = v_res.id
    WHERE qq.quiz_id = v_q.id;
  END IF;

  RETURN jsonb_build_object(
    'status','ok',
    'visibility', v_vis,
    'mode', CASE WHEN v_score_only THEN 'score_only' ELSE 'full' END,
    'attempt_id', v_att.id,
    'result_id', v_res.id,
    'score', v_res.score,
    'total_questions', v_res.total_questions,
    'total_points', v_res.total_points,
    'max_points', v_att.max_points,
    'percentage', v_res.percentage,
    'submission_reason', v_res.submission_reason,
    'completed_at', v_res.completed_at,
    'questions', CASE WHEN v_show_answers THEN v_answers ELSE NULL END
  );
END $fn$;

-- ---------------------------------------------------------------------------
-- 8. Function grants — least privilege
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.start_quiz_attempt(uuid)              FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_quiz_progress(uuid, jsonb)       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_quiz_attempt(uuid, jsonb)      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_quiz_for_attempt(uuid)            FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_quiz_result(uuid)                 FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.start_quiz_attempt(uuid)          TO authenticated;
GRANT  EXECUTE ON FUNCTION public.save_quiz_progress(uuid, jsonb)   TO authenticated;
GRANT  EXECUTE ON FUNCTION public.submit_quiz_attempt(uuid, jsonb)  TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_quiz_for_attempt(uuid)        TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_quiz_result(uuid)             TO authenticated;
