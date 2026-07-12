
-- 1. Columns first (so the resolver can reference them)
ALTER TABLE public.tuition_centers
  ADD COLUMN IF NOT EXISTS theme_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS feature_flags jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2. Rebuild subdomain resolver with new fields
DROP FUNCTION IF EXISTS public.resolve_tenant_by_subdomain(text);
CREATE OR REPLACE FUNCTION public.resolve_tenant_by_subdomain(_slug text)
RETURNS TABLE(
  id uuid, name text, logo_url text, domain_status text,
  subdomain_slug text, theme_config jsonb, feature_flags jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT c.id, c.name, c.logo_url, c.domain_status,
         c.subdomain_slug, c.theme_config, c.feature_flags
  FROM public.tuition_centers c
  WHERE c.subdomain_slug = lower(trim(_slug))
    AND c.domain_status = 'active'
  LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.resolve_tenant_by_subdomain(text) TO anon, authenticated;

-- 3. Email → tenant subdomain (for HQ /auth pre-login redirect)
CREATE OR REPLACE FUNCTION public.get_signin_redirect_for_email(_email text)
RETURNS TABLE(center_id uuid, subdomain_slug text, is_superadmin boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(_email));
  v_user_id uuid; v_center_id uuid; v_slug text; v_super boolean := false;
BEGIN
  IF v_email IS NULL OR v_email = '' THEN RETURN; END IF;
  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = v_email LIMIT 1;
  IF v_user_id IS NOT NULL THEN
    SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = v_user_id AND role = 'superadmin'::public.app_role) INTO v_super;
    SELECT p.center_id INTO v_center_id FROM public.profiles p WHERE p.user_id = v_user_id LIMIT 1;
  END IF;
  IF v_center_id IS NULL THEN
    SELECT i.center_id INTO v_center_id FROM public.invitations i
    WHERE lower(i.email) = v_email AND i.status = 'pending'
    ORDER BY i.created_at DESC NULLS LAST LIMIT 1;
  END IF;
  IF v_center_id IS NOT NULL THEN
    SELECT c.subdomain_slug INTO v_slug FROM public.tuition_centers c
    WHERE c.id = v_center_id AND c.domain_status = 'active' LIMIT 1;
  END IF;
  RETURN QUERY SELECT v_center_id, v_slug, v_super;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_signin_redirect_for_email(text) TO anon, authenticated;

-- 4. Invite token → tenant subdomain
CREATE OR REPLACE FUNCTION public.get_invite_redirect(_token uuid)
RETURNS TABLE(center_id uuid, subdomain_slug text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT i.center_id, c.subdomain_slug
  FROM public.invitations i
  LEFT JOIN public.tuition_centers c ON c.id = i.center_id AND c.domain_status = 'active'
  WHERE i.id = _token AND i.status = 'pending' LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_invite_redirect(uuid) TO anon, authenticated;

-- 5. Respect the per-centre `gamification` feature flag in the XP RPC
CREATE OR REPLACE FUNCTION public.record_learning_activity(_event_type text, _xp_amount integer, _source_id uuid DEFAULT NULL::uuid, _source_type text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid(); v_center uuid; v_flags jsonb; v_gamification_on boolean := true;
  v_today date := (now() AT TIME ZONE 'UTC')::date;
  v_streak public.student_streaks%ROWTYPE;
  v_new_current integer; v_new_longest integer; v_total_xp integer;
  v_daily_cap integer; v_xp_awarded_today integer;
  v_effective_xp integer := GREATEST(COALESCE(_xp_amount,0), 0);
  v_already_counted boolean := false;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT center_id INTO v_center FROM public.profiles WHERE user_id = v_user;
  IF v_center IS NULL THEN RAISE EXCEPTION 'missing center'; END IF;

  SELECT feature_flags INTO v_flags FROM public.tuition_centers WHERE id = v_center;
  IF v_flags IS NOT NULL AND (v_flags ? 'gamification') AND (v_flags->>'gamification')::boolean = false THEN
    v_gamification_on := false; v_effective_xp := 0;
  END IF;

  IF _source_id IS NOT NULL AND _event_type IN ('flashcard_known','video_watched','note_read') THEN
    SELECT EXISTS (SELECT 1 FROM public.student_xp_events
      WHERE student_user_id = v_user AND event_type = _event_type AND source_id = _source_id
        AND created_at >= v_today AND created_at < v_today + 1) INTO v_already_counted;
    IF v_already_counted THEN v_effective_xp := 0; END IF;
  END IF;

  v_daily_cap := CASE _event_type
    WHEN 'flashcard_known' THEN 300 WHEN 'video_watched' THEN 400 WHEN 'note_read' THEN 200
    WHEN 'quiz_completed' THEN 1000 WHEN 'homework_submitted' THEN 500 ELSE 2000 END;

  IF v_effective_xp > 0 THEN
    SELECT COALESCE(SUM(xp_amount),0) INTO v_xp_awarded_today FROM public.student_xp_events
    WHERE student_user_id = v_user AND event_type = _event_type
      AND created_at >= v_today AND created_at < v_today + 1;
    v_effective_xp := GREATEST(0, LEAST(v_effective_xp, v_daily_cap - v_xp_awarded_today));
  END IF;

  INSERT INTO public.student_xp_events (center_id, student_user_id, event_type, xp_amount, source_id, source_type)
  VALUES (v_center, v_user, _event_type, v_effective_xp, _source_id, _source_type);

  IF v_effective_xp > 0 THEN
    UPDATE public.profiles SET xp_points = COALESCE(xp_points,0) + v_effective_xp, updated_at = now()
      WHERE user_id = v_user RETURNING xp_points INTO v_total_xp;
  ELSE
    SELECT COALESCE(xp_points,0) INTO v_total_xp FROM public.profiles WHERE user_id = v_user;
  END IF;

  IF v_gamification_on THEN
    SELECT * INTO v_streak FROM public.student_streaks WHERE student_user_id = v_user;
    IF NOT FOUND THEN
      INSERT INTO public.student_streaks (center_id, student_user_id, current_streak, longest_streak, last_activity_date)
      VALUES (v_center, v_user, 1, 1, v_today) RETURNING * INTO v_streak;
    ELSE
      IF v_streak.last_activity_date = v_today THEN v_new_current := v_streak.current_streak;
      ELSIF v_streak.last_activity_date = v_today - 1 THEN v_new_current := v_streak.current_streak + 1;
      ELSE v_new_current := 1; END IF;
      v_new_longest := GREATEST(v_streak.longest_streak, v_new_current);
      UPDATE public.student_streaks SET current_streak = v_new_current, longest_streak = v_new_longest,
        last_activity_date = v_today, updated_at = now()
        WHERE student_user_id = v_user RETURNING * INTO v_streak;
    END IF;
  ELSE
    SELECT * INTO v_streak FROM public.student_streaks WHERE student_user_id = v_user;
  END IF;

  RETURN jsonb_build_object(
    'total_xp', COALESCE(v_total_xp,0),
    'current_streak', COALESCE(v_streak.current_streak, 0),
    'longest_streak', COALESCE(v_streak.longest_streak, 0),
    'level', GREATEST(1, (COALESCE(v_total_xp,0) / 500) + 1),
    'xp_awarded', v_effective_xp,
    'gamification_enabled', v_gamification_on
  );
END;
$function$;
