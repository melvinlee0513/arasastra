CREATE OR REPLACE FUNCTION public.enforce_profile_protected_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Admins, superadmins and server-side roles may change anything.
  IF public.is_admin() OR public.is_superadmin() OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.center_id          := OLD.center_id;
  NEW.plan_id            := OLD.plan_id;
  NEW.lead_status        := OLD.lead_status;
  NEW.admin_remarks      := OLD.admin_remarks;
  NEW.assigned_tutor_id  := OLD.assigned_tutor_id;
  NEW.user_id            := OLD.user_id;

  -- XP is server-authoritative: only trusted SECURITY DEFINER routines that set
  -- the transaction-local flag below may change it.
  IF COALESCE(current_setting('app.xp_award', true), '') <> 'on' THEN
    NEW.xp_points := OLD.xp_points;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_learning_activity(_event_type text, _xp_amount integer, _source_id uuid DEFAULT NULL::uuid, _source_type text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
    PERFORM set_config('app.xp_award', 'on', true);
    UPDATE public.profiles SET xp_points = COALESCE(xp_points,0) + v_effective_xp, updated_at = now()
      WHERE user_id = v_user RETURNING xp_points INTO v_total_xp;
    PERFORM set_config('app.xp_award', 'off', true);
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