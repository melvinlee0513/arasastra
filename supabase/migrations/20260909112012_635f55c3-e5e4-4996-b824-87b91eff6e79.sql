-- ─── 1. Additive columns ────────────────────────────────────────────────────
ALTER TABLE public.flashcards
  ADD COLUMN IF NOT EXISTS front_image_path text,
  ADD COLUMN IF NOT EXISTS front_image_width integer,
  ADD COLUMN IF NOT EXISTS front_image_height integer,
  ADD COLUMN IF NOT EXISTS front_image_alt text,
  ADD COLUMN IF NOT EXISTS front_image_crop jsonb,
  ADD COLUMN IF NOT EXISTS back_image_path text,
  ADD COLUMN IF NOT EXISTS back_image_width integer,
  ADD COLUMN IF NOT EXISTS back_image_height integer,
  ADD COLUMN IF NOT EXISTS back_image_alt text,
  ADD COLUMN IF NOT EXISTS back_image_crop jsonb,
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.flashcard_decks
  ADD COLUMN IF NOT EXISTS cover_path text,
  ADD COLUMN IF NOT EXISTS form_level text,
  ADD COLUMN IF NOT EXISTS show_progress boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS award_xp boolean NOT NULL DEFAULT true;

-- ─── 2. Storage guards for the private flashcard-media bucket ───────────────
CREATE OR REPLACE FUNCTION public._flashcard_media_center(_name text)
RETURNS uuid LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public','pg_temp'
AS $$
DECLARE v uuid;
BEGIN
  BEGIN
    v := split_part(COALESCE(_name, ''), '/', 1)::uuid;
  EXCEPTION WHEN others THEN RETURN NULL;
  END;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.can_write_flashcard_media(_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
  SELECT auth.uid() IS NOT NULL
     AND public._flashcard_media_center(_name) IS NOT NULL
     AND public._flashcard_media_center(_name) = public.get_user_center(auth.uid())
     AND public.tenant_feature_enabled(public._flashcard_media_center(_name), 'flashcards')
     AND (
          public.has_role(auth.uid(), 'admin'::public.app_role)
       OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
       OR public.has_role(auth.uid(), 'tutor'::public.app_role)
     );
$$;

CREATE OR REPLACE FUNCTION public.can_read_flashcard_media(_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
  SELECT public.can_write_flashcard_media(_name)
      OR EXISTS (
           SELECT 1 FROM public.flashcards f
             JOIN public.flashcard_decks d ON d.id = f.deck_id
            WHERE ('flashcard-media/' || _name) IN (f.front_image_path, f.back_image_path)
              AND d.status = 'published'
              AND public.is_enrolled_in_class(d.class_id)
         )
      OR EXISTS (
           SELECT 1 FROM public.flashcard_decks d
            WHERE d.cover_path = ('flashcard-media/' || _name)
              AND d.status = 'published'
              AND public.is_enrolled_in_class(d.class_id)
         );
$$;

REVOKE ALL ON FUNCTION public._flashcard_media_center(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_write_flashcard_media(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_read_flashcard_media(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._flashcard_media_center(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_write_flashcard_media(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_read_flashcard_media(text) TO authenticated, service_role;

DROP POLICY IF EXISTS flashcard_media_read ON storage.objects;
DROP POLICY IF EXISTS flashcard_media_insert ON storage.objects;
DROP POLICY IF EXISTS flashcard_media_update ON storage.objects;
DROP POLICY IF EXISTS flashcard_media_delete ON storage.objects;

CREATE POLICY flashcard_media_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'flashcard-media' AND public.can_read_flashcard_media(name));
CREATE POLICY flashcard_media_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'flashcard-media' AND public.can_write_flashcard_media(name));
CREATE POLICY flashcard_media_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'flashcard-media' AND public.can_write_flashcard_media(name))
  WITH CHECK (bucket_id = 'flashcard-media' AND public.can_write_flashcard_media(name));
CREATE POLICY flashcard_media_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'flashcard-media' AND public.can_write_flashcard_media(name));

-- ─── 3. Save deck: persist media, tags, cover and simple settings ───────────
CREATE OR REPLACE FUNCTION public.save_flashcard_deck(_class_id uuid, _definition jsonb, _deck_id uuid DEFAULT NULL::uuid, _publish boolean DEFAULT false, _expected_version integer DEFAULT NULL::integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  v_center uuid; v_deck uuid := _deck_id; v_title text; v_desc text;
  v_cards jsonb; v_card jsonb; v_i integer := 0; v_valid integer := 0;
  v_front text; v_back text; v_order integer;
  v_front_json jsonb; v_back_json jsonb; v_tags text[];
  v_current_version integer; v_new_version integer;
  v_card_id uuid; v_keep uuid[] := ARRAY[]::uuid[];
  v_has_cover boolean; v_has_form boolean; v_has_show boolean; v_has_xp boolean;
BEGIN
  v_center := public._flashcard_manager_center(_class_id);
  v_title := btrim(COALESCE(_definition->>'title',''));
  v_desc := NULLIF(btrim(COALESCE(_definition->>'description','')), '');
  v_cards := COALESCE(_definition->'cards', '[]'::jsonb);
  IF jsonb_typeof(v_cards) <> 'array' THEN RAISE EXCEPTION 'invalid cards payload'; END IF;

  v_has_cover := _definition ? 'cover_path';
  v_has_form := _definition ? 'form_level';
  v_has_show := _definition ? 'show_progress';
  v_has_xp := _definition ? 'award_xp';

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
      IF (btrim(COALESCE(v_card->>'front','')) = '' AND NULLIF(btrim(COALESCE(v_card->>'front_image_path','')),'') IS NULL)
         OR (btrim(COALESCE(v_card->>'back','')) = '' AND NULLIF(btrim(COALESCE(v_card->>'back_image_path','')),'') IS NULL) THEN
        RAISE EXCEPTION 'every card needs a front and a back to publish';
      END IF;
      v_valid := v_valid + 1;
    END LOOP;
    IF v_valid = 0 THEN RAISE EXCEPTION 'at least one card is required to publish'; END IF;
  END IF;

  IF v_deck IS NULL THEN
    SELECT COALESCE(MAX(display_order), -1) + 1 INTO v_order FROM public.flashcard_decks WHERE class_id = _class_id;
    INSERT INTO public.flashcard_decks (center_id, class_id, title, description, status, display_order, created_by,
                                        cover_path, form_level, show_progress, award_xp)
    VALUES (v_center, _class_id, COALESCE(NULLIF(v_title,''), 'Untitled deck'), v_desc, 'draft', v_order, auth.uid(),
            NULLIF(btrim(COALESCE(_definition->>'cover_path','')), ''),
            NULLIF(btrim(COALESCE(_definition->>'form_level','')), ''),
            COALESCE((_definition->>'show_progress')::boolean, true),
            COALESCE((_definition->>'award_xp')::boolean, true))
    RETURNING id, definition_version INTO v_deck, v_new_version;
  ELSE
    UPDATE public.flashcard_decks
       SET title = COALESCE(NULLIF(v_title,''), title),
           description = v_desc,
           cover_path = CASE WHEN v_has_cover THEN NULLIF(btrim(COALESCE(_definition->>'cover_path','')), '') ELSE cover_path END,
           form_level = CASE WHEN v_has_form THEN NULLIF(btrim(COALESCE(_definition->>'form_level','')), '') ELSE form_level END,
           show_progress = CASE WHEN v_has_show THEN COALESCE((_definition->>'show_progress')::boolean, show_progress) ELSE show_progress END,
           award_xp = CASE WHEN v_has_xp THEN COALESCE((_definition->>'award_xp')::boolean, award_xp) ELSE award_xp END,
           definition_version = definition_version + 1
     WHERE id = v_deck
     RETURNING definition_version INTO v_new_version;
  END IF;

  FOR v_card IN SELECT * FROM jsonb_array_elements(v_cards) LOOP
    v_front := btrim(COALESCE(v_card->>'front',''));
    v_back := btrim(COALESCE(v_card->>'back',''));
    v_front_json := CASE WHEN jsonb_typeof(v_card->'front_content') = 'object' THEN v_card->'front_content' ELSE NULL END;
    v_back_json := CASE WHEN jsonb_typeof(v_card->'back_content') = 'object' THEN v_card->'back_content' ELSE NULL END;
    v_tags := CASE WHEN jsonb_typeof(v_card->'tags') = 'array'
                   THEN (SELECT COALESCE(array_agg(btrim(t) ORDER BY btrim(t)), '{}'::text[])
                           FROM jsonb_array_elements_text(v_card->'tags') AS x(t)
                          WHERE btrim(t) <> '')
                   ELSE '{}'::text[] END;
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
             front_image_path = NULLIF(btrim(COALESCE(v_card->>'front_image_path','')), ''),
             front_image_width = NULLIF(v_card->>'front_image_width','')::integer,
             front_image_height = NULLIF(v_card->>'front_image_height','')::integer,
             front_image_alt = NULLIF(btrim(COALESCE(v_card->>'front_image_alt','')), ''),
             front_image_crop = public._quiz_media_crop(v_card->'front_image_crop'),
             back_image_path = NULLIF(btrim(COALESCE(v_card->>'back_image_path','')), ''),
             back_image_width = NULLIF(v_card->>'back_image_width','')::integer,
             back_image_height = NULLIF(v_card->>'back_image_height','')::integer,
             back_image_alt = NULLIF(btrim(COALESCE(v_card->>'back_image_alt','')), ''),
             back_image_crop = public._quiz_media_crop(v_card->'back_image_crop'),
             tags = v_tags,
             sort_order = v_i, updated_at = now()
       WHERE id = v_card_id;
    ELSE
      INSERT INTO public.flashcards (deck_id, center_id, front_text, back_text, front_content, back_content,
        front_image_path, front_image_width, front_image_height, front_image_alt, front_image_crop,
        back_image_path, back_image_width, back_image_height, back_image_alt, back_image_crop,
        tags, sort_order)
      VALUES (v_deck, v_center, v_front, v_back, v_front_json, v_back_json,
        NULLIF(btrim(COALESCE(v_card->>'front_image_path','')), ''),
        NULLIF(v_card->>'front_image_width','')::integer,
        NULLIF(v_card->>'front_image_height','')::integer,
        NULLIF(btrim(COALESCE(v_card->>'front_image_alt','')), ''),
        public._quiz_media_crop(v_card->'front_image_crop'),
        NULLIF(btrim(COALESCE(v_card->>'back_image_path','')), ''),
        NULLIF(v_card->>'back_image_width','')::integer,
        NULLIF(v_card->>'back_image_height','')::integer,
        NULLIF(btrim(COALESCE(v_card->>'back_image_alt','')), ''),
        public._quiz_media_crop(v_card->'back_image_crop'),
        v_tags, v_i)
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
END; $$;

-- ─── 4. Manager deck detail ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_flashcard_deck_for_manager(_deck_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
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
    'cover_path', d.cover_path, 'form_level', d.form_level,
    'show_progress', d.show_progress, 'award_xp', d.award_xp,
    'class_title', (SELECT cl.title FROM public.classes cl WHERE cl.id = d.class_id),
    'subject_name', (SELECT s.name FROM public.subjects s WHERE s.id = d.subject_id),
    'students_accessed', (SELECT count(DISTINCT p.student_user_id) FROM public.flashcard_deck_progress p WHERE p.deck_id = d.id),
    'total_reviews', (SELECT COALESCE(sum(r.review_count), 0) FROM public.flashcard_reviews r
                        JOIN public.flashcards f3 ON f3.id = r.card_id WHERE f3.deck_id = d.id),
    'cards', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', f.id, 'front', f.front_text, 'back', f.back_text,
        'front_content', f.front_content, 'back_content', f.back_content,
        'front_image_path', f.front_image_path, 'front_image_width', f.front_image_width,
        'front_image_height', f.front_image_height, 'front_image_alt', f.front_image_alt,
        'front_image_crop', f.front_image_crop,
        'back_image_path', f.back_image_path, 'back_image_width', f.back_image_width,
        'back_image_height', f.back_image_height, 'back_image_alt', f.back_image_alt,
        'back_image_crop', f.back_image_crop,
        'tags', to_jsonb(f.tags),
        'display_order', f.sort_order)
        ORDER BY f.sort_order, f.created_at)
      FROM public.flashcards f WHERE f.deck_id = d.id), '[]'::jsonb))
  INTO v_out FROM public.flashcard_decks d WHERE d.id = _deck_id;
  RETURN v_out;
END; $$;

-- ─── 5. Student study payload ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_flashcard_deck_for_study(_deck_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
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
    'cover_path', v_deck.cover_path, 'form_level', v_deck.form_level,
    'show_progress', v_deck.show_progress, 'award_xp', v_deck.award_xp,
    'class_title', (SELECT cl.title FROM public.classes cl WHERE cl.id = v_deck.class_id),
    'subject_name', (SELECT s.name FROM public.subjects s WHERE s.id = v_deck.subject_id),
    'completed', EXISTS (SELECT 1 FROM public.student_xp_events e
      WHERE e.student_user_id = auth.uid() AND e.event_type = 'flashcard_completed' AND e.source_id = v_deck.id),
    'cards', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', f.id, 'front', f.front_text, 'back', f.back_text,
        'front_content', f.front_content, 'back_content', f.back_content,
        'front_image_path', f.front_image_path, 'front_image_width', f.front_image_width,
        'front_image_height', f.front_image_height, 'front_image_alt', f.front_image_alt,
        'front_image_crop', f.front_image_crop,
        'back_image_path', f.back_image_path, 'back_image_width', f.back_image_width,
        'back_image_height', f.back_image_height, 'back_image_alt', f.back_image_alt,
        'back_image_crop', f.back_image_crop,
        'tags', to_jsonb(f.tags),
        'display_order', f.sort_order)
        ORDER BY f.sort_order, f.created_at)
      FROM public.flashcards f WHERE f.deck_id = v_deck.id
        AND (btrim(f.front_text) <> '' OR f.front_image_path IS NOT NULL)
        AND (btrim(f.back_text) <> '' OR f.back_image_path IS NOT NULL)), '[]'::jsonb))
  INTO v_out;
  RETURN v_out;
END; $$;

-- ─── 6. Centre-wide manager library ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_flashcard_decks_for_manager()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_center uuid; v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  v_center := public.get_user_center(auth.uid());
  IF v_center IS NULL THEN RAISE EXCEPTION 'missing center'; END IF;
  IF NOT public.tenant_feature_enabled(v_center, 'flashcards') THEN RAISE EXCEPTION 'flashcards disabled'; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', d.id, 'center_id', d.center_id, 'class_id', d.class_id, 'title', d.title,
      'description', d.description, 'status', d.status, 'display_order', d.display_order,
      'definition_version', d.definition_version, 'created_by', d.created_by,
      'published_at', d.published_at, 'created_at', d.created_at, 'updated_at', d.updated_at,
      'cover_path', d.cover_path, 'form_level', d.form_level,
      'show_progress', d.show_progress, 'award_xp', d.award_xp,
      'class_title', cl.title,
      'subject_name', s.name,
      'card_count', (SELECT count(*) FROM public.flashcards f WHERE f.deck_id = d.id),
      'valid_card_count', (SELECT count(*) FROM public.flashcards f
         WHERE f.deck_id = d.id
           AND (btrim(f.front_text) <> '' OR f.front_image_path IS NOT NULL)
           AND (btrim(f.back_text) <> '' OR f.back_image_path IS NOT NULL)),
      'students_accessed', (SELECT count(DISTINCT p.student_user_id) FROM public.flashcard_deck_progress p WHERE p.deck_id = d.id),
      'total_reviews', (SELECT COALESCE(sum(r.review_count), 0) FROM public.flashcard_reviews r
                          JOIN public.flashcards f2 ON f2.id = r.card_id WHERE f2.deck_id = d.id)
    ) ORDER BY d.updated_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM public.flashcard_decks d
  JOIN public.classes cl ON cl.id = d.class_id
  LEFT JOIN public.subjects s ON s.id = d.subject_id
  WHERE d.center_id = v_center
    AND public.can_manage_class(d.class_id);
  RETURN v_rows;
END; $$;

-- ─── 7. Centre-wide student deck list ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_student_flashcard_decks()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_center uuid; v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  v_center := public.get_user_center(auth.uid());
  IF v_center IS NULL THEN RAISE EXCEPTION 'missing center'; END IF;
  IF NOT public.tenant_feature_enabled(v_center, 'flashcards') THEN RAISE EXCEPTION 'flashcards disabled'; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', d.id, 'class_id', d.class_id, 'title', d.title, 'description', d.description,
      'display_order', d.display_order, 'published_at', d.published_at,
      'cover_path', d.cover_path, 'form_level', d.form_level, 'show_progress', d.show_progress,
      'class_title', cl.title, 'subject_name', s.name,
      'card_count', (SELECT count(*) FROM public.flashcards f
         WHERE f.deck_id = d.id
           AND (btrim(f.front_text) <> '' OR f.front_image_path IS NOT NULL)
           AND (btrim(f.back_text) <> '' OR f.back_image_path IS NOT NULL)),
      'completed', EXISTS (SELECT 1 FROM public.student_xp_events e
        WHERE e.student_user_id = auth.uid() AND e.event_type = 'flashcard_completed' AND e.source_id = d.id),
      'completed_card_count', COALESCE(jsonb_array_length(p.completed_ids), 0),
      'reviewed_card_count', COALESCE(jsonb_array_length(p.reviewed_ids), 0),
      'started', p.id IS NOT NULL,
      'run_completed_at', p.completed_at,
      'last_studied_at', p.last_studied_at
    ) ORDER BY p.last_studied_at DESC NULLS LAST, d.display_order, d.created_at), '[]'::jsonb)
  INTO v_rows
  FROM public.flashcard_decks d
  JOIN public.classes cl ON cl.id = d.class_id
  LEFT JOIN public.subjects s ON s.id = d.subject_id
  LEFT JOIN public.flashcard_deck_progress p ON p.deck_id = d.id AND p.student_user_id = auth.uid()
  WHERE d.center_id = v_center AND d.status = 'published'
    AND public.is_enrolled_in_class(d.class_id);
  RETURN v_rows;
END; $$;

REVOKE ALL ON FUNCTION public.list_flashcard_decks_for_manager() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_student_flashcard_decks() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_flashcard_decks_for_manager() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_student_flashcard_decks() TO authenticated;

-- ─── 8. Duplication carries rich content, media and tags ────────────────────
CREATE OR REPLACE FUNCTION public.duplicate_flashcard_deck_as_draft(_deck_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_src public.flashcard_decks; v_new uuid; v_order integer;
BEGIN
  SELECT * INTO v_src FROM public.flashcard_decks WHERE id = _deck_id;
  IF v_src.id IS NULL THEN RAISE EXCEPTION 'deck not found'; END IF;
  PERFORM public._flashcard_manager_center(v_src.class_id);
  SELECT COALESCE(MAX(display_order), -1) + 1 INTO v_order FROM public.flashcard_decks WHERE class_id = v_src.class_id;
  INSERT INTO public.flashcard_decks (center_id, class_id, subject_id, title, description, status, display_order, created_by,
                                      cover_path, form_level, show_progress, award_xp)
  VALUES (v_src.center_id, v_src.class_id, v_src.subject_id, left(v_src.title || ' (copy)', 300), v_src.description,
          'draft', v_order, auth.uid(), v_src.cover_path, v_src.form_level, v_src.show_progress, v_src.award_xp)
  RETURNING id INTO v_new;
  INSERT INTO public.flashcards (deck_id, center_id, front_text, back_text, front_content, back_content,
    front_image_path, front_image_width, front_image_height, front_image_alt, front_image_crop,
    back_image_path, back_image_width, back_image_height, back_image_alt, back_image_crop, tags, sort_order)
  SELECT v_new, v_src.center_id, front_text, back_text, front_content, back_content,
    front_image_path, front_image_width, front_image_height, front_image_alt, front_image_crop,
    back_image_path, back_image_width, back_image_height, back_image_alt, back_image_crop, tags, sort_order
  FROM public.flashcards WHERE deck_id = _deck_id ORDER BY sort_order, created_at;
  RETURN v_new;
END; $$;