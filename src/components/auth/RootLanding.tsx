import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { MainLayout } from "@/components/layout/MainLayout";
import { HomePage } from "@/pages/HomePage";
import { GuestHome } from "@/pages/guest/GuestHome";


/**
 * RootLanding — the single canonical app entry for `/` (also the PWA start_url).
 *
 * Resolves auth + role BEFORE rendering any workspace, then sends the user to
 * their canonical workspace. Signed-out visitors keep the existing public
 * landing/auth flow. Hostname is never changed here, so tenant subdomains stay
 * on their own canonical host.
 */
export function RootLanding() {
  const { user, isLoading, isAdmin, isTutor } = useAuth();
  const location = useLocation();

  // Never render a workspace while auth/role hydration is still in flight —
  // this is what previously caused the old public Home to flash on launch.
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading your workspace…</p>
        </div>
      </div>
    );
  }

  if (user) {
    // Admin covers superadmin (HQ cross-tenant view is handled inside /admin).
    if (isAdmin) return <Navigate to="/admin" replace state={{ from: location }} />;
    if (isTutor) return <Navigate to="/tutor" replace state={{ from: location }} />;
    // Students (and any authenticated user without an elevated role) land on
    // the canonical student Home.
    return <Navigate to="/dashboard" replace state={{ from: location }} />;
  }

  return (
    <MainLayout>
      <HomePage />
    </MainLayout>
  );
}
