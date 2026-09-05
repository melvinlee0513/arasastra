CREATE OR REPLACE FUNCTION public.get_student_flashcard_review_queue(_limit integer DEFAULT 40)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    SELECT c.id AS card_id, c.front_text, c.back_text,
           c.front_content, c.back_content, c.sort_order,
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
$function$;

REVOKE ALL ON FUNCTION public.get_student_flashcard_review_queue(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_flashcard_review_queue(integer) TO authenticated, service_role;