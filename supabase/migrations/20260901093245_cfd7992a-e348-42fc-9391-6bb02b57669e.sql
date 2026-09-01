-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 5 — expanded question types.
--
-- Adds multiple_select, short_answer, numeric and fill_blank to the canonical
-- quiz engine, for both quiz questions and Question Bank questions.
--
-- Backward compatible by construction:
--   - no enum to widen (question_type is text)
--   - every new column is nullable with a sensible default
--   - existing mcq / true_false rows are untouched and grade identically
--   - existing attempts, results and per-answer rows are untouched
--
-- The one structural change is that correctness is now decided in EXACTLY ONE
-- place — `_quiz_answer_is_correct` — instead of being written out twice inside
-- the grader. Two copies of the same rule is how a grading loop and the row it
-- writes come to disagree.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Answer configuration ──────────────────────────────────────────────────
-- Typed columns rather than a JSON blob: these are queried, validated and
-- graded, and the existing schema is relational everywhere else.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['quiz_questions', 'question_bank_questions'] LOOP
    EXECUTE format($f$
      ALTER TABLE public.%I
        ADD COLUMN IF NOT EXISTS accepted_answers  text[],
        ADD COLUMN IF NOT EXISTS answer_match_mode text NOT NULL DEFAULT 'ignore_case',
        ADD COLUMN IF NOT EXISTS numeric_answer    numeric,
        ADD COLUMN IF NOT EXISTS numeric_tolerance numeric,
        ADD COLUMN IF NOT EXISTS answer_unit       text
    $f$, t);

    -- 'exact' and 'ignore_case' are the only two the grader implements, so the
    -- database refuses anything else rather than silently grading everything
    -- wrong.
    BEGIN
      EXECUTE format($f$
        ALTER TABLE public.%I ADD CONSTRAINT %I
          CHECK (answer_match_mode IN ('exact','ignore_case'))
      $f$, t, t || '_match_mode_ck');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
      EXECUTE format($f$
        ALTER TABLE public.%I ADD CONSTRAINT %I
          CHECK (numeric_tolerance IS NULL OR numeric_tolerance >= 0)
      $f$, t, t || '_tolerance_ck');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;

COMMENT ON COLUMN public.quiz_questions.accepted_answers IS
  'Answer key for short_answer and fill_blank. Never sent to a student: '
  'get_quiz_for_attempt omits it, and there is no client read path.';
COMMENT ON COLUMN public.quiz_questions.numeric_tolerance IS
  'Withheld from students. A visible tolerance narrows the search space enough '
  'to be a partial answer key.';

-- ═══════════════════════════════════════════════════════════════════════════
-- The single correctness decision.
--
--   mcq / multiple_choice  the chosen option belongs to the question and is correct
--   true_false             matches correct_answer, or the correct option's text
--   multiple_select        the chosen SET equals the correct SET exactly
--                          (all-or-nothing: no partial credit is invented)
--   short_answer/fill_blank  matches an accepted answer under the stored mode
--   numeric                |answer - key| <= tolerance, on real numbers only
--
-- Returns false — never raises — for a missing, malformed or hostile answer, so
-- one bad response cannot fail a whole submission.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._quiz_answer_is_correct(
  _question_id uuid,
  _answer      jsonb
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_q        public.quiz_questions%ROWTYPE;
  v_type     text;
  v_text     text;
  v_norm     text;
  v_num      numeric;
  v_tol      numeric;
  v_chosen   uuid[];
  v_correct  uuid[];
BEGIN
  IF _answer IS NULL OR jsonb_typeof(_answer) = 'null' THEN RETURN false; END IF;

  SELECT * INTO v_q FROM public.quiz_questions WHERE id = _question_id;
  IF v_q.id IS NULL THEN RETURN false; END IF;

  v_type := CASE WHEN v_q.question_type = 'multiple_choice' THEN 'mcq'
                 ELSE v_q.question_type END;

  -- ── single option ───────────────────────────────────────────────────────
  IF v_type = 'mcq' THEN
    IF jsonb_typeof(_answer) <> 'string' THEN RETURN false; END IF;
    v_text := _answer #>> '{}';
    BEGIN
      RETURN COALESCE((SELECT o.is_correct FROM public.quiz_options o
                        WHERE o.id = v_text::uuid AND o.question_id = v_q.id), false);
    EXCEPTION WHEN invalid_text_representation THEN RETURN false;
    END;
  END IF;

  -- ── true / false ────────────────────────────────────────────────────────
  IF v_type = 'true_false' THEN
    IF jsonb_typeof(_answer) NOT IN ('string','boolean') THEN RETURN false; END IF;
    v_text := lower(TRIM(COALESCE(_answer #>> '{}', '')));
    IF v_text NOT IN ('true','false') THEN RETURN false; END IF;
    -- Legacy quizzes store the key on the question; builder quizzes store it
    -- as the correct option. Both are honoured.
    IF v_q.correct_answer IS NOT NULL AND TRIM(v_q.correct_answer) <> '' THEN
      RETURN v_text = lower(TRIM(v_q.correct_answer));
    END IF;
    RETURN COALESCE((SELECT bool_or(lower(TRIM(o.option_text)) = v_text)
                       FROM public.quiz_options o
                      WHERE o.question_id = v_q.id AND o.is_correct), false);
  END IF;

  -- ── multiple select ─────────────────────────────────────────────────────
  IF v_type = 'multiple_select' THEN
    IF jsonb_typeof(_answer) <> 'array' THEN RETURN false; END IF;
    BEGIN
      SELECT array_agg(DISTINCT x ORDER BY x) INTO v_chosen
        FROM jsonb_array_elements_text(_answer) e(x_text),
             LATERAL (SELECT e.x_text::uuid AS x) z;
    EXCEPTION WHEN invalid_text_representation THEN RETURN false;
    END;
    SELECT array_agg(DISTINCT o.id ORDER BY o.id) INTO v_correct
      FROM public.quiz_options o WHERE o.question_id = v_q.id AND o.is_correct;

    -- A question with no correct option can never be answered correctly; say
    -- so rather than marking an empty selection right.
    IF v_correct IS NULL THEN RETURN false; END IF;
    IF v_chosen IS NULL THEN RETURN false; END IF;

    -- Every chosen option must belong to this question, and the sets must match.
    IF EXISTS (SELECT 1 FROM unnest(v_chosen) c
                WHERE NOT EXISTS (SELECT 1 FROM public.quiz_options o
                                   WHERE o.id = c AND o.question_id = v_q.id)) THEN
      RETURN false;
    END IF;
    RETURN v_chosen @> v_correct AND v_correct @> v_chosen;
  END IF;

  -- ── short answer / fill in the blank ────────────────────────────────────
  IF v_type IN ('short_answer','fill_blank') THEN
    IF jsonb_typeof(_answer) <> 'string' THEN RETURN false; END IF;
    v_text := TRIM(COALESCE(_answer #>> '{}', ''));
    IF v_text = '' THEN RETURN false; END IF;
    IF v_q.accepted_answers IS NULL OR array_length(v_q.accepted_answers, 1) IS NULL THEN
      RETURN false;
    END IF;
    -- Internal whitespace is collapsed for both sides, so "F  =  ma" and
    -- "F = ma" agree. That is normalisation, not a looser answer key.
    v_norm := regexp_replace(v_text, '\s+', ' ', 'g');
    IF v_q.answer_match_mode = 'exact' THEN
      RETURN EXISTS (SELECT 1 FROM unnest(v_q.accepted_answers) a
                      WHERE regexp_replace(TRIM(a), '\s+', ' ', 'g') = v_norm);
    END IF;
    RETURN EXISTS (SELECT 1 FROM unnest(v_q.accepted_answers) a
                    WHERE lower(regexp_replace(TRIM(a), '\s+', ' ', 'g')) = lower(v_norm));
  END IF;

  -- ── numeric ─────────────────────────────────────────────────────────────
  IF v_type = 'numeric' THEN
    IF v_q.numeric_answer IS NULL THEN RETURN false; END IF;
    IF jsonb_typeof(_answer) = 'number' THEN
      v_num := (_answer #>> '{}')::numeric;
    ELSIF jsonb_typeof(_answer) = 'string' THEN
      v_text := TRIM(COALESCE(_answer #>> '{}', ''));
      -- Reject anything that is not a plain decimal: 'NaN', 'Infinity' and
      -- '1e999' all cast without error and would otherwise pass or explode.
      IF v_text !~ '^[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)$' THEN RETURN false; END IF;
      v_num := v_text::numeric;
    ELSE
      RETURN false;
    END IF;
    v_tol := COALESCE(v_q.numeric_tolerance, 0);
    RETURN abs(v_num - v_q.numeric_answer) <= v_tol;
  END IF;

  RETURN false;
END $$;

REVOKE ALL ON FUNCTION public._quiz_answer_is_correct(uuid, jsonb) FROM PUBLIC;

-- ═══════════════════════════════════════════════════════════════════════════
-- Grader — same function, same behaviour for mcq and true_false, now routing
-- every type through the single decision above.
-- ═══════════════════════════════════════════════════════════════════════════
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

  -- Grade. Every question type routes through one server-side decision
  -- (_quiz_answer_is_correct) so the loop below, the per-answer rows written
  -- further down, and any future caller can never disagree about correctness.
  FOR v_qrec IN
    SELECT qq.id, qq.points
      FROM public.quiz_questions qq WHERE qq.quiz_id = v_q.id
  LOOP
    v_q_count := v_q_count + 1;
    v_max_points := v_max_points + COALESCE(v_qrec.points, 1);
    v_is_correct := public._quiz_answer_is_correct(
                      v_qrec.id, v_answers -> v_qrec.id::text);

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
    -- A single chosen option, for the types that have one. Multi-select stores
    -- its whole selection in selected_answer instead, since one column cannot
    -- hold several ids.
    CASE WHEN qq.question_type IN ('mcq','multiple_choice')
         THEN (SELECT o.id FROM public.quiz_options o
                WHERE o.id::text = v_answers->>qq.id::text AND o.question_id = qq.id LIMIT 1)
         ELSE NULL END,
    -- The raw response, for every type that is not a single option id.
    CASE WHEN qq.question_type IN ('mcq','multiple_choice') THEN NULL
         WHEN jsonb_typeof(v_answers -> qq.id::text) = 'array'
           THEN (v_answers -> qq.id::text)::text
         ELSE v_answers ->> qq.id::text END,
    public._quiz_answer_is_correct(qq.id, v_answers -> qq.id::text),
    CASE WHEN public._quiz_answer_is_correct(qq.id, v_answers -> qq.id::text)
         THEN COALESCE(qq.points, 1) ELSE 0 END
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

-- ═══════════════════════════════════════════════════════════════════════════
-- Student payload — the new types must not leak their answer key.
--
-- get_quiz_for_attempt already returned only id / text / order_index per
-- option, so multiple_select is safe as-is. The only thing added here is
-- `answer_unit`, which is a display label ("m/s²") a student needs in order to
-- know what to type. accepted_answers, numeric_answer and numeric_tolerance are
-- deliberately absent: a visible tolerance is a partial answer key.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_quiz_for_attempt(_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
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
      -- Display label only. Never the answer or the tolerance.
      'answer_unit', qq_ord.answer_unit,
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

REVOKE ALL ON FUNCTION public.get_quiz_for_attempt(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_quiz_for_attempt(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Question Bank — carry the answer config through save, detail and the copy.
-- ═══════════════════════════════════════════════════════════════════════════
-- The Phase 4 signature must go first. CREATE OR REPLACE with extra defaulted
-- parameters creates a SECOND function, and a 9-argument call then matches both
-- — Postgres refuses it as "not unique" rather than picking one.
DROP FUNCTION IF EXISTS public.save_question_bank_question(
  uuid, text, text, integer, text, text, uuid, uuid, jsonb);

CREATE OR REPLACE FUNCTION public.save_question_bank_question(
  _question_id   uuid,
  _question      text,
  _question_type text,
  _points        integer,
  _explanation   text,
  _topic         text,
  _collection_id uuid,
  _subject_id    uuid,
  _options       jsonb,
  _accepted_answers  text[] DEFAULT NULL,
  _answer_match_mode text    DEFAULT 'ignore_case',
  _numeric_answer    numeric DEFAULT NULL,
  _numeric_tolerance numeric DEFAULT NULL,
  _answer_unit       text    DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_center uuid := public._my_question_bank_center();
  v_id     uuid;
  v_o      jsonb;
  v_i      int;
  v_mode   text := CASE WHEN _answer_match_mode = 'exact' THEN 'exact' ELSE 'ignore_case' END;
  v_acc    text[];
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

  -- Blank alternatives are dropped rather than stored as answers nobody can
  -- type; an empty list then becomes NULL, not an array of nothing.
  SELECT NULLIF(array_agg(TRIM(a)) FILTER (WHERE TRIM(COALESCE(a, '')) <> ''), '{}')
    INTO v_acc FROM unnest(COALESCE(_accepted_answers, '{}')) a;

  IF _question_id IS NULL THEN
    INSERT INTO public.question_bank_questions
      (center_id, collection_id, subject_id, question, question_type, points,
       explanation, topic, created_by,
       accepted_answers, answer_match_mode, numeric_answer, numeric_tolerance, answer_unit)
    VALUES
      (v_center, _collection_id, _subject_id, TRIM(_question),
       COALESCE(NULLIF(_question_type, ''), 'mcq'),
       LEAST(GREATEST(COALESCE(_points, 1), 0), 1000),
       NULLIF(TRIM(COALESCE(_explanation, '')), ''),
       NULLIF(TRIM(COALESCE(_topic, '')), ''),
       auth.uid(),
       v_acc, v_mode, _numeric_answer, _numeric_tolerance,
       NULLIF(TRIM(COALESCE(_answer_unit, '')), ''))
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
END $$;

-- The snapshot must carry the answer config too, or a copied numeric question
-- would grade every attempt wrong.
CREATE OR REPLACE FUNCTION public.add_question_bank_questions_to_quiz(
  _quiz_id uuid, _question_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
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
       accepted_answers, answer_match_mode, numeric_answer, numeric_tolerance, answer_unit)
    SELECT _quiz_id, q.question, q.question_type, q.points, q.explanation,
           v_next, v_next, v_quiz.center_id, q.id,
           q.accepted_answers, q.answer_match_mode, q.numeric_answer,
           q.numeric_tolerance, q.answer_unit
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
END $$;

-- Detail returns the config so the editor can round-trip it. Staff-only, as
-- the whole bank is.
CREATE OR REPLACE FUNCTION public.get_question_bank_question(_question_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
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
END $$;

DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.save_question_bank_question(uuid, text, text, integer, text, text, uuid, uuid, jsonb, text[], text, numeric, numeric, text)',
    'public.get_question_bank_question(uuid)',
    'public.add_question_bank_questions_to_quiz(uuid, uuid[])'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
  END LOOP;
END $$;