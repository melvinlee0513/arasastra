-- ============================================================================
-- Aras A+ — Phase 3A flashcard access-control regression suite
--
-- STATUS: WRITTEN [W] — NOT EXECUTED against the production database.
--   Execution requires isolated QA fixtures (two tenants, classes, tutors,
--   students) and mutation privileges; the sandbox DB role is read/insert only
--   and no authenticated QA session is currently injected.
--
-- Run with psql as a superuser/service role against a disposable branch:
--   psql -f tests/rls/rls_flashcards_phase3a.sql
--
-- Each case sets request.jwt.claims + role to simulate a real caller so RLS and
-- the SECURITY DEFINER RPC guards are exercised exactly as in production.
-- ============================================================================

BEGIN;

-- ─── Fixtures ───────────────────────────────────────────────────────────────
\set centreA '''11111111-1111-1111-1111-111111111111'''
\set centreB '''22222222-2222-2222-2222-222222222222'''
\set classA  '''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'''
\set classA2 '''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab'''
\set classB  '''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'''
\set tutorA  '''10000000-0000-0000-0000-000000000001'''  -- assigned to classA
\set tutorA2 '''10000000-0000-0000-0000-000000000002'''  -- centre A, unassigned
\set adminA  '''10000000-0000-0000-0000-00000000000a'''
\set adminB  '''20000000-0000-0000-0000-00000000000a'''
\set stuEnr  '''10000000-0000-0000-0000-0000000000e1'''  -- enrolled in classA
\set stuUnen '''10000000-0000-0000-0000-0000000000e2'''  -- centre A, not enrolled
\set stuB    '''20000000-0000-0000-0000-0000000000e1'''  -- centre B student

CREATE OR REPLACE FUNCTION pg_temp.act_as(_uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _uid, 'role', 'authenticated')::text, true);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.act_anon() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role', 'anon', true);
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.expect_fail(_sql text, _label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE _sql;
    RAISE EXCEPTION 'FAIL: % unexpectedly succeeded', _label;
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS: % correctly denied (%)', _label, SQLERRM;
  END;
END $$;

-- NOTE: fixture INSERTs (tuition_centers, classes, class_tutors,
-- class_enrollments, profiles, user_roles) must be created here as the
-- table owner before the cases below. Omitted deliberately so this file
-- cannot be run against production data by accident.

-- ─── 1. Assigned tutor can create a draft deck ──────────────────────────────
SELECT pg_temp.act_as(:tutorA::uuid);
SELECT save_flashcard_deck(:classA::uuid, '{"title":"Draft A","cards":[]}'::jsonb) AS case_01_assigned_tutor_draft;

-- ─── 2. Unassigned tutor denied ─────────────────────────────────────────────
SELECT pg_temp.act_as(:tutorA2::uuid);
SELECT pg_temp.expect_fail(
  format('SELECT save_flashcard_deck(%s::uuid, ''{"title":"Nope","cards":[]}''::jsonb)', :classA),
  'case_02 unassigned tutor create');

-- ─── 3. Same-centre admin allowed without tutor assignment ──────────────────
SELECT pg_temp.act_as(:adminA::uuid);
SELECT save_flashcard_deck(:classA2::uuid, '{"title":"Admin deck","cards":[{"front":"f","back":"b"}]}'::jsonb, NULL, true)
  AS case_03_same_centre_admin_publish;

-- ─── 4. Foreign-tenant admin denied ─────────────────────────────────────────
SELECT pg_temp.act_as(:adminB::uuid);
SELECT pg_temp.expect_fail(
  format('SELECT save_flashcard_deck(%s::uuid, ''{"title":"X","cards":[]}''::jsonb)', :classA),
  'case_04 foreign admin create');
SELECT pg_temp.expect_fail(
  format('SELECT list_class_flashcard_decks_for_manager(%s::uuid)', :classA),
  'case_04b foreign admin list');

-- ─── 5. Student cannot create or edit ───────────────────────────────────────
SELECT pg_temp.act_as(:stuEnr::uuid);
SELECT pg_temp.expect_fail(
  format('SELECT save_flashcard_deck(%s::uuid, ''{"title":"S","cards":[]}''::jsonb)', :classA),
  'case_05 student create via rpc');
SELECT pg_temp.expect_fail(
  format('INSERT INTO public.flashcard_decks(center_id, class_id, title) VALUES (%s::uuid, %s::uuid, ''hack'')', :centreA, :classA),
  'case_05b student direct insert');

-- ─── 6/7. Enrolled student sees published decks only ────────────────────────
SELECT pg_temp.act_as(:stuEnr::uuid);
SELECT list_class_flashcard_decks_for_student(:classA::uuid) AS case_06_student_published_list;
-- expect: only status='published' decks, never the Draft A deck from case 1
SELECT count(*) AS case_07_draft_visible_must_be_zero
FROM public.flashcard_decks WHERE class_id = :classA::uuid AND status <> 'published';

-- ─── 8. Unenrolled same-centre student denied ───────────────────────────────
SELECT pg_temp.act_as(:stuUnen::uuid);
SELECT pg_temp.expect_fail(
  format('SELECT list_class_flashcard_decks_for_student(%s::uuid)', :classA),
  'case_08 unenrolled student list');

-- ─── 9. Foreign-tenant student denied ───────────────────────────────────────
SELECT pg_temp.act_as(:stuB::uuid);
SELECT pg_temp.expect_fail(
  format('SELECT list_class_flashcard_decks_for_student(%s::uuid)', :classA),
  'case_09 foreign student list');

-- ─── 10/11. Feature flag disabled blocks writes and reads ───────────────────
RESET role;
UPDATE public.tuition_centers SET feature_flags = feature_flags || '{"flashcards":false}'::jsonb WHERE id = :centreA::uuid;

SELECT pg_temp.act_as(:tutorA::uuid);
SELECT pg_temp.expect_fail(
  format('SELECT save_flashcard_deck(%s::uuid, ''{"title":"Blocked","cards":[]}''::jsonb)', :classA),
  'case_10 manager write with flag off');

SELECT pg_temp.act_as(:stuEnr::uuid);
SELECT pg_temp.expect_fail(
  format('SELECT list_class_flashcard_decks_for_student(%s::uuid)', :classA),
  'case_11 student read with flag off');
SELECT count(*) AS case_11b_direct_select_must_be_zero FROM public.flashcard_decks WHERE class_id = :classA::uuid;

RESET role;
UPDATE public.tuition_centers SET feature_flags = feature_flags || '{"flashcards":true}'::jsonb WHERE id = :centreA::uuid;

-- ─── 12/13. Publication validation ──────────────────────────────────────────
SELECT pg_temp.act_as(:tutorA::uuid);
SELECT pg_temp.expect_fail(
  format('SELECT save_flashcard_deck(%s::uuid, ''{"title":"","cards":[{"front":"f","back":"b"}]}''::jsonb, NULL, true)', :classA),
  'case_12 publish without title');
SELECT pg_temp.expect_fail(
  format('SELECT save_flashcard_deck(%s::uuid, ''{"title":"T","cards":[]}''::jsonb, NULL, true)', :classA),
  'case_12b publish with zero cards');
SELECT pg_temp.expect_fail(
  format('SELECT save_flashcard_deck(%s::uuid, ''{"title":"T","cards":[{"front":"f","back":"  "}]}''::jsonb, NULL, true)', :classA),
  'case_13 publish with empty card back');

-- ─── 14. Foreign deck / card IDs rejected ───────────────────────────────────
SELECT pg_temp.act_as(:tutorA::uuid);
SELECT pg_temp.expect_fail(
  format('SELECT save_flashcard_deck(%s::uuid, ''{"title":"T","cards":[]}''::jsonb, %s::uuid)',
         :classA, '''bbbbbbbb-0000-0000-0000-00000000dddd'''),
  'case_14 foreign deck id on save');
SELECT pg_temp.expect_fail(
  'SELECT get_flashcard_deck_for_manager(''bbbbbbbb-0000-0000-0000-00000000dddd''::uuid)',
  'case_14b foreign deck fetch');

-- ─── 15. Card ordering preserved ────────────────────────────────────────────
SELECT pg_temp.act_as(:tutorA::uuid);
SELECT save_flashcard_deck(:classA::uuid,
  '{"title":"Ordered","cards":[{"front":"1","back":"a"},{"front":"2","back":"b"},{"front":"3","back":"c"}]}'::jsonb,
  NULL, true) AS case_15_setup;
-- expect fronts 1,2,3 with display_order 0,1,2 in this exact order
SELECT jsonb_path_query_array(
  (SELECT get_flashcard_deck_for_manager(id) FROM public.flashcard_decks
    WHERE class_id = :classA::uuid AND title = 'Ordered' LIMIT 1),
  '$.cards[*].front') AS case_15_card_order;

-- ─── 16. Duplicate creates a clean draft ────────────────────────────────────
SELECT duplicate_flashcard_deck_as_draft(
  (SELECT id FROM public.flashcard_decks WHERE class_id = :classA::uuid AND title = 'Ordered' LIMIT 1)
) AS case_16_duplicate_deck_id;
SELECT status, title FROM public.flashcard_decks
WHERE class_id = :classA::uuid AND title = 'Ordered (copy)';  -- expect status='draft'

-- ─── 17. Anonymous access denied ────────────────────────────────────────────
SELECT pg_temp.act_anon();
SELECT pg_temp.expect_fail('SELECT * FROM public.flashcard_decks LIMIT 1', 'case_17 anon select decks');
SELECT pg_temp.expect_fail('SELECT * FROM public.flashcards LIMIT 1', 'case_17b anon select cards');
SELECT pg_temp.expect_fail(
  format('SELECT list_class_flashcard_decks_for_student(%s::uuid)', :classA), 'case_17c anon student rpc');
SELECT pg_temp.expect_fail(
  format('SELECT list_class_flashcard_decks_for_manager(%s::uuid)', :classA), 'case_17d anon manager rpc');
SELECT pg_temp.expect_fail(
  'SELECT record_flashcard_deck_completion(''aaaaaaaa-0000-0000-0000-00000000cccc''::uuid)',
  'case_17e anon activity rpc');

-- ─── 18. XP completion deduplicated ─────────────────────────────────────────
SELECT pg_temp.act_as(:stuEnr::uuid);
WITH deck AS (
  SELECT id FROM public.flashcard_decks WHERE class_id = :classA::uuid AND status = 'published' LIMIT 1
)
SELECT record_flashcard_deck_completion((SELECT id FROM deck)) AS case_18_first_award;   -- expect awarded=true
WITH deck AS (
  SELECT id FROM public.flashcard_decks WHERE class_id = :classA::uuid AND status = 'published' LIMIT 1
)
SELECT record_flashcard_deck_completion((SELECT id FROM deck)) AS case_18b_repeat;       -- expect awarded=false
SELECT count(*) AS case_18c_xp_rows_must_be_one
FROM public.student_xp_events
WHERE student_user_id = :stuEnr::uuid AND event_type = 'flashcard_completed';

ROLLBACK;
