import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mutable mock state (hoisted so the module mocks can close over it) ──────
const h = vi.hoisted(() => ({
  slugInfo: { slug: "srisarjana" as string | null, isApex: false, isPreview: false },
  auth: { user: null as null | { id: string; email?: string }, isLoading: false },
  rpc: (..._args: unknown[]): unknown => {
    throw new Error("rpc not configured for this test");
  },
  tables: {} as Record<string, () => unknown>,
  fromCalls: {} as Record<string, number>,
}));

// The hostname → slug step is covered by tenantSubdomain.test.ts; pin it here
// so these tests exercise only the bootstrap state machines.
vi.mock("@/lib/tenantSubdomain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tenantSubdomain")>();
  return { ...actual, getTenantSubdomain: () => h.slugInfo };
});

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: h.auth.user, isLoading: h.auth.isLoading }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => h.rpc(...args),
    from: (table: string) => {
      h.fromCalls[table] = (h.fromCalls[table] ?? 0) + 1;
      const factory = h.tables[table];
      if (!factory) throw new Error(`unexpected table read: ${table}`);
      return factory();
    },
  },
}));

import { TenantProvider } from "./TenantContext";

// ── RPC doubles (postgrest thenable with .abortSignal) ──────────────────────
function rpcBuilder(settle: (signal: AbortSignal) => Promise<{ data: unknown; error: unknown }>) {
  return {
    abortSignal(signal: AbortSignal) {
      return settle(signal);
    },
  };
}
const rpcResolves = (data: unknown, error: unknown = null) =>
  rpcBuilder(() => Promise.resolve({ data, error }));
const rpcHangs = () =>
  rpcBuilder(
    (signal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () =>
          reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
        );
      }),
  );

// ── Table doubles ───────────────────────────────────────────────────────────
// Chainable postgrest-like builder. "hang" models the real library's abort
// behaviour: the promise RESOLVES with { error } once the signal fires
// (postgrest catches fetch rejections when shouldThrowOnError is false).
type TableBehavior = { data: unknown; error?: unknown } | "hang";
function table(behavior: TableBehavior) {
  return () => {
    let signal: AbortSignal | undefined;
    const b: Record<string, unknown> = {};
    for (const method of ["select", "eq", "order", "maybeSingle"]) {
      b[method] = () => b;
    }
    b.abortSignal = (s: AbortSignal) => {
      signal = s;
      return b;
    };
    b.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) => {
      const p: Promise<unknown> =
        behavior === "hang"
          ? new Promise((resolve) => {
              signal?.addEventListener("abort", () =>
                resolve({ data: null, error: { name: "AbortError", message: "aborted" } }),
              );
            })
          : Promise.resolve({ data: behavior.data, error: behavior.error ?? null });
      return p.then(onFulfilled, onRejected);
    };
    return b;
  };
}

const USER = { id: "u-1", email: "student@example.my" };
const TENANT_ROW = {
  id: "c-1",
  name: "Sri Sarjana",
  logo_url: null,
  subdomain_slug: "srisarjana",
  theme_config: {},
  feature_flags: {},
};
const centerRow = (id: string, slug: string | null) => ({
  id,
  name: id === "c-1" ? "Sri Sarjana" : "Other Centre",
  logo_url: null,
  subdomain_slug: slug,
  theme_config: {},
  feature_flags: {},
});

const APEX = { slug: null, isApex: true, isPreview: false };
const TENANT_HOST = { slug: "srisarjana", isApex: false, isPreview: false };

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
const SPINNER_COPY = /Loading your organisation/i;

beforeEach(() => {
  h.slugInfo = { ...TENANT_HOST };
  h.auth = { user: null, isLoading: false };
  h.rpc = () => {
    throw new Error("rpc not configured for this test");
  };
  h.tables = {};
  h.fromCalls = {};
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ════════════════════════════════════════════════════════════════════════════
// Subdomain tenant lookup (tenant hosts)
// ════════════════════════════════════════════════════════════════════════════
describe("TenantProvider tenant lookup", () => {
  it("renders the app when the backend returns a tenant row", async () => {
    h.rpc = () => rpcResolves([TENANT_ROW]);
    renderProvider();
    expect(await screen.findByText("APP CONTENT")).toBeInTheDocument();
  });

  it("shows 'not a workspace' ONLY when the backend confirms no tenant", async () => {
    h.rpc = () => rpcResolves([]);
    renderProvider();
    expect(await screen.findByText(NOT_FOUND_COPY)).toBeInTheDocument();
    expect(screen.queryByText(FAILURE_COPY)).not.toBeInTheDocument();
  });

  it("shows a connectivity error — NOT 'not a workspace' — when the RPC errors", async () => {
    const rpcSpy = vi.fn(() => rpcResolves(null, { message: "TypeError: Failed to fetch" }));
    h.rpc = rpcSpy;
    renderProvider();

    expect(await screen.findByText(FAILURE_COPY, undefined, { timeout: 5000 })).toBeInTheDocument();
    // This regression produced the tenant-host half of the incident.
    expect(screen.queryByText(NOT_FOUND_COPY)).not.toBeInTheDocument();
    expect(screen.queryByText("APP CONTENT")).not.toBeInTheDocument();
    // Exactly two calls: initial attempt + one retry. Never a loop.
    expect(rpcSpy).toHaveBeenCalledTimes(2);
  });

  it("retries a fast failure exactly once, then succeeds without user action", async () => {
    const rpcSpy = vi
      .fn()
      .mockReturnValueOnce(rpcResolves(null, { message: "503 Service Unavailable" }))
      .mockReturnValueOnce(rpcResolves([TENANT_ROW]));
    h.rpc = rpcSpy;
    renderProvider();
    expect(await screen.findByText("APP CONTENT", undefined, { timeout: 5000 })).toBeInTheDocument();
    expect(rpcSpy).toHaveBeenCalledTimes(2);
  });

  it("bounds a hung tenant RPC instead of gating forever", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const rpcSpy = vi.fn(() => rpcHangs());
    h.rpc = rpcSpy;
    renderProvider();

    await vi.advanceTimersByTimeAsync(9_000);
    expect(screen.queryByText(FAILURE_COPY)).not.toBeInTheDocument();
    expect(screen.getByText(SPINNER_COPY)).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(2_000);
    await waitFor(() => expect(screen.getByText(FAILURE_COPY)).toBeInTheDocument());
    expect(screen.queryByText(NOT_FOUND_COPY)).not.toBeInTheDocument();
    // A timeout is NOT auto-retried — it already spent the whole budget.
    expect(rpcSpy).toHaveBeenCalledTimes(1);
  });

  it("recovers via the explicit retry action", async () => {
    h.rpc = () => rpcResolves(null, { message: "Failed to fetch" });
    renderProvider();
    await screen.findByText(FAILURE_COPY, undefined, { timeout: 5000 });

    h.rpc = () => rpcResolves([TENANT_ROW]);
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(await screen.findByText("APP CONTENT")).toBeInTheDocument();
  });

  it("never renders app content while a retry is in flight", async () => {
    h.rpc = () => rpcResolves(null, { message: "Failed to fetch" });
    renderProvider();
    await screen.findByText(FAILURE_COPY, undefined, { timeout: 5000 });

    h.rpc = () => rpcHangs();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    await waitFor(() => expect(screen.getByText(SPINNER_COPY)).toBeInTheDocument());
    expect(screen.queryByText("APP CONTENT")).not.toBeInTheDocument();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Apex bootstrap (the arasaplus.info incident)
// ════════════════════════════════════════════════════════════════════════════
describe("TenantProvider apex bootstrap", () => {
  it("apex + anonymous visitor renders immediately (no lookups, no gate)", async () => {
    h.slugInfo = { ...APEX };
    h.auth = { user: null, isLoading: false };
    renderProvider();
    expect(await screen.findByText("APP CONTENT")).toBeInTheDocument();
    // No tenant RPC and no table reads for an anonymous apex visitor.
    expect(Object.keys(h.fromCalls)).toEqual([]);
  });

  it("apex + authenticated user renders once the centre resolves", async () => {
    h.slugInfo = { ...APEX };
    h.auth = { user: USER, isLoading: false };
    h.tables = {
      user_roles: table({ data: [{ role: "student" }] }),
      profiles: table({ data: { center_id: "c-2" } }),
      // subdomain_slug null so the HQ handoff interstitial does not trigger.
      tuition_centers: table({ data: centerRow("c-2", null) }),
    };
    renderProvider();
    expect(await screen.findByText("APP CONTENT")).toBeInTheDocument();
  });

  it("apex + authenticated + hung profiles query escapes to a bounded failure screen", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    h.slugInfo = { ...APEX };
    h.auth = { user: USER, isLoading: false };
    h.tables = {
      user_roles: table({ data: [{ role: "student" }] }),
      profiles: table("hang"),
    };
    renderProvider();

    // Inside the budget: still the loading gate (this used to last forever).
    await vi.advanceTimersByTimeAsync(9_000);
    expect(screen.getByText(SPINNER_COPY)).toBeInTheDocument();
    expect(screen.queryByText("APP CONTENT")).not.toBeInTheDocument();

    // Past the budget: aborted → actionable failure, never "not a workspace".
    await vi.advanceTimersByTimeAsync(2_000);
    await waitFor(() => expect(screen.getByText(FAILURE_COPY)).toBeInTheDocument());
    expect(screen.queryByText(NOT_FOUND_COPY)).not.toBeInTheDocument();
    // Timeout is terminal for the automatic flow: exactly one attempt.
    expect(h.fromCalls.profiles).toBe(1);
  });

  it("apex + authenticated + hung user_roles query escapes to a bounded failure screen", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    h.slugInfo = { ...APEX };
    h.auth = { user: USER, isLoading: false };
    h.tables = {
      user_roles: table("hang"),
      profiles: table({ data: { center_id: "c-2" } }),
    };
    renderProvider();

    await vi.advanceTimersByTimeAsync(9_000);
    expect(screen.getByText(SPINNER_COPY)).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(2_000);
    await waitFor(() => expect(screen.getByText(FAILURE_COPY)).toBeInTheDocument());
    expect(screen.queryByText(NOT_FOUND_COPY)).not.toBeInTheDocument();
    expect(h.fromCalls.user_roles).toBe(1);
  });

  it("apex + authenticated + fast query error retries once, then shows the failure screen", async () => {
    h.slugInfo = { ...APEX };
    h.auth = { user: USER, isLoading: false };
    h.tables = {
      user_roles: table({ data: [{ role: "student" }] }),
      profiles: table({ data: null, error: { message: "503 Service Unavailable" } }),
    };
    renderProvider();

    expect(await screen.findByText(FAILURE_COPY, undefined, { timeout: 5000 })).toBeInTheDocument();
    // Initial attempt + exactly one automatic retry. Never a loop.
    expect(h.fromCalls.profiles).toBe(2);
  });

  it("centre-resolution failure recovers via the explicit retry action", async () => {
    h.slugInfo = { ...APEX };
    h.auth = { user: USER, isLoading: false };
    h.tables = {
      user_roles: table({ data: [{ role: "student" }] }),
      profiles: table({ data: null, error: { message: "Failed to fetch" } }),
    };
    renderProvider();
    await screen.findByText(FAILURE_COPY, undefined, { timeout: 5000 });

    h.tables.profiles = table({ data: { center_id: "c-2" } });
    h.tables.tuition_centers = table({ data: centerRow("c-2", null) });
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(await screen.findByText("APP CONTENT", undefined, { timeout: 5000 })).toBeInTheDocument();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Security-relevant behaviour that must survive the hardening
// ════════════════════════════════════════════════════════════════════════════
describe("TenantProvider protections", () => {
  it("still blocks a user from another centre on a tenant host (mismatch intact)", async () => {
    h.slugInfo = { ...TENANT_HOST };
    h.auth = { user: USER, isLoading: false };
    h.rpc = () => rpcResolves([TENANT_ROW]); // host resolves to Sri Sarjana (c-1)
    h.tables = {
      user_roles: table({ data: [{ role: "student" }] }),
      profiles: table({ data: { center_id: "c-2" } }), // user belongs to c-2
      tuition_centers: table({ data: centerRow("c-2", "othercentre") }),
    };
    renderProvider();

    expect(
      await screen.findByText(/You don't have access to Sri Sarjana/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("APP CONTENT")).not.toBeInTheDocument();
  });

  it("does not render the workspace when centre resolution fails on a tenant host", async () => {
    // Without the user's centre the mismatch check cannot run, so the app
    // must fail closed into the connectivity screen — not open into the shell.
    h.slugInfo = { ...TENANT_HOST };
    h.auth = { user: USER, isLoading: false };
    h.rpc = () => rpcResolves([TENANT_ROW]);
    h.tables = {
      user_roles: table({ data: [{ role: "student" }] }),
      profiles: table({ data: null, error: { message: "Failed to fetch" } }),
    };
    renderProvider();

    expect(await screen.findByText(FAILURE_COPY, undefined, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByText("APP CONTENT")).not.toBeInTheDocument();
    expect(screen.queryByText(NOT_FOUND_COPY)).not.toBeInTheDocument();
  });
});
