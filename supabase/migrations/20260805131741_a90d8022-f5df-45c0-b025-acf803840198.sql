-- ============ C. FOLDER TABLE ============
CREATE TABLE public.class_content_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL REFERENCES public.tuition_centers(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  parent_id uuid NULL REFERENCES public.class_content_folders(id) ON DELETE RESTRICT,
  name text NOT NULL,
  description text NULL,
  cover_image_path text NULL,
  display_order integer NOT NULL DEFAULT 0,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT class_content_folders_name_len CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
  CONSTRAINT class_content_folders_not_self_parent CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE INDEX idx_ccf_class ON public.class_content_folders (class_id, parent_id, display_order, id);
CREATE INDEX idx_ccf_parent ON public.class_content_folders (parent_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_content_folders TO authenticated;
GRANT ALL ON public.class_content_folders TO service_role;

ALTER TABLE public.class_content_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ccf_manager_all" ON public.class_content_folders
  FOR ALL TO authenticated
  USING (public.can_manage_class(class_id))
  WITH CHECK (public.can_manage_class(class_id) AND center_id = (SELECT c.center_id FROM public.classes c WHERE c.id = class_id));

CREATE POLICY "ccf_student_read" ON public.class_content_folders
  FOR SELECT TO authenticated
  USING (public.is_enrolled_in_class(class_id));

CREATE TRIGGER trg_ccf_touch BEFORE UPDATE ON public.class_content_folders
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- ============ depth / cycle validation ============
CREATE OR REPLACE FUNCTION public._ccf_depth(_folder_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH RECURSIVE up AS (
    SELECT id, parent_id, 1 AS d FROM public.class_content_folders WHERE id = _folder_id
    UNION ALL
    SELECT f.id, f.parent_id, up.d + 1 FROM public.class_content_folders f JOIN up ON up.parent_id = f.id
  )
  SELECT COALESCE(max(d), 0) FROM up;
$$;

CREATE OR REPLACE FUNCTION public._ccf_subtree_height(_folder_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH RECURSIVE down AS (
    SELECT id, 1 AS d FROM public.class_content_folders WHERE id = _folder_id
    UNION ALL
    SELECT f.id, down.d + 1 FROM public.class_content_folders f JOIN down ON f.parent_id = down.id
  )
  SELECT COALESCE(max(d), 1) FROM down;
$$;

CREATE OR REPLACE FUNCTION public._ccf_is_descendant(_candidate uuid, _ancestor uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH RECURSIVE up AS (
    SELECT id, parent_id FROM public.class_content_folders WHERE id = _candidate
    UNION ALL
    SELECT f.id, f.parent_id FROM public.class_content_folders f JOIN up ON up.parent_id = f.id
  )
  SELECT EXISTS (SELECT 1 FROM up WHERE up.id = _ancestor AND up.id <> _candidate)
      OR _candidate = _ancestor;
$$;

CREATE OR REPLACE FUNCTION public.class_content_folders_validate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_class_center uuid;
  v_parent RECORD;
  v_depth integer;
  v_height integer;
BEGIN
  SELECT center_id INTO v_class_center FROM public.classes WHERE id = NEW.class_id;
  IF v_class_center IS NULL THEN
    RAISE EXCEPTION 'Class not found';
  END IF;
  NEW.center_id := v_class_center;

  IF NEW.parent_id IS NOT NULL THEN
    IF NEW.parent_id = NEW.id THEN
      RAISE EXCEPTION 'A folder cannot be its own parent';
    END IF;
    SELECT id, class_id, center_id INTO v_parent FROM public.class_content_folders WHERE id = NEW.parent_id;
    IF v_parent.id IS NULL THEN
      RAISE EXCEPTION 'Parent folder not found';
    END IF;
    IF v_parent.class_id <> NEW.class_id THEN
      RAISE EXCEPTION 'Parent folder belongs to another class';
    END IF;
    IF v_parent.center_id <> NEW.center_id THEN
      RAISE EXCEPTION 'Parent folder belongs to another organisation';
    END IF;
    IF TG_OP = 'UPDATE' AND public._ccf_is_descendant(NEW.parent_id, NEW.id) THEN
      RAISE EXCEPTION 'A folder cannot be moved into one of its own subfolders';
    END IF;
    v_depth := public._ccf_depth(NEW.parent_id) + 1;
  ELSE
    v_depth := 1;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_height := public._ccf_subtree_height(NEW.id);
  ELSE
    v_height := 1;
  END IF;

  IF v_depth + v_height - 1 > 5 THEN
    RAISE EXCEPTION 'Folders can only be nested up to 5 levels deep';
  END IF;

  NEW.name := btrim(NEW.name);
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_ccf_validate BEFORE INSERT OR UPDATE ON public.class_content_folders
  FOR EACH ROW EXECUTE FUNCTION public.class_content_folders_validate();

-- ============ D. FOLDER ASSIGNMENT ON CONTENT ============
ALTER TABLE public.class_resources   ADD COLUMN folder_id uuid NULL REFERENCES public.class_content_folders(id) ON DELETE SET NULL;
ALTER TABLE public.quizzes           ADD COLUMN folder_id uuid NULL REFERENCES public.class_content_folders(id) ON DELETE SET NULL;
ALTER TABLE public.flashcard_decks   ADD COLUMN folder_id uuid NULL REFERENCES public.class_content_folders(id) ON DELETE SET NULL;

CREATE INDEX idx_class_resources_folder ON public.class_resources (folder_id);
CREATE INDEX idx_quizzes_folder ON public.quizzes (folder_id);
CREATE INDEX idx_flashcard_decks_folder ON public.flashcard_decks (folder_id);

CREATE OR REPLACE FUNCTION public._validate_content_folder()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_f RECORD;
BEGIN
  IF NEW.folder_id IS NULL THEN RETURN NEW; END IF;
  SELECT class_id, center_id INTO v_f FROM public.class_content_folders WHERE id = NEW.folder_id;
  IF v_f.class_id IS NULL THEN
    RAISE EXCEPTION 'Folder not found';
  END IF;
  IF NEW.class_id IS NULL OR v_f.class_id <> NEW.class_id THEN
    RAISE EXCEPTION 'Folder belongs to another class';
  END IF;
  IF NEW.center_id IS NOT NULL AND v_f.center_id <> NEW.center_id THEN
    RAISE EXCEPTION 'Folder belongs to another organisation';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_class_resources_folder BEFORE INSERT OR UPDATE OF folder_id, class_id ON public.class_resources
  FOR EACH ROW EXECUTE FUNCTION public._validate_content_folder();
CREATE TRIGGER trg_quizzes_folder BEFORE INSERT OR UPDATE OF folder_id, class_id ON public.quizzes
  FOR EACH ROW EXECUTE FUNCTION public._validate_content_folder();
CREATE TRIGGER trg_flashcard_decks_folder BEFORE INSERT OR UPDATE OF folder_id, class_id ON public.flashcard_decks
  FOR EACH ROW EXECUTE FUNCTION public._validate_content_folder();

-- ============ E. MANAGER RPCS ============
CREATE OR REPLACE FUNCTION public.save_class_content_folder(
  _class_id uuid,
  _name text,
  _folder_id uuid DEFAULT NULL,
  _parent_id uuid DEFAULT NULL,
  _description text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid; v_next integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.can_manage_class(_class_id) THEN RAISE EXCEPTION 'Not allowed to manage this class'; END IF;
  IF _name IS NULL OR btrim(_name) = '' THEN RAISE EXCEPTION 'Folder name is required'; END IF;

  IF _folder_id IS NULL THEN
    SELECT COALESCE(max(display_order), -1) + 1 INTO v_next
      FROM public.class_content_folders
     WHERE class_id = _class_id AND parent_id IS NOT DISTINCT FROM _parent_id;
    INSERT INTO public.class_content_folders (class_id, center_id, parent_id, name, description, display_order, created_by)
    VALUES (_class_id, (SELECT center_id FROM public.classes WHERE id = _class_id), _parent_id, _name, _description, v_next, auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.class_content_folders
       SET name = _name, description = _description, parent_id = _parent_id
     WHERE id = _folder_id AND class_id = _class_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Folder not found for this class'; END IF;
  END IF;

  RETURN jsonb_build_object('id', v_id);
END; $$;

CREATE OR REPLACE FUNCTION public.move_class_content_folder(_folder_id uuid, _new_parent_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_class uuid; v_next integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT class_id INTO v_class FROM public.class_content_folders WHERE id = _folder_id;
  IF v_class IS NULL THEN RAISE EXCEPTION 'Folder not found'; END IF;
  IF NOT public.can_manage_class(v_class) THEN RAISE EXCEPTION 'Not allowed to manage this class'; END IF;

  SELECT COALESCE(max(display_order), -1) + 1 INTO v_next
    FROM public.class_content_folders
   WHERE class_id = v_class AND parent_id IS NOT DISTINCT FROM _new_parent_id AND id <> _folder_id;

  UPDATE public.class_content_folders
     SET parent_id = _new_parent_id, display_order = v_next
   WHERE id = _folder_id;

  RETURN jsonb_build_object('id', _folder_id, 'parent_id', _new_parent_id);
END; $$;

CREATE OR REPLACE FUNCTION public.reorder_class_content_folders(_class_id uuid, _ordered_ids uuid[], _parent_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_expected integer; v_given integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.can_manage_class(_class_id) THEN RAISE EXCEPTION 'Not allowed to manage this class'; END IF;

  SELECT count(*) INTO v_expected FROM public.class_content_folders
   WHERE class_id = _class_id AND parent_id IS NOT DISTINCT FROM _parent_id;
  SELECT count(DISTINCT x) INTO v_given FROM unnest(_ordered_ids) AS t(x);
  IF v_given <> v_expected OR v_given <> array_length(_ordered_ids, 1) THEN
    RAISE EXCEPTION 'Order must list every sibling folder exactly once';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(_ordered_ids) AS t(x)
     WHERE NOT EXISTS (
       SELECT 1 FROM public.class_content_folders f
        WHERE f.id = t.x AND f.class_id = _class_id AND f.parent_id IS NOT DISTINCT FROM _parent_id)
  ) THEN
    RAISE EXCEPTION 'Order contains a folder that is not a sibling here';
  END IF;

  UPDATE public.class_content_folders f
     SET display_order = o.idx - 1
    FROM (SELECT x AS id, row_number() OVER () AS idx FROM unnest(_ordered_ids) AS t(x)) o
   WHERE f.id = o.id;
END; $$;

CREATE OR REPLACE FUNCTION public.delete_class_content_folder_safe(_folder_id uuid, _strategy text DEFAULT 'reject')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_class uuid; v_parent uuid; v_items integer; v_subs integer; v_target uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT class_id, parent_id INTO v_class, v_parent FROM public.class_content_folders WHERE id = _folder_id;
  IF v_class IS NULL THEN RAISE EXCEPTION 'Folder not found'; END IF;
  IF NOT public.can_manage_class(v_class) THEN RAISE EXCEPTION 'Not allowed to manage this class'; END IF;
  IF _strategy NOT IN ('reject', 'move_to_parent', 'unfile') THEN RAISE EXCEPTION 'Unknown delete strategy'; END IF;

  SELECT (SELECT count(*) FROM public.class_resources WHERE folder_id = _folder_id)
       + (SELECT count(*) FROM public.quizzes WHERE folder_id = _folder_id)
       + (SELECT count(*) FROM public.flashcard_decks WHERE folder_id = _folder_id)
    INTO v_items;
  SELECT count(*) INTO v_subs FROM public.class_content_folders WHERE parent_id = _folder_id;

  IF _strategy = 'reject' AND (v_items > 0 OR v_subs > 0) THEN
    RAISE EXCEPTION 'This folder is not empty';
  END IF;

  v_target := CASE WHEN _strategy = 'move_to_parent' THEN v_parent ELSE NULL END;

  UPDATE public.class_resources SET folder_id = v_target WHERE folder_id = _folder_id;
  UPDATE public.quizzes SET folder_id = v_target WHERE folder_id = _folder_id;
  UPDATE public.flashcard_decks SET folder_id = v_target WHERE folder_id = _folder_id;
  UPDATE public.class_content_folders SET parent_id = v_target WHERE parent_id = _folder_id;

  DELETE FROM public.class_content_folders WHERE id = _folder_id;

  RETURN jsonb_build_object('deleted', _folder_id, 'moved_items', v_items, 'moved_subfolders', v_subs, 'moved_to', v_target);
END; $$;

CREATE OR REPLACE FUNCTION public.move_class_content_item(_item_type text, _item_id uuid, _folder_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_class uuid; v_folder_class uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _item_type NOT IN ('resource', 'quiz', 'flashcard_deck') THEN RAISE EXCEPTION 'Unknown item type'; END IF;

  IF _item_type = 'resource' THEN
    SELECT class_id INTO v_class FROM public.class_resources WHERE id = _item_id;
  ELSIF _item_type = 'quiz' THEN
    SELECT class_id INTO v_class FROM public.quizzes WHERE id = _item_id;
  ELSE
    SELECT class_id INTO v_class FROM public.flashcard_decks WHERE id = _item_id;
  END IF;
  IF v_class IS NULL THEN RAISE EXCEPTION 'Item not found'; END IF;
  IF NOT public.can_manage_class(v_class) THEN RAISE EXCEPTION 'Not allowed to manage this class'; END IF;

  IF _folder_id IS NOT NULL THEN
    SELECT class_id INTO v_folder_class FROM public.class_content_folders WHERE id = _folder_id;
    IF v_folder_class IS NULL OR v_folder_class <> v_class THEN RAISE EXCEPTION 'Folder belongs to another class'; END IF;
  END IF;

  IF _item_type = 'resource' THEN
    UPDATE public.class_resources SET folder_id = _folder_id WHERE id = _item_id;
  ELSIF _item_type = 'quiz' THEN
    UPDATE public.quizzes SET folder_id = _folder_id WHERE id = _item_id;
  ELSE
    UPDATE public.flashcard_decks SET folder_id = _folder_id WHERE id = _item_id;
  END IF;

  RETURN jsonb_build_object('item_type', _item_type, 'item_id', _item_id, 'folder_id', _folder_id);
END; $$;

-- ============ trees ============
CREATE OR REPLACE FUNCTION public.list_class_content_tree_for_manager(_class_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.can_manage_class(_class_id) THEN RAISE EXCEPTION 'Not allowed to manage this class'; END IF;

  SELECT jsonb_build_object(
    'class', (SELECT jsonb_build_object('id', c.id, 'title', c.title, 'center_id', c.center_id) FROM public.classes c WHERE c.id = _class_id),
    'folders', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', f.id, 'parent_id', f.parent_id, 'name', f.name, 'description', f.description,
        'cover_image_path', f.cover_image_path, 'display_order', f.display_order,
        'resource_count', (SELECT count(*) FROM public.class_resources r WHERE r.folder_id = f.id),
        'quiz_count', (SELECT count(*) FROM public.quizzes q WHERE q.folder_id = f.id),
        'deck_count', (SELECT count(*) FROM public.flashcard_decks d WHERE d.folder_id = f.id),
        'subfolder_count', (SELECT count(*) FROM public.class_content_folders s WHERE s.parent_id = f.id)
      ) ORDER BY f.display_order, f.created_at, f.id)
      FROM public.class_content_folders f WHERE f.class_id = _class_id
    ), '[]'::jsonb),
    'resources', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id, 'folder_id', r.folder_id, 'title', r.title, 'description', r.description,
        'resource_type', r.resource_type, 'source_type', r.source_type, 'status', r.status,
        'file_url', r.file_url, 'file_path', r.file_path, 'external_url', r.external_url,
        'embed_url', r.embed_url, 'thumbnail_path', r.thumbnail_path,
        'display_order', r.display_order, 'created_at', r.created_at, 'published_at', r.published_at
      ) ORDER BY r.display_order, r.created_at, r.id)
      FROM public.class_resources r WHERE r.class_id = _class_id
    ), '[]'::jsonb),
    'quizzes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', q.id, 'folder_id', q.folder_id, 'title', q.title, 'description', q.description,
        'status', q.status, 'total_points', q.total_points, 'due_at', q.due_at, 'created_at', q.created_at
      ) ORDER BY q.created_at DESC, q.id)
      FROM public.quizzes q WHERE q.class_id = _class_id
    ), '[]'::jsonb),
    'flashcard_decks', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', d.id, 'folder_id', d.folder_id, 'title', d.title, 'description', d.description,
        'status', d.status, 'display_order', d.display_order, 'created_at', d.created_at,
        'card_count', (SELECT count(*) FROM public.flashcards fc WHERE fc.deck_id = d.id)
      ) ORDER BY d.display_order, d.created_at, d.id)
      FROM public.flashcard_decks d WHERE d.class_id = _class_id
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.list_class_content_tree_for_student(_class_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_enrolled_in_class(_class_id) THEN RAISE EXCEPTION 'Not enrolled in this class'; END IF;

  SELECT jsonb_build_object(
    'class', (SELECT jsonb_build_object('id', c.id, 'title', c.title) FROM public.classes c WHERE c.id = _class_id),
    'folders', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', f.id, 'parent_id', f.parent_id, 'name', f.name, 'description', f.description,
        'cover_image_path', f.cover_image_path, 'display_order', f.display_order,
        'resource_count', (SELECT count(*) FROM public.class_resources r WHERE r.folder_id = f.id AND r.status = 'published'),
        'quiz_count', (SELECT count(*) FROM public.quizzes q WHERE q.folder_id = f.id AND q.status = 'published'),
        'deck_count', (SELECT count(*) FROM public.flashcard_decks d WHERE d.folder_id = f.id AND d.status = 'published'),
        'subfolder_count', (SELECT count(*) FROM public.class_content_folders s WHERE s.parent_id = f.id)
      ) ORDER BY f.display_order, f.created_at, f.id)
      FROM public.class_content_folders f WHERE f.class_id = _class_id
    ), '[]'::jsonb),
    'resources', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id, 'folder_id', r.folder_id, 'title', r.title, 'description', r.description,
        'resource_type', r.resource_type, 'source_type', r.source_type,
        'file_url', r.file_url, 'file_path', r.file_path, 'external_url', r.external_url,
        'embed_url', r.embed_url, 'thumbnail_path', r.thumbnail_path, 'published_at', r.published_at
      ) ORDER BY r.display_order, r.created_at, r.id)
      FROM public.class_resources r WHERE r.class_id = _class_id AND r.status = 'published'
    ), '[]'::jsonb),
    'quizzes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', q.id, 'folder_id', q.folder_id, 'title', q.title, 'description', q.description,
        'total_points', q.total_points, 'due_at', q.due_at, 'available_from', q.available_from
      ) ORDER BY q.published_at DESC NULLS LAST, q.id)
      FROM public.quizzes q WHERE q.class_id = _class_id AND q.status = 'published'
    ), '[]'::jsonb),
    'flashcard_decks', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', d.id, 'folder_id', d.folder_id, 'title', d.title, 'description', d.description,
        'display_order', d.display_order,
        'card_count', (SELECT count(*) FROM public.flashcards fc WHERE fc.deck_id = d.id)
      ) ORDER BY d.display_order, d.created_at, d.id)
      FROM public.flashcard_decks d WHERE d.class_id = _class_id AND d.status = 'published'
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END; $$;

-- ============ grants ============
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.save_class_content_folder(uuid,text,uuid,uuid,text)',
    'public.move_class_content_folder(uuid,uuid)',
    'public.reorder_class_content_folders(uuid,uuid[],uuid)',
    'public.delete_class_content_folder_safe(uuid,text)',
    'public.move_class_content_item(text,uuid,uuid)',
    'public.list_class_content_tree_for_manager(uuid)',
    'public.list_class_content_tree_for_student(uuid)',
    'public._ccf_depth(uuid)',
    'public._ccf_subtree_height(uuid)',
    'public._ccf_is_descendant(uuid,uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;