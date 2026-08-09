-- Canonical student timetable reader -----------------------------------------
CREATE OR REPLACE FUNCTION public.get_student_timetable(
  _from timestamptz,
  _to timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  v_center uuid;
  v_items jsonb;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _from IS NULL OR _to IS NULL OR _to <= _from THEN
    RAISE EXCEPTION 'Invalid range';
  END IF;

  IF _to - _from > interval '400 days' THEN
    RAISE EXCEPTION 'Range too large';
  END IF;

  SELECT p.center_id INTO v_center FROM public.profiles p WHERE p.user_id = uid;

  IF v_center IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  WITH enrolled AS (
    SELECT e.class_id
    FROM public.class_enrollments e
    WHERE e.student_user_id = uid
      AND e.status = 'active'
      AND e.center_id = v_center
  )
  SELECT COALESCE(jsonb_agg(x ORDER BY x.starts_at ASC), '[]'::jsonb)
    INTO v_items
  FROM (
    SELECT c.id AS class_id,
           COALESCE(c.class_name, c.title) AS title,
           c.subject_id,
           s.name AS subject_name,
           c.scheduled_at AS starts_at,
           c.scheduled_at + make_interval(mins => COALESCE(c.duration_minutes, 60)) AS ends_at,
           COALESCE(c.duration_minutes, 60) AS duration_minutes,
           COALESCE(
             (SELECT COALESCE(NULLIF(pr.display_name, ''), pr.full_name)
                FROM public.class_tutors ct
                JOIN public.profiles pr ON pr.user_id = ct.tutor_user_id
               WHERE ct.class_id = c.id
               ORDER BY ct.assigned_at ASC
               LIMIT 1),
             t.name
           ) AS tutor_name
    FROM public.classes c
    JOIN enrolled en ON en.class_id = c.id
    LEFT JOIN public.subjects s ON s.id = c.subject_id
    LEFT JOIN public.tutors t ON t.id = c.tutor_id
    WHERE c.center_id = v_center
      AND c.status = 'active'
      AND c.scheduled_at IS NOT NULL
      AND c.scheduled_at >= _from
      AND c.scheduled_at < _to
  ) x;

  RETURN v_items;
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_timetable(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_timetable(timestamptz, timestamptz) TO authenticated;

-- Canonical student inbox reader ----------------------------------------------
CREATE OR REPLACE FUNCTION public.get_student_inbox(_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  v_center uuid;
  v_now timestamptz := now();
  v_items jsonb;
  v_unread integer;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT p.center_id INTO v_center FROM public.profiles p WHERE p.user_id = uid;

  IF v_center IS NULL THEN
    RETURN jsonb_build_object('items', '[]'::jsonb, 'unread_count', 0);
  END IF;

  WITH enrolled AS (
    SELECT e.class_id
    FROM public.class_enrollments e
    WHERE e.student_user_id = uid
      AND e.status = 'active'
      AND e.center_id = v_center
  ),
  items AS (
    SELECT 'announcement'::text AS source,
           a.id::text AS id,
           CASE WHEN a.is_pinned THEN 'announcement' ELSE 'announcement' END AS kind,
           a.title,
           left(a.body, 280) AS body,
           COALESCE(a.published_at, a.publish_at, a.created_at) AS at,
           a.is_pinned,
           a.class_id,
           COALESCE(c.class_name, c.title) AS class_name,
           s.name AS subject_name,
           COALESCE(NULLIF(pr.display_name, ''), pr.full_name) AS author_name,
           (r.announcement_id IS NOT NULL) AS is_read
    FROM public.class_announcements a
    JOIN enrolled en ON en.class_id = a.class_id
    JOIN public.classes c ON c.id = a.class_id
    LEFT JOIN public.subjects s ON s.id = c.subject_id
    LEFT JOIN public.profiles pr ON pr.user_id = a.author_user_id
    LEFT JOIN public.announcement_reads r
           ON r.announcement_id = a.id AND r.student_user_id = uid
    WHERE a.center_id = v_center
      AND a.status = 'published'
      AND (a.publish_at IS NULL OR a.publish_at <= v_now)
      AND (a.expires_at IS NULL OR a.expires_at > v_now)

    UNION ALL

    SELECT 'notification'::text,
           n.id::text,
           CASE WHEN COALESCE(n.type, '') = 'announcement' THEN 'announcement' ELSE 'reminder' END,
           n.title,
           n.message,
           COALESCE(n.created_at, v_now),
           false,
           NULL::uuid,
           NULL::text,
           NULL::text,
           NULL::text,
           COALESCE(n.is_read, false)
    FROM public.notifications n
    WHERE n.user_id = uid
  )
  SELECT COALESCE(jsonb_agg(y ORDER BY y.at DESC), '[]'::jsonb),
         COALESCE(SUM(CASE WHEN NOT y.is_read THEN 1 ELSE 0 END), 0)
    INTO v_items, v_unread
  FROM (
    SELECT * FROM items ORDER BY at DESC LIMIT GREATEST(COALESCE(_limit, 50), 0)
  ) y;

  RETURN jsonb_build_object('items', v_items, 'unread_count', v_unread);
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_inbox(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_inbox(integer) TO authenticated;