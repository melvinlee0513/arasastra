-- Add display_order to class_resources for tutor-controlled ordering
ALTER TABLE public.class_resources
  ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;

-- Backfill deterministically per class using created_at, id
WITH ordered AS (
  SELECT id,
         row_number() OVER (PARTITION BY class_id ORDER BY created_at ASC, id ASC) AS rn
  FROM public.class_resources
)
UPDATE public.class_resources cr
SET display_order = ordered.rn
FROM ordered
WHERE cr.id = ordered.id;

CREATE INDEX IF NOT EXISTS class_resources_class_order_idx
  ON public.class_resources (class_id, display_order, created_at, id);

-- Secure RPC: reorder_class_resources
CREATE OR REPLACE FUNCTION public.reorder_class_resources(
  requested_class_id uuid,
  ordered_resource_ids uuid[]
)
RETURNS TABLE(id uuid, display_order integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- Deduplication check
  IF (SELECT count(*) FROM unnest(ordered_resource_ids)) <>
     (SELECT count(DISTINCT x) FROM unnest(ordered_resource_ids) AS t(x)) THEN
    RAISE EXCEPTION 'duplicate resource ids supplied' USING ERRCODE = '22023';
  END IF;

  SELECT center_id INTO v_class_center FROM public.classes WHERE id = requested_class_id;
  IF v_class_center IS NULL THEN
    RAISE EXCEPTION 'class not found' USING ERRCODE = '22023';
  END IF;

  SELECT center_id INTO v_caller_center FROM public.profiles WHERE user_id = v_uid LIMIT 1;
  v_is_admin := public.is_admin() AND v_caller_center = v_class_center;
  v_is_tutor := EXISTS (
    SELECT 1 FROM public.class_tutors ct
    WHERE ct.class_id = requested_class_id AND ct.tutor_user_id = v_uid
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

  -- Must include every resource currently on the class (no partial reorders)
  SELECT count(*) INTO v_existing_count
  FROM public.class_resources WHERE class_id = requested_class_id;
  IF v_existing_count <> v_supplied_count THEN
    RAISE EXCEPTION 'ordered list must include every class resource' USING ERRCODE = '22023';
  END IF;

  -- Atomic update: assign 1..N based on array position
  UPDATE public.class_resources cr
  SET display_order = sub.new_order,
      updated_at = now()
  FROM (
    SELECT rid AS id, ord AS new_order
    FROM unnest(ordered_resource_ids) WITH ORDINALITY AS t(rid, ord)
  ) sub
  WHERE cr.id = sub.id;

  RETURN QUERY
    SELECT cr.id, cr.display_order
    FROM public.class_resources cr
    WHERE cr.class_id = requested_class_id
    ORDER BY cr.display_order ASC, cr.created_at ASC, cr.id ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_class_resources(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reorder_class_resources(uuid, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.reorder_class_resources(uuid, uuid[]) TO authenticated;