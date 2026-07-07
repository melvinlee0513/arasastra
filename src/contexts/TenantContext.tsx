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
import { getTenantSubdomain } from "@/lib/tenantSubdomain";

export type TenantCenter = {
  id: string;
  name: string;
  logoUrl: string | null;
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
  /** Slug resolved from the current hostname, if any. */
  subdomainSlug: string | null;
  /** Tenant matched from the subdomain (unauth or cross-check). */
  subdomainTenant: TenantCenter | null;
  /** True when the signed-in user does NOT belong to this subdomain tenant. */
  isTenantMismatch: boolean;
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


  // Resolve the tenant tied to the current subdomain (works for anon visitors too).
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
        setSubdomainTenant({ id: row.id, name: row.name, logoUrl: row.logo_url ?? null });
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
            .select("id, name, logo_url")
            .order("name");
          centers = (data ?? []).map((c) => ({
            id: c.id,
            name: c.name,
            logoUrl: c.logo_url,
          }));
        }

        const userCenterId = (profileRes.data as { center_id: string | null } | null)
          ?.center_id ?? null;

        let activeCenter: TenantCenter | null = null;
        if (userCenterId) {
          const found = centers.find((c) => c.id === userCenterId);
          if (found) {
            activeCenter = found;
          } else {
            const { data: c } = await supabase
              .from("tuition_centers")
              .select("id, name, logo_url")
              .eq("id", userCenterId)
              .maybeSingle();
            if (c) {
              activeCenter = { id: c.id, name: c.name, logoUrl: c.logo_url };
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
      .select("id, name, logo_url")
      .order("name");
    const centers = (data ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      logoUrl: c.logo_url,
    }));
    setAvailableCenters(centers);
    queryClient.invalidateQueries();
  };

  // On a tenant subdomain, the subdomain tenant is authoritative for branding
  // AND for locking the session context — even for superadmins visiting that host.
  const effectiveCenter = subdomainTenant ?? center;

  // Superadmins on a tenant subdomain get scoped to just that tenant (no switcher).
  const scopedAvailableCenters = subdomainTenant ? [subdomainTenant] : availableCenters;

  const isTenantMismatch =
    !!user &&
    !isSuperAdmin &&
    !!subdomainTenant &&
    !!center &&
    subdomainTenant.id !== center.id;

  // Slug present in URL but no active tenant matched — show unknown-tenant screen.
  const isUnknownTenant = !!subdomainSlug && subdomainResolved && !subdomainTenant;

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
    ],
  );

  const shouldGate =
    !hasResolvedOnce &&
    (authLoading || (!!user && isLoading) || (!!subdomainSlug && !subdomainResolved));

  return (
    <TenantContext.Provider value={value}>
      {shouldGate ? (
        <TenantResolvingScreen />
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

function TenantResolvingScreen() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-sky-50 p-8">
      <div className="flex flex-col items-center gap-4 rounded-3xl bg-white/70 backdrop-blur-xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-10">
        <div
          className="h-10 w-10 rounded-full border-[3px] border-slate-200 animate-spin"
          style={{ borderTopColor: "#0052FF" }}
        />
        <p className="text-sm text-slate-500">Loading your organisation…</p>
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
        <div className="w-12 h-12 rounded-2xl bg-rose-100 flex items-center justify-center text-rose-600 text-xl font-semibold">
          !
        </div>
        <h1 className="text-xl font-semibold text-[#0F172A]">
          You don't have access to {expected?.name ?? "this workspace"}
        </h1>
        <p className="text-sm text-slate-500">
          Your account belongs to {actual?.name ?? "another centre"}. Sign in on your own centre's
          subdomain instead.
        </p>
        <button
          onClick={() => {
            void supabase.auth.signOut().then(() => {
              window.location.href = "/auth";
            });
          }}
          className="rounded-full bg-[#0052FF] hover:bg-[#0047DB] text-white px-6 h-11 text-sm font-medium"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error("useTenant must be used inside <TenantProvider>");
  return ctx;
}
