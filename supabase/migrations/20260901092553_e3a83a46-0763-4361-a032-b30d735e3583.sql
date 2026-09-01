-- ═══════════════════════════════════════════════════════════════════════════
-- Live multiplayer quiz — Phase 2 hardening + host control.
--
-- Additive and idempotent. It layers onto 20260830000000_live_quiz_sessions
-- and can be run twice safely; nothing here drops data.
--
-- Contents
--   1. SECURITY  — close the direct answer-key read on quiz_options
--   2. Roster    — participant_count correctness, 'removed' status
--   3. Lifecycle — expires_at, stale-session expiry
--   4. Host      — kick, response distribution, player detail, summary
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. ANSWER-KEY SECRECY  (release blocker)
--
-- get_live_quiz_snapshot carefully returns is_correct = NULL until the host
-- reveals. That redaction was defeatable in one line from a browser console:
--
--     supabase.from('quiz_options')
--             .select('question_id,option_text,is_correct')
--
-- because "quiz_options read for enrolled or staff" grants every enrolled
-- student SELECT on the row, and the session row — which participants can read
-- so Realtime works — carries the frozen question_ids for the whole game. A
-- player could therefore read every correct answer before the first question
-- opened.
--
-- RLS is row-level and cannot help here. Column privileges can: revoke the
-- table-wide SELECT and grant back every column EXCEPT is_correct. The RLS
-- policies still decide which ROWS are visible; this decides which COLUMNS.
--
-- Safe because nothing outside the database reads this table directly — the
-- builder, the solo attempt path, the results pages and the live snapshot all
-- go through SECURITY DEFINER functions, which run as the owner and are
-- unaffected by a grant made to `authenticated`.
-- ═══════════════════════════════════════════════════════════════════════════
-- The allowed column list is built from the catalogue rather than written out,
-- so this cannot silently no-op on a deployment whose quiz_options has one
-- column more or fewer than the author expected. Hard-coding the list once
-- rolled the REVOKE back on a missing column and left the key readable.
DO $$
DECLARE
  v_cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO v_cols
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'quiz_options'
     AND column_name <> 'is_correct';

  IF v_cols IS NULL THEN
    RAISE EXCEPTION 'quiz_options not found — refusing to leave the answer key readable';
  END IF;

  -- Table-level SELECT implies every column, so the revoke has to come first.
  EXECUTE 'REVOKE SELECT ON public.quiz_options FROM authenticated';
  EXECUTE format('GRANT SELECT (%s) ON public.quiz_options TO authenticated', v_cols);

  -- anon never had a row-visibility policy on this table; keep it that way.
  EXECUTE 'REVOKE SELECT ON public.quiz_options FROM anon';

  -- Prove it took, in the same transaction that made the change.
  IF has_column_privilege('authenticated', 'public.quiz_options', 'is_correct', 'SELECT') THEN
    RAISE EXCEPTION 'quiz_options.is_correct is still selectable by authenticated';
  END IF;
END $$;

COMMENT ON COLUMN public.quiz_options.is_correct IS
  'Answer key. NOT selectable by the authenticated role — read it only through a '
  'SECURITY DEFINER function that has already decided the caller may see it '
  '(get_live_quiz_snapshot after reveal, get_quiz_definition_for_manager, the '
  'grading RPCs). Re-granting this column to authenticated re-opens a direct '
  'answer-key read for every enrolled student.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. ROSTER CORRECTNESS
-- ═══════════════════════════════════════════════════════════════════════════

-- 'removed' = kicked by the host. Distinct from 'left' (self-initiated) so the
-- host roster can say which it was, and so a kick cannot be undone by rejoining.
DO $$
BEGIN
  ALTER TABLE public.live_quiz_participants
    DROP CONSTRAINT IF EXISTS live_quiz_participants_status_ck;
  ALTER TABLE public.live_quiz_participants
    ADD CONSTRAINT live_quiz_participants_status_ck
    CHECK (status IN ('joined', 'left', 'removed'));
END $$;

/**
 * Recount a session's live roster and answered tally from the child tables.
 *
 * The denormalised counters on the session row are what Realtime broadcasts,
 * so they must never drift. Every path that can change membership calls this
 * instead of doing arithmetic, which is what a += on join and no -= on leave
 * got wrong.
 */
CREATE OR REPLACE FUNCTION public._resync_live_quiz_counts(_session_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_idx int;
BEGIN
  SELECT current_question_index INTO v_idx
    FROM public.live_quiz_sessions WHERE id = _session_id;

  UPDATE public.live_quiz_sessions s
     SET participant_count = (
           SELECT count(*) FROM public.live_quiz_participants p
            WHERE p.session_id = _session_id AND p.status = 'joined'
         ),
         answered_count = CASE WHEN v_idx IS NULL OR v_idx < 0 THEN 0 ELSE (
           SELECT count(*)
             FROM public.live_quiz_answers a
             JOIN public.live_quiz_participants p ON p.id = a.participant_id
            WHERE a.session_id = _session_id
              AND a.question_index = v_idx
              AND p.status = 'joined'
         ) END
   WHERE s.id = _session_id;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. SESSION LIFECYCLE — expiry
--
-- A lobby nobody starts must not hold its six-digit code forever. Rather than
-- adding a scheduler, expiry is enforced on read/write (join and advance both
-- check it) and a single idempotent sweep function is provided for whatever
-- cron the deployment already has. Nothing is deleted: sessions are cancelled,
-- which frees the code through the existing partial unique index.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.live_quiz_sessions
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- Existing rows get a deadline relative to when they were made.
UPDATE public.live_quiz_sessions
   SET expires_at = created_at + interval '6 hours'
 WHERE expires_at IS NULL;

ALTER TABLE public.live_quiz_sessions
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '6 hours');

CREATE INDEX IF NOT EXISTS live_quiz_sessions_expiry_idx
  ON public.live_quiz_sessions (expires_at)
  WHERE status NOT IN ('completed', 'cancelled');

/**
 * Cancel live sessions that have outlived their window.
 *
 * Idempotent and cheap — it only ever touches rows that are already past
 * expires_at and not yet finished. Returns how many it closed so a caller can
 * log it. Safe to run on any schedule, or never: join and advance enforce the
 * same deadline inline, so an unswept row still cannot be played.
 */
CREATE OR REPLACE FUNCTION public.expire_stale_live_quiz_sessions()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_n int;
BEGIN
  UPDATE public.live_quiz_sessions
     SET status = 'cancelled',
         completed_at = COALESCE(completed_at, now()),
         state_revision = state_revision + 1
   WHERE status NOT IN ('completed', 'cancelled')
     AND expires_at IS NOT NULL
     AND expires_at < now();
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. JOIN — reject an expired session, and never revive a removed player.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.join_live_quiz_session(_game_code text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_s       public.live_quiz_sessions%ROWTYPE;
  v_p       public.live_quiz_participants%ROWTYPE;
  v_pid     uuid;
  v_name    text;
  v_avatar  text;
  v_count   int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF _game_code !~ '^[0-9]{6}$' THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_s
    FROM public.live_quiz_sessions
   WHERE game_code = _game_code
     AND status NOT IN ('completed', 'cancelled')
   FOR UPDATE;

  -- One generic error for "no such code", "finished" and "not yours", so the
  -- code space cannot be probed for another centre's live games.
  IF v_s.id IS NULL THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_s.expires_at IS NOT NULL AND v_s.expires_at < now() THEN
    RAISE EXCEPTION 'session_expired' USING ERRCODE = '22023';
  END IF;
  IF NOT public.is_enrolled_in_class(v_s.class_id) THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_p
    FROM public.live_quiz_participants
   WHERE session_id = v_s.id AND user_id = v_uid;

  IF v_p.id IS NOT NULL THEN
    -- A host removal is final for this session; rejoining must not undo it.
    IF v_p.status = 'removed' THEN
      RAISE EXCEPTION 'removed_by_host' USING ERRCODE = '42501';
    END IF;
    -- Reconnect: same row, marked active again.
    UPDATE public.live_quiz_participants
       SET status = 'joined', last_seen_at = now()
     WHERE id = v_p.id;
    PERFORM public._resync_live_quiz_counts(v_s.id);
    UPDATE public.live_quiz_sessions
       SET state_revision = state_revision + 1 WHERE id = v_s.id;
    RETURN jsonb_build_object('session_id', v_s.id, 'participant_id', v_p.id, 'rejoined', true);
  END IF;

  -- New players may only arrive while the game is still in the lobby.
  IF v_s.status <> 'lobby' THEN
    RAISE EXCEPTION 'session_already_started' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_count
    FROM public.live_quiz_participants
   WHERE session_id = v_s.id AND status = 'joined';
  IF v_count >= v_s.max_players THEN
    RAISE EXCEPTION 'session_full' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(NULLIF(TRIM(p.full_name), ''), 'Student'), p.avatar_url
    INTO v_name, v_avatar
    FROM public.profiles p WHERE p.user_id = v_uid;

  INSERT INTO public.live_quiz_participants (
    session_id, center_id, user_id, display_name, avatar_url
  ) VALUES (
    v_s.id, v_s.center_id, v_uid, COALESCE(v_name, 'Student'), v_avatar
  )
  RETURNING id INTO v_pid;

  PERFORM public._resync_live_quiz_counts(v_s.id);
  UPDATE public.live_quiz_sessions
     SET state_revision = state_revision + 1 WHERE id = v_s.id;

  RETURN jsonb_build_object('session_id', v_s.id, 'participant_id', v_pid, 'rejoined', false);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. LEAVE — decrement the roster it used to leave stale.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.leave_live_quiz_session(_session_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  -- A removed player stays removed; leaving does not launder the status.
  UPDATE public.live_quiz_participants
     SET status = 'left', last_seen_at = now()
   WHERE session_id = _session_id AND user_id = v_uid AND status = 'joined';
  PERFORM public._resync_live_quiz_counts(_session_id);
  UPDATE public.live_quiz_sessions
     SET state_revision = state_revision + 1
   WHERE id = _session_id;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. REMOVE PARTICIPANT — host only.
--
-- Server-authorized through the same can_manage_class the rest of hosting
-- uses. The removed row keeps its score history but is excluded from the
-- roster, the tally and — critically — from submitting any further answer.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.remove_live_quiz_participant(
  _session_id     uuid,
  _participant_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_s   public.live_quiz_sessions%ROWTYPE;
  v_p   public.live_quiz_participants%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_s FROM public.live_quiz_sessions WHERE id = _session_id FOR UPDATE;
  IF v_s.id IS NULL THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.can_manage_class(v_s.class_id) THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE = '42501';
  END IF;
  IF v_s.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'session_finished' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_p FROM public.live_quiz_participants
   WHERE id = _participant_id AND session_id = _session_id
   FOR UPDATE;
  IF v_p.id IS NULL THEN
    RAISE EXCEPTION 'not_a_participant' USING ERRCODE = 'P0002';
  END IF;

  -- Idempotent: removing twice is a no-op, not an error.
  IF v_p.status <> 'removed' THEN
    UPDATE public.live_quiz_participants
       SET status = 'removed', last_seen_at = now()
     WHERE id = _participant_id;
  END IF;

  PERFORM public._resync_live_quiz_counts(_session_id);
  UPDATE public.live_quiz_sessions
     SET state_revision = state_revision + 1
   WHERE id = _session_id;

  RETURN jsonb_build_object('removed', true, 'participant_id', _participant_id);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. SUBMIT — a player who left or was removed can no longer score.
--    (Everything else is unchanged from the original; only the status gate,
--    the expiry gate and the counter resync are new.)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.submit_live_quiz_answer(
  _session_id      uuid,
  _question_index  integer,
  _option_id       uuid DEFAULT NULL,
  _answer_text     text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_s        public.live_quiz_sessions%ROWTYPE;
  v_p        public.live_quiz_participants%ROWTYPE;
  v_qid      uuid;
  v_q        public.quiz_questions%ROWTYPE;
  v_correct  boolean := false;
  v_points   int := 0;
  v_now      timestamptz := now();
  v_ms       int;
  v_existing public.live_quiz_answers%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_s FROM public.live_quiz_sessions WHERE id = _session_id;
  IF v_s.id IS NULL THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_p FROM public.live_quiz_participants
   WHERE session_id = _session_id AND user_id = v_uid
   FOR UPDATE;
  IF v_p.id IS NULL THEN
    RAISE EXCEPTION 'not_a_participant' USING ERRCODE = '42501';
  END IF;
  IF v_p.status = 'removed' THEN
    RAISE EXCEPTION 'removed_by_host' USING ERRCODE = '42501';
  END IF;
  IF v_p.status <> 'joined' THEN
    RAISE EXCEPTION 'not_a_participant' USING ERRCODE = '42501';
  END IF;

  -- Only the question the server currently has open may be answered. This is
  -- what stops a client answering ahead, or after the window closed.
  IF v_s.status <> 'question_open' THEN
    RAISE EXCEPTION 'question_not_open' USING ERRCODE = '22023';
  END IF;
  IF _question_index IS DISTINCT FROM v_s.current_question_index THEN
    RAISE EXCEPTION 'question_not_open' USING ERRCODE = '22023';
  END IF;
  IF v_s.question_ends_at IS NOT NULL AND v_now > v_s.question_ends_at THEN
    RAISE EXCEPTION 'question_expired' USING ERRCODE = '22023';
  END IF;

  -- Idempotency: an existing row wins and is echoed back unchanged.
  SELECT * INTO v_existing FROM public.live_quiz_answers
   WHERE participant_id = v_p.id AND question_index = _question_index;
  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('accepted', false, 'duplicate', true);
  END IF;

  v_qid := v_s.question_ids[_question_index + 1];
  SELECT * INTO v_q FROM public.quiz_questions WHERE id = v_qid;
  IF v_q.id IS NULL THEN
    RAISE EXCEPTION 'question_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_q.question_type = 'true_false' THEN
    IF lower(COALESCE(_answer_text, '')) NOT IN ('true', 'false') THEN
      RAISE EXCEPTION 'invalid_answer' USING ERRCODE = '22023';
    END IF;
    SELECT COALESCE(bool_or(o.is_correct AND lower(TRIM(o.option_text)) = lower(_answer_text)), false)
      INTO v_correct
      FROM public.quiz_options o WHERE o.question_id = v_qid;
  ELSE
    -- The option must belong to THIS question, or it is not a valid answer.
    IF _option_id IS NULL THEN
      RAISE EXCEPTION 'invalid_answer' USING ERRCODE = '22023';
    END IF;
    SELECT o.is_correct INTO v_correct
      FROM public.quiz_options o
     WHERE o.id = _option_id AND o.question_id = v_qid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid_answer' USING ERRCODE = '22023';
    END IF;
    v_correct := COALESCE(v_correct, false);
  END IF;

  v_ms := GREATEST(0, (EXTRACT(EPOCH FROM (v_now - COALESCE(v_s.question_started_at, v_now))) * 1000)::int);

  IF v_correct THEN
    v_points := public._live_quiz_points(
      COALESCE(v_q.points, 1), v_s.question_started_at, v_s.question_ends_at, v_now);
  END IF;

  INSERT INTO public.live_quiz_answers (
    session_id, participant_id, question_id, question_index,
    selected_option_id, answer_text, is_correct, points_awarded, response_time_ms, answered_at
  ) VALUES (
    _session_id, v_p.id, v_qid, _question_index,
    CASE WHEN v_q.question_type = 'true_false' THEN NULL ELSE _option_id END,
    CASE WHEN v_q.question_type = 'true_false' THEN lower(_answer_text) ELSE NULL END,
    v_correct, v_points, v_ms, v_now
  )
  ON CONFLICT (participant_id, question_index) DO NOTHING;

  IF NOT FOUND THEN
    -- Lost a concurrent race with our own retry; the first write stands.
    RETURN jsonb_build_object('accepted', false, 'duplicate', true);
  END IF;

  UPDATE public.live_quiz_participants
     SET score         = score + v_points,
         correct_count = correct_count + CASE WHEN v_correct THEN 1 ELSE 0 END,
         streak        = CASE WHEN v_correct THEN streak + 1 ELSE 0 END,
         best_streak   = GREATEST(best_streak, CASE WHEN v_correct THEN streak + 1 ELSE 0 END),
         total_time_ms = total_time_ms + v_ms,
         last_seen_at  = v_now
   WHERE id = v_p.id;

  PERFORM public._resync_live_quiz_counts(_session_id);

  -- Correctness is deliberately NOT returned here; the client learns it at
  -- reveal, through the snapshot.
  RETURN jsonb_build_object('accepted', true, 'duplicate', false);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. ADVANCE — refuse to drive an expired session, and push the deadline out
--    while a host is actively running the game.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.advance_live_quiz_session(
  _session_id        uuid,
  _action            text,
  _expected_revision integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_s      public.live_quiz_sessions%ROWTYPE;
  v_total  int;
  v_next   int;
  -- A running game keeps itself alive; only an abandoned one ages out.
  v_extend timestamptz := now() + interval '6 hours';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_s FROM public.live_quiz_sessions WHERE id = _session_id FOR UPDATE;
  IF v_s.id IS NULL THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.can_manage_class(v_s.class_id) THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE = '42501';
  END IF;
  IF v_s.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'session_finished' USING ERRCODE = '22023';
  END IF;
  -- Cancelling an expired session is still allowed, so a host can tidy up.
  IF v_s.expires_at IS NOT NULL AND v_s.expires_at < now() AND _action <> 'cancel' THEN
    RAISE EXCEPTION 'session_expired' USING ERRCODE = '22023';
  END IF;
  IF _expected_revision IS NOT NULL AND _expected_revision <> v_s.state_revision THEN
    RAISE EXCEPTION 'session_state_conflict' USING ERRCODE = '40001';
  END IF;

  v_total := COALESCE(array_length(v_s.question_ids, 1), 0);

  IF _action = 'cancel' THEN
    UPDATE public.live_quiz_sessions
       SET status = 'cancelled', completed_at = now(), state_revision = state_revision + 1
     WHERE id = _session_id;
    RETURN jsonb_build_object('status', 'cancelled');
  END IF;

  IF _action = 'start' THEN
    IF v_s.status <> 'lobby' THEN
      RAISE EXCEPTION 'invalid_transition' USING ERRCODE = '22023';
    END IF;
    UPDATE public.live_quiz_sessions
       SET status = 'question_open',
           current_question_index = 0,
           question_started_at = now(),
           question_ends_at = now() + make_interval(secs => v_s.seconds_per_question),
           answered_count = 0,
           started_at = COALESCE(started_at, now()),
           expires_at = v_extend,
           state_revision = state_revision + 1
     WHERE id = _session_id;
    RETURN jsonb_build_object('status', 'question_open', 'index', 0);
  END IF;

  IF _action = 'lock' THEN
    IF v_s.status <> 'question_open' THEN
      RAISE EXCEPTION 'invalid_transition' USING ERRCODE = '22023';
    END IF;
    UPDATE public.live_quiz_sessions
       SET status = 'question_locked', expires_at = v_extend,
           state_revision = state_revision + 1
     WHERE id = _session_id;
    RETURN jsonb_build_object('status', 'question_locked');
  END IF;

  IF _action = 'reveal' THEN
    IF v_s.status NOT IN ('question_open', 'question_locked') THEN
      RAISE EXCEPTION 'invalid_transition' USING ERRCODE = '22023';
    END IF;
    UPDATE public.live_quiz_sessions
       SET status = 'answer_reveal', expires_at = v_extend,
           state_revision = state_revision + 1
     WHERE id = _session_id;
    RETURN jsonb_build_object('status', 'answer_reveal');
  END IF;

  IF _action = 'leaderboard' THEN
    IF v_s.status <> 'answer_reveal' THEN
      RAISE EXCEPTION 'invalid_transition' USING ERRCODE = '22023';
    END IF;
    UPDATE public.live_quiz_sessions
       SET status = 'leaderboard', expires_at = v_extend,
           state_revision = state_revision + 1
     WHERE id = _session_id;
    RETURN jsonb_build_object('status', 'leaderboard');
  END IF;

  IF _action = 'next' THEN
    IF v_s.status NOT IN ('answer_reveal', 'leaderboard') THEN
      RAISE EXCEPTION 'invalid_transition' USING ERRCODE = '22023';
    END IF;
    v_next := v_s.current_question_index + 1;
    IF v_next >= v_total THEN
      UPDATE public.live_quiz_sessions
         SET status = 'completed', completed_at = now(), state_revision = state_revision + 1
       WHERE id = _session_id;
      RETURN jsonb_build_object('status', 'completed');
    END IF;
    UPDATE public.live_quiz_sessions
       SET status = 'question_open',
           current_question_index = v_next,
           question_started_at = now(),
           question_ends_at = now() + make_interval(secs => v_s.seconds_per_question),
           answered_count = 0,
           expires_at = v_extend,
           state_revision = state_revision + 1
     WHERE id = _session_id;
    RETURN jsonb_build_object('status', 'question_open', 'index', v_next);
  END IF;

  IF _action = 'complete' THEN
    -- Only from a state where the game is genuinely over-able; a stray
    -- 'complete' from the lobby used to end a game that never started.
    IF v_s.status NOT IN ('question_open', 'question_locked', 'answer_reveal', 'leaderboard') THEN
      RAISE EXCEPTION 'invalid_transition' USING ERRCODE = '22023';
    END IF;
    UPDATE public.live_quiz_sessions
       SET status = 'completed', completed_at = now(), state_revision = state_revision + 1
     WHERE id = _session_id;
    RETURN jsonb_build_object('status', 'completed');
  END IF;

  RAISE EXCEPTION 'invalid_action' USING ERRCODE = '22023';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. SNAPSHOT — same redaction rules, plus host-only operational detail.
--
-- New, and HOST ONLY (is_host is derived from can_manage_class, never sent):
--   session.summary        players / questions / average score / accuracy
--   question_stats         per-option response counts + the answered tally
--   players[].score        so the host can see who is where
--   players[].answered     answered the CURRENT question
--   players[].last_seen_at honest "last seen", never a fake "online"
--
-- A player's payload is byte-for-byte what it was: no counts, no other
-- player's answer, no is_correct before reveal.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_live_quiz_snapshot(_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_s         public.live_quiz_sessions%ROWTYPE;
  v_is_host   boolean;
  v_pid       uuid;
  v_pstatus   text;
  v_quiz      public.quizzes%ROWTYPE;
  v_qid       uuid;
  v_question  jsonb := NULL;
  v_reveal    boolean;
  v_me        jsonb := NULL;
  v_board     jsonb;
  v_players   jsonb;
  v_my_answer jsonb := NULL;
  v_stats     jsonb := NULL;
  v_summary   jsonb := NULL;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_s FROM public.live_quiz_sessions WHERE id = _session_id;
  IF v_s.id IS NULL THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_is_host := public.can_manage_class(v_s.class_id);
  SELECT id, status INTO v_pid, v_pstatus
    FROM public.live_quiz_participants
   WHERE session_id = v_s.id AND user_id = v_uid;

  IF NOT v_is_host AND v_pid IS NULL THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_quiz FROM public.quizzes WHERE id = v_s.quiz_id;
  v_reveal := v_s.status IN ('answer_reveal', 'leaderboard', 'completed');

  IF v_s.current_question_index >= 0
     AND v_s.current_question_index < COALESCE(array_length(v_s.question_ids, 1), 0) THEN
    v_qid := v_s.question_ids[v_s.current_question_index + 1];

    SELECT jsonb_build_object(
      'id', q.id,
      'index', v_s.current_question_index,
      'question', q.question,
      'question_type', CASE WHEN q.question_type = 'multiple_choice' THEN 'mcq' ELSE q.question_type END,
      'points', q.points,
      -- Explanation is reveal-only.
      'explanation', CASE WHEN v_reveal THEN q.explanation ELSE NULL END,
      'options', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'id', o.id,
                 'text', o.option_text,
                 -- The single most important line in this function.
                 'is_correct', CASE WHEN v_reveal THEN o.is_correct ELSE NULL END
               ) ORDER BY COALESCE(o.order_index, 0), o.id)
          FROM public.quiz_options o WHERE o.question_id = q.id
      ), '[]'::jsonb)
    ) INTO v_question
    FROM public.quiz_questions q
    WHERE q.id = v_qid;

    -- Response distribution — host only. Counts are aggregate; no row here
    -- identifies which player chose what.
    IF v_is_host THEN
      SELECT jsonb_build_object(
        'question_index', v_s.current_question_index,
        'answered', COALESCE((
          SELECT count(*) FROM public.live_quiz_answers a
            JOIN public.live_quiz_participants p ON p.id = a.participant_id
           WHERE a.session_id = v_s.id
             AND a.question_index = v_s.current_question_index
             AND p.status = 'joined'), 0),
        'options', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
                   'option_id', o.id,
                   'text', o.option_text,
                   'is_correct', o.is_correct,
                   'count', (
                     SELECT count(*) FROM public.live_quiz_answers a2
                       JOIN public.live_quiz_participants p2 ON p2.id = a2.participant_id
                      WHERE a2.session_id = v_s.id
                        AND a2.question_index = v_s.current_question_index
                        AND p2.status = 'joined'
                        AND (a2.selected_option_id = o.id
                             OR (a2.selected_option_id IS NULL
                                 AND lower(TRIM(o.option_text)) = a2.answer_text))
                   )
                 ) ORDER BY COALESCE(o.order_index, 0), o.id)
            FROM public.quiz_options o WHERE o.question_id = v_qid
        ), '[]'::jsonb)
      ) INTO v_stats;
    END IF;
  END IF;

  IF v_pid IS NOT NULL THEN
    SELECT jsonb_build_object(
      'participant_id', p.id,
      'display_name', p.display_name,
      'avatar_url', p.avatar_url,
      'score', p.score,
      'correct_count', p.correct_count,
      'streak', p.streak,
      'best_streak', p.best_streak,
      'status', p.status,
      'rank', (
        SELECT count(*) + 1 FROM public.live_quiz_participants o
         WHERE o.session_id = v_s.id
           AND o.status <> 'removed'
           AND (o.score > p.score
                OR (o.score = p.score AND o.correct_count > p.correct_count)
                OR (o.score = p.score AND o.correct_count = p.correct_count
                    AND o.total_time_ms < p.total_time_ms))
      )
    ) INTO v_me
    FROM public.live_quiz_participants p WHERE p.id = v_pid;

    -- Own answer for the current question — correctness only after reveal.
    IF v_s.current_question_index >= 0 THEN
      SELECT jsonb_build_object(
        'selected_option_id', a.selected_option_id,
        'answer_text', a.answer_text,
        'answered', true,
        'is_correct', CASE WHEN v_reveal THEN a.is_correct ELSE NULL END,
        'points_awarded', CASE WHEN v_reveal THEN a.points_awarded ELSE NULL END
      ) INTO v_my_answer
      FROM public.live_quiz_answers a
      WHERE a.participant_id = v_pid
        AND a.question_index = v_s.current_question_index;
    END IF;
  END IF;

  -- Leaderboard: authoritative order, computed here. Removed players drop off.
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.rank), '[]'::jsonb)
    INTO v_board
  FROM (
    SELECT p.id AS participant_id,
           CASE WHEN v_s.show_player_names OR p.user_id = v_uid OR v_is_host
                THEN p.display_name ELSE 'Player' END AS display_name,
           p.avatar_url, p.score, p.correct_count, p.best_streak,
           (p.user_id = v_uid) AS is_me,
           ROW_NUMBER() OVER (
             ORDER BY p.score DESC, p.correct_count DESC, p.total_time_ms ASC, p.joined_at ASC
           ) AS rank
      FROM public.live_quiz_participants p
     WHERE p.session_id = v_s.id
       AND p.status <> 'removed'
     ORDER BY rank
     LIMIT 50
  ) t;

  -- Roster. Operational columns (score / answered / last_seen_at) are host
  -- only; a player sees exactly the four fields it always saw.
  SELECT COALESCE(jsonb_agg(
           CASE WHEN v_is_host THEN jsonb_build_object(
             'participant_id', p.id,
             'display_name', p.display_name,
             'avatar_url', p.avatar_url,
             'status', p.status,
             'score', p.score,
             'correct_count', p.correct_count,
             'last_seen_at', p.last_seen_at,
             'joined_at', p.joined_at,
             'answered', EXISTS (
               SELECT 1 FROM public.live_quiz_answers a
                WHERE a.participant_id = p.id
                  AND a.question_index = v_s.current_question_index
             )
           ) ELSE jsonb_build_object(
             'participant_id', p.id,
             'display_name', CASE WHEN v_s.show_player_names OR p.user_id = v_uid
                                  THEN p.display_name ELSE 'Player' END,
             'avatar_url', p.avatar_url,
             'status', p.status
           ) END
           ORDER BY p.joined_at), '[]'::jsonb)
    INTO v_players
    FROM public.live_quiz_participants p
   WHERE p.session_id = v_s.id
     AND (v_is_host OR p.status <> 'removed');

  -- End-of-game summary. Derived, never stored, so it cannot drift.
  IF v_s.status = 'completed' THEN
    SELECT jsonb_build_object(
      'players', count(*),
      'questions', COALESCE(array_length(v_s.question_ids, 1), 0),
      'average_score', COALESCE(round(avg(p.score))::int, 0),
      'average_accuracy_pct', CASE
        WHEN COALESCE(array_length(v_s.question_ids, 1), 0) = 0 OR count(*) = 0 THEN NULL
        ELSE round(
          avg(p.correct_count)::numeric * 100 / array_length(v_s.question_ids, 1)
        )::int END
    ) INTO v_summary
    FROM public.live_quiz_participants p
   WHERE p.session_id = v_s.id AND p.status <> 'removed';
  END IF;

  RETURN jsonb_build_object(
    'session', jsonb_build_object(
      'id', v_s.id,
      'status', v_s.status,
      'game_code', CASE WHEN v_is_host THEN v_s.game_code ELSE NULL END,
      'class_id', v_s.class_id,
      'quiz_id', v_s.quiz_id,
      'quiz_title', v_quiz.title,
      'question_count', COALESCE(array_length(v_s.question_ids, 1), 0),
      'current_question_index', v_s.current_question_index,
      'question_started_at', v_s.question_started_at,
      'question_ends_at', v_s.question_ends_at,
      'seconds_per_question', v_s.seconds_per_question,
      'max_players', v_s.max_players,
      'show_player_names', v_s.show_player_names,
      'participant_count', v_s.participant_count,
      'answered_count', v_s.answered_count,
      'state_revision', v_s.state_revision,
      'started_at', v_s.started_at,
      'completed_at', v_s.completed_at,
      'expires_at', v_s.expires_at,
      'summary', v_summary,
      -- Authoritative clock, so a wrong browser clock cannot extend a question.
      'server_now', now()
    ),
    'is_host', v_is_host,
    -- Lets a removed player be told why, instead of a blank screen.
    'my_status', COALESCE(v_pstatus, CASE WHEN v_is_host THEN 'host' ELSE NULL END),
    'question', v_question,
    'question_stats', v_stats,
    'me', v_me,
    'my_answer', v_my_answer,
    'leaderboard', v_board,
    'players', v_players
  );
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. Grants for the new surface. Authenticated only, never anon.
-- ═══════════════════════════════════════════════════════════════════════════
-- Postgres grants EXECUTE to PUBLIC on every new function, and anon inherits
-- it. Revoking first is what keeps a SECURITY DEFINER function off the
-- unauthenticated surface — granting to authenticated does not take it away.
REVOKE ALL ON FUNCTION public.remove_live_quiz_participant(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_live_quiz_participant(uuid, uuid) TO authenticated;

-- Sweep + resync are operational, not client surface: no grant to
-- authenticated. They run as the owner from a cron job or a console session.
REVOKE ALL ON FUNCTION public.expire_stale_live_quiz_sessions()      FROM PUBLIC;
REVOKE ALL ON FUNCTION public._resync_live_quiz_counts(uuid)         FROM PUBLIC;

-- Re-assert the originals (CREATE OR REPLACE keeps grants, but this migration
-- must be safe to run against a database where the first one was edited).
GRANT EXECUTE ON FUNCTION public.join_live_quiz_session(text)                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_live_quiz_snapshot(uuid)                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_live_quiz_session(uuid, text, integer)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_live_quiz_answer(uuid, integer, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_live_quiz_session(uuid)                      TO authenticated;

-- One-time repair for any session created before _resync existed.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.live_quiz_sessions
            WHERE status NOT IN ('completed', 'cancelled')
  LOOP
    PERFORM public._resync_live_quiz_counts(r.id);
  END LOOP;
END $$;