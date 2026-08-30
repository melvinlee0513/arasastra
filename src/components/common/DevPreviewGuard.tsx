import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * DevPreviewGuard
 * ---------------
 * Wraps two kinds of route: UI-only previews backed by isolated mock data, and
 * QA harnesses that drive the REAL backend before a feature is enabled for
 * anyone. Only superadmins may access either; everyone else is redirected
 * away, which keeps students, tutors and tenant admins out of both mock data
 * and unreleased features.
 *
 * These routes are never linked from production navigation.
 */
export function DevPreviewGuard({ children }: { children: ReactNode }) {
  const { isLoading, user, isSuperAdmin } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="space-y-3 w-full max-w-sm">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (!isSuperAdmin) return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
}
