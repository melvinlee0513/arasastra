-- Phase 5 QA — grading for every question type, plus answer-key secrecy.
-- The grading cases are the point: a wrong decision here silently mis-grades a
-- real class, so each type is checked against correct, near-miss and hostile
-- input rather than just a happy path.
\set QUIET on
\pset pager off
\set ON_ERROR_STOP off

-- A quiz whose questions cover all six types.
DO $$
DECLARE
  v_center uuid := 'aaaaaaaa-0000-0000-0000-00000000000a';
  v_class  uuid := 'c1111111-0000-0000-0000-000000000001';
  v_quiz   uuid := 'cafe0000-0000-0000-0000-00000000cafe';
BEGIN
  INSERT INTO public.quizzes (id, class_id, center_id, title, status, total_points)
  VALUES (v_quiz, v_class, v_center, 'All Types Quiz', 'published', 6)
  ON CONFLICT (id) DO NOTHING;

  -- MCQ
  INSERT INTO public.quiz_questions (id, quiz_id, question, question_type, points, order_index, center_id)
  VALUES ('cafe0001-0000-0000-0000-000000000001', v_quiz, 'Pick the SI unit of force.', 'mcq', 1, 0, v_center)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.quiz_options (id, question_id, center_id, option_text, is_correct, order_index) VALUES
   ('cafe1001-0000-0000-0000-000000000001','cafe0001-0000-0000-0000-000000000001',v_center,'Newton',true,0),
   ('cafe1002-0000-0000-0000-000000000002','cafe0001-0000-0000-0000-000000000001',v_center,'Joule',false,1)
  ON CONFLICT (id) DO NOTHING;

  -- True/False (builder style: key lives on the correct option)
  INSERT INTO public.quiz_questions (id, quiz_id, question, question_type, points, order_index, center_id)
  VALUES ('cafe0002-0000-0000-0000-000000000002', v_quiz, 'Heat flows hot to cold.', 'true_false', 1, 1, v_center)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.quiz_options (id, question_id, center_id, option_text, is_correct, order_index) VALUES
   ('cafe2001-0000-0000-0000-000000000001','cafe0002-0000-0000-0000-000000000002',v_center,'True',true,0),
   ('cafe2002-0000-0000-0000-000000000002','cafe0002-0000-0000-0000-000000000002',v_center,'False',false,1)
  ON CONFLICT (id) DO NOTHING;

  -- Multiple select: two of four correct
  INSERT INTO public.quiz_questions (id, quiz_id, question, question_type, points, order_index, center_id)
  VALUES ('cafe0003-0000-0000-0000-000000000003', v_quiz, 'Which are renewable?', 'multiple_select', 1, 2, v_center)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.quiz_options (id, question_id, center_id, option_text, is_correct, order_index) VALUES
   ('cafe3001-0000-0000-0000-000000000001','cafe0003-0000-0000-0000-000000000003',v_center,'Solar',true,0),
   ('cafe3002-0000-0000-0000-000000000002','cafe0003-0000-0000-0000-000000000003',v_center,'Hydro',true,1),
   ('cafe3003-0000-0000-0000-000000000003','cafe0003-0000-0000-0000-000000000003',v_center,'Coal',false,2),
   ('cafe3004-0000-0000-0000-000000000004','cafe0003-0000-0000-0000-000000000003',v_center,'Gas',false,3)
  ON CONFLICT (id) DO NOTHING;

  -- Short answer, case-insensitive, two accepted forms
  INSERT INTO public.quiz_questions
    (id, quiz_id, question, question_type, points, order_index, center_id,
     accepted_answers, answer_match_mode)
  VALUES ('cafe0004-0000-0000-0000-000000000004', v_quiz, 'Who formulated the laws of motion?',
          'short_answer', 1, 3, v_center, ARRAY['Newton','Isaac Newton'], 'ignore_case')
  ON CONFLICT (id) DO NOTHING;

  -- Numeric with a tolerance and a unit
  INSERT INTO public.quiz_questions
    (id, quiz_id, question, question_type, points, order_index, center_id,
     numeric_answer, numeric_tolerance, answer_unit)
  VALUES ('cafe0005-0000-0000-0000-000000000005', v_quiz, 'Acceleration due to gravity?',
          'numeric', 1, 4, v_center, 9.8, 0.1, 'm/s²')
  ON CONFLICT (id) DO NOTHING;

  -- Fill in the blank, exact match
  INSERT INTO public.quiz_questions
    (id, quiz_id, question, question_type, points, order_index, center_id,
     accepted_answers, answer_match_mode)
  VALUES ('cafe0006-0000-0000-0000-000000000006', v_quiz,
          'Plants use ______ to absorb light energy.',
          'fill_blank', 1, 5, v_center, ARRAY['chlorophyll'], 'exact')
  ON CONFLICT (id) DO NOTHING;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- M — MCQ AND TRUE/FALSE REGRESSION (unchanged behaviour)
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  m uuid := 'cafe0001-0000-0000-0000-000000000001';
  t uuid := 'cafe0002-0000-0000-0000-000000000002';
BEGIN
  PERFORM qa.check('M1 mcq: the correct option is correct',
    public._quiz_answer_is_correct(m, '"cafe1001-0000-0000-0000-000000000001"'::jsonb), '');
  PERFORM qa.check('M2 mcq: a wrong option is wrong',
    NOT public._quiz_answer_is_correct(m, '"cafe1002-0000-0000-0000-000000000002"'::jsonb), '');
  PERFORM qa.check('M3 mcq: an option from ANOTHER question is wrong, not correct',
    NOT public._quiz_answer_is_correct(m, '"cafe3001-0000-0000-0000-000000000001"'::jsonb), '');
  PERFORM qa.check('M4 mcq: a non-uuid string is wrong, not an error',
    NOT public._quiz_answer_is_correct(m, '"not-a-uuid"'::jsonb), '');
  PERFORM qa.check('M5 mcq: no answer is wrong',
    NOT public._quiz_answer_is_correct(m, NULL), '');

  PERFORM qa.check('M6 true_false: "true" matches the correct option',
    public._quiz_answer_is_correct(t, '"true"'::jsonb), '');
  PERFORM qa.check('M7 true_false: "TRUE" is accepted (case-insensitive)',
    public._quiz_answer_is_correct(t, '"TRUE"'::jsonb), '');
  PERFORM qa.check('M8 true_false: "false" is wrong here',
    NOT public._quiz_answer_is_correct(t, '"false"'::jsonb), '');
  PERFORM qa.check('M9 true_false: junk is wrong',
    NOT public._quiz_answer_is_correct(t, '"maybe"'::jsonb), '');
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- N — MULTIPLE SELECT (all-or-nothing)
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE q uuid := 'cafe0003-0000-0000-0000-000000000003';
BEGIN
  PERFORM qa.check('N1 both correct options selected is correct',
    public._quiz_answer_is_correct(q,
      '["cafe3001-0000-0000-0000-000000000001","cafe3002-0000-0000-0000-000000000002"]'::jsonb), '');
  PERFORM qa.check('N2 order does not matter',
    public._quiz_answer_is_correct(q,
      '["cafe3002-0000-0000-0000-000000000002","cafe3001-0000-0000-0000-000000000001"]'::jsonb), '');
  PERFORM qa.check('N3 duplicates in the selection do not break equality',
    public._quiz_answer_is_correct(q,
      '["cafe3001-0000-0000-0000-000000000001","cafe3001-0000-0000-0000-000000000001","cafe3002-0000-0000-0000-000000000002"]'::jsonb), '');
  PERFORM qa.check('N4 missing one correct option is WRONG (no partial credit)',
    NOT public._quiz_answer_is_correct(q, '["cafe3001-0000-0000-0000-000000000001"]'::jsonb), '');
  PERFORM qa.check('N5 one extra wrong option makes it wrong',
    NOT public._quiz_answer_is_correct(q,
      '["cafe3001-0000-0000-0000-000000000001","cafe3002-0000-0000-0000-000000000002","cafe3003-0000-0000-0000-000000000003"]'::jsonb), '');
  PERFORM qa.check('N6 an empty selection is wrong, not vacuously correct',
    NOT public._quiz_answer_is_correct(q, '[]'::jsonb), '');
  PERFORM qa.check('N7 an option id from another question is wrong',
    NOT public._quiz_answer_is_correct(q,
      '["cafe3001-0000-0000-0000-000000000001","cafe1001-0000-0000-0000-000000000001"]'::jsonb), '');
  PERFORM qa.check('N8 a string instead of an array is wrong, not an error',
    NOT public._quiz_answer_is_correct(q, '"cafe3001-0000-0000-0000-000000000001"'::jsonb), '');
  PERFORM qa.check('N9 junk inside the array is wrong, not an error',
    NOT public._quiz_answer_is_correct(q, '["not-a-uuid"]'::jsonb), '');
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- O — SHORT ANSWER
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE q uuid := 'cafe0004-0000-0000-0000-000000000004';
BEGIN
  PERFORM qa.check('O1 the exact accepted answer is correct',
    public._quiz_answer_is_correct(q, '"Newton"'::jsonb), '');
  PERFORM qa.check('O2 a different case is accepted in ignore_case mode',
    public._quiz_answer_is_correct(q, '"newton"'::jsonb)
    AND public._quiz_answer_is_correct(q, '"NEWTON"'::jsonb), '');
  PERFORM qa.check('O3 an alternative accepted answer is correct',
    public._quiz_answer_is_correct(q, '"isaac newton"'::jsonb), '');
  PERFORM qa.check('O4 surrounding whitespace is trimmed',
    public._quiz_answer_is_correct(q, '"   Newton   "'::jsonb), '');
  PERFORM qa.check('O5 internal whitespace is collapsed, not treated as a mismatch',
    public._quiz_answer_is_correct(q, '"Isaac    Newton"'::jsonb), '');
  PERFORM qa.check('O6 a wrong answer is wrong',
    NOT public._quiz_answer_is_correct(q, '"Einstein"'::jsonb), '');
  PERFORM qa.check('O7 an empty answer is wrong',
    NOT public._quiz_answer_is_correct(q, '""'::jsonb)
    AND NOT public._quiz_answer_is_correct(q, '"   "'::jsonb), '');
  PERFORM qa.check('O8 a substring of the answer is not accepted',
    NOT public._quiz_answer_is_correct(q, '"New"'::jsonb), '');
  PERFORM qa.check('O9 a superstring of the answer is not accepted',
    NOT public._quiz_answer_is_correct(q, '"Newtonian"'::jsonb), '');
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- P — NUMERIC
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  q uuid := 'cafe0005-0000-0000-0000-000000000005';
  neg uuid := 'cafe0007-0000-0000-0000-000000000007';
BEGIN
  PERFORM qa.check('P1 the exact value is correct',
    public._quiz_answer_is_correct(q, '"9.8"'::jsonb), '');
  PERFORM qa.check('P2 a JSON number is accepted as well as a string',
    public._quiz_answer_is_correct(q, '9.8'::jsonb), '');
  PERFORM qa.check('P3 inside the tolerance is correct on both sides',
    public._quiz_answer_is_correct(q, '"9.75"'::jsonb)
    AND public._quiz_answer_is_correct(q, '"9.85"'::jsonb), '');
  PERFORM qa.check('P4 exactly on the tolerance boundary is correct',
    public._quiz_answer_is_correct(q, '"9.7"'::jsonb)
    AND public._quiz_answer_is_correct(q, '"9.9"'::jsonb), '');
  PERFORM qa.check('P5 outside the tolerance is wrong',
    NOT public._quiz_answer_is_correct(q, '"9.6"'::jsonb)
    AND NOT public._quiz_answer_is_correct(q, '"10"'::jsonb), '');
  PERFORM qa.check('P6 "NaN" is rejected, not cast',
    NOT public._quiz_answer_is_correct(q, '"NaN"'::jsonb), '');
  PERFORM qa.check('P7 "Infinity" is rejected',
    NOT public._quiz_answer_is_correct(q, '"Infinity"'::jsonb)
    AND NOT public._quiz_answer_is_correct(q, '"-Infinity"'::jsonb), '');
  PERFORM qa.check('P8 scientific notation is rejected rather than overflowing',
    NOT public._quiz_answer_is_correct(q, '"1e999"'::jsonb), '');
  PERFORM qa.check('P9 an ordinary word is wrong, not an error',
    NOT public._quiz_answer_is_correct(q, '"nine point eight"'::jsonb), '');
  PERFORM qa.check('P10 a unit typed into the box is not silently stripped',
    NOT public._quiz_answer_is_correct(q, '"9.8 m/s2"'::jsonb), '');

  -- Negative answers and a zero tolerance.
  INSERT INTO public.quiz_questions
    (id, quiz_id, question, question_type, points, order_index, center_id,
     numeric_answer, numeric_tolerance)
  VALUES (neg, 'cafe0000-0000-0000-0000-00000000cafe', 'Charge on an electron (x1e-19 C)?',
          'numeric', 1, 6, 'aaaaaaaa-0000-0000-0000-00000000000a', -1.6, 0)
  ON CONFLICT (id) DO NOTHING;
  PERFORM qa.check('P11 a negative answer is graded correctly',
    public._quiz_answer_is_correct(neg, '"-1.6"'::jsonb)
    AND NOT public._quiz_answer_is_correct(neg, '"1.6"'::jsonb), '');
  PERFORM qa.check('P12 a zero tolerance demands the exact value',
    NOT public._quiz_answer_is_correct(neg, '"-1.61"'::jsonb), '');
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Q — FILL IN THE BLANK (exact mode)
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE q uuid := 'cafe0006-0000-0000-0000-000000000006';
BEGIN
  PERFORM qa.check('Q1 the exact accepted answer is correct',
    public._quiz_answer_is_correct(q, '"chlorophyll"'::jsonb), '');
  PERFORM qa.check('Q2 exact mode REJECTS a different case',
    NOT public._quiz_answer_is_correct(q, '"Chlorophyll"'::jsonb), '');
  PERFORM qa.check('Q3 whitespace is still trimmed in exact mode',
    public._quiz_answer_is_correct(q, '"  chlorophyll  "'::jsonb), '');
  PERFORM qa.check('Q4 a wrong answer is wrong',
    NOT public._quiz_answer_is_correct(q, '"carotene"'::jsonb), '');
  PERFORM qa.check('Q5 an empty blank is wrong',
    NOT public._quiz_answer_is_correct(q, '""'::jsonb), '');
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- R — DEGENERATE CONFIGURATION must fail closed, never open
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_q uuid := 'cafe0008-0000-0000-0000-000000000008';
  v_ms uuid := 'cafe0009-0000-0000-0000-000000000009';
BEGIN
  -- Short answer with no accepted answers configured.
  INSERT INTO public.quiz_questions (id, quiz_id, question, question_type, points, order_index, center_id)
  VALUES (v_q, 'cafe0000-0000-0000-0000-00000000cafe', 'Unconfigured short answer',
          'short_answer', 1, 7, 'aaaaaaaa-0000-0000-0000-00000000000a')
  ON CONFLICT (id) DO NOTHING;
  PERFORM qa.check('R1 a short answer with no key marks everything wrong, not right',
    NOT public._quiz_answer_is_correct(v_q, '"anything"'::jsonb), '');

  -- Multiple select with no correct option.
  INSERT INTO public.quiz_questions (id, quiz_id, question, question_type, points, order_index, center_id)
  VALUES (v_ms, 'cafe0000-0000-0000-0000-00000000cafe', 'Unconfigured multi select',
          'multiple_select', 1, 8, 'aaaaaaaa-0000-0000-0000-00000000000a')
  ON CONFLICT (id) DO NOTHING;
  PERFORM qa.check('R2 a multi-select with no correct option marks everything wrong',
    NOT public._quiz_answer_is_correct(v_ms, '[]'::jsonb), '');

  PERFORM qa.check('R3 an unknown question id is wrong, not an error',
    NOT public._quiz_answer_is_correct('00000000-0000-0000-0000-000000000000', '"x"'::jsonb), '');
  PERFORM qa.check('R4 an unknown question TYPE is wrong, not an error',
    NOT public._quiz_answer_is_correct(
      (SELECT id FROM public.quiz_questions WHERE question_type = 'mcq' LIMIT 1),
      '{"nested":"object"}'::jsonb), '');
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- S — ANSWER SECRECY for the new types
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_stu uuid := '22222222-0000-0000-0000-000000000002';
  v_att uuid := 'cafeaaaa-0000-0000-0000-0000000000a1';
  v_payload jsonb;
BEGIN
  INSERT INTO public.quiz_attempts (id, quiz_id, user_id, center_id, class_id, status)
  VALUES (v_att, 'cafe0000-0000-0000-0000-00000000cafe', v_stu,
          'aaaaaaaa-0000-0000-0000-00000000000a', 'c1111111-0000-0000-0000-000000000001',
          'in_progress')
  ON CONFLICT (id) DO NOTHING;

  PERFORM qa.as_user(v_stu);
  v_payload := public.get_quiz_for_attempt(v_att);

  PERFORM qa.check('S1 the student payload contains no accepted_answers',
    NOT (v_payload::text LIKE '%accepted_answers%')
    AND NOT (v_payload::text ILIKE '%Isaac Newton%'), '');
  PERFORM qa.check('S2 the student payload contains no numeric answer or tolerance',
    NOT (v_payload::text LIKE '%numeric_answer%')
    AND NOT (v_payload::text LIKE '%numeric_tolerance%'), '');
  PERFORM qa.check('S3 the student payload contains no is_correct on any option',
    NOT (v_payload::text LIKE '%is_correct%'), '');
  PERFORM qa.check('S4 the fill-blank answer is not in the payload',
    NOT (v_payload::text ILIKE '%chlorophyll%'), '');
  PERFORM qa.check('S5 the unit IS present, because a student must know what to type',
    v_payload::text LIKE '%m/s²%', '');
  PERFORM qa.check('S6 multiple-select options arrive without their correctness',
    (SELECT bool_and(NOT (o ? 'is_correct'))
       FROM jsonb_array_elements(v_payload->'questions') q,
            jsonb_array_elements(q->'options') o), '');

  -- And the underlying columns are not readable off the table either.
  PERFORM qa.expect_error('S7 a student cannot read accepted_answers off quiz_questions',
    v_stu, 'SELECT accepted_answers FROM public.quiz_questions LIMIT 1', 'permission denied');
  PERFORM qa.expect_error('S8 a student cannot read numeric_answer off quiz_questions',
    v_stu, 'SELECT numeric_answer FROM public.quiz_questions LIMIT 1', 'permission denied');
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- T — THE FULL SUBMIT PATH scores every type end to end
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_stu uuid := '22222222-0000-0000-0000-000000000003';
  v_att uuid := 'cafeaaaa-0000-0000-0000-0000000000a2';
  v_res jsonb;
  v_answers jsonb := jsonb_build_object(
    'cafe0001-0000-0000-0000-000000000001', 'cafe1001-0000-0000-0000-000000000001',  -- mcq: right
    'cafe0002-0000-0000-0000-000000000002', 'true',                                   -- t/f: right
    'cafe0003-0000-0000-0000-000000000003',
      '["cafe3001-0000-0000-0000-000000000001","cafe3002-0000-0000-0000-000000000002"]'::jsonb,
    'cafe0004-0000-0000-0000-000000000004', 'NEWTON',                                 -- short: right
    'cafe0005-0000-0000-0000-000000000005', '9.75',                                   -- numeric: right
    'cafe0006-0000-0000-0000-000000000006', 'Chlorophyll'                             -- blank: WRONG (exact)
  );
BEGIN
  INSERT INTO public.quiz_attempts (id, quiz_id, user_id, center_id, class_id, status, saved_answers)
  VALUES (v_att, 'cafe0000-0000-0000-0000-00000000cafe', v_stu,
          'aaaaaaaa-0000-0000-0000-00000000000a', 'c1111111-0000-0000-0000-000000000001',
          'in_progress', v_answers)
  ON CONFLICT (id) DO UPDATE SET saved_answers = EXCLUDED.saved_answers;

  -- The real grader always runs inside a call from the student, so auth.uid()
  -- is set; XP recording depends on it.
  PERFORM qa.as_user(v_stu);
  v_res := public._grade_and_finalize_attempt(v_att, true, NULL, 'normal');

  -- 5 of 6 configured questions right, plus 3 unconfigured ones that are wrong.
  PERFORM qa.check('T1 the submit path scores every type',
    (v_res->>'correct_count')::int = 5,
    format('correct=%s of %s', v_res->>'correct_count', v_res->>'question_count'));
  PERFORM qa.check('T2 the exact-mode blank was marked wrong for its capital letter',
    NOT (SELECT is_correct FROM public.student_quiz_answers sa
          JOIN public.quiz_results r ON r.id = sa.result_id
         WHERE r.attempt_id = v_att
           AND sa.question_id = 'cafe0006-0000-0000-0000-000000000006'), '');
  PERFORM qa.check('T3 one per-answer row is written for every question',
    (SELECT count(*) FROM public.student_quiz_answers sa
      JOIN public.quiz_results r ON r.id = sa.result_id
     WHERE r.attempt_id = v_att) = (v_res->>'question_count')::int, '');
  PERFORM qa.check('T4 the multi-select response is stored, not dropped',
    (SELECT selected_answer LIKE '%cafe3001%' FROM public.student_quiz_answers sa
      JOIN public.quiz_results r ON r.id = sa.result_id
     WHERE r.attempt_id = v_att
       AND sa.question_id = 'cafe0003-0000-0000-0000-000000000003'), '');
  PERFORM qa.check('T5 the short answer text is stored',
    (SELECT selected_answer = 'NEWTON' FROM public.student_quiz_answers sa
      JOIN public.quiz_results r ON r.id = sa.result_id
     WHERE r.attempt_id = v_att
       AND sa.question_id = 'cafe0004-0000-0000-0000-000000000004'), '');
  PERFORM qa.check('T6 the mcq still records its chosen option id',
    (SELECT selected_option_id = 'cafe1001-0000-0000-0000-000000000001'
       FROM public.student_quiz_answers sa
       JOIN public.quiz_results r ON r.id = sa.result_id
      WHERE r.attempt_id = v_att
        AND sa.question_id = 'cafe0001-0000-0000-0000-000000000001'), '');
  PERFORM qa.check('T7 the grading loop and the stored rows agree',
    (SELECT count(*) FROM public.student_quiz_answers sa
      JOIN public.quiz_results r ON r.id = sa.result_id
     WHERE r.attempt_id = v_att AND sa.is_correct) = (v_res->>'correct_count')::int, '');
  PERFORM qa.check('T8 points awarded match the correct answers',
    (SELECT sum(points_awarded) FROM public.student_quiz_answers sa
      JOIN public.quiz_results r ON r.id = sa.result_id
     WHERE r.attempt_id = v_att) = (v_res->>'total_points')::int, '');

  -- Re-submitting is still a no-op.
  v_res := public._grade_and_finalize_attempt(v_att, true, NULL, 'normal');
  PERFORM qa.check('T9 re-submitting an already-submitted attempt changes nothing',
    (v_res->>'already_submitted')::boolean, v_res::text);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- U — BANK ROUND TRIP for the new config
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_tutor uuid := '11111111-0000-0000-0000-000000000001';
  v_quiz uuid := 'cafe0000-0000-0000-0000-00000000cafe';
  o jsonb; v_id uuid; v_copy uuid;
BEGIN
  PERFORM qa.as_user(v_tutor);
  o := public.save_question_bank_question(
        NULL, 'What is g on Earth?', 'numeric', 3, NULL, 'Forces', NULL, NULL,
        '[]'::jsonb, NULL, 'ignore_case', 9.81, 0.05, 'm/s²');
  v_id := (o->>'id')::uuid;
  PERFORM qa.check('U1 a numeric bank question saves its answer config',
    v_id IS NOT NULL, o::text);

  o := public.get_question_bank_question(v_id);
  PERFORM qa.check('U2 the config round-trips to the editor',
    (o->>'numeric_answer')::numeric = 9.81
    AND (o->>'numeric_tolerance')::numeric = 0.05
    AND o->>'answer_unit' = 'm/s²', o::text);

  o := public.save_question_bank_question(
        NULL, 'Name the pigment', 'short_answer', 2, NULL, NULL, NULL, NULL,
        '[]'::jsonb, ARRAY['chlorophyll','  ', 'chloroplast'], 'exact', NULL, NULL, NULL);
  o := public.get_question_bank_question((o->>'id')::uuid);
  PERFORM qa.check('U3 blank accepted answers are dropped, not stored',
    jsonb_array_length(o->'accepted_answers') = 2, (o->'accepted_answers')::text);
  PERFORM qa.check('U4 the match mode round-trips',
    o->>'answer_match_mode' = 'exact', o->>'answer_match_mode');

  -- The snapshot must carry the config or the copy would grade wrong.
  o := public.add_question_bank_questions_to_quiz(v_quiz, ARRAY[v_id]);
  PERFORM qa.check('U5 the copy is added', (o->>'added')::int = 1, o::text);
  SELECT id INTO v_copy FROM public.quiz_questions
   WHERE quiz_id = v_quiz AND source_bank_question_id = v_id;
  PERFORM qa.check('U6 the snapshot carries the numeric answer, tolerance and unit',
    (SELECT numeric_answer = 9.81 AND numeric_tolerance = 0.05 AND answer_unit = 'm/s²'
       FROM public.quiz_questions WHERE id = v_copy), '');
  PERFORM qa.check('U7 the copied numeric question grades correctly',
    public._quiz_answer_is_correct(v_copy, '"9.83"'::jsonb)
    AND NOT public._quiz_answer_is_correct(v_copy, '"9.9"'::jsonb), '');
END $$;
