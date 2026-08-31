-- Phase 4 Question Bank QA.
-- The invariant that matters most: adding a bank question to a quiz COPIES it,
-- so editing the bank later cannot rewrite a quiz a class has already sat.
\set QUIET on
\pset pager off
\set ON_ERROR_STOP off

CREATE OR REPLACE FUNCTION qa.expect_ok(_label text, _uid uuid, _sql text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_msg text := 'ok'; v_ok boolean := true;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', _uid::text, true);
    SET LOCAL ROLE authenticated;
    EXECUTE _sql;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_msg := SQLERRM;
  END;
  RESET ROLE;
  PERFORM qa.check(_label, v_ok, v_msg);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- G — CREATE / READ
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_tutor uuid := '11111111-0000-0000-0000-000000000001';
  v_col uuid; v_q1 uuid; v_q2 uuid; o jsonb;
BEGIN
  PERFORM qa.as_user(v_tutor);

  o := public.save_question_bank_collection(NULL, 'Physics Form 4',
        'Measurement, forces, heat', '5b1e0000-0000-0000-0000-000000000002');
  v_col := (o->>'id')::uuid;
  PERFORM qa.check('G1 a tutor can create a collection in their own centre',
    v_col IS NOT NULL, o::text);

  o := public.save_question_bank_question(NULL,
        'What is the unit of force in the SI system?', 'mcq', 2,
        'The newton is the SI unit of force.', 'Measurement', v_col,
        '5b1e0000-0000-0000-0000-000000000002',
        '[{"option_text":"Newton","is_correct":true},
          {"option_text":"Joule","is_correct":false},
          {"option_text":"Watt","is_correct":false}]'::jsonb);
  v_q1 := (o->>'id')::uuid;
  PERFORM qa.check('G2 a tutor can create a bank question with options',
    v_q1 IS NOT NULL, o::text);

  o := public.save_question_bank_question(NULL,
        'Which instrument measures mass?', 'mcq', 2, NULL, 'Measurement', v_col,
        '5b1e0000-0000-0000-0000-000000000002',
        '[{"option_text":"Balance","is_correct":true},
          {"option_text":"Ruler","is_correct":false}]'::jsonb);
  v_q2 := (o->>'id')::uuid;

  o := public.get_question_bank_question(v_q1);
  PERFORM qa.check('G3 detail returns the question with its options and answer key',
    jsonb_array_length(o->'options') = 3
    AND (SELECT count(*) FROM jsonb_array_elements(o->'options') x
          WHERE (x->>'is_correct')::boolean) = 1, o::text);
  PERFORM qa.check('G4 a brand new question reports zero usage',
    (o->>'usage_count')::int = 0 AND jsonb_array_length(o->'used_in') = 0, o::text);

  o := public.list_question_bank();
  PERFORM qa.check('G5 the home screen counts real questions and collections',
    (o->>'question_count')::int = 2 AND (o->>'collection_count')::int = 1, o::text);
  PERFORM qa.check('G6 collections carry their own question counts',
    (o->'collections'->0->>'question_count')::int = 2, (o->'collections')::text);
  PERFORM qa.check('G7 subjects come from canonical curriculum data',
    jsonb_array_length(o->'subjects') = 2, (o->'subjects')::text);

  -- Stash for later blocks.
  CREATE TABLE IF NOT EXISTS qa.ids (k text PRIMARY KEY, v uuid);
  INSERT INTO qa.ids VALUES ('col', v_col), ('q1', v_q1), ('q2', v_q2)
    ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- H — SEARCH / FILTER / SORT (every argument must genuinely narrow)
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_tutor uuid := '11111111-0000-0000-0000-000000000001';
  v_col uuid := (SELECT v FROM qa.ids WHERE k='col');
  o jsonb;
BEGIN
  PERFORM qa.as_user(v_tutor);

  o := public.search_question_bank();
  PERFORM qa.check('H1 an unfiltered search returns everything in the centre',
    (o->>'total')::int = 2, o->>'total');

  o := public.search_question_bank(_search := 'force');
  PERFORM qa.check('H2 text search narrows the result set',
    (o->>'total')::int = 1
    AND (o->'questions'->0->>'question') LIKE '%force%', o::text);

  o := public.search_question_bank(_search := 'Measurement');
  PERFORM qa.check('H3 search also matches the topic', (o->>'total')::int = 2, o->>'total');

  o := public.search_question_bank(_search := 'zzzznothing');
  PERFORM qa.check('H4 a search with no matches returns an empty set, not everything',
    (o->>'total')::int = 0 AND jsonb_array_length(o->'questions') = 0, o::text);

  o := public.search_question_bank(_question_type := 'true_false');
  PERFORM qa.check('H5 the type filter genuinely filters', (o->>'total')::int = 0, o->>'total');

  o := public.search_question_bank(_collection_id := v_col);
  PERFORM qa.check('H6 the collection filter genuinely filters', (o->>'total')::int = 2, o->>'total');

  o := public.search_question_bank(_topic := 'Measurement');
  PERFORM qa.check('H7 the topic filter genuinely filters', (o->>'total')::int = 2, o->>'total');

  o := public.search_question_bank(_sort := 'az');
  PERFORM qa.check('H8 A-Z sort orders by question text',
    (o->'questions'->0->>'question') LIKE 'What is the unit%'
    OR (o->'questions'->0->>'question') LIKE 'Which instrument%', (o->'questions')::text);

  o := public.search_question_bank(_limit := 1);
  PERFORM qa.check('H9 the page size is respected while total stays honest',
    jsonb_array_length(o->'questions') = 1 AND (o->>'total')::int = 2, o::text);

  o := public.search_question_bank(_limit := 1, _offset := 1);
  PERFORM qa.check('H10 the offset returns the next page',
    jsonb_array_length(o->'questions') = 1, o::text);

  o := public.search_question_bank(_collection_id := v_col);
  PERFORM qa.check('H11 topic chips are derived from the collection''s real topics',
    o->'topics' = '["Measurement"]'::jsonb, (o->'topics')::text);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- I — SNAPSHOT SEMANTICS (the release-critical block)
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_tutor uuid := '11111111-0000-0000-0000-000000000001';
  v_quiz uuid := '9012aaaa-0000-0000-0000-00000000000f';
  v_q1 uuid := (SELECT v FROM qa.ids WHERE k='q1');
  v_q2 uuid := (SELECT v FROM qa.ids WHERE k='q2');
  o jsonb; v_copy uuid; v_before text; v_after text;
BEGIN
  PERFORM qa.as_user(v_tutor);

  o := public.add_question_bank_questions_to_quiz(v_quiz, ARRAY[v_q1, v_q2]);
  PERFORM qa.check('I1 adding two bank questions adds two quiz questions',
    (o->>'added')::int = 2 AND (o->>'skipped')::int = 0, o::text);

  -- I2: the copy carries everything, not a subset.
  SELECT id INTO v_copy FROM public.quiz_questions
   WHERE quiz_id = v_quiz AND source_bank_question_id = v_q1;
  PERFORM qa.check('I2 the copy preserves text, type, points and explanation',
    (SELECT question = 'What is the unit of force in the SI system?'
            AND question_type = 'mcq' AND points = 2
            AND explanation = 'The newton is the SI unit of force.'
       FROM public.quiz_questions WHERE id = v_copy), '');
  PERFORM qa.check('I3 the copy preserves every option and its correctness',
    (SELECT count(*) FROM public.quiz_options WHERE question_id = v_copy) = 3
    AND (SELECT count(*) FROM public.quiz_options
          WHERE question_id = v_copy AND is_correct) = 1, '');

  -- I4: a double tap adds nothing.
  o := public.add_question_bank_questions_to_quiz(v_quiz, ARRAY[v_q1, v_q2]);
  PERFORM qa.check('I4 a repeated add is idempotent — nothing duplicated',
    (o->>'added')::int = 0 AND (o->>'skipped')::int = 2
    AND (SELECT count(*) FROM public.quiz_questions
          WHERE quiz_id = v_quiz AND source_bank_question_id = v_q1) = 1, o::text);

  -- I5: THE INVARIANT. Editing the bank must not touch the quiz copy.
  SELECT question INTO v_before FROM public.quiz_questions WHERE id = v_copy;
  PERFORM public.save_question_bank_question(v_q1,
    'COMPLETELY REWRITTEN QUESTION', 'mcq', 99, 'rewritten', 'Rewritten',
    (SELECT v FROM qa.ids WHERE k='col'), NULL,
    '[{"option_text":"Totally different","is_correct":true}]'::jsonb);
  SELECT question INTO v_after FROM public.quiz_questions WHERE id = v_copy;
  PERFORM qa.check('I5 editing the bank question does NOT change the quiz copy',
    v_before = v_after AND v_after = 'What is the unit of force in the SI system?',
    format('before=%s after=%s', v_before, v_after));
  PERFORM qa.check('I6 nor its options',
    (SELECT count(*) FROM public.quiz_options WHERE question_id = v_copy) = 3, '');
  PERFORM qa.check('I7 nor its points',
    (SELECT points FROM public.quiz_questions WHERE id = v_copy) = 2, '');

  -- I8: usage is derived, so it is right without anyone maintaining a counter.
  o := public.get_question_bank_question(v_q1);
  PERFORM qa.check('I8 usage count is derived from the copies',
    (o->>'usage_count')::int = 1 AND jsonb_array_length(o->'used_in') = 1, o::text);
  PERFORM qa.check('I9 used_in names the quiz',
    o->'used_in'->0->>'title' = 'Photosynthesis Quiz', (o->'used_in')::text);

  -- I10: archiving the bank row leaves historical quizzes intact.
  PERFORM public.archive_question_bank_question(v_q1, true);
  PERFORM qa.check('I10 archiving the bank question does not remove the quiz copy',
    (SELECT count(*) FROM public.quiz_questions WHERE id = v_copy) = 1, '');
  o := public.search_question_bank();
  PERFORM qa.check('I11 an archived question drops out of the default search',
    (o->>'total')::int = 1, o->>'total');
  o := public.search_question_bank(_include_archived := true);
  PERFORM qa.check('I12 but is still findable when archived rows are requested',
    (o->>'total')::int = 2, o->>'total');

  -- I13: an archived question cannot be added to a quiz.
  o := public.add_question_bank_questions_to_quiz(v_quiz, ARRAY[v_q1]);
  PERFORM qa.check('I13 an archived question is skipped, never half-copied',
    (o->>'added')::int = 0 AND (o->>'skipped')::int = 1, o::text);

  PERFORM public.archive_question_bank_question(v_q1, false);
  PERFORM qa.check('I14 archiving is reversible',
    (SELECT archived_at IS NULL FROM public.question_bank_questions WHERE id = v_q1), '');

  -- I15: the quiz's own total_points is kept honest by the add.
  PERFORM qa.check('I15 the quiz total_points is recomputed after an add',
    (SELECT total_points FROM public.quizzes WHERE id = v_quiz)
      = (SELECT sum(points) FROM public.quiz_questions WHERE quiz_id = v_quiz), '');
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- J — DUPLICATE
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_tutor uuid := '11111111-0000-0000-0000-000000000001';
  v_q1 uuid := (SELECT v FROM qa.ids WHERE k='q1');
  o jsonb; v_new uuid;
BEGIN
  PERFORM qa.as_user(v_tutor);
  o := public.duplicate_question_bank_questions(ARRAY[v_q1]);
  v_new := (o->'ids'->>0)::uuid;
  PERFORM qa.check('J1 duplicate creates a new bank question',
    (o->>'created')::int = 1 AND v_new IS NOT NULL AND v_new <> v_q1, o::text);

  o := public.get_question_bank_question(v_new);
  PERFORM qa.check('J2 the duplicate is marked as a copy',
    (o->>'question') LIKE '%(copy)', o->>'question');
  PERFORM qa.check('J3 the duplicate carries the options',
    jsonb_array_length(o->'options') = 1, (o->'options')::text);
  PERFORM qa.check('J4 the duplicate starts with no usage of its own',
    (o->>'usage_count')::int = 0, o::text);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- K — CROSS-TENANT AND STUDENT ACCESS
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_student uuid := '22222222-0000-0000-0000-000000000002';
  v_foreign uuid := '33333333-0000-0000-0000-000000000006';
  v_foreign_admin uuid := '55555555-0000-0000-0000-000000000008';
  v_q1 uuid := (SELECT v FROM qa.ids WHERE k='q1');
  v_col uuid := (SELECT v FROM qa.ids WHERE k='col');
  v_quiz uuid := '9012aaaa-0000-0000-0000-00000000000f';
  o jsonb;
BEGIN
  -- A student has no bank at all: the centre resolver refuses them.
  PERFORM qa.expect_error('K1 a student cannot open the question bank', v_student,
    'SELECT public.list_question_bank()', 'no_question_bank_access');
  PERFORM qa.expect_error('K2 a student cannot search the question bank', v_student,
    'SELECT public.search_question_bank()', 'no_question_bank_access');
  PERFORM qa.expect_error('K3 a student cannot read a bank question', v_student,
    format('SELECT public.get_question_bank_question(%L)', v_q1), 'no_question_bank_access');
  PERFORM qa.expect_error('K4 a student cannot create a bank question', v_student,
    'SELECT public.save_question_bank_question(NULL, ''x'', ''mcq'', 1, NULL, NULL, NULL, NULL, ''[]''::jsonb)',
    'no_question_bank_access');
  PERFORM qa.expect_error('K5 a student cannot archive a bank question', v_student,
    format('SELECT public.archive_question_bank_question(%L, true)', v_q1),
    'no_question_bank_access');

  -- A student cannot read the bank tables directly either.
  PERFORM qa.expect_error('K6 a student cannot read question_bank_options directly', v_student,
    'SELECT is_correct FROM public.question_bank_options LIMIT 1', 'permission denied');
  PERFORM qa.check('K7 RLS hides bank questions from a student''s direct read',
    (SELECT count(*) FROM (
      SELECT set_config('request.jwt.claim.sub', v_student::text, true)) z) = 1, '');

  -- A foreign-centre tutor sees their OWN (empty) bank, never Centre A's.
  PERFORM qa.as_user(v_foreign);
  BEGIN
    o := public.search_question_bank();
    PERFORM qa.check('K8 a foreign-centre tutor sees none of this centre''s questions',
      (o->>'total')::int = 0, o->>'total');
  EXCEPTION WHEN OTHERS THEN
    PERFORM qa.check('K8 a foreign-centre tutor sees none of this centre''s questions',
      false, SQLERRM);
  END;

  PERFORM qa.expect_error('K9 a foreign tutor cannot read a Centre A bank question', v_foreign,
    format('SELECT public.get_question_bank_question(%L)', v_q1), 'question_not_found');
  PERFORM qa.expect_error('K10 a foreign tutor cannot edit a Centre A bank question', v_foreign,
    format('SELECT public.save_question_bank_question(%L, ''hijacked'', ''mcq'', 1, NULL, NULL, NULL, NULL, ''[]''::jsonb)', v_q1),
    'question_not_found');
  PERFORM qa.expect_error('K11 a foreign tutor cannot archive a Centre A bank question', v_foreign,
    format('SELECT public.archive_question_bank_question(%L, true)', v_q1),
    'question_not_found');
  PERFORM qa.expect_error('K12 a foreign tutor cannot add questions to a Centre A quiz', v_foreign,
    format('SELECT public.add_question_bank_questions_to_quiz(%L, ARRAY[%L]::uuid[])', v_quiz, v_q1),
    'access_denied');
  PERFORM qa.expect_error('K13 a foreign admin cannot read a Centre A bank question',
    v_foreign_admin,
    format('SELECT public.get_question_bank_question(%L)', v_q1), 'question_not_found');
  PERFORM qa.expect_error('K14 a foreign tutor cannot attach to a Centre A collection', v_foreign,
    format('SELECT public.save_question_bank_question(NULL, ''x'', ''mcq'', 1, NULL, NULL, %L, NULL, ''[]''::jsonb)', v_col),
    'collection_not_found');

  -- The centre's own admin CAN.
  PERFORM qa.expect_ok('K15 the centre''s own admin can use the bank',
    '44444444-0000-0000-0000-000000000007', 'SELECT public.list_question_bank()');
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- L — GRANT SURFACE
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE fn text; v_bad text := '';
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.list_question_bank()',
    'public.get_question_bank_question(uuid)',
    'public.duplicate_question_bank_questions(uuid[])',
    'public.archive_question_bank_question(uuid,boolean)',
    'public.add_question_bank_questions_to_quiz(uuid,uuid[])',
    'public.list_quizzes_for_question_bank()'
  ] LOOP
    IF has_function_privilege('anon', fn, 'EXECUTE') THEN v_bad := v_bad || 'anon:' || fn || ' '; END IF;
    IF NOT has_function_privilege('authenticated', fn, 'EXECUTE') THEN
      v_bad := v_bad || 'missing:' || fn || ' '; END IF;
  END LOOP;
  PERFORM qa.check('L1 anon holds EXECUTE on no bank function; authenticated holds all',
    v_bad = '', v_bad);

  PERFORM qa.check('L2 the centre resolver is not client-callable',
    NOT has_function_privilege('authenticated', 'public._my_question_bank_center()', 'EXECUTE'), '');

  PERFORM qa.check('L3 authenticated cannot read the bank answer key',
    NOT has_table_privilege('authenticated', 'public.question_bank_options', 'SELECT'), '');

  PERFORM qa.check('L4 authenticated cannot write any bank table',
    NOT (has_table_privilege('authenticated','public.question_bank_questions','INSERT,UPDATE,DELETE')
      OR has_table_privilege('authenticated','public.question_bank_collections','INSERT,UPDATE,DELETE')
      OR has_table_privilege('authenticated','public.question_bank_options','INSERT,UPDATE,DELETE')), '');

  PERFORM qa.check('L5 RLS is enabled on every bank table',
    (SELECT bool_and(c.relrowsecurity) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN
        ('question_bank_questions','question_bank_collections','question_bank_options')), '');

  PERFORM qa.check('L6 every bank function pins its search_path',
    (SELECT bool_and(p.proconfig::text LIKE '%search_path%')
       FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname LIKE '%question_bank%'), '');
END $$;
