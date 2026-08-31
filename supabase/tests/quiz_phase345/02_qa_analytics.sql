-- Phase 3 analytics QA. Exact numbers, checked against a seed designed so the
-- right answers are known by hand.
\set QUIET on
\pset pager off
\set ON_ERROR_STOP off

CREATE SCHEMA IF NOT EXISTS qa;
CREATE TABLE IF NOT EXISTS qa.results (n serial PRIMARY KEY, label text, ok boolean, detail text);
TRUNCATE qa.results;

CREATE OR REPLACE FUNCTION qa.check(_label text, _ok boolean, _detail text DEFAULT '')
RETURNS void LANGUAGE sql AS $$
  INSERT INTO qa.results (label, ok, detail) VALUES (_label, _ok, _detail) $$;

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

CREATE OR REPLACE FUNCTION qa.as_user(_uid uuid) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  PERFORM set_config('request.jwt.claim.sub', _uid::text, true); END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- A — OVERVIEW
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_quiz uuid := '9012aaaa-0000-0000-0000-00000000000f';
  v_tutor uuid := '11111111-0000-0000-0000-000000000001';
  o jsonb;
BEGIN
  PERFORM qa.as_user(v_tutor);
  o := public.get_quiz_analytics_overview(v_quiz);

  PERFORM qa.check('A1 participants counts distinct students with a result',
    (o->>'participants')::int = 3, o->>'participants');
  PERFORM qa.check('A2 eligible students counts active enrolments',
    (o->>'eligible_students')::int = 4, o->>'eligible_students');
  -- 100 + 50 + 50 = 200 / 3 = 66.67 -> 67
  PERFORM qa.check('A3 average score is the mean of each student''s best result',
    (o->>'avg_score_pct')::int = 67, o->>'avg_score_pct');
  -- 3 of 4 enrolled students finished = 75%
  PERFORM qa.check('A4 completion is participants over eligible students',
    (o->>'completion_pct')::int = 75, o->>'completion_pct');
  PERFORM qa.check('A5 question count is real', (o->>'question_count')::int = 4, o->>'question_count');
  -- attempts took 24s, 40s, 52s over 4 questions -> (6 + 10 + 13)/3 = 9.7
  PERFORM qa.check('A6 average seconds per question is derived from attempt timestamps',
    round((o->>'avg_seconds_per_question')::numeric, 1) = 9.7, o->>'avg_seconds_per_question');
  PERFORM qa.check('A7 distribution has four bands summing to the participant count',
    (SELECT sum((d->>'count')::int) FROM jsonb_array_elements(o->'distribution') d) = 3
    AND jsonb_array_length(o->'distribution') = 4, (o->'distribution')::text);
  -- One student at 100 (80-100 band), two at 50 (40-59 band).
  PERFORM qa.check('A8 distribution buckets land in the right bands',
    (SELECT (d->>'count')::int FROM jsonb_array_elements(o->'distribution') d
      WHERE d->>'band' = '80-100') = 1
    AND (SELECT (d->>'count')::int FROM jsonb_array_elements(o->'distribution') d
      WHERE d->>'band' = '40-59') = 2, (o->'distribution')::text);
  PERFORM qa.check('A9 there is no fabricated time series',
    NOT (o ? 'trend') AND NOT (o ? 'series'), 'no trend key');
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- B — QUESTION ANALYTICS
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_quiz uuid := '9012aaaa-0000-0000-0000-00000000000f';
  v_tutor uuid := '11111111-0000-0000-0000-000000000001';
  o jsonb; q jsonb;
BEGIN
  PERFORM qa.as_user(v_tutor);
  o := public.get_quiz_question_analytics(v_quiz);

  PERFORM qa.check('B1 every question is returned, in order',
    jsonb_array_length(o->'questions') = 4
    AND (o->'questions'->0->>'index')::int = 0
    AND (o->'questions'->3->>'index')::int = 3, '');

  q := o->'questions'->0;
  PERFORM qa.check('B2 Q1 is 100% and classified strong',
    (q->>'accuracy_pct')::int = 100 AND q->>'band' = 'strong', q::text);

  q := o->'questions'->2;
  PERFORM qa.check('B3 Q3 is 33% and classified difficult',
    (q->>'accuracy_pct')::int = 33 AND q->>'band' = 'difficult', q::text);
  PERFORM qa.check('B4 Q3 reports two incorrect students',
    (q->>'incorrect')::int = 2 AND (q->>'answered')::int = 3, q::text);

  -- Option distribution for Q3: Chloroplast 1, Mitochondrion 1, Nucleus 1.
  PERFORM qa.check('B5 option counts sum to the answered count',
    (SELECT sum((x->>'count')::int) FROM jsonb_array_elements(q->'options') x) = 3,
    (q->'options')::text);
  PERFORM qa.check('B6 the correct option is flagged for staff',
    (SELECT count(*) FROM jsonb_array_elements(q->'options') x
      WHERE (x->>'is_correct')::boolean) = 1, (q->'options')::text);
  PERFORM qa.check('B7 option percentages are of answers given',
    (SELECT (x->>'pct')::int FROM jsonb_array_elements(q->'options') x
      WHERE x->>'text' = 'Chloroplast') = 33, (q->'options')::text);

  q := o->'questions'->3;
  PERFORM qa.check('B8 a true/false question still reports accuracy',
    (q->>'accuracy_pct')::int = 67 AND q->>'question_type' = 'true_false', q::text);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- C — STUDENT LIST AND REPORT
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_quiz uuid := '9012aaaa-0000-0000-0000-00000000000f';
  v_tutor uuid := '11111111-0000-0000-0000-000000000001';
  v_melvin uuid := '22222222-0000-0000-0000-000000000004';
  o jsonb; s jsonb;
BEGIN
  PERFORM qa.as_user(v_tutor);
  o := public.get_quiz_student_analytics(v_quiz);

  PERFORM qa.check('C1 one row per student who has a result',
    jsonb_array_length(o->'students') = 3, '');
  s := o->'students'->0;
  PERFORM qa.check('C2 ranked by accuracy, best first',
    s->>'display_name' = 'Aisyah Ahmad' AND (s->>'rank')::int = 1
    AND (s->>'accuracy_pct')::int = 100, s::text);
  PERFORM qa.check('C3 weak-question count is real',
    (SELECT (x->>'weak_questions')::int FROM jsonb_array_elements(o->'students') x
      WHERE x->>'display_name' = 'Marcus Tan') = 2, (o->'students')::text);
  PERFORM qa.check('C4 a student who never attempted is absent, not zero-scored',
    NOT ((o->'students')::text LIKE '%Sarah Lim%'), '');
  PERFORM qa.check('C5 per-student average time is derived, not invented',
    (SELECT (x->>'avg_seconds_per_question')::numeric FROM jsonb_array_elements(o->'students') x
      WHERE x->>'display_name' = 'Aisyah Ahmad') = 6.0, (o->'students')::text);

  o := public.get_student_quiz_report(v_quiz, v_melvin);
  PERFORM qa.check('C6 the report names the student',
    o->'student'->>'display_name' = 'Melvin Lee', (o->'student')::text);
  PERFORM qa.check('C7 the report carries every question, answered or not',
    jsonb_array_length(o->'breakdown') = 4, '');
  PERFORM qa.check('C8 correctness in the breakdown matches the stored answers',
    (SELECT count(*) FROM jsonb_array_elements(o->'breakdown') x
      WHERE (x->>'is_correct')::boolean) = 2, (o->'breakdown')::text);
  PERFORM qa.check('C9 rank is computed against the cohort',
    (o->'result'->>'rank')::int BETWEEN 2 AND 3, (o->'result')::text);
  PERFORM qa.check('C10 accuracy matches the stored percentage',
    (o->'result'->>'accuracy_pct')::int = 50, (o->'result')::text);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- D — QUESTION RESPONSES
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_quiz uuid := '9012aaaa-0000-0000-0000-00000000000f';
  v_q3   uuid := '90120003-0000-0000-0000-000000000003';
  v_tutor uuid := '11111111-0000-0000-0000-000000000001';
  o jsonb;
BEGIN
  PERFORM qa.as_user(v_tutor);
  o := public.get_quiz_question_responses(v_quiz, v_q3);
  PERFORM qa.check('D1 every participant appears in the response list',
    jsonb_array_length(o->'responses') = 3, '');
  PERFORM qa.check('D2 responses carry the chosen option text',
    (SELECT count(*) FROM jsonb_array_elements(o->'responses') x
      WHERE x->>'selected_option_text' IS NOT NULL) = 3, (o->'responses')::text);
  PERFORM qa.check('D3 exactly one response is correct for Q3',
    (SELECT count(*) FROM jsonb_array_elements(o->'responses') x
      WHERE (x->>'is_correct')::boolean) = 1, (o->'responses')::text);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- E — PERMISSIONS (the part that matters)
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_quiz uuid := '9012aaaa-0000-0000-0000-00000000000f';
  v_q3 uuid := '90120003-0000-0000-0000-000000000003';
  v_student uuid := '22222222-0000-0000-0000-000000000002';
  v_foreign_tutor uuid := '33333333-0000-0000-0000-000000000006';
  v_foreign_admin uuid := '55555555-0000-0000-0000-000000000008';
  v_admin_a uuid := '44444444-0000-0000-0000-000000000007';
  v_melvin uuid := '22222222-0000-0000-0000-000000000004';
  o jsonb;
BEGIN
  PERFORM qa.expect_error('E1 a student cannot read the analytics overview', v_student,
    format('SELECT public.get_quiz_analytics_overview(%L)', v_quiz), 'access_denied');
  PERFORM qa.expect_error('E2 a student cannot read question analytics', v_student,
    format('SELECT public.get_quiz_question_analytics(%L)', v_quiz), 'access_denied');
  PERFORM qa.expect_error('E3 a student cannot list the cohort', v_student,
    format('SELECT public.get_quiz_student_analytics(%L)', v_quiz), 'access_denied');
  PERFORM qa.expect_error('E4 a student cannot read another student''s report', v_student,
    format('SELECT public.get_student_quiz_report(%L, %L)', v_quiz, v_melvin), 'access_denied');
  PERFORM qa.expect_error('E5 a student cannot read per-question responses', v_student,
    format('SELECT public.get_quiz_question_responses(%L, %L)', v_quiz, v_q3), 'access_denied');

  PERFORM qa.expect_error('E6 a foreign-centre tutor is refused', v_foreign_tutor,
    format('SELECT public.get_quiz_analytics_overview(%L)', v_quiz), 'access_denied');
  PERFORM qa.expect_error('E7 a foreign-centre admin is refused', v_foreign_admin,
    format('SELECT public.get_quiz_student_analytics(%L)', v_quiz), 'access_denied');

  -- The centre's own admin IS allowed — centre-scoped, not class-scoped.
  PERFORM qa.as_user(v_admin_a);
  BEGIN
    o := public.get_quiz_analytics_overview(v_quiz);
    PERFORM qa.check('E8 the centre''s own admin can read analytics',
      (o->>'participants')::int = 3, '');
  EXCEPTION WHEN OTHERS THEN
    PERFORM qa.check('E8 the centre''s own admin can read analytics', false, SQLERRM);
  END;

  PERFORM qa.expect_error('E9 an unknown quiz id is refused, not empty', v_foreign_tutor,
    'SELECT public.get_quiz_analytics_overview(''00000000-0000-0000-0000-000000000000'')',
    'quiz_not_found');
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- F — GRANT SURFACE
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE fn text; v_bad text := '';
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.get_quiz_analytics_overview(uuid)',
    'public.get_quiz_question_analytics(uuid)',
    'public.get_quiz_student_analytics(uuid)',
    'public.get_student_quiz_report(uuid,uuid)',
    'public.get_quiz_question_responses(uuid,uuid)'
  ] LOOP
    IF has_function_privilege('anon', fn, 'EXECUTE') THEN v_bad := v_bad || fn || ' '; END IF;
    IF NOT has_function_privilege('authenticated', fn, 'EXECUTE') THEN
      v_bad := v_bad || 'missing:' || fn || ' '; END IF;
  END LOOP;
  PERFORM qa.check('F1 anon holds EXECUTE on no analytics function, authenticated holds all',
    v_bad = '', v_bad);

  PERFORM qa.check('F2 the internal guard is not client-callable',
    NOT has_function_privilege('authenticated', 'public._quiz_for_analytics(uuid)', 'EXECUTE'), '');

  PERFORM qa.check('F3 every analytics function pins its search_path',
    (SELECT bool_and(p.proconfig::text LIKE '%search_path%')
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN ('get_quiz_analytics_overview','get_quiz_question_analytics',
                          'get_quiz_student_analytics','get_student_quiz_report',
                          'get_quiz_question_responses','_quiz_for_analytics')), '');

  PERFORM qa.check('F4 difficulty thresholds live in one server-side function',
    public.quiz_difficulty_band(41) = 'difficult'
    AND public.quiz_difficulty_band(67) = 'moderate'
    AND public.quiz_difficulty_band(82) = 'strong'
    AND public.quiz_difficulty_band(NULL) = 'unknown', '');
END $$;
