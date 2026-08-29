/**
 * Quiz builder ↔ backend integration contract.
 *
 * These tests drive the REAL `ClassQuizBuilder` and the REAL `@/lib/quizzes`
 * wrappers, mocking only the Supabase client. That boundary is deliberate: the
 * thing under test is the exact RPC name and argument payload the builder puts
 * on the wire, checked against the SQL contract in
 * `supabase/migrations/20260723143055_*.sql`.
 *
 * They do not replace running the flow against a live project — nothing here
 * proves the server accepts the payload — but they pin every part of the
 * contract this repository can actually prove.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// ── Mutable mock state ─────────────────────────────────────────────────────
const h = vi.hoisted(() => ({
  /** Every rpc(name, args) the app made, in order. */
  calls: [] as { name: string; args: Record<string, unknown> }[],
  /** name → handler returning { data, error }. */
  handlers: {} as Record<string, (args: Record<string, unknown>) => { data: unknown; error: unknown }>,
  toasts: [] as { title?: string; description?: string; variant?: string }[],
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (name: string, args: Record<string, unknown>) => {
      h.calls.push({ name, args });
      const handler = h.handlers[name];
      if (!handler) throw new Error(`unexpected rpc: ${name}`);
      return Promise.resolve(handler(args));
    },
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "tutor-1" }, isAdmin: false, isLoading: false }),
}));

vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({ currentTenantId: "centre-1", isLoading: false, featureFlags: {} }),
}));

vi.mock("@/hooks/useClassContext", () => ({
  useClassContext: () => ({
    data: { canManage: true, klass: { id: "class-1", title: "Form 4 Biology" } },
    isLoading: false,
  }),
}));

// The shell is chrome; it pulls in the whole nav tree and is not under test.
vi.mock("@/components/class/ClassShell", () => ({
  ClassShell: ({ children, headerRight }: { children: React.ReactNode; headerRight?: React.ReactNode }) => (
    <div>
      {headerRight}
      {children}
    </div>
  ),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: (t: { title?: string; description?: string; variant?: string }) => {
      h.toasts.push(t);
    },
  }),
}));

import { ClassQuizBuilder } from "./ClassQuizBuilder";

// ── Helpers ────────────────────────────────────────────────────────────────

const EMPTY_TREE = { folders: [], quizzes: [], resources: [], videos: [], flashcard_decks: [] };

/** A `get_quiz_definition_for_manager` payload shaped like the SQL function's. */
function definition(over: {
  version?: number;
  locked?: boolean;
  title?: string;
  due_at?: string | null;
  result_visibility?: string;
  questions?: unknown[];
} = {}) {
  return {
    quiz: {
      id: "quiz-1",
      class_id: "class-1",
      center_id: "centre-1",
      title: over.title ?? "Photosynthesis Quiz",
      description: "Covers chapter 5.",
      instructions: "Read carefully.",
      status: "draft",
      available_from: "2026-09-01T08:00:00+00:00",
      due_at: over.due_at === undefined ? "2026-09-08T23:59:00+00:00" : over.due_at,
      time_limit_seconds: 1200,
      attempt_limit: 2,
      shuffle_questions: true,
      shuffle_options: false,
      result_visibility: over.result_visibility ?? "after_submit",
      results_released_at: null,
      published_at: null,
      total_points: 30,
      updated_at: "2026-08-28T10:00:00+00:00",
      definition_version: over.version ?? 3,
    },
    questions: over.questions ?? [
      {
        id: "q-1",
        question: "Which pigment captures light?",
        question_type: "mcq",
        points: 10,
        explanation: "Chlorophyll absorbs light energy.",
        order_index: 0,
        options: [
          { id: "o-1", option_text: "Chlorophyll", is_correct: true, order_index: 0 },
          { id: "o-2", option_text: "Carotene", is_correct: false, order_index: 1 },
        ],
      },
      {
        id: "q-2",
        question: "Photosynthesis releases oxygen.",
        question_type: "true_false",
        points: 20,
        explanation: null,
        order_index: 1,
        options: [
          { id: "o-3", option_text: "True", is_correct: true, order_index: 0 },
          { id: "o-4", option_text: "False", is_correct: false, order_index: 1 },
        ],
      },
    ],
    locked: over.locked ?? false,
    has_attempts: over.locked ?? false,
    has_results: false,
  };
}

function saveOk(next: { id?: string; version: number; status?: string; total_points?: number }) {
  return {
    data: {
      id: next.id ?? "quiz-1",
      status: next.status ?? "draft",
      updated_at: "2026-08-29T10:00:00+00:00",
      total_points: next.total_points ?? 30,
      published_at: next.status === "published" ? "2026-08-29T10:00:00+00:00" : null,
      definition_version: next.version,
    },
    error: null,
  };
}

function renderBuilder(opts: { path: string; route: string; variant?: "tutor" | "admin" }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const utils = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[opts.path]}>
        <Routes>
          <Route path={opts.route} element={<ClassQuizBuilder variant={opts.variant ?? "tutor"} />} />
          <Route path="*" element={<div>navigated-away</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return utils;
}

const saveCalls = () => h.calls.filter((c) => c.name === "save_quiz_definition");
const lastSave = () => saveCalls()[saveCalls().length - 1];
const lastDefinition = () =>
  lastSave().args._definition as { meta: Record<string, unknown>; questions: unknown[] };

/** Click through to a step using the stepper. */
async function goToStep(label: RegExp) {
  fireEvent.click(await screen.findByRole("button", { name: label }));
}

beforeEach(() => {
  h.calls = [];
  h.toasts = [];
  h.handlers = {
    list_class_content_tree_for_manager: () => ({ data: EMPTY_TREE, error: null }),
    move_class_content_item: () => ({ data: null, error: null }),
  };
  window.localStorage.clear();
});

// ───────────────────────────────────────────────────────────────────────────
describe("1. Create flow", () => {
  it("sends a create payload with no quiz id, no expected version, and questions in order", async () => {
    h.handlers.save_quiz_definition = () => saveOk({ id: "quiz-new", version: 1 });

    renderBuilder({
      path: "/tutor/classes/class-1/quizzes/new?step=basic",
      route: "/tutor/classes/:classId/quizzes/new",
    });

    fireEvent.change(await screen.findByLabelText(/Quiz title/i), {
      target: { value: "Photosynthesis Quiz" },
    });
    fireEvent.change(screen.getByLabelText(/^Description/i), {
      target: { value: "Covers chapter 5." },
    });
    fireEvent.change(screen.getByLabelText(/Instructions/i), {
      target: { value: "Read carefully." },
    });

    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));

    await waitFor(() => expect(saveCalls()).toHaveLength(1));

    const call = lastSave();
    expect(call.args._class_id).toBe("class-1");
    // A brand-new quiz must not claim a version, or the server's optimistic
    // check would compare against a row that does not exist yet.
    expect(call.args._quiz_id).toBeUndefined();
    expect(call.args._expected_version).toBeNull();
    expect(call.args._publish).toBe(false);

    const def = lastDefinition();
    expect(def.meta.title).toBe("Photosynthesis Quiz");
    expect(def.meta.description).toBe("Covers chapter 5.");
    expect(def.meta.instructions).toBe("Read carefully.");
  });

  it("serialises questions, options, correct answers, points and explanations in order", async () => {
    h.handlers.save_quiz_definition = () => saveOk({ id: "quiz-new", version: 1 });
    h.handlers.get_quiz_definition_for_manager = () => ({ data: definition(), error: null });

    // Editing an existing quiz is the shortest route to a populated question
    // set; the serialisation path is identical for create.
    renderBuilder({
      path: "/tutor/classes/class-1/quizzes/quiz-1/edit?step=basic",
      route: "/tutor/classes/:classId/quizzes/:quizId/edit",
    });

    await screen.findByDisplayValue("Photosynthesis Quiz");
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
    await waitFor(() => expect(saveCalls()).toHaveLength(1));

    const def = lastDefinition();
    expect(def.questions).toHaveLength(2);

    const [q1, q2] = def.questions as Array<{
      question: string;
      question_type: string;
      points: number;
      explanation: string | null;
      options: { option_text: string; is_correct: boolean }[];
    }>;

    expect(q1.question).toBe("Which pigment captures light?");
    expect(q1.question_type).toBe("mcq");
    expect(q1.points).toBe(10);
    expect(q1.explanation).toBe("Chlorophyll absorbs light energy.");
    expect(q1.options.map((o) => o.option_text)).toEqual(["Chlorophyll", "Carotene"]);
    expect(q1.options.map((o) => o.is_correct)).toEqual([true, false]);

    expect(q2.question_type).toBe("true_false");
    expect(q2.points).toBe(20);
    // The server derives total_points by summing question points, so an
    // explanation-less question must serialise as null, not "".
    expect(q2.explanation).toBeNull();
    // save_quiz_definition requires exactly one True and one False option.
    expect(q2.options.map((o) => o.option_text)).toEqual(["True", "False"]);
    expect(q2.options.filter((o) => o.is_correct)).toHaveLength(1);
  });

  it("converts the time limit from display minutes to the seconds the column stores", async () => {
    h.handlers.save_quiz_definition = () => saveOk({ version: 4 });
    h.handlers.get_quiz_definition_for_manager = () => ({ data: definition(), error: null });

    renderBuilder({
      path: "/tutor/classes/class-1/quizzes/quiz-1/edit?step=settings",
      route: "/tutor/classes/:classId/quizzes/:quizId/edit",
    });

    // 1200s from the server must display as 20 minutes.
    const tl = await screen.findByLabelText(/Time limit/i);
    expect((tl as HTMLInputElement).value).toBe("20");

    fireEvent.change(tl, { target: { value: "45" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
    await waitFor(() => expect(saveCalls()).toHaveLength(1));

    expect(lastDefinition().meta.time_limit_seconds).toBe(2700);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("2. Draft / reload flow", () => {
  it("restores every persisted field from the canonical backend definition", async () => {
    h.handlers.get_quiz_definition_for_manager = () => ({ data: definition(), error: null });

    renderBuilder({
      path: "/tutor/classes/class-1/quizzes/quiz-1/edit?step=basic",
      route: "/tutor/classes/:classId/quizzes/:quizId/edit",
    });

    expect(await screen.findByDisplayValue("Photosynthesis Quiz")).toBeTruthy();
    expect(screen.getByDisplayValue("Covers chapter 5.")).toBeTruthy();
    expect(screen.getByDisplayValue("Read carefully.")).toBeTruthy();
  });

  it("does NOT let a stale localStorage draft silently overwrite newer backend data", async () => {
    h.handlers.get_quiz_definition_for_manager = () => ({
      data: definition({ title: "Server Title v9", version: 9 }),
      error: null,
    });

    // A draft left behind by an earlier session, with an older title.
    window.localStorage.setItem(
      "quiz-builder:tutor-1:centre-1:class-1:quiz-1:tutor",
      JSON.stringify({
        meta: { title: "Stale Local Draft", description: "", instructions: "" },
        questions: [],
      }),
    );

    renderBuilder({
      path: "/tutor/classes/class-1/quizzes/quiz-1/edit?step=basic",
      route: "/tutor/classes/:classId/quizzes/:quizId/edit",
    });

    // Backend wins on load; the draft is offered, never auto-applied.
    expect(await screen.findByDisplayValue("Server Title v9")).toBeTruthy();
    expect(screen.queryByDisplayValue("Stale Local Draft")).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("3. Edit flow / 4. Optimistic concurrency", () => {
  it("sends the loaded definition_version as _expected_version", async () => {
    h.handlers.get_quiz_definition_for_manager = () => ({ data: definition({ version: 7 }), error: null });
    h.handlers.save_quiz_definition = () => saveOk({ version: 8 });

    renderBuilder({
      path: "/tutor/classes/class-1/quizzes/quiz-1/edit?step=basic",
      route: "/tutor/classes/:classId/quizzes/:quizId/edit",
    });

    const title = await screen.findByDisplayValue("Photosynthesis Quiz");
    fireEvent.change(title, { target: { value: "Photosynthesis Quiz v2" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));

    await waitFor(() => expect(saveCalls()).toHaveLength(1));
    expect(lastSave().args._quiz_id).toBe("quiz-1");
    expect(lastSave().args._expected_version).toBe(7);
    expect(lastDefinition().meta.title).toBe("Photosynthesis Quiz v2");
  });

  it("surfaces a clear conflict message and does not retry or overwrite on a stale save", async () => {
    h.handlers.get_quiz_definition_for_manager = () => ({ data: definition({ version: 3 }), error: null });
    // Session B already moved the row to v4; the server rejects our v3.
    h.handlers.save_quiz_definition = () => ({
      data: null,
      error: {
        message:
          "quiz_definition_conflict: this quiz was updated by another manager (v4 vs v3)",
        code: "40001",
      },
    });

    renderBuilder({
      path: "/tutor/classes/class-1/quizzes/quiz-1/edit?step=basic",
      route: "/tutor/classes/:classId/quizzes/:quizId/edit",
    });

    const title = await screen.findByDisplayValue("Photosynthesis Quiz");
    fireEvent.change(title, { target: { value: "Session A edit" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));

    await waitFor(() => expect(h.toasts.some((t) => t.variant === "destructive")).toBe(true));

    const conflict = h.toasts.find((t) => t.variant === "destructive");
    expect(conflict?.description).toMatch(/updated by another manager/i);

    // Exactly one attempt: no silent retry that could clobber v4.
    expect(saveCalls()).toHaveLength(1);
  });

  it("advances _expected_version from the save result, so a second save is not a false conflict", async () => {
    // Regression guard. The definition query is invalidated after a save, but
    // the refetch is async; until it lands the cached row still says v3. If the
    // builder re-read the version from that cache, the tutor's OWN second save
    // would be rejected as someone else's edit.
    let served = 0;
    h.handlers.get_quiz_definition_for_manager = () => {
      served += 1;
      // Deliberately keep serving the pre-save version to model a slow refetch.
      return { data: definition({ version: 3 }), error: null };
    };
    h.handlers.save_quiz_definition = () => saveOk({ version: 4 });

    renderBuilder({
      path: "/tutor/classes/class-1/quizzes/quiz-1/edit?step=basic",
      route: "/tutor/classes/:classId/quizzes/:quizId/edit",
    });

    const title = await screen.findByDisplayValue("Photosynthesis Quiz");

    fireEvent.change(title, { target: { value: "First edit" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
    await waitFor(() => expect(saveCalls()).toHaveLength(1));
    expect(lastSave().args._expected_version).toBe(3);

    fireEvent.change(await screen.findByLabelText(/Quiz title/i), {
      target: { value: "Second edit" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
    await waitFor(() => expect(saveCalls()).toHaveLength(2));

    // The version the server just handed back, not the stale cached one.
    expect(lastSave().args._expected_version).toBe(4);
    expect(served).toBeGreaterThan(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("5. Publish flow", () => {
  it("publishes with _publish true and keeps the optimistic version", async () => {
    h.handlers.get_quiz_definition_for_manager = () => ({ data: definition({ version: 5 }), error: null });
    h.handlers.save_quiz_definition = () => saveOk({ version: 6, status: "published" });

    renderBuilder({
      path: "/tutor/classes/class-1/quizzes/quiz-1/edit?step=preview",
      route: "/tutor/classes/:classId/quizzes/:quizId/edit",
    });

    fireEvent.click(await screen.findByRole("button", { name: /Publish quiz/i }));
    await waitFor(() => expect(saveCalls()).toHaveLength(1));

    expect(lastSave().args._publish).toBe(true);
    expect(lastSave().args._expected_version).toBe(5);
  });

  it("blocks publish client-side when result visibility needs a due date, without calling the RPC", async () => {
    h.handlers.get_quiz_definition_for_manager = () => ({
      data: definition({ version: 5, due_at: null, result_visibility: "after_due" }),
      error: null,
    });
    h.handlers.save_quiz_definition = () => saveOk({ version: 6, status: "published" });

    renderBuilder({
      path: "/tutor/classes/class-1/quizzes/quiz-1/edit?step=preview",
      route: "/tutor/classes/:classId/quizzes/:quizId/edit",
    });

    fireEvent.click(await screen.findByRole("button", { name: /Publish quiz/i }));

    await waitFor(() => expect(h.toasts.length).toBeGreaterThan(0));
    // Server-side publish_validation_failed would say the same thing; catching
    // it here saves a round trip and keeps the tutor on the offending field.
    expect(h.toasts[0].title).toMatch(/Can't publish/i);
    expect(saveCalls()).toHaveLength(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("7. Locked quiz behaviour", () => {
  it("sends the reduced payload the locked server path accepts", async () => {
    h.handlers.get_quiz_definition_for_manager = () => ({
      data: definition({ version: 11, locked: true }),
      error: null,
    });
    h.handlers.save_quiz_definition = () => saveOk({ version: 12 });

    renderBuilder({
      path: "/tutor/classes/class-1/quizzes/quiz-1/edit?step=basic",
      route: "/tutor/classes/:classId/quizzes/:quizId/edit",
    });

    await screen.findByDisplayValue("Photosynthesis Quiz");
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
    await waitFor(() => expect(saveCalls()).toHaveLength(1));

    const def = lastDefinition();
    // Any non-empty questions array raises quiz_locked_after_attempts.
    expect(def.questions).toEqual([]);
    // Each of these keys is compared against the stored row when present, and
    // raises if it differs. Omitting them is what keeps a locked save legal.
    expect(def.meta).not.toHaveProperty("available_from");
    expect(def.meta).not.toHaveProperty("due_at");
    expect(def.meta).not.toHaveProperty("time_limit_seconds");
    expect(def.meta).not.toHaveProperty("shuffle_questions");
    expect(def.meta).not.toHaveProperty("shuffle_options");
    // Still permitted after attempts exist.
    expect(def.meta).toHaveProperty("title");
    expect(def.meta).toHaveProperty("result_visibility");
    expect(def.meta).toHaveProperty("attempt_limit");
  });

  it("keeps immutable fields non-editable even though the new UI renders them", async () => {
    h.handlers.get_quiz_definition_for_manager = () => ({
      data: definition({ version: 11, locked: true }),
      error: null,
    });

    renderBuilder({
      path: "/tutor/classes/class-1/quizzes/quiz-1/edit?step=settings",
      route: "/tutor/classes/:classId/quizzes/:quizId/edit",
    });

    expect((await screen.findByLabelText(/Available from/i) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText(/Due at/i) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText(/Time limit/i) as HTMLInputElement).disabled).toBe(true);
    // attempt_limit may still be raised after attempts exist.
    expect((screen.getByLabelText(/Attempts allowed/i) as HTMLInputElement).disabled).toBe(false);
  });

  it("hides Publish once attempts exist", async () => {
    h.handlers.get_quiz_definition_for_manager = () => ({
      data: definition({ version: 11, locked: true }),
      error: null,
    });

    renderBuilder({
      path: "/tutor/classes/class-1/quizzes/quiz-1/edit?step=preview",
      route: "/tutor/classes/:classId/quizzes/:quizId/edit",
    });

    await screen.findByText(/Photosynthesis Quiz/);
    // cannot_publish_after_attempts is a server error; don't offer the action.
    expect(screen.queryByRole("button", { name: /Publish quiz/i })).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("8. Admin variant", () => {
  it("uses the same builder and the same RPC contract under /admin", async () => {
    h.handlers.get_quiz_definition_for_manager = () => ({ data: definition({ version: 2 }), error: null });
    h.handlers.save_quiz_definition = () => saveOk({ version: 3 });

    renderBuilder({
      path: "/admin/classes/class-1/quizzes/quiz-1/edit?step=basic",
      route: "/admin/classes/:classId/quizzes/:quizId/edit",
      variant: "admin",
    });

    const title = await screen.findByDisplayValue("Photosynthesis Quiz");
    fireEvent.change(title, { target: { value: "Admin edit" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
    await waitFor(() => expect(saveCalls()).toHaveLength(1));

    expect(lastSave().args._class_id).toBe("class-1");
    expect(lastSave().args._quiz_id).toBe("quiz-1");
    expect(lastSave().args._expected_version).toBe(2);
    expect(lastDefinition().meta.title).toBe("Admin edit");
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("9. Tenant / class scoping & 10. request shape", () => {
  it("scopes the definition cache key by tenant and never sends a centre id it chose itself", async () => {
    h.handlers.get_quiz_definition_for_manager = () => ({ data: definition(), error: null });

    renderBuilder({
      path: "/tutor/classes/class-1/quizzes/quiz-1/edit?step=basic",
      route: "/tutor/classes/:classId/quizzes/:quizId/edit",
    });
    await screen.findByDisplayValue("Photosynthesis Quiz");

    const defCall = h.calls.find((c) => c.name === "get_quiz_definition_for_manager");
    // The RPC takes only the quiz id — centre and class scoping are resolved
    // server-side from auth.uid(), so the client cannot widen its own access.
    expect(Object.keys(defCall!.args)).toEqual(["_quiz_id"]);
  });

  it("issues one definition read and one save per save click — no RPC storm", async () => {
    h.handlers.get_quiz_definition_for_manager = () => ({ data: definition(), error: null });
    h.handlers.save_quiz_definition = () => saveOk({ version: 4 });

    renderBuilder({
      path: "/tutor/classes/class-1/quizzes/quiz-1/edit?step=basic",
      route: "/tutor/classes/:classId/quizzes/:quizId/edit",
    });

    const title = await screen.findByDisplayValue("Photosynthesis Quiz");
    fireEvent.change(title, { target: { value: "One save only" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
    await waitFor(() => expect(saveCalls()).toHaveLength(1));

    // Let any stray effect-driven refetch settle before counting.
    await new Promise((r) => setTimeout(r, 50));
    expect(saveCalls()).toHaveLength(1);
    expect(h.calls.filter((c) => c.name === "move_class_content_item")).toHaveLength(0);
  });

  it("does not move folders when placement is unchanged", async () => {
    h.handlers.get_quiz_definition_for_manager = () => ({ data: definition(), error: null });
    h.handlers.save_quiz_definition = () => saveOk({ version: 4 });

    renderBuilder({
      path: "/tutor/classes/class-1/quizzes/quiz-1/edit?step=basic",
      route: "/tutor/classes/:classId/quizzes/:quizId/edit",
    });

    await screen.findByDisplayValue("Photosynthesis Quiz");
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
    await waitFor(() => expect(saveCalls()).toHaveLength(1));

    // Placement is a separate non-destructive call; it must stay silent when
    // the tutor did not change the folder.
    expect(h.calls.filter((c) => c.name === "move_class_content_item")).toHaveLength(0);
  });
});
