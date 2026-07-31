CREATE OR REPLACE FUNCTION public.get_quiz_results_for_manager(_quiz_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_q public.quizzes%ROWTYPE;
  v_students jsonb;
  v_summary jsonb;
  v_enrolled int;
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

  SELECT COALESCE(jsonb_agg(row_to_jsonb(x) ORDER BY x.full_name NULLS LAST), '[]'::jsonb)
    INTO v_students
  FROM (
    SELECT
      ce.student_user_id AS user_id,
      COALESCE(p.full_name, p.email, 'Removed student') AS full_name,
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
    LEFT JOIN public.profiles p ON p.user_id = ce.student_user_id
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

  SELECT count(*) INTO v_enrolled
  FROM public.class_enrollments
  WHERE class_id = v_q.class_id AND status = 'active';

  SELECT jsonb_build_object(
    'total_enrolled', v_enrolled,
    'total_attempts', (SELECT count(*) FROM public.quiz_attempts WHERE quiz_id = v_q.id),
    'total_submitted', (SELECT count(*) FROM public.quiz_attempts
                        WHERE quiz_id = v_q.id AND status='submitted'),
    'total_in_progress', (SELECT count(*) FROM public.quiz_attempts
                        WHERE quiz_id = v_q.id AND status='in_progress'),
    'students_started', (SELECT count(DISTINCT qa.user_id) FROM public.quiz_attempts qa
                        WHERE qa.quiz_id = v_q.id),
    'students_submitted', (SELECT count(DISTINCT qa.user_id) FROM public.quiz_attempts qa
                        WHERE qa.quiz_id = v_q.id AND qa.status='submitted'),
    'completion_pct', CASE WHEN v_enrolled > 0 THEN round(
        100.0 * (SELECT count(DISTINCT qa.user_id) FROM public.quiz_attempts qa
                 JOIN public.class_enrollments ce2 ON ce2.class_id = v_q.class_id
                   AND ce2.status='active' AND ce2.student_user_id = qa.user_id
                 WHERE qa.quiz_id = v_q.id AND qa.status='submitted')::numeric / v_enrolled, 1)
      ELSE NULL END,
    -- Documented rule: class average uses each student's LATEST submitted attempt.
    'avg_percentage', (
      SELECT round(avg(latest.percentage), 2)
      FROM (
        SELECT DISTINCT ON (qa.user_id) qa.percentage
        FROM public.quiz_attempts qa
        WHERE qa.quiz_id = v_q.id AND qa.status='submitted' AND qa.percentage IS NOT NULL
        ORDER BY qa.user_id, qa.submitted_at DESC NULLS LAST
      ) latest
    )
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
END $function$;