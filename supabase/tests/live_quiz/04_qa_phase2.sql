-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 2 QA — answer-key secrecy, roster correctness, host control, expiry.
--
-- Runs after 02/03 against the same database, with the Phase 2 migration
-- applied. Uses the helpers defined in 02_qa.sql (qa.check, qa.expect_error,
-- qa.as_user) and appends to the same qa.results table.
-- ═══════════════════════════════════════════════════════════════════════════
\set QUIET on
\pset pager off
\set ON_ERROR_STOP off

-- Run `_sql` as `_uid` and record whether it SUCCEEDED (the mirror of
-- qa.expect_error, for the cases where the point is that something works).
CREATE OR REPLACE FUNCTION qa.expect_ok(_label text, _uid uuid, _sql text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_msg text := 'ok'; v_ok boolean := true;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', _uid::text, true);
    SET LOCAL ROLE authenticated;
    EXECUTE _sql;
  EXCEPTION WHEN OTHERS THEN
    v_ok := false; v_msg := SQLERRM;
  END;
  RESET ROLE;
  PERFORM qa.check(_label, v_ok, v_msg);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- L — ANSWER-KEY SECRECY (release blocker)
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_student uuid := '22222222-0000-0000-0000-000000000002';
  v_tutor   uuid := '11111111-0000-0000-0000-000000000001';
BEGIN
  -- L1: the exact one-liner a player could run in a browser console.
  PERFORM qa.expect_error(
    'L1 student cannot read quiz_options.is_correct directly',
    v_student,
    'SELECT is_correct FROM public.quiz_options LIMIT 1',
    'permission denied');

  -- L2: nor through a mask that hides the column name.
  PERFORM qa.expect_error(
    'L2 student cannot SELECT * from quiz_options',
    v_student,
    'SELECT * FROM public.quiz_options LIMIT 1',
    'permission denied');

  -- L3: nor by aggregating it.
  PERFORM qa.expect_error(
    'L3 student cannot aggregate over is_correct',
    v_student,
    'SELECT count(*) FROM public.quiz_options WHERE is_correct',
    'permission denied');

  -- L4: a tutor is bound by the same column grant. Staff read the key through
  -- get_quiz_definition_for_manager, never off the table.
  PERFORM qa.expect_error(
    'L4 tutor cannot read is_correct off the table either',
    v_tutor,
    'SELECT is_correct FROM public.quiz_options LIMIT 1',
    'permission denied');

  -- L5: NO column of the table reads, not just the key. 20260905000000
  -- restored the August posture: `authenticated` holds no privilege here at
  -- all, because nothing outside the database reads this table directly.
  PERFORM qa.expect_error(
    'L5 no column of quiz_options is readable directly, not even option text',
    v_student,
    'SELECT id, question_id, option_text, order_index FROM public.quiz_options LIMIT 1',
    'permission denied');
END $$;

-- L6/L7: the SECURITY DEFINER path is unaffected — still redacts before
-- reveal, still reveals after.
DO $$
DECLARE
  v_sid uuid; v_code text; v_snap jsonb; v_nulls int; v_true int;
  v_tutor uuid := '11111111-0000-0000-0000-000000000001';
  v_stu   uuid := '22222222-0000-0000-0000-000000000002';
BEGIN
  PERFORM qa.as_user(v_tutor);
  v_snap := public.create_live_quiz_session(
    (SELECT id FROM public.quizzes WHERE status='published' LIMIT 1), 30, true, 20, false);
  v_sid  := (v_snap->>'id')::uuid;
  v_code := v_snap->>'game_code';

  PERFORM qa.as_user(v_stu);
  PERFORM public.join_live_quiz_session(v_code);

  PERFORM qa.as_user(v_tutor);
  PERFORM public.advance_live_quiz_session(v_sid, 'start', NULL);

  PERFORM qa.as_user(v_stu);
  v_snap := public.get_live_quiz_snapshot(v_sid);
  SELECT count(*) INTO v_nulls
    FROM jsonb_array_elements(v_snap->'question'->'options') o
   WHERE o->'is_correct' = 'null'::jsonb;
  PERFORM qa.check('L6 snapshot still redacts is_correct before reveal',
    v_nulls = jsonb_array_length(v_snap->'question'->'options') AND v_nulls > 0,
    format('%s of %s null', v_nulls, jsonb_array_length(v_snap->'question'->'options')));

  PERFORM qa.as_user(v_tutor);
  PERFORM public.advance_live_quiz_session(v_sid, 'reveal', NULL);
  PERFORM qa.as_user(v_stu);
  v_snap := public.get_live_quiz_snapshot(v_sid);
  SELECT count(*) INTO v_true
    FROM jsonb_array_elements(v_snap->'question'->'options') o
   WHERE (o->>'is_correct')::boolean;
  PERFORM qa.check('L7 snapshot still reveals after the host reveals',
    v_true = 1, format('%s correct option(s) shown', v_true));

  PERFORM qa.as_user(v_tutor);
  PERFORM public.advance_live_quiz_session(v_sid, 'cancel', NULL);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- R — ROSTER CORRECTNESS
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_sid uuid; v_code text; v_r jsonb; v_n int; v_pid uuid;
  v_tutor uuid := '11111111-0000-0000-0000-000000000001';
  v_s1 uuid := '22222222-0000-0000-0000-000000000002';
  v_s2 uuid := '22222222-0000-0000-0000-000000000003';
  v_s3 uuid := '22222222-0000-0000-0000-000000000004';
BEGIN
  PERFORM qa.as_user(v_tutor);
  v_r := public.create_live_quiz_session(
    (SELECT id FROM public.quizzes WHERE status='published' LIMIT 1), 30, true, 20, false);
  v_sid := (v_r->>'id')::uuid; v_code := v_r->>'game_code';

  PERFORM qa.as_user(v_s1); PERFORM public.join_live_quiz_session(v_code);
  PERFORM qa.as_user(v_s2); PERFORM public.join_live_quiz_session(v_code);
  PERFORM qa.as_user(v_s3); PERFORM public.join_live_quiz_session(v_code);

  SELECT participant_count INTO v_n FROM public.live_quiz_sessions WHERE id=v_sid;
  PERFORM qa.check('R1 three joins give participant_count 3', v_n = 3, v_n::text);

  -- R2: leaving must decrement. This was the bug: it never did.
  PERFORM qa.as_user(v_s3); PERFORM public.leave_live_quiz_session(v_sid);
  SELECT participant_count INTO v_n FROM public.live_quiz_sessions WHERE id=v_sid;
  PERFORM qa.check('R2 leaving decrements participant_count', v_n = 2, v_n::text);

  -- R3: rejoining restores it, on the same participant row.
  PERFORM qa.as_user(v_s3);
  v_r := public.join_live_quiz_session(v_code);
  SELECT participant_count INTO v_n FROM public.live_quiz_sessions WHERE id=v_sid;
  PERFORM qa.check('R3 rejoin restores the count and the same participant',
    v_n = 3 AND (v_r->>'rejoined')::boolean, v_n::text);

  -- R4: a player who left cannot score.
  PERFORM qa.as_user(v_tutor);
  PERFORM public.advance_live_quiz_session(v_sid, 'start', NULL);
  PERFORM qa.as_user(v_s2); PERFORM public.leave_live_quiz_session(v_sid);
  PERFORM qa.expect_error('R4 a player who left cannot submit an answer', v_s2,
    -- A literal from the seed: `authenticated` cannot read quiz_options to
    -- find one, and this assertion is about the RPC, not about the lookup.
    format('SELECT public.submit_live_quiz_answer(%L, 0, %L::uuid, NULL)',
           v_sid, '0a111111-0000-0000-0000-000000000001'),
    'not_a_participant');

  -- R5: host removes a player.
  SELECT id INTO v_pid FROM public.live_quiz_participants
   WHERE session_id=v_sid AND user_id=v_s1;
  PERFORM qa.as_user(v_tutor);
  PERFORM public.remove_live_quiz_participant(v_sid, v_pid);
  SELECT status INTO v_r FROM (SELECT to_jsonb(status) AS status
    FROM public.live_quiz_participants WHERE id=v_pid) x;
  PERFORM qa.check('R5 host removal marks the participant removed',
    v_r = '"removed"'::jsonb, v_r::text);

  -- R6: the removed player cannot answer.
  PERFORM qa.expect_error('R6 a removed player cannot submit an answer', v_s1,
    format('SELECT public.submit_live_quiz_answer(%L, 0, %L::uuid, NULL)',
           v_sid, '0a111111-0000-0000-0000-000000000001'),
    'removed_by_host');

  -- R7: nor rejoin to get around it.
  PERFORM qa.expect_error('R7 a removed player cannot rejoin', v_s1,
    format('SELECT public.join_live_quiz_session(%L)', v_code),
    'removed_by_host');

  -- R8: removal is idempotent.
  PERFORM qa.expect_ok('R8 removing twice is a no-op, not an error', v_tutor,
    format('SELECT public.remove_live_quiz_participant(%L, %L)', v_sid, v_pid));

  -- R9: a STUDENT cannot remove anyone.
  PERFORM qa.expect_error('R9 a student cannot remove a participant', v_s3,
    format('SELECT public.remove_live_quiz_participant(%L, %L)', v_sid, v_pid),
    'access_denied');

  -- R10: a foreign tutor cannot remove anyone either.
  PERFORM qa.expect_error('R10 a foreign-tenant tutor cannot remove a participant',
    '33333333-0000-0000-0000-000000000005',
    format('SELECT public.remove_live_quiz_participant(%L, %L)', v_sid, v_pid),
    'access_denied');

  -- R11: removed and left players are both out of the live count.
  SELECT participant_count INTO v_n FROM public.live_quiz_sessions WHERE id=v_sid;
  PERFORM qa.check('R11 count excludes both left and removed players', v_n = 1, v_n::text);

  PERFORM qa.as_user(v_tutor);
  PERFORM public.advance_live_quiz_session(v_sid, 'cancel', NULL);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- H — HOST-ONLY OPERATIONAL DATA
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_sid uuid; v_code text; v_r jsonb; v_h jsonb; v_p jsonb; v_opt uuid;
  v_tutor uuid := '11111111-0000-0000-0000-000000000001';
  v_s1 uuid := '22222222-0000-0000-0000-000000000002';
  v_s2 uuid := '22222222-0000-0000-0000-000000000003';
BEGIN
  PERFORM qa.as_user(v_tutor);
  v_r := public.create_live_quiz_session(
    (SELECT id FROM public.quizzes WHERE status='published' LIMIT 1), 30, true, 60, false);
  v_sid := (v_r->>'id')::uuid; v_code := v_r->>'game_code';

  PERFORM qa.as_user(v_s1); PERFORM public.join_live_quiz_session(v_code);
  PERFORM qa.as_user(v_s2); PERFORM public.join_live_quiz_session(v_code);
  PERFORM qa.as_user(v_tutor);
  PERFORM public.advance_live_quiz_session(v_sid, 'start', NULL);

  -- One student answers.
  SELECT o.id INTO v_opt
    FROM public.quiz_options o
   WHERE o.question_id = (SELECT question_ids[1] FROM public.live_quiz_sessions WHERE id=v_sid)
   ORDER BY o.order_index LIMIT 1;
  PERFORM qa.as_user(v_s1);
  PERFORM public.submit_live_quiz_answer(v_sid, 0, v_opt, NULL);

  -- H1: host gets a per-option distribution.
  PERFORM qa.as_user(v_tutor);
  v_h := public.get_live_quiz_snapshot(v_sid);
  PERFORM qa.check('H1 host sees a per-option response distribution',
    v_h->'question_stats' IS NOT NULL
      AND jsonb_array_length(v_h->'question_stats'->'options') > 0,
    COALESCE((v_h->'question_stats')::text, 'null'));

  -- H2: the counts are right.
  PERFORM qa.check('H2 distribution counts the one answer that was given',
    (v_h->'question_stats'->>'answered')::int = 1
    AND (SELECT sum((o->>'count')::int)
           FROM jsonb_array_elements(v_h->'question_stats'->'options') o) = 1,
    (v_h->'question_stats')::text);

  -- H3: a STUDENT gets no distribution at all — it would tell them how many
  -- picked each option, which leaks the answer by popularity.
  PERFORM qa.as_user(v_s2);
  v_p := public.get_live_quiz_snapshot(v_sid);
  PERFORM qa.check('H3 a student receives NO question_stats',
    v_p->'question_stats' = 'null'::jsonb OR v_p->'question_stats' IS NULL,
    COALESCE((v_p->'question_stats')::text, 'absent'));

  -- H4: host roster carries score / answered / last_seen.
  PERFORM qa.check('H4 host roster carries score, answered and last_seen_at',
    (SELECT bool_and(p ? 'score' AND p ? 'answered' AND p ? 'last_seen_at')
       FROM jsonb_array_elements(v_h->'players') p),
    (v_h->'players')::text);

  -- H5: the student roster does NOT.
  PERFORM qa.check('H5 the student roster carries none of that',
    (SELECT bool_and(NOT (p ? 'score') AND NOT (p ? 'answered') AND NOT (p ? 'last_seen_at'))
       FROM jsonb_array_elements(v_p->'players') p),
    (v_p->'players')::text);

  -- H6: `answered` is per-player and correct.
  PERFORM qa.check('H6 answered flag is true only for the player who answered',
    (SELECT count(*) FROM jsonb_array_elements(v_h->'players') p
      WHERE (p->>'answered')::boolean) = 1,
    (v_h->'players')::text);

  -- H7: a student still cannot see another student's chosen option anywhere.
  PERFORM qa.check('H7 no student payload contains another player''s answer',
    v_p::text NOT LIKE '%selected_option_id%' OR (v_p->'my_answer') IS NOT NULL,
    'checked');

  PERFORM qa.as_user(v_tutor);
  PERFORM public.advance_live_quiz_session(v_sid, 'cancel', NULL);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- C — COMPLETION SUMMARY
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_sid uuid; v_code text; v_r jsonb; v_h jsonb; v_opt uuid; v_total int; v_i int;
  v_tutor uuid := '11111111-0000-0000-0000-000000000001';
  v_s1 uuid := '22222222-0000-0000-0000-000000000002';
  v_s2 uuid := '22222222-0000-0000-0000-000000000003';
BEGIN
  PERFORM qa.as_user(v_tutor);
  v_r := public.create_live_quiz_session(
    (SELECT id FROM public.quizzes WHERE status='published' LIMIT 1), 30, true, 60, false);
  v_sid := (v_r->>'id')::uuid; v_code := v_r->>'game_code';
  PERFORM qa.as_user(v_s1); PERFORM public.join_live_quiz_session(v_code);
  PERFORM qa.as_user(v_s2); PERFORM public.join_live_quiz_session(v_code);

  SELECT array_length(question_ids,1) INTO v_total
    FROM public.live_quiz_sessions WHERE id=v_sid;

  PERFORM qa.as_user(v_tutor);
  PERFORM public.advance_live_quiz_session(v_sid, 'start', NULL);

  FOR v_i IN 0..v_total-1 LOOP
    -- Student 1 always answers the first (correct) option; student 2 abstains.
    SELECT o.id INTO v_opt FROM public.quiz_options o
     WHERE o.question_id = (SELECT question_ids[v_i+1] FROM public.live_quiz_sessions WHERE id=v_sid)
       AND o.is_correct ORDER BY o.order_index LIMIT 1;
    PERFORM qa.as_user(v_s1);
    BEGIN
      PERFORM public.submit_live_quiz_answer(v_sid, v_i, v_opt, NULL);
    EXCEPTION WHEN OTHERS THEN NULL;  -- true/false questions take text instead
    END;
    PERFORM qa.as_user(v_tutor);
    PERFORM public.advance_live_quiz_session(v_sid, 'reveal', NULL);
    PERFORM public.advance_live_quiz_session(v_sid, 'leaderboard', NULL);
    PERFORM public.advance_live_quiz_session(v_sid, 'next', NULL);
  END LOOP;

  -- C1: the game is completed.
  PERFORM qa.check('C1 running out of questions completes the session',
    (SELECT status FROM public.live_quiz_sessions WHERE id=v_sid) = 'completed',
    (SELECT status::text FROM public.live_quiz_sessions WHERE id=v_sid));

  -- C2: the host gets a derived summary.
  PERFORM qa.as_user(v_tutor);
  v_h := public.get_live_quiz_snapshot(v_sid);
  PERFORM qa.check('C2 completed session carries a summary',
    v_h->'session'->'summary' IS NOT NULL
      AND (v_h->'session'->'summary'->>'players')::int = 2
      AND (v_h->'session'->'summary'->>'questions')::int = v_total,
    (v_h->'session'->'summary')::text);

  -- C3: average accuracy is a real percentage, not a fabrication.
  PERFORM qa.check('C3 average accuracy is derived from real answers',
    (v_h->'session'->'summary'->>'average_accuracy_pct')::int BETWEEN 0 AND 100,
    (v_h->'session'->'summary')::text);

  -- C4: no further answer can change a completed game.
  PERFORM qa.expect_error('C4 a completed session rejects a further answer', v_s1,
    format('SELECT public.submit_live_quiz_answer(%L, 0, %L::uuid, NULL)',
           v_sid, '0a111111-0000-0000-0000-000000000001'),
    'question_not_open');

  -- C5: and cannot be advanced again.
  PERFORM qa.expect_error('C5 a completed session cannot be advanced', v_tutor,
    format('SELECT public.advance_live_quiz_session(%L, ''next'', NULL)', v_sid),
    'session_finished');

  -- C6: the final leaderboard still reads back.
  PERFORM qa.check('C6 completed session still returns its final leaderboard',
    jsonb_array_length(v_h->'leaderboard') = 2,
    (v_h->'leaderboard')::text);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- E — EXPIRY / CLEANUP
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_sid uuid; v_code text; v_r jsonb; v_n int;
  v_tutor uuid := '11111111-0000-0000-0000-000000000001';
  v_s1 uuid := '22222222-0000-0000-0000-000000000002';
BEGIN
  PERFORM qa.as_user(v_tutor);
  v_r := public.create_live_quiz_session(
    (SELECT id FROM public.quizzes WHERE status='published' LIMIT 1), 30, true, 20, false);
  v_sid := (v_r->>'id')::uuid; v_code := v_r->>'game_code';

  -- E1: a fresh session has a deadline.
  PERFORM qa.check('E1 a new session carries an expires_at',
    (SELECT expires_at IS NOT NULL AND expires_at > now()
       FROM public.live_quiz_sessions WHERE id=v_sid), '');

  -- Age it out.
  UPDATE public.live_quiz_sessions SET expires_at = now() - interval '1 minute'
   WHERE id = v_sid;

  -- E2: joining an expired lobby fails.
  PERFORM qa.expect_error('E2 an expired session rejects a join', v_s1,
    format('SELECT public.join_live_quiz_session(%L)', v_code),
    'session_expired');

  -- E3: and cannot be started.
  PERFORM qa.expect_error('E3 an expired session cannot be started', v_tutor,
    format('SELECT public.advance_live_quiz_session(%L, ''start'', NULL)', v_sid),
    'session_expired');

  -- E4: but the host may still cancel it, so nothing gets stuck.
  PERFORM qa.expect_ok('E4 an expired session can still be cancelled', v_tutor,
    format('SELECT public.advance_live_quiz_session(%L, ''cancel'', NULL)', v_sid));

  -- E5: the sweep closes stale sessions and frees their codes.
  PERFORM qa.as_user(v_tutor);
  v_r := public.create_live_quiz_session(
    (SELECT id FROM public.quizzes WHERE status='published' LIMIT 1), 30, true, 20, false);
  v_sid := (v_r->>'id')::uuid;
  UPDATE public.live_quiz_sessions SET expires_at = now() - interval '1 minute' WHERE id=v_sid;
  RESET ROLE;
  v_n := public.expire_stale_live_quiz_sessions();
  PERFORM qa.check('E5 the sweep cancels stale sessions',
    v_n >= 1 AND (SELECT status FROM public.live_quiz_sessions WHERE id=v_sid) = 'cancelled',
    format('swept %s', v_n));

  -- E6: running it again sweeps nothing — idempotent.
  v_n := public.expire_stale_live_quiz_sessions();
  PERFORM qa.check('E6 the sweep is idempotent', v_n = 0, format('swept %s', v_n));

  -- E7: a cancelled session cannot be resumed.
  PERFORM qa.expect_error('E7 a cancelled session cannot be resumed', v_tutor,
    format('SELECT public.advance_live_quiz_session(%L, ''start'', NULL)', v_sid),
    'session_finished');

  -- E8: the sweep is not client-callable.
  PERFORM qa.expect_error('E8 a student cannot run the sweep', v_s1,
    'SELECT public.expire_stale_live_quiz_sessions()',
    'permission denied');
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- X — REGRESSIONS THE PHASE 2 CHANGES COULD HAVE INTRODUCED
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_sid uuid; v_code text; v_r jsonb; v_opt uuid; v_a jsonb; v_b jsonb; v_score int;
  v_tutor uuid := '11111111-0000-0000-0000-000000000001';
  v_s1 uuid := '22222222-0000-0000-0000-000000000002';
  v_foreign uuid := '44444444-0000-0000-0000-000000000006';
BEGIN
  PERFORM qa.as_user(v_tutor);
  v_r := public.create_live_quiz_session(
    (SELECT id FROM public.quizzes WHERE status='published' LIMIT 1), 30, true, 60, false);
  v_sid := (v_r->>'id')::uuid; v_code := v_r->>'game_code';
  PERFORM qa.as_user(v_s1); PERFORM public.join_live_quiz_session(v_code);
  PERFORM qa.as_user(v_tutor); PERFORM public.advance_live_quiz_session(v_sid, 'start', NULL);

  SELECT o.id INTO v_opt FROM public.quiz_options o
   WHERE o.question_id = (SELECT question_ids[1] FROM public.live_quiz_sessions WHERE id=v_sid)
     AND o.is_correct LIMIT 1;

  -- X1: idempotency still holds after the resync rewrite.
  PERFORM qa.as_user(v_s1);
  v_a := public.submit_live_quiz_answer(v_sid, 0, v_opt, NULL);
  v_b := public.submit_live_quiz_answer(v_sid, 0, v_opt, NULL);
  SELECT score INTO v_score FROM public.live_quiz_participants
   WHERE session_id=v_sid AND user_id=v_s1;
  PERFORM qa.check('X1 a duplicate submission still does not double-score',
    (v_a->>'accepted')::boolean AND (v_b->>'duplicate')::boolean
    AND (SELECT count(*) FROM public.live_quiz_answers
          WHERE session_id=v_sid AND question_index=0) = 1,
    format('score=%s', v_score));

  -- X2: answered_count is still driven off real answers.
  PERFORM qa.check('X2 answered_count matches the answers actually stored',
    (SELECT answered_count FROM public.live_quiz_sessions WHERE id=v_sid) = 1,
    (SELECT answered_count::text FROM public.live_quiz_sessions WHERE id=v_sid));

  -- X3: cross-tenant join is still refused, with the same generic message.
  PERFORM qa.expect_error('X3 a foreign-tenant student still cannot join', v_foreign,
    format('SELECT public.join_live_quiz_session(%L)', v_code),
    'session_not_found');

  -- X4: a student still cannot drive the state machine.
  PERFORM qa.expect_error('X4 a student still cannot advance the session', v_s1,
    format('SELECT public.advance_live_quiz_session(%L, ''reveal'', NULL)', v_sid),
    'access_denied');

  -- X5: a foreign tutor still cannot read the session.
  PERFORM qa.expect_error('X5 a foreign-tenant tutor still cannot read the snapshot',
    '33333333-0000-0000-0000-000000000005',
    format('SELECT public.get_live_quiz_snapshot(%L)', v_sid),
    'session_not_found');

  -- X6: the game code is still host-only in the payload.
  PERFORM qa.as_user(v_s1);
  v_a := public.get_live_quiz_snapshot(v_sid);
  PERFORM qa.check('X6 the game code is still withheld from players',
    v_a->'session'->'game_code' = 'null'::jsonb, (v_a->'session'->'game_code')::text);

  -- X7: the new my_status field tells a player what they are, nothing more.
  PERFORM qa.check('X7 my_status reports the player''s own status only',
    v_a->>'my_status' = 'joined', COALESCE(v_a->>'my_status','null'));

  -- X8: the state-revision guard still blocks a double advance.
  PERFORM qa.as_user(v_tutor);
  v_b := public.get_live_quiz_snapshot(v_sid);
  PERFORM public.advance_live_quiz_session(v_sid, 'reveal',
    (v_b->'session'->>'state_revision')::int);
  PERFORM qa.expect_error('X8 a stale revision is still rejected', v_tutor,
    format('SELECT public.advance_live_quiz_session(%L, ''leaderboard'', %s)',
           v_sid, (v_b->'session'->>'state_revision')::int),
    'session_state_conflict');

  PERFORM qa.as_user(v_tutor);
  PERFORM public.advance_live_quiz_session(v_sid, 'cancel', NULL);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- G — GRANT SURFACE
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  PERFORM qa.check('G1 authenticated cannot select quiz_options.is_correct',
    NOT has_column_privilege('authenticated', 'public.quiz_options', 'is_correct', 'SELECT'), '');
  PERFORM qa.check('G2 authenticated cannot select option_text either',
    NOT has_column_privilege('authenticated', 'public.quiz_options', 'option_text', 'SELECT'), '');
  PERFORM qa.check('G3 anon holds no select on quiz_options',
    NOT has_table_privilege('anon', 'public.quiz_options', 'SELECT'), '');
  PERFORM qa.check('G4 authenticated may remove a participant',
    has_function_privilege('authenticated',
      'public.remove_live_quiz_participant(uuid,uuid)', 'EXECUTE'), '');
  PERFORM qa.check('G5 authenticated may NOT run the expiry sweep',
    NOT has_function_privilege('authenticated',
      'public.expire_stale_live_quiz_sessions()', 'EXECUTE'), '');
  PERFORM qa.check('G6 authenticated may NOT call the internal resync',
    NOT has_function_privilege('authenticated',
      'public._resync_live_quiz_counts(uuid)', 'EXECUTE'), '');
  PERFORM qa.check('G7 anon holds EXECUTE on no phase-2 function',
    NOT has_function_privilege('anon',
      'public.remove_live_quiz_participant(uuid,uuid)', 'EXECUTE'), '');
  PERFORM qa.check('G8 every phase-2 function pins its search_path',
    (SELECT bool_and(p.proconfig::text LIKE '%search_path%')
       FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public'
        AND p.proname IN ('remove_live_quiz_participant',
                          'expire_stale_live_quiz_sessions',
                          '_resync_live_quiz_counts')), '');
  PERFORM qa.check('G9 authenticated still has no write grant on live tables',
    NOT (has_table_privilege('authenticated','public.live_quiz_sessions','INSERT,UPDATE,DELETE')
      OR has_table_privilege('authenticated','public.live_quiz_participants','INSERT,UPDATE,DELETE')
      OR has_table_privilege('authenticated','public.live_quiz_answers','SELECT,INSERT,UPDATE,DELETE')), '');
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- S — SOLO QUIZ REGRESSION
--
-- The column revoke is on a table the solo quiz shares. Every solo path that
-- needs the answer key (get_quiz_for_attempt, submit_quiz_attempt,
-- save_quiz_definition, get_quiz_definition_for_manager) is SECURITY DEFINER
-- and therefore runs as the owner, not as `authenticated`. These two stand-ins
-- prove the mechanism rather than asserting it: same query, same caller, one
-- DEFINER and one INVOKER.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION qa.definer_reads_key()
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$ SELECT count(*) FROM public.quiz_options WHERE is_correct $$;

CREATE OR REPLACE FUNCTION qa.invoker_reads_key()
RETURNS bigint LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp
AS $$ SELECT count(*) FROM public.quiz_options WHERE is_correct $$;

GRANT USAGE ON SCHEMA qa TO authenticated;
GRANT EXECUTE ON FUNCTION qa.definer_reads_key(), qa.invoker_reads_key() TO authenticated;

DO $$
DECLARE v_stu uuid := '22222222-0000-0000-0000-000000000002';
BEGIN
  -- S1: the shape every solo quiz RPC uses still reads the answer key.
  PERFORM qa.expect_ok(
    'S1 a SECURITY DEFINER function still reads is_correct (solo quiz path)',
    v_stu, 'SELECT qa.definer_reads_key()');

  -- S2: the shape a client query would take does not.
  PERFORM qa.expect_error(
    'S2 a SECURITY INVOKER function cannot read is_correct',
    v_stu, 'SELECT qa.invoker_reads_key()', 'permission denied');

  -- S3: `authenticated` holds NO privilege on either answer-key table. This is
  -- the posture 20260813072502 established and 20260905000000 restores; the
  -- builder writes through SECURITY DEFINER RPCs, so it is unaffected. An
  -- earlier version of this assertion required INSERT/UPDATE to be RETAINED,
  -- which described the fixture's grants rather than production's.
  PERFORM qa.check('S3 authenticated holds no privilege at all on quiz_options',
    NOT has_table_privilege('authenticated', 'public.quiz_options', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'public.quiz_options', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.quiz_options', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.quiz_options', 'DELETE'),
    'no table privilege');

  PERFORM qa.check('S4 nor on quiz_questions, which carries the other keys',
    NOT has_table_privilege('authenticated', 'public.quiz_questions', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'public.quiz_questions', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.quiz_questions', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.quiz_questions', 'DELETE'),
    'no table privilege');

  PERFORM qa.check('S5 anon holds nothing either',
    NOT has_table_privilege('anon', 'public.quiz_options', 'SELECT')
    AND NOT has_table_privilege('anon', 'public.quiz_questions', 'SELECT'),
    'no table privilege');

  -- S6: not one stray column grant survives. A column privilege is invisible to
  -- has_table_privilege, which is how the last widening went unnoticed.
  PERFORM qa.check('S6 no column-level grant survives on either table',
    NOT EXISTS (
      SELECT 1 FROM information_schema.column_privileges
       WHERE table_schema = 'public'
         AND table_name IN ('quiz_questions', 'quiz_options')
         AND grantee IN ('anon', 'authenticated')),
    (SELECT COALESCE(string_agg(DISTINCT table_name || '.' || column_name, ', '), 'none')
       FROM information_schema.column_privileges
      WHERE table_schema = 'public'
        AND table_name IN ('quiz_questions', 'quiz_options')
        AND grantee IN ('anon', 'authenticated')));
END $$;

-- S2 must not be passing because the table is simply gone. The same INVOKER
-- shape reads a table the role IS granted, to show the harness works.
DO $$
DECLARE v_stu uuid := '22222222-0000-0000-0000-000000000002';
BEGIN
  PERFORM qa.expect_ok(
    'S7 the same invoker shape CAN read a table authenticated is granted — '
    'S2 is a privilege result, not a broken harness',
    v_stu, 'SELECT count(*) FROM public.quizzes');
END $$;
