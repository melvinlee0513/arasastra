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
};

const TenantContext = createContext<TenantContextValue | undefined>(undefined);

export function TenantProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  const [center, setCenter] = useState<TenantCenter | null>(null);
  const [availableCenters, setAvailableCenters] = useState<TenantCenter[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        const superAdmin = roleSet.has("admin");
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
