/**
 * Live multiplayer quiz — client access layer.
 *
 * Every call is a SECURITY DEFINER RPC. The client never writes the session,
 * participant or answer tables, never computes points or ranks, and never sees
 * `is_correct` before the server's reveal state says it may. Anything in this
 * file that looks like game logic is display only.
 */
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { AnswerValue } from "@/lib/quizAnswers";
import { QUESTION_TYPE_LABELS, type QuestionType } from "@/lib/quizzes";

// ─── Canonical types (mirror get_live_quiz_snapshot) ───────────────────────

export type LiveQuizStatus =
  | "lobby"
  | "question_open"
  | "question_locked"
  | "answer_reveal"
  | "leaderboard"
  | "completed"
  | "cancelled";

export type LiveQuizAction =
  | "start"
  | "lock"
  | "reveal"
  | "leaderboard"
  | "next"
  | "complete"
  | "cancel";

export interface LiveQuizOption {
  id: string;
  text: string;
  /** null until the session reaches a reveal state — never inferred locally. */
  is_correct: boolean | null;
}

export interface LiveQuizQuestion {
  id: string;
  index: number;
  question: string;
  /** The live engine plays every type the solo engine grades. */
  question_type: QuestionType;
  points: number;
  /**
   * Display label for a numeric question ("m/s²"). The numeric answer and its
   * tolerance are never sent — a visible tolerance is a partial answer key.
   */
  answer_unit: string | null;
  /** null until reveal. */
  explanation: string | null;
  /** null until reveal, and only for short_answer / fill_blank. */
  accepted_answers: string[] | null;
  /**
   * null until reveal, and only for numeric. The tolerance is never sent: at
   * reveal the answer is already on the host's screen, but a tolerance is a
   * grading detail that only narrows the search space.
   */
  numeric_answer: number | null;
  options: LiveQuizOption[];
}

export interface LiveQuizSessionState {
  id: string;
  status: LiveQuizStatus;
  /** Host-only; null for players so a code can't be re-shared from a client. */
  game_code: string | null;
  class_id: string;
  quiz_id: string;
  quiz_title: string;
  question_count: number;
  current_question_index: number;
  question_started_at: string | null;
  question_ends_at: string | null;
  seconds_per_question: number;
  max_players: number;
  show_player_names: boolean;
  participant_count: number;
  answered_count: number;
  state_revision: number;
  started_at: string | null;
  completed_at: string | null;
  /** Abandoned sessions age out so their game code can be reused. */
  expires_at: string | null;
  /** Derived from real answers, and only once the session is completed. */
  summary: LiveQuizSummary | null;
  /** Authoritative clock, used to correct a skewed browser clock. */
  server_now: string;
}

export interface LiveQuizMe {
  participant_id: string;
  display_name: string;
  avatar_url: string | null;
  score: number;
  correct_count: number;
  streak: number;
  best_streak: number;
  rank: number;
}

export interface LiveQuizMyAnswer {
  selected_option_id: string | null;
  answer_text: string | null;
  answered: boolean;
  is_correct: boolean | null;
  points_awarded: number | null;
}

export interface LiveQuizLeaderboardRow {
  participant_id: string;
  display_name: string;
  avatar_url: string | null;
  score: number;
  correct_count: number;
  best_streak: number;
  is_me: boolean;
  rank: number;
}

export type LiveQuizParticipantStatus = "joined" | "left" | "removed";

export interface LiveQuizPlayer {
  participant_id: string;
  display_name: string;
  avatar_url: string | null;
  status: LiveQuizParticipantStatus;
  /**
   * Operational fields, present ONLY when the caller is the host — the server
   * omits them entirely from a player's payload rather than blanking them, so
   * a player cannot read the roster's scores or who has answered.
   */
  score?: number;
  correct_count?: number;
  answered?: boolean;
  last_seen_at?: string;
  joined_at?: string;
}

/** Host-only per-option tally for the current question. */
export interface LiveQuizOptionStat {
  option_id: string;
  text: string;
  is_correct: boolean;
  count: number;
}

export interface LiveQuizQuestionStats {
  question_index: number;
  answered: number;
  options: LiveQuizOptionStat[];
}

/** Derived at read time from real answers; only present once completed. */
export interface LiveQuizSummary {
  players: number;
  questions: number;
  average_score: number;
  average_accuracy_pct: number | null;
}

export interface LiveQuizSnapshot {
  session: LiveQuizSessionState;
  is_host: boolean;
  /** The caller's own participant status, or "host". Null for a pure observer. */
  my_status: LiveQuizParticipantStatus | "host" | null;
  question: LiveQuizQuestion | null;
  /** Host only — null for players. */
  question_stats: LiveQuizQuestionStats | null;
  me: LiveQuizMe | null;
  my_answer: LiveQuizMyAnswer | null;
  leaderboard: LiveQuizLeaderboardRow[];
  players: LiveQuizPlayer[];
}

// ─── RPC wrappers ──────────────────────────────────────────────────────────

export async function createLiveQuizSession(args: {
  quizId: string;
  maxPlayers?: number;
  showPlayerNames?: boolean;
  secondsPerQuestion?: number;
  randomize?: boolean;
}): Promise<{ id: string; game_code: string }> {
  const { data, error } = await supabase.rpc("create_live_quiz_session" as never, {
    _quiz_id: args.quizId,
    _max_players: args.maxPlayers ?? 30,
    _show_player_names: args.showPlayerNames ?? true,
    _seconds_per_question: args.secondsPerQuestion ?? 20,
    _randomize: args.randomize ?? false,
  } as never);
  if (error) throw error;
  return data as unknown as { id: string; game_code: string };
}

export async function joinLiveQuizSession(
  gameCode: string,
): Promise<{ session_id: string; participant_id: string; rejoined: boolean }> {
  const { data, error } = await supabase.rpc("join_live_quiz_session" as never, {
    _game_code: gameCode,
  } as never);
  if (error) throw error;
  return data as unknown as { session_id: string; participant_id: string; rejoined: boolean };
}

export async function getLiveQuizSnapshot(sessionId: string): Promise<LiveQuizSnapshot> {
  const { data, error } = await supabase.rpc("get_live_quiz_snapshot" as never, {
    _session_id: sessionId,
  } as never);
  if (error) throw error;
  return data as unknown as LiveQuizSnapshot;
}

export async function advanceLiveQuizSession(args: {
  sessionId: string;
  action: LiveQuizAction;
  expectedRevision?: number | null;
}): Promise<{ status: LiveQuizStatus; index?: number }> {
  const { data, error } = await supabase.rpc("advance_live_quiz_session" as never, {
    _session_id: args.sessionId,
    _action: args.action,
    _expected_revision: args.expectedRevision ?? null,
  } as never);
  if (error) throw error;
  return data as unknown as { status: LiveQuizStatus; index?: number };
}

/**
 * Send one live answer.
 *
 * `answer` is the typed value the control produced — a string for a single
 * choice, true/false, a typed word or a number; an array of option ids for a
 * multiple select. It goes to the server as JSON and is graded there by the
 * same `_quiz_answer_is_correct` the solo engine uses, so the two can never
 * disagree. Correctness is deliberately NOT in the response: the client learns
 * it at reveal.
 *
 * `optionId` and `answerText` remain for the two callers that predate the
 * expanded types (the dev harness, and any tab still running an older bundle).
 */
export async function submitLiveQuizAnswer(args: {
  sessionId: string;
  questionIndex: number;
  answer?: AnswerValue | null;
  optionId?: string | null;
  answerText?: string | null;
}): Promise<{ accepted: boolean; duplicate: boolean }> {
  const { data, error } = await supabase.rpc("submit_live_quiz_answer" as never, {
    _session_id: args.sessionId,
    _question_index: args.questionIndex,
    _option_id: args.optionId ?? null,
    _answer_text: args.answerText ?? null,
    _answer: args.answer ?? null,
  } as never);
  if (error) throw error;
  return data as unknown as { accepted: boolean; duplicate: boolean };
}

/**
 * Remove a player from a live session. Host-only, enforced server-side by the
 * same `can_manage_class` every other host action uses — the client cannot
 * authorise itself by hiding the button. Idempotent.
 */
export async function removeLiveQuizParticipant(args: {
  sessionId: string;
  participantId: string;
}): Promise<{ removed: boolean }> {
  const { data, error } = await supabase.rpc("remove_live_quiz_participant" as never, {
    _session_id: args.sessionId,
    _participant_id: args.participantId,
  } as never);
  if (error) throw error;
  return data as unknown as { removed: boolean };
}

export async function leaveLiveQuizSession(sessionId: string): Promise<void> {
  const { error } = await supabase.rpc("leave_live_quiz_session" as never, {
    _session_id: sessionId,
  } as never);
  if (error) throw error;
}

export async function findMyLiveQuizSession(): Promise<{
  session_id: string | null;
  is_host: boolean;
}> {
  const { data, error } = await supabase.rpc("find_my_live_quiz_session" as never, {} as never);
  if (error) throw error;
  return data as unknown as { session_id: string | null; is_host: boolean };
}

// ─── Realtime ──────────────────────────────────────────────────────────────

/**
 * Subscribe to a session's state changes.
 *
 * Only `live_quiz_sessions` is published, and only one row per game changes —
 * so a 30-player, 20-question game produces a bounded number of realtime
 * messages instead of one per player per answer. `onChange` is a signal to
 * re-read the snapshot, not a payload to render: the row is unredacted, so the
 * client must never read question content from it.
 */
export type RealtimeStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

export function subscribeToLiveQuizSession(
  sessionId: string,
  onChange: () => void,
  onStatus?: (status: RealtimeStatus) => void,
): RealtimeChannel {
  return supabase
    .channel(`live-quiz:${sessionId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "live_quiz_sessions",
        filter: `id=eq.${sessionId}`,
      },
      () => onChange(),
    )
    .subscribe((status) => {
      // supabase-js reports SUBSCRIBED / CHANNEL_ERROR / TIMED_OUT / CLOSED.
      // A dropped socket retries on its own, so an error is "reconnecting"
      // rather than a terminal state — the snapshot RPC remains the source of
      // truth either way.
      if (status === "SUBSCRIBED") {
        onStatus?.("connected");
        // A resubscribe means we may have missed updates while away.
        onChange();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        onStatus?.("reconnecting");
      } else if (status === "CLOSED") {
        onStatus?.("disconnected");
      }
    });
}

export function unsubscribeFromLiveQuiz(channel: RealtimeChannel | null) {
  if (channel) void supabase.removeChannel(channel);
}

// ─── Helpers ───────────────────────────────────────────────────────────────

export const liveQuizKeys = {
  snapshot: (tenantId: string | null, sessionId: string, userId?: string) =>
    ["live-quiz", "snapshot", tenantId, sessionId, userId] as const,
  mine: (tenantId: string | null, userId?: string) =>
    ["live-quiz", "mine", tenantId, userId] as const,
};

/**
 * Seconds left on the current question.
 *
 * Derived from the server's own clock: the offset between `server_now` and the
 * local clock is applied so a device with a wrong time still counts down
 * against the real deadline. Purely cosmetic — the server rejects late answers
 * regardless of what this returns.
 */
export function secondsRemaining(
  session: Pick<LiveQuizSessionState, "question_ends_at" | "server_now">,
  localNow: number = Date.now(),
  serverOffsetMs = 0,
): number | null {
  if (!session.question_ends_at) return null;
  const ends = new Date(session.question_ends_at).getTime();
  return Math.max(0, Math.ceil((ends - (localNow + serverOffsetMs)) / 1000));
}

/** Difference between the server clock and this device's, in ms. */
export function serverClockOffset(serverNow: string, localNow = Date.now()): number {
  return new Date(serverNow).getTime() - localNow;
}

/** True when the session state permits showing correctness. */
export function isRevealed(status: LiveQuizStatus): boolean {
  return status === "answer_reveal" || status === "leaderboard" || status === "completed";
}

export function mapLiveQuizError(err: unknown, fallback = "Something went wrong."): string {
  const msg = (err as { message?: string })?.message ?? "";
  if (!msg) return fallback;
  if (msg.includes("not_authenticated")) return "Please sign in again.";
  if (msg.includes("access_denied")) return "You can't host a live quiz for this class.";
  // Deliberately identical for missing / finished / foreign sessions, so the
  // six-digit space can't be probed for other centres' games.
  if (msg.includes("session_not_found")) return "That game code isn't valid.";
  if (msg.includes("session_already_started")) return "That game has already started.";
  if (msg.includes("session_full")) return "That game is full.";
  if (msg.includes("session_finished")) return "That game has already finished.";
  if (msg.includes("session_expired")) return "That game has expired. Ask your tutor to start a new one.";
  if (msg.includes("removed_by_host")) return "Your tutor removed you from this game.";
  if (msg.includes("session_state_conflict")) return "The game moved on — refreshing.";
  if (msg.includes("invalid_transition")) return "That action isn't available right now.";
  if (msg.includes("question_not_open")) return "That question is closed.";
  if (msg.includes("question_expired")) return "Time's up for that question.";
  if (msg.includes("invalid_answer")) return "That answer isn't valid.";
  if (msg.includes("not_a_participant")) return "You haven't joined this game.";
  if (msg.includes("quiz_not_published")) return "Publish the quiz before hosting it live.";
  if (msg.includes("quiz_has_no_playable_questions")) return "This quiz has no questions to play.";
  // The server names the offending type. Passing that through is the whole
  // point of refusing at create time rather than dropping the question.
  if (msg.includes("unsupported_live_question_type")) {
    const raw = msg.split("unsupported_live_question_type:")[1] ?? "";
    const types = raw
      .split(",")
      .map((t) => QUESTION_TYPE_LABELS[t.trim()] ?? t.trim())
      .filter(Boolean);
    return types.length
      ? `This quiz can't be hosted live yet: ${types.join(", ")} questions aren't supported in a live game. Remove them or run it as a normal quiz.`
      : "This quiz has a question type that can't be hosted live.";
  }
  if (msg.includes("game_code_unavailable")) return "Couldn't allocate a game code. Try again.";
  return fallback;
}
