-- Crop sanitiser: only a normalised {x,y,w,h} rectangle is ever stored.
CREATE OR REPLACE FUNCTION public._quiz_media_crop(_crop jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE x numeric; y numeric; w numeric; h numeric;
BEGIN
  IF _crop IS NULL OR jsonb_typeof(_crop) <> 'object' THEN RETURN NULL; END IF;
  BEGIN
    x := (_crop->>'x')::numeric; y := (_crop->>'y')::numeric;
    w := (_crop->>'w')::numeric; h := (_crop->>'h')::numeric;
  EXCEPTION WHEN others THEN RETURN NULL;
  END;
  IF x IS NULL OR y IS NULL OR w IS NULL OR h IS NULL THEN RETURN NULL; END IF;
  IF w <= 0 OR h <= 0 THEN RETURN NULL; END IF;
  x := LEAST(GREATEST(x, 0), 1); y := LEAST(GREATEST(y, 0), 1);
  w := LEAST(GREATEST(w, 0.01), 1 - x); h := LEAST(GREATEST(h, 0.01), 1 - y);
  RETURN jsonb_build_object('x', x, 'y', y, 'w', w, 'h', h);
END $$;
REVOKE ALL ON FUNCTION public._quiz_media_crop(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._quiz_media_crop(jsonb) TO authenticated, service_role;

-- ── Builder read ───────────────────────────────────────────────────────
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
        'question_type', CASE WHEN qq.question_type='multiple_choice' THEN 'mcq' ELSE qq.question_type END,
        'points', qq.points,
        'explanation', qq.explanation,
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

-- ── Student attempt read ───────────────────────────────────────────────
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
    SELECT q.id, q.question_type, q.question AS prompt, q.points, q.answer_unit,
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
      'answer_unit', qq_ord.answer_unit,
      'image_path', qq_ord.image_path,
      'image_width', qq_ord.image_width,
      'image_height', qq_ord.image_height,
      'image_alt', qq_ord.image_alt,
      'image_crop', qq_ord.image_crop,
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

-- ── Student result read (media + XP) ───────────────────────────────────
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
    'question_type',    qq.question_type,
    'points',           qq.points,
    'explanation',      qq.explanation,
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

-- ── Bank → quiz snapshot carries the image ─────────────────────────────
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
      (quiz_id, question, question_type, points, explanation,
       order_index, sort_order, center_id, source_bank_question_id,
       accepted_answers, answer_match_mode, numeric_answer, numeric_tolerance, answer_unit,
       image_path, image_width, image_height, image_alt, image_crop)
    SELECT _quiz_id, q.question, q.question_type, q.points, q.explanation,
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
      (question_id, center_id, option_text, is_correct, order_index)
    SELECT v_new, v_quiz.center_id, o.option_text, o.is_correct, o.order_index
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

-- ── Duplicates keep their media ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.duplicate_quiz_as_draft(_quiz_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
      center_id, explanation, options, correct_answer,
      accepted_answers, answer_match_mode, numeric_answer, numeric_tolerance, answer_unit,
      source_bank_question_id,
      image_path, image_width, image_height, image_alt, image_crop
    )
    SELECT v_new_id, question, question_type, points, order_index, sort_order,
           center_id, explanation, options, correct_answer,
           accepted_answers, answer_match_mode, numeric_answer, numeric_tolerance, answer_unit,
           source_bank_question_id,
           image_path, image_width, image_height, image_alt, image_crop
    FROM public.quiz_questions WHERE id = v_old_qid
    RETURNING id INTO v_new_qid;

    INSERT INTO public.quiz_options (question_id, center_id, option_text, is_correct, order_index)
    SELECT v_new_qid, center_id, option_text, is_correct, order_index
    FROM public.quiz_options WHERE question_id = v_old_qid;
  END LOOP;

  RETURN v_new_id;
END;
$function$;

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
      (center_id, collection_id, subject_id, question, question_type, points,
       explanation, topic, created_by,
       accepted_answers, answer_match_mode, numeric_answer, numeric_tolerance, answer_unit,
       image_path, image_width, image_height, image_alt, image_crop)
    SELECT q.center_id, q.collection_id, q.subject_id,
           left(q.question || ' (copy)', 2000),
           q.question_type, q.points, q.explanation, q.topic, auth.uid(),
           q.accepted_answers, q.answer_match_mode, q.numeric_answer,
           q.numeric_tolerance, q.answer_unit,
           q.image_path, q.image_width, q.image_height, q.image_alt, q.image_crop
      FROM public.question_bank_questions q
     WHERE q.id = v_src AND q.center_id = v_center
    RETURNING id INTO v_new;

    IF v_new IS NOT NULL THEN
      INSERT INTO public.question_bank_options
        (question_id, center_id, option_text, is_correct, order_index)
      SELECT v_new, v_center, o.option_text, o.is_correct, o.order_index
        FROM public.question_bank_options o WHERE o.question_id = v_src;
      v_ids := v_ids || v_new;
      v_new := NULL;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('created', COALESCE(array_length(v_ids, 1), 0), 'ids', to_jsonb(v_ids));
END $function$;

-- ── Bank editor read/write ─────────────────────────────────────────────
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
    'points', v_q.points, 'explanation', v_q.explanation, 'topic', v_q.topic,
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

DROP FUNCTION IF EXISTS public.save_question_bank_question(uuid, text, text, integer, text, text, uuid, uuid, jsonb, text[], text, numeric, numeric, text);

CREATE FUNCTION public.save_question_bank_question(
  _question_id uuid, _question text, _question_type text, _points integer,
  _explanation text, _topic text, _collection_id uuid, _subject_id uuid,
  _options jsonb, _accepted_answers text[] DEFAULT NULL::text[],
  _answer_match_mode text DEFAULT 'ignore_case'::text,
  _numeric_answer numeric DEFAULT NULL::numeric,
  _numeric_tolerance numeric DEFAULT NULL::numeric,
  _answer_unit text DEFAULT NULL::text,
  _image_path text DEFAULT NULL::text,
  _image_width integer DEFAULT NULL::integer,
  _image_height integer DEFAULT NULL::integer,
  _image_alt text DEFAULT NULL::text,
  _image_crop jsonb DEFAULT NULL::jsonb)
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

  -- A media path must live inside this centre's own folder.
  IF v_img IS NOT NULL AND v_img NOT LIKE 'quiz-question-media/' || v_center::text || '/%' THEN
    RAISE EXCEPTION 'invalid_image_path' USING ERRCODE = '22023';
  END IF;
  v_crop := CASE WHEN v_img IS NULL THEN NULL ELSE public._quiz_media_crop(_image_crop) END;

  SELECT NULLIF(array_agg(TRIM(a)) FILTER (WHERE TRIM(COALESCE(a, '')) <> ''), '{}')
    INTO v_acc FROM unnest(COALESCE(_accepted_answers, '{}')) a;

  IF _question_id IS NULL THEN
    INSERT INTO public.question_bank_questions
      (center_id, collection_id, subject_id, question, question_type, points,
       explanation, topic, created_by,
       accepted_answers, answer_match_mode, numeric_answer, numeric_tolerance, answer_unit,
       image_path, image_width, image_height, image_alt, image_crop)
    VALUES
      (v_center, _collection_id, _subject_id, TRIM(_question),
       COALESCE(NULLIF(_question_type, ''), 'mcq'),
       LEAST(GREATEST(COALESCE(_points, 1), 0), 1000),
       NULLIF(TRIM(COALESCE(_explanation, '')), ''),
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
           question_type = COALESCE(NULLIF(_question_type, ''), 'mcq'),
           points = LEAST(GREATEST(COALESCE(_points, 1), 0), 1000),
           explanation = NULLIF(TRIM(COALESCE(_explanation, '')), ''),
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
        (question_id, center_id, option_text, is_correct, order_index)
      VALUES
        (v_id, v_center, TRIM(v_o->>'option_text'),
         COALESCE((v_o->>'is_correct')::boolean, false), v_i);
    END LOOP;
  END IF;

  RETURN jsonb_build_object('id', v_id);
END $function$;

REVOKE ALL ON FUNCTION public.save_question_bank_question(uuid, text, text, integer, text, text, uuid, uuid, jsonb, text[], text, numeric, numeric, text, text, integer, integer, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_question_bank_question(uuid, text, text, integer, text, text, uuid, uuid, jsonb, text[], text, numeric, numeric, text, text, integer, integer, text, jsonb) TO authenticated, service_role;