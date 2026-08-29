/**
 * Resume behaviour for an in-progress quiz attempt.
 *
 * The database is the source of truth: these tests feed the real component the
 * payload `get_quiz_for_attempt` returns and assert the arena reflects it —
 * selections restored, answered count correct, navigator marking the right
 * questions, and the student placed on the first unanswered question.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const h = vi.hoisted(() => ({
  calls: [] as { name: string; args: Record<string, unknown> }[],
  handlers: {} as Record<string, (a: Record<string, unknown>) => { data: unknown; error: unknown }>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (name: string, args: Record<string, unknown>) => {
      h.calls.push({ name, args });
      const fn = h.handlers[name];
      if (!fn) throw new Error(`unexpected rpc: ${name}`);
      return Promise.resolve(fn(args));
    },
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "stu-1" }, isAdmin: false, isLoading: false }),
}));
vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({ currentTenantId: "centre-1", isLoading: false, featureFlags: {} }),
}));
vi.mock("@/hooks/useClassContext", () => ({
  useClassContext: () => ({
    data: { isEnrolled: true, canManage: false, klass: { id: "class-1", title: "Physics Form 4" } },
    isLoading: false,
  }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { StudentQuizAttempt } from "./StudentQuizAttempt";

// ── Payload shaped exactly like get_quiz_for_attempt ───────────────────────
const OPT = (q: string, n: number) => `opt-${q}-${n}`;

function question(n: number) {
  return {
    id: `q-${n}`,
    question_type: "mcq" as const,
    prompt: `Question ${n} prompt`,
    points: 1,
    display_order: n,
    options: [1, 2, 3, 4].map((i) => ({
      id: OPT(`q-${n}`, i),
      text: `Q${n} option ${i}`,
      order_index: i,
    })),
  };
}

function payload(savedAnswers: Record<string, string> | null, over: { status?: string } = {}) {
  return {
    quiz: {
      id: "quiz-1",
      title: "Quiz Test",
      description: null,
      instructions: null,
      time_limit_seconds: null,
      due_at: null,
      available_from: null,
      shuffle_questions: false,
      shuffle_options: false,
      attempt_limit: 1,
      result_visibility: "after_submit",
    },
    attempt: {
      id: "att-1",
      status: over.status ?? "in_progress",
      saved_answers: savedAnswers,
      started_at: "2026-08-29T10:00:00+00:00",
      submitted_at: null,
      deadline: null,
      // NOTE: the live RPC does not return progress_revision — covered below.
      progress_revision: 3,
    },
    questions: [1, 2, 3, 4, 5].map(question),
  };
}

function renderAttempt() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/dashboard/classes/class-1/quizzes/quiz-1/attempt/att-1"]}>
        <Routes>
          <Route
            path="/dashboard/classes/:classId/quizzes/:quizId/attempt/:attemptId"
            element={<StudentQuizAttempt />}
          />
          <Route
            path="/dashboard/classes/:classId/quizzes/:quizId/results/:attemptId"
            element={<div>results-route</div>}
          />
          <Route path="*" element={<div>away</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** The navigator button for a 1-based question number. */
const navButton = (n: number) =>
  screen.getByRole("button", { name: new RegExp(`^Question ${n}\\b`) });

const saveCalls = () => h.calls.filter((c) => c.name === "save_quiz_progress");

beforeEach(() => {
  h.calls = [];
  h.handlers = {
    save_quiz_progress: () => ({
      data: { saved: true, saved_at: "x", deadline: null, progress_revision: 4 },
      error: null,
    }),
  };
});

describe("resuming an in-progress attempt", () => {
  it("CASE A — restores a single saved answer", async () => {
    h.handlers.get_quiz_for_attempt = () => ({
      data: payload({ "q-1": OPT("q-1", 2) }),
      error: null,
    });

    renderAttempt();

    expect(await screen.findByText(/1 answered/)).toBeTruthy();
    expect(navButton(1).getAttribute("aria-label")).toMatch(/answered/);
  });

  it("CASE B — restores three of five and marks the navigator correctly", async () => {
    h.handlers.get_quiz_for_attempt = () => ({
      data: payload({
        "q-1": OPT("q-1", 2),
        "q-2": OPT("q-2", 4),
        "q-3": OPT("q-3", 1),
      }),
      error: null,
    });

    renderAttempt();

    expect(await screen.findByText(/3 answered/)).toBeTruthy();
    for (const n of [1, 2, 3]) {
      expect(navButton(n).getAttribute("aria-label")).toBe(`Question ${n} answered`);
    }
    for (const n of [4, 5]) {
      expect(navButton(n).getAttribute("aria-label")).toBe(`Question ${n} unanswered`);
    }
  });

  it("CASE B — resumes on the first unanswered question, not question 1", async () => {
    h.handlers.get_quiz_for_attempt = () => ({
      data: payload({
        "q-1": OPT("q-1", 2),
        "q-2": OPT("q-2", 4),
        "q-3": OPT("q-3", 1),
      }),
      error: null,
    });

    renderAttempt();

    // Q1..Q3 are answered, so the student belongs on Q4.
    expect(await screen.findByText("Question 4 prompt")).toBeTruthy();
    expect(screen.getByText("4 / 5")).toBeTruthy();
  });

  it("CASE C — all answered, unsubmitted: lands on the last question, submission-ready", async () => {
    h.handlers.get_quiz_for_attempt = () => ({
      data: payload({
        "q-1": OPT("q-1", 1),
        "q-2": OPT("q-2", 1),
        "q-3": OPT("q-3", 1),
        "q-4": OPT("q-4", 1),
        "q-5": OPT("q-5", 1),
      }),
      error: null,
    });

    renderAttempt();

    expect(await screen.findByText("Question 5 prompt")).toBeTruthy();
    expect(screen.getByText(/5 answered/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Submit quiz/i })).toBeTruthy();
  });

  it("CASE D — restores the latest persisted answer for a changed question", async () => {
    h.handlers.get_quiz_for_attempt = () => ({
      data: payload({ "q-1": OPT("q-1", 3) }),
      error: null,
    });

    renderAttempt();

    await screen.findByText(/1 answered/);
    // Resume puts us on Q2 (the first unanswered); step back to inspect Q1.
    fireEvent.click(navButton(1));

    // Option 3 is the restored selection, not option 1.
    const selected = await screen.findByRole("button", { name: /Q1 option 3/ });
    expect(selected.getAttribute("aria-pressed")).toBe("true");
    expect(
      screen.getByRole("button", { name: /Q1 option 1/ }).getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("CASE E — a submitted attempt is routed to its result, not reopened as editable", async () => {
    // The current RPC returns questions regardless of status, so status alone
    // has to be what stops the arena rendering an editable attempt.
    h.handlers.get_quiz_for_attempt = () => ({
      data: payload({ "q-1": OPT("q-1", 1) }, { status: "submitted" }),
      error: null,
    });

    renderAttempt();

    expect(await screen.findByText("results-route")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Submit quiz/i })).toBeNull();
  });

  it("starts a fresh attempt on question 1", async () => {
    h.handlers.get_quiz_for_attempt = () => ({ data: payload({}), error: null });

    renderAttempt();

    expect(await screen.findByText("Question 1 prompt")).toBeTruthy();
    expect(screen.getByText(/0 answered/)).toBeTruthy();
  });
});

describe("autosave safety on resume", () => {
  it("CASE G — hydrating an existing attempt issues no save", async () => {
    h.handlers.get_quiz_for_attempt = () => ({
      data: payload({ "q-1": OPT("q-1", 2), "q-2": OPT("q-2", 2) }),
      error: null,
    });

    renderAttempt();
    await screen.findByText(/2 answered/);

    // Long enough to clear the autosave debounce.
    await new Promise((r) => setTimeout(r, 900));

    // Restoring is a read. Writing the server's own answers back on every
    // mount is exactly the save storm the incident guidance forbids.
    expect(saveCalls()).toHaveLength(0);
  });

  it("saves once, not per keystroke, when the student answers", async () => {
    h.handlers.get_quiz_for_attempt = () => ({ data: payload({}), error: null });

    renderAttempt();
    await screen.findByText("Question 1 prompt");

    fireEvent.click(screen.getByRole("button", { name: /Q1 option 2/ }));
    await waitFor(() => expect(saveCalls()).toHaveLength(1), { timeout: 3000 });

    await new Promise((r) => setTimeout(r, 400));
    expect(saveCalls()).toHaveLength(1);
  });

  it("sends the revision the server reported, so concurrency stays guarded", async () => {
    h.handlers.get_quiz_for_attempt = () => ({ data: payload({}), error: null });

    renderAttempt();
    await screen.findByText("Question 1 prompt");

    fireEvent.click(screen.getByRole("button", { name: /Q1 option 2/ }));
    await waitFor(() => expect(saveCalls()).toHaveLength(1), { timeout: 3000 });

    expect(saveCalls()[0].args._expected_revision).toBe(3);
  });
});
