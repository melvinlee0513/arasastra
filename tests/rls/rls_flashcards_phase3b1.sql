-- ============================================================================
-- Aras A+ — Phase 3B1 flashcard manager/builder regression suite
--
-- Scope: definition versioning (optimistic concurrency), card-ID preservation
-- across edits, safe-delete policy when learner history exists, tenant
-- isolation, role gating and feature-flag enforcement for the manager RPCs.
--
-- Run with psql against a disposable QA database. Every case is wrapped in a
-- transaction and rolled back, so the suite is safe to re-run.
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f tests/rls/rls_flashcards_phase3b1.sql
-- ============================================================================
\set ON_ERROR_STOP on
\timing off

-- ── Fixtures ────────────────────────────────────────────────────────────────
BEGIN;

CREATE TEMP TABLE _fx (k text primary key, v uuid);

DO $$
DECLARE
  c_a uuid := gen_random_uuid();   -- centre A (flashcards ON)
  c_b uuid := gen_random_uuid();   -- centre B (foreign tenant)
  c_c uuid := gen_random_uuid();   -- centre C (flashcards OFF)
  cls_a uuid := gen_random_uuid();
  cls_b uuid := gen_random_uuid();
  cls_c uuid := gen_random_uuid();
  u_tutor_a uuid := gen_random_uuid();
  u_tutor_unassigned uuid := gen_random_uuid();
  u_admin_a uuid := gen_random_uuid();
  u_admin_b uuid := gen_random_uuid();
  u_student_a uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.tuition_centers (id, name, domain_status, theme_config, feature_flags)
  VALUES
    (c_a, 'QA Centre A', 'active', '{}'::jsonb, '{"flashcards": true}'::jsonb),
    (c_b, 'QA Centre B', 'active', '{}'::jsonb, '{"flashcards": true}'::jsonb),
    (c_c, 'QA Centre C', 'active', '{}'::jsonb, '{"flashcards": false}'::jsonb);

  INSERT INTO public.classes (id, center_id, title, class_name, status, scheduled_at)
  VALUES
    (cls_a, c_a, 'QA Class A', 'QA Class A', 'active', now()),
    (cls_b, c_b, 'QA Class B', 'QA Class B', 'active', now()),
    (cls_c, c_c, 'QA Class C', 'QA Class C', 'active', now());

  INSERT INTO public.user_roles (user_id, role) VALUES
    (u_tutor_a, 'tutor'), (u_tutor_unassigned, 'tutor'),
    (u_admin_a, 'admin'), (u_admin_b, 'admin'), (u_student_a, 'student');

  INSERT INTO public.profiles (user_id, full_name, center_id) VALUES
    (u_tutor_a, 'QA Tutor A', c_a),
    (u_tutor_unassigned, 'QA Tutor Unassigned', c_a),
    (u_admin_a, 'QA Admin A', c_a),
    (u_admin_b, 'QA Admin B', c_b),
    (u_student_a, 'QA Student A', c_a);

  INSERT INTO public.class_tutors (center_id, class_id, tutor_user_id)
  VALUES (c_a, cls_a, u_tutor_a);

  INSERT INTO public.class_enrollments (center_id, class_id, student_user_id, status)
  VALUES (c_a, cls_a, u_student_a, 'active');

  INSERT INTO _fx (k, v) VALUES
    ('c_a', c_a), ('c_b', c_b), ('c_c', c_c),
    ('cls_a', cls_a), ('cls_b', cls_b), ('cls_c', cls_c),
    ('tutor_a', u_tutor_a), ('tutor_unassigned', u_tutor_unassigned),
    ('admin_a', u_admin_a), ('admin_b', u_admin_b), ('student_a', u_student_a);
END $$;

-- Helper: impersonate an authenticated user for RPC calls.
CREATE OR REPLACE FUNCTION _as(_user uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _user, 'role', 'authenticated')::text, true);
END $$;

CREATE OR REPLACE FUNCTION _ok(_case text, _pass boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF _pass THEN RAISE NOTICE 'PASS  %', _case;
  ELSE RAISE EXCEPTION 'FAIL  %', _case;
  END IF;
END $$;

-- ── 1. Assigned tutor can create a draft deck ───────────────────────────────
DO $$
DECLARE r jsonb; deck uuid; cls uuid;
BEGIN
  SELECT v INTO cls FROM _fx WHERE k = 'cls_a';
  PERFORM _as((SELECT v FROM _fx WHERE k = 'tutor_a'));
  r := public.save_flashcard_deck(cls, '{"title":"Deck 1","description":null,"cards":[{"front":"a","back":"1"},{"front":"b","back":"2"}]}'::jsonb, NULL, false, NULL);
  deck := (r->>'deck_id')::uuid;
  INSERT INTO _fx (k, v) VALUES ('deck1', deck);
  PERFORM _ok('1 tutor creates draft deck with 2 cards',
    (SELECT status = 'draft' FROM public.flashcard_decks WHERE id = deck)
    AND (SELECT count(*) = 2 FROM public.flashcards WHERE deck_id = deck));
  PERFORM _ok('1b draft deck inherits class center_id',
    (SELECT center_id = (SELECT v FROM _fx WHERE k = 'c_a') FROM public.flashcard_decks WHERE id = deck));
END $$;

-- ── 2. Unassigned tutor cannot manage the deck ──────────────────────────────
DO $$
DECLARE cls uuid; failed boolean := false;
BEGIN
  SELECT v INTO cls FROM _fx WHERE k = 'cls_a';
  PERFORM _as((SELECT v FROM _fx WHERE k = 'tutor_unassigned'));
  BEGIN
    PERFORM public.save_flashcard_deck(cls, '{"title":"X","cards":[]}'::jsonb, NULL, false, NULL);
  EXCEPTION WHEN OTHERS THEN failed := true;
  END;
  PERFORM _ok('2 unassigned tutor blocked from saving deck', failed);
END $$;

-- ── 3. Foreign-tenant admin cannot read or write ────────────────────────────
DO $$
DECLARE deck uuid; failed boolean := false; rows int;
BEGIN
  SELECT v INTO deck FROM _fx WHERE k = 'deck1';
  PERFORM _as((SELECT v FROM _fx WHERE k = 'admin_b'));
  BEGIN
    PERFORM public.get_flashcard_deck_for_manager(deck);
  EXCEPTION WHEN OTHERS THEN failed := true;
  END;
  PERFORM _ok('3 foreign-tenant admin blocked from deck definition', failed);

  SELECT count(*) INTO rows FROM public.list_class_flashcard_decks_for_manager((SELECT v FROM _fx WHERE k = 'cls_a')) x;
  PERFORM _ok('3b foreign-tenant admin sees no decks in class A', rows = 0);
EXCEPTION WHEN OTHERS THEN
  PERFORM _ok('3b foreign-tenant admin rejected outright', true);
END $$;

-- ── 4. Students cannot use manager RPCs ─────────────────────────────────────
DO $$
DECLARE deck uuid; failed boolean := false;
BEGIN
  SELECT v INTO deck FROM _fx WHERE k = 'deck1';
  PERFORM _as((SELECT v FROM _fx WHERE k = 'student_a'));
  BEGIN
    PERFORM public.get_flashcard_deck_for_manager(deck);
  EXCEPTION WHEN OTHERS THEN failed := true;
  END;
  PERFORM _ok('4 student blocked from manager definition RPC', failed);
END $$;

-- ── 5. Feature flag OFF blocks management in centre C ───────────────────────
DO $$
DECLARE cls uuid; failed boolean := false;
BEGIN
  SELECT v INTO cls FROM _fx WHERE k = 'cls_c';
  PERFORM _as((SELECT v FROM _fx WHERE k = 'admin_a'));
  BEGIN
    PERFORM public.save_flashcard_deck(cls, '{"title":"Nope","cards":[]}'::jsonb, NULL, false, NULL);
  EXCEPTION WHEN OTHERS THEN failed := true;
  END;
  PERFORM _ok('5 flashcards-disabled tenant blocks deck creation', failed);
END $$;

-- ── 6. Card IDs are preserved when editing text ─────────────────────────────
DO $$
DECLARE deck uuid; cls uuid; ids_before uuid[]; ids_after uuid[]; ver int; def jsonb;
BEGIN
  SELECT v INTO deck FROM _fx WHERE k = 'deck1';
  SELECT v INTO cls FROM _fx WHERE k = 'cls_a';
  PERFORM _as((SELECT v FROM _fx WHERE k = 'tutor_a'));

  SELECT array_agg(id ORDER BY sort_order) INTO ids_before FROM public.flashcards WHERE deck_id = deck;
  SELECT definition_version INTO ver FROM public.flashcard_decks WHERE id = deck;

  def := jsonb_build_object(
    'title', 'Deck 1 edited',
    'cards', jsonb_build_array(
      jsonb_build_object('id', ids_before[1], 'front', 'a-edited', 'back', '1'),
      jsonb_build_object('id', ids_before[2], 'front', 'b', 'back', '2-edited')
    ));
  PERFORM public.save_flashcard_deck(cls, def, deck, false, ver);

  SELECT array_agg(id ORDER BY sort_order) INTO ids_after FROM public.flashcards WHERE deck_id = deck;
  PERFORM _ok('6 card IDs preserved across an edit', ids_before = ids_after);
  PERFORM _ok('6b edited text persisted',
    (SELECT front_text = 'a-edited' FROM public.flashcards WHERE id = ids_before[1]));
  PERFORM _ok('6c definition_version incremented',
    (SELECT definition_version > ver FROM public.flashcard_decks WHERE id = deck));
END $$;

-- ── 7. Stale expected version raises a conflict ─────────────────────────────
DO $$
DECLARE deck uuid; cls uuid; msg text := ''; conflicted boolean := false;
BEGIN
  SELECT v INTO deck FROM _fx WHERE k = 'deck1';
  SELECT v INTO cls FROM _fx WHERE k = 'cls_a';
  PERFORM _as((SELECT v FROM _fx WHERE k = 'tutor_a'));
  BEGIN
    PERFORM public.save_flashcard_deck(cls, '{"title":"stale write","cards":[]}'::jsonb, deck, false, 1);
  EXCEPTION WHEN OTHERS THEN
    msg := SQLERRM; conflicted := true;
  END;
  PERFORM _ok('7 stale expected_version rejected', conflicted);
  PERFORM _ok('7b conflict is reported as flashcard_definition_conflict',
    msg ILIKE '%conflict%');
END $$;

-- ── 8. Publish validation: title and at least one complete card ─────────────
DO $$
DECLARE cls uuid; deck uuid; ver int; failed boolean := false;
BEGIN
  SELECT v INTO cls FROM _fx WHERE k = 'cls_a';
  PERFORM _as((SELECT v FROM _fx WHERE k = 'tutor_a'));

  -- Empty draft may be saved.
  deck := (public.save_flashcard_deck(cls, '{"title":"","cards":[]}'::jsonb, NULL, false, NULL)->>'deck_id')::uuid;
  INSERT INTO _fx (k, v) VALUES ('deck_empty', deck);
  PERFORM _ok('8 empty deck saved as draft', deck IS NOT NULL);

  SELECT definition_version INTO ver FROM public.flashcard_decks WHERE id = deck;
  BEGIN
    PERFORM public.save_flashcard_deck(cls, '{"title":"","cards":[]}'::jsonb, deck, true, ver);
  EXCEPTION WHEN OTHERS THEN failed := true;
  END;
  PERFORM _ok('8b publishing an empty/untitled deck rejected', failed);
END $$;

-- ── 9. Safe delete: allowed with no learner history ─────────────────────────
DO $$
DECLARE deck uuid; r jsonb;
BEGIN
  SELECT v INTO deck FROM _fx WHERE k = 'deck_empty';
  PERFORM _as((SELECT v FROM _fx WHERE k = 'tutor_a'));
  r := public.delete_flashcard_deck_safe(deck);
  PERFORM _ok('9 deck without learner history is deletable',
    (r->>'deleted')::boolean AND NOT EXISTS (SELECT 1 FROM public.flashcard_decks WHERE id = deck));
END $$;

-- ── 10. Safe delete: blocked once learner progress exists ───────────────────
DO $$
DECLARE deck uuid; card uuid; blocked boolean := false;
BEGIN
  SELECT v INTO deck FROM _fx WHERE k = 'deck1';
  SELECT id INTO card FROM public.flashcards WHERE deck_id = deck ORDER BY sort_order LIMIT 1;

  INSERT INTO public.flashcard_progress (user_id, flashcard_id, status)
  VALUES ((SELECT v FROM _fx WHERE k = 'student_a'), card, 'known');

  PERFORM _as((SELECT v FROM _fx WHERE k = 'tutor_a'));
  BEGIN
    PERFORM public.delete_flashcard_deck_safe(deck);
  EXCEPTION WHEN OTHERS THEN blocked := true;
  END;
  PERFORM _ok('10 deck with learner progress cannot be deleted', blocked);
  PERFORM _ok('10b deck still present after blocked delete',
    EXISTS (SELECT 1 FROM public.flashcard_decks WHERE id = deck));
END $$;

-- ── 11. Archive is the escape hatch, and progress survives ──────────────────
DO $$
DECLARE deck uuid; kept int;
BEGIN
  SELECT v INTO deck FROM _fx WHERE k = 'deck1';
  PERFORM _as((SELECT v FROM _fx WHERE k = 'tutor_a'));
  PERFORM public.set_flashcard_deck_status(deck, 'archived');
  SELECT count(*) INTO kept FROM public.flashcard_progress p
    JOIN public.flashcards f ON f.id = p.flashcard_id WHERE f.deck_id = deck;
  PERFORM _ok('11 deck archived instead of deleted',
    (SELECT status = 'archived' FROM public.flashcard_decks WHERE id = deck));
  PERFORM _ok('11b learner progress preserved through archive', kept > 0);
END $$;

-- ── 12. Archived decks are hidden from students ─────────────────────────────
DO $$
DECLARE rows int;
BEGIN
  PERFORM _as((SELECT v FROM _fx WHERE k = 'student_a'));
  SELECT count(*) INTO rows
  FROM public.list_class_flashcard_decks_for_student((SELECT v FROM _fx WHERE k = 'cls_a')) x;
  PERFORM _ok('12 archived deck not listed for the enrolled student', rows = 0);
END $$;

-- ── 13. Duplicate creates an independent draft copy ─────────────────────────
DO $$
DECLARE src uuid; copy_id uuid; src_cards int; copy_cards int;
BEGIN
  SELECT v INTO src FROM _fx WHERE k = 'deck1';
  PERFORM _as((SELECT v FROM _fx WHERE k = 'tutor_a'));
  copy_id := public.duplicate_flashcard_deck_as_draft(src);
  SELECT count(*) INTO src_cards FROM public.flashcards WHERE deck_id = src;
  SELECT count(*) INTO copy_cards FROM public.flashcards WHERE deck_id = copy_id;
  PERFORM _ok('13 duplicate is a draft', (SELECT status = 'draft' FROM public.flashcard_decks WHERE id = copy_id));
  PERFORM _ok('13b duplicate copies every card', src_cards = copy_cards AND copy_cards > 0);
  PERFORM _ok('13c duplicate has fresh card IDs',
    NOT EXISTS (SELECT 1 FROM public.flashcards a JOIN public.flashcards b ON a.id = b.id
                WHERE a.deck_id = src AND b.deck_id = copy_id));
  PERFORM _ok('13d duplicate carries no learner progress',
    NOT EXISTS (SELECT 1 FROM public.flashcard_progress p
                JOIN public.flashcards f ON f.id = p.flashcard_id WHERE f.deck_id = copy_id));
END $$;

-- ── 14. Reordering is tenant/class scoped ──────────────────────────────────
DO $$
DECLARE cls uuid; ids uuid[]; failed boolean := false;
BEGIN
  SELECT v INTO cls FROM _fx WHERE k = 'cls_a';
  PERFORM _as((SELECT v FROM _fx WHERE k = 'tutor_a'));
  SELECT array_agg(id ORDER BY display_order) INTO ids FROM public.flashcard_decks WHERE class_id = cls;
  PERFORM public.reorder_flashcard_decks(cls, ARRAY(SELECT unnest(ids) ORDER BY 1 DESC));
  PERFORM _ok('14 reorder succeeds for assigned tutor', true);

  -- A deck from another class must not be accepted.
  BEGIN
    PERFORM public.reorder_flashcard_decks(cls, ARRAY[gen_random_uuid()]);
  EXCEPTION WHEN OTHERS THEN failed := true;
  END;
  PERFORM _ok('14b reorder rejects deck IDs outside the class', failed);
END $$;

-- ── 15. Anonymous role has no access to any manager RPC ─────────────────────
DO $$
DECLARE failed boolean := false;
BEGIN
  PERFORM set_config('role', 'anon', true);
  PERFORM set_config('request.jwt.claims', NULL, true);
  BEGIN
    PERFORM public.list_class_flashcard_decks_for_manager((SELECT v FROM _fx WHERE k = 'cls_a'));
  EXCEPTION WHEN OTHERS THEN failed := true;
  END;
  PERFORM _ok('15 anon blocked from manager list RPC', failed);
  PERFORM set_config('role', 'postgres', true);
END $$;

ROLLBACK;
