-- ─── list_my_quiz_attempts: student attempt history ─────────────────────
CREATE OR REPLACE FUNCTION public.list_my_quiz_attempts(_quiz_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_q public.quizzes%ROWTYPE;
  v_now timestamptz := now();
  v_reveal boolean := false;
  v_out jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_q FROM public.quizzes WHERE id = _quiz_id;
  IF v_q.id IS NULL THEN
    RAISE EXCEPTION 'quiz_not_found' USING ERRCODE='P0002';
  END IF;
  IF NOT public.is_enrolled_in_class(v_q.class_id) THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE='42501';
  END IF;

  -- Whether to reveal per-attempt scores based on quiz visibility.
  v_reveal := CASE v_q.result_visibility
    WHEN 'after_submit' THEN true
    WHEN 'after_due'    THEN v_q.due_at IS NOT NULL AND v_q.due_at <= v_now
    WHEN 'manual'       THEN v_q.results_released_at IS NOT NULL
    WHEN 'never'        THEN false
    ELSE false END;

  SELECT COALESCE(jsonb_agg(row_to_jsonb(a) ORDER BY a.started_at DESC), '[]'::jsonb)
    INTO v_out
  FROM (
    SELECT
      qa.id AS attempt_id,
      qa.status,
      qa.started_at,
      qa.submitted_at,
      CASE WHEN v_reveal AND qa.status='submitted' THEN qa.total_points ELSE NULL END AS total_points,
      CASE WHEN v_reveal AND qa.status='submitted' THEN qa.max_points   ELSE NULL END AS max_points,
      CASE WHEN v_reveal AND qa.status='submitted' THEN qa.percentage   ELSE NULL END AS percentage,
      CASE WHEN v_reveal AND qa.status='submitted' THEN qr.submission_reason ELSE NULL END AS submission_reason,
      v_reveal AS results_visible
    FROM public.quiz_attempts qa
    LEFT JOIN public.quiz_results qr ON qr.attempt_id = qa.id
    WHERE qa.quiz_id = _quiz_id AND qa.user_id = v_uid
  ) a;

  RETURN jsonb_build_object(
    'quiz_id', _quiz_id,
    'result_visibility', v_q.result_visibility,
    'results_visible', v_reveal,
    'attempts', v_out
  );
END $$;

REVOKE ALL ON FUNCTION public.list_my_quiz_attempts(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.list_my_quiz_attempts(uuid) TO authenticated;

-- ─── get_quiz_results_for_manager: per-student summary ──────────────────
CREATE OR REPLACE FUNCTION public.get_quiz_results_for_manager(_quiz_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_q public.quizzes%ROWTYPE;
  v_students jsonb;
  v_summary jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_q FROM public.quizzes WHERE id = _quiz_id;
  IF v_q.id IS NULL THEN
    RAISE EXCEPTION 'quiz_not_found' USING ERRCODE='P0002';
  END IF;
  IF NOT public.can_manage_class(v_q.class_id) THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE='42501';
  END IF;

  -- Per-enrolled-student aggregate: latest submitted attempt and totals
  SELECT COALESCE(jsonb_agg(row_to_jsonb(x) ORDER BY x.full_name NULLS LAST), '[]'::jsonb)
    INTO v_students
  FROM (
    SELECT
      ce.student_user_id AS user_id,
      COALESCE(p.full_name, p.email, 'Student') AS full_name,
      p.email,
      p.avatar_path,
      (SELECT count(*) FROM public.quiz_attempts qa
        WHERE qa.quiz_id = v_q.id AND qa.user_id = ce.student_user_id) AS attempt_count,
      (SELECT count(*) FROM public.quiz_attempts qa
        WHERE qa.quiz_id = v_q.id AND qa.user_id = ce.student_user_id AND qa.status='submitted') AS submitted_count,
      (SELECT count(*) FROM public.quiz_attempts qa
        WHERE qa.quiz_id = v_q.id AND qa.user_id = ce.student_user_id AND qa.status='in_progress') AS in_progress_count,
      last_att.attempt_id,
      last_att.total_points,
      last_att.max_points,
      last_att.percentage,
      last_att.submitted_at,
      last_att.submission_reason
    FROM public.class_enrollments ce
    JOIN public.profiles p ON p.user_id = ce.student_user_id
    LEFT JOIN LATERAL (
      SELECT qa.id AS attempt_id, qa.total_points, qa.max_points, qa.percentage,
             qa.submitted_at, qr.submission_reason
      FROM public.quiz_attempts qa
      LEFT JOIN public.quiz_results qr ON qr.attempt_id = qa.id
      WHERE qa.quiz_id = v_q.id AND qa.user_id = ce.student_user_id AND qa.status='submitted'
      ORDER BY qa.submitted_at DESC NULLS LAST
      LIMIT 1
    ) last_att ON true
    WHERE ce.class_id = v_q.class_id
      AND ce.status = 'active'
  ) x;

  SELECT jsonb_build_object(
    'total_enrolled', (SELECT count(*) FROM public.class_enrollments
                        WHERE class_id = v_q.class_id AND status='active'),
    'total_attempts', (SELECT count(*) FROM public.quiz_attempts WHERE quiz_id = v_q.id),
    'total_submitted', (SELECT count(*) FROM public.quiz_attempts
                        WHERE quiz_id = v_q.id AND status='submitted'),
    'total_in_progress', (SELECT count(*) FROM public.quiz_attempts
                        WHERE quiz_id = v_q.id AND status='in_progress'),
    'avg_percentage', (SELECT round(avg(percentage),2) FROM public.quiz_attempts
                        WHERE quiz_id = v_q.id AND status='submitted' AND percentage IS NOT NULL)
  ) INTO v_summary;

  RETURN jsonb_build_object(
    'quiz', jsonb_build_object(
      'id', v_q.id,
      'title', v_q.title,
      'status', v_q.status,
      'class_id', v_q.class_id,
      'result_visibility', v_q.result_visibility,
      'results_released_at', v_q.results_released_at,
      'due_at', v_q.due_at,
      'total_points', v_q.total_points,
      'attempt_limit', v_q.attempt_limit
    ),
    'summary', v_summary,
    'students', v_students
  );
END $$;

REVOKE ALL ON FUNCTION public.get_quiz_results_for_manager(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_quiz_results_for_manager(uuid) TO authenticated;

-- ─── get_quiz_attempt_for_manager: full detail for tutor/admin review ──
CREATE OR REPLACE FUNCTION public.get_quiz_attempt_for_manager(_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_att public.quiz_attempts%ROWTYPE;
  v_q public.quizzes%ROWTYPE;
  v_result public.quiz_results%ROWTYPE;
  v_questions jsonb;
  v_student jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_att FROM public.quiz_attempts WHERE id = _attempt_id;
  IF v_att.id IS NULL THEN
    RAISE EXCEPTION 'attempt_not_found' USING ERRCODE='P0002';
  END IF;
  SELECT * INTO v_q FROM public.quizzes WHERE id = v_att.quiz_id;
  IF NOT public.can_manage_class(v_q.class_id) THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_result FROM public.quiz_results WHERE attempt_id = _attempt_id;

  SELECT jsonb_build_object(
    'user_id', p.user_id,
    'full_name', COALESCE(p.full_name, p.email, 'Student'),
    'email', p.email,
    'avatar_path', p.avatar_path
  ) INTO v_student
  FROM public.profiles p WHERE p.user_id = v_att.user_id;

  SELECT COALESCE(jsonb_agg(row_to_jsonb(q) ORDER BY q.order_index NULLS LAST, q.question_id), '[]'::jsonb)
    INTO v_questions
  FROM (
    SELECT
      qq.id AS question_id,
      qq.question AS prompt,
      qq.question_type,
      qq.points,
      qq.explanation,
      qq.order_index,
      qq.correct_answer,
      (SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id', o.id, 'text', o.option_text, 'is_correct', o.is_correct,
          'order_index', o.order_index
        ) ORDER BY o.order_index), '[]'::jsonb)
        FROM public.quiz_options o WHERE o.question_id = qq.id) AS options,
      sqa.selected_option_id,
      sqa.selected_answer,
      COALESCE(sqa.is_correct, false) AS is_correct,
      COALESCE(sqa.points_awarded, 0) AS points_awarded
    FROM public.quiz_questions qq
    LEFT JOIN public.student_quiz_answers sqa
      ON sqa.question_id = qq.id AND sqa.result_id = v_result.id
    WHERE qq.quiz_id = v_q.id
  ) q;

  RETURN jsonb_build_object(
    'attempt', jsonb_build_object(
      'id', v_att.id,
      'status', v_att.status,
      'started_at', v_att.started_at,
      'submitted_at', v_att.submitted_at,
      'total_points', v_att.total_points,
      'max_points', v_att.max_points,
      'percentage', v_att.percentage,
      'saved_answers', v_att.saved_answers
    ),
    'result', CASE WHEN v_result.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_result.id,
      'submission_reason', v_result.submission_reason,
      'completed_at', v_result.completed_at,
      'score', v_result.score,
      'total_questions', v_result.total_questions,
      'total_points', v_result.total_points,
      'percentage', v_result.percentage
    ) END,
    'quiz', jsonb_build_object(
      'id', v_q.id,
      'title', v_q.title,
      'class_id', v_q.class_id,
      'total_points', v_q.total_points,
      'result_visibility', v_q.result_visibility
    ),
    'student', v_student,
    'questions', v_questions
  );
END $$;

REVOKE ALL ON FUNCTION public.get_quiz_attempt_for_manager(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_quiz_attempt_for_manager(uuid) TO authenticated;