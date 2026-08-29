import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mocks ───────────────────────────────────────────────────────────────────
// The hostname → slug step is covered by tenantSubdomain.test.ts; pin it here
// so these tests exercise only the lookup state machine.
vi.mock("@/lib/tenantSubdomain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tenantSubdomain")>();
  return {
    ...actual,
    getTenantSubdomain: () => ({ slug: "srisarjana", isApex: false, isPreview: false }),
  };
});

// Signed-out visitor: the user-centres effect short-circuits, so the gate is
// driven purely by the subdomain lookup.
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, isLoading: false }),
}));

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    from: () => {
      throw new Error("no table reads expected for a signed-out visitor");
    },
  },
}));

import { TenantProvider } from "./TenantContext";

/** Builds the thenable postgrest-js returns, including `.abortSignal()`. */
function builder(settle: (signal: AbortSignal) => Promise<{ data: unknown; error: unknown }>) {
  return {
    abortSignal(signal: AbortSignal) {
      return settle(signal);
    },
  };
}

/** Resolves immediately with a PostgREST-shaped payload. */
const resolves = (data: unknown, error: unknown = null) =>
  builder(() => Promise.resolve({ data, error }));

/** Never settles until the AbortSignal fires — models a hung request. */
const hangs = () =>
  builder(
    (signal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () =>
          reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
        );
      }),
  );

const TENANT_ROW = {
  id: "c-1",
  name: "Sri Sarjana",
  logo_url: null,
  subdomain_slug: "srisarjana",
  theme_config: {},
  feature_flags: {},
};

function renderProvider() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TenantProvider>
        <div>APP CONTENT</div>
      </TenantProvider>
    </QueryClientProvider>,
  );
}

const NOT_FOUND_COPY = /isn't an Aras A\+ workspace/i;
const FAILURE_COPY = /We couldn't load this workspace/i;

beforeEach(() => {
  rpc.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("TenantProvider tenant lookup", () => {
  it("renders the app when the backend returns a tenant row", async () => {
    rpc.mockReturnValue(resolves([TENANT_ROW]));
    renderProvider();
    expect(await screen.findByText("APP CONTENT")).toBeInTheDocument();
  });

  it("shows 'not a workspace' ONLY when the backend confirms no tenant", async () => {
    rpc.mockReturnValue(resolves([]));
    renderProvider();
    expect(await screen.findByText(NOT_FOUND_COPY)).toBeInTheDocument();
    expect(screen.queryByText(FAILURE_COPY)).not.toBeInTheDocument();
  });

  it("shows a connectivity error — NOT 'not a workspace' — when the RPC errors", async () => {
    // Both attempts fail: the first triggers the single controlled retry.
    rpc.mockReturnValue(resolves(null, { message: "TypeError: Failed to fetch" }));
    renderProvider();

    expect(await screen.findByText(FAILURE_COPY, undefined, { timeout: 5000 })).toBeInTheDocument();
    // This is the regression that produced the production incident.
    expect(screen.queryByText(NOT_FOUND_COPY)).not.toBeInTheDocument();
    expect(screen.queryByText("APP CONTENT")).not.toBeInTheDocument();
    // Exactly two calls: initial attempt + one retry. Never a loop.
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("retries a fast failure exactly once, then succeeds without user action", async () => {
    rpc
      .mockReturnValueOnce(resolves(null, { message: "503 Service Unavailable" }))
      .mockReturnValueOnce(resolves([TENANT_ROW]));
    renderProvider();
    expect(await screen.findByText("APP CONTENT", undefined, { timeout: 5000 })).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("bounds a hung request instead of gating forever, and does not double the wait", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    rpc.mockReturnValue(hangs());
    renderProvider();

    // Still gated before the budget elapses.
    await vi.advanceTimersByTimeAsync(9_000);
    expect(screen.queryByText(FAILURE_COPY)).not.toBeInTheDocument();
    expect(screen.getByText(/Loading your organisation/i)).toBeInTheDocument();

    // Past the 10s budget the request is aborted and the failure surfaces.
    await vi.advanceTimersByTimeAsync(2_000);
    await waitFor(() => expect(screen.getByText(FAILURE_COPY)).toBeInTheDocument());
    expect(screen.queryByText(NOT_FOUND_COPY)).not.toBeInTheDocument();
    // A timeout is NOT auto-retried — it already spent the whole budget.
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("recovers via the explicit retry action", async () => {
    rpc.mockReturnValue(resolves(null, { message: "Failed to fetch" }));
    renderProvider();
    await screen.findByText(FAILURE_COPY, undefined, { timeout: 5000 });

    rpc.mockReturnValue(resolves([TENANT_ROW]));
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(await screen.findByText("APP CONTENT")).toBeInTheDocument();
  });

  it("never renders app content while a retry is in flight", async () => {
    rpc.mockReturnValue(resolves(null, { message: "Failed to fetch" }));
    renderProvider();
    await screen.findByText(FAILURE_COPY, undefined, { timeout: 5000 });

    rpc.mockReturnValue(hangs());
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    // Re-gated, not leaking the app against an unverified tenant.
    await waitFor(() =>
      expect(screen.getByText(/Loading your organisation/i)).toBeInTheDocument(),
    );
    expect(screen.queryByText("APP CONTENT")).not.toBeInTheDocument();
  });
});
