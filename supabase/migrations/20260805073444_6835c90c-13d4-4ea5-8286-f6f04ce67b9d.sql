-- ─── Deck-level study progress (one row per student per deck) ───────────────
CREATE TABLE public.flashcard_deck_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL REFERENCES public.tuition_centers(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  deck_id uuid NOT NULL REFERENCES public.flashcard_decks(id) ON DELETE CASCADE,
  student_user_id uuid NOT NULL,
  queue jsonb NOT NULL DEFAULT '[]'::jsonb,
  completed_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  reviewed_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  current_card_id uuid,
  progress_revision integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_studied_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT flashcard_deck_progress_unique UNIQUE (student_user_id, deck_id)
);

CREATE INDEX flashcard_deck_progress_student_class_idx
  ON public.flashcard_deck_progress (student_user_id, class_id);

GRANT SELECT ON public.flashcard_deck_progress TO authenticated;
GRANT ALL ON public.flashcard_deck_progress TO service_role;

ALTER TABLE public.flashcard_deck_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "flashcard_deck_progress own rows readable"
  ON public.flashcard_deck_progress FOR SELECT TO authenticated
  USING (student_user_id = auth.uid());

CREATE TRIGGER flashcard_deck_progress_touch
  BEFORE UPDATE ON public.flashcard_deck_progress
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- ─── Shared student-side guard ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._flashcard_student_deck(_deck_id uuid)
RETURNS public.flashcard_decks
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_deck public.flashcard_decks;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO v_deck FROM public.flashcard_decks WHERE id = _deck_id;
  IF v_deck.id IS NULL OR v_deck.status <> 'published' OR v_deck.class_id IS NULL THEN
    RAISE EXCEPTION 'deck not available';
  END IF;
  IF NOT public.is_enrolled_in_class(v_deck.class_id) THEN RAISE EXCEPTION 'not permitted'; END IF;
  IF v_deck.center_id IS DISTINCT FROM public.get_user_center(auth.uid()) THEN
    RAISE EXCEPTION 'not permitted';
  END IF;
  IF NOT public.tenant_feature_enabled(v_deck.center_id, 'flashcards') THEN
    RAISE EXCEPTION 'flashcards disabled';
  END IF;
  RETURN v_deck;
END;
$$;

REVOKE ALL ON FUNCTION public._flashcard_student_deck(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._flashcard_student_deck(uuid) TO authenticated;

-- Valid (non-empty) card IDs for a deck, in canonical sort order.
CREATE OR REPLACE FUNCTION public._flashcard_valid_card_ids(_deck_id uuid)
RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(array_agg(f.id ORDER BY f.sort_order, f.created_at), '{}'::uuid[])
  FROM public.flashcards f
  WHERE f.deck_id = _deck_id
    AND btrim(f.front_text) <> '' AND btrim(f.back_text) <> '';
$$;

REVOKE ALL ON FUNCTION public._flashcard_valid_card_ids(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._flashcard_valid_card_ids(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public._flashcard_progress_json(_row public.flashcard_deck_progress)
RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'deck_id', _row.deck_id,
    'queue', _row.queue,
    'completed_ids', _row.completed_ids,
    'reviewed_ids', _row.reviewed_ids,
    'current_card_id', _row.current_card_id,
    'progress_revision', _row.progress_revision,
    'started_at', _row.started_at,
    'last_studied_at', _row.last_studied_at,
    'completed_at', _row.completed_at
  );
$$;

-- ─── start_or_resume_flashcard_deck ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.start_or_resume_flashcard_deck(_deck_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_deck public.flashcard_decks;
  v_valid uuid[];
  v_row public.flashcard_deck_progress;
  v_completed uuid[];
  v_reviewed uuid[];
  v_queue uuid[];
BEGIN
  v_deck := public._flashcard_student_deck(_deck_id);
  v_valid := public._flashcard_valid_card_ids(_deck_id);

  SELECT * INTO v_row FROM public.flashcard_deck_progress
  WHERE student_user_id = auth.uid() AND deck_id = _deck_id FOR UPDATE;

  IF v_row.id IS NULL THEN
    INSERT INTO public.flashcard_deck_progress (
      center_id, class_id, deck_id, student_user_id, queue, completed_ids,
      reviewed_ids, current_card_id
    ) VALUES (
      v_deck.center_id, v_deck.class_id, _deck_id, auth.uid(),
      COALESCE(to_jsonb(v_valid), '[]'::jsonb), '[]'::jsonb, '[]'::jsonb,
      CASE WHEN array_length(v_valid, 1) > 0 THEN v_valid[1] ELSE NULL END
    )
    RETURNING * INTO v_row;
  ELSE
    -- Reconcile stored state against the deck's current cards.
    SELECT COALESCE(array_agg(x ORDER BY ord), '{}'::uuid[]) INTO v_completed
    FROM (
      SELECT (e.value #>> '{}')::uuid AS x, e.ordinality AS ord
      FROM jsonb_array_elements(v_row.completed_ids) WITH ORDINALITY e(value, ordinality)
    ) s WHERE s.x = ANY (v_valid);

    SELECT COALESCE(array_agg(x ORDER BY ord), '{}'::uuid[]) INTO v_reviewed
    FROM (
      SELECT (e.value #>> '{}')::uuid AS x, e.ordinality AS ord
      FROM jsonb_array_elements(v_row.reviewed_ids) WITH ORDINALITY e(value, ordinality)
    ) s WHERE s.x = ANY (v_valid);

    -- Keep stored queue order for surviving, still-incomplete cards…
    SELECT COALESCE(array_agg(x ORDER BY ord), '{}'::uuid[]) INTO v_queue
    FROM (
      SELECT (e.value #>> '{}')::uuid AS x, e.ordinality AS ord
      FROM jsonb_array_elements(v_row.queue) WITH ORDINALITY e(value, ordinality)
    ) s
    WHERE s.x = ANY (v_valid) AND NOT (s.x = ANY (v_completed));

    -- …then append any card not yet accounted for (newly added cards).
    v_queue := v_queue || (
      SELECT COALESCE(array_agg(c ORDER BY ord), '{}'::uuid[])
      FROM unnest(v_valid) WITH ORDINALITY t(c, ord)
      WHERE NOT (t.c = ANY (v_completed)) AND NOT (t.c = ANY (v_queue))
    );

    UPDATE public.flashcard_deck_progress SET
      center_id = v_deck.center_id,
      class_id = v_deck.class_id,
      queue = COALESCE(to_jsonb(v_queue), '[]'::jsonb),
      completed_ids = COALESCE(to_jsonb(v_completed), '[]'::jsonb),
      reviewed_ids = COALESCE(to_jsonb(v_reviewed), '[]'::jsonb),
      current_card_id = CASE
        WHEN array_length(v_queue, 1) IS NULL THEN NULL
        WHEN v_row.current_card_id = ANY (v_queue) THEN v_row.current_card_id
        ELSE v_queue[1] END,
      completed_at = CASE
        WHEN array_length(v_queue, 1) IS NULL AND array_length(v_valid, 1) > 0
          THEN COALESCE(v_row.completed_at, now())
        ELSE NULL END
    WHERE id = v_row.id
    RETURNING * INTO v_row;
  END IF;

  RETURN jsonb_build_object(
    'deck', public.get_flashcard_deck_for_study(_deck_id),
    'progress', public._flashcard_progress_json(v_row)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.start_or_resume_flashcard_deck(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_or_resume_flashcard_deck(uuid) TO authenticated;

-- ─── save_flashcard_progress ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.save_flashcard_progress(
  _deck_id uuid,
  _state jsonb,
  _expected_revision integer
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_deck public.flashcard_decks;
  v_valid uuid[];
  v_row public.flashcard_deck_progress;
  v_queue uuid[];
  v_completed uuid[];
  v_reviewed uuid[];
  v_current uuid;
BEGIN
  v_deck := public._flashcard_student_deck(_deck_id);
  v_valid := public._flashcard_valid_card_ids(_deck_id);

  IF _state IS NULL OR jsonb_typeof(_state) <> 'object' THEN
    RAISE EXCEPTION 'invalid progress payload';
  END IF;

  SELECT * INTO v_row FROM public.flashcard_deck_progress
  WHERE student_user_id = auth.uid() AND deck_id = _deck_id FOR UPDATE;

  IF v_row.id IS NULL THEN RAISE EXCEPTION 'flashcard_progress_conflict'; END IF;
  IF _expected_revision IS DISTINCT FROM v_row.progress_revision THEN
    RAISE EXCEPTION 'flashcard_progress_conflict';
  END IF;

  SELECT COALESCE(array_agg((e.value #>> '{}')::uuid ORDER BY e.ordinality), '{}'::uuid[])
  INTO v_queue
  FROM jsonb_array_elements(COALESCE(_state -> 'queue', '[]'::jsonb)) WITH ORDINALITY e(value, ordinality);

  SELECT COALESCE(array_agg((e.value #>> '{}')::uuid ORDER BY e.ordinality), '{}'::uuid[])
  INTO v_completed
  FROM jsonb_array_elements(COALESCE(_state -> 'completed_ids', '[]'::jsonb)) WITH ORDINALITY e(value, ordinality);

  SELECT COALESCE(array_agg((e.value #>> '{}')::uuid ORDER BY e.ordinality), '{}'::uuid[])
  INTO v_reviewed
  FROM jsonb_array_elements(COALESCE(_state -> 'reviewed_ids', '[]'::jsonb)) WITH ORDINALITY e(value, ordinality);

  IF EXISTS (SELECT 1 FROM unnest(v_queue || v_completed || v_reviewed) t(c)
             WHERE NOT (t.c = ANY (v_valid))) THEN
    RAISE EXCEPTION 'invalid card id';
  END IF;

  IF EXISTS (SELECT 1 FROM unnest(v_queue) t(c) WHERE t.c = ANY (v_completed)) THEN
    RAISE EXCEPTION 'invalid progress payload';
  END IF;

  v_current := NULLIF(_state ->> 'current_card_id', '')::uuid;
  IF v_current IS NOT NULL AND NOT (v_current = ANY (v_queue)) THEN
    v_current := CASE WHEN array_length(v_queue, 1) > 0 THEN v_queue[1] ELSE NULL END;
  END IF;
  IF v_current IS NULL AND array_length(v_queue, 1) > 0 THEN v_current := v_queue[1]; END IF;

  UPDATE public.flashcard_deck_progress SET
    queue = COALESCE(to_jsonb(v_queue), '[]'::jsonb),
    completed_ids = COALESCE(to_jsonb(v_completed), '[]'::jsonb),
    reviewed_ids = COALESCE(to_jsonb(v_reviewed), '[]'::jsonb),
    current_card_id = v_current,
    progress_revision = v_row.progress_revision + 1,
    last_studied_at = now(),
    completed_at = CASE
      WHEN array_length(v_queue, 1) IS NULL AND array_length(v_valid, 1) > 0
           AND array_length(v_completed, 1) = array_length(v_valid, 1)
        THEN COALESCE(v_row.completed_at, now())
      ELSE NULL END
  WHERE id = v_row.id
  RETURNING * INTO v_row;

  RETURN public._flashcard_progress_json(v_row);
END;
$$;

REVOKE ALL ON FUNCTION public.save_flashcard_progress(uuid, jsonb, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_flashcard_progress(uuid, jsonb, integer) TO authenticated;

-- ─── restart_flashcard_deck ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.restart_flashcard_deck(_deck_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_deck public.flashcard_decks;
  v_valid uuid[];
  v_row public.flashcard_deck_progress;
BEGIN
  v_deck := public._flashcard_student_deck(_deck_id);
  v_valid := public._flashcard_valid_card_ids(_deck_id);

  INSERT INTO public.flashcard_deck_progress (
    center_id, class_id, deck_id, student_user_id, queue, completed_ids,
    reviewed_ids, current_card_id, started_at, last_studied_at, completed_at
  ) VALUES (
    v_deck.center_id, v_deck.class_id, _deck_id, auth.uid(),
    COALESCE(to_jsonb(v_valid), '[]'::jsonb), '[]'::jsonb, '[]'::jsonb,
    CASE WHEN array_length(v_valid, 1) > 0 THEN v_valid[1] ELSE NULL END,
    now(), now(), NULL
  )
  ON CONFLICT (student_user_id, deck_id) DO UPDATE SET
    center_id = EXCLUDED.center_id,
    class_id = EXCLUDED.class_id,
    queue = EXCLUDED.queue,
    completed_ids = '[]'::jsonb,
    reviewed_ids = '[]'::jsonb,
    current_card_id = EXCLUDED.current_card_id,
    progress_revision = public.flashcard_deck_progress.progress_revision + 1,
    started_at = now(),
    last_studied_at = now(),
    completed_at = NULL
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'deck', public.get_flashcard_deck_for_study(_deck_id),
    'progress', public._flashcard_progress_json(v_row)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.restart_flashcard_deck(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restart_flashcard_deck(uuid) TO authenticated;

-- ─── Student deck list: expose study progress ───────────────────────────────
CREATE OR REPLACE FUNCTION public.list_class_flashcard_decks_for_student(_class_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_center uuid; v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT center_id INTO v_center FROM public.classes WHERE id = _class_id;
  IF v_center IS NULL THEN RAISE EXCEPTION 'class not found'; END IF;
  IF NOT public.is_enrolled_in_class(_class_id) THEN RAISE EXCEPTION 'not permitted'; END IF;
  IF v_center IS DISTINCT FROM public.get_user_center(auth.uid()) THEN RAISE EXCEPTION 'not permitted'; END IF;
  IF NOT public.tenant_feature_enabled(v_center, 'flashcards') THEN RAISE EXCEPTION 'flashcards disabled'; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', d.id, 'class_id', d.class_id, 'title', d.title, 'description', d.description,
      'display_order', d.display_order, 'published_at', d.published_at,
      'card_count', (SELECT count(*) FROM public.flashcards f
        WHERE f.deck_id = d.id AND btrim(f.front_text) <> '' AND btrim(f.back_text) <> ''),
      'completed', EXISTS (SELECT 1 FROM public.student_xp_events e
        WHERE e.student_user_id = auth.uid() AND e.event_type = 'flashcard_completed' AND e.source_id = d.id),
      'completed_card_count', COALESCE(jsonb_array_length(p.completed_ids), 0),
      'started', p.id IS NOT NULL,
      'run_completed_at', p.completed_at,
      'last_studied_at', p.last_studied_at
    ) ORDER BY d.display_order, d.created_at), '[]'::jsonb)
  INTO v_rows FROM public.flashcard_decks d
  LEFT JOIN public.flashcard_deck_progress p
    ON p.deck_id = d.id AND p.student_user_id = auth.uid()
  WHERE d.class_id = _class_id AND d.status = 'published' AND d.center_id = v_center;
  RETURN v_rows;
END;
$$;

-- ─── Harden completion RPC with an explicit tenant check ────────────────────
CREATE OR REPLACE FUNCTION public.record_flashcard_deck_completion(_deck_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_deck public.flashcard_decks; v_already boolean; v_res jsonb; v_valid uuid[]; v_done integer;
BEGIN
  v_deck := public._flashcard_student_deck(_deck_id);
  v_valid := public._flashcard_valid_card_ids(_deck_id);
  IF array_length(v_valid, 1) IS NULL THEN RAISE EXCEPTION 'deck not available'; END IF;

  SELECT COALESCE(jsonb_array_length(p.completed_ids), 0) INTO v_done
  FROM public.flashcard_deck_progress p
  WHERE p.deck_id = _deck_id AND p.student_user_id = auth.uid();

  IF COALESCE(v_done, 0) < array_length(v_valid, 1) THEN
    RAISE EXCEPTION 'deck not completed';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.student_xp_events e
    WHERE e.student_user_id = auth.uid() AND e.event_type = 'flashcard_completed' AND e.source_id = _deck_id)
  INTO v_already;
  IF v_already THEN
    RETURN jsonb_build_object('awarded', false, 'reason', 'already_completed');
  END IF;

  v_res := public.record_learning_activity('flashcard_completed', 25, _deck_id, 'flashcard_deck');
  RETURN jsonb_build_object('awarded', true, 'activity', v_res);
END;
$$;

REVOKE ALL ON FUNCTION public.record_flashcard_deck_completion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_flashcard_deck_completion(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.list_class_flashcard_decks_for_student(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_class_flashcard_decks_for_student(uuid) TO authenticated;