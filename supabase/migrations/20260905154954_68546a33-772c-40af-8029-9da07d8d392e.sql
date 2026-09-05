-- ─── Additive rich content columns (plain text columns stay canonical mirrors) ──
ALTER TABLE public.quiz_questions
  ADD COLUMN IF NOT EXISTS question_content jsonb,
  ADD COLUMN IF NOT EXISTS explanation_content jsonb;

ALTER TABLE public.quiz_options
  ADD COLUMN IF NOT EXISTS option_content jsonb;

ALTER TABLE public.question_bank_questions
  ADD COLUMN IF NOT EXISTS question_content jsonb,
  ADD COLUMN IF NOT EXISTS explanation_content jsonb;

ALTER TABLE public.question_bank_options
  ADD COLUMN IF NOT EXISTS option_content jsonb;

-- Helper: only accept an object shaped like a rich document.
CREATE OR REPLACE FUNCTION public._rich_content(_value jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE
    WHEN _value IS NULL THEN NULL
    WHEN jsonb_typeof(_value) = 'object' AND _value->>'type' = 'doc' THEN _value
    ELSE NULL
  END
$$;
REVOKE ALL ON FUNCTION public._rich_content(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._rich_content(jsonb) TO authenticated, service_role;

-- ─── save_quiz_definition: persist rich content next to plain text ─────────────
CREATE OR REPLACE FUNCTION public.save_quiz_definition(_class_id uuid, _definition jsonb, _quiz_id uuid DEFAULT NULL::uuid, _publish boolean DEFAULT false, _expected_version integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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
  v_acc text[];
  v_img text;
  v_crop jsonb;
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
        IF v_qtype NOT IN ('mcq','true_false','multiple_select','short_answer','numeric','fill_blank') THEN
          v_publish_errors := array_append(v_publish_errors, format('Question %s uses an unsupported type', v_qi + 1));
          CONTINUE;
        END IF;
        v_opts := COALESCE(v_q->'options','[]'::jsonb);
        v_correct_count := 0;
        v_tf_true := 0; v_tf_false := 0;

        IF v_qtype IN ('mcq','multiple_select') THEN
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
          IF v_correct_count = 0 THEN
            v_publish_errors := array_append(v_publish_errors, format('Question %s needs a correct answer', v_qi + 1));
          ELSIF v_qtype = 'mcq' AND v_correct_count > 1 THEN
            v_publish_errors := array_append(v_publish_errors, format('Question %s has more than one correct answer', v_qi + 1));
          END IF;

        ELSIF v_qtype = 'true_false' THEN
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
          IF v_correct_count <> 1 THEN
            v_publish_errors := array_append(v_publish_errors, format('Question %s needs exactly one correct answer', v_qi + 1));
          END IF;

        ELSIF v_qtype IN ('short_answer','fill_blank') THEN
          SELECT COALESCE(array_agg(TRIM(a)) FILTER (WHERE NULLIF(TRIM(a),'') IS NOT NULL), '{}')
            INTO v_acc
            FROM jsonb_array_elements_text(COALESCE(v_q->'accepted_answers','[]'::jsonb)) a;
          IF COALESCE(array_length(v_acc,1),0) = 0 THEN
            v_publish_errors := array_append(v_publish_errors, format('Question %s needs at least one accepted answer', v_qi + 1));
          END IF;

        ELSIF v_qtype = 'numeric' THEN
          IF NULLIF(v_q->>'numeric_answer','') IS NULL THEN
            v_publish_errors := array_append(v_publish_errors, format('Question %s needs a correct numeric answer', v_qi + 1));
          END IF;
          IF COALESCE(NULLIF(v_q->>'numeric_tolerance','')::numeric, 0) < 0 THEN
            v_publish_errors := array_append(v_publish_errors, format('Question %s tolerance cannot be negative', v_qi + 1));
          END IF;
        END IF;
      END LOOP;
    END IF;

    IF array_length(v_publish_errors, 1) > 0 THEN
      RAISE EXCEPTION 'publish_validation_failed: %', array_to_string(v_publish_errors, '; ')
        USING ERRCODE = '22023';
    END IF;
  END IF;

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

      SELECT COALESCE(array_agg(TRIM(a)) FILTER (WHERE NULLIF(TRIM(a),'') IS NOT NULL), '{}')
        INTO v_acc
        FROM jsonb_array_elements_text(COALESCE(v_q->'accepted_answers','[]'::jsonb)) a;

      v_img := NULLIF(TRIM(COALESCE(v_q->>'image_path','')), '');
      IF v_img IS NOT NULL
         AND v_img NOT LIKE 'quiz-question-media/' || v_center_id::text || '/%' THEN
        RAISE EXCEPTION 'invalid_image_path: question %', v_qi + 1 USING ERRCODE = '22023';
      END IF;
      v_crop := CASE WHEN v_img IS NULL THEN NULL
                     ELSE public._quiz_media_crop(v_q->'image_crop') END;

      INSERT INTO public.quiz_questions (
        quiz_id, question, question_content, question_type, points, order_index, sort_order,
        center_id, explanation, explanation_content, options,
        accepted_answers, answer_match_mode, numeric_answer, numeric_tolerance, answer_unit,
        image_path, image_width, image_height, image_alt, image_crop
      ) VALUES (
        v_quiz_id,
        COALESCE(v_q->>'question',''),
        public._rich_content(v_q->'question_content'),
        v_qtype,
        v_qpoints,
        v_qi, v_qi,
        v_center_id,
        NULLIF(v_q->>'explanation',''),
        public._rich_content(v_q->'explanation_content'),
        '[]'::jsonb,
        CASE WHEN v_qtype IN ('short_answer','fill_blank') THEN v_acc ELSE NULL END,
        CASE WHEN v_q->>'answer_match_mode' = 'exact' THEN 'exact' ELSE 'ignore_case' END,
        CASE WHEN v_qtype = 'numeric' THEN NULLIF(v_q->>'numeric_answer','')::numeric ELSE NULL END,
        CASE WHEN v_qtype = 'numeric'
             THEN GREATEST(COALESCE(NULLIF(v_q->>'numeric_tolerance','')::numeric, 0), 0) ELSE 0 END,
        CASE WHEN v_qtype = 'numeric' THEN NULLIF(TRIM(COALESCE(v_q->>'answer_unit','')),'') ELSE NULL END,
        v_img,
        CASE WHEN v_img IS NULL THEN NULL ELSE NULLIF(v_q->>'image_width','')::int END,
        CASE WHEN v_img IS NULL THEN NULL ELSE NULLIF(v_q->>'image_height','')::int END,
        CASE WHEN v_img IS NULL THEN NULL
             ELSE NULLIF(TRIM(COALESCE(v_q->>'image_alt','')), '') END,
        v_crop
      )
      RETURNING id INTO v_qid;

      IF v_qtype IN ('mcq','true_false','multiple_select') THEN
        v_opts := COALESCE(v_q->'options','[]'::jsonb);
        FOR v_oi IN 0..GREATEST(jsonb_array_length(v_opts)-1,0) LOOP
          v_o := v_opts -> v_oi;
          IF v_o IS NULL THEN CONTINUE; END IF;
          INSERT INTO public.quiz_options (
            question_id, center_id, option_text, option_content, is_correct, order_index
          ) VALUES (
            v_qid, v_center_id,
            COALESCE(v_o->>'option_text',''),
            public._rich_content(v_o->'option_content'),
            COALESCE((v_o->>'is_correct')::boolean, false),
            v_oi
          );
        END LOOP;
      END IF;
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

-- ─── Manager definition: expose rich content ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_quiz_definition_for_manager(_quiz_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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
        'question_content', qq.question_content,
        'question_type', CASE WHEN qq.question_type='multiple_choice' THEN 'mcq' ELSE qq.question_type END,
        'points', qq.points,
        'explanation', qq.explanation,
        'explanation_content', qq.explanation_content,
        'order_index', COALESCE(qq.order_index, qq.sort_order, 0),
        'accepted_answers', COALESCE(to_jsonb(qq.accepted_answers), '[]'::jsonb),
        'answer_match_mode', COALESCE(qq.answer_match_mode, 'ignore_case'),
        'numeric_answer', qq.numeric_answer,
        'numeric_tolerance', COALESCE(qq.numeric_tolerance, 0),
        'answer_unit', qq.answer_unit,
        'image_path', qq.image_path,
        'image_width', qq.image_width,
        'image_height', qq.image_height,
        'image_alt', qq.image_alt,
        'image_crop', qq.image_crop,
        'options', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', qo.id,
            'option_text', qo.option_text,
            'option_content', qo.option_content,
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

-- ─── Student gameplay payload: rich prompt + rich options (no answer keys) ─────
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
    SELECT q.id, q.question_type, q.question AS prompt, q.question_content, q.points, q.answer_unit,
           q.image_path, q.image_width, q.image_height, q.image_alt, q.image_crop,
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
           o.option_content,
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
      'prompt_content', qq_ord.question_content,
      'points', qq_ord.points,
      'display_order', qq_ord.display_order,
      'answer_unit', qq_ord.answer_unit,
      'image_path', qq_ord.image_path,
      'image_width', qq_ord.image_width,
      'image_height', qq_ord.image_height,
      'image_alt', qq_ord.image_alt,
      'image_crop', qq_ord.image_crop,
      'options', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object('id', opts.id, 'text', opts.option_text,
                             'content', opts.option_content,
                             'order_index', opts.display_index)
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
      'instructions', v_q.instructions,
      'time_limit_seconds', v_q.time_limit_seconds,
      'shuffle_questions', v_q.shuffle_questions,
      'shuffle_options', v_q.shuffle_options,
      'total_points', v_q.total_points,
      'result_visibility', v_q.result_visibility,
      'sound_theme', v_q.sound_theme
    ),
    'attempt', jsonb_build_object(
      'id', v_att.id, 'status', v_att.status,
      'started_at', v_att.started_at,
      'saved_answers', COALESCE(v_att.saved_answers, '{}'::jsonb),
      'progress_revision', v_att.progress_revision,
      'current_question_index', v_att.current_question_index,
      'deadline', v_deadline
    ),
    'questions', v_qs,
    'server_now', now()
  );
END $function$;

-- ─── Result payload: rich prompt, explanation and options ─────────────────────
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
  v_award public.quiz_xp_awards%ROWTYPE;
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

  SELECT * INTO v_award FROM public.quiz_xp_awards
   WHERE student_user_id = v_uid AND quiz_id = v_q.id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'question_id',      qq.id,
    'prompt',           qq.question,
    'prompt_content',   qq.question_content,
    'question_type',    qq.question_type,
    'points',           qq.points,
    'explanation',      qq.explanation,
    'explanation_content', qq.explanation_content,
    'correct_answer',   qq.correct_answer,
    'accepted_answers', CASE WHEN qq.question_type IN ('short_answer','fill_blank')
                             THEN to_jsonb(qq.accepted_answers) END,
    'numeric_answer',   CASE WHEN qq.question_type = 'numeric'
                             THEN to_jsonb(qq.numeric_answer) END,
    'answer_unit',      qq.answer_unit,
    'image_path',       qq.image_path,
    'image_width',      qq.image_width,
    'image_height',     qq.image_height,
    'image_alt',        qq.image_alt,
    'image_crop',       qq.image_crop,
    'options',          (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                            'id', o.id, 'text', o.option_text,
                            'content', o.option_content,
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
    'xp_awarded', COALESCE(v_res.xp_awarded, 0),
    'xp_quiz_total', COALESCE(v_award.xp_total, 0),
    'xp_quiz_best_points', COALESCE(v_award.best_points, 0),
    'xp_quiz_max', COALESCE(v_att.max_points, 0) * 10,
    'questions', v_answers
  );
END $function$;

-- ─── Question Bank: read + save + copy semantics carry rich content ───────────
CREATE OR REPLACE FUNCTION public.get_question_bank_question(_question_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_center uuid := public._my_question_bank_center();
  v_q      public.question_bank_questions%ROWTYPE;
BEGIN
  SELECT * INTO v_q FROM public.question_bank_questions
   WHERE id = _question_id AND center_id = v_center;
  IF v_q.id IS NULL THEN
    RAISE EXCEPTION 'question_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'id', v_q.id, 'question', v_q.question, 'question_type', v_q.question_type,
    'question_content', v_q.question_content,
    'points', v_q.points, 'explanation', v_q.explanation, 'topic', v_q.topic,
    'explanation_content', v_q.explanation_content,
    'collection_id', v_q.collection_id, 'subject_id', v_q.subject_id,
    'archived', (v_q.archived_at IS NOT NULL),
    'created_at', v_q.created_at, 'updated_at', v_q.updated_at,
    'accepted_answers', COALESCE(to_jsonb(v_q.accepted_answers), '[]'::jsonb),
    'answer_match_mode', v_q.answer_match_mode,
    'numeric_answer', v_q.numeric_answer,
    'numeric_tolerance', v_q.numeric_tolerance,
    'answer_unit', v_q.answer_unit,
    'image_path', v_q.image_path,
    'image_width', v_q.image_width,
    'image_height', v_q.image_height,
    'image_alt', v_q.image_alt,
    'image_crop', v_q.image_crop,
    'collection_name', (SELECT name FROM public.question_bank_collections
                         WHERE id = v_q.collection_id),
    'subject_name', (SELECT name FROM public.subjects WHERE id = v_q.subject_id),
    'options', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', o.id, 'option_text', o.option_text,
               'option_content', o.option_content,
               'is_correct', o.is_correct, 'order_index', o.order_index
             ) ORDER BY o.order_index, o.id)
        FROM public.question_bank_options o WHERE o.question_id = v_q.id
    ), '[]'::jsonb),
    'usage_count', (SELECT count(*) FROM public.quiz_questions qq
                     WHERE qq.source_bank_question_id = v_q.id),
    'used_in', COALESCE((
      SELECT jsonb_agg(u ORDER BY u->>'title') FROM (
        SELECT DISTINCT jsonb_build_object(
                 'quiz_id', z.id, 'title', z.title, 'status', z.status,
                 'class_id', z.class_id,
                 'question_count', (SELECT count(*) FROM public.quiz_questions x
                                     WHERE x.quiz_id = z.id)
               ) AS u
          FROM public.quiz_questions qq
          JOIN public.quizzes z ON z.id = qq.quiz_id
         WHERE qq.source_bank_question_id = v_q.id
           AND z.center_id = v_center
      ) t
    ), '[]'::jsonb)
  );
END $function$;

DROP FUNCTION IF EXISTS public.save_question_bank_question(uuid, text, text, integer, text, text, uuid, uuid, jsonb, text[], text, numeric, numeric, text, text, integer, integer, text, jsonb);

CREATE OR REPLACE FUNCTION public.save_question_bank_question(
  _question_id uuid, _question text, _question_type text, _points integer,
  _explanation text, _topic text, _collection_id uuid, _subject_id uuid, _options jsonb,
  _accepted_answers text[] DEFAULT NULL::text[], _answer_match_mode text DEFAULT 'ignore_case'::text,
  _numeric_answer numeric DEFAULT NULL::numeric, _numeric_tolerance numeric DEFAULT NULL::numeric,
  _answer_unit text DEFAULT NULL::text, _image_path text DEFAULT NULL::text,
  _image_width integer DEFAULT NULL::integer, _image_height integer DEFAULT NULL::integer,
  _image_alt text DEFAULT NULL::text, _image_crop jsonb DEFAULT NULL::jsonb,
  _question_content jsonb DEFAULT NULL::jsonb, _explanation_content jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_center uuid := public._my_question_bank_center();
  v_id     uuid;
  v_o      jsonb;
  v_i      int;
  v_mode   text := CASE WHEN _answer_match_mode = 'exact' THEN 'exact' ELSE 'ignore_case' END;
  v_acc    text[];
  v_img    text := NULLIF(TRIM(COALESCE(_image_path, '')), '');
  v_crop   jsonb;
BEGIN
  IF length(TRIM(COALESCE(_question, ''))) = 0 THEN
    RAISE EXCEPTION 'question_text_required' USING ERRCODE = '22023';
  END IF;
  IF _collection_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.question_bank_collections
       WHERE id = _collection_id AND center_id = v_center) THEN
    RAISE EXCEPTION 'collection_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF _subject_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.subjects WHERE id = _subject_id AND center_id = v_center) THEN
    RAISE EXCEPTION 'subject_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_img IS NOT NULL AND v_img NOT LIKE 'quiz-question-media/' || v_center::text || '/%' THEN
    RAISE EXCEPTION 'invalid_image_path' USING ERRCODE = '22023';
  END IF;
  v_crop := CASE WHEN v_img IS NULL THEN NULL ELSE public._quiz_media_crop(_image_crop) END;

  SELECT NULLIF(array_agg(TRIM(a)) FILTER (WHERE TRIM(COALESCE(a, '')) <> ''), '{}')
    INTO v_acc FROM unnest(COALESCE(_accepted_answers, '{}')) a;

  IF _question_id IS NULL THEN
    INSERT INTO public.question_bank_questions
      (center_id, collection_id, subject_id, question, question_content, question_type, points,
       explanation, explanation_content, topic, created_by,
       accepted_answers, answer_match_mode, numeric_answer, numeric_tolerance, answer_unit,
       image_path, image_width, image_height, image_alt, image_crop)
    VALUES
      (v_center, _collection_id, _subject_id, TRIM(_question),
       public._rich_content(_question_content),
       COALESCE(NULLIF(_question_type, ''), 'mcq'),
       LEAST(GREATEST(COALESCE(_points, 1), 0), 1000),
       NULLIF(TRIM(COALESCE(_explanation, '')), ''),
       public._rich_content(_explanation_content),
       NULLIF(TRIM(COALESCE(_topic, '')), ''),
       auth.uid(),
       v_acc, v_mode, _numeric_answer, _numeric_tolerance,
       NULLIF(TRIM(COALESCE(_answer_unit, '')), ''),
       v_img,
       CASE WHEN v_img IS NULL THEN NULL ELSE _image_width END,
       CASE WHEN v_img IS NULL THEN NULL ELSE _image_height END,
       CASE WHEN v_img IS NULL THEN NULL ELSE NULLIF(TRIM(COALESCE(_image_alt, '')), '') END,
       v_crop)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.question_bank_questions
       SET question = TRIM(_question),
           question_content = public._rich_content(_question_content),
           question_type = COALESCE(NULLIF(_question_type, ''), 'mcq'),
           points = LEAST(GREATEST(COALESCE(_points, 1), 0), 1000),
           explanation = NULLIF(TRIM(COALESCE(_explanation, '')), ''),
           explanation_content = public._rich_content(_explanation_content),
           topic = NULLIF(TRIM(COALESCE(_topic, '')), ''),
           collection_id = _collection_id,
           subject_id = _subject_id,
           accepted_answers = v_acc,
           answer_match_mode = v_mode,
           numeric_answer = _numeric_answer,
           numeric_tolerance = _numeric_tolerance,
           answer_unit = NULLIF(TRIM(COALESCE(_answer_unit, '')), ''),
           image_path = v_img,
           image_width = CASE WHEN v_img IS NULL THEN NULL ELSE _image_width END,
           image_height = CASE WHEN v_img IS NULL THEN NULL ELSE _image_height END,
           image_alt = CASE WHEN v_img IS NULL THEN NULL
                            ELSE NULLIF(TRIM(COALESCE(_image_alt, '')), '') END,
           image_crop = v_crop,
           updated_at = now()
     WHERE id = _question_id AND center_id = v_center
     RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'question_not_found' USING ERRCODE = 'P0002';
    END IF;
    DELETE FROM public.question_bank_options WHERE question_id = v_id;
  END IF;

  IF _options IS NOT NULL AND jsonb_typeof(_options) = 'array' THEN
    FOR v_i IN 0 .. jsonb_array_length(_options) - 1 LOOP
      v_o := _options -> v_i;
      IF length(TRIM(COALESCE(v_o->>'option_text', ''))) = 0 THEN CONTINUE; END IF;
      INSERT INTO public.question_bank_options
        (question_id, center_id, option_text, option_content, is_correct, order_index)
      VALUES
        (v_id, v_center, TRIM(v_o->>'option_text'),
         public._rich_content(v_o->'option_content'),
         COALESCE((v_o->>'is_correct')::boolean, false), v_i);
    END LOOP;
  END IF;

  RETURN jsonb_build_object('id', v_id);
END $function$;

REVOKE ALL ON FUNCTION public.save_question_bank_question(uuid, text, text, integer, text, text, uuid, uuid, jsonb, text[], text, numeric, numeric, text, text, integer, integer, text, jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_question_bank_question(uuid, text, text, integer, text, text, uuid, uuid, jsonb, text[], text, numeric, numeric, text, text, integer, integer, text, jsonb, jsonb, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.add_question_bank_questions_to_quiz(_quiz_id uuid, _question_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_center uuid := public._my_question_bank_center();
  v_quiz   public.quizzes%ROWTYPE;
  v_src    uuid;
  v_new    uuid;
  v_added  int := 0;
  v_skipped int := 0;
  v_next   int;
BEGIN
  IF _question_ids IS NULL OR array_length(_question_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'no_questions_selected' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_quiz FROM public.quizzes WHERE id = _quiz_id;
  IF v_quiz.id IS NULL THEN
    RAISE EXCEPTION 'quiz_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_quiz.class_id IS NULL OR NOT public.can_manage_class(v_quiz.class_id) THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE = '42501';
  END IF;
  IF v_quiz.center_id <> v_center THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(max(COALESCE(order_index, sort_order, 0)) + 1, 0)
    INTO v_next FROM public.quiz_questions WHERE quiz_id = _quiz_id;

  FOREACH v_src IN ARRAY _question_ids LOOP
    IF EXISTS (SELECT 1 FROM public.quiz_questions
                WHERE quiz_id = _quiz_id AND source_bank_question_id = v_src) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.quiz_questions
      (quiz_id, question, question_content, question_type, points, explanation, explanation_content,
       order_index, sort_order, center_id, source_bank_question_id,
       accepted_answers, answer_match_mode, numeric_answer, numeric_tolerance, answer_unit,
       image_path, image_width, image_height, image_alt, image_crop)
    SELECT _quiz_id, q.question, q.question_content, q.question_type, q.points,
           q.explanation, q.explanation_content,
           v_next, v_next, v_quiz.center_id, q.id,
           q.accepted_answers, q.answer_match_mode, q.numeric_answer,
           q.numeric_tolerance, q.answer_unit,
           q.image_path, q.image_width, q.image_height, q.image_alt, q.image_crop
      FROM public.question_bank_questions q
     WHERE q.id = v_src AND q.center_id = v_center AND q.archived_at IS NULL
    RETURNING id INTO v_new;

    IF v_new IS NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.quiz_options
      (question_id, center_id, option_text, option_content, is_correct, order_index)
    SELECT v_new, v_quiz.center_id, o.option_text, o.option_content, o.is_correct, o.order_index
      FROM public.question_bank_options o WHERE o.question_id = v_src;

    v_added := v_added + 1;
    v_next  := v_next + 1;
    v_new   := NULL;
  END LOOP;

  UPDATE public.quizzes
     SET total_points = COALESCE(
           (SELECT sum(COALESCE(points, 1)) FROM public.quiz_questions WHERE quiz_id = _quiz_id), 0),
         updated_at = now()
   WHERE id = _quiz_id;

  RETURN jsonb_build_object('added', v_added, 'skipped', v_skipped, 'quiz_id', _quiz_id);
END $function$;

CREATE OR REPLACE FUNCTION public.duplicate_question_bank_questions(_question_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_center uuid := public._my_question_bank_center();
  v_src    uuid;
  v_new    uuid;
  v_ids    uuid[] := '{}';
BEGIN
  IF _question_ids IS NULL OR array_length(_question_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'no_questions_selected' USING ERRCODE = '22023';
  END IF;

  FOREACH v_src IN ARRAY _question_ids LOOP
    INSERT INTO public.question_bank_questions
      (center_id, collection_id, subject_id, question, question_content, question_type, points,
       explanation, explanation_content, topic, created_by,
       accepted_answers, answer_match_mode, numeric_answer, numeric_tolerance, answer_unit,
       image_path, image_width, image_height, image_alt, image_crop)
    SELECT q.center_id, q.collection_id, q.subject_id,
           left(q.question || ' (copy)', 2000),
           q.question_content,
           q.question_type, q.points, q.explanation, q.explanation_content, q.topic, auth.uid(),
           q.accepted_answers, q.answer_match_mode, q.numeric_answer,
           q.numeric_tolerance, q.answer_unit,
           q.image_path, q.image_width, q.image_height, q.image_alt, q.image_crop
      FROM public.question_bank_questions q
     WHERE q.id = v_src AND q.center_id = v_center
    RETURNING id INTO v_new;

    IF v_new IS NOT NULL THEN
      INSERT INTO public.question_bank_options
        (question_id, center_id, option_text, option_content, is_correct, order_index)
      SELECT v_new, v_center, o.option_text, o.option_content, o.is_correct, o.order_index
        FROM public.question_bank_options o WHERE o.question_id = v_src;
      v_ids := v_ids || v_new;
      v_new := NULL;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('created', COALESCE(array_length(v_ids, 1), 0), 'ids', to_jsonb(v_ids));
END $function$;