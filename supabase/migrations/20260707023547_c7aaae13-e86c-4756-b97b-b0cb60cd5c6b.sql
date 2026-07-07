
-- Phase 3: Gamification schema

CREATE TABLE IF NOT EXISTS public.student_streaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL,
  student_user_id uuid NOT NULL,
  current_streak integer NOT NULL DEFAULT 0,
  longest_streak integer NOT NULL DEFAULT 0,
  last_activity_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_streaks TO authenticated;
GRANT ALL ON public.student_streaks TO service_role;
ALTER TABLE public.student_streaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "streaks_self_read" ON public.student_streaks
  FOR SELECT TO authenticated USING (student_user_id = auth.uid() OR public.is_admin());
CREATE POLICY "streaks_self_write" ON public.student_streaks
  FOR ALL TO authenticated
  USING (student_user_id = auth.uid())
  WITH CHECK (student_user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.student_xp_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL,
  student_user_id uuid NOT NULL,
  event_type text NOT NULL,
  xp_amount integer NOT NULL DEFAULT 0,
  source_id uuid,
  source_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_xp_events TO authenticated;
GRANT ALL ON public.student_xp_events TO service_role;
ALTER TABLE public.student_xp_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "xp_self_read" ON public.student_xp_events
  FOR SELECT TO authenticated USING (student_user_id = auth.uid() OR public.is_admin());
CREATE POLICY "xp_self_insert" ON public.student_xp_events
  FOR INSERT TO authenticated WITH CHECK (student_user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_xp_events_student ON public.student_xp_events (student_user_id, created_at DESC);

-- Atomic activity recorder: updates streak, inserts XP event, bumps profile xp_points.
CREATE OR REPLACE FUNCTION public.record_learning_activity(
  _event_type text,
  _xp_amount integer,
  _source_id uuid DEFAULT NULL,
  _source_type text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_center uuid;
  v_today date := (now() AT TIME ZONE 'UTC')::date;
  v_streak public.student_streaks%ROWTYPE;
  v_new_current integer;
  v_new_longest integer;
  v_total_xp integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT center_id INTO v_center FROM public.profiles WHERE user_id = v_user;
  IF v_center IS NULL THEN
    RAISE EXCEPTION 'missing center';
  END IF;

  INSERT INTO public.student_xp_events (center_id, student_user_id, event_type, xp_amount, source_id, source_type)
  VALUES (v_center, v_user, _event_type, COALESCE(_xp_amount,0), _source_id, _source_type);

  UPDATE public.profiles
    SET xp_points = COALESCE(xp_points,0) + COALESCE(_xp_amount,0),
        updated_at = now()
    WHERE user_id = v_user
    RETURNING xp_points INTO v_total_xp;

  SELECT * INTO v_streak FROM public.student_streaks WHERE student_user_id = v_user;
  IF NOT FOUND THEN
    INSERT INTO public.student_streaks (center_id, student_user_id, current_streak, longest_streak, last_activity_date)
    VALUES (v_center, v_user, 1, 1, v_today)
    RETURNING * INTO v_streak;
  ELSE
    IF v_streak.last_activity_date = v_today THEN
      v_new_current := v_streak.current_streak;
    ELSIF v_streak.last_activity_date = v_today - 1 THEN
      v_new_current := v_streak.current_streak + 1;
    ELSE
      v_new_current := 1;
    END IF;
    v_new_longest := GREATEST(v_streak.longest_streak, v_new_current);
    UPDATE public.student_streaks
      SET current_streak = v_new_current,
          longest_streak = v_new_longest,
          last_activity_date = v_today,
          updated_at = now()
      WHERE student_user_id = v_user
      RETURNING * INTO v_streak;
  END IF;

  RETURN jsonb_build_object(
    'total_xp', COALESCE(v_total_xp,0),
    'current_streak', v_streak.current_streak,
    'longest_streak', v_streak.longest_streak,
    'level', GREATEST(1, (COALESCE(v_total_xp,0) / 500) + 1)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_learning_activity(text, integer, uuid, text) TO authenticated;
