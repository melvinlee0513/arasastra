-- ═══════════════════════════════════════════════════════════════════════════
-- Live multiplayer × expanded question types.
--
-- Phase 5 added multiple_select, short_answer, numeric and fill_blank to the
-- solo engine. The live engine still knew only mcq and true_false, and
-- `create_live_quiz_session` silently FILTERED every other type out of the
-- frozen question list — so a tutor hosting a mixed quiz got a shorter game
-- than the one they published, with no warning anywhere.
--
-- Silent content loss is the failure mode this migration removes. Live now
-- plays all six types, grading them through the same `_quiz_answer_is_correct`
-- the solo path uses, so the two can never disagree about an answer.
--
-- Additive and idempotent. No table is dropped, no policy changed, no existing
-- session or answer is touched.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Answer payload ────────────────────────────────────────────────────────
-- `answer_text` already existed and held 'true'/'false'. It now also holds a
-- typed response, or the JSON array of chosen option ids for multiple_select.
-- One column, because a multi-select answer cannot fit in selected_option_id.
COMMENT ON COLUMN public.live_quiz_answers.answer_text IS
  'The raw response for every type that is not a single chosen option: '
  '"true"/"false", a typed short answer or numeric string, or a JSON array of '
  'option ids for multiple_select. selected_option_id stays the single-choice '
  'column.';

-- ═══════════════════════════════════════════════════════════════════════════
-- create_live_quiz_session — freeze EVERY question, not a subset.
--
-- The old filter dropped unsupported types. A tutor who published a ten
-- question quiz and hosted it live would have run a six question game without
-- being told. Now the whole quiz is played.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.create_live_quiz_session(
  _quiz_id              uuid,
  _max_players          integer DEFAULT 30,
  _show_player_names    boolean DEFAULT true,
  _seconds_per_question integer DEFAULT 20,
  _randomize            boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_quiz   public.quizzes%ROWTYPE;
  v_code   text;
  v_qids   uuid[];
  v_id     uuid;
  v_try    int := 0;
  v_bad    text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_quiz FROM public.quizzes WHERE id = _quiz_id;
  IF v_quiz.id IS NULL THEN
    RAISE EXCEPTION 'quiz_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.can_manage_class(v_quiz.class_id) THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE = '42501';
  END IF;
  IF v_quiz.status <> 'published' THEN
    RAISE EXCEPTION 'quiz_not_published' USING ERRCODE = '22023';
  END IF;

  -- A type the live engine cannot grade must stop hosting HERE, with the type
  -- named, rather than being dropped from the game or failing mid-session.
  SELECT string_agg(DISTINCT q.question_type, ', ')
    INTO v_bad
    FROM public.quiz_questions q
   WHERE q.quiz_id = _quiz_id
     AND q.question_type NOT IN ('mcq', 'multiple_choice', 'true_false',
                                 'multiple_select', 'short_answer',
                                 'numeric', 'fill_blank');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'unsupported_live_question_type: %', v_bad USING ERRCODE = '22023';
  END IF;

  -- Freeze the whole quiz, in order.
  SELECT COALESCE(array_agg(q.id ORDER BY
           CASE WHEN _randomize THEN md5(random()::text) END NULLS LAST,
           COALESCE(q.order_index, q.sort_order, 0), q.id), '{}')
    INTO v_qids
    FROM public.quiz_questions q
   WHERE q.quiz_id = _quiz_id;

  IF COALESCE(array_length(v_qids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'quiz_has_no_playable_questions' USING ERRCODE = '22023';
  END IF;

  LOOP
    v_try := v_try + 1;
    v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    BEGIN
      INSERT INTO public.live_quiz_sessions (
        center_id, class_id, quiz_id, host_user_id, game_code,
        question_ids, max_players, show_player_names, seconds_per_question
      ) VALUES (
        v_quiz.center_id, v_quiz.class_id, _quiz_id, v_uid, v_code,
        v_qids,
        LEAST(GREATEST(COALESCE(_max_players, 30), 1), 200),
        COALESCE(_show_player_names, true),
        LEAST(GREATEST(COALESCE(_seconds_per_question, 20), 5), 300)
      )
      RETURNING id INTO v_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_try >= 12 THEN
        RAISE EXCEPTION 'game_code_unavailable' USING ERRCODE = '55000';
      END IF;
    END;
  END LOOP;

  RETURN jsonb_build_object('id', v_id, 'game_code', v_code);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- submit_live_quiz_answer — one grading decision, shared with the solo engine.
--
-- The old body carried its own copy of the mcq and true_false rules. It now
-- normalises whatever the client sent into the same jsonb shape the solo path
-- uses and hands it to `_quiz_answer_is_correct`, so live and solo can never
-- disagree about whether an answer is right.
--
-- `_answer` is new and optional: the client sends it for the types that need a
-- richer value (an array for multiple_select, a typed string for the rest).
-- The two legacy parameters still work unchanged, so nothing that already
-- calls this breaks.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.submit_live_quiz_answer(
  _session_id      uuid,
  _question_index  integer,
  _option_id       uuid DEFAULT NULL,
  _answer_text     text DEFAULT NULL,
  _answer          jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_s        public.live_quiz_sessions%ROWTYPE;
  v_p        public.live_quiz_participants%ROWTYPE;
  v_qid      uuid;
  v_q        public.quiz_questions%ROWTYPE;
  v_type     text;
  v_value    jsonb;
  v_correct  boolean := false;
  v_points   int := 0;
  v_now      timestamptz := now();
  v_ms       int;
  v_existing public.live_quiz_answers%ROWTYPE;
  v_store_option uuid;
  v_store_text   text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_s FROM public.live_quiz_sessions WHERE id = _session_id;
  IF v_s.id IS NULL THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_p FROM public.live_quiz_participants
   WHERE session_id = _session_id AND user_id = v_uid
   FOR UPDATE;
  IF v_p.id IS NULL THEN
    RAISE EXCEPTION 'not_a_participant' USING ERRCODE = '42501';
  END IF;
  IF v_p.status = 'removed' THEN
    RAISE EXCEPTION 'removed_by_host' USING ERRCODE = '42501';
  END IF;
  IF v_p.status <> 'joined' THEN
    RAISE EXCEPTION 'not_a_participant' USING ERRCODE = '42501';
  END IF;

  IF v_s.status <> 'question_open' THEN
    RAISE EXCEPTION 'question_not_open' USING ERRCODE = '22023';
  END IF;
  IF _question_index IS DISTINCT FROM v_s.current_question_index THEN
    RAISE EXCEPTION 'question_not_open' USING ERRCODE = '22023';
  END IF;
  IF v_s.question_ends_at IS NOT NULL AND v_now > v_s.question_ends_at THEN
    RAISE EXCEPTION 'question_expired' USING ERRCODE = '22023';
  END IF;

  -- Idempotency: an existing row wins and is echoed back unchanged.
  SELECT * INTO v_existing FROM public.live_quiz_answers
   WHERE participant_id = v_p.id AND question_index = _question_index;
  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('accepted', false, 'duplicate', true);
  END IF;

  v_qid := v_s.question_ids[_question_index + 1];
  SELECT * INTO v_q FROM public.quiz_questions WHERE id = v_qid;
  IF v_q.id IS NULL THEN
    RAISE EXCEPTION 'question_not_found' USING ERRCODE = 'P0002';
  END IF;
  v_type := CASE WHEN v_q.question_type = 'multiple_choice' THEN 'mcq'
                 ELSE v_q.question_type END;

  -- Normalise to the one shape the shared grader understands.
  IF _answer IS NOT NULL AND jsonb_typeof(_answer) <> 'null' THEN
    v_value := _answer;
  ELSIF _option_id IS NOT NULL THEN
    v_value := to_jsonb(_option_id::text);
  ELSIF _answer_text IS NOT NULL THEN
    v_value := to_jsonb(_answer_text);
  ELSE
    RAISE EXCEPTION 'invalid_answer' USING ERRCODE = '22023';
  END IF;

  -- Shape check per type, so a nonsense payload is rejected at the door rather
  -- than silently scored zero.
  IF v_type = 'multiple_select' THEN
    IF jsonb_typeof(v_value) <> 'array' THEN
      RAISE EXCEPTION 'invalid_answer' USING ERRCODE = '22023';
    END IF;
  ELSIF jsonb_typeof(v_value) NOT IN ('string', 'number', 'boolean') THEN
    RAISE EXCEPTION 'invalid_answer' USING ERRCODE = '22023';
  END IF;

  -- For a single choice, the option must belong to THIS question. The grader
  -- checks this too; raising here keeps the old "invalid_answer" behaviour for
  -- a client that sends a foreign option id, instead of scoring it wrong.
  IF v_type = 'mcq' THEN
    IF NOT EXISTS (SELECT 1 FROM public.quiz_options o
                    WHERE o.id::text = v_value #>> '{}' AND o.question_id = v_qid) THEN
      RAISE EXCEPTION 'invalid_answer' USING ERRCODE = '22023';
    END IF;
  ELSIF v_type = 'true_false' THEN
    IF lower(COALESCE(v_value #>> '{}', '')) NOT IN ('true', 'false') THEN
      RAISE EXCEPTION 'invalid_answer' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- The single decision. Live and solo now share it.
  v_correct := public._quiz_answer_is_correct(v_qid, v_value);

  v_ms := GREATEST(0, (EXTRACT(EPOCH FROM (v_now - COALESCE(v_s.question_started_at, v_now))) * 1000)::int);

  IF v_correct THEN
    v_points := public._live_quiz_points(
      COALESCE(v_q.points, 1), v_s.question_started_at, v_s.question_ends_at, v_now);
  END IF;

  -- Single choice keeps its own column; everything else lands in answer_text.
  IF v_type = 'mcq' THEN
    v_store_option := (v_value #>> '{}')::uuid;
    v_store_text   := NULL;
  ELSIF v_type = 'true_false' THEN
    v_store_option := NULL;
    v_store_text   := lower(v_value #>> '{}');
  ELSIF v_type = 'multiple_select' THEN
    v_store_option := NULL;
    v_store_text   := v_value::text;
  ELSE
    v_store_option := NULL;
    v_store_text   := v_value #>> '{}';
  END IF;

  INSERT INTO public.live_quiz_answers (
    session_id, participant_id, question_id, question_index,
    selected_option_id, answer_text, is_correct, points_awarded, response_time_ms, answered_at
  ) VALUES (
    _session_id, v_p.id, v_qid, _question_index,
    v_store_option, v_store_text, v_correct, v_points, v_ms, v_now
  )
  ON CONFLICT (participant_id, question_index) DO NOTHING;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('accepted', false, 'duplicate', true);
  END IF;

  UPDATE public.live_quiz_participants
     SET score         = score + v_points,
         correct_count = correct_count + CASE WHEN v_correct THEN 1 ELSE 0 END,
         streak        = CASE WHEN v_correct THEN streak + 1 ELSE 0 END,
         best_streak   = GREATEST(best_streak, CASE WHEN v_correct THEN streak + 1 ELSE 0 END),
         total_time_ms = total_time_ms + v_ms,
         last_seen_at  = v_now
   WHERE id = v_p.id;

  PERFORM public._resync_live_quiz_counts(_session_id);

  -- Correctness is deliberately NOT returned; the client learns it at reveal.
  RETURN jsonb_build_object('accepted', true, 'duplicate', false);
END $$;

-- The four-argument form must go, or a four-argument call matches both it and
-- the new five-argument one and Postgres refuses it as "not unique".
DROP FUNCTION IF EXISTS public.submit_live_quiz_answer(uuid, integer, uuid, text);

-- ═══════════════════════════════════════════════════════════════════════════
-- get_live_quiz_snapshot — carry answer_unit, and count multi-select choices
-- in the host's response distribution.
--
-- Redaction is unchanged: is_correct stays null until reveal, and the student
-- payload still gains nothing but the unit label.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_live_quiz_snapshot(_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_s         public.live_quiz_sessions%ROWTYPE;
  v_is_host   boolean;
  v_pid       uuid;
  v_pstatus   text;
  v_quiz      public.quizzes%ROWTYPE;
  v_qid       uuid;
  v_qtype     text;
  v_question  jsonb := NULL;
  v_reveal    boolean;
  v_me        jsonb := NULL;
  v_board     jsonb;
  v_players   jsonb;
  v_my_answer jsonb := NULL;
  v_stats     jsonb := NULL;
  v_summary   jsonb := NULL;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_s FROM public.live_quiz_sessions WHERE id = _session_id;
  IF v_s.id IS NULL THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_is_host := public.can_manage_class(v_s.class_id);
  SELECT id, status INTO v_pid, v_pstatus
    FROM public.live_quiz_participants
   WHERE session_id = v_s.id AND user_id = v_uid;

  IF NOT v_is_host AND v_pid IS NULL THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_quiz FROM public.quizzes WHERE id = v_s.quiz_id;
  v_reveal := v_s.status IN ('answer_reveal', 'leaderboard', 'completed');

  IF v_s.current_question_index >= 0
     AND v_s.current_question_index < COALESCE(array_length(v_s.question_ids, 1), 0) THEN
    v_qid := v_s.question_ids[v_s.current_question_index + 1];

    SELECT jsonb_build_object(
      'id', q.id,
      'index', v_s.current_question_index,
      'question', q.question,
      'question_type', CASE WHEN q.question_type = 'multiple_choice' THEN 'mcq' ELSE q.question_type END,
      'points', q.points,
      -- Display label only. The numeric answer and tolerance are never sent.
      'answer_unit', q.answer_unit,
      'explanation', CASE WHEN v_reveal THEN q.explanation ELSE NULL END,
      -- Reveal-only, and only for the types whose key is a list of strings.
      'accepted_answers', CASE
        WHEN v_reveal AND q.question_type IN ('short_answer','fill_blank')
        THEN to_jsonb(q.accepted_answers) END,
      -- Reveal-only. At reveal the answer is public to the room anyway — the
      -- host is showing it on screen — and without it a student who got a
      -- numeric question wrong is told only that they were wrong. The
      -- TOLERANCE is still withheld: it is a grading detail, and knowing it
      -- would narrow a later question's search space.
      'numeric_answer', CASE
        WHEN v_reveal AND q.question_type = 'numeric'
        THEN to_jsonb(q.numeric_answer) END,
      'options', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'id', o.id,
                 'text', o.option_text,
                 'is_correct', CASE WHEN v_reveal THEN o.is_correct ELSE NULL END
               ) ORDER BY COALESCE(o.order_index, 0), o.id)
          FROM public.quiz_options o WHERE o.question_id = q.id
      ), '[]'::jsonb)
    ) INTO v_question
    FROM public.quiz_questions q
    WHERE q.id = v_qid;

    IF v_is_host THEN
      -- How a response maps onto an option depends on the type, so the type is
      -- read once and each branch is explicit. A single OR-chain would let a
      -- numeric answer of "true" be counted as a true/false vote.
      SELECT CASE WHEN q.question_type = 'multiple_choice' THEN 'mcq'
                  ELSE q.question_type END
        INTO v_qtype
        FROM public.quiz_questions q WHERE q.id = v_qid;

      SELECT jsonb_build_object(
        'question_index', v_s.current_question_index,
        'answered', COALESCE((
          SELECT count(*) FROM public.live_quiz_answers a
            JOIN public.live_quiz_participants p ON p.id = a.participant_id
           WHERE a.session_id = v_s.id
             AND a.question_index = v_s.current_question_index
             AND p.status = 'joined'), 0),
        -- A typed question has no options to distribute over. Saying so with an
        -- empty list is honest; inventing buckets would not be.
        'options', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
                   'option_id',   o.id,
                   'text',        o.option_text,
                   'is_correct',  o.is_correct,
                   'count',       (
                     SELECT count(*) FROM public.live_quiz_answers a2
                       JOIN public.live_quiz_participants p2 ON p2.id = a2.participant_id
                      WHERE a2.session_id = v_s.id
                        AND a2.question_index = v_s.current_question_index
                        AND p2.status = 'joined'
                        AND CASE v_qtype
                              WHEN 'mcq' THEN a2.selected_option_id = o.id
                              -- true/false has no option id; it matches on text
                              WHEN 'true_false' THEN
                                a2.answer_text IS NOT NULL
                                AND lower(TRIM(o.option_text)) = a2.answer_text
                              -- multiple_select stores a JSON array of ids
                              WHEN 'multiple_select' THEN
                                a2.answer_text IS NOT NULL
                                AND left(a2.answer_text, 1) = '['
                                AND a2.answer_text::jsonb ? o.id::text
                              ELSE false
                            END
                   )
                 ) ORDER BY COALESCE(o.order_index, 0), o.id)
            FROM public.quiz_options o WHERE o.question_id = v_qid
        ), '[]'::jsonb)
      ) INTO v_stats;
    END IF;
  END IF;

  IF v_pid IS NOT NULL THEN
    SELECT jsonb_build_object(
      'participant_id', p.id, 'display_name', p.display_name,
      'avatar_url', p.avatar_url, 'score', p.score,
      'correct_count', p.correct_count, 'streak', p.streak,
      'best_streak', p.best_streak, 'status', p.status,
      'rank', (
        SELECT count(*) + 1 FROM public.live_quiz_participants o
         WHERE o.session_id = v_s.id AND o.status <> 'removed'
           AND (o.score > p.score
                OR (o.score = p.score AND o.correct_count > p.correct_count)
                OR (o.score = p.score AND o.correct_count = p.correct_count
                    AND o.total_time_ms < p.total_time_ms))
      )
    ) INTO v_me
    FROM public.live_quiz_participants p WHERE p.id = v_pid;

    IF v_s.current_question_index >= 0 THEN
      SELECT jsonb_build_object(
        'selected_option_id', a.selected_option_id,
        'answer_text', a.answer_text,
        'answered', true,
        'is_correct', CASE WHEN v_reveal THEN a.is_correct ELSE NULL END,
        'points_awarded', CASE WHEN v_reveal THEN a.points_awarded ELSE NULL END
      ) INTO v_my_answer
      FROM public.live_quiz_answers a
      WHERE a.participant_id = v_pid
        AND a.question_index = v_s.current_question_index;
    END IF;
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.rank), '[]'::jsonb)
    INTO v_board
  FROM (
    SELECT p.id AS participant_id,
           CASE WHEN v_s.show_player_names OR p.user_id = v_uid OR v_is_host
                THEN p.display_name ELSE 'Player' END AS display_name,
           p.avatar_url, p.score, p.correct_count, p.best_streak,
           (p.user_id = v_uid) AS is_me,
           ROW_NUMBER() OVER (
             ORDER BY p.score DESC, p.correct_count DESC, p.total_time_ms ASC, p.joined_at ASC
           ) AS rank
      FROM public.live_quiz_participants p
     WHERE p.session_id = v_s.id AND p.status <> 'removed'
     ORDER BY rank LIMIT 50
  ) t;

  SELECT COALESCE(jsonb_agg(
           CASE WHEN v_is_host THEN jsonb_build_object(
             'participant_id', p.id, 'display_name', p.display_name,
             'avatar_url', p.avatar_url, 'status', p.status,
             'score', p.score, 'correct_count', p.correct_count,
             'last_seen_at', p.last_seen_at, 'joined_at', p.joined_at,
             'answered', EXISTS (
               SELECT 1 FROM public.live_quiz_answers a
                WHERE a.participant_id = p.id
                  AND a.question_index = v_s.current_question_index)
           ) ELSE jsonb_build_object(
             'participant_id', p.id,
             'display_name', CASE WHEN v_s.show_player_names OR p.user_id = v_uid
                                  THEN p.display_name ELSE 'Player' END,
             'avatar_url', p.avatar_url, 'status', p.status
           ) END
           ORDER BY p.joined_at), '[]'::jsonb)
    INTO v_players
    FROM public.live_quiz_participants p
   WHERE p.session_id = v_s.id AND (v_is_host OR p.status <> 'removed');

  IF v_s.status = 'completed' THEN
    SELECT jsonb_build_object(
      'players', count(*),
      'questions', COALESCE(array_length(v_s.question_ids, 1), 0),
      'average_score', COALESCE(round(avg(p.score))::int, 0),
      'average_accuracy_pct', CASE
        WHEN COALESCE(array_length(v_s.question_ids, 1), 0) = 0 OR count(*) = 0 THEN NULL
        ELSE round(avg(p.correct_count)::numeric * 100
                   / array_length(v_s.question_ids, 1))::int END
    ) INTO v_summary
    FROM public.live_quiz_participants p
   WHERE p.session_id = v_s.id AND p.status <> 'removed';
  END IF;

  RETURN jsonb_build_object(
    'session', jsonb_build_object(
      'id', v_s.id, 'status', v_s.status,
      'game_code', CASE WHEN v_is_host THEN v_s.game_code ELSE NULL END,
      'class_id', v_s.class_id, 'quiz_id', v_s.quiz_id,
      'quiz_title', v_quiz.title,
      'question_count', COALESCE(array_length(v_s.question_ids, 1), 0),
      'current_question_index', v_s.current_question_index,
      'question_started_at', v_s.question_started_at,
      'question_ends_at', v_s.question_ends_at,
      'seconds_per_question', v_s.seconds_per_question,
      'max_players', v_s.max_players,
      'show_player_names', v_s.show_player_names,
      'participant_count', v_s.participant_count,
      'answered_count', v_s.answered_count,
      'state_revision', v_s.state_revision,
      'started_at', v_s.started_at, 'completed_at', v_s.completed_at,
      'expires_at', v_s.expires_at, 'summary', v_summary,
      'server_now', now()
    ),
    'is_host', v_is_host,
    'my_status', COALESCE(v_pstatus, CASE WHEN v_is_host THEN 'host' ELSE NULL END),
    'question', v_question,
    'question_stats', v_stats,
    'me', v_me,
    'my_answer', v_my_answer,
    'leaderboard', v_board,
    'players', v_players
  );
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Grants. PUBLIC first, or anon inherits EXECUTE on a new signature.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.create_live_quiz_session(uuid, integer, boolean, integer, boolean)',
    'public.submit_live_quiz_answer(uuid, integer, uuid, text, jsonb)',
    'public.get_live_quiz_snapshot(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
  END LOOP;
END $$;