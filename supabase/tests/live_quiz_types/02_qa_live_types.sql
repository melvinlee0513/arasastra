-- Live multiplayer × expanded question types.
--
-- Every assertion runs as a real Supabase role with a real auth.uid() under the
-- real RLS the fixture installs. Nothing is asserted about a mock.
\set QUIET on
\pset pager off
\set ON_ERROR_STOP off

CREATE SCHEMA IF NOT EXISTS qa;
CREATE TABLE IF NOT EXISTS qa.results (n serial PRIMARY KEY, label text, ok boolean, detail text);
TRUNCATE qa.results;

CREATE OR REPLACE FUNCTION qa.check(_label text, _ok boolean, _detail text DEFAULT '')
RETURNS void LANGUAGE sql AS $$
  INSERT INTO qa.results (label, ok, detail) VALUES (_label, _ok, _detail) $$;

CREATE OR REPLACE FUNCTION qa.as_user(_uid uuid) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  PERFORM set_config('request.jwt.claim.sub', _uid::text, true); END $$;

CREATE OR REPLACE FUNCTION qa.expect_error(_label text, _uid uuid, _sql text, _expect text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_msg text; v_ok boolean := false;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', _uid::text, true);
    SET LOCAL ROLE authenticated;
    EXECUTE _sql;
    v_msg := '(no error raised)';
  EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM; v_ok := position(_expect in SQLERRM) > 0;
  END;
  RESET ROLE;
  PERFORM qa.check(_label, v_ok, v_msg);
END $$;

-- Session ids reused across blocks. Readable by `authenticated` so an
-- expect_error body can look one up while impersonating a student; nothing in
-- this suite asserts anything about the qa schema itself.
CREATE TABLE IF NOT EXISTS qa.ctx (k text PRIMARY KEY, v uuid, s text);
GRANT USAGE ON SCHEMA qa TO authenticated;
GRANT SELECT ON qa.ctx TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- A — HOSTING: the whole quiz is frozen, and an ungradeable type is refused
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_tutor uuid := '11111111-0000-0000-0000-000000000001';
  v_quiz  uuid := 'd1111111-0000-0000-0000-000000000001';
  o jsonb; v_sid uuid; v_ids uuid[];
BEGIN
  PERFORM qa.as_user(v_tutor);
  o := public.create_live_quiz_session(v_quiz, 30, true, 60, false);
  v_sid := (o->>'id')::uuid;
  INSERT INTO qa.ctx (k, v, s) VALUES ('session', v_sid, o->>'game_code')
    ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, s = EXCLUDED.s;

  SELECT question_ids INTO v_ids FROM public.live_quiz_sessions WHERE id = v_sid;

  PERFORM qa.check('A1 hosting freezes every question, not the mcq subset',
    array_length(v_ids, 1) = 6, COALESCE(array_length(v_ids, 1), 0)::text || ' of 6');

  PERFORM qa.check('A2 the frozen list keeps the tutor''s authored order',
    v_ids = ARRAY['e1111111-0000-0000-0000-000000000001',
                  'e1111111-0000-0000-0000-000000000002',
                  'e1111111-0000-0000-0000-000000000003',
                  'e1111111-0000-0000-0000-000000000004',
                  'e1111111-0000-0000-0000-000000000005',
                  'e1111111-0000-0000-0000-000000000006']::uuid[],
    v_ids::text);

  PERFORM qa.check('A3 every expanded type survives into the live game',
    (SELECT count(DISTINCT question_type) FROM public.quiz_questions
      WHERE id = ANY(v_ids)) = 6,
    (SELECT string_agg(DISTINCT question_type, ',') FROM public.quiz_questions
      WHERE id = ANY(v_ids)));
END $$;

-- A quiz carrying a type with no grading branch must fail AT CREATE TIME, with
-- the offending type named. This is the case the task forbids failing silently.
SELECT qa.expect_error(
  'A4 hosting a quiz with an ungradeable type is refused, not silently trimmed',
  '11111111-0000-0000-0000-000000000001',
  $$SELECT public.create_live_quiz_session('d1111111-0000-0000-0000-000000000002'::uuid)$$,
  'unsupported_live_question_type');

SELECT qa.expect_error(
  'A5 the refusal names the type so the tutor can fix the quiz',
  '11111111-0000-0000-0000-000000000001',
  $$SELECT public.create_live_quiz_session('d1111111-0000-0000-0000-000000000002'::uuid)$$,
  'ordering');

DO $$
BEGIN
  PERFORM qa.check('A6 the refused quiz created no session row',
    NOT EXISTS (SELECT 1 FROM public.live_quiz_sessions
                 WHERE quiz_id = 'd1111111-0000-0000-0000-000000000002'),
    'no orphan session');
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- B — GRADING: each type, right and wrong, live
--
-- Two students play the whole six-question game. Student 1 answers every
-- question correctly; student 2 answers every question wrongly. Nothing about
-- the expected result is read back from the grader.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_tutor uuid := '11111111-0000-0000-0000-000000000001';
  v_s1    uuid := '22222222-0000-0000-0000-000000000002';
  v_s2    uuid := '22222222-0000-0000-0000-000000000003';
  v_sid   uuid;
  v_code  text;
  v_right jsonb[] := ARRAY[
    to_jsonb('0a111111-0000-0000-0000-000000000011'::text),            -- mcq
    to_jsonb('true'::text),                                            -- true_false
    jsonb_build_array('0a111111-0000-0000-0000-000000000031',
                      '0a111111-0000-0000-0000-000000000032'),         -- multiple_select
    to_jsonb('isaac newton'::text),                                    -- short_answer (ignore_case)
    to_jsonb('9.79'::text),                                            -- numeric (within 0.05)
    to_jsonb('Celsius'::text)                                          -- fill_blank (exact)
  ];
  v_wrong jsonb[] := ARRAY[
    to_jsonb('0a111111-0000-0000-0000-000000000012'::text),            -- wrong option
    to_jsonb('false'::text),
    jsonb_build_array('0a111111-0000-0000-0000-000000000031'),         -- partial set: not credit
    to_jsonb('Einstein'::text),
    to_jsonb('9.5'::text),                                             -- outside tolerance
    to_jsonb('celsius'::text)                                          -- exact mode: wrong case
  ];
  v_types text[] := ARRAY['mcq','true_false','multiple_select',
                          'short_answer','numeric','fill_blank'];
  i int;
  r1 jsonb; r2 jsonb;
BEGIN
  SELECT v, s INTO v_sid, v_code FROM qa.ctx WHERE k = 'session';

  PERFORM qa.as_user(v_s1); PERFORM public.join_live_quiz_session(v_code);
  PERFORM qa.as_user(v_s2); PERFORM public.join_live_quiz_session(v_code);

  PERFORM qa.as_user(v_tutor);
  PERFORM public.advance_live_quiz_session(v_sid, 'start');

  FOR i IN 1..6 LOOP
    PERFORM qa.as_user(v_s1);
    r1 := public.submit_live_quiz_answer(v_sid, i - 1, NULL, NULL, v_right[i]);
    PERFORM qa.as_user(v_s2);
    r2 := public.submit_live_quiz_answer(v_sid, i - 1, NULL, NULL, v_wrong[i]);

    PERFORM qa.check(
      format('B%s.a %s — a correct live answer is accepted', i, v_types[i]),
      (r1->>'accepted')::boolean, r1::text);

    PERFORM qa.check(
      format('B%s.b %s — the correct answer scores', i, v_types[i]),
      (SELECT is_correct AND points_awarded > 0 FROM public.live_quiz_answers
        WHERE session_id = v_sid AND question_index = i - 1
          AND participant_id = (SELECT id FROM public.live_quiz_participants
                                 WHERE session_id = v_sid AND user_id = v_s1)),
      (SELECT format('is_correct=%s points=%s', is_correct, points_awarded)
         FROM public.live_quiz_answers
        WHERE session_id = v_sid AND question_index = i - 1
          AND participant_id = (SELECT id FROM public.live_quiz_participants
                                 WHERE session_id = v_sid AND user_id = v_s1)));

    PERFORM qa.check(
      format('B%s.c %s — the wrong answer scores nothing', i, v_types[i]),
      (SELECT NOT is_correct AND points_awarded = 0 FROM public.live_quiz_answers
        WHERE session_id = v_sid AND question_index = i - 1
          AND participant_id = (SELECT id FROM public.live_quiz_participants
                                 WHERE session_id = v_sid AND user_id = v_s2)),
      (SELECT format('is_correct=%s points=%s', is_correct, points_awarded)
         FROM public.live_quiz_answers
        WHERE session_id = v_sid AND question_index = i - 1
          AND participant_id = (SELECT id FROM public.live_quiz_participants
                                 WHERE session_id = v_sid AND user_id = v_s2)));

    -- Reveal before advancing, so the distribution assertions in E have a
    -- revealed question to read.
    PERFORM qa.as_user(v_tutor);
    IF i = 3 THEN
      PERFORM public.advance_live_quiz_session(v_sid, 'reveal');
      INSERT INTO qa.ctx (k, v, s) VALUES ('ms_revealed', v_sid, '2')
        ON CONFLICT (k) DO NOTHING;
      -- E reads the multi-select distribution here, mid-game.
      PERFORM qa.check('B-mid multiple_select distribution is available at reveal',
        public.get_live_quiz_snapshot(v_sid) -> 'question_stats' IS NOT NULL, '');
      PERFORM public.advance_live_quiz_session(v_sid, 'next');
    ELSE
      PERFORM public.advance_live_quiz_session(v_sid, 'reveal');
      PERFORM public.advance_live_quiz_session(v_sid, 'next');
    END IF;
  END LOOP;

  PERFORM qa.check('B7 the all-correct player scored on all six questions',
    (SELECT correct_count FROM public.live_quiz_participants
      WHERE session_id = v_sid AND user_id = v_s1) = 6,
    (SELECT correct_count::text FROM public.live_quiz_participants
      WHERE session_id = v_sid AND user_id = v_s1));

  PERFORM qa.check('B8 the all-wrong player scored on none',
    (SELECT correct_count = 0 AND score = 0 FROM public.live_quiz_participants
      WHERE session_id = v_sid AND user_id = v_s2),
    (SELECT format('correct=%s score=%s', correct_count, score)
       FROM public.live_quiz_participants WHERE session_id = v_sid AND user_id = v_s2));

  PERFORM qa.check('B9 the game completed after the sixth question',
    (SELECT status FROM public.live_quiz_sessions WHERE id = v_sid) = 'completed',
    (SELECT status::text FROM public.live_quiz_sessions WHERE id = v_sid));
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- C — LIVE AND SOLO CANNOT DISAGREE
--
-- The live grader now calls `_quiz_answer_is_correct`, the same function the
-- solo grader calls. This replays every answer from B through that function
-- directly and requires the two verdicts to match row for row.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_sid uuid;
  v_mismatch int;
BEGIN
  SELECT v INTO v_sid FROM qa.ctx WHERE k = 'session';

  SELECT count(*) INTO v_mismatch
    FROM public.live_quiz_answers a
    JOIN public.quiz_questions q ON q.id = a.question_id
   WHERE a.session_id = v_sid
     AND a.is_correct IS DISTINCT FROM public._quiz_answer_is_correct(
           a.question_id,
           CASE
             WHEN a.selected_option_id IS NOT NULL THEN to_jsonb(a.selected_option_id::text)
             WHEN q.question_type = 'multiple_select' THEN a.answer_text::jsonb
             ELSE to_jsonb(a.answer_text)
           END);

  PERFORM qa.check('C1 every live verdict matches the shared solo decision',
    v_mismatch = 0, v_mismatch::text || ' mismatched rows');

  PERFORM qa.check('C2 all twelve answers were actually stored',
    (SELECT count(*) FROM public.live_quiz_answers WHERE session_id = v_sid) = 12,
    (SELECT count(*)::text FROM public.live_quiz_answers WHERE session_id = v_sid));
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- D — STORAGE SHAPES
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_sid uuid; v_s1 uuid := '22222222-0000-0000-0000-000000000002'; v_pid uuid;
BEGIN
  SELECT v INTO v_sid FROM qa.ctx WHERE k = 'session';
  SELECT id INTO v_pid FROM public.live_quiz_participants
   WHERE session_id = v_sid AND user_id = v_s1;

  PERFORM qa.check('D1 a single choice keeps using selected_option_id',
    (SELECT selected_option_id = '0a111111-0000-0000-0000-000000000011'
        AND answer_text IS NULL
       FROM public.live_quiz_answers WHERE participant_id = v_pid AND question_index = 0),
    (SELECT format('opt=%s text=%s', selected_option_id, answer_text)
       FROM public.live_quiz_answers WHERE participant_id = v_pid AND question_index = 0));

  PERFORM qa.check('D2 true/false is stored lowercased in answer_text, no option id',
    (SELECT answer_text = 'true' AND selected_option_id IS NULL
       FROM public.live_quiz_answers WHERE participant_id = v_pid AND question_index = 1),
    (SELECT format('opt=%s text=%s', selected_option_id, answer_text)
       FROM public.live_quiz_answers WHERE participant_id = v_pid AND question_index = 1));

  PERFORM qa.check('D3 multiple_select is stored as a JSON array of option ids',
    (SELECT jsonb_typeof(answer_text::jsonb) = 'array'
        AND jsonb_array_length(answer_text::jsonb) = 2
        AND answer_text::jsonb ? '0a111111-0000-0000-0000-000000000031'
       FROM public.live_quiz_answers WHERE participant_id = v_pid AND question_index = 2),
    (SELECT answer_text FROM public.live_quiz_answers
      WHERE participant_id = v_pid AND question_index = 2));

  PERFORM qa.check('D4 a typed answer is stored verbatim, not JSON-quoted',
    (SELECT answer_text = 'isaac newton'
       FROM public.live_quiz_answers WHERE participant_id = v_pid AND question_index = 3),
    (SELECT answer_text FROM public.live_quiz_answers
      WHERE participant_id = v_pid AND question_index = 3));

  PERFORM qa.check('D5 a numeric answer is stored as the plain number the student typed',
    (SELECT answer_text = '9.79'
       FROM public.live_quiz_answers WHERE participant_id = v_pid AND question_index = 4),
    (SELECT answer_text FROM public.live_quiz_answers
      WHERE participant_id = v_pid AND question_index = 4));

  PERFORM qa.check('D6 every answer row points at the frozen question',
    NOT EXISTS (SELECT 1 FROM public.live_quiz_answers a
                 JOIN public.live_quiz_sessions s ON s.id = a.session_id
                WHERE a.session_id = v_sid
                  AND a.question_id IS DISTINCT FROM s.question_ids[a.question_index + 1]),
    'question_id always matches the frozen index');
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- E — HOST RESPONSE DISTRIBUTION
--
-- A second game, held open on the multiple_select question, so the host's
-- distribution can be read while the question is live.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_tutor uuid := '11111111-0000-0000-0000-000000000001';
  v_s1    uuid := '22222222-0000-0000-0000-000000000002';
  v_s2    uuid := '22222222-0000-0000-0000-000000000003';
  o jsonb; v_sid uuid; v_code text; snap jsonb; opts jsonb;
  fn_count int;
BEGIN
  PERFORM qa.as_user(v_tutor);
  o := public.create_live_quiz_session('d1111111-0000-0000-0000-000000000001', 30, true, 300, false);
  v_sid := (o->>'id')::uuid; v_code := o->>'game_code';
  INSERT INTO qa.ctx (k, v, s) VALUES ('session2', v_sid, v_code)
    ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, s = EXCLUDED.s;

  PERFORM qa.as_user(v_s1); PERFORM public.join_live_quiz_session(v_code);
  PERFORM qa.as_user(v_s2); PERFORM public.join_live_quiz_session(v_code);

  PERFORM qa.as_user(v_tutor);
  PERFORM public.advance_live_quiz_session(v_sid, 'start');   -- q0, mcq

  -- Both students pick the same mcq option.
  PERFORM qa.as_user(v_s1);
  PERFORM public.submit_live_quiz_answer(v_sid, 0, NULL, NULL, to_jsonb('0a111111-0000-0000-0000-000000000011'::text));
  PERFORM qa.as_user(v_s2);
  PERFORM public.submit_live_quiz_answer(v_sid, 0, NULL, NULL, to_jsonb('0a111111-0000-0000-0000-000000000012'::text));

  PERFORM qa.as_user(v_tutor);
  snap := public.get_live_quiz_snapshot(v_sid);
  opts := snap -> 'question_stats' -> 'options';
  PERFORM qa.check('E1 mcq distribution counts each chosen option once',
    (SELECT (e->>'count')::int FROM jsonb_array_elements(opts) e
      WHERE e->>'option_id' = '0a111111-0000-0000-0000-000000000011') = 1
    AND (SELECT (e->>'count')::int FROM jsonb_array_elements(opts) e
      WHERE e->>'option_id' = '0a111111-0000-0000-0000-000000000012') = 1,
    opts::text);
  PERFORM qa.check('E2 answered count is the number of players who responded',
    (snap -> 'question_stats' ->> 'answered')::int = 2,
    (snap -> 'question_stats' ->> 'answered'));

  PERFORM public.advance_live_quiz_session(v_sid, 'reveal');
  PERFORM public.advance_live_quiz_session(v_sid, 'next');    -- q1, true_false

  PERFORM qa.as_user(v_s1);
  PERFORM public.submit_live_quiz_answer(v_sid, 1, NULL, NULL, to_jsonb('true'::text));
  PERFORM qa.as_user(v_s2);
  PERFORM public.submit_live_quiz_answer(v_sid, 1, NULL, NULL, to_jsonb('true'::text));

  PERFORM qa.as_user(v_tutor);
  opts := public.get_live_quiz_snapshot(v_sid) -> 'question_stats' -> 'options';
  PERFORM qa.check('E3 true/false distribution matches on the option''s own text',
    (SELECT (e->>'count')::int FROM jsonb_array_elements(opts) e WHERE e->>'text' = 'True') = 2
    AND (SELECT (e->>'count')::int FROM jsonb_array_elements(opts) e WHERE e->>'text' = 'False') = 0,
    opts::text);

  PERFORM public.advance_live_quiz_session(v_sid, 'reveal');
  PERFORM public.advance_live_quiz_session(v_sid, 'next');    -- q2, multiple_select

  -- s1 picks both correct; s2 picks one correct and one wrong.
  PERFORM qa.as_user(v_s1);
  PERFORM public.submit_live_quiz_answer(v_sid, 2, NULL, NULL,
    jsonb_build_array('0a111111-0000-0000-0000-000000000031','0a111111-0000-0000-0000-000000000032'));
  PERFORM qa.as_user(v_s2);
  PERFORM public.submit_live_quiz_answer(v_sid, 2, NULL, NULL,
    jsonb_build_array('0a111111-0000-0000-0000-000000000031','0a111111-0000-0000-0000-000000000033'));

  PERFORM qa.as_user(v_tutor);
  opts := public.get_live_quiz_snapshot(v_sid) -> 'question_stats' -> 'options';
  PERFORM qa.check('E4 multiple_select counts every id inside a player''s selection',
    (SELECT (e->>'count')::int FROM jsonb_array_elements(opts) e
      WHERE e->>'option_id' = '0a111111-0000-0000-0000-000000000031') = 2   -- both players
    AND (SELECT (e->>'count')::int FROM jsonb_array_elements(opts) e
      WHERE e->>'option_id' = '0a111111-0000-0000-0000-000000000032') = 1   -- s1 only
    AND (SELECT (e->>'count')::int FROM jsonb_array_elements(opts) e
      WHERE e->>'option_id' = '0a111111-0000-0000-0000-000000000033') = 1,  -- s2 only
    opts::text);
  PERFORM qa.check('E5 a multi-select answer is counted once per option, not once per player',
    (SELECT sum((e->>'count')::int) FROM jsonb_array_elements(opts) e) = 4,
    opts::text);

  PERFORM public.advance_live_quiz_session(v_sid, 'reveal');
  PERFORM public.advance_live_quiz_session(v_sid, 'next');    -- q3, short_answer

  PERFORM qa.as_user(v_s1);
  PERFORM public.submit_live_quiz_answer(v_sid, 3, NULL, NULL, to_jsonb('Newton'::text));

  PERFORM qa.as_user(v_tutor);
  snap := public.get_live_quiz_snapshot(v_sid);
  PERFORM qa.check('E6 a typed question reports an empty distribution, not invented buckets',
    jsonb_array_length(snap -> 'question_stats' -> 'options') = 0,
    (snap -> 'question_stats' -> 'options')::text);
  PERFORM qa.check('E7 a typed question still reports how many have answered',
    (snap -> 'question_stats' ->> 'answered')::int = 1,
    (snap -> 'question_stats' ->> 'answered'));
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- F — WHAT THE STUDENT IS SENT
--
-- Read on the same open short_answer question as E, from the student's side.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_tutor uuid := '11111111-0000-0000-0000-000000000001';
  v_s2 uuid := '22222222-0000-0000-0000-000000000003';
  v_sid uuid; snap jsonb; q jsonb; body text;
BEGIN
  SELECT v INTO v_sid FROM qa.ctx WHERE k = 'session2';

  PERFORM qa.as_user(v_s2);
  snap := public.get_live_quiz_snapshot(v_sid);
  q := snap -> 'question';
  body := snap::text;

  PERFORM qa.check('F1 pre-reveal, the accepted answers are withheld',
    q -> 'accepted_answers' IS NULL OR jsonb_typeof(q -> 'accepted_answers') = 'null',
    (q -> 'accepted_answers')::text);
  PERFORM qa.check('F2 pre-reveal, the explanation is withheld',
    q -> 'explanation' IS NULL OR jsonb_typeof(q -> 'explanation') = 'null',
    (q -> 'explanation')::text);
  -- The key may be present; the VALUE must not be. Asserting on the numbers
  -- themselves is what catches a leak — a key name proves nothing either way.
  PERFORM qa.check('F3 no numeric answer or tolerance value appears pre-reveal',
    body NOT LIKE '%numeric_tolerance%'
    AND body NOT LIKE '%9.81%' AND body NOT LIKE '%0.05%', 'no numeric values');
  PERFORM qa.check('F4 no accepted answer text leaks anywhere in the payload',
    body NOT LIKE '%Isaac Newton%' AND body NOT LIKE '%Celsius%', 'no answer strings');
  PERFORM qa.check('F5 a student gets no host distribution',
    snap -> 'question_stats' IS NULL
    OR jsonb_typeof(snap -> 'question_stats') = 'null',
    (snap -> 'question_stats')::text);
  PERFORM qa.check('F6 a student never sees the game code',
    snap -> 'session' ->> 'game_code' IS NULL, (snap -> 'session' ->> 'game_code'));

  -- Reveal, then read again.
  PERFORM qa.as_user(v_tutor);
  PERFORM public.advance_live_quiz_session(v_sid, 'reveal');

  PERFORM qa.as_user(v_s2);
  q := public.get_live_quiz_snapshot(v_sid) -> 'question';
  PERFORM qa.check('F7 at reveal, the accepted answers are shown so a student can learn',
    q -> 'accepted_answers' @> '["Newton"]'::jsonb, (q -> 'accepted_answers')::text);
  PERFORM qa.check('F8 at reveal, the explanation is shown',
    q ->> 'explanation' = 'Isaac Newton.', q ->> 'explanation');
END $$;

-- The numeric question carries a unit, which is a label the student needs in
-- order to answer at all. Checked on its own question, not the short answer.
DO $$
DECLARE
  v_tutor uuid := '11111111-0000-0000-0000-000000000001';
  v_s2 uuid := '22222222-0000-0000-0000-000000000003';
  v_sid uuid; q jsonb;
BEGIN
  SELECT v INTO v_sid FROM qa.ctx WHERE k = 'session2';
  PERFORM qa.as_user(v_tutor);
  PERFORM public.advance_live_quiz_session(v_sid, 'next');    -- q4, numeric

  PERFORM qa.as_user(v_s2);
  q := public.get_live_quiz_snapshot(v_sid) -> 'question';
  PERFORM qa.check('F9 the unit label reaches the student',
    q ->> 'answer_unit' = 'm/s²', q ->> 'answer_unit');
  PERFORM qa.check('F10 the question type reaches the student, so the right control renders',
    q ->> 'question_type' = 'numeric', q ->> 'question_type');
  PERFORM qa.check('F11 pre-reveal, options still carry no correctness',
    NOT EXISTS (SELECT 1 FROM jsonb_array_elements(q -> 'options') e
                 WHERE jsonb_typeof(e -> 'is_correct') <> 'null'),
    (q -> 'options')::text);
  PERFORM qa.check('F12 pre-reveal, the numeric answer is withheld',
    q -> 'numeric_answer' IS NULL OR jsonb_typeof(q -> 'numeric_answer') = 'null',
    (q -> 'numeric_answer')::text);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- G — MALFORMED PAYLOADS ARE REFUSED AT THE DOOR
--
-- Not scored zero: refused. A client bug must be visible, not a silent loss of
-- marks. The numeric question (index 4) is open.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_sid uuid;
BEGIN
  SELECT v INTO v_sid FROM qa.ctx WHERE k = 'session2';
  PERFORM set_config('qa.sid', v_sid::text, false);
END $$;

SELECT qa.expect_error('G1 an answer with no value at all is refused',
  '22222222-0000-0000-0000-000000000003',
  format($$SELECT public.submit_live_quiz_answer(%L::uuid, 4)$$, current_setting('qa.sid')),
  'invalid_answer');

SELECT qa.expect_error('G2 an object where a scalar belongs is refused',
  '22222222-0000-0000-0000-000000000003',
  format($$SELECT public.submit_live_quiz_answer(%L::uuid, 4, NULL, NULL, '{"x":1}'::jsonb)$$,
         current_setting('qa.sid')),
  'invalid_answer');

SELECT qa.expect_error('G3 answering a question that is not the open one is refused',
  '22222222-0000-0000-0000-000000000003',
  format($$SELECT public.submit_live_quiz_answer(%L::uuid, 2, NULL, NULL, to_jsonb('9.81'::text))$$,
         current_setting('qa.sid')),
  'question_not_open');

SELECT qa.expect_error('G4 a non-participant cannot answer',
  '44444444-0000-0000-0000-000000000006',
  format($$SELECT public.submit_live_quiz_answer(%L::uuid, 4, NULL, NULL, to_jsonb('9.81'::text))$$,
         current_setting('qa.sid')),
  'not_a_participant');

-- A hostile numeric string is graded false rather than raising: it is a
-- well-formed answer that happens to be wrong.
DO $$
DECLARE v_sid uuid; v_s2 uuid := '22222222-0000-0000-0000-000000000003'; r jsonb;
BEGIN
  SELECT v INTO v_sid FROM qa.ctx WHERE k = 'session2';
  PERFORM qa.as_user(v_s2);
  r := public.submit_live_quiz_answer(v_sid, 4, NULL, NULL, to_jsonb('Infinity'::text));
  PERFORM qa.check('G5 "Infinity" is accepted as a response and graded wrong, not crashed on',
    (r->>'accepted')::boolean
    AND (SELECT NOT is_correct FROM public.live_quiz_answers
          WHERE session_id = v_sid AND question_index = 4
            AND participant_id = (SELECT id FROM public.live_quiz_participants
                                   WHERE session_id = v_sid AND user_id = v_s2)),
    r::text);

  -- And a second submission for the same question is a no-op, as before.
  r := public.submit_live_quiz_answer(v_sid, 4, NULL, NULL, to_jsonb('9.81'::text));
  PERFORM qa.check('G6 a resubmission cannot overwrite a graded answer',
    (r->>'duplicate')::boolean
    AND (SELECT answer_text FROM public.live_quiz_answers
          WHERE session_id = v_sid AND question_index = 4
            AND participant_id = (SELECT id FROM public.live_quiz_participants
                                   WHERE session_id = v_sid AND user_id = v_s2)) = 'Infinity',
    r::text);
END $$;

-- At reveal the numeric answer IS shown, so a student who got it wrong learns
-- the value. The tolerance stays withheld: it is a grading detail, and seeing
-- it would narrow the search space rather than teach anything.
DO $$
DECLARE
  v_tutor uuid := '11111111-0000-0000-0000-000000000001';
  v_s2 uuid := '22222222-0000-0000-0000-000000000003';
  v_sid uuid; snap jsonb; q jsonb;
BEGIN
  SELECT v INTO v_sid FROM qa.ctx WHERE k = 'session2';
  PERFORM qa.as_user(v_tutor);
  PERFORM public.advance_live_quiz_session(v_sid, 'reveal');  -- reveal q4, numeric

  PERFORM qa.as_user(v_s2);
  snap := public.get_live_quiz_snapshot(v_sid);
  q := snap -> 'question';
  PERFORM qa.check('F13 at reveal, the numeric answer is shown so a student can learn it',
    (q ->> 'numeric_answer')::numeric = 9.81, q ->> 'numeric_answer');
  PERFORM qa.check('F14 the tolerance is never sent, at reveal or before',
    snap::text NOT LIKE '%tolerance%' AND snap::text NOT LIKE '%0.05%', 'no tolerance');

  PERFORM qa.as_user(v_tutor);
  PERFORM public.advance_live_quiz_session(v_sid, 'next');    -- q5, fill_blank
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- H — BACKWARD COMPATIBILITY OF THE CALL SITE
-- ═══════════════════════════════════════════════════════════════════════════
-- Third game, held at q0 (mcq) with both students joined and neither having
-- answered — the rejection cases below have to reach payload validation, and an
-- already-answered participant would be short-circuited by idempotency first.
DO $$
DECLARE
  v_tutor uuid := '11111111-0000-0000-0000-000000000001';
  v_s1 uuid := '22222222-0000-0000-0000-000000000002';
  v_s2 uuid := '22222222-0000-0000-0000-000000000003';
  o jsonb; v_sid uuid; v_code text;
BEGIN
  PERFORM qa.as_user(v_tutor);
  o := public.create_live_quiz_session('d1111111-0000-0000-0000-000000000001', 30, true, 300, false);
  v_sid := (o->>'id')::uuid; v_code := o->>'game_code';
  INSERT INTO qa.ctx (k, v, s) VALUES ('session3', v_sid, v_code)
    ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, s = EXCLUDED.s;

  PERFORM qa.as_user(v_s1); PERFORM public.join_live_quiz_session(v_code);
  PERFORM qa.as_user(v_s2); PERFORM public.join_live_quiz_session(v_code);
  PERFORM qa.as_user(v_tutor); PERFORM public.advance_live_quiz_session(v_sid, 'start');
END $$;

-- An option belonging to a different quiz entirely. The pre-Phase-5 behaviour
-- was to refuse it; routing correctness through the shared grader must not
-- soften that into "scored wrong".
SELECT qa.expect_error('H1 an old client sending a foreign option id is still refused',
  '22222222-0000-0000-0000-000000000003',
  $$SELECT public.submit_live_quiz_answer(
      (SELECT v FROM qa.ctx WHERE k='session3'), 0,
      '0a222222-0000-0000-0000-000000000011'::uuid)$$,
  'invalid_answer');

DO $$
BEGIN
  PERFORM qa.check('H2 the refused answer stored no row',
    NOT EXISTS (SELECT 1 FROM public.live_quiz_answers a
                 JOIN public.live_quiz_participants p ON p.id = a.participant_id
                WHERE a.session_id = (SELECT v FROM qa.ctx WHERE k='session3')
                  AND p.user_id = '22222222-0000-0000-0000-000000000003'),
    'no row for the rejected submission');
END $$;

DO $$
DECLARE
  v_tutor uuid := '11111111-0000-0000-0000-000000000001';
  v_s1 uuid := '22222222-0000-0000-0000-000000000002';
  v_sid uuid; r jsonb;
BEGIN
  SELECT v INTO v_sid FROM qa.ctx WHERE k = 'session3';

  -- The pre-Phase-5 client shape: an option id in _option_id, nothing else.
  PERFORM qa.as_user(v_s1);
  r := public.submit_live_quiz_answer(v_sid, 0, '0a111111-0000-0000-0000-000000000011'::uuid);
  PERFORM qa.check('H3 an old client sending only _option_id still scores',
    (r->>'accepted')::boolean
    AND (SELECT is_correct FROM public.live_quiz_answers
          WHERE session_id = v_sid AND question_index = 0), r::text);

  PERFORM qa.as_user(v_tutor);
  PERFORM public.advance_live_quiz_session(v_sid, 'reveal');
  PERFORM public.advance_live_quiz_session(v_sid, 'next');

  -- The pre-Phase-5 true/false shape: a string in _answer_text.
  PERFORM qa.as_user(v_s1);
  r := public.submit_live_quiz_answer(v_sid, 1, NULL, 'true');
  PERFORM qa.check('H4 an old client sending only _answer_text still scores',
    (r->>'accepted')::boolean
    AND (SELECT is_correct FROM public.live_quiz_answers
          WHERE session_id = v_sid AND question_index = 1), r::text);
END $$;

-- A multiple_select question cannot be answered by the legacy single-option
-- shape. It must say so rather than record a half-answer.
DO $$
DECLARE
  v_tutor uuid := '11111111-0000-0000-0000-000000000001';
  v_sid uuid;
BEGIN
  SELECT v INTO v_sid FROM qa.ctx WHERE k = 'session3';
  PERFORM qa.as_user(v_tutor);
  PERFORM public.advance_live_quiz_session(v_sid, 'reveal');
  PERFORM public.advance_live_quiz_session(v_sid, 'next');   -- q2, multiple_select
END $$;

SELECT qa.expect_error('H5 a legacy single-option call on a multiple_select question is refused',
  '22222222-0000-0000-0000-000000000002',
  $$SELECT public.submit_live_quiz_answer(
      (SELECT v FROM qa.ctx WHERE k='session3'), 2,
      '0a111111-0000-0000-0000-000000000031'::uuid)$$,
  'invalid_answer');

-- ═══════════════════════════════════════════════════════════════════════════
-- I — SIGNATURE AND PRIVILEGE HYGIENE
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'submit_live_quiz_answer';
  PERFORM qa.check('I1 exactly one submit_live_quiz_answer exists — the old 4-arg form is dropped',
    n = 1, n::text || ' overloads');

  PERFORM qa.check('I2 the surviving form takes the jsonb answer',
    (SELECT string_agg(format_type(t, NULL), ', ' ORDER BY ord)
       FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace,
            unnest(p.proargtypes) WITH ORDINALITY AS u(t, ord)
      WHERE ns.nspname='public' AND p.proname='submit_live_quiz_answer')
    = 'uuid, integer, uuid, text, jsonb',
    (SELECT string_agg(format_type(t, NULL), ', ' ORDER BY ord)
       FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace,
            unnest(p.proargtypes) WITH ORDINALITY AS u(t, ord)
      WHERE ns.nspname='public' AND p.proname='submit_live_quiz_answer'));

  PERFORM qa.check('I3 anon cannot execute any of the three replaced functions',
    NOT has_function_privilege('anon',
      'public.submit_live_quiz_answer(uuid, integer, uuid, text, jsonb)', 'EXECUTE')
    AND NOT has_function_privilege('anon',
      'public.create_live_quiz_session(uuid, integer, boolean, integer, boolean)', 'EXECUTE')
    AND NOT has_function_privilege('anon',
      'public.get_live_quiz_snapshot(uuid)', 'EXECUTE'),
    'anon has no EXECUTE');

  PERFORM qa.check('I4 authenticated can execute all three',
    has_function_privilege('authenticated',
      'public.submit_live_quiz_answer(uuid, integer, uuid, text, jsonb)', 'EXECUTE')
    AND has_function_privilege('authenticated',
      'public.create_live_quiz_session(uuid, integer, boolean, integer, boolean)', 'EXECUTE')
    AND has_function_privilege('authenticated',
      'public.get_live_quiz_snapshot(uuid)', 'EXECUTE'),
    'authenticated has EXECUTE');

  PERFORM qa.check('I5 all three are SECURITY DEFINER with a pinned search_path',
    NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
       WHERE ns.nspname = 'public'
         AND p.proname IN ('submit_live_quiz_answer','create_live_quiz_session',
                           'get_live_quiz_snapshot')
         AND (NOT p.prosecdef
              OR p.proconfig IS NULL
              OR NOT (p.proconfig::text LIKE '%search_path%'))),
    'definer + pinned search_path');
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- J — THE ANSWER KEY IS STILL UNREADABLE DIRECTLY
--
-- Phase 5 added four more answer-key columns. This proves the table-level
-- privileges cover them too, not just is_correct.
-- ═══════════════════════════════════════════════════════════════════════════
SELECT qa.expect_error('J1 an enrolled student still cannot read quiz_options.is_correct',
  '22222222-0000-0000-0000-000000000002',
  $$SELECT is_correct FROM public.quiz_options
     WHERE question_id = 'e1111111-0000-0000-0000-000000000001'$$,
  'permission denied');

SELECT qa.expect_error('J2 an enrolled student cannot read quiz_questions.accepted_answers',
  '22222222-0000-0000-0000-000000000002',
  $$SELECT accepted_answers FROM public.quiz_questions
     WHERE id = 'e1111111-0000-0000-0000-000000000004'$$,
  'permission denied');

SELECT qa.expect_error('J3 an enrolled student cannot read quiz_questions.numeric_answer',
  '22222222-0000-0000-0000-000000000002',
  $$SELECT numeric_answer FROM public.quiz_questions
     WHERE id = 'e1111111-0000-0000-0000-000000000005'$$,
  'permission denied');

SELECT qa.expect_error('J4 an enrolled student cannot read quiz_questions.numeric_tolerance',
  '22222222-0000-0000-0000-000000000002',
  $$SELECT numeric_tolerance FROM public.quiz_questions
     WHERE id = 'e1111111-0000-0000-0000-000000000005'$$,
  'permission denied');

-- Not one column of either table reads, which is the posture 20260905000000
-- restores: nothing outside the database reads them directly, so the correct
-- privilege is none.
SELECT qa.expect_error('J5 not even the question text reads directly',
  '22222222-0000-0000-0000-000000000002',
  $$SELECT question FROM public.quiz_questions
     WHERE id = 'e1111111-0000-0000-0000-000000000005'$$,
  'permission denied');

SELECT qa.expect_error('J6 nor any column of quiz_options',
  '22222222-0000-0000-0000-000000000002',
  $$SELECT option_text FROM public.quiz_options
     WHERE question_id = 'e1111111-0000-0000-0000-000000000001'$$,
  'permission denied');

-- J1-J6 must not be passing because the harness is broken or the tables are
-- empty. Both checks below run as the SAME student.
DO $$
DECLARE v_ok boolean := false; v_q text;
BEGIN
  -- The definer path — which is how every RPC reads these — is unaffected.
  PERFORM qa.as_user('22222222-0000-0000-0000-000000000002');
  SELECT question INTO v_q FROM public.quiz_questions
   WHERE id = 'e1111111-0000-0000-0000-000000000005';
  PERFORM qa.check('J7 the row is there, and the definer path still reads it',
    v_q IS NOT NULL, COALESCE(v_q, 'null'));

  -- And a table the role IS granted still reads as that role.
  SET LOCAL ROLE authenticated;
  SELECT true INTO v_ok FROM public.quizzes
   WHERE id = 'd1111111-0000-0000-0000-000000000001';
  RESET ROLE;
  PERFORM qa.check('J8 the same student CAN read a table they are granted — '
                   'J1-J6 are privilege results, not a broken harness',
    COALESCE(v_ok, false), '');
END $$;

DO $$
DECLARE v_left text;
BEGIN
  SELECT string_agg(DISTINCT table_name || '.' || column_name || ' -> ' || grantee, ', ')
    INTO v_left FROM information_schema.column_privileges
   WHERE table_schema = 'public'
     AND table_name IN ('quiz_questions', 'quiz_options')
     AND grantee IN ('anon', 'authenticated');
  PERFORM qa.check('J9 no column-level grant survives on either answer-key table',
    v_left IS NULL, COALESCE(v_left, 'none'));
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- K — CROSS-TENANT
-- ═══════════════════════════════════════════════════════════════════════════
SELECT qa.expect_error('K1 a foreign tutor cannot host another centre''s quiz',
  '33333333-0000-0000-0000-000000000005',
  $$SELECT public.create_live_quiz_session('d1111111-0000-0000-0000-000000000001'::uuid)$$,
  'access_denied');

SELECT qa.expect_error('K2 a foreign student cannot read the session snapshot',
  '44444444-0000-0000-0000-000000000006',
  $$SELECT public.get_live_quiz_snapshot((SELECT v FROM qa.ctx WHERE k='session3'))$$,
  'session_not_found');

DO $$
DECLARE v_sid uuid; snap jsonb;
BEGIN
  SELECT v INTO v_sid FROM qa.ctx WHERE k = 'session3';
  PERFORM qa.as_user('33333333-0000-0000-0000-000000000005');
  BEGIN
    snap := public.get_live_quiz_snapshot(v_sid);
    PERFORM qa.check('K3 a foreign tutor cannot read the session snapshot either',
      false, 'returned a snapshot');
  EXCEPTION WHEN OTHERS THEN
    PERFORM qa.check('K3 a foreign tutor cannot read the session snapshot either',
      position('session_not_found' in SQLERRM) > 0, SQLERRM);
  END;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- L — THE FLAG GATES HOSTING SERVER-SIDE (20260906000100)
--
-- FeatureRoute hides the host screen. This is what makes turning the flag off
-- an actual answer to a release blocker rather than a cosmetic one.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  UPDATE public.tuition_centers
     SET feature_flags = feature_flags || '{"liveQuizMultiplayer": false}'::jsonb
   WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
END $$;

SELECT qa.expect_error('L1 hosting is refused server-side when the flag is off',
  '11111111-0000-0000-0000-000000000001',
  $$SELECT public.create_live_quiz_session('d1111111-0000-0000-0000-000000000001'::uuid)$$,
  'feature_disabled');

DO $$
DECLARE v_sid uuid; snap jsonb;
BEGIN
  -- A session created BEFORE the flag flipped keeps playing. Cutting thirty
  -- students off mid-question is worse than the feature being on for one more
  -- game; the session ages out on its own six-hour expiry.
  SELECT v INTO v_sid FROM qa.ctx WHERE k = 'session3';
  PERFORM qa.as_user('11111111-0000-0000-0000-000000000001');
  snap := public.get_live_quiz_snapshot(v_sid);
  PERFORM qa.check('L2 a game already in progress is not killed by the switch',
    snap -> 'session' ->> 'id' = v_sid::text, (snap -> 'session' ->> 'status'));
END $$;

DO $$
DECLARE o jsonb;
BEGIN
  UPDATE public.tuition_centers
     SET feature_flags = feature_flags || '{"liveQuizMultiplayer": true}'::jsonb
   WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';

  PERFORM qa.as_user('11111111-0000-0000-0000-000000000001');
  o := public.create_live_quiz_session('d1111111-0000-0000-0000-000000000001', 30, true, 300, false);
  PERFORM qa.check('L3 turning it back on restores hosting — the switch works both ways',
    (o->>'id') IS NOT NULL, o::text);
  PERFORM public.advance_live_quiz_session((o->>'id')::uuid, 'cancel');
END $$;
