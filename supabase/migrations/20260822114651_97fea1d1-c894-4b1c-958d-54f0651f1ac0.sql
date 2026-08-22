CREATE OR REPLACE FUNCTION public.get_tutor_next_classes(_horizon_days integer DEFAULT 60)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  v_center uuid;
  v_now timestamptz := now();
  v_days integer := LEAST(GREATEST(COALESCE(_horizon_days, 60), 1), 400);
  v_items jsonb;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT p.center_id INTO v_center FROM public.profiles p WHERE p.user_id = uid;

  IF v_center IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  WITH assigned AS (
    SELECT ct.class_id
    FROM public.class_tutors ct
    WHERE ct.tutor_user_id = uid
      AND ct.center_id = v_center
  ),
  occurrences AS (
    SELECT c.id AS class_id,
           occ.starts_at,
           occ.starts_at + make_interval(mins => COALESCE(c.duration_minutes, 60)) AS ends_at,
           COALESCE(c.duration_minutes, 60) AS duration_minutes,
           row_number() OVER (PARTITION BY c.id ORDER BY occ.starts_at ASC) AS rn
    FROM public.classes c
    JOIN assigned a ON a.class_id = c.id
    CROSS JOIN LATERAL public.class_occurrences(
      c.scheduled_at,
      c.recurrence,
      c.recurrence_until,
      v_now - make_interval(mins => COALESCE(c.duration_minutes, 60)),
      v_now + make_interval(days => v_days)
    ) AS occ(starts_at)
    WHERE c.center_id = v_center
      AND c.status = 'active'
      AND c.scheduled_at IS NOT NULL
  )
  SELECT COALESCE(jsonb_agg(x ORDER BY x.starts_at ASC), '[]'::jsonb)
    INTO v_items
  FROM (
    SELECT o.class_id,
           o.starts_at,
           o.ends_at,
           o.duration_minutes,
           (o.starts_at <= v_now AND o.ends_at > v_now) AS in_progress
    FROM occurrences o
    WHERE o.rn = 1
  ) x;

  RETURN v_items;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_tutor_next_classes(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tutor_next_classes(integer) TO authenticated;