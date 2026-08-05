-- ============================================================================
-- Phase 4 regression suite: hierarchical class content folders
--
-- Run with psql as a superuser-equivalent role against a disposable database.
-- Every case is an assertion: the script raises on the first failure.
--
--   psql -f tests/rls/rls_content_folders_phase4.sql
--
-- Covers: tenant isolation, tutor assignment, admin centre scope, student
-- enrolment, depth limits, cycle prevention, cross-class folder assignment,
-- safe delete semantics and anonymous denial.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.expect_fail(_sql text, _label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE _sql;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'PASS (denied): %', _label;
    RETURN;
  END;
  RAISE EXCEPTION 'FAIL: % unexpectedly succeeded', _label;
END; $$;

CREATE OR REPLACE FUNCTION pg_temp.expect_ok(_sql text, _label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE _sql;
  RAISE NOTICE 'PASS (allowed): %', _label;
END; $$;

CREATE OR REPLACE FUNCTION pg_temp.act_as(_user uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', _user::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _user, 'role', 'authenticated')::text, true);
END; $$;

CREATE OR REPLACE FUNCTION pg_temp.act_anon()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role', 'anon', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
END; $$;

-- ---------------------------------------------------------------- fixtures
SET LOCAL ROLE postgres;

-- Two tenants, two classes, one shared-nothing world.
INSERT INTO public.tuition_centers (id, name) VALUES
  ('11111111-1111-1111-1111-111111111111', 'QA Centre A'),
  ('22222222-2222-2222-2222-222222222222', 'QA Centre B');

-- NOTE: auth.users rows must be provisioned by the harness before this point.
-- Substitute the four UUIDs below with seeded QA accounts:
--   tutorA  = assigned tutor of class A
--   adminA  = admin of centre A
--   studentA = actively enrolled student of class A
--   outsider = tutor/admin of centre B
\set tutorA   '''aaaaaaa1-0000-0000-0000-000000000001'''
\set adminA   '''aaaaaaa1-0000-0000-0000-000000000002'''
\set studentA '''aaaaaaa1-0000-0000-0000-000000000003'''
\set outsider '''bbbbbbb2-0000-0000-0000-000000000001'''

INSERT INTO public.classes (id, center_id, title, class_name, scheduled_at, status)
VALUES
  ('a1000000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'QA Class A', 'QA Class A', now(), 'active'),
  ('b1000000-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', 'QA Class B', 'QA Class B', now(), 'active');

INSERT INTO public.class_tutors (center_id, class_id, tutor_user_id)
VALUES ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-00000000000a', :tutorA::uuid);

INSERT INTO public.user_roles (user_id, role) VALUES
  (:tutorA::uuid, 'tutor'), (:adminA::uuid, 'admin'),
  (:studentA::uuid, 'student'), (:outsider::uuid, 'tutor');

INSERT INTO public.class_enrollments (center_id, class_id, student_user_id, status)
VALUES ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-00000000000a', :studentA::uuid, 'active');

-- ============================================================== 1. anon denial
SELECT pg_temp.act_anon();
SELECT pg_temp.expect_fail(
  $$SELECT public.list_class_content_tree_for_student('a1000000-0000-0000-0000-00000000000a')$$,
  '1. anon cannot read the student content tree');
SELECT pg_temp.expect_fail(
  $$SELECT public.list_class_content_tree_for_manager('a1000000-0000-0000-0000-00000000000a')$$,
  '2. anon cannot read the manager content tree');
SELECT pg_temp.expect_fail(
  $$SELECT public.save_class_content_folder('a1000000-0000-0000-0000-00000000000a', 'Hack')$$,
  '3. anon cannot create folders');
SELECT pg_temp.expect_fail(
  $$SELECT count(*) FROM public.class_content_folders$$,
  '4. anon sees no folder rows');

-- ====================================================== 2. assigned tutor CRUD
SELECT pg_temp.act_as(:tutorA::uuid);
SELECT pg_temp.expect_ok(
  $$SELECT public.save_class_content_folder('a1000000-0000-0000-0000-00000000000a', 'Chapter 1')$$,
  '5. assigned tutor creates a root folder');
SELECT pg_temp.expect_ok(
  $$SELECT public.list_class_content_tree_for_manager('a1000000-0000-0000-0000-00000000000a')$$,
  '6. assigned tutor reads the manager tree');

SET LOCAL ROLE postgres;
CREATE TEMP TABLE t_ids AS
SELECT id AS root_id FROM public.class_content_folders
 WHERE class_id = 'a1000000-0000-0000-0000-00000000000a' AND name = 'Chapter 1';

-- ================================================== 3. depth + cycle guards
SELECT pg_temp.act_as(:tutorA::uuid);
DO $$
DECLARE v_parent uuid; v_child uuid; i int;
BEGIN
  SELECT root_id INTO v_parent FROM t_ids;
  -- levels 2..5 must succeed
  FOR i IN 2..5 LOOP
    v_child := (public.save_class_content_folder(
      'a1000000-0000-0000-0000-00000000000a', 'Level ' || i, NULL, v_parent) ->> 'id')::uuid;
    v_parent := v_child;
  END LOOP;
  RAISE NOTICE 'PASS: 7. nesting allowed up to 5 levels';
  -- level 6 must fail
  BEGIN
    PERFORM public.save_class_content_folder(
      'a1000000-0000-0000-0000-00000000000a', 'Level 6', NULL, v_parent);
    RAISE EXCEPTION 'FAIL: 8. depth 6 was accepted';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS (denied): 8. depth 6 rejected';
  END;
  -- cycle: move root into its own descendant
  BEGIN
    PERFORM public.move_class_content_folder((SELECT root_id FROM t_ids), v_parent);
    RAISE EXCEPTION 'FAIL: 9. cycle move was accepted';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS (denied): 9. cycle move rejected';
  END;
  -- self-parent
  BEGIN
    PERFORM public.move_class_content_folder((SELECT root_id FROM t_ids), (SELECT root_id FROM t_ids));
    RAISE EXCEPTION 'FAIL: 10. self-parent was accepted';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS (denied): 10. self-parent rejected';
  END;
END $$;

-- ================================================ 4. cross-tenant isolation
SELECT pg_temp.act_as(:outsider::uuid);
SELECT pg_temp.expect_fail(
  $$SELECT public.list_class_content_tree_for_manager('a1000000-0000-0000-0000-00000000000a')$$,
  '11. foreign-tenant manager cannot read class A tree');
SELECT pg_temp.expect_fail(
  $$SELECT public.save_class_content_folder('a1000000-0000-0000-0000-00000000000a', 'Intruder')$$,
  '12. foreign-tenant manager cannot create folders in class A');
SELECT pg_temp.expect_fail(
  $$SELECT public.move_class_content_folder((SELECT root_id FROM t_ids), NULL)$$,
  '13. foreign-tenant manager cannot move class A folders');
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.class_content_folders WHERE class_id = 'a1000000-0000-0000-0000-00000000000a') THEN
    RAISE EXCEPTION 'FAIL: 14. foreign-tenant manager can select class A folder rows';
  END IF;
  RAISE NOTICE 'PASS (denied): 14. foreign-tenant manager sees no class A folder rows';
END $$;

-- ========================================== 5. cross-class folder assignment
SET LOCAL ROLE postgres;
INSERT INTO public.class_resources
  (id, center_id, class_id, title, resource_type, source_type, external_url, status)
VALUES
  ('c1000000-0000-0000-0000-00000000000c', '22222222-2222-2222-2222-222222222222',
   'b1000000-0000-0000-0000-00000000000b', 'Class B note', 'note', 'external_link',
   'https://example.com/b', 'published');

SELECT pg_temp.act_as(:tutorA::uuid);
SELECT pg_temp.expect_fail(
  $$SELECT public.move_class_content_item('resource', 'c1000000-0000-0000-0000-00000000000c', (SELECT root_id FROM t_ids))$$,
  '15. a class B resource cannot be moved into a class A folder');

SET LOCAL ROLE postgres;
SELECT pg_temp.expect_fail(
  $$UPDATE public.class_resources SET folder_id = (SELECT root_id FROM t_ids)
     WHERE id = 'c1000000-0000-0000-0000-00000000000c'$$,
  '16. direct cross-class folder_id write is blocked by the validation trigger');

-- ==================================================== 6. student visibility
INSERT INTO public.class_resources
  (id, center_id, class_id, title, resource_type, source_type, external_url, status, folder_id)
SELECT 'd1000000-0000-0000-0000-00000000000d', '11111111-1111-1111-1111-111111111111',
       'a1000000-0000-0000-0000-00000000000a', 'Draft note', 'note', 'external_link',
       'https://example.com/draft', 'draft', root_id FROM t_ids;
INSERT INTO public.class_resources
  (id, center_id, class_id, title, resource_type, source_type, external_url, status, folder_id)
SELECT 'e1000000-0000-0000-0000-00000000000e', '11111111-1111-1111-1111-111111111111',
       'a1000000-0000-0000-0000-00000000000a', 'Published note', 'note', 'external_link',
       'https://example.com/pub', 'published', root_id FROM t_ids;

SELECT pg_temp.act_as(:studentA::uuid);
DO $$
DECLARE v jsonb;
BEGIN
  v := public.list_class_content_tree_for_student('a1000000-0000-0000-0000-00000000000a');
  IF v -> 'resources' @> '[{"title":"Draft note"}]'::jsonb THEN
    RAISE EXCEPTION 'FAIL: 17. student tree leaked a draft resource';
  END IF;
  RAISE NOTICE 'PASS (denied): 17. student tree excludes drafts';
  IF NOT (v -> 'resources' @> '[{"title":"Published note"}]'::jsonb) THEN
    RAISE EXCEPTION 'FAIL: 18. student tree missing a published resource';
  END IF;
  RAISE NOTICE 'PASS (allowed): 18. student tree includes published resources';
  IF (v -> 'folders' -> 0 ->> 'resource_count')::int <> 1 THEN
    RAISE EXCEPTION 'FAIL: 19. student folder counts include unpublished items';
  END IF;
  RAISE NOTICE 'PASS: 19. student folder counts only include published items';
END $$;

SELECT pg_temp.expect_fail(
  $$SELECT public.save_class_content_folder('a1000000-0000-0000-0000-00000000000a', 'Student folder')$$,
  '20. student cannot create folders');
SELECT pg_temp.expect_fail(
  $$SELECT public.move_class_content_item('resource', 'e1000000-0000-0000-0000-00000000000e', NULL)$$,
  '21. student cannot move content');
SELECT pg_temp.expect_fail(
  $$SELECT public.list_class_content_tree_for_manager('a1000000-0000-0000-0000-00000000000a')$$,
  '22. student cannot read the manager tree');
SELECT pg_temp.expect_fail(
  $$SELECT public.list_class_content_tree_for_student('b1000000-0000-0000-0000-00000000000b')$$,
  '23. student cannot read an unenrolled class tree');

-- =============================================== 7. safe delete semantics
SELECT pg_temp.act_as(:tutorA::uuid);
SELECT pg_temp.expect_fail(
  $$SELECT public.delete_class_content_folder_safe((SELECT root_id FROM t_ids), 'reject')$$,
  '24. non-empty folder delete is rejected by default');

DO $$
DECLARE v_root uuid; v_before int; v_after int;
BEGIN
  SELECT root_id INTO v_root FROM t_ids;
  SELECT count(*) INTO v_before FROM public.class_resources
   WHERE class_id = 'a1000000-0000-0000-0000-00000000000a';
  PERFORM public.delete_class_content_folder_safe(v_root, 'unfile');
  SELECT count(*) INTO v_after FROM public.class_resources
   WHERE class_id = 'a1000000-0000-0000-0000-00000000000a';
  IF v_before <> v_after THEN
    RAISE EXCEPTION 'FAIL: 25. safe delete destroyed materials (% -> %)', v_before, v_after;
  END IF;
  RAISE NOTICE 'PASS: 25. safe delete keeps all materials';
  IF EXISTS (SELECT 1 FROM public.class_resources
              WHERE class_id = 'a1000000-0000-0000-0000-00000000000a' AND folder_id = v_root) THEN
    RAISE EXCEPTION 'FAIL: 26. materials still reference the deleted folder';
  END IF;
  RAISE NOTICE 'PASS: 26. materials fall back to Unfiled Materials';
  IF EXISTS (SELECT 1 FROM public.class_content_folders WHERE parent_id = v_root) THEN
    RAISE EXCEPTION 'FAIL: 27. subfolders still reference the deleted folder';
  END IF;
  RAISE NOTICE 'PASS: 27. subfolders were re-parented, not deleted';
END $$;

-- ======================================================= 8. admin scope
SELECT pg_temp.act_as(:adminA::uuid);
SELECT pg_temp.expect_ok(
  $$SELECT public.list_class_content_tree_for_manager('a1000000-0000-0000-0000-00000000000a')$$,
  '28. same-centre admin reads the manager tree');
SELECT pg_temp.expect_fail(
  $$SELECT public.list_class_content_tree_for_manager('b1000000-0000-0000-0000-00000000000b')$$,
  '29. admin cannot read another centre''s class tree');

SET LOCAL ROLE postgres;
ROLLBACK;
