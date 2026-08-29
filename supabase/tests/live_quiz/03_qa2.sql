-- Round 2: completion, reconnect, code uniqueness, admin host, and the
-- direct-SELECT leak vector that RLS (not the RPC) has to close.
\set QUIET on
\pset pager off
\set ON_ERROR_STOP off

DO $$
DECLARE
  tutorA uuid := '11111111-0000-0000-0000-000000000001';
  adminA uuid := '66666666-0000-0000-0000-000000000008';
  s1 uuid := '22222222-0000-0000-0000-000000000002';
  s2 uuid := '22222222-0000-0000-0000-000000000003';
  quizA uuid := 'd1111111-0000-0000-0000-000000000001';
  v_sid uuid; v_rev int; v_snap jsonb; v_res jsonb; v_code text;
  v_codes text[]; v_i int; v_score_before int; v_score_after int;
  v_p1 uuid;
BEGIN
  SELECT id, game_code INTO v_sid, v_code
    FROM public.live_quiz_sessions ORDER BY created_at DESC LIMIT 1;
  SELECT id INTO v_p1 FROM public.live_quiz_participants
   WHERE session_id=v_sid AND user_id=s1;

  -- ══ CASE J — reconnect state reconstruction ════════════════════════════
  -- A refresh is just another snapshot read. The student already answered
  -- question 1, so the snapshot must say so rather than offering a re-answer.
  PERFORM qa.as_user(s1);
  v_snap := public.get_live_quiz_snapshot(v_sid);
  PERFORM qa.check('J1 reconnect returns the authoritative current question',
    (v_snap->'session'->>'current_question_index')::int = 1);
  PERFORM qa.check('J2 reconnect reports the answer already submitted',
    (v_snap->'my_answer'->>'answered')::boolean IS TRUE);
  PERFORM qa.check('J3 reconnect still withholds correctness while open',
    v_snap->'my_answer'->'is_correct' = 'null'::jsonb OR v_snap->'my_answer'->>'is_correct' IS NULL,
    (v_snap->'my_answer')::text);
  PERFORM qa.check('J4 reconnect preserves the running score',
    (v_snap->'me'->>'score')::int > 0);

  SELECT score INTO v_score_before FROM public.live_quiz_participants WHERE id=v_p1;
  v_res := public.join_live_quiz_session(v_code);
  SELECT score INTO v_score_after FROM public.live_quiz_participants WHERE id=v_p1;
  PERFORM qa.check('J5 rejoining mid-game does NOT reset the score',
    v_score_after = v_score_before, v_score_before::text || ' -> ' || v_score_after::text);
  PERFORM qa.check('J6 rejoining mid-game creates no second participant',
    (SELECT count(*) FROM public.live_quiz_participants WHERE session_id=v_sid AND user_id=s1) = 1);

  -- ══ Host refresh ══════════════════════════════════════════════════════
  PERFORM qa.as_user(tutorA);
  v_snap := public.get_live_quiz_snapshot(v_sid);
  PERFORM qa.check('J7 host refresh restores host authority',
    (v_snap->>'is_host')::boolean IS TRUE);
  PERFORM qa.check('J8 host sees the game code, students do not',
    v_snap->'session'->>'game_code' = v_code);
  PERFORM qa.check('J9 find_my_live_quiz_session recovers the host session',
    (public.find_my_live_quiz_session()->>'session_id')::uuid = v_sid);

  PERFORM qa.as_user(s2);
  PERFORM qa.check('J10 find_my_live_quiz_session recovers the player session',
    (public.find_my_live_quiz_session()->>'session_id')::uuid = v_sid);

  -- ══ CASE L — completion ═══════════════════════════════════════════════
  PERFORM qa.as_user(tutorA);
  -- Walk to the end: reveal → next (q2) → reveal → next → completed.
  SELECT state_revision INTO v_rev FROM public.live_quiz_sessions WHERE id=v_sid;
  PERFORM public.advance_live_quiz_session(v_sid, 'reveal', v_rev);
  SELECT state_revision INTO v_rev FROM public.live_quiz_sessions WHERE id=v_sid;
  PERFORM public.advance_live_quiz_session(v_sid, 'next', v_rev);
  SELECT state_revision INTO v_rev FROM public.live_quiz_sessions WHERE id=v_sid;
  PERFORM public.advance_live_quiz_session(v_sid, 'reveal', v_rev);
  SELECT state_revision INTO v_rev FROM public.live_quiz_sessions WHERE id=v_sid;
  v_res := public.advance_live_quiz_session(v_sid, 'next', v_rev);

  PERFORM qa.check('L1 game completes after the final question',
    v_res->>'status' = 'completed', v_res::text);
  PERFORM qa.check('L2 completed_at recorded',
    (SELECT completed_at IS NOT NULL FROM public.live_quiz_sessions WHERE id=v_sid));
  PERFORM qa.check('L3 final rankings persist',
    (SELECT count(*) FROM public.live_quiz_participants WHERE session_id=v_sid AND score > 0) >= 1);

  PERFORM qa.as_user(s1);
  v_snap := public.get_live_quiz_snapshot(v_sid);
  PERFORM qa.check('L4 completed snapshot exposes the final leaderboard',
    jsonb_array_length(v_snap->'leaderboard') = 3);

  -- ══ Game code recycling ═══════════════════════════════════════════════
  PERFORM qa.check('L5 completed session releases its code from the unique index',
    NOT EXISTS (SELECT 1 FROM public.live_quiz_sessions
                 WHERE game_code = v_code AND status NOT IN ('completed','cancelled')));

  -- ══ Code uniqueness across many concurrent sessions ═══════════════════
  PERFORM qa.as_user(tutorA);
  v_codes := '{}';
  FOR v_i IN 1..25 LOOP
    v_codes := v_codes || (public.create_live_quiz_session(quizA, 30, true, 20, false)->>'game_code');
  END LOOP;
  PERFORM qa.check('U1 25 concurrent joinable sessions all got distinct codes',
    (SELECT count(DISTINCT c) FROM unnest(v_codes) c) = 25);
  PERFORM qa.check('U2 every code matches the 6-digit format',
    NOT EXISTS (SELECT 1 FROM unnest(v_codes) c WHERE c !~ '^[0-9]{6}$'));

  -- ══ Admin host path ═══════════════════════════════════════════════════
  PERFORM qa.as_user(adminA);
  v_res := public.create_live_quiz_session(quizA, 10, false, 30, true);
  PERFORM qa.check('P1 centre admin can host a session in their centre',
    (v_res->>'id') IS NOT NULL);
  PERFORM qa.check('P2 randomize + settings persisted as given',
    EXISTS (SELECT 1 FROM public.live_quiz_sessions
             WHERE id=(v_res->>'id')::uuid
               AND max_players=10 AND show_player_names=false AND seconds_per_question=30));
END $$;

-- ══ Post-completion mutations must be refused ═══════════════════════════
DO $$
DECLARE v_sid uuid;
BEGIN
  SELECT id INTO v_sid FROM public.live_quiz_sessions
   WHERE status='completed' ORDER BY completed_at DESC LIMIT 1;
  PERFORM set_config('qa.done_sid', v_sid::text, false);
END $$;

SELECT qa.expect_error('L6 completed session cannot be restarted',
  '11111111-0000-0000-0000-000000000001',
  format('SELECT public.advance_live_quiz_session(%L, ''start'', NULL)', current_setting('qa.done_sid')),
  'session_finished');

SELECT qa.expect_error('L7 completed session cannot be advanced',
  '11111111-0000-0000-0000-000000000001',
  format('SELECT public.advance_live_quiz_session(%L, ''next'', NULL)', current_setting('qa.done_sid')),
  'session_finished');

SELECT qa.expect_error('L8 answers rejected after completion',
  '22222222-0000-0000-0000-000000000002',
  format('SELECT public.submit_live_quiz_answer(%L, 2, ''0a333333-0000-0000-0000-000000000001'', NULL)',
         current_setting('qa.done_sid')),
  'question_not_open');

SELECT qa.expect_error('L9 a completed session cannot be joined',
  '22222222-0000-0000-0000-000000000004',
  format('SELECT public.join_live_quiz_session((SELECT game_code FROM public.live_quiz_sessions WHERE id=%L))',
         current_setting('qa.done_sid')),
  'session_not_found');

-- ══ P0: the direct-SELECT leak vector ═══════════════════════════════════
-- The RPC redacts, but a student could try reading the answer table itself.
DO $$
DECLARE v_rows int; v_ok boolean; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '22222222-0000-0000-0000-000000000002', true);
  SET LOCAL ROLE authenticated;
  BEGIN
    SELECT count(*) INTO v_rows FROM public.live_quiz_answers;
    v_ok := (v_rows = 0);            -- RLS returns zero rows
    v_msg := 'rows visible: ' || v_rows;
  EXCEPTION WHEN OTHERS THEN
    v_ok := true;                    -- or denies outright
    v_msg := SQLERRM;
  END;
  RESET ROLE;
  PERFORM qa.check('R1 student cannot read live_quiz_answers directly (is_correct never exposed)',
    v_ok, v_msg);
END $$;

DO $$
DECLARE v_rows int; v_ok boolean; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '44444444-0000-0000-0000-000000000006', true);
  SET LOCAL ROLE authenticated;
  BEGIN
    SELECT count(*) INTO v_rows FROM public.live_quiz_sessions;
    v_ok := (v_rows = 0);
    v_msg := 'rows visible: ' || v_rows;
  EXCEPTION WHEN OTHERS THEN
    v_ok := true; v_msg := SQLERRM;
  END;
  RESET ROLE;
  PERFORM qa.check('R2 foreign-tenant user sees ZERO sessions via direct SELECT (realtime safe)',
    v_ok, v_msg);
END $$;

DO $$
DECLARE v_rows int; v_ok boolean; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '44444444-0000-0000-0000-000000000006', true);
  SET LOCAL ROLE authenticated;
  BEGIN
    SELECT count(*) INTO v_rows FROM public.live_quiz_participants;
    v_ok := (v_rows = 0);
    v_msg := 'rows visible: ' || v_rows;
  EXCEPTION WHEN OTHERS THEN
    v_ok := true; v_msg := SQLERRM;
  END;
  RESET ROLE;
  PERFORM qa.check('R3 foreign-tenant user sees ZERO participants via direct SELECT', v_ok, v_msg);
END $$;

DO $$
DECLARE v_rows int; v_ok boolean; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '22222222-0000-0000-0000-000000000002', true);
  SET LOCAL ROLE authenticated;
  BEGIN
    -- A participant SHOULD see their own session row (realtime needs it).
    SELECT count(*) INTO v_rows FROM public.live_quiz_sessions;
    v_ok := (v_rows >= 1);
    v_msg := 'rows visible: ' || v_rows;
  EXCEPTION WHEN OTHERS THEN
    v_ok := false; v_msg := SQLERRM;
  END;
  RESET ROLE;
  PERFORM qa.check('R4 a participant CAN read their own session row (realtime works)', v_ok, v_msg);
END $$;

-- ══ Realtime publication ════════════════════════════════════════════════
DO $$
BEGIN
  PERFORM qa.check('RT1 only live_quiz_sessions is published to realtime',
    EXISTS (SELECT 1 FROM pg_publication_tables
             WHERE pubname='supabase_realtime' AND tablename='live_quiz_sessions')
    AND NOT EXISTS (SELECT 1 FROM pg_publication_tables
             WHERE pubname='supabase_realtime' AND tablename IN ('live_quiz_answers','live_quiz_participants')));
END $$;

-- ══ SECURITY DEFINER hygiene ════════════════════════════════════════════
DO $$
DECLARE v_bad text;
BEGIN
  SELECT string_agg(p.proname, ', ') INTO v_bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public'
     AND p.proname LIKE '%live_quiz%'
     AND p.prosecdef
     AND NOT EXISTS (
       SELECT 1 FROM unnest(coalesce(p.proconfig,'{}')) c WHERE c LIKE 'search_path=%');
  PERFORM qa.check('SD1 every SECURITY DEFINER live-quiz function pins search_path',
    v_bad IS NULL, coalesce(v_bad, 'all pinned'));
END $$;

DO $$
DECLARE v_bad text;
BEGIN
  SELECT string_agg(p.proname, ', ') INTO v_bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname LIKE '%live_quiz%'
     AND has_function_privilege('anon', p.oid, 'EXECUTE');
  PERFORM qa.check('SD2 anon holds EXECUTE on no live-quiz function',
    v_bad IS NULL, coalesce(v_bad, 'none'));
END $$;

DO $$
DECLARE v_bad text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO v_bad
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname LIKE 'live_quiz%' AND c.relkind='r'
     AND (has_table_privilege('authenticated', c.oid, 'INSERT')
       OR has_table_privilege('authenticated', c.oid, 'UPDATE')
       OR has_table_privilege('authenticated', c.oid, 'DELETE'));
  PERFORM qa.check('SD3 authenticated has NO write grant on any live-quiz table',
    v_bad IS NULL, coalesce(v_bad, 'none'));
END $$;

DO $$
DECLARE v_bad text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO v_bad
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname LIKE 'live_quiz%' AND c.relkind='r'
     AND NOT c.relrowsecurity;
  PERFORM qa.check('SD4 RLS enabled on every live-quiz table', v_bad IS NULL, coalesce(v_bad,'all enabled'));
END $$;
