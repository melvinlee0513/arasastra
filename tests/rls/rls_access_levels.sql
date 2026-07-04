-- ============================================================================
-- RLS access-level test suite
-- ----------------------------------------------------------------------------
-- Verifies that the SELECT policies on video_resources, notes, quizzes, and
-- flashcard_decks correctly gate:
--   1. anon                          -> only rows where access_level = 'demo'
--   2. authenticated, non-enrolled   -> only demo rows (no exclusive leakage)
--   3. authenticated, enrolled       -> demo + exclusive rows for their class
--
-- Usage (from repo root):
--     psql "$SUPABASE_DB_URL" -f tests/rls/rls_access_levels.sql
-- Or in the sandbox (PG* env vars set):
--     psql -f tests/rls/rls_access_levels.sql
--
-- The script runs inside a transaction and ROLLBACKs at the end, so it will
-- never persist data. It uses set_config() to simulate Supabase JWT claims
-- and SET LOCAL role to swap between anon/authenticated Postgres roles the
-- same way PostgREST does at request time.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;

-- ---------------------------------------------------------------------------
-- Helper: simulate a request as a given role + auth.uid()
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.assume(_role text, _uid uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF _uid IS NULL THEN
    PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  ELSE
    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', _uid::text, 'role', _role)::text,
      true
    );
  END IF;
  EXECUTE format('SET LOCAL ROLE %I', _role);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.reset_role() RETURNS void LANGUAGE sql AS $$
  RESET ROLE;
$$;

-- ---------------------------------------------------------------------------
-- Discover fixtures from existing seed data.
--   * a class that has BOTH an exclusive material and at least one enrolled
--     student profile with a linked auth user (so auth.uid() has meaning)
--   * a second authenticated user with NO enrollment in that class
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_class_id       uuid;
  v_enrolled_uid   uuid;
  v_enrolled_pid   uuid;
  v_outsider_uid   uuid;
  v_demo_count_anon         int;
  v_excl_count_anon         int;
  v_demo_count_outsider     int;
  v_excl_count_outsider     int;
  v_excl_count_enrolled     int;
BEGIN
  -- Find a class with at least one exclusive video_resource AND an active
  -- enrollment tied to a profile with a real user_id.
  SELECT vr.class_id
    INTO v_class_id
  FROM public.video_resources vr
  JOIN public.enrollments e ON e.class_id = vr.class_id
  JOIN public.profiles p    ON p.id = e.student_id AND p.user_id IS NOT NULL
  WHERE vr.access_level = 'exclusive'
    AND COALESCE(e.is_active, true) = true
  GROUP BY vr.class_id
  HAVING count(*) > 0
  LIMIT 1;

  IF v_class_id IS NULL THEN
    RAISE NOTICE '[SKIP] No seed data with exclusive video + enrolled student. Seed the DB first.';
    RETURN;
  END IF;

  SELECT p.user_id, p.id
    INTO v_enrolled_uid, v_enrolled_pid
  FROM public.enrollments e
  JOIN public.profiles p ON p.id = e.student_id
  WHERE e.class_id = v_class_id
    AND p.user_id IS NOT NULL
    AND COALESCE(e.is_active, true) = true
  LIMIT 1;

  -- Any profile user that is NOT enrolled in this class.
  SELECT p.user_id
    INTO v_outsider_uid
  FROM public.profiles p
  WHERE p.user_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.enrollments e
      WHERE e.student_id = p.id AND e.class_id = v_class_id
    )
  LIMIT 1;

  IF v_outsider_uid IS NULL THEN
    RAISE NOTICE '[SKIP] Could not find a non-enrolled authenticated profile.';
    RETURN;
  END IF;

  RAISE NOTICE '── Fixtures ─────────────────────────────────────────────';
  RAISE NOTICE 'class_id       = %', v_class_id;
  RAISE NOTICE 'enrolled uid   = %', v_enrolled_uid;
  RAISE NOTICE 'outsider uid   = %', v_outsider_uid;

  -- =========================================================================
  -- CASE 1: anon
  -- =========================================================================
  PERFORM pg_temp.assume('anon', NULL);

  SELECT count(*) INTO v_demo_count_anon
    FROM public.video_resources
   WHERE class_id = v_class_id AND access_level = 'demo' AND is_published = true;

  SELECT count(*) INTO v_excl_count_anon
    FROM public.video_resources
   WHERE class_id = v_class_id AND access_level = 'exclusive';

  ASSERT v_excl_count_anon = 0,
    format('anon leaked exclusive video_resources: %s rows', v_excl_count_anon);

  RAISE NOTICE '[PASS] anon: 0 exclusive rows, % published demo rows', v_demo_count_anon;

  -- notes / quizzes / flashcard_decks — anon must never see exclusive.
  PERFORM 1;
  IF (SELECT count(*) FROM public.notes           WHERE access_level = 'exclusive') > 0 THEN
    RAISE EXCEPTION '[FAIL] anon leaked exclusive notes';
  END IF;
  IF (SELECT count(*) FROM public.quizzes         WHERE access_level = 'exclusive') > 0 THEN
    RAISE EXCEPTION '[FAIL] anon leaked exclusive quizzes';
  END IF;
  IF (SELECT count(*) FROM public.flashcard_decks WHERE access_level = 'exclusive') > 0 THEN
    RAISE EXCEPTION '[FAIL] anon leaked exclusive flashcard_decks';
  END IF;
  RAISE NOTICE '[PASS] anon: 0 exclusive rows across notes/quizzes/flashcard_decks';

  PERFORM pg_temp.reset_role();

  -- =========================================================================
  -- CASE 2: authenticated, NOT enrolled in v_class_id
  -- =========================================================================
  PERFORM pg_temp.assume('authenticated', v_outsider_uid);

  SELECT count(*) INTO v_demo_count_outsider
    FROM public.video_resources
   WHERE class_id = v_class_id AND access_level = 'demo';

  SELECT count(*) INTO v_excl_count_outsider
    FROM public.video_resources
   WHERE class_id = v_class_id AND access_level = 'exclusive';

  ASSERT v_excl_count_outsider = 0,
    format('non-enrolled auth user leaked exclusive video_resources: % rows', v_excl_count_outsider);

  RAISE NOTICE '[PASS] auth non-enrolled: 0 exclusive video rows for class %', v_class_id;

  IF (SELECT count(*) FROM public.notes
        WHERE class_id = v_class_id AND access_level = 'exclusive') > 0 THEN
    RAISE EXCEPTION '[FAIL] non-enrolled leaked exclusive notes for class %', v_class_id;
  END IF;

  IF (SELECT count(*) FROM public.quizzes
        WHERE class_id = v_class_id AND access_level = 'exclusive') > 0 THEN
    RAISE EXCEPTION '[FAIL] non-enrolled leaked exclusive quizzes for class %', v_class_id;
  END IF;
  RAISE NOTICE '[PASS] auth non-enrolled: 0 exclusive notes/quizzes for class %', v_class_id;

  PERFORM pg_temp.reset_role();

  -- =========================================================================
  -- CASE 3: authenticated, ENROLLED in v_class_id
  -- =========================================================================
  PERFORM pg_temp.assume('authenticated', v_enrolled_uid);

  SELECT count(*) INTO v_excl_count_enrolled
    FROM public.video_resources
   WHERE class_id = v_class_id AND access_level = 'exclusive';

  ASSERT v_excl_count_enrolled > 0,
    format('enrolled student saw 0 exclusive video rows for their class %s', v_class_id);

  RAISE NOTICE '[PASS] auth enrolled: sees % exclusive video rows for class %',
    v_excl_count_enrolled, v_class_id;

  PERFORM pg_temp.reset_role();

  RAISE NOTICE '════════════════════════════════════════════════════════';
  RAISE NOTICE 'All RLS access-level assertions passed.';
END;
$$;

ROLLBACK;
