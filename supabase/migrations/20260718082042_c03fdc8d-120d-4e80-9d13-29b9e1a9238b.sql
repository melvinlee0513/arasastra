
-- 1) Add manual release column
ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS results_released_at timestamptz;

-- 2) Publish-time integrity: after_due requires due_at
CREATE OR REPLACE FUNCTION public.quizzes_visibility_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.status = 'published'
     AND NEW.result_visibility = 'after_due'
     AND NEW.due_at IS NULL THEN
    RAISE EXCEPTION 'result_visibility=after_due requires a due_at' USING ERRCODE='22023';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_quizzes_visibility_guard ON public.quizzes;
CREATE TRIGGER trg_quizzes_visibility_guard
BEFORE INSERT OR UPDATE OF status, result_visibility, due_at ON public.quizzes
FOR EACH ROW EXECUTE FUNCTION public.quizzes_visibility_guard();

-- 3) Per-student per-quiz XP uniqueness (only for new source_type='quiz' rows;
-- legacy source_type='quiz_attempt' rows preserved untouched to avoid XP history rewrite).
CREATE UNIQUE INDEX IF NOT EXISTS student_xp_events_quiz_once
  ON public.student_xp_events (student_user_id, source_id)
  WHERE event_type = 'quiz_completed' AND source_type = 'quiz';

-- 4) Internal grader used by both submit and expired finaliser.
--    Locks attempt, grades from saved_answers when _use_saved is true (expiry path),
--    otherwise from provided answers; writes quiz_results row (unique per attempt);
--    awards quiz XP at most once per (student, quiz).
CREATE OR REPLACE FUNCTION public._grade_and_finalize_attempt(
  _attempt_id uuid,
  _use_saved boolean,
  _answers jsonb,
  _reason_hint text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
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
  v_selected text;
  v_is_correct boolean;
  v_flags jsonb;
  v_gami_on boolean := true;
  v_quiz_xp_on boolean := true;
  v_xp_awarded_already boolean := false;
  v_xp_amount int := 0;
BEGIN
  SELECT * INTO v_att FROM public.quiz_attempts WHERE id=_attempt_id FOR UPDATE;
  IF v_att.id IS NULL THEN
    RAISE EXCEPTION 'attempt not found' USING ERRCODE='42704';
  END IF;

  IF v_att.status = 'submitted' THEN
    SELECT id INTO v_result_id FROM public.quiz_results WHERE attempt_id = v_att.id;
    RETURN jsonb_build_object(
      'attempt_id', v_att.id, 'already_submitted', true,
      'result_id', v_result_id,
      'total_points', v_att.total_points, 'max_points', v_att.max_points,
      'percentage', v_att.percentage
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

  -- XP: once per (student, quiz) using unique index (source_type='quiz')
  SELECT EXISTS (
    SELECT 1 FROM public.student_xp_events
     WHERE student_user_id = v_att.user_id
       AND event_type='quiz_completed'
       AND source_type='quiz'
       AND source_id = v_q.id
  ) INTO v_xp_awarded_already;

  IF NOT v_xp_awarded_already THEN
    SELECT feature_flags INTO v_flags FROM public.tuition_centers WHERE id = v_q.center_id;
    IF v_flags IS NOT NULL THEN
      IF (v_flags ? 'gamification') AND (v_flags->>'gamification')::boolean = false THEN v_gami_on := false; END IF;
      IF (v_flags ? 'quizXP')       AND (v_flags->>'quizXP')::boolean       = false THEN v_quiz_xp_on := false; END IF;
    END IF;
    IF v_gami_on AND v_quiz_xp_on AND v_total_points > 0 THEN
      v_xp_amount := LEAST(v_total_points * 10, 500);
      BEGIN
        PERFORM public.record_learning_activity(
          'quiz_completed', v_xp_amount, v_q.id, 'quiz'
        );
      EXCEPTION WHEN unique_violation THEN
        -- concurrent duplicate; treat as already awarded
        v_xp_amount := 0;
      END;
    END IF;
  END IF;

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
END $$;

REVOKE ALL ON FUNCTION public._grade_and_finalize_attempt(uuid,boolean,jsonb,text) FROM PUBLIC, anon;

-- 5) Shared finaliser: safe no-op if not expired / not in progress.
CREATE OR REPLACE FUNCTION public._finalize_expired_attempt(_attempt_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_att public.quiz_attempts%ROWTYPE;
  v_q   public.quizzes%ROWTYPE;
  v_deadline timestamptz;
BEGIN
  SELECT * INTO v_att FROM public.quiz_attempts WHERE id = _attempt_id;
  IF v_att.id IS NULL OR v_att.status <> 'in_progress' THEN RETURN; END IF;
  SELECT * INTO v_q FROM public.quizzes WHERE id = v_att.quiz_id;
  v_deadline := public._quiz_attempt_deadline(v_att, v_q);
  IF v_deadline IS NULL OR now() <= v_deadline THEN RETURN; END IF;
  PERFORM public._grade_and_finalize_attempt(_attempt_id, true, NULL, NULL);
END $$;
REVOKE ALL ON FUNCTION public._finalize_expired_attempt(uuid) FROM PUBLIC, anon;

-- 6) start_quiz_attempt: finalise expired before deciding; block after due_at.
CREATE OR REPLACE FUNCTION public.start_quiz_attempt(_quiz_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
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
  IF NOT public.is_enrolled_in_class(v_q.class_id) THEN
    RAISE EXCEPTION 'not enrolled in class' USING ERRCODE='42501';
  END IF;

  -- Finalise any expired in-progress attempt so it does not block a new one
  SELECT id INTO v_existing FROM public.quiz_attempts
   WHERE quiz_id=_quiz_id AND user_id=v_uid AND status='in_progress';
  IF v_existing IS NOT NULL THEN
    PERFORM public._finalize_expired_attempt(v_existing);
    SELECT id INTO v_existing FROM public.quiz_attempts
     WHERE quiz_id=_quiz_id AND user_id=v_uid AND status='in_progress';
    IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  END IF;

  IF v_q.due_at IS NOT NULL AND v_q.due_at <= now() THEN
    RAISE EXCEPTION 'quiz due date passed' USING ERRCODE='22023';
  END IF;

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
END $$;

-- 7) get_quiz_for_attempt: call finaliser first so caller sees submitted state
CREATE OR REPLACE FUNCTION public.get_quiz_for_attempt(_attempt_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
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

  -- Finalise if expired
  IF v_att.status = 'in_progress' THEN
    PERFORM public._finalize_expired_attempt(v_att.id);
    SELECT * INTO v_att FROM public.quiz_attempts WHERE id=_attempt_id;
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
    'questions', CASE WHEN v_att.status='in_progress' THEN v_qs ELSE '[]'::jsonb END
  );
END $$;

-- 8) submit_quiz_attempt now delegates to _grade_and_finalize_attempt.
CREATE OR REPLACE FUNCTION public.submit_quiz_attempt(_attempt_id uuid, _answers jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE='42501'; END IF;
  SELECT user_id INTO v_owner FROM public.quiz_attempts WHERE id=_attempt_id;
  IF v_owner IS NULL OR v_owner <> v_uid THEN
    RAISE EXCEPTION 'attempt not found' USING ERRCODE='42501';
  END IF;
  RETURN public._grade_and_finalize_attempt(_attempt_id, false, _answers, NULL);
END $$;

-- 9) Result visibility RPCs
CREATE OR REPLACE FUNCTION public.release_quiz_results(_quiz_id uuid)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_class uuid; v_now timestamptz := now();
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE='42501'; END IF;
  SELECT class_id INTO v_class FROM public.quizzes WHERE id=_quiz_id;
  IF v_class IS NULL OR NOT public.can_manage_class(v_class) THEN
    RAISE EXCEPTION 'not authorised' USING ERRCODE='42501';
  END IF;
  UPDATE public.quizzes SET results_released_at = v_now, updated_at = v_now WHERE id = _quiz_id;
  RETURN v_now;
END $$;

CREATE OR REPLACE FUNCTION public.hide_quiz_results(_quiz_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_class uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE='42501'; END IF;
  SELECT class_id INTO v_class FROM public.quizzes WHERE id=_quiz_id;
  IF v_class IS NULL OR NOT public.can_manage_class(v_class) THEN
    RAISE EXCEPTION 'not authorised' USING ERRCODE='42501';
  END IF;
  UPDATE public.quizzes SET results_released_at = NULL, updated_at = now() WHERE id = _quiz_id;
END $$;

REVOKE ALL ON FUNCTION public.release_quiz_results(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hide_quiz_results(uuid)    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_quiz_results(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hide_quiz_results(uuid)    TO authenticated;

-- 10) get_quiz_result: no more score_only. Categories: not_submitted/no_result/hidden/ok.
CREATE OR REPLACE FUNCTION public.get_quiz_result(_attempt_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_att public.quiz_attempts%ROWTYPE;
  v_q   public.quizzes%ROWTYPE;
  v_res public.quiz_results%ROWTYPE;
  v_vis text;
  v_show boolean := false;
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

  SELECT * INTO v_q   FROM public.quizzes      WHERE id=v_att.quiz_id;
  SELECT * INTO v_res FROM public.quiz_results WHERE attempt_id=v_att.id;
  IF v_res.id IS NULL THEN
    RETURN jsonb_build_object('status','no_result','attempt_id',v_att.id);
  END IF;

  IF NOT public.is_enrolled_in_class(v_q.class_id) THEN
    RETURN jsonb_build_object('status','hidden','visibility',v_q.result_visibility,
                              'attempt_id',v_att.id,'result_id',v_res.id);
  END IF;

  v_vis := COALESCE(v_q.result_visibility, 'after_submit');

  IF v_vis = 'never' THEN
    v_show := false;
  ELSIF v_vis = 'after_submit' THEN
    v_show := true;
  ELSIF v_vis = 'after_due' THEN
    v_show := (v_q.due_at IS NOT NULL AND v_q.due_at <= now());
  ELSIF v_vis = 'manual' THEN
    v_show := (v_q.results_released_at IS NOT NULL);
  END IF;

  IF NOT v_show THEN
    RETURN jsonb_build_object(
      'status','hidden','visibility',v_vis,
      'attempt_id',v_att.id,'result_id',v_res.id
    );
  END IF;

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

  RETURN jsonb_build_object(
    'status','ok',
    'visibility', v_vis,
    'attempt_id', v_att.id,
    'result_id', v_res.id,
    'score', v_res.score,
    'total_questions', v_res.total_questions,
    'total_points', v_res.total_points,
    'max_points', v_att.max_points,
    'percentage', v_res.percentage,
    'submission_reason', v_res.submission_reason,
    'completed_at', v_res.completed_at,
    'questions', v_answers
  );
END $$;

REVOKE ALL ON FUNCTION public.get_quiz_result(uuid)          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_quiz_for_attempt(uuid)     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.start_quiz_attempt(uuid)       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_quiz_attempt(uuid,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_quiz_progress(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_quiz_result(uuid)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_quiz_for_attempt(uuid)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_quiz_attempt(uuid)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_quiz_attempt(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_quiz_progress(uuid,jsonb)  TO authenticated;
