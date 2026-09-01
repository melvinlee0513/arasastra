/**
 * A feature nobody can navigate to is not shipped.
 *
 * Phases 3–5 routed twelve Question Bank pages, three live-quiz pages and the
 * student join screen, and NOTHING in the app linked to any of them. Turning
 * `questionBank` or `liveQuizMultiplayer` on in production would have changed
 * nothing a tutor could see — the pages existed only for someone who typed the
 * URL. Quiz analytics was the one that worked, because it had a link.
 *
 * These pin the entry point to the flag in both directions: present when the
 * centre is enabled, absent when it is not. Absent matters as much as present —
 * a link into a FeatureUnavailable page is its own bug.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const h = vi.hoisted(() => ({
  flags: {} as Record<string, boolean | undefined>,
}));

vi.mock("@/hooks/useFeature", () => ({
  useFeatureEnabled: (flag: string) => h.flags[flag] === true,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: () => Promise.resolve({ data: [], error: null }),
    from: () => ({
      select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }),
    }),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: () => {},
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
    data: { canManage: true, isEnrolled: true, klass: { id: "c1", title: "Physics Form 4" } },
    isLoading: false,
  }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { ClassQuizzesManager } from "./ClassQuizzesManager";

const CLASS_ID = "11111111-1111-4111-8111-111111111111";

function renderManager() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/tutor/classes/${CLASS_ID}/quizzes`]}>
        <Routes>
          <Route
            path="/tutor/classes/:classId/quizzes"
            element={<ClassQuizzesManager variant="tutor" />}
          />
          <Route path="*" element={<div>away</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.flags = {};
});

describe("the tutor's way into the Question Bank", () => {
  it("is absent when the centre has questionBank off", async () => {
    renderManager();
    await screen.findByText(/New quiz/);
    expect(screen.queryByRole("button", { name: /Question bank/i })).toBeNull();
  });

  it("appears when the centre has questionBank on", async () => {
    h.flags.questionBank = true;
    renderManager();
    expect(await screen.findByRole("button", { name: /Question bank/i })).toBeTruthy();
  });
});

describe("the tutor's way into hosting a live quiz", () => {
  it("is absent when liveQuizMultiplayer is off", async () => {
    renderManager();
    await screen.findByText(/New quiz/);
    expect(screen.queryByRole("button", { name: /Host live/i })).toBeNull();
  });

  it("appears when liveQuizMultiplayer is on", async () => {
    h.flags.liveQuizMultiplayer = true;
    renderManager();
    expect(await screen.findByRole("button", { name: /Host live/i })).toBeTruthy();
  });
});

describe("the two flags are independent", () => {
  it("enabling the bank does not surface live hosting", async () => {
    h.flags.questionBank = true;
    renderManager();
    expect(await screen.findByRole("button", { name: /Question bank/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Host live/i })).toBeNull();
  });

  it("enabling live hosting does not surface the bank", async () => {
    h.flags.liveQuizMultiplayer = true;
    renderManager();
    expect(await screen.findByRole("button", { name: /Host live/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Question bank/i })).toBeNull();
  });
});

describe("New quiz is never gated", () => {
  it("is there whatever the Phase 3-5 flags say — it predates all of them", async () => {
    renderManager();
    expect(await screen.findByRole("button", { name: /New quiz/i })).toBeTruthy();
  });
});
