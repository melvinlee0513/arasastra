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

      -- Answer keys for the typed questions. Empty/absent for choice types.
      SELECT COALESCE(array_agg(TRIM(a)) FILTER (WHERE NULLIF(TRIM(a),'') IS NOT NULL), '{}')
        INTO v_acc
        FROM jsonb_array_elements_text(COALESCE(v_q->'accepted_answers','[]'::jsonb)) a;

      -- One optional image per question. The path must sit inside this
      -- centre's own folder in the private quiz media bucket.
      v_img := NULLIF(TRIM(COALESCE(v_q->>'image_path','')), '');
      IF v_img IS NOT NULL
         AND v_img NOT LIKE 'quiz-question-media/' || v_center_id::text || '/%' THEN
        RAISE EXCEPTION 'invalid_image_path: question %', v_qi + 1 USING ERRCODE = '22023';
      END IF;
      v_crop := CASE WHEN v_img IS NULL THEN NULL
                     ELSE public._quiz_media_crop(v_q->'image_crop') END;

      INSERT INTO public.quiz_questions (
        quiz_id, question, question_type, points, order_index, sort_order,
        center_id, explanation, options,
        accepted_answers, answer_match_mode, numeric_answer, numeric_tolerance, answer_unit,
        image_path, image_width, image_height, image_alt, image_crop
      ) VALUES (
        v_quiz_id,
        COALESCE(v_q->>'question',''),
        v_qtype,
        v_qpoints,
        v_qi, v_qi,
        v_center_id,
        NULLIF(v_q->>'explanation',''),
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
            question_id, center_id, option_text, is_correct, order_index
          ) VALUES (
            v_qid, v_center_id,
            COALESCE(v_o->>'option_text',''),
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