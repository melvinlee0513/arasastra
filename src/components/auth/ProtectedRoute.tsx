import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

type RequiredRole = "admin" | "student" | "tutor" | "authenticated";

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRole?: RequiredRole;
  adminOnly?: boolean;
  tutorOnly?: boolean;
}

export function ProtectedRoute({ 
  children, 
  requiredRole = "authenticated",
  adminOnly = false,
  tutorOnly = false,
}: ProtectedRouteProps) {
  const { user, role, isLoading, isAdmin, isTutor } = useAuth();
  const location = useLocation();
  const { toast } = useToast();

  // Show loading spinner while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
          <p className="text-muted-foreground">Verifying access...</p>
        </div>
      </div>
    );
  }

  // Not authenticated - redirect to auth page
  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // Admin-only route check
  if (adminOnly && !isAdmin) {
    setTimeout(() => {
      toast({
        title: "Unauthorized",
        description: "You don't have permission to access the admin area.",
        variant: "destructive",
      });
    }, 0);
    return <Navigate to="/dashboard" replace />;
  }

  // Tutor-only route check
  if (tutorOnly && !isTutor) {
    setTimeout(() => {
      toast({
        title: "Unauthorized",
        description: "You don't have permission to access the tutor area.",
        variant: "destructive",
      });
    }, 0);
    return <Navigate to="/dashboard" replace />;
  }

  // Role-specific checks
  if (requiredRole === "admin" && !isAdmin) {
    setTimeout(() => {
      toast({
        title: "Unauthorized",
        description: "Admin access required.",
        variant: "destructive",
      });
    }, 0);
    return <Navigate to="/dashboard" replace />;
  }

  // Authenticated users can access student routes (both admin and student)
  if (requiredRole === "student" && !user) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
}
