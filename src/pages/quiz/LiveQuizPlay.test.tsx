/**
 * The student arena must never show correctness before the server reveals it.
 *
 * These drive the real component against snapshots shaped exactly like
 * `get_live_quiz_snapshot` returns them, including the redaction: options carry
 * `is_correct: null` until the session reaches answer_reveal.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const h = vi.hoisted(() => ({
  calls: [] as { name: string; args: Record<string, unknown> }[],
  handlers: {} as Record<string, () => { data: unknown; error: unknown }>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (name: string, args: Record<string, unknown>) => {
      h.calls.push({ name, args });
      const fn = h.handlers[name];
      if (!fn) throw new Error(`unexpected rpc: ${name}`);
      return Promise.resolve(fn());
    },
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: () => {},
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "stu-1" }, isAdmin: false, isLoading: false }),
}));
vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({ currentTenantId: "centre-1", isLoading: false, featureFlags: {} }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { LiveQuizPlay } from "./LiveQuizPlay";

type Status = "lobby" | "question_open" | "question_locked" | "answer_reveal" | "leaderboard" | "completed";

/** Mirrors the RPC's redaction rules exactly. */
function snapshot(status: Status, over: { answered?: boolean; correct?: boolean } = {}) {
  const revealed = status === "answer_reveal" || status === "leaderboard" || status === "completed";
  return {
    session: {
      id: "sess-1",
      status,
      game_code: null,
      class_id: "class-1",
      quiz_id: "quiz-1",
      quiz_title: "Photosynthesis Quiz",
      question_count: 5,
      current_question_index: status === "lobby" ? -1 : 0,
      question_started_at: "2026-08-30T10:00:00.000Z",
      question_ends_at: "2026-08-30T10:00:20.000Z",
      seconds_per_question: 20,
      max_players: 30,
      show_player_names: true,
      participant_count: 3,
      answered_count: 1,
      state_revision: 4,
      started_at: "2026-08-30T10:00:00.000Z",
      completed_at: null,
      server_now: "2026-08-30T10:00:05.000Z",
    },
    is_host: false,
    question:
      status === "lobby"
        ? null
        : {
            id: "q-1",
            index: 0,
            question: "What is the main pigment used in photosynthesis?",
            question_type: "mcq" as const,
            points: 100,
            explanation: revealed ? "Chlorophyll captures light energy." : null,
            options: [
              { id: "o-1", text: "Chlorophyll", is_correct: revealed ? true : null },
              { id: "o-2", text: "Carotene", is_correct: revealed ? false : null },
              { id: "o-3", text: "Hemoglobin", is_correct: revealed ? false : null },
            ],
          },
    me: {
      participant_id: "p-1",
      display_name: "Melvin Lee",
      avatar_url: null,
      score: 250,
      correct_count: 2,
      streak: 1,
      best_streak: 3,
      rank: 3,
    },
    my_answer: over.answered
      ? {
          selected_option_id: "o-2",
          answer_text: null,
          answered: true,
          is_correct: revealed ? (over.correct ?? false) : null,
          points_awarded: revealed ? (over.correct ? 130 : 0) : null,
        }
      : null,
    leaderboard: [
      { participant_id: "p-9", display_name: "Aisyah", avatar_url: null, score: 400, correct_count: 3, best_streak: 3, is_me: false, rank: 1 },
      { participant_id: "p-1", display_name: "Melvin Lee", avatar_url: null, score: 250, correct_count: 2, best_streak: 3, is_me: true, rank: 2 },
    ],
    players: [
      { participant_id: "p-1", display_name: "Melvin Lee", avatar_url: null, status: "joined" as const },
    ],
  };
}

function renderPlay() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/dashboard/quiz/live/sess-1"]}>
        <Routes>
          <Route path="/dashboard/quiz/live/:sessionId" element={<LiveQuizPlay />} />
          <Route path="*" element={<div>away</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const answerCalls = () => h.calls.filter((c) => c.name === "submit_live_quiz_answer");

beforeEach(() => {
  h.calls = [];
  h.handlers = {
    submit_live_quiz_answer: () => ({ data: { accepted: true, duplicate: false }, error: null }),
  };
});

describe("answer secrecy", () => {
  it("shows no correctness marking while the question is open", async () => {
    h.handlers.get_live_quiz_snapshot = () => ({ data: snapshot("question_open"), error: null });
    renderPlay();

    await screen.findByText(/main pigment/);
    // The snapshot carries is_correct: null, so nothing can be styled correct.
    const correct = screen.getByRole("button", { name: /Chlorophyll/ });
    expect(correct.className).not.toMatch(/quiz-correct/);
    expect(screen.queryByText(/Correct!/)).toBeNull();
    expect(screen.queryByText(/Not quite/)).toBeNull();
  });

  it("does not render an explanation before reveal", async () => {
    h.handlers.get_live_quiz_snapshot = () => ({ data: snapshot("question_open"), error: null });
    renderPlay();
    await screen.findByText(/main pigment/);
    expect(screen.queryByText(/captures light energy/)).toBeNull();
  });

  it("marks the correct answer and shows the explanation once revealed", async () => {
    h.handlers.get_live_quiz_snapshot = () => ({
      data: snapshot("answer_reveal", { answered: true, correct: false }),
      error: null,
    });
    renderPlay();

    expect(await screen.findByText("Not quite!")).toBeTruthy();
    const correct = screen.getByRole("button", { name: /Chlorophyll/ });
    expect(correct.className).toMatch(/quiz-correct/);
    // Explanation arrives through the existing Learning Tip flip card.
    expect(screen.getByRole("button", { name: /Show explanation/i })).toBeTruthy();
  });

  it("shows the points the server awarded, never a locally computed figure", async () => {
    h.handlers.get_live_quiz_snapshot = () => ({
      data: snapshot("answer_reveal", { answered: true, correct: true }),
      error: null,
    });
    renderPlay();
    expect(await screen.findByText("Correct!")).toBeTruthy();
    expect(screen.getByText("+130 pts")).toBeTruthy();
  });
});

describe("answer submission", () => {
  it("submits once and locks the choice immediately", async () => {
    h.handlers.get_live_quiz_snapshot = () => ({ data: snapshot("question_open"), error: null });
    renderPlay();

    const btn = await screen.findByRole("button", { name: /Chlorophyll/ });
    fireEvent.click(btn);
    await waitFor(() => expect(answerCalls()).toHaveLength(1));

    // Second tap must not produce a second submission.
    fireEvent.click(btn);
    await new Promise((r) => setTimeout(r, 60));
    expect(answerCalls()).toHaveLength(1);
    expect(answerCalls()[0].args._question_index).toBe(0);
  });

  it("shows a waiting state instead of re-enabling answers after submitting", async () => {
    h.handlers.get_live_quiz_snapshot = () => ({
      data: snapshot("question_open", { answered: true }),
      error: null,
    });
    renderPlay();

    await screen.findByText(/Answer locked in/);
    expect((await screen.findByRole("button", { name: /Chlorophyll/ })).hasAttribute("disabled")).toBe(true);
  });

  it("cannot answer once the question is locked", async () => {
    h.handlers.get_live_quiz_snapshot = () => ({ data: snapshot("question_locked"), error: null });
    renderPlay();

    const btn = await screen.findByRole("button", { name: /Chlorophyll/ });
    expect(btn.hasAttribute("disabled")).toBe(true);
    fireEvent.click(btn);
    await new Promise((r) => setTimeout(r, 60));
    expect(answerCalls()).toHaveLength(0);
  });
});

describe("session states", () => {
  it("shows the waiting room in the lobby", async () => {
    h.handlers.get_live_quiz_snapshot = () => ({ data: snapshot("lobby"), error: null });
    renderPlay();
    expect(await screen.findByText("You're in!")).toBeTruthy();
    expect(screen.getByText(/Waiting for your tutor/)).toBeTruthy();
  });

  it("renders the leaderboard in server order without re-sorting", async () => {
    h.handlers.get_live_quiz_snapshot = () => ({ data: snapshot("leaderboard"), error: null });
    renderPlay();

    await screen.findByText("Leaderboard");
    const names = screen.getAllByText(/Aisyah|Melvin Lee/).map((n) => n.textContent);
    // Rank 1 before rank 2, exactly as the server returned them.
    expect(names[0]).toMatch(/Aisyah/);
  });

  it("shows final results when the game completes", async () => {
    h.handlers.get_live_quiz_snapshot = () => ({ data: snapshot("completed"), error: null });
    renderPlay();
    expect(await screen.findByText("Game complete!")).toBeTruthy();
    expect(screen.getByText("#3")).toBeTruthy();
  });
});

describe("reconnect", () => {
  it("an already-answered student returns to the waiting state, not a fresh question", async () => {
    // Reconnect = a fresh snapshot fetch. my_answer.answered is what tells the
    // client the server already has this student's answer.
    h.handlers.get_live_quiz_snapshot = () => ({
      data: snapshot("question_open", { answered: true }),
      error: null,
    });
    renderPlay();

    await screen.findByText(/Answer locked in/);
    expect(answerCalls()).toHaveLength(0);
  });
});
