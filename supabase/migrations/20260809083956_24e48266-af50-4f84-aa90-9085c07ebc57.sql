CREATE OR REPLACE FUNCTION public.get_student_xp_leaderboard(_period text DEFAULT 'week'::text, _limit integer DEFAULT 3)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  v_center uuid;
  v_since timestamptz;
  v_top jsonb;
  v_me jsonb;
  v_total integer;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _period NOT IN ('week', 'month', 'all') THEN
    RAISE EXCEPTION 'Invalid period';
  END IF;

  SELECT p.center_id INTO v_center FROM public.profiles p WHERE p.user_id = uid;

  IF v_center IS NULL THEN
    RETURN jsonb_build_object('period', _period, 'top', '[]'::jsonb, 'me', NULL, 'total', 0);
  END IF;

  v_since := CASE _period
    WHEN 'week' THEN date_trunc('week', now())
    WHEN 'month' THEN date_trunc('month', now())
    ELSE NULL
  END;

  WITH members AS (
    SELECT p.user_id, p.full_name, p.display_name, p.avatar_url, p.avatar_path
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
           m.avatar_path,
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
        SELECT r.user_id, r.name, r.avatar_url, r.avatar_path, r.xp, r.position
        FROM ranked r
        ORDER BY r.position ASC
        LIMIT GREATEST(_limit, 0)
      ) t
    ), '[]'::jsonb),
    (
      SELECT jsonb_build_object(
        'user_id', r.user_id,
        'name', r.name,
        'avatar_url', r.avatar_url,
        'avatar_path', r.avatar_path,
        'xp', r.xp,
        'position', r.position,
        -- XP held by the student directly above; NULL when the student leads.
        'next_position', (
          SELECT n.position FROM ranked n WHERE n.position < r.position
          ORDER BY n.position DESC LIMIT 1
        ),
        'next_xp', (
          SELECT n.xp FROM ranked n WHERE n.position < r.position
          ORDER BY n.position DESC LIMIT 1
        )
      )
      FROM ranked r WHERE r.user_id = uid
    ),
    (SELECT count(*)::int FROM ranked)
  INTO v_top, v_me, v_total;

  RETURN jsonb_build_object('period', _period, 'top', v_top, 'me', v_me, 'total', v_total);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_student_xp_leaderboard(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_student_xp_leaderboard(text, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_student_xp_leaderboard(text, integer) TO authenticated;