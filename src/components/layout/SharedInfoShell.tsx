import { ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { TutorLayout } from "@/components/tutor/TutorLayout";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { GuestBottomNav } from "@/components/guest/GuestChrome";
import { GuestDesktopShell, useIsGuestDesktop } from "@/components/guest/GuestDesktopChrome";

/**
 * Role-aware shell for the shared informational pages (/support, /privacy).
 *
 * One page implementation is reused for every audience; only the surrounding
 * navigation chrome changes:
 *   signed out → guest chrome (mobile tab bar / desktop guest sidebar)
 *   student    → student shell (tab bar + light sidebar)
 *   tutor      → tutor workspace shell
 *   admin      → admin workspace shell
 *
 * Roles come from `user_roles` via useAuth — never from the route or UI state.
 */
export function SharedInfoShell({ children }: { children: ReactNode }) {
  const { user, isLoading, isAdmin, hasRole } = useAuth();
  const isMobile = useIsMobile();
  const isGuestDesktop = useIsGuestDesktop();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-full max-w-md space-y-4 p-6">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-8 w-1/2" />
        </div>
      </div>
    );
  }

  if (!user) {
    if (isGuestDesktop) return <GuestDesktopShell>{children}</GuestDesktopShell>;
    return (
      <div className="min-h-screen bg-[hsl(214_100%_97%)]">
        <div className="pb-[calc(112px+env(safe-area-inset-bottom))]">{children}</div>
        <GuestBottomNav />
      </div>
    );
  }

  if (isAdmin) return <AdminLayout>{children}</AdminLayout>;
  if (hasRole("tutor")) return <TutorLayout>{children}</TutorLayout>;
  // Students keep the tab bar on these root-level destinations (see studentNav).
  void isMobile;
  return <DashboardLayout>{children}</DashboardLayout>;
}
