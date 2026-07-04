import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import { NoOrganizationView } from "./NoOrganizationView";

interface TenantGuardProps {
  children: ReactNode;
}

/**
 * TenantGuard — route-level guard for tenant-dependent screens.
 *
 * Renders a full-screen NoOrganizationView when the logged-in user has no
 * center_id resolved, instead of stranding them on a broken page.
 */
export function TenantGuard({ children }: TenantGuardProps) {
  const { currentTenantId, isLoading } = useTenant();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-sky-50">
        <div className="flex flex-col items-center gap-4 p-8 rounded-3xl bg-white/60 backdrop-blur-xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#0052FF" }} />
          <p className="text-sm text-slate-500">Resolving organisation…</p>
        </div>
      </div>
    );
  }

  if (!currentTenantId) {
    return <NoOrganizationView />;
  }

  return <>{children}</>;
}
