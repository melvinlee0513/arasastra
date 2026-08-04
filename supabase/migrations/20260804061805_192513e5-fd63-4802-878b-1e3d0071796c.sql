-- Phase 3B1: deck version control, card-ID preservation, safe-delete learning history

ALTER TABLE public.flashcard_decks
  ADD COLUMN IF NOT EXISTS definition_version integer NOT NULL DEFAULT 1;

-- ── Manager detail: expose definition_version ───────────────────────────────
CREATE OR REPLACE FUNCTION public.get_flashcard_deck_for_manager(_deck_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_class uuid; v_out jsonb;
BEGIN
  SELECT class_id INTO v_class FROM public.flashcard_decks WHERE id = _deck_id;
  IF v_class IS NULL THEN RAISE EXCEPTION 'deck not found'; END IF;
  PERFORM public._flashcard_manager_center(v_class);
  SELECT jsonb_build_object(
    'id', d.id, 'center_id', d.center_id, 'class_id', d.class_id, 'title', d.title,
    'description', d.description, 'status', d.status, 'display_order', d.display_order,
    'definition_version', d.definition_version,
    'created_by', d.created_by, 'published_at', d.published_at,
    'created_at', d.created_at, 'updated_at', d.updated_at,
    'cards', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', f.id, 'front', f.front_text, 'back', f.back_text, 'display_order', f.sort_order)
        ORDER BY f.sort_order, f.created_at)
      FROM public.flashcards f WHERE f.deck_id = d.id), '[]'::jsonb))
  INTO v_out FROM public.flashcard_decks d WHERE d.id = _deck_id;
  RETURN v_out;
END; $function$;

-- ── Manager list: expose definition_version + learner-history flag ──────────
CREATE OR REPLACE FUNCTION public.list_class_flashcard_decks_for_manager(_class_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_rows jsonb;
BEGIN
  PERFORM public._flashcard_manager_center(_class_id);
  SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'display_order')::int, row->>'created_at'), '[]'::jsonb)
  INTO v_rows FROM (
    SELECT jsonb_build_object(
      'id', d.id, 'center_id', d.center_id, 'class_id', d.class_id, 'title', d.title,
      'description', d.description, 'status', d.status, 'display_order', d.display_order,
      'definition_version', d.definition_version,
      'created_by', d.created_by, 'published_at', d.published_at,
      'created_at', d.created_at, 'updated_at', d.updated_at,
      'card_count', (SELECT count(*) FROM public.flashcards f WHERE f.deck_id = d.id),
      'valid_card_count', (SELECT count(*) FROM public.flashcards f
         WHERE f.deck_id = d.id AND btrim(f.front_text) <> '' AND btrim(f.back_text) <> ''),
      'has_learning_history', (
        EXISTS (SELECT 1 FROM public.flashcard_progress p
                  JOIN public.flashcards f2 ON f2.id = p.flashcard_id
                 WHERE f2.deck_id = d.id)
        OR EXISTS (SELECT 1 FROM public.student_xp_events e
                    WHERE e.source_id = d.id AND e.source_type = 'flashcard_deck')
      )
    ) AS row
    FROM public.flashcard_decks d WHERE d.class_id = _class_id
  ) s;
  RETURN v_rows;
END; $function$;

-- ── Atomic save with card-ID preservation + optimistic concurrency ──────────
CREATE OR REPLACE FUNCTION public.save_flashcard_deck(
  _class_id uuid,
  _definition jsonb,
  _deck_id uuid DEFAULT NULL::uuid,
  _publish boolean DEFAULT false,
  _expected_version integer DEFAULT NULL::integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_center uuid; v_deck uuid := _deck_id; v_title text; v_desc text;
  v_cards jsonb; v_card jsonb; v_i integer := 0; v_valid integer := 0;
  v_front text; v_back text; v_order integer;
  v_current_version integer; v_new_version integer;
  v_card_id uuid; v_keep uuid[] := ARRAY[]::uuid[];
BEGIN
  v_center := public._flashcard_manager_center(_class_id);
  v_title := btrim(COALESCE(_definition->>'title',''));
  v_desc := NULLIF(btrim(COALESCE(_definition->>'description','')), '');
  v_cards := COALESCE(_definition->'cards', '[]'::jsonb);
  IF jsonb_typeof(v_cards) <> 'array' THEN RAISE EXCEPTION 'invalid cards payload'; END IF;

  IF v_deck IS NOT NULL THEN
    SELECT definition_version INTO v_current_version
      FROM public.flashcard_decks
     WHERE id = v_deck AND class_id = _class_id AND center_id = v_center
     FOR UPDATE;
    IF v_current_version IS NULL THEN RAISE EXCEPTION 'deck not found'; END IF;
    IF _expected_version IS NOT NULL AND _expected_version <> v_current_version THEN
      RAISE EXCEPTION 'flashcard_definition_conflict';
    END IF;
  END IF;

  -- publication requirements (server-authoritative)
  IF _publish THEN
    IF v_title = '' THEN RAISE EXCEPTION 'title required to publish'; END IF;
    FOR v_card IN SELECT * FROM jsonb_array_elements(v_cards) LOOP
      IF btrim(COALESCE(v_card->>'front','')) = '' OR btrim(COALESCE(v_card->>'back','')) = '' THEN
        RAISE EXCEPTION 'every card needs a front and a back to publish';
      END IF;
      v_valid := v_valid + 1;
    END LOOP;
    IF v_valid = 0 THEN RAISE EXCEPTION 'at least one card is required to publish'; END IF;
  END IF;

  IF v_deck IS NULL THEN
    SELECT COALESCE(MAX(display_order), -1) + 1 INTO v_order FROM public.flashcard_decks WHERE class_id = _class_id;
    INSERT INTO public.flashcard_decks (center_id, class_id, title, description, status, display_order, created_by)
    VALUES (v_center, _class_id, COALESCE(NULLIF(v_title,''), 'Untitled deck'), v_desc, 'draft', v_order, auth.uid())
    RETURNING id, definition_version INTO v_deck, v_new_version;
  ELSE
    UPDATE public.flashcard_decks
       SET title = COALESCE(NULLIF(v_title,''), title),
           description = v_desc,
           definition_version = definition_version + 1
     WHERE id = v_deck
     RETURNING definition_version INTO v_new_version;
  END IF;

  -- Upsert submitted cards, preserving IDs (and therefore learner progress).
  FOR v_card IN SELECT * FROM jsonb_array_elements(v_cards) LOOP
    v_front := btrim(COALESCE(v_card->>'front',''));
    v_back := btrim(COALESCE(v_card->>'back',''));
    v_card_id := NULL;
    IF NULLIF(btrim(COALESCE(v_card->>'id','')), '') IS NOT NULL THEN
      BEGIN
        v_card_id := (v_card->>'id')::uuid;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'invalid card id';
      END;
    END IF;

    IF v_card_id IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.flashcards
                      WHERE id = v_card_id AND deck_id = v_deck AND center_id = v_center) THEN
        RAISE EXCEPTION 'card does not belong to this deck';
      END IF;
      UPDATE public.flashcards
         SET front_text = v_front, back_text = v_back, sort_order = v_i, updated_at = now()
       WHERE id = v_card_id;
    ELSE
      INSERT INTO public.flashcards (deck_id, center_id, front_text, back_text, sort_order)
      VALUES (v_deck, v_center, v_front, v_back, v_i)
      RETURNING id INTO v_card_id;
    END IF;

    v_keep := v_keep || v_card_id;
    v_i := v_i + 1;
  END LOOP;

  -- Removed cards: delete them (their progress rows cascade away by design —
  -- a card that no longer exists has no reviewable history).
  DELETE FROM public.flashcards
   WHERE deck_id = v_deck AND NOT (id = ANY(v_keep));

  IF _publish THEN
    UPDATE public.flashcard_decks SET status = 'published' WHERE id = v_deck;
  END IF;

  RETURN jsonb_build_object(
    'deck_id', v_deck,
    'card_count', v_i,
    'definition_version', (SELECT definition_version FROM public.flashcard_decks WHERE id = v_deck),
    'status', (SELECT status FROM public.flashcard_decks WHERE id = v_deck));
END; $function$;

DROP FUNCTION IF EXISTS public.save_flashcard_deck(uuid, jsonb, uuid, boolean);

-- ── Safe delete: refuse when learner history exists ────────────────────────
CREATE OR REPLACE FUNCTION public.delete_flashcard_deck_safe(_deck_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_class uuid; v_has_history boolean;
BEGIN
  SELECT class_id INTO v_class FROM public.flashcard_decks WHERE id = _deck_id;
  IF v_class IS NULL THEN RAISE EXCEPTION 'deck not found'; END IF;
  PERFORM public._flashcard_manager_center(v_class);

  SELECT (
    EXISTS (SELECT 1 FROM public.flashcard_progress p
              JOIN public.flashcards f ON f.id = p.flashcard_id
             WHERE f.deck_id = _deck_id)
    OR EXISTS (SELECT 1 FROM public.student_xp_events e
                WHERE e.source_id = _deck_id AND e.source_type = 'flashcard_deck')
  ) INTO v_has_history;

  IF v_has_history THEN
    UPDATE public.flashcard_decks SET status = 'archived' WHERE id = _deck_id AND status <> 'archived';
    RETURN jsonb_build_object('deleted', false, 'deck_id', _deck_id, 'reason', 'deck_has_learning_history');
  END IF;

  DELETE FROM public.flashcards WHERE deck_id = _deck_id;
  DELETE FROM public.flashcard_decks WHERE id = _deck_id;
  RETURN jsonb_build_object('deleted', true, 'deck_id', _deck_id);
END; $function$;

-- ── Grants: authenticated + service_role only ──────────────────────────────
REVOKE ALL ON FUNCTION public.save_flashcard_deck(uuid, jsonb, uuid, boolean, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_flashcard_deck_safe(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_flashcard_deck_for_manager(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_class_flashcard_decks_for_manager(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_flashcard_deck(uuid, jsonb, uuid, boolean, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_flashcard_deck_safe(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_flashcard_deck_for_manager(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_class_flashcard_decks_for_manager(uuid) TO authenticated, service_role;