-- ═══════════════════════════════════════════════════════════════════════════
-- Live multiplayer QA against a real Postgres, under real RLS.
-- Every check runs as a real role (`authenticated`) with a real auth.uid().
-- ═══════════════════════════════════════════════════════════════════════════
\set QUIET on
\pset pager off
\set ON_ERROR_STOP off

CREATE SCHEMA IF NOT EXISTS qa;

CREATE TABLE IF NOT EXISTS qa.results (
  n serial PRIMARY KEY, label text, ok boolean, detail text
);
TRUNCATE qa.results;

CREATE OR REPLACE FUNCTION qa.check(_label text, _ok boolean, _detail text DEFAULT '')
RETURNS void LANGUAGE sql AS $$
  INSERT INTO qa.results (label, ok, detail) VALUES (_label, _ok, _detail);
$$;

-- Run `_sql` as `_uid` under the authenticated role, and record whether it
-- raised. This is how "an attacker calls the RPC directly" is expressed.
CREATE OR REPLACE FUNCTION qa.expect_error(_label text, _uid uuid, _sql text, _expect text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_msg text; v_ok boolean := false;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', _uid::text, true);
    SET LOCAL ROLE authenticated;
    EXECUTE _sql;
    v_msg := '(no error raised)';
  EXCEPTION WHEN OTHERS THEN
    v_msg := SQLERRM;
    v_ok := position(_expect in SQLERRM) > 0;
  END;
  RESET ROLE;
  PERFORM qa.check(_label, v_ok, v_msg);
END $$;

CREATE OR REPLACE FUNCTION qa.as_user(_uid uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _uid::text, true);
END $$;

-- ── Actors ─────────────────────────────────────────────────────────────────
\set tutorA   '''11111111-0000-0000-0000-000000000001'''
\set s1       '''22222222-0000-0000-0000-000000000002'''
\set s2       '''22222222-0000-0000-0000-000000000003'''
\set s3       '''22222222-0000-0000-0000-000000000004'''
\set tutorB   '''33333333-0000-0000-0000-000000000005'''
\set studentB '''44444444-0000-0000-0000-000000000006'''
\set unenrol  '''55555555-0000-0000-0000-000000000007'''
\set adminA   '''66666666-0000-0000-0000-000000000008'''
\set quizA    '''d1111111-0000-0000-0000-000000000001'''
\set quizB    '''d2222222-0000-0000-0000-000000000002'''

DO $$
DECLARE
  tutorA uuid := '11111111-0000-0000-0000-000000000001';
  s1 uuid := '22222222-0000-0000-0000-000000000002';
  s2 uuid := '22222222-0000-0000-0000-000000000003';
  s3 uuid := '22222222-0000-0000-0000-000000000004';
  tutorB uuid := '33333333-0000-0000-0000-000000000005';
  studentB uuid := '44444444-0000-0000-0000-000000000006';
  unenrol uuid := '55555555-0000-0000-0000-000000000007';
  adminA uuid := '66666666-0000-0000-0000-000000000008';
  quizA uuid := 'd1111111-0000-0000-0000-000000000001';

  v_res jsonb; v_sid uuid; v_code text; v_snap jsonb;
  v_p1 uuid; v_p2 uuid; v_p3 uuid;
  v_score int; v_score2 int; v_rows int; v_rev int;
  v_opt_correct uuid := '0a111111-0000-0000-0000-000000000001';
  v_opt_wrong   uuid := '0a111111-0000-0000-0000-000000000002';
  v_opt_foreign uuid := '0b111111-0000-0000-0000-000000000001';
BEGIN
  -- ══ CASE A — create session ════════════════════════════════════════════
  PERFORM qa.as_user(tutorA);
  v_res := public.create_live_quiz_session(quizA, 30, true, 20, false);
  v_sid := (v_res->>'id')::uuid;
  v_code := v_res->>'game_code';

  PERFORM qa.check('A1 tutor creates a session', v_sid IS NOT NULL);
  PERFORM qa.check('A2 game code is 6 digits', v_code ~ '^[0-9]{6}$', v_code);
  PERFORM qa.check('A3 session inherits centre + class from the quiz, not the client',
    EXISTS (SELECT 1 FROM public.live_quiz_sessions
             WHERE id=v_sid
               AND center_id='aaaaaaaa-0000-0000-0000-000000000001'
               AND class_id='c1111111-0000-0000-0000-000000000001'
               AND quiz_id=quizA));
  PERFORM qa.check('A4 question order frozen onto the session (3 questions)',
    (SELECT array_length(question_ids,1) FROM public.live_quiz_sessions WHERE id=v_sid) = 3);
  PERFORM qa.check('A5 starts in lobby at index -1',
    EXISTS (SELECT 1 FROM public.live_quiz_sessions
             WHERE id=v_sid AND status='lobby' AND current_question_index=-1));

  -- ══ CASE B — join ══════════════════════════════════════════════════════
  PERFORM qa.as_user(s1);
  v_res := public.join_live_quiz_session(v_code);
  v_p1 := (v_res->>'participant_id')::uuid;
  PERFORM qa.check('B1 enrolled student joins with a valid code', v_p1 IS NOT NULL);

  -- Duplicate join must be idempotent.
  v_res := public.join_live_quiz_session(v_code);
  PERFORM qa.check('B2 duplicate join returns the SAME participant row',
    (v_res->>'participant_id')::uuid = v_p1 AND (v_res->>'rejoined')::boolean);
  PERFORM qa.check('B3 duplicate join creates no second row',
    (SELECT count(*) FROM public.live_quiz_participants
      WHERE session_id=v_sid AND user_id=s1) = 1);

  PERFORM qa.as_user(s2);
  v_p2 := (public.join_live_quiz_session(v_code)->>'participant_id')::uuid;
  PERFORM qa.as_user(s3);
  v_p3 := (public.join_live_quiz_session(v_code)->>'participant_id')::uuid;

  PERFORM qa.check('B4 three participants present',
    (SELECT count(*) FROM public.live_quiz_participants WHERE session_id=v_sid) = 3);
  PERFORM qa.check('B5 participant_count denormalised for realtime',
    (SELECT participant_count FROM public.live_quiz_sessions WHERE id=v_sid) = 3);

  -- ══ CASE D — start ═════════════════════════════════════════════════════
  PERFORM qa.as_user(tutorA);
  SELECT state_revision INTO v_rev FROM public.live_quiz_sessions WHERE id=v_sid;
  PERFORM public.advance_live_quiz_session(v_sid, 'start', v_rev);
  PERFORM qa.check('D1 host starts the game → question_open at index 0',
    EXISTS (SELECT 1 FROM public.live_quiz_sessions
             WHERE id=v_sid AND status='question_open' AND current_question_index=0));
  PERFORM qa.check('D2 question window has server timestamps',
    EXISTS (SELECT 1 FROM public.live_quiz_sessions
             WHERE id=v_sid AND question_started_at IS NOT NULL AND question_ends_at IS NOT NULL));

  -- ══ CASE E — redaction while the question is open ══════════════════════
  PERFORM qa.as_user(s1);
  v_snap := public.get_live_quiz_snapshot(v_sid);
  PERFORM qa.check('E1 student sees the open question',
    v_snap->'question'->>'question' = 'What is the main pigment used in photosynthesis?');
  PERFORM qa.check('E2 NO option carries is_correct before reveal',
    NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_snap->'question'->'options') o
       WHERE o->'is_correct' <> 'null'::jsonb),
    v_snap->'question'->>'options');
  PERFORM qa.check('E3 explanation withheld before reveal',
    v_snap->'question'->>'explanation' IS NULL);
  PERFORM qa.check('E4 game code withheld from students',
    v_snap->'session'->>'game_code' IS NULL);
  PERFORM qa.check('E5 no future question is exposed',
    v_snap->'question'->>'id' = 'e1111111-0000-0000-0000-000000000001');

  -- ══ CASE F/G — answering + scoring ═════════════════════════════════════
  PERFORM qa.as_user(s1);
  v_res := public.submit_live_quiz_answer(v_sid, 0, v_opt_correct, NULL);
  PERFORM qa.check('F1 correct answer accepted', (v_res->>'accepted')::boolean);
  PERFORM qa.check('F2 submit response does NOT leak correctness',
    NOT (v_res ? 'is_correct') AND NOT (v_res ? 'points_awarded'), v_res::text);

  SELECT score INTO v_score FROM public.live_quiz_participants WHERE id=v_p1;
  PERFORM qa.check('G1 server awarded points for a correct answer (>=100)', v_score >= 100, v_score::text);
  PERFORM qa.check('G2 speed bonus capped at 1.5x base', v_score <= 150, v_score::text);

  -- Duplicate submission must not score twice.
  v_res := public.submit_live_quiz_answer(v_sid, 0, v_opt_correct, NULL);
  SELECT score INTO v_score2 FROM public.live_quiz_participants WHERE id=v_p1;
  PERFORM qa.check('F3 duplicate answer reported as duplicate', (v_res->>'duplicate')::boolean);
  PERFORM qa.check('F4 duplicate answer does NOT score twice', v_score2 = v_score,
    v_score::text || ' -> ' || v_score2::text);
  PERFORM qa.check('F5 duplicate answer creates no second row',
    (SELECT count(*) FROM public.live_quiz_answers
      WHERE participant_id=v_p1 AND question_index=0) = 1);

  PERFORM qa.as_user(s2);
  PERFORM public.submit_live_quiz_answer(v_sid, 0, v_opt_wrong, NULL);
  PERFORM qa.check('G3 incorrect answer scores zero',
    (SELECT score FROM public.live_quiz_participants WHERE id=v_p2) = 0);
  PERFORM qa.check('G4 incorrect answer resets streak',
    (SELECT streak FROM public.live_quiz_participants WHERE id=v_p2) = 0);

  PERFORM qa.as_user(s3);
  PERFORM public.submit_live_quiz_answer(v_sid, 0, v_opt_correct, NULL);

  PERFORM qa.check('F6 answered_count tracks submissions',
    (SELECT answered_count FROM public.live_quiz_sessions WHERE id=v_sid) = 3);

  -- ══ CASE E cont. — reveal ══════════════════════════════════════════════
  PERFORM qa.as_user(tutorA);
  SELECT state_revision INTO v_rev FROM public.live_quiz_sessions WHERE id=v_sid;
  PERFORM public.advance_live_quiz_session(v_sid, 'reveal', v_rev);

  PERFORM qa.as_user(s1);
  v_snap := public.get_live_quiz_snapshot(v_sid);
  PERFORM qa.check('E6 correctness appears ONLY after reveal',
    EXISTS (SELECT 1 FROM jsonb_array_elements(v_snap->'question'->'options') o
             WHERE (o->>'is_correct')::boolean IS TRUE));
  PERFORM qa.check('E7 explanation appears after reveal',
    v_snap->'question'->>'explanation' = 'Chlorophyll captures light energy.');
  PERFORM qa.check('E8 own result revealed after reveal',
    (v_snap->'my_answer'->>'is_correct')::boolean IS TRUE);

  -- ══ CASE H — leaderboard ═══════════════════════════════════════════════
  PERFORM qa.check('H1 leaderboard ranks by score, computed server-side',
    (SELECT (l->>'rank')::int FROM jsonb_array_elements(v_snap->'leaderboard') l
      WHERE (l->>'is_me')::boolean) <= 2);
  PERFORM qa.check('H2 leaderboard ordering is monotonic',
    NOT EXISTS (
      SELECT 1 FROM (
        SELECT (l->>'rank')::int r, (l->>'score')::int sc,
               lag((l->>'score')::int) OVER (ORDER BY (l->>'rank')::int) prev
          FROM jsonb_array_elements(v_snap->'leaderboard') l
      ) t WHERE prev IS NOT NULL AND sc > prev));

  -- ══ CASE I — advance, late answers rejected ════════════════════════════
  PERFORM qa.as_user(tutorA);
  SELECT state_revision INTO v_rev FROM public.live_quiz_sessions WHERE id=v_sid;
  PERFORM public.advance_live_quiz_session(v_sid, 'next', v_rev);
  PERFORM qa.check('I1 advancing opens question index 1',
    EXISTS (SELECT 1 FROM public.live_quiz_sessions
             WHERE id=v_sid AND status='question_open' AND current_question_index=1));
  PERFORM qa.check('I2 answered_count resets on the new question',
    (SELECT answered_count FROM public.live_quiz_sessions WHERE id=v_sid) = 0);

  -- true/false path
  PERFORM qa.as_user(s1);
  v_res := public.submit_live_quiz_answer(v_sid, 1, NULL, 'true');
  PERFORM qa.check('F7 true/false answer accepted', (v_res->>'accepted')::boolean);
  PERFORM qa.check('G5 correct true/false scored',
    (SELECT score FROM public.live_quiz_participants WHERE id=v_p1) > v_score);
  PERFORM qa.check('G6 streak increments on consecutive correct',
    (SELECT streak FROM public.live_quiz_participants WHERE id=v_p1) = 2);
END $$;

-- ══ Negative / abuse cases — each must raise ═════════════════════════════
DO $$
DECLARE
  v_sid uuid; v_code text;
  tutorA uuid := '11111111-0000-0000-0000-000000000001';
BEGIN
  SELECT id, game_code INTO v_sid, v_code
    FROM public.live_quiz_sessions ORDER BY created_at DESC LIMIT 1;
  PERFORM set_config('qa.sid', v_sid::text, false);
  PERFORM set_config('qa.code', v_code, false);
END $$;

SELECT qa.expect_error('X1 foreign-tenant student cannot join with a valid code',
  '44444444-0000-0000-0000-000000000006',
  format('SELECT public.join_live_quiz_session(%L)', current_setting('qa.code')),
  'session_not_found');

SELECT qa.expect_error('X2 unenrolled same-centre student cannot join',
  '55555555-0000-0000-0000-000000000007',
  format('SELECT public.join_live_quiz_session(%L)', current_setting('qa.code')),
  'session_not_found');

SELECT qa.expect_error('X3 invalid code rejected with the same generic error',
  '22222222-0000-0000-0000-000000000002',
  'SELECT public.join_live_quiz_session(''000000'')',
  'session_not_found');

SELECT qa.expect_error('X4 malformed code rejected',
  '22222222-0000-0000-0000-000000000002',
  'SELECT public.join_live_quiz_session(''abc'')',
  'session_not_found');

SELECT qa.expect_error('X5 foreign tutor cannot read the session snapshot',
  '33333333-0000-0000-0000-000000000005',
  format('SELECT public.get_live_quiz_snapshot(%L)', current_setting('qa.sid')),
  'session_not_found');

SELECT qa.expect_error('X6 foreign-tenant student cannot read the snapshot',
  '44444444-0000-0000-0000-000000000006',
  format('SELECT public.get_live_quiz_snapshot(%L)', current_setting('qa.sid')),
  'session_not_found');

SELECT qa.expect_error('X7 student cannot advance the game (host action)',
  '22222222-0000-0000-0000-000000000002',
  format('SELECT public.advance_live_quiz_session(%L, ''next'', NULL)', current_setting('qa.sid')),
  'access_denied');

SELECT qa.expect_error('X8 student cannot start the game',
  '22222222-0000-0000-0000-000000000002',
  format('SELECT public.advance_live_quiz_session(%L, ''start'', NULL)', current_setting('qa.sid')),
  'access_denied');

SELECT qa.expect_error('X9 student cannot cancel the session',
  '22222222-0000-0000-0000-000000000002',
  format('SELECT public.advance_live_quiz_session(%L, ''cancel'', NULL)', current_setting('qa.sid')),
  'access_denied');

SELECT qa.expect_error('X10 foreign tutor cannot control the session',
  '33333333-0000-0000-0000-000000000005',
  format('SELECT public.advance_live_quiz_session(%L, ''next'', NULL)', current_setting('qa.sid')),
  'access_denied');

SELECT qa.expect_error('X11 foreign-tenant student cannot submit an answer',
  '44444444-0000-0000-0000-000000000006',
  format('SELECT public.submit_live_quiz_answer(%L, 1, ''0a222222-0000-0000-0000-000000000001'', NULL)',
         current_setting('qa.sid')),
  'not_a_participant');

SELECT qa.expect_error('X12 answering a question that is not open is rejected',
  '22222222-0000-0000-0000-000000000003',
  format('SELECT public.submit_live_quiz_answer(%L, 0, ''0a111111-0000-0000-0000-000000000001'', NULL)',
         current_setting('qa.sid')),
  'question_not_open');

SELECT qa.expect_error('X13 answering a FUTURE question is rejected',
  '22222222-0000-0000-0000-000000000003',
  format('SELECT public.submit_live_quiz_answer(%L, 2, ''0a333333-0000-0000-0000-000000000001'', NULL)',
         current_setting('qa.sid')),
  'question_not_open');

SELECT qa.expect_error('X14 an option from another question is rejected',
  '22222222-0000-0000-0000-000000000003',
  format('SELECT public.submit_live_quiz_answer(%L, 1, ''0a111111-0000-0000-0000-000000000001'', NULL)',
         current_setting('qa.sid')),
  'invalid_answer');

SELECT qa.expect_error('X15 an option from ANOTHER TENANT is rejected',
  '22222222-0000-0000-0000-000000000003',
  format('SELECT public.submit_live_quiz_answer(%L, 1, ''0b111111-0000-0000-0000-000000000001'', NULL)',
         current_setting('qa.sid')),
  'invalid_answer');

SELECT qa.expect_error('X16 garbage true/false value rejected',
  '22222222-0000-0000-0000-000000000003',
  format('SELECT public.submit_live_quiz_answer(%L, 1, NULL, ''maybe'')', current_setting('qa.sid')),
  'invalid_answer');

SELECT qa.expect_error('X17 tutor cannot host a quiz in another tenant',
  '11111111-0000-0000-0000-000000000001',
  'SELECT public.create_live_quiz_session(''d2222222-0000-0000-0000-000000000002'', 30, true, 20, false)',
  'access_denied');

SELECT qa.expect_error('X18 student cannot create a session',
  '22222222-0000-0000-0000-000000000002',
  'SELECT public.create_live_quiz_session(''d1111111-0000-0000-0000-000000000001'', 30, true, 20, false)',
  'access_denied');

SELECT qa.expect_error('X19 stale state revision rejected (double-advance guard)',
  '11111111-0000-0000-0000-000000000001',
  format('SELECT public.advance_live_quiz_session(%L, ''next'', 0)', current_setting('qa.sid')),
  'session_state_conflict');

SELECT qa.expect_error('X20 illegal transition rejected (start after started)',
  '11111111-0000-0000-0000-000000000001',
  format('SELECT public.advance_live_quiz_session(%L, ''start'', NULL)', current_setting('qa.sid')),
  'invalid_transition');

-- ══ Direct table writes must be impossible under RLS ═════════════════════
SELECT qa.expect_error('X21 student cannot UPDATE their own score directly',
  '22222222-0000-0000-0000-000000000002',
  'UPDATE public.live_quiz_participants SET score = 999999 WHERE user_id = auth.uid()',
  'denied');

SELECT qa.expect_error('X22 student cannot INSERT an answer row directly',
  '22222222-0000-0000-0000-000000000002',
  format('INSERT INTO public.live_quiz_answers (session_id, participant_id, question_id, question_index, is_correct, points_awarded) VALUES (%L, (SELECT id FROM public.live_quiz_participants WHERE user_id=auth.uid() LIMIT 1), ''e1111111-0000-0000-0000-000000000001'', 5, true, 99999)',
         current_setting('qa.sid')),
  'denied');

SELECT qa.expect_error('X23 student cannot UPDATE the session state directly',
  '22222222-0000-0000-0000-000000000002',
  format('UPDATE public.live_quiz_sessions SET status=''completed'' WHERE id=%L', current_setting('qa.sid')),
  'denied');

SELECT qa.expect_error('X24 anon cannot call the join RPC',
  NULL,
  format('SELECT public.join_live_quiz_session(%L)', current_setting('qa.code')),
  'not_authenticated');
