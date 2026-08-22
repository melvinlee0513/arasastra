import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

/**
 * StudentWorkspaceRoute — canonical role gate for the student Home workspace.
 *
 * Roles come from `user_roles` via useAuth (the single source of truth), never
 * from UI state. Staff who land on /dashboard are sent to their own canonical
 * workspace instead of being shown the student shell with pieces hidden.
 */
export function StudentWorkspaceRoute({ children }: { children: ReactNode }) {
  const { user, isLoading, isAdmin, isTutor } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace state={{ from: location }} />;
  // Admin covers superadmin; admins keep their cross-tenant workspace.
  if (isAdmin) return <Navigate to="/admin" replace />;
  if (isTutor) return <Navigate to="/tutor" replace />;

  return <>{children}</>;
}
