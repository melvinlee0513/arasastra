-- 1. Fix get_quiz_for_attempt: window function inside aggregate is invalid SQL
CREATE OR REPLACE FUNCTION public.get_quiz_for_attempt(_attempt_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_att public.quiz_attempts%ROWTYPE;
  v_q   public.quizzes%ROWTYPE;
  v_deadline timestamptz;
  v_qs jsonb;
  v_seed text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_att FROM public.quiz_attempts WHERE id=_attempt_id;
  IF v_att.id IS NULL OR v_att.user_id <> v_uid THEN
    RAISE EXCEPTION 'attempt_not_found' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_q FROM public.quizzes WHERE id = v_att.quiz_id;
  IF v_q.id IS NULL THEN
    RAISE EXCEPTION 'quiz_unavailable' USING ERRCODE='22023';
  END IF;
  v_deadline := public._quiz_attempt_deadline(v_att, v_q);
  v_seed := v_att.id::text;

  WITH qq AS (
    SELECT q.id, q.question_type, q.question AS prompt, q.points,
           COALESCE(q.order_index, q.sort_order, 0) AS base_order,
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
  ), opts AS (
    SELECT o.question_id,
           o.id,
           o.option_text,
           ROW_NUMBER() OVER (
             PARTITION BY o.question_id
             ORDER BY CASE WHEN v_q.shuffle_options
                           THEN md5(v_seed || ':o:' || o.id::text) END NULLS LAST,
                      o.order_index, o.id
           ) AS display_index
      FROM public.quiz_options o
     WHERE o.question_id IN (SELECT id FROM qq_ord)
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
          jsonb_build_object('id', opts.id, 'text', opts.option_text, 'order_index', opts.display_index)
          ORDER BY opts.display_index
        ), '[]'::jsonb)
        FROM opts WHERE opts.question_id = qq_ord.id
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
      'result_visibility', v_q.result_visibility,
      'class_id', v_q.class_id,
      'center_id', v_q.center_id
    ),
    'attempt', jsonb_build_object(
      'id', v_att.id, 'status', v_att.status,
      'saved_answers', v_att.saved_answers,
      'started_at', v_att.started_at,
      'submitted_at', v_att.submitted_at,
      'deadline', v_deadline,
      'progress_revision', v_att.progress_revision
    ),
    'questions', v_qs
  );
END $function$;

-- 2. Allow assigned tutors (canonical class_tutors) to update their class row.
-- Tenant isolation policy still applies on top of this.
DROP POLICY IF EXISTS "Assigned tutors can update their class" ON public.classes;
CREATE POLICY "Assigned tutors can update their class"
ON public.classes
FOR UPDATE
TO authenticated
USING (public.is_tutor_of_class(id))
WITH CHECK (public.is_tutor_of_class(id));