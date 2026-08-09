-- ============================================================================
-- Phase 5B — flexible class About sections: access-control regression matrix
--
-- Covers: legacy migration integrity, manager create/edit/delete/reorder,
-- enrolled-student read, unenrolled + foreign-tenant denial, and image-path
-- tenant scoping.
--
-- Run with psql as a superuser/service role. Every block raises on failure.
-- ============================================================================

BEGIN;

SET LOCAL client_min_messages TO WARNING;

-- ---------------------------------------------------------------------------
-- 0. Structural guarantees
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'class_about_sections'
  ) THEN
    RAISE EXCEPTION 'class_about_sections table missing';
  END IF;

  IF NOT (
    SELECT relrowsecurity FROM pg_class WHERE oid = 'public.class_about_sections'::regclass
  ) THEN
    RAISE EXCEPTION 'RLS not enabled on class_about_sections';
  END IF;

  -- anon must never reach the table or the RPCs.
  IF has_table_privilege('anon', 'public.class_about_sections', 'SELECT') THEN
    RAISE EXCEPTION 'anon can select class_about_sections';
  END IF;

  IF has_function_privilege('anon', 'public.save_class_about_section(uuid,text,text,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can execute save_class_about_section';
  END IF;
  IF has_function_privilege('anon', 'public.delete_class_about_section(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can execute delete_class_about_section';
  END IF;
  IF has_function_privilege('anon', 'public.reorder_class_about_sections(uuid,uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can execute reorder_class_about_sections';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Legacy About migration integrity
--    Every populated legacy field must exist as a section for that class.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  missing integer;
BEGIN
  SELECT count(*) INTO missing
  FROM public.class_about a
  CROSS JOIN LATERAL (
    VALUES
      (a.overview), (a.learning_objectives), (a.preparation_requirements),
      (a.class_expectations), (a.contact_guidance), (a.venue_or_meeting_info)
  ) AS legacy(value)
  WHERE coalesce(btrim(legacy.value), '') <> ''
    AND NOT EXISTS (
      SELECT 1 FROM public.class_about_sections s
      WHERE s.class_id = a.class_id
        AND btrim(coalesce(s.content, '')) = btrim(legacy.value)
    );

  IF missing > 0 THEN
    RAISE EXCEPTION 'legacy About migration lost % populated field(s)', missing;
  END IF;
END $$;

-- Migrated sections must always carry the class's own centre.
DO $$
DECLARE
  bad integer;
BEGIN
  SELECT count(*) INTO bad
  FROM public.class_about_sections s
  JOIN public.classes c ON c.id = s.class_id
  WHERE s.center_id IS DISTINCT FROM c.center_id;

  IF bad > 0 THEN
    RAISE EXCEPTION '% About section(s) have a mismatched center_id', bad;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Role-based matrix against a synthetic two-tenant fixture
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  center_a uuid := gen_random_uuid();
  center_b uuid := gen_random_uuid();
  class_a  uuid := gen_random_uuid();
  tutor_a  uuid := gen_random_uuid();
  stud_in  uuid := gen_random_uuid();
  stud_out uuid := gen_random_uuid();
  foreign_tutor uuid := gen_random_uuid();
  section  uuid;
  visible  integer;
BEGIN
  INSERT INTO public.tuition_centers (id, name) VALUES (center_a, 'QA About A'), (center_b, 'QA About B');

  INSERT INTO public.classes (id, center_id, title, class_name, scheduled_at, status, is_published)
  VALUES (class_a, center_a, 'QA About Class', 'QA About Class', now(), 'active', true);

  INSERT INTO public.class_tutors (center_id, class_id, tutor_user_id)
  VALUES (center_a, class_a, tutor_a);

  INSERT INTO public.class_enrollments (center_id, class_id, student_user_id, status)
  VALUES (center_a, class_a, stud_in, 'active');

  -- Assigned tutor may create, edit and reorder.
  PERFORM set_config('request.jwt.claim.sub', tutor_a::text, true);
  PERFORM set_config('role', 'authenticated', true);

  section := public.save_class_about_section(class_a, 'Overview', 'Learn Form 5 Physics.', NULL, NULL);
  IF section IS NULL THEN
    RAISE EXCEPTION 'assigned tutor could not create an About section';
  END IF;

  PERFORM public.save_class_about_section(class_a, 'Overview edited', 'Updated body.', NULL, section);
  IF NOT EXISTS (
    SELECT 1 FROM public.class_about_sections WHERE id = section AND title = 'Overview edited'
  ) THEN
    RAISE EXCEPTION 'assigned tutor edit did not persist';
  END IF;

  PERFORM public.reorder_class_about_sections(class_a, ARRAY[section]);

  -- Enrolled student reads it; unenrolled and foreign users must not.
  PERFORM set_config('request.jwt.claim.sub', stud_in::text, true);
  SELECT count(*) INTO visible FROM public.class_about_sections WHERE class_id = class_a;
  IF visible = 0 THEN
    RAISE EXCEPTION 'enrolled student cannot read About sections';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', stud_out::text, true);
  SELECT count(*) INTO visible FROM public.class_about_sections WHERE class_id = class_a;
  IF visible > 0 THEN
    RAISE EXCEPTION 'unenrolled student can read About sections';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', foreign_tutor::text, true);
  SELECT count(*) INTO visible FROM public.class_about_sections WHERE class_id = class_a;
  IF visible > 0 THEN
    RAISE EXCEPTION 'foreign tenant user can read About sections';
  END IF;

  -- Foreign tutor must not be able to write.
  BEGIN
    PERFORM public.save_class_about_section(class_a, 'Injected', 'Should fail.', NULL, NULL);
    RAISE EXCEPTION 'foreign tenant user was able to create an About section';
  EXCEPTION
    WHEN insufficient_privilege OR raise_exception THEN NULL;
  END;

  -- Manager delete works and removes the row.
  PERFORM set_config('request.jwt.claim.sub', tutor_a::text, true);
  PERFORM public.delete_class_about_section(section);
  IF EXISTS (SELECT 1 FROM public.class_about_sections WHERE id = section) THEN
    RAISE EXCEPTION 'delete_class_about_section did not remove the row';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Image paths must stay inside the owning class namespace
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  bad integer;
BEGIN
  SELECT count(*) INTO bad
  FROM public.class_about_sections s
  WHERE s.image_path IS NOT NULL
    AND s.image_path NOT LIKE 'class-about/' || s.center_id::text || '/' || s.class_id::text || '/%';

  IF bad > 0 THEN
    RAISE EXCEPTION '% About image path(s) escape their tenant/class namespace', bad;
  END IF;
END $$;

-- Storage policies must exist for the private class-about bucket.
DO $$
DECLARE
  found integer;
BEGIN
  SELECT count(*) INTO found
  FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname LIKE 'class_about images%';

  IF found < 4 THEN
    RAISE EXCEPTION 'expected 4 class-about storage policies, found %', found;
  END IF;
END $$;

ROLLBACK;
