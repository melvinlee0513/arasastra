-- Extend get_quiz_result to include quiz_id and class_id on every status branch,
-- enabling client-side route validation without exposing new sensitive data.
CREATE OR REPLACE FUNCTION public.get_quiz_result(_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
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

  SELECT * INTO v_q FROM public.quizzes WHERE id=v_att.quiz_id;

  IF v_att.status <> 'submitted' THEN
    RETURN jsonb_build_object(
      'status','not_submitted','attempt_id',v_att.id,
      'quiz_id', v_q.id, 'class_id', v_q.class_id
    );
  END IF;

  SELECT * INTO v_res FROM public.quiz_results WHERE attempt_id=v_att.id;
  IF v_res.id IS NULL THEN
    RETURN jsonb_build_object(
      'status','no_result','attempt_id',v_att.id,
      'quiz_id', v_q.id, 'class_id', v_q.class_id
    );
  END IF;

  IF NOT public.is_enrolled_in_class(v_q.class_id) THEN
    RETURN jsonb_build_object('status','hidden','visibility',v_q.result_visibility,
                              'attempt_id',v_att.id,'result_id',v_res.id,
                              'quiz_id', v_q.id, 'class_id', v_q.class_id);
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
      'attempt_id',v_att.id,'result_id',v_res.id,
      'quiz_id', v_q.id, 'class_id', v_q.class_id
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
    'quiz_id', v_q.id,
    'class_id', v_q.class_id,
    'score', v_res.score,
    'total_questions', v_res.total_questions,
    'total_points', v_res.total_points,
    'max_points', v_att.max_points,
    'percentage', v_res.percentage,
    'submission_reason', v_res.submission_reason,
    'completed_at', v_res.completed_at,
    'questions', v_answers
  );
END $function$;