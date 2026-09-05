-- ── Per-student spaced-repetition scheduling ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.flashcard_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL,
  class_id uuid NOT NULL,
  deck_id uuid NOT NULL,
  card_id uuid NOT NULL,
  student_user_id uuid NOT NULL,
  ease numeric(4,2) NOT NULL DEFAULT 2.50,
  interval_days numeric(7,2) NOT NULL DEFAULT 0,
  repetitions integer NOT NULL DEFAULT 0,
  lapses integer NOT NULL DEFAULT 0,
  review_count integer NOT NULL DEFAULT 0,
  due_at timestamptz NOT NULL DEFAULT now(),
  last_rating text,
  last_reviewed_at timestamptz,
  mastery text NOT NULL DEFAULT 'new',
  mastered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT flashcard_reviews_unique UNIQUE (student_user_id, card_id),
  CONSTRAINT flashcard_reviews_rating_chk CHECK (last_rating IS NULL OR last_rating IN ('again','hard','good','easy')),
  CONSTRAINT flashcard_reviews_mastery_chk CHECK (mastery IN ('new','learning','review','mastered'))
);

GRANT SELECT, INSERT, UPDATE ON public.flashcard_reviews TO authenticated;
GRANT ALL ON public.flashcard_reviews TO service_role;
ALTER TABLE public.flashcard_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "flashcard_reviews own rows"
  ON public.flashcard_reviews FOR ALL TO authenticated
  USING (student_user_id = auth.uid())
  WITH CHECK (student_user_id = auth.uid());

CREATE POLICY "flashcard_reviews staff read same class"
  ON public.flashcard_reviews FOR SELECT TO authenticated
  USING (public.can_manage_class(class_id));

CREATE INDEX IF NOT EXISTS flashcard_reviews_due_idx
  ON public.flashcard_reviews (student_user_id, due_at);
CREATE INDEX IF NOT EXISTS flashcard_reviews_deck_idx
  ON public.flashcard_reviews (student_user_id, deck_id);

CREATE TRIGGER flashcard_reviews_touch
  BEFORE UPDATE ON public.flashcard_reviews
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- ── Reward idempotency ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.flashcard_review_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL,
  student_user_id uuid NOT NULL,
  reward_kind text NOT NULL,
  card_id uuid,
  reward_date date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  xp_amount integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT flashcard_review_rewards_kind_chk
    CHECK (reward_kind IN ('recall','mastery','daily_goal'))
);

GRANT SELECT ON public.flashcard_review_rewards TO authenticated;
GRANT ALL ON public.flashcard_review_rewards TO service_role;
ALTER TABLE public.flashcard_review_rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "flashcard_review_rewards own read"
  ON public.flashcard_review_rewards FOR SELECT TO authenticated
  USING (student_user_id = auth.uid());

CREATE UNIQUE INDEX IF NOT EXISTS flashcard_review_rewards_recall_idx
  ON public.flashcard_review_rewards (student_user_id, card_id, reward_date)
  WHERE reward_kind = 'recall';
CREATE UNIQUE INDEX IF NOT EXISTS flashcard_review_rewards_mastery_idx
  ON public.flashcard_review_rewards (student_user_id, card_id)
  WHERE reward_kind = 'mastery';
CREATE UNIQUE INDEX IF NOT EXISTS flashcard_review_rewards_goal_idx
  ON public.flashcard_review_rewards (student_user_id, reward_date)
  WHERE reward_kind = 'daily_goal';

-- ── Daily review goal ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.flashcard_daily_goal()
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public AS $$ SELECT 20 $$;

REVOKE ALL ON FUNCTION public.flashcard_daily_goal() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.flashcard_daily_goal() TO authenticated, service_role;

-- ── Submit one review ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_flashcard_review(_card_id uuid, _rating text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_center uuid;
  v_deck record;
  v_row public.flashcard_reviews%ROWTYPE;
  v_ease numeric(4,2);
  v_interval numeric(7,2);
  v_reps integer;
  v_lapses integer;
  v_mastery text;
  v_mastered_at timestamptz;
  v_was_due boolean;
  v_today date := (now() AT TIME ZONE 'UTC')::date;
  v_xp integer := 0;
  v_newly_mastered boolean := false;
  v_reviewed_today integer;
  v_goal integer := public.flashcard_daily_goal();
  v_goal_reached boolean := false;
  v_gam jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _rating IS NULL OR _rating NOT IN ('again','hard','good','easy') THEN
    RAISE EXCEPTION 'invalid rating';
  END IF;

  SELECT center_id INTO v_center FROM public.profiles WHERE user_id = v_user;
  IF v_center IS NULL THEN RAISE EXCEPTION 'missing center'; END IF;

  -- The card must belong to a published deck of a class the caller is
  -- actively enrolled in, inside their own tenant.
  SELECT c.id AS card_id, d.id AS deck_id, d.class_id, d.center_id
    INTO v_deck
  FROM public.flashcards c
  JOIN public.flashcard_decks d ON d.id = c.deck_id
  WHERE c.id = _card_id
    AND d.status = 'published'
    AND d.center_id = v_center
    AND public.is_enrolled_in_class(d.class_id);

  IF v_deck.card_id IS NULL THEN RAISE EXCEPTION 'card not available'; END IF;

  SELECT * INTO v_row FROM public.flashcard_reviews
  WHERE student_user_id = v_user AND card_id = _card_id
  FOR UPDATE;

  IF NOT FOUND THEN
    v_was_due := true;
    v_ease := 2.50; v_interval := 0; v_reps := 0; v_lapses := 0;
  ELSE
    v_was_due := v_row.due_at <= now();
    v_ease := v_row.ease; v_interval := v_row.interval_days;
    v_reps := v_row.repetitions; v_lapses := v_row.lapses;
  END IF;

  -- SM-2 flavoured scheduling. Again resets, Easy stretches furthest.
  IF _rating = 'again' THEN
    v_reps := 0; v_lapses := v_lapses + 1;
    v_ease := GREATEST(1.30, v_ease - 0.20);
    v_interval := 0;                                -- ~1 minute, same session
  ELSIF _rating = 'hard' THEN
    v_reps := v_reps + 1;
    v_ease := GREATEST(1.30, v_ease - 0.15);
    v_interval := CASE WHEN v_interval < 1 THEN 1 ELSE ROUND(v_interval * 1.2, 2) END;
  ELSIF _rating = 'good' THEN
    v_reps := v_reps + 1;
    v_interval := CASE
      WHEN v_reps <= 1 THEN 1
      WHEN v_reps = 2 THEN 3
      ELSE ROUND(GREATEST(1, v_interval) * v_ease, 2) END;
  ELSE -- easy
    v_reps := v_reps + 1;
    v_ease := LEAST(3.00, v_ease + 0.15);
    v_interval := CASE
      WHEN v_reps <= 1 THEN 3
      WHEN v_reps = 2 THEN 6
      ELSE ROUND(GREATEST(1, v_interval) * v_ease * 1.3, 2) END;
  END IF;
  v_interval := LEAST(v_interval, 365);

  v_mastery := CASE
    WHEN _rating = 'again' THEN 'learning'
    WHEN v_interval >= 21 AND v_reps >= 3 THEN 'mastered'
    WHEN v_reps >= 1 THEN CASE WHEN v_interval >= 1 THEN 'review' ELSE 'learning' END
    ELSE 'learning' END;

  v_mastered_at := CASE WHEN v_mastery = 'mastered' THEN COALESCE(v_row.mastered_at, now()) ELSE NULL END;
  v_newly_mastered := v_mastery = 'mastered' AND COALESCE(v_row.mastery, 'new') <> 'mastered';

  INSERT INTO public.flashcard_reviews (
    center_id, class_id, deck_id, card_id, student_user_id,
    ease, interval_days, repetitions, lapses, review_count,
    due_at, last_rating, last_reviewed_at, mastery, mastered_at
  ) VALUES (
    v_deck.center_id, v_deck.class_id, v_deck.deck_id, _card_id, v_user,
    v_ease, v_interval, v_reps, v_lapses, 1,
    CASE WHEN v_interval <= 0 THEN now() + interval '1 minute'
         ELSE now() + (v_interval * interval '1 day') END,
    _rating, now(), v_mastery, v_mastered_at
  )
  ON CONFLICT (student_user_id, card_id) DO UPDATE SET
    ease = EXCLUDED.ease,
    interval_days = EXCLUDED.interval_days,
    repetitions = EXCLUDED.repetitions,
    lapses = EXCLUDED.lapses,
    review_count = public.flashcard_reviews.review_count + 1,
    due_at = EXCLUDED.due_at,
    last_rating = EXCLUDED.last_rating,
    last_reviewed_at = EXCLUDED.last_reviewed_at,
    mastery = EXCLUDED.mastery,
    mastered_at = EXCLUDED.mastered_at
  RETURNING * INTO v_row;

  -- Legacy per-card status stays in step for existing screens.
  INSERT INTO public.flashcard_progress (user_id, flashcard_id, status, reviewed_at)
  VALUES (v_user, _card_id, CASE WHEN _rating = 'again' THEN 'again' ELSE 'known' END, now())
  ON CONFLICT (user_id, flashcard_id) DO UPDATE
    SET status = EXCLUDED.status, reviewed_at = now();

  -- ── Rewards. Only a genuinely due card earns, once per card per day. ─────
  IF _rating <> 'again' AND v_was_due THEN
    BEGIN
      INSERT INTO public.flashcard_review_rewards (center_id, student_user_id, reward_kind, card_id, xp_amount)
      VALUES (v_center, v_user, 'recall', _card_id, 2);
      v_gam := public.record_learning_activity('flashcard_known', 2, _card_id, 'flashcard');
      v_xp := v_xp + 2;
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
  END IF;

  IF v_newly_mastered THEN
    BEGIN
      INSERT INTO public.flashcard_review_rewards (center_id, student_user_id, reward_kind, card_id, xp_amount)
      VALUES (v_center, v_user, 'mastery', _card_id, 5);
      v_gam := public.record_learning_activity('flashcard_mastered', 5, _card_id, 'flashcard');
      v_xp := v_xp + 5;
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
  END IF;

  SELECT count(*) INTO v_reviewed_today
  FROM public.flashcard_reviews
  WHERE student_user_id = v_user
    AND last_reviewed_at >= v_today
    AND last_reviewed_at < v_today + 1;

  IF v_reviewed_today >= v_goal THEN
    BEGIN
      INSERT INTO public.flashcard_review_rewards (center_id, student_user_id, reward_kind, xp_amount)
      VALUES (v_center, v_user, 'daily_goal', 10);
      v_gam := public.record_learning_activity('flashcard_daily_goal', 10, NULL, 'flashcard');
      v_xp := v_xp + 10;
      v_goal_reached := true;
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
  END IF;

  IF v_gam IS NULL THEN
    SELECT jsonb_build_object(
      'total_xp', COALESCE(p.xp_points, 0),
      'level', GREATEST(1, (COALESCE(p.xp_points, 0) / 500) + 1),
      'xp_awarded', 0
    ) INTO v_gam FROM public.profiles p WHERE p.user_id = v_user;
  END IF;

  RETURN jsonb_build_object(
    'card_id', _card_id,
    'rating', _rating,
    'due_at', v_row.due_at,
    'interval_days', v_row.interval_days,
    'ease', v_row.ease,
    'repetitions', v_row.repetitions,
    'mastery', v_row.mastery,
    'newly_mastered', v_newly_mastered,
    'xp_awarded', v_xp,
    'reviewed_today', v_reviewed_today,
    'daily_goal', v_goal,
    'daily_goal_reached', v_goal_reached,
    'gamification', v_gam
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_flashcard_review(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_flashcard_review(uuid, text) TO authenticated;

-- ── Today's review queue across every enrolled class ───────────────────────
CREATE OR REPLACE FUNCTION public.get_student_flashcard_review_queue(_limit integer DEFAULT 40)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_center uuid;
  v_today date := (now() AT TIME ZONE 'UTC')::date;
  v_limit integer := LEAST(GREATEST(COALESCE(_limit, 40), 1), 100);
  v_cards jsonb;
  v_due integer;
  v_new integer;
  v_reviewed integer;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT center_id INTO v_center FROM public.profiles WHERE user_id = v_user;
  IF v_center IS NULL THEN RAISE EXCEPTION 'missing center'; END IF;

  WITH available AS (
    SELECT c.id AS card_id, c.front_text, c.back_text, c.sort_order,
           d.id AS deck_id, d.title AS deck_title, d.class_id,
           cl.title AS class_title,
           r.due_at, r.mastery, r.repetitions, r.interval_days
    FROM public.flashcards c
    JOIN public.flashcard_decks d ON d.id = c.deck_id
    JOIN public.classes cl ON cl.id = d.class_id
    LEFT JOIN public.flashcard_reviews r
      ON r.card_id = c.id AND r.student_user_id = v_user
    WHERE d.center_id = v_center
      AND d.status = 'published'
      AND public.is_enrolled_in_class(d.class_id)
      AND (r.due_at IS NULL OR r.due_at <= now())
  )
  SELECT jsonb_agg(x ORDER BY x.priority, x.due_at NULLS LAST, x.sort_order)
    INTO v_cards
  FROM (
    SELECT a.*, CASE WHEN a.due_at IS NULL THEN 1 ELSE 0 END AS priority
    FROM available a
    LIMIT v_limit
  ) x;

  SELECT count(*) INTO v_due
  FROM public.flashcards c
  JOIN public.flashcard_decks d ON d.id = c.deck_id
  JOIN public.flashcard_reviews r ON r.card_id = c.id AND r.student_user_id = v_user
  WHERE d.center_id = v_center AND d.status = 'published'
    AND public.is_enrolled_in_class(d.class_id) AND r.due_at <= now();

  SELECT count(*) INTO v_new
  FROM public.flashcards c
  JOIN public.flashcard_decks d ON d.id = c.deck_id
  LEFT JOIN public.flashcard_reviews r ON r.card_id = c.id AND r.student_user_id = v_user
  WHERE d.center_id = v_center AND d.status = 'published'
    AND public.is_enrolled_in_class(d.class_id) AND r.id IS NULL;

  SELECT count(*) INTO v_reviewed
  FROM public.flashcard_reviews
  WHERE student_user_id = v_user
    AND last_reviewed_at >= v_today AND last_reviewed_at < v_today + 1;

  RETURN jsonb_build_object(
    'cards', COALESCE(v_cards, '[]'::jsonb),
    'due_count', COALESCE(v_due, 0),
    'new_count', COALESCE(v_new, 0),
    'reviewed_today', COALESCE(v_reviewed, 0),
    'daily_goal', public.flashcard_daily_goal()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_flashcard_review_queue(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_student_flashcard_review_queue(integer) TO authenticated;

-- ── My Flashcards overview ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_student_flashcard_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_center uuid;
  v_today date := (now() AT TIME ZONE 'UTC')::date;
  v_decks jsonb;
  v_totals record;
  v_reviewed integer;
  v_streak record;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT center_id INTO v_center FROM public.profiles WHERE user_id = v_user;
  IF v_center IS NULL THEN RAISE EXCEPTION 'missing center'; END IF;

  WITH decks AS (
    SELECT d.id, d.title, d.class_id, cl.title AS class_title,
           s.name AS subject_name,
           count(c.id) AS card_count,
           count(r.id) FILTER (WHERE r.mastery = 'mastered') AS mastered_count,
           count(r.id) FILTER (WHERE r.due_at <= now()) AS due_count,
           count(c.id) FILTER (WHERE r.id IS NULL) AS new_count,
           max(r.last_reviewed_at) AS last_reviewed_at
    FROM public.flashcard_decks d
    JOIN public.classes cl ON cl.id = d.class_id
    LEFT JOIN public.subjects s ON s.id = d.subject_id
    LEFT JOIN public.flashcards c ON c.deck_id = d.id
    LEFT JOIN public.flashcard_reviews r
      ON r.card_id = c.id AND r.student_user_id = v_user
    WHERE d.center_id = v_center
      AND d.status = 'published'
      AND public.is_enrolled_in_class(d.class_id)
    GROUP BY d.id, d.title, d.class_id, cl.title, s.name, d.display_order
    ORDER BY d.display_order NULLS LAST, d.title
  )
  SELECT jsonb_agg(to_jsonb(decks)) INTO v_decks FROM decks;

  SELECT
    count(*) AS total_tracked,
    count(*) FILTER (WHERE mastery = 'mastered') AS mastered,
    count(*) FILTER (WHERE mastery IN ('learning','review')) AS learning,
    count(*) FILTER (WHERE due_at <= now()) AS due
  INTO v_totals
  FROM public.flashcard_reviews WHERE student_user_id = v_user;

  SELECT count(*) INTO v_reviewed FROM public.flashcard_reviews
  WHERE student_user_id = v_user
    AND last_reviewed_at >= v_today AND last_reviewed_at < v_today + 1;

  SELECT current_streak, longest_streak INTO v_streak
  FROM public.student_streaks WHERE student_user_id = v_user;

  RETURN jsonb_build_object(
    'decks', COALESCE(v_decks, '[]'::jsonb),
    'tracked_count', COALESCE(v_totals.total_tracked, 0),
    'mastered_count', COALESCE(v_totals.mastered, 0),
    'learning_count', COALESCE(v_totals.learning, 0),
    'due_count', COALESCE(v_totals.due, 0),
    'reviewed_today', COALESCE(v_reviewed, 0),
    'daily_goal', public.flashcard_daily_goal(),
    'current_streak', COALESCE(v_streak.current_streak, 0),
    'longest_streak', COALESCE(v_streak.longest_streak, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_flashcard_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_student_flashcard_overview() TO authenticated;