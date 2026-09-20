-- Flashcards 3.0: per-student review history, idempotent review submission,
-- deck-level student review detail and tutor/admin mastery overview.
-- Additive only: existing decks, cards, review state and rewards are untouched.

CREATE TABLE IF NOT EXISTS public.flashcard_review_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL,
  class_id uuid,
  deck_id uuid NOT NULL,
  card_id uuid NOT NULL,
  student_user_id uuid NOT NULL,
  rating text NOT NULL,
  prev_interval_days numeric(7,2),
  new_interval_days numeric(7,2),
  prev_ease numeric(4,2),
  new_ease numeric(4,2),
  prev_mastery text,
  new_mastery text,
  was_due boolean NOT NULL DEFAULT true,
  xp_awarded integer NOT NULL DEFAULT 0,
  client_token text,
  result jsonb,
  reviewed_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.flashcard_review_log TO authenticated;
GRANT ALL ON public.flashcard_review_log TO service_role;

ALTER TABLE public.flashcard_review_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS flashcard_review_log_student_read ON public.flashcard_review_log;
CREATE POLICY flashcard_review_log_student_read
ON public.flashcard_review_log FOR SELECT TO authenticated
USING (student_user_id = auth.uid());

DROP POLICY IF EXISTS flashcard_review_log_manager_read ON public.flashcard_review_log;
CREATE POLICY flashcard_review_log_manager_read
ON public.flashcard_review_log FOR SELECT TO authenticated
USING (class_id IS NOT NULL AND public.can_manage_class(class_id));

CREATE UNIQUE INDEX IF NOT EXISTS flashcard_review_log_token_idx
  ON public.flashcard_review_log (student_user_id, card_id, client_token)
  WHERE client_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS flashcard_review_log_student_idx
  ON public.flashcard_review_log (student_user_id, reviewed_at DESC);
CREATE INDEX IF NOT EXISTS flashcard_review_log_deck_idx
  ON public.flashcard_review_log (deck_id, reviewed_at DESC);
CREATE INDEX IF NOT EXISTS flashcard_review_log_card_idx
  ON public.flashcard_review_log (card_id, reviewed_at DESC);

CREATE INDEX IF NOT EXISTS flashcard_reviews_center_deck_idx
  ON public.flashcard_reviews (center_id, deck_id);

-- ── Review submission: server authoritative, idempotent, history-writing ────
DROP FUNCTION IF EXISTS public.submit_flashcard_review(uuid, text);

CREATE OR REPLACE FUNCTION public.submit_flashcard_review(
  _card_id uuid,
  _rating text,
  _client_token text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_center uuid;
  v_deck record;
  v_row public.flashcard_reviews%ROWTYPE;
  v_prev public.flashcard_reviews%ROWTYPE;
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
  v_token text := NULLIF(btrim(COALESCE(_client_token, '')), '');
  v_cached jsonb;
  v_result jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _rating IS NULL OR _rating NOT IN ('again','hard','good','easy') THEN
    RAISE EXCEPTION 'invalid rating';
  END IF;

  -- Idempotency: the same client attempt replays its recorded outcome.
  IF v_token IS NOT NULL THEN
    SELECT l.result INTO v_cached
    FROM public.flashcard_review_log l
    WHERE l.student_user_id = v_user AND l.card_id = _card_id AND l.client_token = v_token
    LIMIT 1;
    IF v_cached IS NOT NULL THEN
      RETURN v_cached || jsonb_build_object('replayed', true);
    END IF;
  END IF;

  SELECT center_id INTO v_center FROM public.profiles WHERE user_id = v_user;
  IF v_center IS NULL THEN RAISE EXCEPTION 'missing center'; END IF;

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
    v_prev := v_row;
    v_was_due := v_row.due_at <= now();
    v_ease := v_row.ease; v_interval := v_row.interval_days;
    v_reps := v_row.repetitions; v_lapses := v_row.lapses;
  END IF;

  IF _rating = 'again' THEN
    v_reps := 0; v_lapses := v_lapses + 1;
    v_ease := GREATEST(1.30, v_ease - 0.20);
    v_interval := 0;
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
  ELSE
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

  v_mastered_at := CASE WHEN v_mastery = 'mastered' THEN COALESCE(v_prev.mastered_at, now()) ELSE NULL END;
  v_newly_mastered := v_mastery = 'mastered' AND COALESCE(v_prev.mastery, 'new') <> 'mastered';

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

  INSERT INTO public.flashcard_progress (user_id, flashcard_id, status, reviewed_at)
  VALUES (v_user, _card_id, CASE WHEN _rating = 'again' THEN 'again' ELSE 'known' END, now())
  ON CONFLICT (user_id, flashcard_id) DO UPDATE
    SET status = EXCLUDED.status, reviewed_at = now();

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

  v_result := jsonb_build_object(
    'card_id', _card_id,
    'deck_id', v_deck.deck_id,
    'rating', _rating,
    'due_at', v_row.due_at,
    'interval_days', v_row.interval_days,
    'ease', v_row.ease,
    'repetitions', v_row.repetitions,
    'mastery', v_row.mastery,
    'previous_mastery', COALESCE(v_prev.mastery, 'new'),
    'newly_mastered', v_newly_mastered,
    'xp_awarded', v_xp,
    'reviewed_today', v_reviewed_today,
    'daily_goal', v_goal,
    'daily_goal_reached', v_goal_reached,
    'gamification', v_gam,
    'replayed', false
  );

  INSERT INTO public.flashcard_review_log (
    center_id, class_id, deck_id, card_id, student_user_id, rating,
    prev_interval_days, new_interval_days, prev_ease, new_ease,
    prev_mastery, new_mastery, was_due, xp_awarded, client_token, result
  ) VALUES (
    v_deck.center_id, v_deck.class_id, v_deck.deck_id, _card_id, v_user, _rating,
    v_prev.interval_days, v_row.interval_days, v_prev.ease, v_row.ease,
    COALESCE(v_prev.mastery, 'new'), v_row.mastery, v_was_due, v_xp, v_token, v_result
  );

  RETURN v_result;
END; $function$;

REVOKE ALL ON FUNCTION public.submit_flashcard_review(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_flashcard_review(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_flashcard_review(uuid, text, text) TO authenticated;

-- ── Student overview: add next due timestamp + per-deck learning counts ─────
CREATE OR REPLACE FUNCTION public.get_student_flashcard_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_center uuid;
  v_today date := (now() AT TIME ZONE 'UTC')::date;
  v_decks jsonb;
  v_totals record;
  v_reviewed integer;
  v_streak record;
  v_next timestamptz;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT center_id INTO v_center FROM public.profiles WHERE user_id = v_user;
  IF v_center IS NULL THEN RAISE EXCEPTION 'missing center'; END IF;

  WITH decks AS (
    SELECT d.id, d.title, d.class_id, cl.title AS class_title,
           s.name AS subject_name,
           count(c.id) AS card_count,
           count(r.id) FILTER (WHERE r.mastery = 'mastered') AS mastered_count,
           count(r.id) FILTER (WHERE r.mastery IN ('learning','review')) AS learning_count,
           count(r.id) FILTER (WHERE r.due_at <= now()) AS due_count,
           count(c.id) FILTER (WHERE r.id IS NULL) AS new_count,
           max(r.last_reviewed_at) AS last_reviewed_at,
           min(r.due_at) FILTER (WHERE r.due_at > now()) AS next_due_at
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

  SELECT min(due_at) INTO v_next
  FROM public.flashcard_reviews
  WHERE student_user_id = v_user AND due_at > now();

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
    'next_due_at', v_next,
    'reviewed_today', COALESCE(v_reviewed, 0),
    'daily_goal', public.flashcard_daily_goal(),
    'current_streak', COALESCE(v_streak.current_streak, 0),
    'longest_streak', COALESCE(v_streak.longest_streak, 0)
  );
END; $function$;

REVOKE ALL ON FUNCTION public.get_student_flashcard_overview() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_student_flashcard_overview() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_student_flashcard_overview() TO authenticated;

-- ── Deck-scoped review queue (Start Review from one deck) ───────────────────
CREATE OR REPLACE FUNCTION public.get_student_flashcard_deck_review(_deck_id uuid, _limit integer DEFAULT 40)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_center uuid;
  v_deck public.flashcard_decks;
  v_limit integer := LEAST(GREATEST(COALESCE(_limit, 40), 1), 100);
  v_cards jsonb;
  v_stats record;
  v_next timestamptz;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT center_id INTO v_center FROM public.profiles WHERE user_id = v_user;
  IF v_center IS NULL THEN RAISE EXCEPTION 'missing center'; END IF;

  SELECT * INTO v_deck FROM public.flashcard_decks WHERE id = _deck_id;
  IF v_deck.id IS NULL OR v_deck.status <> 'published' OR v_deck.class_id IS NULL
     OR v_deck.center_id IS DISTINCT FROM v_center
     OR NOT public.is_enrolled_in_class(v_deck.class_id) THEN
    RAISE EXCEPTION 'deck not available';
  END IF;
  IF NOT public.tenant_feature_enabled(v_deck.center_id, 'flashcards', true) THEN
    RAISE EXCEPTION 'flashcards disabled';
  END IF;

  SELECT
    count(*) AS card_count,
    count(*) FILTER (WHERE r.id IS NULL) AS new_count,
    count(*) FILTER (WHERE r.mastery IN ('learning','review')) AS learning_count,
    count(*) FILTER (WHERE r.mastery = 'mastered') AS mastered_count,
    count(*) FILTER (WHERE r.id IS NULL OR r.due_at <= now()) AS due_count,
    max(r.last_reviewed_at) AS last_reviewed_at
  INTO v_stats
  FROM public.flashcards c
  LEFT JOIN public.flashcard_reviews r ON r.card_id = c.id AND r.student_user_id = v_user
  WHERE c.deck_id = _deck_id;

  SELECT min(r.due_at) INTO v_next
  FROM public.flashcard_reviews r
  JOIN public.flashcards c ON c.id = r.card_id
  WHERE c.deck_id = _deck_id AND r.student_user_id = v_user AND r.due_at > now();

  SELECT jsonb_agg(x ORDER BY x.priority, x.due_at NULLS LAST, x.sort_order)
    INTO v_cards
  FROM (
    SELECT c.id AS card_id, c.front_text, c.back_text, c.front_content, c.back_content,
           c.sort_order,
           v_deck.id AS deck_id, v_deck.title AS deck_title, v_deck.class_id,
           (SELECT cl.title FROM public.classes cl WHERE cl.id = v_deck.class_id) AS class_title,
           r.due_at, COALESCE(r.mastery, 'new') AS mastery,
           r.repetitions, r.interval_days,
           CASE WHEN r.due_at IS NULL THEN 1 ELSE 0 END AS priority
    FROM public.flashcards c
    LEFT JOIN public.flashcard_reviews r ON r.card_id = c.id AND r.student_user_id = v_user
    WHERE c.deck_id = _deck_id
      AND (btrim(c.front_text) <> '' OR c.front_image_path IS NOT NULL)
      AND (btrim(c.back_text) <> '' OR c.back_image_path IS NOT NULL)
    LIMIT v_limit
  ) x;

  RETURN jsonb_build_object(
    'deck_id', v_deck.id,
    'deck_title', v_deck.title,
    'card_count', COALESCE(v_stats.card_count, 0),
    'new_count', COALESCE(v_stats.new_count, 0),
    'learning_count', COALESCE(v_stats.learning_count, 0),
    'mastered_count', COALESCE(v_stats.mastered_count, 0),
    'due_count', COALESCE(v_stats.due_count, 0),
    'last_reviewed_at', v_stats.last_reviewed_at,
    'next_due_at', v_next,
    'daily_goal', public.flashcard_daily_goal(),
    'cards', COALESCE(v_cards, '[]'::jsonb)
  );
END; $function$;

REVOKE ALL ON FUNCTION public.get_student_flashcard_deck_review(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_student_flashcard_deck_review(uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_student_flashcard_deck_review(uuid, integer) TO authenticated;

-- ── Tutor / admin mastery overview for one deck ─────────────────────────────
CREATE OR REPLACE FUNCTION public.get_flashcard_deck_mastery_overview(_deck_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_deck public.flashcard_decks;
  v_stats record;
  v_students integer;
  v_cards jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO v_deck FROM public.flashcard_decks WHERE id = _deck_id;
  IF v_deck.id IS NULL OR v_deck.class_id IS NULL THEN RAISE EXCEPTION 'deck not found'; END IF;
  IF NOT public.can_manage_class(v_deck.class_id) THEN RAISE EXCEPTION 'not permitted'; END IF;

  SELECT count(DISTINCT e.student_user_id) INTO v_students
  FROM public.class_enrollments e
  WHERE e.class_id = v_deck.class_id AND e.status = 'active';

  SELECT
    count(DISTINCT r.student_user_id) AS participants,
    count(*) AS tracked,
    count(*) FILTER (WHERE r.mastery = 'mastered') AS mastered,
    count(*) FILTER (WHERE r.mastery IN ('learning','review')) AS learning,
    max(r.last_reviewed_at) AS last_activity
  INTO v_stats
  FROM public.flashcard_reviews r
  WHERE r.deck_id = _deck_id;

  SELECT jsonb_agg(t ORDER BY t.difficulty_score DESC, t.sort_order)
    INTO v_cards
  FROM (
    SELECT c.id AS card_id, c.front_text, c.sort_order,
           count(r.id) AS reviewers,
           COALESCE(sum(r.lapses), 0) AS lapses,
           count(r.id) FILTER (WHERE r.mastery = 'mastered') AS mastered,
           CASE WHEN count(r.id) = 0 THEN 0
                ELSE ROUND(
                  (COALESCE(sum(r.lapses), 0)::numeric
                   + count(r.id) FILTER (WHERE r.last_rating = 'again')
                   + count(r.id) FILTER (WHERE r.mastery <> 'mastered') * 0.5)
                  / count(r.id), 2) END AS difficulty_score
    FROM public.flashcards c
    LEFT JOIN public.flashcard_reviews r ON r.card_id = c.id
    WHERE c.deck_id = _deck_id
    GROUP BY c.id, c.front_text, c.sort_order
  ) t
  WHERE t.reviewers > 0 AND t.difficulty_score >= 0.75;

  RETURN jsonb_build_object(
    'deck_id', v_deck.id,
    'deck_title', v_deck.title,
    'class_id', v_deck.class_id,
    'enrolled_students', COALESCE(v_students, 0),
    'participants', COALESCE(v_stats.participants, 0),
    'tracked_cards', COALESCE(v_stats.tracked, 0),
    'mastered_cards', COALESCE(v_stats.mastered, 0),
    'learning_cards', COALESCE(v_stats.learning, 0),
    'average_mastery_pct', CASE WHEN COALESCE(v_stats.tracked, 0) = 0 THEN 0
      ELSE ROUND(v_stats.mastered::numeric * 100 / v_stats.tracked) END,
    'last_activity_at', v_stats.last_activity,
    'attention_cards', COALESCE(v_cards, '[]'::jsonb)
  );
END; $function$;

REVOKE ALL ON FUNCTION public.get_flashcard_deck_mastery_overview(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_flashcard_deck_mastery_overview(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_flashcard_deck_mastery_overview(uuid) TO authenticated;