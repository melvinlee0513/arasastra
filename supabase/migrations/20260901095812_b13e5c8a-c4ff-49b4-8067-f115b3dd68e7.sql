-- ═══════════════════════════════════════════════════════════════════════════
-- The Phase 1-5 feature flags are enforced on the server, not only in the router.
--
-- Scope: CENTRE-SCOPED, and the existing system. Flags live in
-- `tuition_centers.feature_flags` (jsonb, 20260712150345) and are read by
-- `useFeatureEnabled` on the client and `tenant_feature_enabled(center, flag,
-- default)` in the database (20260803024307). Nothing new is introduced here —
-- a second flag system is exactly what a pilot does not need, and a hardcoded
-- centre id would make the pilot impossible to end.
--
-- What was missing: liveQuizMultiplayer, quizAnalytics and questionBank were
-- gated ONLY by `FeatureRoute` in the client router. That hides the screens; it
-- does not stop anyone calling the RPCs from a console. FeatureRoute's own
-- comment says as much: "Because the gate is client-side only, any flag that
-- also represents a commercial entitlement MUST also be enforced server-side."
--
-- Each guard sits at its feature's single entry point and defaults to FALSE,
-- matching useFeatureEnabled, so an unset flag is off in both places and a
-- centre is enabled by one UPDATE.
--
-- Live sessions already in progress are deliberately NOT killed: creation is
-- guarded, so turning the flag off stops new games while a class mid-quiz
-- finishes and the session ages out on its own six-hour expiry. A kill switch
-- that yanks the screen out from under thirty students is worse than the
-- feature it is switching off.
--
-- `expandedQuestionTypes` is deliberately NOT enforced here. The natural place
-- would be a CHECK or trigger on quiz_questions.question_type, but the builder
-- rewrites a quiz's questions on every save: a tutor editing the title of a
-- quiz that already contains a numeric question would then be unable to save
-- it at all. It gates authoring in the UI (the type picker offers only the
-- classic types when off) and nothing else — stated plainly rather than
-- implied to be a server guard it is not.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_live_quiz_session(
  _quiz_id              uuid,
  _max_players          integer DEFAULT 30,
  _show_player_names    boolean DEFAULT true,
  _seconds_per_question integer DEFAULT 20,
  _randomize            boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_quiz   public.quizzes%ROWTYPE;
  v_code   text;
  v_qids   uuid[];
  v_id     uuid;
  v_try    int := 0;
  v_bad    text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_quiz FROM public.quizzes WHERE id = _quiz_id;
  IF v_quiz.id IS NULL THEN
    RAISE EXCEPTION 'quiz_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.can_manage_class(v_quiz.class_id) THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE = '42501';
  END IF;

  -- Feature gate, server side. FeatureRoute hides the screens; this is what
  -- makes the flag mean the backend is off rather than merely unlinked. Default
  -- false, matching useFeatureEnabled, so an unset flag is off in both places.
  IF NOT public.tenant_feature_enabled(v_quiz.center_id, 'liveQuizMultiplayer', false) THEN
    RAISE EXCEPTION 'feature_disabled: liveQuizMultiplayer' USING ERRCODE = '42501';
  END IF;
  IF v_quiz.status <> 'published' THEN
    RAISE EXCEPTION 'quiz_not_published' USING ERRCODE = '22023';
  END IF;

  -- A type the live engine cannot grade must stop hosting HERE, with the type
  -- named, rather than being dropped from the game or failing mid-session.
  SELECT string_agg(DISTINCT q.question_type, ', ')
    INTO v_bad
    FROM public.quiz_questions q
   WHERE q.quiz_id = _quiz_id
     AND q.question_type NOT IN ('mcq', 'multiple_choice', 'true_false',
                                 'multiple_select', 'short_answer',
                                 'numeric', 'fill_blank');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'unsupported_live_question_type: %', v_bad USING ERRCODE = '22023';
  END IF;

  -- Freeze the whole quiz, in order.
  SELECT COALESCE(array_agg(q.id ORDER BY
           CASE WHEN _randomize THEN md5(random()::text) END NULLS LAST,
           COALESCE(q.order_index, q.sort_order, 0), q.id), '{}')
    INTO v_qids
    FROM public.quiz_questions q
   WHERE q.quiz_id = _quiz_id;

  IF COALESCE(array_length(v_qids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'quiz_has_no_playable_questions' USING ERRCODE = '22023';
  END IF;

  LOOP
    v_try := v_try + 1;
    v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    BEGIN
      INSERT INTO public.live_quiz_sessions (
        center_id, class_id, quiz_id, host_user_id, game_code,
        question_ids, max_players, show_player_names, seconds_per_question
      ) VALUES (
        v_quiz.center_id, v_quiz.class_id, _quiz_id, v_uid, v_code,
        v_qids,
        LEAST(GREATEST(COALESCE(_max_players, 30), 1), 200),
        COALESCE(_show_player_names, true),
        LEAST(GREATEST(COALESCE(_seconds_per_question, 20), 5), 300)
      )
      RETURNING id INTO v_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_try >= 12 THEN
        RAISE EXCEPTION 'game_code_unavailable' USING ERRCODE = '55000';
      END IF;
    END;
  END LOOP;

  RETURN jsonb_build_object('id', v_id, 'game_code', v_code);
END $$;
-- ─── Analytics: one guard covers all five RPCs ─────────────────────────────
-- Every analytics function resolves its quiz through this. Body unchanged
-- except for the flag check.
CREATE OR REPLACE FUNCTION public._quiz_for_analytics(_quiz_id uuid)
RETURNS public.quizzes
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_q public.quizzes%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_q FROM public.quizzes WHERE id = _quiz_id;
  IF v_q.id IS NULL THEN
    RAISE EXCEPTION 'quiz_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_q.class_id IS NULL OR NOT public.can_manage_class(v_q.class_id) THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE = '42501';
  END IF;
  IF NOT public.tenant_feature_enabled(v_q.center_id, 'quizAnalytics', false) THEN
    RAISE EXCEPTION 'feature_disabled: quizAnalytics' USING ERRCODE = '42501';
  END IF;
  RETURN v_q;
END $$;

-- ─── Question bank: one guard covers the RPCs and the RLS policies ─────────
-- The bank's SELECT policies call this too, so a centre with the flag off has
-- no readable bank rows at all, not merely no route to them.
CREATE OR REPLACE FUNCTION public._can_use_question_bank(_center_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT _center_id IS NOT NULL
    AND public.tenant_feature_enabled(_center_id, 'questionBank', false)
    AND (
      public._admin_can_manage_center(_center_id)
      OR EXISTS (
        SELECT 1
          FROM public.class_tutors ct
          JOIN public.classes c ON c.id = ct.class_id
         WHERE ct.tutor_user_id = auth.uid()
           AND c.center_id = _center_id
      )
    )
$$;

-- Every bank RPC resolves its centre through this rather than through
-- _can_use_question_bank, so guarding only the predicate above would have left
-- list_question_bank and the eight others open. Both entry points are guarded:
-- the predicate for the RLS policies, this for the RPCs.
CREATE OR REPLACE FUNCTION public._my_question_bank_center()
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT r.center_id INTO v_id
    FROM public.user_roles r
   WHERE r.user_id = auth.uid()
     AND r.role IN ('admin', 'superadmin')
     AND r.center_id IS NOT NULL
   LIMIT 1;

  IF v_id IS NULL THEN
    SELECT c.center_id INTO v_id
      FROM public.class_tutors ct
      JOIN public.classes c ON c.id = ct.class_id
     WHERE ct.tutor_user_id = auth.uid()
     LIMIT 1;
  END IF;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'no_question_bank_access' USING ERRCODE = '42501';
  END IF;

  IF NOT public.tenant_feature_enabled(v_id, 'questionBank', false) THEN
    RAISE EXCEPTION 'feature_disabled: questionBank' USING ERRCODE = '42501';
  END IF;

  RETURN v_id;
END $$;

-- ─── Grants ────────────────────────────────────────────────────────────────
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.create_live_quiz_session(uuid, integer, boolean, integer, boolean)',
    'public._can_use_question_bank(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
  END LOOP;
  -- _quiz_for_analytics is internal: the five public analytics RPCs call it as
  -- definer. It was never granted and is not granted now.
  EXECUTE 'REVOKE ALL ON FUNCTION public._quiz_for_analytics(uuid) FROM PUBLIC, anon, authenticated';
END $$;

COMMENT ON FUNCTION public.tenant_feature_enabled(uuid, text, boolean) IS
  'The one feature-flag read in the database. Flags are centre-scoped, stored '
  'in tuition_centers.feature_flags, and shared with the client''s '
  'useFeatureEnabled. Enable a feature for one centre with an UPDATE against '
  'that centre''s row — never by hardcoding a centre id or slug in code.';