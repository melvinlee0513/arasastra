/**
 * Live quiz client contract.
 *
 * These cover the half of the system this repository can prove without a
 * Postgres instance: what the client puts on the wire, what it refuses to
 * compute, and how it reads a redacted snapshot. The RPC bodies themselves
 * (authorization, scoring, idempotency at the unique index) need a live
 * database — see the migration for their definitions.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  calls: [] as { name: string; args: Record<string, unknown> }[],
  result: { data: {} as unknown, error: null as unknown },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (name: string, args: Record<string, unknown>) => {
      h.calls.push({ name, args });
      return Promise.resolve(h.result);
    },
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: () => {},
  },
}));

import {
  advanceLiveQuizSession,
  createLiveQuizSession,
  isRevealed,
  joinLiveQuizSession,
  mapLiveQuizError,
  removeLiveQuizParticipant,
  secondsRemaining,
  serverClockOffset,
  submitLiveQuizAnswer,
} from "./liveQuiz";

const last = () => h.calls[h.calls.length - 1];

beforeEach(() => {
  h.calls = [];
  h.result = { data: {}, error: null };
});

describe("client never supplies authority it doesn't have", () => {
  it("create sends only quiz id and session settings — no centre or class", async () => {
    await createLiveQuizSession({ quizId: "quiz-1", maxPlayers: 25, secondsPerQuestion: 30 });
    const keys = Object.keys(last().args).sort();
    expect(keys).toEqual([
      "_max_players", "_quiz_id", "_randomize", "_seconds_per_question", "_show_player_names",
    ]);
    // Centre, class and host identity are all derived server-side from auth.uid().
    expect(keys.some((k) => /center|centre|class|host|user/.test(k))).toBe(false);
  });

  it("answer submission sends no score, points or correctness", async () => {
    await submitLiveQuizAnswer({ sessionId: "s1", questionIndex: 2, optionId: "opt-9" });
    const keys = Object.keys(last().args).sort();
    expect(keys).toEqual([
      "_answer", "_answer_text", "_option_id", "_question_index", "_session_id",
    ]);
    expect(keys.some((k) => /score|point|correct|rank/.test(k))).toBe(false);
  });

  it("join sends only the game code", async () => {
    await joinLiveQuizSession("483921");
    expect(Object.keys(last().args)).toEqual(["_game_code"]);
  });

  it("advance carries the state revision so a double tap can't skip a question", async () => {
    await advanceLiveQuizSession({ sessionId: "s1", action: "next", expectedRevision: 7 });
    expect(last().args._expected_revision).toBe(7);
    expect(last().args._action).toBe("next");
  });

  it("true/false answers travel as text, multiple choice as an option id", async () => {
    await submitLiveQuizAnswer({ sessionId: "s1", questionIndex: 0, answerText: "true" });
    expect(last().args._answer_text).toBe("true");
    expect(last().args._option_id).toBeNull();

    await submitLiveQuizAnswer({ sessionId: "s1", questionIndex: 1, optionId: "opt-3" });
    expect(last().args._option_id).toBe("opt-3");
    expect(last().args._answer_text).toBeNull();
  });

  it("a multiple select travels as a list of option ids, not a joined string", async () => {
    // The server needs the shape to compare sets; a comma-joined string would
    // be graded as one short answer and always be wrong.
    await submitLiveQuizAnswer({ sessionId: "s1", questionIndex: 3, answer: ["a", "b"] });
    expect(last().args._answer).toEqual(["a", "b"]);
    expect(last().args._option_id).toBeNull();
    expect(last().args._answer_text).toBeNull();
  });

  it("a typed answer travels verbatim, with no local normalisation", async () => {
    // Trimming or lower-casing here would silently change what an exact-match
    // question is graded against. The server owns that decision.
    await submitLiveQuizAnswer({ sessionId: "s1", questionIndex: 4, answer: "  Celsius  " });
    expect(last().args._answer).toBe("  Celsius  ");
  });

  it("still sends no correctness alongside the richer payload", async () => {
    await submitLiveQuizAnswer({ sessionId: "s1", questionIndex: 5, answer: ["a"] });
    const body = JSON.stringify(last().args);
    expect(body).not.toMatch(/is_correct|points|score/);
  });
});

describe("idempotency is surfaced, not hidden", () => {
  it("reports a duplicate submission without throwing", async () => {
    h.result = { data: { accepted: false, duplicate: true }, error: null };
    const res = await submitLiveQuizAnswer({ sessionId: "s1", questionIndex: 0, optionId: "o" });
    expect(res.duplicate).toBe(true);
    expect(res.accepted).toBe(false);
  });

  it("does not retry a rejected submission", async () => {
    h.result = { data: null, error: { message: "question_expired" } };
    await expect(
      submitLiveQuizAnswer({ sessionId: "s1", questionIndex: 0, optionId: "o" }),
    ).rejects.toBeTruthy();
    // One attempt only — a retry loop here is how you build an answer storm.
    expect(h.calls.filter((c) => c.name === "submit_live_quiz_answer")).toHaveLength(1);
  });
});

describe("reveal gating", () => {
  it("treats only reveal-ward states as safe to show correctness", () => {
    expect(isRevealed("lobby")).toBe(false);
    expect(isRevealed("question_open")).toBe(false);
    expect(isRevealed("question_locked")).toBe(false);
    expect(isRevealed("answer_reveal")).toBe(true);
    expect(isRevealed("leaderboard")).toBe(true);
    expect(isRevealed("completed")).toBe(true);
  });
});

describe("timer is anchored to the server clock", () => {
  const session = {
    question_ends_at: "2026-08-30T10:00:30.000Z",
    server_now: "2026-08-30T10:00:00.000Z",
  };

  it("counts down from the server deadline", () => {
    const localNow = new Date("2026-08-30T10:00:00.000Z").getTime();
    expect(secondsRemaining(session, localNow, 0)).toBe(30);
  });

  it("stays correct when the device clock is an hour fast", () => {
    const skew = 60 * 60 * 1000;
    const localNow = new Date("2026-08-30T10:00:00.000Z").getTime() + skew;
    // serverClockOffset measures the skew; applying it cancels it out.
    const offset = serverClockOffset(session.server_now, localNow);
    expect(offset).toBe(-skew);
    expect(secondsRemaining(session, localNow, offset)).toBe(30);
  });

  it("never returns a negative countdown", () => {
    const localNow = new Date("2026-08-30T10:05:00.000Z").getTime();
    expect(secondsRemaining(session, localNow, 0)).toBe(0);
  });

  it("returns null when the question has no deadline", () => {
    expect(secondsRemaining({ question_ends_at: null, server_now: session.server_now })).toBeNull();
  });
});

describe("error mapping does not leak session existence", () => {
  it("gives one generic message for a code that is missing, finished or another centre's", () => {
    // All three raise session_not_found server-side, so a student can't probe
    // the six-digit space to discover other centres' live games.
    expect(mapLiveQuizError({ message: "session_not_found" })).toBe("That game code isn't valid.");
  });

  it("maps host and player errors to actionable text", () => {
    expect(mapLiveQuizError({ message: "access_denied" })).toMatch(/can't host/i);
    expect(mapLiveQuizError({ message: "session_full" })).toMatch(/full/i);
    expect(mapLiveQuizError({ message: "session_already_started" })).toMatch(/already started/i);
    expect(mapLiveQuizError({ message: "question_expired" })).toMatch(/time's up/i);
    expect(mapLiveQuizError({ message: "invalid_transition" })).toMatch(/isn't available/i);
    expect(mapLiveQuizError({ message: "quiz_not_published" })).toMatch(/publish the quiz/i);
  });

  it("falls back for an unknown error", () => {
    expect(mapLiveQuizError({ message: "something odd" }, "fallback")).toBe("fallback");
  });
});

// ─── Phase 2 ───────────────────────────────────────────────────────────────

describe("removeLiveQuizParticipant", () => {
  it("sends only the two ids — never a claim of authority", async () => {
    h.result = { data: { removed: true }, error: null };
    await removeLiveQuizParticipant({ sessionId: "s-1", participantId: "p-9" });
    expect(last().name).toBe("remove_live_quiz_participant");
    expect(last().args).toEqual({ _session_id: "s-1", _participant_id: "p-9" });
    // No role, no centre, no "is_host" — the server derives all of it.
    expect(JSON.stringify(last().args)).not.toMatch(/host|role|center|centre|admin/i);
  });

  it("propagates the server's refusal rather than swallowing it", async () => {
    h.result = { data: null, error: { message: "access_denied" } };
    await expect(
      removeLiveQuizParticipant({ sessionId: "s-1", participantId: "p-9" }),
    ).rejects.toBeTruthy();
  });
});

describe("mapLiveQuizError — phase 2 states", () => {
  it("explains an expired session instead of a generic failure", () => {
    expect(mapLiveQuizError({ message: "session_expired" })).toMatch(/expired/i);
  });

  it("tells a removed player what actually happened", () => {
    expect(mapLiveQuizError({ message: "removed_by_host" })).toMatch(/removed you/i);
  });

  it("still refuses to distinguish a bad code from another centre's game", () => {
    // Probing protection: these must read identically.
    expect(mapLiveQuizError({ message: "session_not_found" })).toBe(
      "That game code isn't valid.",
    );
  });

  it("falls back without leaking a raw Postgres message", () => {
    const msg = mapLiveQuizError({
      message: 'duplicate key value violates unique constraint "live_quiz_answers_once_uq"',
    });
    expect(msg).toBe("Something went wrong.");
    expect(msg).not.toMatch(/constraint|violates|uq/i);
  });
});
