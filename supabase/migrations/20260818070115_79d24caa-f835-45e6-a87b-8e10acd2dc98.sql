-- Impact summary for a class (admin/superadmin of the owning centre only).
CREATE OR REPLACE FUNCTION public.get_class_delete_impact(p_class_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_center uuid;
  v jsonb;
BEGIN
  SELECT center_id INTO v_center FROM public.classes WHERE id = p_class_id;
  IF v_center IS NULL THEN
    RAISE EXCEPTION 'Class not found';
  END IF;
  IF NOT public._admin_can_manage_center(v_center) THEN
    RAISE EXCEPTION 'Not authorised to manage this class';
  END IF;

  SELECT jsonb_build_object(
    'enrolled_students', (SELECT count(*) FROM public.class_enrollments e
                            WHERE e.class_id = p_class_id AND e.status = 'active'),
    'tutors',            (SELECT count(*) FROM public.class_tutors t WHERE t.class_id = p_class_id),
    'resources',         (SELECT count(*) FROM public.class_resources r WHERE r.class_id = p_class_id),
    'folders',           (SELECT count(*) FROM public.class_content_folders f WHERE f.class_id = p_class_id),
    'quizzes',           (SELECT count(*) FROM public.quizzes q WHERE q.class_id = p_class_id),
    'quiz_attempts',     (SELECT count(*) FROM public.quiz_attempts a
                            JOIN public.quizzes q ON q.id = a.quiz_id
                           WHERE q.class_id = p_class_id),
    'flashcard_decks',   (SELECT count(*) FROM public.flashcard_decks d WHERE d.class_id = p_class_id),
    'announcements',     (SELECT count(*) FROM public.class_announcements a WHERE a.class_id = p_class_id),
    'notes',             (SELECT count(*) FROM public.notes n WHERE n.class_id = p_class_id),
    'video_resources',   (SELECT count(*) FROM public.video_resources v WHERE v.class_id = p_class_id),
    'attendance',        (SELECT count(*) FROM public.attendance a WHERE a.class_id = p_class_id)
  ) INTO v;

  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public.get_class_delete_impact(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_class_delete_impact(uuid) TO authenticated;

-- Hybrid class deletion: hard delete when empty, archive when it holds history.
CREATE OR REPLACE FUNCTION public.admin_delete_class(p_class_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_center uuid;
  v_title text;
  v_impact jsonb;
  v_total bigint := 0;
  k text;
BEGIN
  SELECT center_id, title INTO v_center, v_title FROM public.classes WHERE id = p_class_id;
  IF v_center IS NULL THEN
    RAISE EXCEPTION 'Class not found';
  END IF;
  IF NOT public._admin_can_manage_center(v_center) THEN
    RAISE EXCEPTION 'Not authorised to manage this class';
  END IF;

  v_impact := public.get_class_delete_impact(p_class_id);
  FOR k IN SELECT jsonb_object_keys(v_impact) LOOP
    v_total := v_total + coalesce((v_impact ->> k)::bigint, 0);
  END LOOP;

  IF v_total = 0 THEN
    -- Nothing depends on it: safe to remove permanently.
    DELETE FROM public.classes WHERE id = p_class_id AND center_id = v_center;
    RETURN jsonb_build_object('mode', 'deleted', 'class_id', p_class_id, 'title', v_title);
  END IF;

  -- Archive: keep grades / attempts / XP history, revoke live access.
  UPDATE public.classes
     SET status = 'archived', is_published = false, is_live = false
   WHERE id = p_class_id AND center_id = v_center;

  UPDATE public.class_enrollments
     SET status = 'removed'
   WHERE class_id = p_class_id AND status <> 'removed';

  DELETE FROM public.class_tutors WHERE class_id = p_class_id;
  DELETE FROM public.class_bookmarks WHERE class_id = p_class_id;

  RETURN jsonb_build_object('mode', 'archived', 'class_id', p_class_id, 'title', v_title,
                            'impact', v_impact);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_class(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_class(uuid) TO authenticated;

-- Subject deletion: blocked while any class still references it.
CREATE OR REPLACE FUNCTION public.admin_delete_subject(p_subject_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_center uuid;
  v_name text;
  v_classes bigint;
BEGIN
  SELECT center_id, name INTO v_center, v_name FROM public.subjects WHERE id = p_subject_id;
  IF NOT FOUND OR v_center IS NULL THEN
    -- Shared/global subject rows (center_id IS NULL) are never tenant-deletable.
    RAISE EXCEPTION 'Subject not found in your centre';
  END IF;
  IF NOT public._admin_can_manage_center(v_center) THEN
    RAISE EXCEPTION 'Not authorised to manage this subject';
  END IF;

  SELECT count(*) INTO v_classes FROM public.classes WHERE subject_id = p_subject_id;
  IF v_classes > 0 THEN
    RETURN jsonb_build_object('mode', 'blocked', 'class_count', v_classes, 'name', v_name);
  END IF;

  DELETE FROM public.subjects WHERE id = p_subject_id AND center_id = v_center;
  RETURN jsonb_build_object('mode', 'deleted', 'subject_id', p_subject_id, 'name', v_name);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_subject(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_subject(uuid) TO authenticated;