-- Additive rich content columns for flashcards (front_text/back_text remain the
-- canonical plain-text mirror used for search, validation and legacy readers).
ALTER TABLE public.flashcards
  ADD COLUMN IF NOT EXISTS front_content jsonb,
  ADD COLUMN IF NOT EXISTS back_content jsonb;

CREATE OR REPLACE FUNCTION public.save_flashcard_deck(_class_id uuid, _definition jsonb, _deck_id uuid DEFAULT NULL::uuid, _publish boolean DEFAULT false, _expected_version integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_center uuid; v_deck uuid := _deck_id; v_title text; v_desc text;
  v_cards jsonb; v_card jsonb; v_i integer := 0; v_valid integer := 0;
  v_front text; v_back text; v_order integer;
  v_front_json jsonb; v_back_json jsonb;
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

  FOR v_card IN SELECT * FROM jsonb_array_elements(v_cards) LOOP
    v_front := btrim(COALESCE(v_card->>'front',''));
    v_back := btrim(COALESCE(v_card->>'back',''));
    v_front_json := CASE WHEN jsonb_typeof(v_card->'front_content') = 'object' THEN v_card->'front_content' ELSE NULL END;
    v_back_json := CASE WHEN jsonb_typeof(v_card->'back_content') = 'object' THEN v_card->'back_content' ELSE NULL END;
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
         SET front_text = v_front, back_text = v_back,
             front_content = v_front_json, back_content = v_back_json,
             sort_order = v_i, updated_at = now()
       WHERE id = v_card_id;
    ELSE
      INSERT INTO public.flashcards (deck_id, center_id, front_text, back_text, front_content, back_content, sort_order)
      VALUES (v_deck, v_center, v_front, v_back, v_front_json, v_back_json, v_i)
      RETURNING id INTO v_card_id;
    END IF;

    v_keep := v_keep || v_card_id;
    v_i := v_i + 1;
  END LOOP;

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
        'id', f.id, 'front', f.front_text, 'back', f.back_text,
        'front_content', f.front_content, 'back_content', f.back_content,
        'display_order', f.sort_order)
        ORDER BY f.sort_order, f.created_at)
      FROM public.flashcards f WHERE f.deck_id = d.id), '[]'::jsonb))
  INTO v_out FROM public.flashcard_decks d WHERE d.id = _deck_id;
  RETURN v_out;
END; $function$;

CREATE OR REPLACE FUNCTION public.get_flashcard_deck_for_study(_deck_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_deck public.flashcard_decks; v_out jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO v_deck FROM public.flashcard_decks WHERE id = _deck_id;
  IF v_deck.id IS NULL OR v_deck.status <> 'published' OR v_deck.class_id IS NULL THEN RAISE EXCEPTION 'deck not available'; END IF;
  IF NOT public.is_enrolled_in_class(v_deck.class_id) THEN RAISE EXCEPTION 'not permitted'; END IF;
  IF v_deck.center_id IS DISTINCT FROM public.get_user_center(auth.uid()) THEN RAISE EXCEPTION 'not permitted'; END IF;
  IF NOT public.tenant_feature_enabled(v_deck.center_id, 'flashcards') THEN RAISE EXCEPTION 'flashcards disabled'; END IF;

  SELECT jsonb_build_object(
    'id', v_deck.id, 'class_id', v_deck.class_id, 'title', v_deck.title,
    'description', v_deck.description, 'display_order', v_deck.display_order,
    'completed', EXISTS (SELECT 1 FROM public.student_xp_events e
      WHERE e.student_user_id = auth.uid() AND e.event_type = 'flashcard_completed' AND e.source_id = v_deck.id),
    'cards', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', f.id, 'front', f.front_text, 'back', f.back_text,
        'front_content', f.front_content, 'back_content', f.back_content,
        'display_order', f.sort_order)
        ORDER BY f.sort_order, f.created_at)
      FROM public.flashcards f WHERE f.deck_id = v_deck.id
        AND btrim(f.front_text) <> '' AND btrim(f.back_text) <> ''), '[]'::jsonb))
  INTO v_out;
  RETURN v_out;
END; $function$;