import {
  createContext,
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
  const queryClient = useQueryClient();

  const [center, setCenter] = useState<TenantCenter | null>(null);
  const [availableCenters, setAvailableCenters] = useState<TenantCenter[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasResolvedOnce, setHasResolvedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subdomainTenant, setSubdomainTenant] = useState<TenantCenter | null>(null);
  const [subdomainResolved, setSubdomainResolved] = useState(false);

  const subdomainInfo = useMemo(() => getTenantSubdomain(), []);
  const subdomainSlug = subdomainInfo.slug;
  const isHQHost = subdomainInfo.isApex && !subdomainInfo.isPreview;
  const isTenantHost = !!subdomainSlug;

  // Resolve tenant tied to current subdomain (works anon).
  useEffect(() => {
    if (!subdomainSlug) {
      setSubdomainTenant(null);
      setSubdomainResolved(true);
      return;
    }
    let cancelled = false;
    setSubdomainResolved(false);
    (async () => {
      const { data, error: rpcErr } = await (supabase as any).rpc(
        "resolve_tenant_by_subdomain",
        { _slug: subdomainSlug },
      );
      if (cancelled) return;
      if (rpcErr) {
        console.error("[TenantProvider] subdomain resolve failed", rpcErr);
        setSubdomainTenant(null);
        setSubdomainResolved(true);
        return;
      }
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
      } else {
        setSubdomainTenant(null);
      }
      setSubdomainResolved(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [subdomainSlug]);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setCenter(null);
      setAvailableCenters([]);
      setIsSuperAdmin(false);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const [rolesRes, profileRes] = await Promise.all([
          supabase.from("user_roles").select("role").eq("user_id", user.id),
          supabase
            .from("profiles")
            .select("center_id")
            .eq("user_id", user.id)
            .maybeSingle(),
        ]);
        if (cancelled) return;

        const roleSet = new Set((rolesRes.data ?? []).map((r) => r.role));
        const superAdmin = roleSet.has("superadmin");
        setIsSuperAdmin(superAdmin);

        let centers: TenantCenter[] = [];
        if (superAdmin) {
          const { data } = await supabase
            .from("tuition_centers")
            .select("id, name, logo_url, subdomain_slug, theme_config, feature_flags")
            .order("name");
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
            const { data: c } = await supabase
              .from("tuition_centers")
              .select("id, name, logo_url, subdomain_slug, theme_config, feature_flags")
              .eq("id", userCenterId)
              .maybeSingle();
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

        setAvailableCenters(centers);
        setCenter(activeCenter);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        console.error("[TenantProvider] failed to resolve tenant", err);
        setError("Failed to resolve organisation");
        setCenter(null);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          setHasResolvedOnce(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

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
  const isUnknownTenant = !!subdomainSlug && subdomainResolved && !subdomainTenant;

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
      isTenantMismatch,
      isHQHost,
      isTenantHost,
      canonicalHost,
      themeConfig,
      featureFlags,
    ],
  );

  const shouldGate =
    !hasResolvedOnce &&
    (authLoading || (!!user && isLoading) || (!!subdomainSlug && !subdomainResolved));

  return (
    <TenantContext.Provider value={value}>
      {shouldGate ? (
        <TenantResolvingScreen />
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
