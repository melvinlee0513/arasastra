-- 1. Canonical recurrence model on classes -----------------------------------
ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS recurrence text NOT NULL DEFAULT 'weekly',
  ADD COLUMN IF NOT EXISTS recurrence_until timestamptz;

ALTER TABLE public.classes DROP CONSTRAINT IF EXISTS classes_recurrence_check;
ALTER TABLE public.classes
  ADD CONSTRAINT classes_recurrence_check CHECK (recurrence IN ('none', 'weekly'));

COMMENT ON COLUMN public.classes.recurrence IS
  'Canonical schedule recurrence: none = single session at scheduled_at, weekly = same weekday/time every 7 days.';

-- 2. Shared occurrence expander ----------------------------------------------
-- Malaysia (Asia/Kuala_Lumpur) has no DST, so adding 7-day intervals to a
-- timestamptz preserves the local wall-clock time of the session.
CREATE OR REPLACE FUNCTION public.class_occurrences(
  _start timestamptz,
  _recurrence text,
  _until timestamptz,
  _from timestamptz,
  _to timestamptz
)
RETURNS SETOF timestamptz
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT g
  FROM generate_series(
    CASE
      WHEN _recurrence = 'weekly' AND _start < _from
        THEN _start + make_interval(
               days => 7 * ceil(extract(epoch FROM (_from - _start)) / 604800.0)::int
             )
      ELSE _start
    END,
    LEAST(_to, COALESCE(_until, _to)),
    CASE WHEN _recurrence = 'weekly' THEN interval '7 days' ELSE interval '1000 years' END
  ) AS g
  WHERE _start IS NOT NULL
    AND g >= _from
    AND g < _to
    AND (_until IS NULL OR g <= _until);
$$;

REVOKE ALL ON FUNCTION public.class_occurrences(timestamptz, text, timestamptz, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.class_occurrences(timestamptz, text, timestamptz, timestamptz, timestamptz) TO authenticated, service_role;

-- 3. Timetable reader: expand recurring occurrences in the window -----------
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
           occ.starts_at,
           occ.starts_at + make_interval(mins => COALESCE(c.duration_minutes, 60)) AS ends_at,
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
    CROSS JOIN LATERAL public.class_occurrences(
      c.scheduled_at, c.recurrence, c.recurrence_until, _from, _to
    ) AS occ(starts_at)
    WHERE c.center_id = v_center
      AND c.status = 'active'
      AND c.scheduled_at IS NOT NULL
  ) x;

  RETURN v_items;
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_timetable(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_timetable(timestamptz, timestamptz) TO authenticated;

-- 4. Next occurrence per actively enrolled class (Study page) ---------------
CREATE OR REPLACE FUNCTION public.get_student_next_classes(_horizon_days integer DEFAULT 60)
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

  WITH enrolled AS (
    SELECT e.class_id
    FROM public.class_enrollments e
    WHERE e.student_user_id = uid
      AND e.status = 'active'
      AND e.center_id = v_center
  ),
  occurrences AS (
    SELECT c.id AS class_id,
           occ.starts_at,
           occ.starts_at + make_interval(mins => COALESCE(c.duration_minutes, 60)) AS ends_at,
           COALESCE(c.duration_minutes, 60) AS duration_minutes,
           row_number() OVER (PARTITION BY c.id ORDER BY occ.starts_at ASC) AS rn
    FROM public.classes c
    JOIN enrolled en ON en.class_id = c.id
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
$$;

REVOKE ALL ON FUNCTION public.get_student_next_classes(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_next_classes(integer) TO authenticated;

-- 5. Home feed: recurring "Coming Up" with an explicit window ---------------
DROP FUNCTION IF EXISTS public.get_student_home_feed(integer, integer, integer);

CREATE OR REPLACE FUNCTION public.get_student_home_feed(
  _announcement_limit integer DEFAULT 3,
  _continue_limit integer DEFAULT 5,
  _upcoming_limit integer DEFAULT 6,
  _upcoming_days integer DEFAULT 14
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
  v_now timestamptz := now();
  v_until timestamptz;
  v_announcements jsonb;
  v_continue jsonb;
  v_upcoming jsonb;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_until := v_now + make_interval(days => LEAST(GREATEST(COALESCE(_upcoming_days, 14), 1), 120));

  SELECT p.center_id INTO v_center FROM public.profiles p WHERE p.user_id = uid;

  IF v_center IS NULL THEN
    RETURN jsonb_build_object('announcements', '[]'::jsonb, 'continue_learning', '[]'::jsonb, 'coming_up', '[]'::jsonb);
  END IF;

  WITH enrolled AS (
    SELECT e.class_id
    FROM public.class_enrollments e
    WHERE e.student_user_id = uid
      AND e.status = 'active'
      AND e.center_id = v_center
  )
  SELECT COALESCE(jsonb_agg(x ORDER BY x.is_pinned DESC, x.at DESC), '[]'::jsonb)
    INTO v_announcements
  FROM (
    SELECT a.id,
           a.class_id,
           a.title,
           left(a.body, 240) AS preview,
           a.is_pinned,
           COALESCE(a.published_at, a.publish_at, a.created_at) AS at,
           COALESCE(c.class_name, c.title) AS class_name,
           s.name AS subject_name,
           pr.full_name AS author_name
    FROM public.class_announcements a
    JOIN enrolled en ON en.class_id = a.class_id
    JOIN public.classes c ON c.id = a.class_id
    LEFT JOIN public.subjects s ON s.id = c.subject_id
    LEFT JOIN public.profiles pr ON pr.user_id = a.author_user_id
    WHERE a.center_id = v_center
      AND a.status = 'published'
      AND (a.publish_at IS NULL OR a.publish_at <= v_now)
      AND (a.expires_at IS NULL OR a.expires_at > v_now)
    ORDER BY a.is_pinned DESC, COALESCE(a.published_at, a.publish_at, a.created_at) DESC
    LIMIT GREATEST(_announcement_limit, 0)
  ) x;

  WITH enrolled AS (
    SELECT e.class_id
    FROM public.class_enrollments e
    WHERE e.student_user_id = uid
      AND e.status = 'active'
      AND e.center_id = v_center
  ),
  items AS (
    SELECT r.id AS item_id,
           r.class_id,
           r.title,
           r.resource_type AS kind,
           'resource'::text AS category,
           act.last_opened_at AS at,
           false AS in_progress
    FROM public.student_resource_activity act
    JOIN public.class_resources r ON r.id = act.resource_id
    JOIN enrolled en ON en.class_id = r.class_id
    WHERE act.student_user_id = uid
      AND r.status = 'published'
      AND r.center_id = v_center

    UNION ALL

    SELECT q.id,
           q.class_id,
           q.title,
           'quiz'::text,
           'quiz'::text,
           COALESCE(qa.updated_at, qa.created_at),
           (qa.status = 'in_progress')
    FROM public.quiz_attempts qa
    JOIN public.quizzes q ON q.id = qa.quiz_id
    JOIN enrolled en ON en.class_id = q.class_id
    WHERE qa.user_id = uid
      AND q.status = 'published'
      AND q.center_id = v_center

    UNION ALL

    SELECT d.id,
           d.class_id,
           d.title,
           'flashcards'::text,
           'flashcards'::text,
           COALESCE(fp.last_studied_at, fp.updated_at),
           (fp.completed_at IS NULL)
    FROM public.flashcard_deck_progress fp
    JOIN public.flashcard_decks d ON d.id = fp.deck_id
    JOIN enrolled en ON en.class_id = d.class_id
    WHERE fp.student_user_id = uid
      AND d.status = 'published'
      AND d.center_id = v_center
  ),
  ranked AS (
    SELECT i.*,
           row_number() OVER (PARTITION BY i.category, i.item_id ORDER BY i.at DESC NULLS LAST) AS rn
    FROM items i
    WHERE i.at IS NOT NULL
  )
  SELECT COALESCE(jsonb_agg(y ORDER BY y.at DESC), '[]'::jsonb)
    INTO v_continue
  FROM (
    SELECT r.item_id,
           r.class_id,
           r.title,
           r.kind,
           r.category,
           r.at,
           r.in_progress,
           COALESCE(c.class_name, c.title) AS class_name,
           s.name AS subject_name
    FROM ranked r
    JOIN public.classes c ON c.id = r.class_id
    LEFT JOIN public.subjects s ON s.id = c.subject_id
    WHERE r.rn = 1
    ORDER BY r.at DESC
    LIMIT GREATEST(_continue_limit, 0)
  ) y;

  WITH enrolled AS (
    SELECT e.class_id
    FROM public.class_enrollments e
    WHERE e.student_user_id = uid
      AND e.status = 'active'
      AND e.center_id = v_center
  ),
  events AS (
    SELECT c.id AS item_id,
           c.id AS class_id,
           COALESCE(c.title, c.class_name) AS title,
           'class'::text AS kind,
           occ.starts_at AS at
    FROM public.classes c
    JOIN enrolled en ON en.class_id = c.id
    CROSS JOIN LATERAL public.class_occurrences(
      c.scheduled_at, c.recurrence, c.recurrence_until, v_now, v_until
    ) AS occ(starts_at)
    WHERE c.center_id = v_center
      AND c.status = 'active'
      AND c.scheduled_at IS NOT NULL

    UNION ALL

    SELECT q.id, q.class_id, q.title, 'quiz_due'::text, q.due_at
    FROM public.quizzes q
    JOIN enrolled en ON en.class_id = q.class_id
    WHERE q.center_id = v_center
      AND q.status = 'published'
      AND q.due_at IS NOT NULL
      AND q.due_at > v_now
      AND q.due_at <= v_until

    UNION ALL

    SELECT q.id, q.class_id, q.title, 'quiz_open'::text, q.available_from
    FROM public.quizzes q
    JOIN enrolled en ON en.class_id = q.class_id
    WHERE q.center_id = v_center
      AND q.status = 'published'
      AND q.available_from IS NOT NULL
      AND q.available_from > v_now
      AND q.available_from <= v_until
  )
  SELECT COALESCE(jsonb_agg(z ORDER BY z.at ASC), '[]'::jsonb)
    INTO v_upcoming
  FROM (
    SELECT e.item_id,
           e.class_id,
           e.title,
           e.kind,
           e.at,
           COALESCE(c.class_name, c.title) AS class_name,
           s.name AS subject_name
    FROM events e
    JOIN public.classes c ON c.id = e.class_id
    LEFT JOIN public.subjects s ON s.id = c.subject_id
    ORDER BY e.at ASC
    LIMIT GREATEST(_upcoming_limit, 0)
  ) z;

  RETURN jsonb_build_object(
    'announcements', v_announcements,
    'continue_learning', v_continue,
    'coming_up', v_upcoming
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_home_feed(integer, integer, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_home_feed(integer, integer, integer, integer) TO authenticated;