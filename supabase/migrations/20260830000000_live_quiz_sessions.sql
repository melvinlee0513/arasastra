-- ═══════════════════════════════════════════════════════════════════════════
-- Live multiplayer quiz — server-authoritative session engine.
--
-- Additive only. Reuses the canonical quizzes / quiz_questions / quiz_options
-- tables; nothing here duplicates quiz content. The only thing frozen into a
-- session is the ORDER of question ids, so a tutor editing the quiz mid-game
-- cannot shift indexes underneath players who have already answered.
--
-- Trust model: clients get SELECT on session + participant rows (so Realtime
-- can push state) and NO write access at all. Every mutation goes through a
-- SECURITY DEFINER function that re-derives centre, class and role from
-- auth.uid(). Correctness and points are computed server-side; the answer
-- table is never directly readable, so no client can see is_correct — its own
-- or anyone else's — before the session reveals it.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Enum ──────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'live_quiz_status') THEN
    CREATE TYPE public.live_quiz_status AS ENUM (
      'lobby',
      'question_open',
      'question_locked',
      'answer_reveal',
      'leaderboard',
      'completed',
      'cancelled'
    );
  END IF;
END $$;

-- ─── Sessions ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.live_quiz_sessions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id               uuid NOT NULL REFERENCES public.tuition_centers(id) ON DELETE CASCADE,
  class_id                uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  quiz_id                 uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  host_user_id            uuid NOT NULL,
  game_code               text NOT NULL,

  status                  public.live_quiz_status NOT NULL DEFAULT 'lobby',
  -- Frozen question order for this session. Indexes into this array are what
  -- current_question_index refers to.
  question_ids            uuid[] NOT NULL DEFAULT '{}',
  current_question_index  integer NOT NULL DEFAULT -1,
  question_started_at     timestamptz,
  question_ends_at        timestamptz,

  max_players             integer NOT NULL DEFAULT 30,
  show_player_names       boolean NOT NULL DEFAULT true,
  seconds_per_question    integer NOT NULL DEFAULT 20,

  -- Denormalised so a single realtime row change tells every client that the
  -- roster or the answer tally moved, without publishing the child tables.
  participant_count       integer NOT NULL DEFAULT 0,
  answered_count          integer NOT NULL DEFAULT 0,

  -- Bumped on every state transition; guards against double-advance.
  state_revision          integer NOT NULL DEFAULT 0,

  created_at              timestamptz NOT NULL DEFAULT now(),
  started_at              timestamptz,
  completed_at            timestamptz,

  CONSTRAINT live_quiz_sessions_code_ck
    CHECK (game_code ~ '^[0-9]{6}$'),
  CONSTRAINT live_quiz_sessions_max_players_ck
    CHECK (max_players BETWEEN 1 AND 200),
  CONSTRAINT live_quiz_sessions_seconds_ck
    CHECK (seconds_per_question BETWEEN 5 AND 300)
);

-- A code only has to be unique among sessions that can still be joined, so
-- codes are naturally recycled once a game finishes.
CREATE UNIQUE INDEX IF NOT EXISTS live_quiz_sessions_active_code_uq
  ON public.live_quiz_sessions (game_code)
  WHERE status NOT IN ('completed', 'cancelled');

CREATE INDEX IF NOT EXISTS live_quiz_sessions_host_idx
  ON public.live_quiz_sessions (host_user_id, status);
CREATE INDEX IF NOT EXISTS live_quiz_sessions_class_idx
  ON public.live_quiz_sessions (class_id, status);

-- ─── Participants ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.live_quiz_participants (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     uuid NOT NULL REFERENCES public.live_quiz_sessions(id) ON DELETE CASCADE,
  center_id      uuid NOT NULL REFERENCES public.tuition_centers(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL,

  -- Snapshot of the profile at join time so the leaderboard stays stable and
  -- readable without a join back to profiles for every render.
  display_name   text NOT NULL,
  avatar_url     text,

  status         text NOT NULL DEFAULT 'joined',
  score          integer NOT NULL DEFAULT 0,
  correct_count  integer NOT NULL DEFAULT 0,
  streak         integer NOT NULL DEFAULT 0,
  best_streak    integer NOT NULL DEFAULT 0,
  total_time_ms  integer NOT NULL DEFAULT 0,

  joined_at      timestamptz NOT NULL DEFAULT now(),
  last_seen_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT live_quiz_participants_status_ck
    CHECK (status IN ('joined', 'left')),
  -- One participant row per person per session, for all time. This is what
  -- makes reconnect return the SAME row instead of minting a second player.
  CONSTRAINT live_quiz_participants_session_user_uq UNIQUE (session_id, user_id)
);

CREATE INDEX IF NOT EXISTS live_quiz_participants_session_idx
  ON public.live_quiz_participants (session_id, score DESC);
CREATE INDEX IF NOT EXISTS live_quiz_participants_user_idx
  ON public.live_quiz_participants (user_id);

-- ─── Answers ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.live_quiz_answers (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id         uuid NOT NULL REFERENCES public.live_quiz_sessions(id) ON DELETE CASCADE,
  participant_id     uuid NOT NULL REFERENCES public.live_quiz_participants(id) ON DELETE CASCADE,
  question_id        uuid NOT NULL REFERENCES public.quiz_questions(id) ON DELETE CASCADE,
  question_index     integer NOT NULL,

  -- MCQ answers carry an option id; true/false carries 'true' / 'false'.
  selected_option_id uuid REFERENCES public.quiz_options(id) ON DELETE SET NULL,
  answer_text        text,

  is_correct         boolean NOT NULL,
  points_awarded     integer NOT NULL DEFAULT 0,
  response_time_ms   integer NOT NULL DEFAULT 0,
  answered_at        timestamptz NOT NULL DEFAULT now(),

  -- Idempotency. A double tap, a retry after a dropped response, or a
  -- reconnect replay all collide here instead of scoring twice.
  CONSTRAINT live_quiz_answers_once_uq UNIQUE (participant_id, question_index)
);

CREATE INDEX IF NOT EXISTS live_quiz_answers_session_q_idx
  ON public.live_quiz_answers (session_id, question_index);

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS — read-only for clients, writes exclusively through the RPCs below.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.live_quiz_sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_quiz_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_quiz_answers      ENABLE ROW LEVEL SECURITY;

-- Is the caller a participant of this session?
CREATE OR REPLACE FUNCTION public._is_live_quiz_participant(_session_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.live_quiz_participants p
     WHERE p.session_id = _session_id
       AND p.user_id = auth.uid()
  );
$$;

-- Is the caller allowed to host / observe this session as staff?
CREATE OR REPLACE FUNCTION public._can_host_live_quiz(_session_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.live_quiz_sessions s
     WHERE s.id = _session_id
       AND public.can_manage_class(s.class_id)
  );
$$;

DROP POLICY IF EXISTS "Session readable by host or participants" ON public.live_quiz_sessions;
CREATE POLICY "Session readable by host or participants"
  ON public.live_quiz_sessions FOR SELECT
  USING (
    public._can_host_live_quiz(id)
    OR public._is_live_quiz_participant(id)
  );

DROP POLICY IF EXISTS "Participants readable within the session" ON public.live_quiz_participants;
CREATE POLICY "Participants readable within the session"
  ON public.live_quiz_participants FOR SELECT
  USING (
    public._can_host_live_quiz(session_id)
    OR public._is_live_quiz_participant(session_id)
  );

-- No SELECT policy on live_quiz_answers at all. RLS denies by default, so a
-- client can never read is_correct — not even its own — ahead of the reveal.
-- Everything a player is allowed to see comes back through the snapshot RPC.

-- ═══════════════════════════════════════════════════════════════════════════
-- Realtime: only the session row is published. One row per game, changed once
-- per transition, so state fan-out stays O(transitions) rather than
-- O(players × answers). Roster and tally changes are signalled through the
-- denormalised counters on that same row.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'live_quiz_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.live_quiz_sessions;
  END IF;
END $$;

ALTER TABLE public.live_quiz_sessions REPLICA IDENTITY FULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- Scoring
--
--   correct   → question points + a speed bonus of up to 50% of those points,
--               scaled by how much of the question window was left
--   incorrect → 0
--
-- Kept here, in one place, so no client and no component ever computes points.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._live_quiz_points(
  _base_points integer,
  _started_at  timestamptz,
  _ends_at     timestamptz,
  _answered_at timestamptz
) RETURNS integer
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_window numeric;
  v_left   numeric;
  v_frac   numeric;
BEGIN
  IF _started_at IS NULL OR _ends_at IS NULL THEN
    RETURN GREATEST(_base_points, 0);
  END IF;
  v_window := EXTRACT(EPOCH FROM (_ends_at - _started_at));
  IF v_window <= 0 THEN
    RETURN GREATEST(_base_points, 0);
  END IF;
  v_left := EXTRACT(EPOCH FROM (_ends_at - _answered_at));
  v_frac := LEAST(GREATEST(v_left / v_window, 0), 1);
  RETURN GREATEST(_base_points, 0) + FLOOR(GREATEST(_base_points, 0) * 0.5 * v_frac)::int;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- create_live_quiz_session
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
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_quiz FROM public.quizzes WHERE id = _quiz_id;
  IF v_quiz.id IS NULL THEN
    RAISE EXCEPTION 'quiz_not_found' USING ERRCODE = 'P0002';
  END IF;
  -- Host authority is derived, never supplied.
  IF NOT public.can_manage_class(v_quiz.class_id) THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE = '42501';
  END IF;
  IF v_quiz.status <> 'published' THEN
    RAISE EXCEPTION 'quiz_not_published' USING ERRCODE = '22023';
  END IF;

  -- Freeze the question order now.
  SELECT COALESCE(array_agg(q.id ORDER BY
           CASE WHEN _randomize THEN md5(random()::text) END NULLS LAST,
           COALESCE(q.order_index, q.sort_order, 0), q.id), '{}')
    INTO v_qids
    FROM public.quiz_questions q
   WHERE q.quiz_id = _quiz_id
     AND q.question_type IN ('mcq', 'multiple_choice', 'true_false');

  IF COALESCE(array_length(v_qids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'quiz_has_no_playable_questions' USING ERRCODE = '22023';
  END IF;

  -- Retry on the partial-unique collision rather than pre-checking, so two
  -- hosts racing on the same code cannot both win.
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

-- ═══════════════════════════════════════════════════════════════════════════
-- join_live_quiz_session — by code. Idempotent: rejoining returns the same row.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.join_live_quiz_session(_game_code text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_s       public.live_quiz_sessions%ROWTYPE;
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
  IF NOT public.is_enrolled_in_class(v_s.class_id) THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT id INTO v_pid
    FROM public.live_quiz_participants
   WHERE session_id = v_s.id AND user_id = v_uid;

  IF v_pid IS NOT NULL THEN
    -- Reconnect: same row, marked active again.
    UPDATE public.live_quiz_participants
       SET status = 'joined', last_seen_at = now()
     WHERE id = v_pid;
    RETURN jsonb_build_object('session_id', v_s.id, 'participant_id', v_pid, 'rejoined', true);
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

  UPDATE public.live_quiz_sessions
     SET participant_count = participant_count + 1,
         state_revision = state_revision + 1
   WHERE id = v_s.id;

  RETURN jsonb_build_object('session_id', v_s.id, 'participant_id', v_pid, 'rejoined', false);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- get_live_quiz_snapshot — the single read every client uses.
--
-- Redaction is the whole point: options never carry is_correct, and the
-- correct option / explanation only appear once status has reached
-- answer_reveal. Students additionally never see a question the session has
-- not opened.
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
  v_quiz      public.quizzes%ROWTYPE;
  v_qid       uuid;
  v_question  jsonb := NULL;
  v_reveal    boolean;
  v_me        jsonb := NULL;
  v_board     jsonb;
  v_players   jsonb;
  v_my_answer jsonb := NULL;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_s FROM public.live_quiz_sessions WHERE id = _session_id;
  IF v_s.id IS NULL THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_is_host := public.can_manage_class(v_s.class_id);
  SELECT id INTO v_pid
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
      'rank', (
        SELECT count(*) + 1 FROM public.live_quiz_participants o
         WHERE o.session_id = v_s.id
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

  -- Leaderboard: authoritative order, computed here.
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
     ORDER BY rank
     LIMIT 50
  ) t;

  -- Lobby roster.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'participant_id', p.id,
           'display_name', CASE WHEN v_s.show_player_names OR p.user_id = v_uid OR v_is_host
                                THEN p.display_name ELSE 'Player' END,
           'avatar_url', p.avatar_url,
           'status', p.status
         ) ORDER BY p.joined_at), '[]'::jsonb)
    INTO v_players
    FROM public.live_quiz_participants p
   WHERE p.session_id = v_s.id;

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
      -- Authoritative clock, so a wrong browser clock cannot extend a question.
      'server_now', now()
    ),
    'is_host', v_is_host,
    'question', v_question,
    'me', v_me,
    'my_answer', v_my_answer,
    'leaderboard', v_board,
    'players', v_players
  );
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- advance_live_quiz_session — the only way the state machine moves.
--
--   lobby            --start-->  question_open (index 0)
--   question_open    --lock--->  question_locked
--   question_locked  --reveal->  answer_reveal
--   answer_reveal    --board-->  leaderboard
--   leaderboard      --next--->  question_open (index+1) | completed
--
-- _expected_revision makes a double tap on "Next" a no-op instead of skipping
-- a question.
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
  v_status public.live_quiz_status;
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
           state_revision = state_revision + 1
     WHERE id = _session_id;
    RETURN jsonb_build_object('status', 'question_open', 'index', 0);
  END IF;

  IF _action = 'lock' THEN
    IF v_s.status <> 'question_open' THEN
      RAISE EXCEPTION 'invalid_transition' USING ERRCODE = '22023';
    END IF;
    UPDATE public.live_quiz_sessions
       SET status = 'question_locked', state_revision = state_revision + 1
     WHERE id = _session_id;
    RETURN jsonb_build_object('status', 'question_locked');
  END IF;

  IF _action = 'reveal' THEN
    IF v_s.status NOT IN ('question_open', 'question_locked') THEN
      RAISE EXCEPTION 'invalid_transition' USING ERRCODE = '22023';
    END IF;
    UPDATE public.live_quiz_sessions
       SET status = 'answer_reveal', state_revision = state_revision + 1
     WHERE id = _session_id;
    RETURN jsonb_build_object('status', 'answer_reveal');
  END IF;

  IF _action = 'leaderboard' THEN
    IF v_s.status <> 'answer_reveal' THEN
      RAISE EXCEPTION 'invalid_transition' USING ERRCODE = '22023';
    END IF;
    UPDATE public.live_quiz_sessions
       SET status = 'leaderboard', state_revision = state_revision + 1
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
           state_revision = state_revision + 1
     WHERE id = _session_id;
    RETURN jsonb_build_object('status', 'question_open', 'index', v_next);
  END IF;

  IF _action = 'complete' THEN
    UPDATE public.live_quiz_sessions
       SET status = 'completed', completed_at = now(), state_revision = state_revision + 1
     WHERE id = _session_id;
    RETURN jsonb_build_object('status', 'completed');
  END IF;

  RAISE EXCEPTION 'invalid_action' USING ERRCODE = '22023';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- submit_live_quiz_answer — idempotent, server-scored.
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

  UPDATE public.live_quiz_sessions
     SET answered_count = answered_count + 1
   WHERE id = _session_id;

  -- Correctness is deliberately NOT returned here; the client learns it at
  -- reveal, through the snapshot.
  RETURN jsonb_build_object('accepted', true, 'duplicate', false);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- leave_live_quiz_session
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
  UPDATE public.live_quiz_participants
     SET status = 'left', last_seen_at = now()
   WHERE session_id = _session_id AND user_id = v_uid;
  UPDATE public.live_quiz_sessions
     SET state_revision = state_revision + 1
   WHERE id = _session_id;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- find_my_live_quiz_session — reconnect entry point for both roles.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.find_my_live_quiz_session()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id  uuid;
  v_host boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT s.id INTO v_id
    FROM public.live_quiz_sessions s
   WHERE s.host_user_id = v_uid
     AND s.status NOT IN ('completed', 'cancelled')
   ORDER BY s.created_at DESC LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('session_id', v_id, 'is_host', true);
  END IF;

  SELECT s.id INTO v_id
    FROM public.live_quiz_sessions s
    JOIN public.live_quiz_participants p ON p.session_id = s.id
   WHERE p.user_id = v_uid
     AND p.status = 'joined'
     AND s.status NOT IN ('completed', 'cancelled')
   ORDER BY s.created_at DESC LIMIT 1;

  RETURN jsonb_build_object('session_id', v_id, 'is_host', v_host);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Grants — authenticated only, never anon. This MVP has no guest players.
-- ═══════════════════════════════════════════════════════════════════════════
REVOKE ALL ON FUNCTION public.create_live_quiz_session(uuid, integer, boolean, integer, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.join_live_quiz_session(text)                                       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_live_quiz_snapshot(uuid)                                       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.advance_live_quiz_session(uuid, text, integer)                     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_live_quiz_answer(uuid, integer, uuid, text)                 FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.leave_live_quiz_session(uuid)                                      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.find_my_live_quiz_session()                                        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._live_quiz_points(integer, timestamptz, timestamptz, timestamptz)  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._is_live_quiz_participant(uuid)                                    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._can_host_live_quiz(uuid)                                          FROM PUBLIC, anon;

-- These two are called from inside the RLS policies below, and a policy
-- expression is evaluated as the querying role. Without EXECUTE the policy
-- raises "permission denied for function" instead of returning false, which
-- makes every session row unreadable and takes Realtime down with it.
GRANT EXECUTE ON FUNCTION public._is_live_quiz_participant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public._can_host_live_quiz(uuid)       TO authenticated;

GRANT EXECUTE ON FUNCTION public.create_live_quiz_session(uuid, integer, boolean, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_live_quiz_session(text)                                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_live_quiz_snapshot(uuid)                                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_live_quiz_session(uuid, text, integer)                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_live_quiz_answer(uuid, integer, uuid, text)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_live_quiz_session(uuid)                                      TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_my_live_quiz_session()                                        TO authenticated;

-- Clients read through RLS for Realtime; they never write these tables.
GRANT SELECT ON public.live_quiz_sessions     TO authenticated;
GRANT SELECT ON public.live_quiz_participants TO authenticated;
