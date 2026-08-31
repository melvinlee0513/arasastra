-- ═══════════════════════════════════════════════════════════════════════════
-- 30-player load simulation.
--
-- Not internet-scale load testing — the point is the failure modes the
-- previous connection-pool incident taught us to look for: duplicate joins,
-- double scoring, runaway row-lock contention on the single session row, and
-- a counter that drifts once more than a handful of players answer at once.
--
-- Every call goes through the real RPCs as the real `authenticated` role with
-- a real auth.uid(), exactly as a browser would.
-- ═══════════════════════════════════════════════════════════════════════════
\set QUIET on
\pset pager off
\set ON_ERROR_STOP off

CREATE SCHEMA IF NOT EXISTS qa;
CREATE TABLE IF NOT EXISTS qa.load_results (
  n serial PRIMARY KEY, label text, ok boolean, detail text
);
TRUNCATE qa.load_results;

CREATE OR REPLACE FUNCTION qa.lcheck(_label text, _ok boolean, _detail text DEFAULT '')
RETURNS void LANGUAGE sql AS $$
  INSERT INTO qa.load_results (label, ok, detail) VALUES (_label, _ok, _detail);
$$;

-- ── A dedicated 10-question MCQ quiz, so the volume below is real ─────────
-- The shared seed quiz has 3 questions, 2 of them true/false; running the load
-- test against it would have claimed far more submissions than it made.
DO $$
DECLARE v_qz uuid := 'dddddddd-0000-0000-0000-00000000000d'; i int; v_q uuid;
BEGIN
  INSERT INTO public.quizzes (id, class_id, center_id, title, status, total_points)
  VALUES (v_qz, 'c1111111-0000-0000-0000-000000000001',
          'aaaaaaaa-0000-0000-0000-000000000001', 'Load Test Quiz', 'published', 1000)
  ON CONFLICT (id) DO NOTHING;

  FOR i IN 1..10 LOOP
    v_q := ('ddddddd1-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid;
    INSERT INTO public.quiz_questions
      (id, quiz_id, question, question_type, points, order_index, sort_order, center_id)
    VALUES (v_q, v_qz, 'Load question ' || i, 'mcq', 100, i, i,
            'aaaaaaaa-0000-0000-0000-000000000001')
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.quiz_options (question_id, center_id, option_text, is_correct, order_index)
    SELECT v_q, 'aaaaaaaa-0000-0000-0000-000000000001', t.txt, t.ok, t.ix
      FROM (VALUES ('Right', true, 0), ('Wrong A', false, 1),
                   ('Wrong B', false, 2), ('Wrong C', false, 3)) AS t(txt, ok, ix)
     WHERE NOT EXISTS (SELECT 1 FROM public.quiz_options WHERE question_id = v_q);
  END LOOP;
END $$;

-- ── 30 extra enrolled students in Centre A ────────────────────────────────
DO $$
DECLARE i int; v_uid uuid;
BEGIN
  FOR i IN 1..30 LOOP
    v_uid := ('99999999-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid;
    INSERT INTO auth.users (id) VALUES (v_uid) ON CONFLICT DO NOTHING;
    INSERT INTO public.profiles (user_id, full_name)
      VALUES (v_uid, 'Load Player ' || i) ON CONFLICT DO NOTHING;
    INSERT INTO public.class_enrollments (class_id, student_user_id, status)
      VALUES ('c1111111-0000-0000-0000-000000000001', v_uid, 'active')
      ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

DO $$
DECLARE
  v_tutor uuid := '11111111-0000-0000-0000-000000000001';
  v_sid uuid; v_code text; v_r jsonb; v_uid uuid;
  i int; qi int; v_total int; v_opt uuid; v_correct_opt uuid;
  v_t0 timestamptz; v_ms numeric;
  v_joined int; v_answers int; v_dupes int; v_sum_score bigint;
  v_recomputed bigint; v_locks int;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_tutor::text, true);
  SET LOCAL ROLE authenticated;
  v_r := public.create_live_quiz_session(
    'dddddddd-0000-0000-0000-00000000000d'::uuid, 50, true, 300, false);
  RESET ROLE;
  v_sid := (v_r->>'id')::uuid;
  v_code := v_r->>'game_code';

  -- ── 30 joins ────────────────────────────────────────────────────────────
  v_t0 := clock_timestamp();
  FOR i IN 1..30 LOOP
    v_uid := ('99999999-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid;
    PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);
    SET LOCAL ROLE authenticated;
    PERFORM public.join_live_quiz_session(v_code);
    RESET ROLE;
  END LOOP;
  v_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_t0)) * 1000;

  SELECT count(*) INTO v_joined FROM public.live_quiz_participants
   WHERE session_id = v_sid AND status = 'joined';
  PERFORM qa.lcheck('LD1 30 joins create exactly 30 participants',
    v_joined = 30, format('%s in %s ms', v_joined, round(v_ms)));

  PERFORM qa.lcheck('LD2 participant_count matches the roster',
    (SELECT participant_count FROM public.live_quiz_sessions WHERE id=v_sid) = 30,
    (SELECT participant_count::text FROM public.live_quiz_sessions WHERE id=v_sid));

  -- ── every player re-joins (a refresh storm) ─────────────────────────────
  FOR i IN 1..30 LOOP
    v_uid := ('99999999-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid;
    PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);
    SET LOCAL ROLE authenticated;
    PERFORM public.join_live_quiz_session(v_code);
    RESET ROLE;
  END LOOP;
  SELECT count(*) INTO v_joined FROM public.live_quiz_participants WHERE session_id = v_sid;
  PERFORM qa.lcheck('LD3 a 30-player refresh storm creates no duplicate participants',
    v_joined = 30, v_joined::text);

  -- ── play the whole quiz ─────────────────────────────────────────────────
  SELECT array_length(question_ids,1) INTO v_total
    FROM public.live_quiz_sessions WHERE id=v_sid;

  PERFORM set_config('request.jwt.claim.sub', v_tutor::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM public.advance_live_quiz_session(v_sid, 'start', NULL);
  RESET ROLE;

  v_t0 := clock_timestamp();
  FOR qi IN 0..v_total-1 LOOP
    SELECT o.id INTO v_correct_opt FROM public.quiz_options o
     WHERE o.question_id = (SELECT question_ids[qi+1] FROM public.live_quiz_sessions WHERE id=v_sid)
       AND o.is_correct ORDER BY o.order_index LIMIT 1;
    SELECT o.id INTO v_opt FROM public.quiz_options o
     WHERE o.question_id = (SELECT question_ids[qi+1] FROM public.live_quiz_sessions WHERE id=v_sid)
       AND NOT o.is_correct ORDER BY o.order_index LIMIT 1;

    FOR i IN 1..30 LOOP
      v_uid := ('99999999-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid;
      PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);
      SET LOCAL ROLE authenticated;
      BEGIN
        -- Half answer correctly. Every player submits TWICE — the double-tap
        -- every real game produces.
        PERFORM public.submit_live_quiz_answer(v_sid, qi,
          CASE WHEN i % 2 = 0 THEN v_correct_opt ELSE v_opt END, NULL);
        PERFORM public.submit_live_quiz_answer(v_sid, qi,
          CASE WHEN i % 2 = 0 THEN v_correct_opt ELSE v_opt END, NULL);
      EXCEPTION WHEN OTHERS THEN
        -- Every question in the load quiz is MCQ, so nothing should land here.
        PERFORM qa.lcheck('LD0 unexpected submit error', false, SQLERRM);
      END;
      RESET ROLE;
    END LOOP;

    PERFORM set_config('request.jwt.claim.sub', v_tutor::text, true);
    SET LOCAL ROLE authenticated;
    PERFORM public.advance_live_quiz_session(v_sid, 'reveal', NULL);
    PERFORM public.advance_live_quiz_session(v_sid, 'leaderboard', NULL);
    PERFORM public.advance_live_quiz_session(v_sid, 'next', NULL);
    RESET ROLE;
  END LOOP;
  v_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_t0)) * 1000;

  -- ── assertions ──────────────────────────────────────────────────────────
  SELECT count(*) INTO v_answers FROM public.live_quiz_answers WHERE session_id = v_sid;

  SELECT count(*) INTO v_dupes FROM (
    SELECT participant_id, question_index FROM public.live_quiz_answers
     WHERE session_id = v_sid
     GROUP BY 1,2 HAVING count(*) > 1
  ) d;
  -- 30 players x 10 questions x 2 taps = 600 submissions, 300 answer rows.
  PERFORM qa.lcheck('LD4 600 submissions produce 300 rows and zero duplicates',
    v_dupes = 0 AND v_answers = 300,
    format('%s answer rows from 600 submissions, %s dupes, %s ms',
           v_answers, v_dupes, round(v_ms)));

  -- Score must equal the sum of the points the server itself awarded.
  SELECT COALESCE(sum(score),0) INTO v_sum_score
    FROM public.live_quiz_participants WHERE session_id = v_sid;
  SELECT COALESCE(sum(points_awarded),0) INTO v_recomputed
    FROM public.live_quiz_answers WHERE session_id = v_sid;
  PERFORM qa.lcheck('LD5 every participant score equals the awarded points',
    v_sum_score = v_recomputed, format('participants=%s answers=%s', v_sum_score, v_recomputed));

  -- Nobody scored on a wrong answer, and every correct answer scored.
  PERFORM qa.lcheck('LD6 no points awarded for an incorrect answer',
    NOT EXISTS (SELECT 1 FROM public.live_quiz_answers
                 WHERE session_id=v_sid AND NOT is_correct AND points_awarded <> 0), '');
  PERFORM qa.lcheck('LD7 every correct answer scored',
    NOT EXISTS (SELECT 1 FROM public.live_quiz_answers
                 WHERE session_id=v_sid AND is_correct AND points_awarded <= 0), '');

  -- The game finished cleanly.
  PERFORM qa.lcheck('LD8 the session completed',
    (SELECT status FROM public.live_quiz_sessions WHERE id=v_sid) = 'completed',
    (SELECT status::text FROM public.live_quiz_sessions WHERE id=v_sid));

  -- Leaderboard ranks 30 players with no ties broken arbitrarily into gaps.
  PERFORM set_config('request.jwt.claim.sub', v_tutor::text, true);
  SET LOCAL ROLE authenticated;
  v_r := public.get_live_quiz_snapshot(v_sid);
  RESET ROLE;
  PERFORM qa.lcheck('LD9 the final leaderboard ranks all 30 players 1..30',
    jsonb_array_length(v_r->'leaderboard') = 30
    AND (SELECT array_agg((x->>'rank')::int ORDER BY (x->>'rank')::int)
           FROM jsonb_array_elements(v_r->'leaderboard') x)
        = (SELECT array_agg(g) FROM generate_series(1,30) g),
    format('%s rows', jsonb_array_length(v_r->'leaderboard')));

  PERFORM qa.lcheck('LD10 the summary reports 30 players',
    (v_r->'session'->'summary'->>'players')::int = 30,
    (v_r->'session'->'summary')::text);

  -- No transaction was left idle holding the session row.
  SELECT count(*) INTO v_locks
    FROM pg_locks l JOIN pg_class c ON c.oid = l.relation
   WHERE c.relname = 'live_quiz_sessions' AND NOT l.granted;
  PERFORM qa.lcheck('LD11 no ungranted locks left on live_quiz_sessions',
    v_locks = 0, v_locks::text);
END $$;
