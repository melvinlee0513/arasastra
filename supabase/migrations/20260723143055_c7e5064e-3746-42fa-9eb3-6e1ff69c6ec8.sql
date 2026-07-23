
-- ─── B3a hardening ────────────────────────────────────────────────────────

ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS definition_version integer NOT NULL DEFAULT 1;

ALTER TABLE public.quiz_attempts
  ADD COLUMN IF NOT EXISTS progress_revision integer NOT NULL DEFAULT 0;

-- ─── save_quiz_definition (B3a: schedule lock + optimistic concurrency) ──
CREATE OR REPLACE FUNCTION public.save_quiz_definition(
  _class_id uuid,
  _definition jsonb,
  _quiz_id uuid DEFAULT NULL::uuid,
  _publish boolean DEFAULT false,
  _expected_version integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_center_id uuid;
  v_quiz_id uuid;
  v_existing public.quizzes%ROWTYPE;
  v_locked boolean := false;
  v_meta jsonb := COALESCE(_definition->'meta','{}'::jsonb);
  v_questions jsonb := COALESCE(_definition->'questions','[]'::jsonb);
  v_has_questions boolean := jsonb_array_length(v_questions) > 0;
  v_new_status text;
  v_total_points int := 0;
  v_q jsonb;
  v_qi int;
  v_qid uuid;
  v_qtype text;
  v_qpoints int;
  v_opts jsonb;
  v_o jsonb;
  v_oi int;
  v_correct_count int;
  v_tf_true int;
  v_tf_false int;
  v_publish_errors text[] := ARRAY[]::text[];
  v_new_tl int;
  v_new_al int;
  v_new_sq boolean;
  v_new_so boolean;
  v_new_af timestamptz;
  v_new_due timestamptz;
  v_new_version int;
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

  IF _quiz_id IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.quizzes WHERE id = _quiz_id FOR UPDATE;
    IF v_existing.id IS NULL THEN
      RAISE EXCEPTION 'quiz_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF v_existing.class_id IS DISTINCT FROM _class_id
       OR v_existing.center_id IS DISTINCT FROM v_center_id THEN
      RAISE EXCEPTION 'quiz_class_mismatch' USING ERRCODE = '42501';
    END IF;

    IF _expected_version IS NOT NULL
       AND _expected_version <> v_existing.definition_version THEN
      RAISE EXCEPTION 'quiz_definition_conflict: this quiz was updated by another manager (v% vs v%)',
        v_existing.definition_version, _expected_version
        USING ERRCODE='40001';
    END IF;

    SELECT
      EXISTS(SELECT 1 FROM public.quiz_attempts WHERE quiz_id = _quiz_id)
      OR EXISTS(SELECT 1 FROM public.quiz_results WHERE quiz_id = _quiz_id)
    INTO v_locked;
    v_quiz_id := _quiz_id;
  END IF;

  v_new_status := CASE
    WHEN _publish THEN 'published'
    WHEN v_existing.id IS NOT NULL THEN v_existing.status
    ELSE 'draft'
  END;

  -- ── Post-attempt lock ────────────────────────────────────────────
  IF v_locked THEN
    IF _publish AND v_existing.status <> 'published' THEN
      RAISE EXCEPTION 'cannot_publish_after_attempts' USING ERRCODE = '42501';
    END IF;
    IF v_has_questions THEN
      RAISE EXCEPTION 'quiz_locked_after_attempts: questions and answers cannot change once students have attempted this quiz' USING ERRCODE = '42501';
    END IF;

    IF v_meta ? 'shuffle_questions' THEN
      v_new_sq := (v_meta->>'shuffle_questions')::boolean;
      IF v_new_sq IS DISTINCT FROM v_existing.shuffle_questions THEN
        RAISE EXCEPTION 'quiz_locked_after_attempts: shuffle_questions cannot change' USING ERRCODE = '42501';
      END IF;
    END IF;
    IF v_meta ? 'shuffle_options' THEN
      v_new_so := (v_meta->>'shuffle_options')::boolean;
      IF v_new_so IS DISTINCT FROM v_existing.shuffle_options THEN
        RAISE EXCEPTION 'quiz_locked_after_attempts: shuffle_options cannot change' USING ERRCODE = '42501';
      END IF;
    END IF;
    IF v_meta ? 'time_limit_seconds' THEN
      v_new_tl := NULLIF(v_meta->>'time_limit_seconds','')::int;
      IF v_new_tl IS DISTINCT FROM v_existing.time_limit_seconds THEN
        RAISE EXCEPTION 'quiz_locked_after_attempts: time_limit_seconds cannot change' USING ERRCODE = '42501';
      END IF;
    END IF;

    -- Schedule lock: available_from + due_at frozen after attempts exist
    IF v_meta ? 'available_from' THEN
      v_new_af := NULLIF(v_meta->>'available_from','')::timestamptz;
      IF v_new_af IS DISTINCT FROM v_existing.available_from THEN
        RAISE EXCEPTION 'quiz_schedule_locked_after_attempts: available_from cannot change' USING ERRCODE = '42501';
      END IF;
    END IF;
    IF v_meta ? 'due_at' THEN
      v_new_due := NULLIF(v_meta->>'due_at','')::timestamptz;
      IF v_new_due IS DISTINCT FROM v_existing.due_at THEN
        RAISE EXCEPTION 'quiz_schedule_locked_after_attempts: due_at cannot change' USING ERRCODE = '42501';
      END IF;
    END IF;

    IF v_meta ? 'attempt_limit' THEN
      v_new_al := COALESCE(NULLIF(v_meta->>'attempt_limit','')::int, v_existing.attempt_limit);
      IF v_new_al < v_existing.attempt_limit THEN
        RAISE EXCEPTION 'quiz_locked_after_attempts: attempt_limit cannot be reduced' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  -- ── Publish validation ────────────────────────────────────────────
  IF _publish THEN
    IF COALESCE(NULLIF(TRIM(v_meta->>'title'), ''), NULLIF(TRIM(COALESCE(v_existing.title,'')), '')) IS NULL THEN
      v_publish_errors := array_append(v_publish_errors, 'Title is required');
    END IF;
    IF NOT v_has_questions AND v_existing.id IS NULL THEN
      v_publish_errors := array_append(v_publish_errors, 'At least one question is required');
    END IF;
    IF COALESCE(v_meta->>'result_visibility', v_existing.result_visibility, 'after_submit') = 'after_due' THEN
      IF NULLIF(v_meta->>'due_at','') IS NULL AND v_existing.due_at IS NULL THEN
        v_publish_errors := array_append(v_publish_errors, 'A due date is required when results release after due date');
      END IF;
    END IF;

    IF v_has_questions THEN
      FOR v_qi IN 0..jsonb_array_length(v_questions) - 1 LOOP
        v_q := v_questions -> v_qi;
        IF v_q IS NULL THEN CONTINUE; END IF;
        IF NULLIF(TRIM(v_q->>'question'), '') IS NULL THEN
          v_publish_errors := array_append(v_publish_errors, format('Question %s is missing text', v_qi + 1));
        END IF;
        IF COALESCE(NULLIF(v_q->>'points','')::int, 1) <= 0 THEN
          v_publish_errors := array_append(v_publish_errors, format('Question %s needs points greater than zero', v_qi + 1));
        END IF;
        v_qtype := COALESCE(v_q->>'question_type', 'mcq');
        IF v_qtype = 'multiple_choice' THEN v_qtype := 'mcq'; END IF;
        IF v_qtype NOT IN ('mcq','true_false') THEN
          v_publish_errors := array_append(v_publish_errors, format('Question %s uses an unsupported type', v_qi + 1));
          CONTINUE;
        END IF;
        v_opts := COALESCE(v_q->'options','[]'::jsonb);
        v_correct_count := 0;
        v_tf_true := 0; v_tf_false := 0;
        IF v_qtype = 'mcq' THEN
          IF jsonb_array_length(v_opts) < 2 THEN
            v_publish_errors := array_append(v_publish_errors, format('Question %s needs at least 2 options', v_qi + 1));
          END IF;
          FOR v_oi IN 0..GREATEST(jsonb_array_length(v_opts)-1,0) LOOP
            v_o := v_opts -> v_oi;
            IF NULLIF(TRIM(v_o->>'option_text'),'') IS NULL THEN
              v_publish_errors := array_append(v_publish_errors, format('Question %s option %s is blank', v_qi + 1, v_oi + 1));
            END IF;
            IF (v_o->>'is_correct')::boolean THEN v_correct_count := v_correct_count + 1; END IF;
          END LOOP;
        ELSE
          IF jsonb_array_length(v_opts) <> 2 THEN
            v_publish_errors := array_append(v_publish_errors, format('Question %s (true/false) needs exactly two options', v_qi + 1));
          ELSE
            FOR v_oi IN 0..1 LOOP
              v_o := v_opts -> v_oi;
              IF LOWER(TRIM(COALESCE(v_o->>'option_text',''))) = 'true' THEN v_tf_true := v_tf_true + 1;
              ELSIF LOWER(TRIM(COALESCE(v_o->>'option_text',''))) = 'false' THEN v_tf_false := v_tf_false + 1;
              END IF;
              IF (v_o->>'is_correct')::boolean THEN v_correct_count := v_correct_count + 1; END IF;
            END LOOP;
            IF v_tf_true <> 1 OR v_tf_false <> 1 THEN
              v_publish_errors := array_append(v_publish_errors, format('Question %s (true/false) must have one True and one False option', v_qi + 1));
            END IF;
          END IF;
        END IF;
        IF v_correct_count = 0 THEN
          v_publish_errors := array_append(v_publish_errors, format('Question %s needs exactly one correct answer', v_qi + 1));
        ELSIF v_correct_count > 1 THEN
          v_publish_errors := array_append(v_publish_errors, format('Question %s has more than one correct answer', v_qi + 1));
        END IF;
      END LOOP;
    END IF;

    IF array_length(v_publish_errors, 1) > 0 THEN
      RAISE EXCEPTION 'publish_validation_failed: %', array_to_string(v_publish_errors, '; ')
        USING ERRCODE = '22023';
    END IF;
  END IF;

  -- ── Upsert quiz row ───────────────────────────────────────────────
  IF v_existing.id IS NULL THEN
    INSERT INTO public.quizzes (
      class_id, center_id, created_by, title, description, status,
      instructions, available_from, due_at, time_limit_seconds, attempt_limit,
      shuffle_questions, shuffle_options, result_visibility, published_at,
      definition_version
    ) VALUES (
      _class_id, v_center_id, v_uid,
      COALESCE(NULLIF(TRIM(v_meta->>'title'),''), 'Untitled quiz'),
      NULLIF(v_meta->>'description',''),
      v_new_status,
      NULLIF(v_meta->>'instructions',''),
      NULLIF(v_meta->>'available_from','')::timestamptz,
      NULLIF(v_meta->>'due_at','')::timestamptz,
      NULLIF(v_meta->>'time_limit_seconds','')::int,
      COALESCE(NULLIF(v_meta->>'attempt_limit','')::int, 1),
      COALESCE((v_meta->>'shuffle_questions')::boolean, false),
      COALESCE((v_meta->>'shuffle_options')::boolean, false),
      COALESCE(NULLIF(v_meta->>'result_visibility',''), 'after_submit'),
      CASE WHEN _publish THEN now() ELSE NULL END,
      1
    )
    RETURNING id, definition_version INTO v_quiz_id, v_new_version;
  ELSE
    UPDATE public.quizzes SET
      title = COALESCE(NULLIF(TRIM(v_meta->>'title'),''), title),
      description = CASE WHEN v_meta ? 'description' THEN NULLIF(v_meta->>'description','') ELSE description END,
      status = v_new_status,
      instructions = CASE WHEN v_meta ? 'instructions' THEN NULLIF(v_meta->>'instructions','') ELSE instructions END,
      available_from = CASE WHEN v_meta ? 'available_from' THEN NULLIF(v_meta->>'available_from','')::timestamptz ELSE available_from END,
      due_at = CASE WHEN v_meta ? 'due_at' THEN NULLIF(v_meta->>'due_at','')::timestamptz ELSE due_at END,
      time_limit_seconds = CASE WHEN v_meta ? 'time_limit_seconds' THEN NULLIF(v_meta->>'time_limit_seconds','')::int ELSE time_limit_seconds END,
      attempt_limit = CASE WHEN v_meta ? 'attempt_limit' THEN COALESCE(NULLIF(v_meta->>'attempt_limit','')::int, 1) ELSE attempt_limit END,
      shuffle_questions = CASE WHEN v_meta ? 'shuffle_questions' THEN COALESCE((v_meta->>'shuffle_questions')::boolean, shuffle_questions) ELSE shuffle_questions END,
      shuffle_options = CASE WHEN v_meta ? 'shuffle_options' THEN COALESCE((v_meta->>'shuffle_options')::boolean, shuffle_options) ELSE shuffle_options END,
      result_visibility = CASE WHEN v_meta ? 'result_visibility' THEN COALESCE(NULLIF(v_meta->>'result_visibility',''), result_visibility) ELSE result_visibility END,
      published_at = CASE WHEN _publish AND published_at IS NULL THEN now() ELSE published_at END,
      definition_version = definition_version + 1
    WHERE id = v_quiz_id
    RETURNING definition_version INTO v_new_version;
  END IF;

  IF NOT v_locked AND v_has_questions THEN
    DELETE FROM public.quiz_questions WHERE quiz_id = v_quiz_id;

    FOR v_qi IN 0..jsonb_array_length(v_questions) - 1 LOOP
      v_q := v_questions -> v_qi;
      v_qtype := COALESCE(v_q->>'question_type','mcq');
      IF v_qtype = 'multiple_choice' THEN v_qtype := 'mcq'; END IF;
      v_qpoints := COALESCE(NULLIF(v_q->>'points','')::int, 1);
      v_total_points := v_total_points + v_qpoints;

      INSERT INTO public.quiz_questions (
        quiz_id, question, question_type, points, order_index, sort_order,
        center_id, explanation, options
      ) VALUES (
        v_quiz_id,
        COALESCE(v_q->>'question',''),
        v_qtype,
        v_qpoints,
        v_qi, v_qi,
        v_center_id,
        NULLIF(v_q->>'explanation',''),
        '[]'::jsonb
      )
      RETURNING id INTO v_qid;

      v_opts := COALESCE(v_q->'options','[]'::jsonb);
      FOR v_oi IN 0..GREATEST(jsonb_array_length(v_opts)-1,0) LOOP
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
      'published_at', q.published_at,
      'definition_version', q.definition_version
    )
    FROM public.quizzes q WHERE q.id = v_quiz_id
  );
END;
$function$;

-- keep prior 4-arg signature working for legacy callers
DROP FUNCTION IF EXISTS public.save_quiz_definition(uuid, jsonb, uuid, boolean);

REVOKE ALL ON FUNCTION public.save_quiz_definition(uuid, jsonb, uuid, boolean, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_quiz_definition(uuid, jsonb, uuid, boolean, integer) TO authenticated;

-- ─── get_quiz_definition_for_manager: expose definition_version ─────────
CREATE OR REPLACE FUNCTION public.get_quiz_definition_for_manager(_quiz_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_q public.quizzes%ROWTYPE;
  v_questions jsonb;
  v_has_attempts boolean;
  v_has_results boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_q FROM public.quizzes WHERE id=_quiz_id;
  IF v_q.id IS NULL THEN
    RAISE EXCEPTION 'quiz_not_found' USING ERRCODE='P0002';
  END IF;
  IF NOT public.can_manage_class(v_q.class_id) THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE='42501';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.quiz_attempts WHERE quiz_id=_quiz_id) INTO v_has_attempts;
  SELECT EXISTS(SELECT 1 FROM public.quiz_results  WHERE quiz_id=_quiz_id) INTO v_has_results;

  SELECT COALESCE(jsonb_agg(qrow ORDER BY qrow_order), '[]'::jsonb) INTO v_questions FROM (
    SELECT
      COALESCE(qq.order_index, qq.sort_order, 0) AS qrow_order,
      jsonb_build_object(
        'id', qq.id,
        'question', qq.question,
        'question_type', CASE WHEN qq.question_type='multiple_choice' THEN 'mcq' ELSE qq.question_type END,
        'points', qq.points,
        'explanation', qq.explanation,
        'order_index', COALESCE(qq.order_index, qq.sort_order, 0),
        'options', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', qo.id,
            'option_text', qo.option_text,
            'is_correct', qo.is_correct,
            'order_index', qo.order_index
          ) ORDER BY COALESCE(qo.order_index, 0))
          FROM public.quiz_options qo WHERE qo.question_id = qq.id
        ), '[]'::jsonb)
      ) AS qrow
    FROM public.quiz_questions qq WHERE qq.quiz_id = _quiz_id
  ) t;

  RETURN jsonb_build_object(
    'quiz', jsonb_build_object(
      'id', v_q.id,
      'class_id', v_q.class_id,
      'center_id', v_q.center_id,
      'title', v_q.title,
      'description', v_q.description,
      'instructions', v_q.instructions,
      'status', v_q.status,
      'available_from', v_q.available_from,
      'due_at', v_q.due_at,
      'time_limit_seconds', v_q.time_limit_seconds,
      'attempt_limit', v_q.attempt_limit,
      'shuffle_questions', v_q.shuffle_questions,
      'shuffle_options', v_q.shuffle_options,
      'result_visibility', v_q.result_visibility,
      'results_released_at', v_q.results_released_at,
      'published_at', v_q.published_at,
      'total_points', v_q.total_points,
      'updated_at', v_q.updated_at,
      'definition_version', v_q.definition_version
    ),
    'questions', v_questions,
    'locked', v_has_attempts OR v_has_results,
    'has_attempts', v_has_attempts,
    'has_results', v_has_results
  );
END;
$function$;

-- ─── save_quiz_progress: revision-guarded ───────────────────────────────
DROP FUNCTION IF EXISTS public.save_quiz_progress(uuid, jsonb);
DROP FUNCTION IF EXISTS public.save_quiz_progress(uuid, jsonb, integer);

CREATE OR REPLACE FUNCTION public.save_quiz_progress(
  _attempt_id uuid,
  _answers jsonb,
  _expected_revision integer DEFAULT NULL
) RETURNS jsonb
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
  v_ocount int;
  v_now timestamptz := now();
  v_new_rev int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;

  -- Row-level lock: serialise concurrent saves for the same attempt.
  SELECT * INTO v_att FROM public.quiz_attempts WHERE id=_attempt_id FOR UPDATE;
  IF v_att.id IS NULL OR v_att.user_id <> v_uid OR v_att.status <> 'in_progress' THEN
    RAISE EXCEPTION 'attempt_not_editable' USING ERRCODE='42501';
  END IF;

  IF _expected_revision IS NOT NULL
     AND _expected_revision <> v_att.progress_revision THEN
    RAISE EXCEPTION 'progress_revision_conflict: server rev % vs client rev %',
      v_att.progress_revision, _expected_revision
      USING ERRCODE='40001';
  END IF;

  SELECT * INTO v_q FROM public.quizzes WHERE id = v_att.quiz_id;
  IF v_q.status <> 'published' OR NOT public.is_enrolled_in_class(v_q.class_id) THEN
    RAISE EXCEPTION 'quiz_no_longer_accessible' USING ERRCODE='42501';
  END IF;

  v_deadline := public._quiz_attempt_deadline(v_att, v_q);
  IF v_deadline IS NOT NULL AND v_now > v_deadline THEN
    RAISE EXCEPTION 'attempt_deadline_passed' USING ERRCODE='22023';
  END IF;

  IF _answers IS NOT NULL AND jsonb_typeof(_answers) <> 'object' THEN
    RAISE EXCEPTION 'invalid_answers_shape' USING ERRCODE='22023';
  END IF;

  IF _answers IS NOT NULL THEN
    FOR v_key, v_val IN SELECT * FROM jsonb_each_text(_answers) LOOP
      BEGIN v_qid := v_key::uuid;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'invalid_question_id' USING ERRCODE='22023';
      END;
      SELECT question_type INTO v_qtype FROM public.quiz_questions
       WHERE id = v_qid AND quiz_id = v_q.id;
      IF v_qtype IS NULL THEN
        RAISE EXCEPTION 'foreign_question' USING ERRCODE='22023';
      END IF;
      IF v_val IS NULL OR v_val = '' THEN CONTINUE; END IF;
      IF v_qtype IN ('mcq','multiple_choice') THEN
        BEGIN PERFORM v_val::uuid;
        EXCEPTION WHEN others THEN
          RAISE EXCEPTION 'invalid_option_id' USING ERRCODE='22023';
        END;
        SELECT count(*) INTO v_ocount FROM public.quiz_options
         WHERE id::text = v_val AND question_id = v_qid;
        IF v_ocount = 0 THEN
          RAISE EXCEPTION 'foreign_option' USING ERRCODE='22023';
        END IF;
      ELSIF v_qtype = 'true_false' THEN
        IF lower(v_val) NOT IN ('true','false') THEN
          RAISE EXCEPTION 'invalid_true_false_answer' USING ERRCODE='22023';
        END IF;
      END IF;
    END LOOP;
  END IF;

  UPDATE public.quiz_attempts
     SET saved_answers = COALESCE(_answers, '{}'::jsonb),
         progress_revision = progress_revision + 1
   WHERE id = _attempt_id
   RETURNING progress_revision INTO v_new_rev;

  RETURN jsonb_build_object(
    'saved', true,
    'saved_at', v_now,
    'deadline', v_deadline,
    'progress_revision', v_new_rev
  );
END $fn$;

REVOKE ALL ON FUNCTION public.save_quiz_progress(uuid, jsonb, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.save_quiz_progress(uuid, jsonb, integer) TO authenticated;

-- ─── get_quiz_for_attempt: expose progress_revision ─────────────────────
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
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_att FROM public.quiz_attempts WHERE id=_attempt_id;
  IF v_att.id IS NULL OR v_att.user_id <> v_uid THEN
    RAISE EXCEPTION 'attempt_not_found' USING ERRCODE='42501';
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
END $fn$;

-- ─── Student quiz list RPC (safe, no answer keys) ───────────────────────
CREATE OR REPLACE FUNCTION public.list_student_class_quizzes(_class_id uuid)
RETURNS TABLE(
  id uuid,
  title text,
  description text,
  available_from timestamptz,
  due_at timestamptz,
  time_limit_seconds int,
  attempt_limit int,
  result_visibility text,
  results_released_at timestamptz,
  question_count int,
  attempts_used int,
  in_progress_attempt_id uuid,
  latest_submitted_attempt_id uuid
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;
  IF NOT public.is_enrolled_in_class(_class_id) THEN
    RAISE EXCEPTION 'not_enrolled' USING ERRCODE='42501';
  END IF;

  RETURN QUERY
  SELECT
    q.id, q.title, q.description,
    q.available_from, q.due_at, q.time_limit_seconds, q.attempt_limit,
    q.result_visibility, q.results_released_at,
    (SELECT count(*)::int FROM public.quiz_questions qq WHERE qq.quiz_id = q.id) AS question_count,
    (SELECT count(*)::int FROM public.quiz_attempts a
       WHERE a.quiz_id = q.id AND a.user_id = v_uid AND a.status='submitted') AS attempts_used,
    (SELECT a.id FROM public.quiz_attempts a
       WHERE a.quiz_id = q.id AND a.user_id = v_uid AND a.status='in_progress'
       LIMIT 1) AS in_progress_attempt_id,
    (SELECT a.id FROM public.quiz_attempts a
       WHERE a.quiz_id = q.id AND a.user_id = v_uid AND a.status='submitted'
       ORDER BY a.submitted_at DESC NULLS LAST LIMIT 1) AS latest_submitted_attempt_id
  FROM public.quizzes q
  WHERE q.class_id = _class_id
    AND q.status = 'published';
END $fn$;

REVOKE ALL ON FUNCTION public.list_student_class_quizzes(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.list_student_class_quizzes(uuid) TO authenticated;
