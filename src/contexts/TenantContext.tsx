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

/**
 * TenantContext — shell-only implementation.
 *
 * The database does not yet carry a `tuition_centers` table or `center_id`
 * columns. Until that migration lands, we expose a single hard-coded default
 * tenant derived from the current organisation. `DataBoundaryGate` and the
 * `.eq('center_id', ...)` guidance are wired up so that when the schema does
 * land, no call-site needs to change.
 */

export type TenantCenter = {
  id: string;
  name: string;
  logoUrl: string;
  slug: string;
};

const DEFAULT_CENTER: TenantCenter = {
  id: "arasa-default",
  name: "Arasa A+",
  slug: "arasa-a-plus",
  logoUrl:
    "https://images.unsplash.com/photo-1580894732444-8ecded7900cd?auto=format&fit=crop&w=128&q=80",
};

type TenantContextValue = {
  center: TenantCenter | null;
  currentTenantId: string | null;
  setCurrentTenantId: (id: string) => void;
  availableCenters: TenantCenter[];
  isSuperAdmin: boolean;
  isLoading: boolean;
  error: string | null;
};

const TenantContext = createContext<TenantContextValue | undefined>(undefined);

export function TenantProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  const [center, setCenter] = useState<TenantCenter | null>(null);
  const [availableCenters] = useState<TenantCenter[]>([DEFAULT_CENTER]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;

    // Public / logged-out users get the default tenant shell.
    if (!user) {
      setCenter(DEFAULT_CENTER);
      setIsSuperAdmin(false);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);

        if (cancelled) return;

        // We treat 'admin' as capable of superadmin impersonation until a
        // dedicated superadmin role exists in the enum.
        const roleSet = new Set((roles ?? []).map((r) => r.role));
        setIsSuperAdmin(roleSet.has("admin"));
        setCenter(DEFAULT_CENTER);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        console.error("[TenantProvider] failed to resolve tenant", err);
        setError("Failed to resolve organisation");
        setCenter(null);
      } finally {
        if (!cancelled) setIsLoading(false);
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
    // Invalidate every tenant-scoped query so downstream lists refetch
    // without a hard reload.
    queryClient.invalidateQueries();
  };

  const value = useMemo<TenantContextValue>(
    () => ({
      center,
      currentTenantId: center?.id ?? null,
      setCurrentTenantId,
      availableCenters,
      isSuperAdmin,
      isLoading,
      error,
    }),
    [center, availableCenters, isSuperAdmin, isLoading, error],
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error("useTenant must be used inside <TenantProvider>");
  return ctx;
}
