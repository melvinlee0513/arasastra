-- Fix ambiguous "id" reference in reorder_class_resources.
-- Root cause: the previous signature declared OUT columns named `id` and
-- `display_order`, and the inline CTE aliased its ordinal column back to `id`.
-- PL/pgSQL then couldn't tell OUT column `id` from `cr.id` inside the ORDER BY
-- / UPDATE ... FROM sub-query, producing 42702 "column reference 'id' is
-- ambiguous". We rename every output and intermediate identifier to remove the
-- collision entirely.

DROP FUNCTION IF EXISTS public.reorder_class_resources(uuid, uuid[]);

CREATE OR REPLACE FUNCTION public.reorder_class_resources(
  requested_class_id uuid,
  ordered_resource_ids uuid[]
)
RETURNS TABLE(resource_id uuid, new_display_order integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_class_center uuid;
  v_caller_center uuid;
  v_is_admin boolean;
  v_is_tutor boolean;
  v_existing_count integer;
  v_supplied_count integer;
  v_matched_count integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF requested_class_id IS NULL OR ordered_resource_ids IS NULL THEN
    RAISE EXCEPTION 'class and resource list required' USING ERRCODE = '22023';
  END IF;

  -- Reject duplicate ids
  IF (SELECT count(*) FROM unnest(ordered_resource_ids) AS t(rid)) <>
     (SELECT count(DISTINCT t.rid) FROM unnest(ordered_resource_ids) AS t(rid)) THEN
    RAISE EXCEPTION 'duplicate resource ids supplied' USING ERRCODE = '22023';
  END IF;

  SELECT c.center_id INTO v_class_center
  FROM public.classes c
  WHERE c.id = requested_class_id;

  IF v_class_center IS NULL THEN
    RAISE EXCEPTION 'class not found' USING ERRCODE = '22023';
  END IF;

  SELECT p.center_id INTO v_caller_center
  FROM public.profiles p
  WHERE p.user_id = v_uid
  LIMIT 1;

  v_is_admin := public.is_admin() AND v_caller_center = v_class_center;
  v_is_tutor := EXISTS (
    SELECT 1 FROM public.class_tutors ct
    WHERE ct.class_id = requested_class_id
      AND ct.tutor_user_id = v_uid
  );

  IF NOT (v_is_admin OR v_is_tutor) THEN
    RAISE EXCEPTION 'not permitted to reorder this class' USING ERRCODE = '42501';
  END IF;

  -- Every supplied id must belong to this class + centre
  SELECT count(*) INTO v_matched_count
  FROM public.class_resources cr
  WHERE cr.id = ANY(ordered_resource_ids)
    AND cr.class_id = requested_class_id
    AND cr.center_id = v_class_center;

  v_supplied_count := array_length(ordered_resource_ids, 1);
  IF v_matched_count IS DISTINCT FROM v_supplied_count THEN
    RAISE EXCEPTION 'one or more resources do not belong to this class' USING ERRCODE = '42501';
  END IF;

  -- Must include every existing resource — no partial reorders
  SELECT count(*) INTO v_existing_count
  FROM public.class_resources cr
  WHERE cr.class_id = requested_class_id;

  IF v_existing_count <> v_supplied_count THEN
    RAISE EXCEPTION 'ordered list must include every class resource' USING ERRCODE = '22023';
  END IF;

  -- Atomic update using ordinality
  UPDATE public.class_resources AS cr
  SET display_order = ordered.position,
      updated_at = now()
  FROM (
    SELECT t.rid AS resource_id, t.position
    FROM unnest(ordered_resource_ids) WITH ORDINALITY AS t(rid, position)
  ) AS ordered
  WHERE cr.id = ordered.resource_id;

  RETURN QUERY
    SELECT cr.id AS resource_id, cr.display_order AS new_display_order
    FROM public.class_resources cr
    WHERE cr.class_id = requested_class_id
    ORDER BY cr.display_order ASC, cr.created_at ASC, cr.id ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_class_resources(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reorder_class_resources(uuid, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.reorder_class_resources(uuid, uuid[]) TO authenticated;