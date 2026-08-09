-- 1. Canonical recent-material activity ---------------------------------------
CREATE TABLE IF NOT EXISTS public.student_resource_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL REFERENCES public.tuition_centers(id) ON DELETE CASCADE,
  student_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  resource_id uuid NOT NULL REFERENCES public.class_resources(id) ON DELETE CASCADE,
  last_opened_at timestamptz NOT NULL DEFAULT now(),
  open_count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_resource_activity_unique UNIQUE (student_user_id, resource_id)
);

GRANT SELECT ON public.student_resource_activity TO authenticated;
GRANT ALL ON public.student_resource_activity TO service_role;

ALTER TABLE public.student_resource_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "students read own resource activity" ON public.student_resource_activity;
CREATE POLICY "students read own resource activity"
  ON public.student_resource_activity FOR SELECT TO authenticated
  USING (student_user_id = auth.uid());

CREATE INDEX IF NOT EXISTS student_resource_activity_recent_idx
  ON public.student_resource_activity (student_user_id, last_opened_at DESC);

CREATE OR REPLACE FUNCTION public.record_resource_activity(_resource_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_center uuid;
  v_class uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT r.center_id, r.class_id
    INTO v_center, v_class
  FROM public.class_resources r
  WHERE r.id = _resource_id
    AND r.status = 'published';

  IF v_class IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.class_enrollments e
    WHERE e.class_id = v_class
      AND e.student_user_id = auth.uid()
      AND e.status = 'active'
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.student_resource_activity
    (center_id, student_user_id, class_id, resource_id)
  VALUES (v_center, auth.uid(), v_class, _resource_id)
  ON CONFLICT (student_user_id, resource_id) DO UPDATE
    SET last_opened_at = now(),
        open_count = public.student_resource_activity.open_count + 1;
END;
$$;

REVOKE ALL ON FUNCTION public.record_resource_activity(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_resource_activity(uuid) TO authenticated;

-- 2. Aggregated student Home feed ---------------------------------------------
CREATE OR REPLACE FUNCTION public.get_student_home_feed(
  _announcement_limit integer DEFAULT 3,
  _continue_limit integer DEFAULT 5,
  _upcoming_limit integer DEFAULT 6
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
  v_announcements jsonb;
  v_continue jsonb;
  v_upcoming jsonb;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT p.center_id INTO v_center FROM public.profiles p WHERE p.user_id = uid;

  IF v_center IS NULL THEN
    RETURN jsonb_build_object('announcements', '[]'::jsonb, 'continue_learning', '[]'::jsonb, 'coming_up', '[]'::jsonb);
  END IF;

  -- Active enrolments for this student in their own centre.
  CREATE TEMP TABLE IF NOT EXISTS _enrolled_tmp (class_id uuid) ON COMMIT DROP;

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
           c.scheduled_at AS at
    FROM public.classes c
    JOIN enrolled en ON en.class_id = c.id
    WHERE c.center_id = v_center
      AND c.scheduled_at IS NOT NULL
      AND c.scheduled_at > v_now

    UNION ALL

    SELECT q.id, q.class_id, q.title, 'quiz_due'::text, q.due_at
    FROM public.quizzes q
    JOIN enrolled en ON en.class_id = q.class_id
    WHERE q.center_id = v_center
      AND q.status = 'published'
      AND q.due_at IS NOT NULL
      AND q.due_at > v_now

    UNION ALL

    SELECT q.id, q.class_id, q.title, 'quiz_open'::text, q.available_from
    FROM public.quizzes q
    JOIN enrolled en ON en.class_id = q.class_id
    WHERE q.center_id = v_center
      AND q.status = 'published'
      AND q.available_from IS NOT NULL
      AND q.available_from > v_now
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

REVOKE ALL ON FUNCTION public.get_student_home_feed(integer, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_home_feed(integer, integer, integer) TO authenticated;

-- 3. Centre-scoped XP leaderboard ---------------------------------------------
CREATE OR REPLACE FUNCTION public.get_student_xp_leaderboard(
  _period text DEFAULT 'week',
  _limit integer DEFAULT 3
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
  v_since timestamptz;
  v_top jsonb;
  v_me jsonb;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _period NOT IN ('week', 'month', 'all') THEN
    RAISE EXCEPTION 'Invalid period';
  END IF;

  SELECT p.center_id INTO v_center FROM public.profiles p WHERE p.user_id = uid;

  IF v_center IS NULL THEN
    RETURN jsonb_build_object('period', _period, 'top', '[]'::jsonb, 'me', NULL);
  END IF;

  v_since := CASE _period
    WHEN 'week' THEN date_trunc('week', now())
    WHEN 'month' THEN date_trunc('month', now())
    ELSE NULL
  END;

  WITH members AS (
    SELECT p.user_id, p.full_name, p.display_name, p.avatar_url
    FROM public.profiles p
    WHERE p.center_id = v_center
      AND EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = p.user_id AND ur.role = 'student'
      )
  ),
  scores AS (
    SELECT m.user_id,
           COALESCE(m.display_name, m.full_name, 'Student') AS name,
           m.avatar_url,
           CASE
             WHEN v_since IS NULL THEN COALESCE((SELECT pp.xp_points FROM public.profiles pp WHERE pp.user_id = m.user_id), 0)
             ELSE COALESCE((
               SELECT SUM(ev.xp_amount)
               FROM public.student_xp_events ev
               WHERE ev.student_user_id = m.user_id
                 AND ev.center_id = v_center
                 AND ev.created_at >= v_since
             ), 0)
           END AS xp
    FROM members m
  ),
  ranked AS (
    SELECT s.*, rank() OVER (ORDER BY s.xp DESC, s.name ASC) AS position
    FROM scores s
    WHERE s.xp > 0
  )
  SELECT
    COALESCE((
      SELECT jsonb_agg(t ORDER BY t.position ASC)
      FROM (
        SELECT r.user_id, r.name, r.avatar_url, r.xp, r.position
        FROM ranked r
        ORDER BY r.position ASC
        LIMIT GREATEST(_limit, 0)
      ) t
    ), '[]'::jsonb),
    (
      SELECT jsonb_build_object('user_id', r.user_id, 'name', r.name, 'xp', r.xp, 'position', r.position)
      FROM ranked r WHERE r.user_id = uid
    )
  INTO v_top, v_me;

  RETURN jsonb_build_object('period', _period, 'top', v_top, 'me', v_me);
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_xp_leaderboard(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_xp_leaderboard(text, integer) TO authenticated;