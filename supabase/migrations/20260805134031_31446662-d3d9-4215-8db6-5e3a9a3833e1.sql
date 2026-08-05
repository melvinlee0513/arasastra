-- 1. Folder cover management -------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_class_folder_cover(
  _folder_id uuid,
  _cover_image_path text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_class uuid; v_center uuid; v_prev text; v_expected text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT class_id, center_id, cover_image_path
    INTO v_class, v_center, v_prev
    FROM public.class_content_folders WHERE id = _folder_id;
  IF v_class IS NULL THEN RAISE EXCEPTION 'Folder not found'; END IF;
  IF NOT public.can_manage_class(v_class) THEN RAISE EXCEPTION 'Not allowed to manage this class'; END IF;

  IF _cover_image_path IS NOT NULL THEN
    v_expected := v_center::text || '/' || v_class::text || '/folders/' || _folder_id::text || '/';
    IF position(v_expected in _cover_image_path) <> 1
       OR _cover_image_path LIKE '%..%'
       OR _cover_image_path NOT LIKE '%.webp' THEN
      RAISE EXCEPTION 'Cover path is not valid for this folder';
    END IF;
  END IF;

  UPDATE public.class_content_folders
     SET cover_image_path = _cover_image_path, updated_at = now()
   WHERE id = _folder_id;

  RETURN jsonb_build_object(
    'folder_id', _folder_id,
    'cover_image_path', _cover_image_path,
    'previous_cover_image_path', v_prev
  );
END; $function$;

REVOKE ALL ON FUNCTION public.set_class_folder_cover(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_class_folder_cover(uuid, text) TO authenticated;

-- 2. Folder deletion reports cover for cleanup -------------------------------
CREATE OR REPLACE FUNCTION public.delete_class_content_folder_safe(
  _folder_id uuid, _strategy text DEFAULT 'reject'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_class uuid; v_parent uuid; v_items integer; v_subs integer; v_target uuid; v_cover text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT class_id, parent_id, cover_image_path INTO v_class, v_parent, v_cover
    FROM public.class_content_folders WHERE id = _folder_id;
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

  RETURN jsonb_build_object(
    'deleted', _folder_id, 'moved_items', v_items, 'moved_subfolders', v_subs,
    'moved_to', v_target, 'parent_id', v_parent, 'cover_image_path', v_cover
  );
END; $function$;

REVOKE ALL ON FUNCTION public.delete_class_content_folder_safe(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_class_content_folder_safe(uuid, text) TO authenticated;

-- 3. Deterministic ordering on move ------------------------------------------
CREATE OR REPLACE FUNCTION public.move_class_content_item(
  _item_type text, _item_id uuid, _folder_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_class uuid; v_folder_class uuid; v_old_folder uuid; v_next integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _item_type NOT IN ('resource', 'quiz', 'flashcard_deck') THEN RAISE EXCEPTION 'Unknown item type'; END IF;

  IF _item_type = 'resource' THEN
    SELECT class_id, folder_id INTO v_class, v_old_folder FROM public.class_resources WHERE id = _item_id;
  ELSIF _item_type = 'quiz' THEN
    SELECT class_id, folder_id INTO v_class, v_old_folder FROM public.quizzes WHERE id = _item_id;
  ELSE
    SELECT class_id, folder_id INTO v_class, v_old_folder FROM public.flashcard_decks WHERE id = _item_id;
  END IF;
  IF v_class IS NULL THEN RAISE EXCEPTION 'Item not found'; END IF;
  IF NOT public.can_manage_class(v_class) THEN RAISE EXCEPTION 'Not allowed to manage this class'; END IF;

  IF _folder_id IS NOT NULL THEN
    SELECT class_id INTO v_folder_class FROM public.class_content_folders WHERE id = _folder_id;
    IF v_folder_class IS NULL OR v_folder_class <> v_class THEN RAISE EXCEPTION 'Folder belongs to another class'; END IF;
  END IF;

  IF _folder_id IS NOT DISTINCT FROM v_old_folder THEN
    RETURN jsonb_build_object('item_type', _item_type, 'item_id', _item_id, 'folder_id', _folder_id, 'unchanged', true);
  END IF;

  IF _item_type = 'resource' THEN
    SELECT COALESCE(max(display_order), -1) + 1 INTO v_next FROM public.class_resources
     WHERE class_id = v_class AND folder_id IS NOT DISTINCT FROM _folder_id;
    UPDATE public.class_resources SET folder_id = _folder_id, display_order = v_next, updated_at = now()
     WHERE id = _item_id;
    -- compact the source folder so ordering stays stable
    WITH ranked AS (
      SELECT id, (row_number() OVER (ORDER BY display_order, created_at, id)) - 1 AS idx
        FROM public.class_resources
       WHERE class_id = v_class AND folder_id IS NOT DISTINCT FROM v_old_folder
    )
    UPDATE public.class_resources r SET display_order = ranked.idx
      FROM ranked WHERE r.id = ranked.id AND r.display_order <> ranked.idx;

  ELSIF _item_type = 'quiz' THEN
    UPDATE public.quizzes SET folder_id = _folder_id, updated_at = now() WHERE id = _item_id;

  ELSE
    SELECT COALESCE(max(display_order), -1) + 1 INTO v_next FROM public.flashcard_decks
     WHERE class_id = v_class AND folder_id IS NOT DISTINCT FROM _folder_id;
    UPDATE public.flashcard_decks SET folder_id = _folder_id, display_order = v_next, updated_at = now()
     WHERE id = _item_id;
    WITH ranked AS (
      SELECT id, (row_number() OVER (ORDER BY display_order, created_at, id)) - 1 AS idx
        FROM public.flashcard_decks
       WHERE class_id = v_class AND folder_id IS NOT DISTINCT FROM v_old_folder
    )
    UPDATE public.flashcard_decks d SET display_order = ranked.idx
      FROM ranked WHERE d.id = ranked.id AND d.display_order <> ranked.idx;
  END IF;

  RETURN jsonb_build_object(
    'item_type', _item_type, 'item_id', _item_id,
    'folder_id', _folder_id, 'previous_folder_id', v_old_folder
  );
END; $function$;

REVOKE ALL ON FUNCTION public.move_class_content_item(text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.move_class_content_item(text, uuid, uuid) TO authenticated;

-- 4. Class-scoped, folder-aware search ---------------------------------------
CREATE OR REPLACE FUNCTION public.search_class_content_for_manager(
  _class_id uuid, _query text
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_q text; v_out jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.can_manage_class(_class_id) THEN RAISE EXCEPTION 'Not allowed to manage this class'; END IF;
  v_q := '%' || btrim(coalesce(_query, '')) || '%';
  IF btrim(coalesce(_query, '')) = '' THEN
    RETURN jsonb_build_object('folders', '[]'::jsonb, 'resources', '[]'::jsonb, 'quizzes', '[]'::jsonb, 'flashcard_decks', '[]'::jsonb);
  END IF;

  SELECT jsonb_build_object(
    'folders', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'parent_id', f.parent_id, 'description', f.description) ORDER BY f.name)
        FROM public.class_content_folders f
       WHERE f.class_id = _class_id
         AND (f.name ILIKE v_q OR coalesce(f.description, '') ILIKE v_q)), '[]'::jsonb),
    'resources', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', r.id, 'title', r.title, 'folder_id', r.folder_id, 'resource_type', r.resource_type, 'status', r.status) ORDER BY r.title)
        FROM public.class_resources r
       WHERE r.class_id = _class_id AND r.title ILIKE v_q), '[]'::jsonb),
    'quizzes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', q.id, 'title', q.title, 'folder_id', q.folder_id, 'status', q.status) ORDER BY q.title)
        FROM public.quizzes q
       WHERE q.class_id = _class_id AND q.title ILIKE v_q), '[]'::jsonb),
    'flashcard_decks', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title, 'folder_id', d.folder_id, 'status', d.status) ORDER BY d.title)
        FROM public.flashcard_decks d
       WHERE d.class_id = _class_id AND d.title ILIKE v_q), '[]'::jsonb)
  ) INTO v_out;
  RETURN v_out;
END; $function$;

REVOKE ALL ON FUNCTION public.search_class_content_for_manager(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_class_content_for_manager(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.search_class_content_for_student(
  _class_id uuid, _query text
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_q text; v_out jsonb; v_center uuid; v_flashcards boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_enrolled_in_class(_class_id) THEN RAISE EXCEPTION 'Not enrolled in this class'; END IF;
  SELECT center_id INTO v_center FROM public.classes WHERE id = _class_id;
  SELECT COALESCE((feature_flags->>'flashcards') <> 'false', true) INTO v_flashcards
    FROM public.tuition_centers WHERE id = v_center;

  v_q := '%' || btrim(coalesce(_query, '')) || '%';
  IF btrim(coalesce(_query, '')) = '' THEN
    RETURN jsonb_build_object('folders', '[]'::jsonb, 'resources', '[]'::jsonb, 'quizzes', '[]'::jsonb, 'flashcard_decks', '[]'::jsonb);
  END IF;

  SELECT jsonb_build_object(
    'folders', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'parent_id', f.parent_id, 'description', f.description) ORDER BY f.name)
        FROM public.class_content_folders f
       WHERE f.class_id = _class_id
         AND (f.name ILIKE v_q OR coalesce(f.description, '') ILIKE v_q)), '[]'::jsonb),
    'resources', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', r.id, 'title', r.title, 'folder_id', r.folder_id, 'resource_type', r.resource_type) ORDER BY r.title)
        FROM public.class_resources r
       WHERE r.class_id = _class_id AND r.status = 'published' AND r.title ILIKE v_q), '[]'::jsonb),
    'quizzes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', q.id, 'title', q.title, 'folder_id', q.folder_id) ORDER BY q.title)
        FROM public.quizzes q
       WHERE q.class_id = _class_id AND q.status = 'published' AND q.title ILIKE v_q), '[]'::jsonb),
    'flashcard_decks', CASE WHEN v_flashcards THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title, 'folder_id', d.folder_id) ORDER BY d.title)
        FROM public.flashcard_decks d
       WHERE d.class_id = _class_id AND d.status = 'published' AND d.title ILIKE v_q), '[]'::jsonb)
      ELSE '[]'::jsonb END
  ) INTO v_out;
  RETURN v_out;
END; $function$;

REVOKE ALL ON FUNCTION public.search_class_content_for_student(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_class_content_for_student(uuid, text) TO authenticated;