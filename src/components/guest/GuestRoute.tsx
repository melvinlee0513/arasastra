import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

/**
 * Public guest route. Authenticated visitors are sent to their canonical
 * workspace destination, so the signed-in experience is never replaced.
 */
export function GuestRoute({
  children,
  authenticatedTo,
}: {
  children: ReactNode;
  authenticatedTo: string;
}) {
  const { user, isLoading, isAdmin, isTutor } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
        <span className="sr-only">Loading</span>
      </div>
    );
  }

  if (user) {
    if (isAdmin) return <Navigate to="/admin" replace />;
    if (isTutor) return <Navigate to="/tutor" replace />;
    return <Navigate to={authenticatedTo} replace />;
  }

  return <>{children}</>;
}
