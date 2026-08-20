-- Subject lifecycle: distinguish active vs archived classes.

CREATE OR REPLACE FUNCTION public.get_subject_delete_impact(p_subject_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_center uuid;
  v_name text;
  v_active bigint;
  v_archived bigint;
BEGIN
  SELECT center_id, name INTO v_center, v_name FROM public.subjects WHERE id = p_subject_id;
  IF v_center IS NULL THEN
    RAISE EXCEPTION 'Subject not found in your centre';
  END IF;
  IF NOT public._admin_can_manage_center(v_center) THEN
    RAISE EXCEPTION 'Not authorised to manage this subject';
  END IF;

  SELECT
    count(*) FILTER (WHERE c.status IS DISTINCT FROM 'archived'),
    count(*) FILTER (WHERE c.status = 'archived')
    INTO v_active, v_archived
  FROM public.classes c
  WHERE c.subject_id = p_subject_id AND c.center_id = v_center;

  RETURN jsonb_build_object(
    'name', v_name,
    'active_classes', v_active,
    'archived_classes', v_archived,
    'action', CASE
      WHEN v_active > 0 THEN 'blocked'
      WHEN v_archived > 0 THEN 'archived'
      ELSE 'deleted'
    END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_subject(p_subject_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_center uuid;
  v_name text;
  v_active bigint;
  v_archived bigint;
  v_history bigint;
BEGIN
  SELECT center_id, name INTO v_center, v_name FROM public.subjects WHERE id = p_subject_id;
  IF NOT FOUND OR v_center IS NULL THEN
    -- Shared/global subject rows (center_id IS NULL) are never tenant-deletable.
    RAISE EXCEPTION 'Subject not found in your centre';
  END IF;
  IF NOT public._admin_can_manage_center(v_center) THEN
    RAISE EXCEPTION 'Not authorised to manage this subject';
  END IF;

  SELECT
    count(*) FILTER (WHERE c.status IS DISTINCT FROM 'archived'),
    count(*) FILTER (WHERE c.status = 'archived')
    INTO v_active, v_archived
  FROM public.classes c
  WHERE c.subject_id = p_subject_id AND c.center_id = v_center;

  IF v_active > 0 THEN
    RETURN jsonb_build_object('action', 'blocked', 'mode', 'blocked', 'name', v_name,
                              'active_classes', v_active, 'archived_classes', v_archived);
  END IF;

  -- Other historical rows that would lose subject identity on hard delete.
  SELECT
    (SELECT count(*) FROM public.notes n WHERE n.subject_id = p_subject_id)
  + (SELECT count(*) FROM public.video_resources v WHERE v.subject_id = p_subject_id)
  + (SELECT count(*) FROM public.flashcard_decks d WHERE d.subject_id = p_subject_id)
  + (SELECT count(*) FROM public.quizzes q WHERE q.subject_id = p_subject_id)
  + (SELECT count(*) FROM public.tutor_assignments t WHERE t.subject_id = p_subject_id)
  + (SELECT count(*) FROM public.enrollments e WHERE e.subject_id = p_subject_id)
    INTO v_history;

  IF v_archived > 0 OR v_history > 0 THEN
    -- Preserve the tenant subject row (and its canonical subject_key) so
    -- archived classes and historical records keep their subject identity.
    UPDATE public.subjects
       SET status = 'archived',
           archived_at = now(),
           is_active = false
     WHERE id = p_subject_id AND center_id = v_center;

    RETURN jsonb_build_object('action', 'archived', 'mode', 'archived', 'name', v_name,
                              'subject_id', p_subject_id,
                              'active_classes', v_active, 'archived_classes', v_archived);
  END IF;

  DELETE FROM public.subjects WHERE id = p_subject_id AND center_id = v_center;
  RETURN jsonb_build_object('action', 'deleted', 'mode', 'deleted', 'name', v_name,
                            'subject_id', p_subject_id,
                            'active_classes', 0, 'archived_classes', 0);
END;
$$;

-- Create a tenant subject, restoring an archived row with the same canonical key
-- instead of violating the center_id + subject_key identity constraint.
CREATE OR REPLACE FUNCTION public.admin_create_or_restore_subject(
  p_center_id uuid,
  p_subject_key text,
  p_name text,
  p_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_existing public.subjects;
  v_id uuid;
BEGIN
  IF NOT public._admin_can_manage_center(p_center_id) THEN
    RAISE EXCEPTION 'Not authorised to manage this centre';
  END IF;

  SELECT * INTO v_existing
    FROM public.subjects
   WHERE center_id = p_center_id AND subject_key = p_subject_key
   LIMIT 1;

  IF FOUND THEN
    IF v_existing.status IS DISTINCT FROM 'archived' THEN
      RETURN jsonb_build_object('action', 'exists', 'subject_id', v_existing.id);
    END IF;
    UPDATE public.subjects
       SET status = 'active',
           archived_at = NULL,
           is_active = true,
           name = coalesce(p_name, name),
           description = coalesce(nullif(btrim(p_description), ''), description)
     WHERE id = v_existing.id;
    RETURN jsonb_build_object('action', 'restored', 'subject_id', v_existing.id);
  END IF;

  INSERT INTO public.subjects (name, subject_key, description, center_id, is_active, status)
  VALUES (p_name, p_subject_key, nullif(btrim(p_description), ''), p_center_id, true, 'active')
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('action', 'created', 'subject_id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_subject_delete_impact(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_create_or_restore_subject(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_subject_delete_impact(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_or_restore_subject(uuid, text, text, text) TO authenticated;