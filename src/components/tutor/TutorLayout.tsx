import { ReactNode, useState } from "react";
import { Navigate } from "react-router-dom";
import { TutorSidebar } from "./TutorSidebar";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSidebarState } from "@/hooks/useSidebarState";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";

interface TutorLayoutProps {
  children: ReactNode;
}

export function TutorLayout({ children }: TutorLayoutProps) {
  const { role, isLoading, user } = useAuth();
  const isMobile = useIsMobile();
  const { collapsed: sidebarCollapsed, toggle: toggleSidebar } = useSidebarState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

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

  if (!user) return <Navigate to="/auth" replace />;
  if (role !== "tutor") return <Navigate to="/dashboard" replace />;

  if (isMobile) {
    return (
      <div className="min-h-screen bg-background">
        <header className="fixed top-0 left-0 right-0 h-14 bg-sidebar border-b border-sidebar-border z-50 flex items-center px-4">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="text-sidebar-foreground">
                <Menu className="w-6 h-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-64 bg-sidebar border-sidebar-border">
              <TutorSidebar collapsed={false} onToggle={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>
          <h1 className="ml-3 font-bold text-sidebar-foreground">Tutor Portal</h1>
        </header>
        <main className="pt-14 min-h-screen">{children}</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <TutorSidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
      <main
        className={`transition-all duration-300 ease-in-out ${sidebarCollapsed ? "ml-16" : "ml-64"}`}
      >
        <div className="min-h-screen">{children}</div>
      </main>
    </div>
  );
}
