
-- ========================================================================
-- Quiz Management B2a — RPCs
-- ========================================================================

-- ---- 1. Manager list (avoids N+1) --------------------------------------
CREATE OR REPLACE FUNCTION public.list_class_quizzes_for_manager(_class_id uuid)
RETURNS TABLE (
  id uuid,
  class_id uuid,
  center_id uuid,
  title text,
  description text,
  status text,
  instructions text,
  available_from timestamptz,
  due_at timestamptz,
  time_limit_seconds integer,
  attempt_limit integer,
  shuffle_questions boolean,
  shuffle_options boolean,
  result_visibility text,
  results_released_at timestamptz,
  published_at timestamptz,
  total_points integer,
  question_count integer,
  submission_count integer,
  attempt_count integer,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_manage_class(_class_id) THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    q.id,
    q.class_id,
    q.center_id,
    q.title,
    q.description,
    q.status,
    q.instructions,
    q.available_from,
    q.due_at,
    q.time_limit_seconds,
    q.attempt_limit,
    q.shuffle_questions,
    q.shuffle_options,
    q.result_visibility,
    q.results_released_at,
    q.published_at,
    q.total_points,
    COALESCE(qc.n, 0)::integer AS question_count,
    COALESCE(sc.n, 0)::integer AS submission_count,
    COALESCE(ac.n, 0)::integer AS attempt_count,
    q.created_at,
    q.updated_at
  FROM public.quizzes q
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS n FROM public.quiz_questions qq WHERE qq.quiz_id = q.id
  ) qc ON TRUE
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS n FROM public.quiz_attempts qa
    WHERE qa.quiz_id = q.id AND qa.status = 'submitted'
  ) sc ON TRUE
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS n FROM public.quiz_attempts qa WHERE qa.quiz_id = q.id
  ) ac ON TRUE
  WHERE q.class_id = _class_id
  ORDER BY q.updated_at DESC;
END;
$fn$;

REVOKE ALL ON FUNCTION public.list_class_quizzes_for_manager(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_class_quizzes_for_manager(uuid) TO authenticated;


-- ---- 2. Atomic save (contract complete; used by B2a lifecycle + B2b builder) ----
CREATE OR REPLACE FUNCTION public.save_quiz_definition(
  _class_id uuid,
  _definition jsonb,
  _quiz_id uuid DEFAULT NULL,
  _publish boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_center_id uuid;
  v_quiz_id uuid;
  v_existing public.quizzes%ROWTYPE;
  v_has_attempts boolean := false;
  v_meta jsonb := COALESCE(_definition->'meta', '{}'::jsonb);
  v_questions jsonb := COALESCE(_definition->'questions', '[]'::jsonb);
  v_new_status text;
  v_total_points int := 0;
  v_q_ids uuid[] := ARRAY[]::uuid[];
  v_q jsonb;
  v_qi int;
  v_qid uuid;
  v_qtype text;
  v_qpoints int;
  v_opts jsonb;
  v_o jsonb;
  v_o_ids uuid[];
  v_oi int;
  v_oid uuid;
  v_correct_count int;
  v_publish_errors text[] := ARRAY[]::text[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_manage_class(_class_id) THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE = '42501';
  END IF;

  SELECT center_id INTO v_center_id FROM public.classes WHERE id = _class_id;
  IF v_center_id IS NULL THEN
    RAISE EXCEPTION 'class_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Load / create the quiz row ------------------------------------------
  IF _quiz_id IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.quizzes WHERE id = _quiz_id FOR UPDATE;
    IF v_existing.id IS NULL THEN
      RAISE EXCEPTION 'quiz_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF v_existing.class_id IS DISTINCT FROM _class_id
       OR v_existing.center_id IS DISTINCT FROM v_center_id THEN
      RAISE EXCEPTION 'quiz_class_mismatch' USING ERRCODE = '42501';
    END IF;
    SELECT EXISTS(SELECT 1 FROM public.quiz_attempts WHERE quiz_id = _quiz_id)
      INTO v_has_attempts;
    v_quiz_id := _quiz_id;
  END IF;

  -- Resolve target status
  v_new_status := CASE
    WHEN _publish THEN 'published'
    WHEN v_existing.id IS NOT NULL THEN v_existing.status
    ELSE 'draft'
  END;

  -- Publishing validation ------------------------------------------------
  IF _publish THEN
    IF COALESCE(NULLIF(TRIM(v_meta->>'title'), ''), NULLIF(TRIM(COALESCE(v_existing.title,'')), '')) IS NULL THEN
      v_publish_errors := array_append(v_publish_errors, 'Title is required');
    END IF;
    IF jsonb_array_length(v_questions) = 0 THEN
      v_publish_errors := array_append(v_publish_errors, 'At least one question is required');
    END IF;
    FOR v_qi IN 0..GREATEST(jsonb_array_length(v_questions) - 1, 0) LOOP
      v_q := v_questions -> v_qi;
      IF v_q IS NULL THEN CONTINUE; END IF;
      IF NULLIF(TRIM(v_q->>'question'), '') IS NULL THEN
        v_publish_errors := array_append(v_publish_errors, format('Question %s is missing text', v_qi + 1));
      END IF;
      v_qtype := COALESCE(v_q->>'question_type', 'mcq');
      IF v_qtype = 'multiple_choice' THEN v_qtype := 'mcq'; END IF;
      v_opts := COALESCE(v_q->'options', '[]'::jsonb);
      IF v_qtype IN ('mcq','true_false') THEN
        IF jsonb_array_length(v_opts) < 2 THEN
          v_publish_errors := array_append(v_publish_errors, format('Question %s needs at least 2 options', v_qi + 1));
        END IF;
        v_correct_count := 0;
        FOR v_oi IN 0..GREATEST(jsonb_array_length(v_opts) - 1, 0) LOOP
          v_o := v_opts -> v_oi;
          IF (v_o->>'is_correct')::boolean THEN
            v_correct_count := v_correct_count + 1;
          END IF;
          IF NULLIF(TRIM(v_o->>'option_text'), '') IS NULL THEN
            v_publish_errors := array_append(v_publish_errors, format('Question %s option %s is missing text', v_qi + 1, v_oi + 1));
          END IF;
        END LOOP;
        IF v_correct_count < 1 THEN
          v_publish_errors := array_append(v_publish_errors, format('Question %s needs a correct answer', v_qi + 1));
        END IF;
      END IF;
    END LOOP;

    IF array_length(v_publish_errors, 1) > 0 THEN
      RAISE EXCEPTION 'publish_validation_failed: %', array_to_string(v_publish_errors, '; ')
        USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Grading-field lock after attempts exist ------------------------------
  IF v_has_attempts AND v_existing.id IS NOT NULL THEN
    -- Prevent silent structural mutation once someone has attempted.
    -- Callers are expected to send only metadata updates in this state.
    IF _publish AND v_existing.status <> 'published' THEN
      RAISE EXCEPTION 'cannot_publish_after_attempts' USING ERRCODE = '42501';
    END IF;
    IF jsonb_array_length(v_questions) > 0 THEN
      RAISE EXCEPTION 'edit_locked_after_attempts' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Upsert quiz row ------------------------------------------------------
  IF v_existing.id IS NULL THEN
    INSERT INTO public.quizzes (
      class_id, center_id, created_by, title, description, status,
      instructions, available_from, due_at, time_limit_seconds, attempt_limit,
      shuffle_questions, shuffle_options, result_visibility,
      published_at
    ) VALUES (
      _class_id, v_center_id, v_uid,
      COALESCE(NULLIF(TRIM(v_meta->>'title'), ''), 'Untitled quiz'),
      NULLIF(v_meta->>'description', ''),
      v_new_status,
      NULLIF(v_meta->>'instructions', ''),
      NULLIF(v_meta->>'available_from','')::timestamptz,
      NULLIF(v_meta->>'due_at','')::timestamptz,
      NULLIF(v_meta->>'time_limit_seconds','')::int,
      COALESCE(NULLIF(v_meta->>'attempt_limit','')::int, 1),
      COALESCE((v_meta->>'shuffle_questions')::boolean, false),
      COALESCE((v_meta->>'shuffle_options')::boolean, false),
      COALESCE(NULLIF(v_meta->>'result_visibility',''), 'after_submit'),
      CASE WHEN _publish THEN now() ELSE NULL END
    )
    RETURNING id INTO v_quiz_id;
  ELSE
    UPDATE public.quizzes SET
      title = COALESCE(NULLIF(TRIM(v_meta->>'title'), ''), title),
      description = COALESCE(v_meta->>'description', description),
      status = v_new_status,
      instructions = COALESCE(v_meta->>'instructions', instructions),
      available_from = CASE WHEN v_meta ? 'available_from'
                            THEN NULLIF(v_meta->>'available_from','')::timestamptz
                            ELSE available_from END,
      due_at = CASE WHEN v_meta ? 'due_at'
                    THEN NULLIF(v_meta->>'due_at','')::timestamptz
                    ELSE due_at END,
      time_limit_seconds = CASE WHEN v_meta ? 'time_limit_seconds'
                                THEN NULLIF(v_meta->>'time_limit_seconds','')::int
                                ELSE time_limit_seconds END,
      attempt_limit = CASE WHEN v_meta ? 'attempt_limit'
                           THEN COALESCE(NULLIF(v_meta->>'attempt_limit','')::int, 1)
                           ELSE attempt_limit END,
      shuffle_questions = COALESCE((v_meta->>'shuffle_questions')::boolean, shuffle_questions),
      shuffle_options   = COALESCE((v_meta->>'shuffle_options')::boolean, shuffle_options),
      result_visibility = COALESCE(NULLIF(v_meta->>'result_visibility',''), result_visibility),
      published_at = CASE WHEN _publish AND published_at IS NULL THEN now() ELSE published_at END
    WHERE id = v_quiz_id;
  END IF;

  -- Replace questions / options (atomic) --------------------------------
  IF jsonb_array_length(v_questions) > 0 THEN
    DELETE FROM public.quiz_questions WHERE quiz_id = v_quiz_id;

    FOR v_qi IN 0..jsonb_array_length(v_questions) - 1 LOOP
      v_q := v_questions -> v_qi;
      v_qtype := COALESCE(v_q->>'question_type', 'mcq');
      IF v_qtype = 'multiple_choice' THEN v_qtype := 'mcq'; END IF;
      v_qpoints := COALESCE(NULLIF(v_q->>'points','')::int, 1);
      v_total_points := v_total_points + v_qpoints;

      INSERT INTO public.quiz_questions (
        quiz_id, question, question_type, points, order_index, sort_order,
        center_id, explanation, options
      ) VALUES (
        v_quiz_id,
        COALESCE(v_q->>'question', ''),
        v_qtype,
        v_qpoints,
        v_qi,
        v_qi,
        v_center_id,
        NULLIF(v_q->>'explanation',''),
        '[]'::jsonb
      )
      RETURNING id INTO v_qid;

      v_q_ids := array_append(v_q_ids, v_qid);

      v_opts := COALESCE(v_q->'options', '[]'::jsonb);
      FOR v_oi IN 0..GREATEST(jsonb_array_length(v_opts) - 1, 0) LOOP
        v_o := v_opts -> v_oi;
        IF v_o IS NULL THEN CONTINUE; END IF;
        INSERT INTO public.quiz_options (
          question_id, center_id, option_text, is_correct, order_index
        ) VALUES (
          v_qid, v_center_id,
          COALESCE(v_o->>'option_text',''),
          COALESCE((v_o->>'is_correct')::boolean, false),
          v_oi
        );
      END LOOP;
    END LOOP;

    UPDATE public.quizzes SET total_points = v_total_points WHERE id = v_quiz_id;
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'id', q.id,
      'status', q.status,
      'updated_at', q.updated_at,
      'total_points', q.total_points,
      'published_at', q.published_at
    )
    FROM public.quizzes q WHERE q.id = v_quiz_id
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.save_quiz_definition(uuid, jsonb, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_quiz_definition(uuid, jsonb, uuid, boolean) TO authenticated;


-- ---- 3. Safe delete --------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_quiz_safe(_quiz_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_class_id uuid;
  v_has_attempts boolean;
  v_has_results boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT class_id INTO v_class_id FROM public.quizzes WHERE id = _quiz_id;
  IF v_class_id IS NULL THEN
    RAISE EXCEPTION 'quiz_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.can_manage_class(v_class_id) THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.quiz_attempts WHERE quiz_id = _quiz_id) INTO v_has_attempts;
  SELECT EXISTS(SELECT 1 FROM public.quiz_results  WHERE quiz_id = _quiz_id) INTO v_has_results;

  IF v_has_attempts OR v_has_results THEN
    RETURN jsonb_build_object(
      'deleted', false,
      'reason', 'has_attempts',
      'message', 'This quiz has student attempts or results. Archive it instead to preserve historical records.'
    );
  END IF;

  DELETE FROM public.quizzes WHERE id = _quiz_id;
  RETURN jsonb_build_object('deleted', true);
END;
$fn$;

REVOKE ALL ON FUNCTION public.delete_quiz_safe(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_quiz_safe(uuid) TO authenticated;


-- ---- 4. Duplicate quiz -----------------------------------------------
CREATE OR REPLACE FUNCTION public.duplicate_quiz_as_draft(_quiz_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_src public.quizzes%ROWTYPE;
  v_new_id uuid;
  v_old_qid uuid;
  v_new_qid uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_src FROM public.quizzes WHERE id = _quiz_id;
  IF v_src.id IS NULL THEN
    RAISE EXCEPTION 'quiz_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.can_manage_class(v_src.class_id) THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.quizzes (
    class_id, center_id, subject_id, created_by, title, description, status,
    instructions, available_from, due_at, time_limit_seconds, attempt_limit,
    shuffle_questions, shuffle_options, result_visibility, total_points,
    sound_theme, access_level
  ) VALUES (
    v_src.class_id, v_src.center_id, v_src.subject_id, auth.uid(),
    'Copy of ' || v_src.title,
    v_src.description, 'draft',
    v_src.instructions, v_src.available_from, v_src.due_at,
    v_src.time_limit_seconds, v_src.attempt_limit,
    v_src.shuffle_questions, v_src.shuffle_options, v_src.result_visibility,
    v_src.total_points, v_src.sound_theme, v_src.access_level
  )
  RETURNING id INTO v_new_id;

  FOR v_old_qid IN SELECT id FROM public.quiz_questions WHERE quiz_id = _quiz_id ORDER BY COALESCE(order_index, sort_order, 0) LOOP
    INSERT INTO public.quiz_questions (
      quiz_id, question, question_type, points, order_index, sort_order,
      center_id, explanation, options, correct_answer
    )
    SELECT v_new_id, question, question_type, points, order_index, sort_order,
           center_id, explanation, options, correct_answer
    FROM public.quiz_questions WHERE id = v_old_qid
    RETURNING id INTO v_new_qid;

    INSERT INTO public.quiz_options (question_id, center_id, option_text, is_correct, order_index)
    SELECT v_new_qid, center_id, option_text, is_correct, order_index
    FROM public.quiz_options WHERE question_id = v_old_qid;
  END LOOP;

  RETURN v_new_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.duplicate_quiz_as_draft(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.duplicate_quiz_as_draft(uuid) TO authenticated;


-- ---- 5. Simple lifecycle helpers used by the manager list ------------
CREATE OR REPLACE FUNCTION public.set_quiz_status(_quiz_id uuid, _status text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_class_id uuid;
  v_q public.quizzes%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF _status NOT IN ('draft','published','archived') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_q FROM public.quizzes WHERE id = _quiz_id FOR UPDATE;
  IF v_q.id IS NULL THEN
    RAISE EXCEPTION 'quiz_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.can_manage_class(v_q.class_id) THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE = '42501';
  END IF;

  -- Publishing must go through save_quiz_definition to enforce full validation
  IF _status = 'published' AND v_q.status <> 'published' THEN
    -- Inline validation: at least one question + all correct answers set
    IF NOT EXISTS (SELECT 1 FROM public.quiz_questions WHERE quiz_id = _quiz_id) THEN
      RAISE EXCEPTION 'publish_validation_failed: Quiz needs at least one question' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.quiz_questions qq
      WHERE qq.quiz_id = _quiz_id
        AND qq.question_type IN ('mcq','multiple_choice','true_false')
        AND NOT EXISTS (
          SELECT 1 FROM public.quiz_options qo
          WHERE qo.question_id = qq.id AND qo.is_correct = true
        )
    ) THEN
      RAISE EXCEPTION 'publish_validation_failed: Every question needs a correct answer' USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.quizzes
     SET status = _status,
         published_at = CASE
           WHEN _status = 'published' AND published_at IS NULL THEN now()
           ELSE published_at
         END
   WHERE id = _quiz_id;

  RETURN jsonb_build_object('id', _quiz_id, 'status', _status);
END;
$fn$;

REVOKE ALL ON FUNCTION public.set_quiz_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_quiz_status(uuid, text) TO authenticated;
