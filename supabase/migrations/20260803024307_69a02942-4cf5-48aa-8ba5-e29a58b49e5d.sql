
-- ============ 1. Integrity ============
ALTER TABLE public.flashcards ADD COLUMN IF NOT EXISTS center_id uuid;

UPDATE public.flashcards f SET center_id = d.center_id
FROM public.flashcard_decks d WHERE d.id = f.deck_id AND f.center_id IS DISTINCT FROM d.center_id;

DELETE FROM public.flashcards WHERE center_id IS NULL;

ALTER TABLE public.flashcards ALTER COLUMN center_id SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE public.flashcards
    ADD CONSTRAINT flashcards_center_fk FOREIGN KEY (center_id) REFERENCES public.tuition_centers(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.flashcards DROP CONSTRAINT IF EXISTS flashcards_deck_id_fkey;
  ALTER TABLE public.flashcards
    ADD CONSTRAINT flashcards_deck_id_fkey FOREIGN KEY (deck_id) REFERENCES public.flashcard_decks(id) ON DELETE CASCADE;
END $$;

ALTER TABLE public.flashcards ALTER COLUMN sort_order SET DEFAULT 0;
UPDATE public.flashcards SET sort_order = 0 WHERE sort_order IS NULL;
ALTER TABLE public.flashcards ALTER COLUMN sort_order SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE public.flashcard_decks
    ADD CONSTRAINT flashcard_decks_status_check CHECK (status IN ('draft','published','archived'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_flashcard_decks_class_order ON public.flashcard_decks(class_id, display_order, created_at);
CREATE INDEX IF NOT EXISTS idx_flashcard_decks_center ON public.flashcard_decks(center_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_deck_order ON public.flashcards(deck_id, sort_order, created_at);
CREATE INDEX IF NOT EXISTS idx_flashcards_center ON public.flashcards(center_id);

-- card tenant guard + updated_at
CREATE OR REPLACE FUNCTION public.flashcards_enforce_center()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_center uuid;
BEGIN
  SELECT center_id INTO v_center FROM public.flashcard_decks WHERE id = NEW.deck_id;
  IF v_center IS NULL THEN RAISE EXCEPTION 'invalid deck'; END IF;
  IF NEW.center_id IS NULL THEN
    NEW.center_id := v_center;
  ELSIF NEW.center_id <> v_center THEN
    RAISE EXCEPTION 'card center must match deck center';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_flashcards_enforce_center ON public.flashcards;
CREATE TRIGGER trg_flashcards_enforce_center BEFORE INSERT OR UPDATE ON public.flashcards
FOR EACH ROW EXECUTE FUNCTION public.flashcards_enforce_center();

-- publish validation
CREATE OR REPLACE FUNCTION public.flashcard_decks_validate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_valid_cards integer;
BEGIN
  NEW.updated_at := now();
  IF NEW.status = 'published' THEN
    IF COALESCE(btrim(NEW.title),'') = '' THEN RAISE EXCEPTION 'published deck requires a title'; END IF;
    IF NEW.class_id IS NULL THEN RAISE EXCEPTION 'published deck requires a class'; END IF;
    SELECT count(*) INTO v_valid_cards FROM public.flashcards
      WHERE deck_id = NEW.id AND btrim(front_text) <> '' AND btrim(back_text) <> '';
    IF v_valid_cards = 0 THEN RAISE EXCEPTION 'published deck requires at least one complete card'; END IF;
    IF NEW.published_at IS NULL THEN NEW.published_at := now(); END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_flashcard_decks_validate ON public.flashcard_decks;
CREATE TRIGGER trg_flashcard_decks_validate BEFORE INSERT OR UPDATE ON public.flashcard_decks
FOR EACH ROW EXECUTE FUNCTION public.flashcard_decks_validate();

-- ============ 2. Feature-flag helper ============
CREATE OR REPLACE FUNCTION public.tenant_feature_enabled(_center_id uuid, _flag text, _default boolean DEFAULT true)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN _center_id IS NULL THEN false
    ELSE COALESCE(
      (SELECT (tc.feature_flags->>_flag)::boolean FROM public.tuition_centers tc
        WHERE tc.id = _center_id AND jsonb_typeof(tc.feature_flags->_flag) = 'boolean'),
      _default)
  END;
$$;
REVOKE ALL ON FUNCTION public.tenant_feature_enabled(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tenant_feature_enabled(uuid, text, boolean) TO authenticated, service_role;

-- ============ 3. Grants + RLS ============
REVOKE ALL ON public.flashcard_decks FROM anon, PUBLIC;
REVOKE ALL ON public.flashcards FROM anon, PUBLIC;
REVOKE ALL ON public.flashcard_progress FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.flashcard_decks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.flashcards TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.flashcard_progress TO authenticated;
GRANT ALL ON public.flashcard_decks, public.flashcards, public.flashcard_progress TO service_role;

ALTER TABLE public.flashcard_decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flashcards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flashcard_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "flashcard_decks manage by tutor/admin" ON public.flashcard_decks;
DROP POLICY IF EXISTS "flashcard_decks read published by enrolled" ON public.flashcard_decks;
DROP POLICY IF EXISTS "flashcards manage by tutor/admin" ON public.flashcards;
DROP POLICY IF EXISTS "flashcards read published by enrolled" ON public.flashcards;
DROP POLICY IF EXISTS "flashcard_progress own" ON public.flashcard_progress;

CREATE POLICY "flashcard_decks manage by tutor or center admin" ON public.flashcard_decks
FOR ALL TO authenticated
USING (class_id IS NOT NULL AND public.can_manage_class(class_id)
       AND public.tenant_feature_enabled(center_id, 'flashcards'))
WITH CHECK (class_id IS NOT NULL AND public.can_manage_class(class_id)
       AND center_id = (SELECT c.center_id FROM public.classes c WHERE c.id = class_id)
       AND public.tenant_feature_enabled(center_id, 'flashcards'));

CREATE POLICY "flashcard_decks read published by enrolled student" ON public.flashcard_decks
FOR SELECT TO authenticated
USING (status = 'published' AND class_id IS NOT NULL
       AND public.is_enrolled_in_class(class_id)
       AND public.tenant_feature_enabled(center_id, 'flashcards'));

CREATE POLICY "flashcards manage by tutor or center admin" ON public.flashcards
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.flashcard_decks d
        WHERE d.id = flashcards.deck_id AND d.class_id IS NOT NULL
          AND public.can_manage_class(d.class_id)
          AND public.tenant_feature_enabled(d.center_id, 'flashcards')))
WITH CHECK (EXISTS (SELECT 1 FROM public.flashcard_decks d
        WHERE d.id = flashcards.deck_id AND d.class_id IS NOT NULL
          AND public.can_manage_class(d.class_id)
          AND public.tenant_feature_enabled(d.center_id, 'flashcards')));

CREATE POLICY "flashcards read published by enrolled student" ON public.flashcards
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.flashcard_decks d
        WHERE d.id = flashcards.deck_id AND d.status = 'published' AND d.class_id IS NOT NULL
          AND public.is_enrolled_in_class(d.class_id)
          AND public.tenant_feature_enabled(d.center_id, 'flashcards')));

CREATE POLICY "flashcard_progress own rows" ON public.flashcard_progress
FOR ALL TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============ 4. Manager guard ============
CREATE OR REPLACE FUNCTION public._flashcard_manager_center(_class_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_center uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT center_id INTO v_center FROM public.classes WHERE id = _class_id;
  IF v_center IS NULL THEN RAISE EXCEPTION 'class not found'; END IF;
  IF NOT public.can_manage_class(_class_id) THEN RAISE EXCEPTION 'not permitted'; END IF;
  IF NOT public.tenant_feature_enabled(v_center, 'flashcards') THEN RAISE EXCEPTION 'flashcards disabled'; END IF;
  RETURN v_center;
END; $$;
REVOKE ALL ON FUNCTION public._flashcard_manager_center(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._flashcard_manager_center(uuid) TO authenticated, service_role;

-- ============ 5. Manager RPCs ============
CREATE OR REPLACE FUNCTION public.save_flashcard_deck(
  _class_id uuid, _definition jsonb, _deck_id uuid DEFAULT NULL, _publish boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_center uuid; v_deck uuid := _deck_id; v_title text; v_desc text;
  v_cards jsonb; v_card jsonb; v_i integer := 0; v_valid integer := 0;
  v_front text; v_back text; v_order integer;
BEGIN
  v_center := public._flashcard_manager_center(_class_id);
  v_title := btrim(COALESCE(_definition->>'title',''));
  v_desc := NULLIF(btrim(COALESCE(_definition->>'description','')), '');
  v_cards := COALESCE(_definition->'cards', '[]'::jsonb);
  IF jsonb_typeof(v_cards) <> 'array' THEN RAISE EXCEPTION 'invalid cards payload'; END IF;

  IF v_deck IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.flashcard_decks WHERE id = v_deck AND class_id = _class_id AND center_id = v_center) THEN
      RAISE EXCEPTION 'deck not found';
    END IF;
  END IF;

  -- validate publication requirements up-front
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
    RETURNING id INTO v_deck;
  ELSE
    UPDATE public.flashcard_decks
       SET title = COALESCE(NULLIF(v_title,''), title), description = v_desc
     WHERE id = v_deck;
  END IF;

  DELETE FROM public.flashcards WHERE deck_id = v_deck;
  FOR v_card IN SELECT * FROM jsonb_array_elements(v_cards) LOOP
    v_front := btrim(COALESCE(v_card->>'front',''));
    v_back := btrim(COALESCE(v_card->>'back',''));
    INSERT INTO public.flashcards (deck_id, center_id, front_text, back_text, sort_order)
    VALUES (v_deck, v_center, v_front, v_back, v_i);
    v_i := v_i + 1;
  END LOOP;

  IF _publish THEN
    UPDATE public.flashcard_decks SET status = 'published' WHERE id = v_deck;
  END IF;

  RETURN jsonb_build_object('deck_id', v_deck, 'card_count', v_i,
    'status', (SELECT status FROM public.flashcard_decks WHERE id = v_deck));
END; $$;

CREATE OR REPLACE FUNCTION public.delete_flashcard_deck_safe(_deck_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_class uuid;
BEGIN
  SELECT class_id INTO v_class FROM public.flashcard_decks WHERE id = _deck_id;
  IF v_class IS NULL THEN RAISE EXCEPTION 'deck not found'; END IF;
  PERFORM public._flashcard_manager_center(v_class);
  DELETE FROM public.flashcards WHERE deck_id = _deck_id;
  DELETE FROM public.flashcard_decks WHERE id = _deck_id;
  RETURN jsonb_build_object('deleted', true, 'deck_id', _deck_id);
END; $$;

CREATE OR REPLACE FUNCTION public.duplicate_flashcard_deck_as_draft(_deck_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_src public.flashcard_decks; v_new uuid; v_order integer;
BEGIN
  SELECT * INTO v_src FROM public.flashcard_decks WHERE id = _deck_id;
  IF v_src.id IS NULL THEN RAISE EXCEPTION 'deck not found'; END IF;
  PERFORM public._flashcard_manager_center(v_src.class_id);
  SELECT COALESCE(MAX(display_order), -1) + 1 INTO v_order FROM public.flashcard_decks WHERE class_id = v_src.class_id;
  INSERT INTO public.flashcard_decks (center_id, class_id, subject_id, title, description, status, display_order, created_by)
  VALUES (v_src.center_id, v_src.class_id, v_src.subject_id, left(v_src.title || ' (copy)', 300), v_src.description,
          'draft', v_order, auth.uid())
  RETURNING id INTO v_new;
  INSERT INTO public.flashcards (deck_id, center_id, front_text, back_text, sort_order)
  SELECT v_new, v_src.center_id, front_text, back_text, sort_order
  FROM public.flashcards WHERE deck_id = _deck_id ORDER BY sort_order, created_at;
  RETURN v_new;
END; $$;

CREATE OR REPLACE FUNCTION public.set_flashcard_deck_status(_deck_id uuid, _status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_class uuid;
BEGIN
  IF _status NOT IN ('draft','published','archived') THEN RAISE EXCEPTION 'invalid status'; END IF;
  SELECT class_id INTO v_class FROM public.flashcard_decks WHERE id = _deck_id;
  IF v_class IS NULL THEN RAISE EXCEPTION 'deck not found'; END IF;
  PERFORM public._flashcard_manager_center(v_class);
  UPDATE public.flashcard_decks SET status = _status,
    published_at = CASE WHEN _status = 'published' THEN COALESCE(published_at, now()) ELSE published_at END
  WHERE id = _deck_id;
  RETURN jsonb_build_object('deck_id', _deck_id, 'status', _status);
END; $$;

CREATE OR REPLACE FUNCTION public.reorder_flashcard_decks(_class_id uuid, _deck_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_center uuid; v_count integer;
BEGIN
  v_center := public._flashcard_manager_center(_class_id);
  SELECT count(*) INTO v_count FROM public.flashcard_decks
   WHERE id = ANY(_deck_ids) AND class_id = _class_id AND center_id = v_center;
  IF v_count <> COALESCE(array_length(_deck_ids,1),0) THEN RAISE EXCEPTION 'invalid deck list'; END IF;
  UPDATE public.flashcard_decks d SET display_order = x.ord - 1
    FROM unnest(_deck_ids) WITH ORDINALITY AS x(deck_id, ord)
   WHERE d.id = x.deck_id;
  RETURN jsonb_build_object('reordered', v_count);
END; $$;

CREATE OR REPLACE FUNCTION public.list_class_flashcard_decks_for_manager(_class_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_rows jsonb;
BEGIN
  PERFORM public._flashcard_manager_center(_class_id);
  SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'display_order')::int, row->>'created_at'), '[]'::jsonb)
  INTO v_rows FROM (
    SELECT jsonb_build_object(
      'id', d.id, 'center_id', d.center_id, 'class_id', d.class_id, 'title', d.title,
      'description', d.description, 'status', d.status, 'display_order', d.display_order,
      'created_by', d.created_by, 'published_at', d.published_at,
      'created_at', d.created_at, 'updated_at', d.updated_at,
      'card_count', (SELECT count(*) FROM public.flashcards f WHERE f.deck_id = d.id),
      'valid_card_count', (SELECT count(*) FROM public.flashcards f
         WHERE f.deck_id = d.id AND btrim(f.front_text) <> '' AND btrim(f.back_text) <> '')
    ) AS row
    FROM public.flashcard_decks d WHERE d.class_id = _class_id
  ) s;
  RETURN v_rows;
END; $$;

CREATE OR REPLACE FUNCTION public.get_flashcard_deck_for_manager(_deck_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_class uuid; v_out jsonb;
BEGIN
  SELECT class_id INTO v_class FROM public.flashcard_decks WHERE id = _deck_id;
  IF v_class IS NULL THEN RAISE EXCEPTION 'deck not found'; END IF;
  PERFORM public._flashcard_manager_center(v_class);
  SELECT jsonb_build_object(
    'id', d.id, 'center_id', d.center_id, 'class_id', d.class_id, 'title', d.title,
    'description', d.description, 'status', d.status, 'display_order', d.display_order,
    'created_by', d.created_by, 'published_at', d.published_at,
    'created_at', d.created_at, 'updated_at', d.updated_at,
    'cards', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', f.id, 'front', f.front_text, 'back', f.back_text, 'display_order', f.sort_order)
        ORDER BY f.sort_order, f.created_at)
      FROM public.flashcards f WHERE f.deck_id = d.id), '[]'::jsonb))
  INTO v_out FROM public.flashcard_decks d WHERE d.id = _deck_id;
  RETURN v_out;
END; $$;

-- ============ 6. Student RPCs ============
CREATE OR REPLACE FUNCTION public.list_class_flashcard_decks_for_student(_class_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_center uuid; v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT center_id INTO v_center FROM public.classes WHERE id = _class_id;
  IF v_center IS NULL THEN RAISE EXCEPTION 'class not found'; END IF;
  IF NOT public.is_enrolled_in_class(_class_id) THEN RAISE EXCEPTION 'not permitted'; END IF;
  IF v_center IS DISTINCT FROM public.get_user_center(auth.uid()) THEN RAISE EXCEPTION 'not permitted'; END IF;
  IF NOT public.tenant_feature_enabled(v_center, 'flashcards') THEN RAISE EXCEPTION 'flashcards disabled'; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', d.id, 'class_id', d.class_id, 'title', d.title, 'description', d.description,
      'display_order', d.display_order, 'published_at', d.published_at,
      'card_count', (SELECT count(*) FROM public.flashcards f
        WHERE f.deck_id = d.id AND btrim(f.front_text) <> '' AND btrim(f.back_text) <> ''),
      'completed', EXISTS (SELECT 1 FROM public.student_xp_events e
        WHERE e.student_user_id = auth.uid() AND e.event_type = 'flashcard_completed' AND e.source_id = d.id)
    ) ORDER BY d.display_order, d.created_at), '[]'::jsonb)
  INTO v_rows FROM public.flashcard_decks d
  WHERE d.class_id = _class_id AND d.status = 'published' AND d.center_id = v_center;
  RETURN v_rows;
END; $$;

CREATE OR REPLACE FUNCTION public.get_flashcard_deck_for_study(_deck_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
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
        'id', f.id, 'front', f.front_text, 'back', f.back_text, 'display_order', f.sort_order)
        ORDER BY f.sort_order, f.created_at)
      FROM public.flashcards f WHERE f.deck_id = v_deck.id
        AND btrim(f.front_text) <> '' AND btrim(f.back_text) <> ''), '[]'::jsonb))
  INTO v_out;
  RETURN v_out;
END; $$;

CREATE OR REPLACE FUNCTION public.record_flashcard_deck_completion(_deck_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_deck public.flashcard_decks; v_already boolean; v_res jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO v_deck FROM public.flashcard_decks WHERE id = _deck_id;
  IF v_deck.id IS NULL OR v_deck.status <> 'published' OR v_deck.class_id IS NULL THEN RAISE EXCEPTION 'deck not available'; END IF;
  IF NOT public.is_enrolled_in_class(v_deck.class_id) THEN RAISE EXCEPTION 'not permitted'; END IF;
  IF NOT public.tenant_feature_enabled(v_deck.center_id, 'flashcards') THEN RAISE EXCEPTION 'flashcards disabled'; END IF;

  SELECT EXISTS (SELECT 1 FROM public.student_xp_events e
    WHERE e.student_user_id = auth.uid() AND e.event_type = 'flashcard_completed' AND e.source_id = _deck_id)
  INTO v_already;
  IF v_already THEN
    RETURN jsonb_build_object('awarded', false, 'reason', 'already_completed');
  END IF;

  v_res := public.record_learning_activity('flashcard_completed', 25, _deck_id, 'flashcard_deck');
  RETURN jsonb_build_object('awarded', true, 'activity', v_res);
END; $$;

-- ============ 7. Function grants ============
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.save_flashcard_deck(uuid, jsonb, uuid, boolean)',
    'public.delete_flashcard_deck_safe(uuid)',
    'public.duplicate_flashcard_deck_as_draft(uuid)',
    'public.set_flashcard_deck_status(uuid, text)',
    'public.reorder_flashcard_decks(uuid, uuid[])',
    'public.list_class_flashcard_decks_for_manager(uuid)',
    'public.get_flashcard_deck_for_manager(uuid)',
    'public.list_class_flashcard_decks_for_student(uuid)',
    'public.get_flashcard_deck_for_study(uuid)',
    'public.record_flashcard_deck_completion(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
  END LOOP;
END $$;
