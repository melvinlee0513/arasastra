import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { DesktopSidebar } from "@/components/layout/DesktopSidebar";
import { StudentSidebar } from "@/components/layout/StudentSidebar";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSidebarState } from "@/hooks/useSidebarState";
import { Skeleton } from "@/components/ui/skeleton";
import { getStudentChromeState } from "@/lib/studentNav";
import { cn } from "@/lib/utils";

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { user, isLoading, isAdmin, hasRole } = useAuth();
  const isMobile = useIsMobile();
  const { pathname } = useLocation();
  const { collapsed, toggle } = useSidebarState(false);

  const chrome = getStudentChromeState(pathname);
  // Tab bar is a root-level affordance only; class and learning routes use the
  // in-page mobile back bar instead.
  const showTabBar = isMobile && chrome === "root";
  // Immersive learning routes drop the desktop sidebar too.
  const showSidebar = !isMobile && chrome !== "immersive";
  // Students get the light four-destination sidebar; staff keep the legacy one.
  const studentShell = !isAdmin && !hasRole("tutor");

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="space-y-4 w-full max-w-md p-6">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-8 w-1/2" />
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Canonical role resolution: /dashboard/* is the STUDENT workspace only.
  // Staff accounts are sent to their own workspace instead of rendering the
  // student shell with staff data gaps.
  if (isAdmin) return <Navigate to="/admin" replace />;
  if (hasRole("tutor")) return <Navigate to="/tutor" replace />;


  return (
    <div className="min-h-screen bg-background">
      {showSidebar &&
        (studentShell ? (
          <StudentSidebar collapsed={collapsed} onToggle={toggle} />
        ) : (
          <DesktopSidebar collapsed={collapsed} onToggle={toggle} />
        ))}

      <main
        className={cn(
          "transition-all duration-300 ease-in-out",
          showTabBar && "pb-[calc(5.5rem+env(safe-area-inset-bottom))]",
          !isMobile &&
            showSidebar &&
            (studentShell
              ? collapsed
                ? "ml-[76px]"
                : "ml-[264px]"
              : collapsed
                ? "ml-16"
                : "ml-64"),
        )}
      >
        <div className="min-h-screen">{children}</div>
      </main>

      {showTabBar && <MobileBottomNav />}
    </div>
  );
}
