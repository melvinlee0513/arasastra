import { ReactNode, useState } from "react";
import { Navigate, NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, BarChart3, CreditCard, ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import owlMascot from "@/assets/owl-mascot.png";

const guardianNavItems = [
  { path: "/guardian", icon: LayoutDashboard, label: "Overview", exact: true },
  { path: "/guardian/reports", icon: BarChart3, label: "Academic Reports" },
  { path: "/guardian/billing", icon: CreditCard, label: "Billing" },
];

interface GuardianLayoutProps {
  children: ReactNode;
}

export function GuardianLayout({ children }: GuardianLayoutProps) {
  const { user, isLoading } = useAuth();
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

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

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      {!isMobile && (
        <aside className={cn(
          "fixed left-0 top-0 h-screen bg-sidebar border-r border-sidebar-border z-40",
          "transition-all duration-300 ease-in-out flex flex-col",
          collapsed ? "w-16" : "w-64"
        )}>
          <div className="flex items-center gap-3 p-4 border-b border-sidebar-border">
            <img src={owlMascot} alt="Arasa A+" className="w-10 h-10 rounded-xl object-contain" />
            {!collapsed && (
              <div>
                <h1 className="font-bold text-lg text-primary">Parent Portal</h1>
                <p className="text-xs text-muted-foreground">Guardian Dashboard</p>
              </div>
            )}
          </div>

          <nav className="flex-1 p-3 space-y-1">
            {guardianNavItems.map((item) => {
              const active = item.exact ? location.pathname === item.path : location.pathname.startsWith(item.path);
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={cn(
                    "flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200",
                    "hover:bg-sidebar-accent group",
                    active
                      ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md"
                      : "text-sidebar-foreground hover:text-sidebar-accent-foreground"
                  )}
                >
                  <item.icon className={cn("w-5 h-5 transition-transform group-hover:scale-110", active && "text-sidebar-primary-foreground")} />
                  {!collapsed && <span className="font-medium">{item.label}</span>}
                </NavLink>
              );
            })}
          </nav>

          <button
            onClick={() => setCollapsed(!collapsed)}
            className="m-3 p-2 rounded-xl border border-sidebar-border hover:bg-sidebar-accent transition-colors flex items-center justify-center text-sidebar-foreground"
          >
            {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          </button>
        </aside>
      )}

      <main className={cn("transition-all duration-300", isMobile ? "pb-20" : collapsed ? "ml-16" : "ml-64")}>
        <div className="min-h-screen">{children}</div>
      </main>

      {/* Mobile bottom nav */}
      {isMobile && (
        <nav className="fixed bottom-0 left-0 right-0 bg-card/80 backdrop-blur-xl border-t border-border z-40 flex justify-around py-2">
          {guardianNavItems.map((item) => {
            const active = item.exact ? location.pathname === item.path : location.pathname.startsWith(item.path);
            return (
              <NavLink key={item.path} to={item.path} className={cn("flex flex-col items-center gap-1 px-3 py-1", active ? "text-primary" : "text-muted-foreground")}>
                <item.icon className="w-5 h-5" />
                <span className="text-[10px]">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      )}
    </div>
  );
}
