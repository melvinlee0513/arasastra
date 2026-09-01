import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  getTenantSubdomain,
  tenantHrefFor,
  ROOT_DOMAIN,
} from "@/lib/tenantSubdomain";

export type TenantThemeConfig = {
  primaryColor?: string;
  accentColor?: string;
  midnightColor?: string;
  logoUrl?: string;
  faviconUrl?: string;
  loginHeroTitle?: string;
  dashboardTitle?: string;
  cardStyle?: string;
  navStyle?: string;
};

export type TenantFeatureFlags = {
  gamification?: boolean;
  quizXP?: boolean;
  leaderboards?: boolean;
  flashcards?: boolean;
  videoReplays?: boolean;
  progressRings?: boolean;
  googleDrive?: boolean;
  oneDrive?: boolean;
  /**
   * The Phase 1-5 quiz work. All four default OFF and are enabled per centre by
   * an UPDATE against `tuition_centers.feature_flags` — never by a hardcoded
   * centre id or slug.
   *
   * The first three are enforced in the database as well as in the router
   * (20260906000100), so an off flag means the RPCs refuse, not merely that the
   * screens are unlinked:
   *   liveQuizMultiplayer  create_live_quiz_session
   *   quizAnalytics        _quiz_for_analytics, shared by all five RPCs
   *   questionBank         _my_question_bank_center and _can_use_question_bank,
   *                        so the RLS policies are gated too
   *
   * expandedQuestionTypes is an AUTHORING gate only: it decides which types the
   * picker offers. It is deliberately not enforced on question_type in the
   * database, because the builder rewrites a quiz's questions on every save and
   * a database gate would stop a tutor editing a quiz that already contains
   * one. Existing content keeps working and keeps grading whatever it says.
   */
  liveQuizMultiplayer?: boolean;
  quizAnalytics?: boolean;
  questionBank?: boolean;
  expandedQuestionTypes?: boolean;
  [key: string]: boolean | undefined;
};

export type TenantCenter = {
  id: string;
  name: string;
  logoUrl: string | null;
  subdomainSlug?: string | null;
  themeConfig?: TenantThemeConfig;
  featureFlags?: TenantFeatureFlags;
};

/**
 * Outcome of resolving the hostname's tenant slug against the backend.
 *
 * `not_found` and the two failure states are deliberately separate. Only
 * `not_found` means the backend answered and confirmed no active centre owns
 * this slug; `error` and `timeout` mean we never learned the answer, so the
 * user must never be told the workspace does not exist.
 */
export type TenantLookupStatus =
  | "resolving"
  | "resolved"
  | "not_found"
  | "error"
  | "timeout";

/**
 * Outcome of resolving the signed-in user's centre (roles + profile +
 * tuition centre). Separate from the subdomain lookup because it runs for a
 * different reason (who is this user?) and fails independently.
 *
 * "resolved" covers the legitimate no-centre case (center stays null); the
 * failure states mean the queries themselves did not complete, so we do not
 * know the user's centre and must not render as if we did.
 */
export type CenterLookupStatus =
  | "idle"
  | "resolving"
  | "resolved"
  | "error"
  | "timeout";

/** Budget for a single bootstrap lookup (tenant or centre) before it is aborted. */
const TENANT_LOOKUP_TIMEOUT_MS = 10_000;
/** Delay before the single automatic retry (fast failures only). */
const TENANT_RETRY_DELAY_MS = 1_200;

type TenantContextValue = {
  center: TenantCenter | null;
  currentTenantId: string | null;
  setCurrentTenantId: (id: string) => void;
  availableCenters: TenantCenter[];
  isSuperAdmin: boolean;
  isLoading: boolean;
  error: string | null;
  refreshCenters: () => Promise<void>;
  subdomainSlug: string | null;
  subdomainTenant: TenantCenter | null;
  /** Distinguishes "no such tenant" from "we could not reach the backend". */
  tenantLookupStatus: TenantLookupStatus;
  /** Same distinction for the signed-in user's centre resolution. */
  centerLookupStatus: CenterLookupStatus;
  /** Re-runs the bootstrap lookups (used by the failure screens). */
  retryTenantLookup: () => void;
  isTenantMismatch: boolean;
  /** Convenience flags for gating UI + auth flows. */
  isHQHost: boolean;
  isTenantHost: boolean;
  canonicalHost: string | null;
  themeConfig: TenantThemeConfig;
  featureFlags: TenantFeatureFlags;
};

const DEFAULT_FLAGS: TenantFeatureFlags = {
  gamification: true,
  quizXP: true,
  leaderboards: true,
  flashcards: true,
  videoReplays: true,
  progressRings: true,
  googleDrive: false,
  oneDrive: false,
};

const TenantContext = createContext<TenantContextValue | undefined>(undefined);

export function TenantProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();

  const [center, setCenter] = useState<TenantCenter | null>(null);
  const [availableCenters, setAvailableCenters] = useState<TenantCenter[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasResolvedOnce, setHasResolvedOnce] = useState(false);
  // Track which user we already ATTEMPTED centre resolution for (success or
  // terminal failure). This prevents Supabase token refreshes (which produce a
  // fresh `user` object with the SAME id) from re-triggering tenant resolution
  // and flashing the "Loading your organisation…" gate over modals and forms —
  // and, on failure, prevents an accidental retry loop. Cleared by the manual
  // retry action and on sign-out.
  const [attemptedForUserId, setAttemptedForUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subdomainTenant, setSubdomainTenant] = useState<TenantCenter | null>(null);
  const [subdomainStatus, setSubdomainStatus] = useState<TenantLookupStatus>("resolving");
  const [centerStatus, setCenterStatus] = useState<CenterLookupStatus>("idle");
  // Bumping this re-runs the lookup effects (manual retry from a failure screen).
  const [lookupNonce, setLookupNonce] = useState(0);

  const subdomainInfo = useMemo(() => getTenantSubdomain(), []);
  const subdomainSlug = subdomainInfo.slug;
  const isHQHost = subdomainInfo.isApex && !subdomainInfo.isPreview;
  const isTenantHost = !!subdomainSlug;

  const retryTenantLookup = useCallback(() => {
    // Allow the centre-resolution effect to run again for the same user.
    setAttemptedForUserId(null);
    setLookupNonce((n) => n + 1);
  }, []);

  // Resolve the tenant bound to the current subdomain. Runs anonymously and is
  // independent of auth, so it must be bounded on its own: without a timeout a
  // hung request would gate the entire application indefinitely.
  useEffect(() => {
    if (!subdomainSlug) {
      // Apex / preview host — there is no tenant to look up.
      setSubdomainTenant(null);
      setSubdomainStatus("resolved");
      return;
    }

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    setSubdomainStatus("resolving");
    setSubdomainTenant(null);

    const settleFailure = (status: "error" | "timeout", err: unknown) => {
      console.error("[TenantProvider] tenant lookup failed", {
        slug: subdomainSlug,
        status,
        err,
      });
      setSubdomainTenant(null);
      setSubdomainStatus(status);
    };

    const attempt = async (isRetry: boolean): Promise<void> => {
      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, TENANT_LOOKUP_TIMEOUT_MS);

      try {
        const { data, error: rpcErr } = await (supabase as any)
          .rpc("resolve_tenant_by_subdomain", { _slug: subdomainSlug })
          .abortSignal(controller.signal);

        if (cancelled) return;
        if (rpcErr) throw rpcErr;

        const row = Array.isArray(data) ? data[0] : data;
        if (row) {
          setSubdomainTenant({
            id: row.id,
            name: row.name,
            logoUrl: row.logo_url ?? null,
            subdomainSlug: row.subdomain_slug ?? subdomainSlug,
            themeConfig: (row.theme_config ?? {}) as TenantThemeConfig,
            featureFlags: (row.feature_flags ?? {}) as TenantFeatureFlags,
          });
          setSubdomainStatus("resolved");
          return;
        }

        // The backend answered successfully and no ACTIVE centre owns this
        // slug. This is the ONLY path allowed to claim the workspace does not
        // exist — a transport or server failure must never land here.
        setSubdomainTenant(null);
        setSubdomainStatus("not_found");
      } catch (err) {
        if (cancelled) return;

        if (timedOut) {
          // The timeout already consumed the whole budget; surface it now with
          // a manual retry rather than doubling the user's wait.
          settleFailure("timeout", err);
          return;
        }

        if (!isRetry) {
          // One controlled retry for fast failures (transient 5xx, dropped
          // connection). Never a loop.
          retryTimer = setTimeout(() => {
            void attempt(true);
          }, TENANT_RETRY_DELAY_MS);
          return;
        }

        settleFailure("error", err);
      } finally {
        clearTimeout(timer);
      }
    };

    void attempt(false);

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [subdomainSlug, lookupNonce]);

  // Resolve the signed-in user's centre (roles + profile + tuition centre).
  // Every query is bounded by an AbortController: on the APEX host this effect
  // is the ONLY bootstrap work, so an unbounded hang here previously trapped
  // authenticated users on "Loading your organisation…" forever.
  useEffect(() => {
    // While auth is still deciding AND we have no user id, there is nothing to
    // resolve yet. Once the user id is known we start immediately — even if
    // auth is still hydrating roles — so the two bounded lookups run in
    // parallel instead of stacking their timeouts.
    if (authLoading && !userId) return;

    if (!userId) {
      setCenter(null);
      setAvailableCenters([]);
      setIsSuperAdmin(false);
      setIsLoading(false);
      setCenterStatus("idle");
      setAttemptedForUserId(null);
      // An anonymous visitor's bootstrap is complete: the gate must never
      // re-arm over the sign-in flow.
      setHasResolvedOnce(true);
      return;
    }

    // Already attempted for this user (success or terminal failure) — a stale
    // user object from a token refresh must not restart resolution, and a
    // failure must not silently loop.
    if (attemptedForUserId === userId) {
      return;
    }

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let activeController: AbortController | null = null;

    // Only show the loading state during the FIRST resolution. Subsequent
    // re-runs (manual retry, user switch) gate via centerStatus instead so
    // previously rendered data never flashes.
    if (!hasResolvedOnce) setIsLoading(true);
    setCenterStatus("resolving");

    const settle = () => {
      setAttemptedForUserId(userId);
      setIsLoading(false);
      setHasResolvedOnce(true);
    };

    const settleFailure = (status: "error" | "timeout", err: unknown) => {
      console.error("[TenantProvider] centre resolution failed", {
        userId,
        status,
        err,
      });
      setError("Failed to resolve organisation");
      if (!hasResolvedOnce) setCenter(null);
      setCenterStatus(status);
      settle();
    };

    const attempt = async (isRetry: boolean): Promise<void> => {
      const controller = new AbortController();
      activeController = controller;
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, TENANT_LOOKUP_TIMEOUT_MS);

      try {
        const [rolesRes, profileRes] = await Promise.all([
          supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", userId)
            .abortSignal(controller.signal),
          supabase
            .from("profiles")
            .select("center_id")
            .eq("user_id", userId)
            .abortSignal(controller.signal)
            .maybeSingle(),
        ]);
        if (cancelled) return;
        // A query error (abort included — postgrest resolves aborts as
        // { error }) means we DON'T know the user's centre. It must not be
        // treated as "user has no centre".
        if (rolesRes.error) throw rolesRes.error;
        if (profileRes.error) throw profileRes.error;

        const roleSet = new Set((rolesRes.data ?? []).map((r) => r.role));
        const superAdmin = roleSet.has("superadmin");

        let centers: TenantCenter[] = [];
        if (superAdmin) {
          const { data, error: centersErr } = await supabase
            .from("tuition_centers")
            .select("id, name, logo_url, subdomain_slug, theme_config, feature_flags")
            .order("name")
            .abortSignal(controller.signal);
          if (cancelled) return;
          if (centersErr) throw centersErr;
          centers = (data ?? []).map((c: any) => ({
            id: c.id,
            name: c.name,
            logoUrl: c.logo_url,
            subdomainSlug: c.subdomain_slug,
            themeConfig: (c.theme_config ?? {}) as TenantThemeConfig,
            featureFlags: (c.feature_flags ?? {}) as TenantFeatureFlags,
          }));
        }

        const userCenterId = (profileRes.data as { center_id: string | null } | null)?.center_id ?? null;

        let activeCenter: TenantCenter | null = null;
        if (userCenterId) {
          const found = centers.find((c) => c.id === userCenterId);
          if (found) {
            activeCenter = found;
          } else {
            const { data: c, error: centerErr } = await supabase
              .from("tuition_centers")
              .select("id, name, logo_url, subdomain_slug, theme_config, feature_flags")
              .eq("id", userCenterId)
              .abortSignal(controller.signal)
              .maybeSingle();
            if (cancelled) return;
            if (centerErr) throw centerErr;
            if (c) {
              const anyC = c as any;
              activeCenter = {
                id: anyC.id,
                name: anyC.name,
                logoUrl: anyC.logo_url,
                subdomainSlug: anyC.subdomain_slug,
                themeConfig: (anyC.theme_config ?? {}) as TenantThemeConfig,
                featureFlags: (anyC.feature_flags ?? {}) as TenantFeatureFlags,
              };
              if (!centers.length) centers = [activeCenter];
            }
          }
        }

        setIsSuperAdmin(superAdmin);
        setAvailableCenters(centers);
        setCenter(activeCenter);
        setError(null);
        setCenterStatus("resolved");
        settle();
      } catch (err) {
        if (cancelled) return;

        if (timedOut) {
          // The whole budget is already spent — surface the failure now with
          // a manual retry rather than doubling the user's wait.
          settleFailure("timeout", err);
          return;
        }

        if (!isRetry) {
          // One controlled retry for fast failures. Never a loop.
          retryTimer = setTimeout(() => {
            void attempt(true);
          }, TENANT_RETRY_DELAY_MS);
          return;
        }

        settleFailure("error", err);
      } finally {
        clearTimeout(timer);
      }
    };

    void attempt(false);

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      activeController?.abort();
    };
  }, [userId, authLoading, attemptedForUserId, hasResolvedOnce, lookupNonce]);

  const setCurrentTenantId = (id: string) => {
    const next = availableCenters.find((c) => c.id === id);
    if (!next) return;
    setCenter(next);
    queryClient.invalidateQueries();
  };

  const refreshCenters = async () => {
    if (!isSuperAdmin) return;
    const { data } = await supabase
      .from("tuition_centers")
      .select("id, name, logo_url, subdomain_slug, theme_config, feature_flags")
      .order("name");
    const centers = (data ?? []).map((c: any) => ({
      id: c.id,
      name: c.name,
      logoUrl: c.logo_url,
      subdomainSlug: c.subdomain_slug,
      themeConfig: (c.theme_config ?? {}) as TenantThemeConfig,
      featureFlags: (c.feature_flags ?? {}) as TenantFeatureFlags,
    }));
    setAvailableCenters(centers);
    queryClient.invalidateQueries();
  };

  const effectiveCenter = subdomainTenant ?? center;
  const scopedAvailableCenters = subdomainTenant ? [subdomainTenant] : availableCenters;

  const isTenantMismatch =
    !!user && !isSuperAdmin && !!subdomainTenant && !!center && subdomainTenant.id !== center.id;
  // "This workspace does not exist" — only ever from a successful backend answer.
  const isUnknownTenant = !!subdomainSlug && subdomainStatus === "not_found";
  // "We could not find out" — transport/server failure or timeout.
  const tenantLookupFailed =
    !!subdomainSlug && (subdomainStatus === "error" || subdomainStatus === "timeout");
  // The signed-in user's centre could not be resolved. Without it we cannot
  // route by role or validate tenant membership, so rendering the app would
  // either lie ("no organisation assigned") or skip the mismatch check.
  const centerLookupFailed =
    !!user && (centerStatus === "error" || centerStatus === "timeout");

  if (import.meta.env.DEV) {
    // Trace tenant resolution to help diagnose login/tenant-handoff issues.
    // Never gated to production users.
    // eslint-disable-next-line no-console
    console.debug("[tenant]", {
      hostname: typeof window !== "undefined" ? window.location.hostname : null,
      subdomainSlug,
      isHQHost,
      isTenantHost,
      subdomainTenantId: subdomainTenant?.id ?? null,
      userCenterId: center?.id ?? null,
      isSuperAdmin,
      isTenantMismatch,
      isUnknownTenant,
      tenantLookupFailed,
      centerLookupFailed,
      subdomainStatus,
      centerStatus,
      isLoading,
      hasResolvedOnce,
      userId: user?.id ?? null,
    });
  }

  const themeConfig: TenantThemeConfig = effectiveCenter?.themeConfig ?? {};
  const featureFlags: TenantFeatureFlags = {
    ...DEFAULT_FLAGS,
    ...(effectiveCenter?.featureFlags ?? {}),
  };
  const canonicalHost =
    effectiveCenter?.subdomainSlug
      ? `${effectiveCenter.subdomainSlug}.${ROOT_DOMAIN}`
      : isHQHost
        ? ROOT_DOMAIN
        : null;

  // Apply theme CSS variables when present (safe fallback to HQ defaults).
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const set = (name: string, value?: string) => {
      if (value) root.style.setProperty(name, value);
      else root.style.removeProperty(name);
    };
    set("--brand-primary", themeConfig.primaryColor);
    set("--brand-accent", themeConfig.accentColor);
    set("--brand-midnight", themeConfig.midnightColor);
  }, [themeConfig.primaryColor, themeConfig.accentColor, themeConfig.midnightColor]);

  // Cross-subdomain safety: if a non-superadmin tenant user is authenticated
  // on the HQ apex, DO NOT try to transfer the session — Supabase stores it
  // in origin-scoped localStorage. Show an interstitial and let the user
  // continue to their centre (we sign the HQ session out first so no token
  // leaks and no stale HQ session hangs around).
  const [showHandoff, setShowHandoff] = useState(false);
  useEffect(() => {
    if (!user || authLoading || isLoading) return;
    if (isSuperAdmin) return;
    if (!isHQHost) return;
    if (!center?.subdomainSlug) return;
    setShowHandoff(true);
  }, [user, authLoading, isLoading, isSuperAdmin, isHQHost, center?.subdomainSlug]);


  const value = useMemo<TenantContextValue>(
    () => ({
      center: effectiveCenter,
      currentTenantId: effectiveCenter?.id ?? null,
      setCurrentTenantId,
      availableCenters: scopedAvailableCenters,
      isSuperAdmin,
      isLoading,
      error,
      refreshCenters,
      subdomainSlug,
      subdomainTenant,
      tenantLookupStatus: subdomainStatus,
      centerLookupStatus: centerStatus,
      retryTenantLookup,
      isTenantMismatch,
      isHQHost,
      isTenantHost,
      canonicalHost,
      themeConfig,
      featureFlags,
    }),
    [
      effectiveCenter,
      scopedAvailableCenters,
      isSuperAdmin,
      isLoading,
      error,
      subdomainSlug,
      subdomainTenant,
      subdomainStatus,
      centerStatus,
      retryTenantLookup,
      isTenantMismatch,
      isHQHost,
      isTenantHost,
      canonicalHost,
      themeConfig,
      featureFlags,
    ],
  );

  // Gate ONLY while a bounded lookup is actually in flight:
  //  - the subdomain tenant lookup (tenant hosts, ≤ ~11s incl. one retry);
  //  - the initial auth bootstrap (≤ 10s via its own safety timeout);
  //  - the signed-in centre resolution (≤ ~11s incl. one retry).
  // Every arm settles into resolved / not_found / error / timeout, so this
  // gate can no longer hold indefinitely.
  const shouldGate =
    (!!subdomainSlug && subdomainStatus === "resolving") ||
    (!hasResolvedOnce && authLoading) ||
    (!!user && centerStatus === "resolving");

  return (
    <TenantContext.Provider value={value}>
      {shouldGate ? (
        <TenantResolvingScreen />
      ) : tenantLookupFailed ? (
        <TenantUnavailableScreen
          status={subdomainStatus === "timeout" ? "timeout" : "error"}
          onRetry={retryTenantLookup}
        />
      ) : centerLookupFailed ? (
        <TenantUnavailableScreen
          status={centerStatus === "timeout" ? "timeout" : "error"}
          onRetry={retryTenantLookup}
        />
      ) : showHandoff && center?.subdomainSlug ? (
        <TenantHandoffScreen
          tenantName={center.name}
          slug={center.subdomainSlug}
          email={user?.email ?? null}
        />
      ) : isUnknownTenant ? (
        <UnknownTenantScreen slug={subdomainSlug!} />
      ) : isTenantMismatch ? (
        <TenantMismatchScreen expected={subdomainTenant} actual={center} />
      ) : (
        children
      )}
    </TenantContext.Provider>
  );

}

function TenantResolvingScreen({ redirect }: { redirect?: boolean }) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-sky-50 p-8">
      <div className="flex flex-col items-center gap-4 rounded-3xl bg-white/70 backdrop-blur-xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-10">
        <div
          className="h-10 w-10 rounded-full border-[3px] border-slate-200 animate-spin"
          style={{ borderTopColor: "#0052FF" }}
        />
        <p className="text-sm text-slate-500">
          {redirect ? "Redirecting you to your centre…" : "Loading your organisation…"}
        </p>
      </div>
    </div>
  );
}

/**
 * Shown when the tenant lookup could not be completed — a transport failure,
 * a server error, or a timeout.
 *
 * This is deliberately NOT the "isn't an Aras A+ workspace" screen: we do not
 * know whether the workspace exists, so we must not claim it does not.
 */
function TenantUnavailableScreen({
  status,
  onRetry,
}: {
  status: "error" | "timeout";
  onRetry: () => void;
}) {
  const timedOut = status === "timeout";
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-sky-50 p-8">
      <div className="max-w-md w-full text-center flex flex-col items-center gap-4 rounded-3xl bg-white/80 backdrop-blur-xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-10">
        <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-500 text-xl font-semibold">
          !
        </div>
        <h1 className="text-xl font-semibold text-[color:var(--brand-midnight,_#0F172A)]">
          We couldn't load this workspace
        </h1>
        <p className="text-sm text-slate-500">
          {timedOut
            ? "The connection to our servers is taking longer than expected. Check your internet connection and try again."
            : "We couldn't reach our servers just now. This is usually temporary — please try again in a moment."}
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            onClick={onRetry}
            className="rounded-full bg-[color:var(--brand-primary,_#0052FF)] hover:opacity-90 text-white px-6 h-11 text-sm font-medium"
          >
            Try again
          </button>
          <a
            href={`https://${ROOT_DOMAIN}`}
            className="rounded-full border border-slate-200 text-slate-700 hover:bg-slate-50 px-6 h-11 inline-flex items-center text-sm font-medium"
          >
            Go to {ROOT_DOMAIN}
          </a>
        </div>
      </div>
    </div>
  );
}

function TenantHandoffScreen({
  tenantName,
  slug,
  email,
}: {
  tenantName: string;
  slug: string;
  email: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const handleContinue = async () => {
    if (busy) return;
    setBusy(true);
    // Origin-scoped localStorage means the HQ session cannot travel to the
    // tenant subdomain. Sign out here so no stale token lingers on HQ, then
    // hand off with just a prefilled email (never tokens) in the URL.
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn("[tenant-handoff] signOut failed", e);
    }
    const emailQs = email ? `?email=${encodeURIComponent(email)}` : "";
    window.location.replace(`https://${slug}.${ROOT_DOMAIN}/auth${emailQs}`);
  };
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-sky-50 p-8">
      <div className="max-w-md w-full text-center flex flex-col items-center gap-5 rounded-3xl bg-white/80 backdrop-blur-xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-10">
        <div className="w-12 h-12 rounded-2xl bg-[color:var(--brand-primary,_#0052FF)]/10 flex items-center justify-center text-[color:var(--brand-primary,_#0052FF)] text-xl font-semibold">→</div>
        <h1 className="text-xl font-semibold text-[color:var(--brand-midnight,_#0F172A)]">
          Continue to {tenantName}
        </h1>
        <p className="text-sm text-slate-500">
          Your workspace lives on its own secure subdomain. Sign in there to access {tenantName}.
        </p>
        <button
          onClick={handleContinue}
          disabled={busy}
          className="rounded-full bg-[color:var(--brand-primary,_#0052FF)] hover:opacity-90 text-white px-6 h-11 text-sm font-medium disabled:opacity-60"
        >
          {busy ? "Redirecting…" : `Go to ${slug}.${ROOT_DOMAIN}`}
        </button>
      </div>
    </div>
  );
}

function TenantMismatchScreen({
  expected,
  actual,
}: {
  expected: TenantCenter | null;
  actual: TenantCenter | null;
}) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-rose-50 p-8">
      <div className="max-w-md w-full text-center flex flex-col items-center gap-4 rounded-3xl bg-white/80 backdrop-blur-xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-10">
        <div className="w-12 h-12 rounded-2xl bg-rose-100 flex items-center justify-center text-rose-600 text-xl font-semibold">!</div>
        <h1 className="text-xl font-semibold text-[color:var(--brand-midnight)]">
          You don't have access to {expected?.name ?? "this workspace"}
        </h1>
        <p className="text-sm text-slate-500">
          Your account belongs to {actual?.name ?? "another centre"}. Sign in on your own centre's subdomain instead.
        </p>
        <div className="flex gap-3">
          {actual?.subdomainSlug ? (
            <a
              href={tenantHrefFor(actual.subdomainSlug, "/dashboard")}
              className="rounded-full bg-[color:var(--brand-primary)] hover:opacity-90 text-white px-6 h-11 inline-flex items-center text-sm font-medium"
            >
              Go to your workspace
            </a>
          ) : null}
          <button
            onClick={() => {
              void supabase.auth.signOut().then(() => {
                window.location.href = "/auth";
              });
            }}
            className="rounded-full border border-slate-200 text-slate-700 hover:bg-slate-50 px-6 h-11 text-sm font-medium"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

function UnknownTenantScreen({ slug }: { slug: string }) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-amber-50 p-8">
      <div className="max-w-md w-full text-center flex flex-col items-center gap-4 rounded-3xl bg-white/80 backdrop-blur-xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-10">
        <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center text-amber-600 text-xl font-semibold">?</div>
        <h1 className="text-xl font-semibold text-[color:var(--brand-midnight)]">"{slug}" isn't an Aras A+ workspace</h1>
        <p className="text-sm text-slate-500">
          This subdomain isn't linked to an active centre yet. Check the URL or head to the main site to find your workspace.
        </p>
        <a
          href="https://arasaplus.info"
          className="rounded-full bg-[color:var(--brand-primary)] hover:opacity-90 text-white px-6 h-11 inline-flex items-center text-sm font-medium"
        >
          Go to arasaplus.info
        </a>
      </div>
    </div>
  );
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error("useTenant must be used inside <TenantProvider>");
  return ctx;
}
