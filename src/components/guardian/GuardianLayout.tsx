import { ReactNode, useState } from "react";
import { Navigate, NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, LineChart, CreditCard, ChevronLeft, ChevronRight, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import owlMascot from "@/assets/owl-mascot.png";

const guardianNavItems = [
  { path: "/guardian", icon: LayoutDashboard, label: "Overview", exact: true },
  { path: "/guardian/reports", icon: LineChart, label: "Academic Reports" },
  { path: "/guardian/billing", icon: CreditCard, label: "Billing" },
];

interface GuardianLayoutProps {
  children: ReactNode;
}

/**
 * GuardianLayout — Parent/Guardian dashboard shell.
 * Glassmorphism sidebar with pill-shaped nav items.
 */
export function GuardianLayout({ children }: GuardianLayoutProps) {
  const { user, isLoading } = useAuth();
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="space-y-4 w-full max-w-md p-8">
          <Skeleton className="h-14 w-full rounded-2xl" />
          <Skeleton className="h-10 w-3/4 rounded-2xl" />
          <Skeleton className="h-10 w-1/2 rounded-2xl" />
          <div className="grid grid-cols-3 gap-3 mt-6">
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-28 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop Sidebar — glassmorphism */}
      {!isMobile && (
        <aside className={cn(
          "fixed left-0 top-0 h-screen z-40",
          "bg-card/70 backdrop-blur-md border-r border-border/50",
          "transition-all duration-300 ease-in-out flex flex-col",
          "shadow-sm",
          collapsed ? "w-16" : "w-64"
        )}>
          {/* Logo */}
          <div className="flex items-center gap-3 p-4 border-b border-border/30">
            <img src={owlMascot} alt="Arasa A+" className="w-10 h-10 rounded-2xl object-contain" />
            {!collapsed && (
              <div className="animate-fade-up">
                <h1 className="font-bold text-lg text-foreground">Parent Portal</h1>
                <p className="text-xs text-muted-foreground">Guardian Dashboard</p>
              </div>
            )}
          </div>

          {/* Nav — pill-shaped items */}
          <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto">
            {guardianNavItems.map((item) => {
              const active = item.exact
                ? location.pathname === item.path
                : location.pathname.startsWith(item.path);
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-full transition-all duration-200",
                    "hover:bg-secondary/60 group",
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-foreground/70 hover:text-foreground"
                  )}
                >
                  <item.icon className={cn(
                    "w-5 h-5 transition-transform group-hover:scale-110",
                    active && "text-primary-foreground"
                  )} />
                  {!collapsed && <span className="font-medium text-sm">{item.label}</span>}
                </NavLink>
              );
            })}
          </nav>

          {/* Collapse toggle */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="m-3 p-2.5 rounded-full border border-border/40 hover:bg-secondary/50 transition-colors flex items-center justify-center text-muted-foreground"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </aside>
      )}

      {/* Main content */}
      <main className={cn(
        "transition-all duration-300",
        isMobile ? "pb-24" : collapsed ? "ml-16" : "ml-64"
      )}>
        <div className="min-h-screen">{children}</div>
      </main>

      {/* Mobile bottom nav — glassmorphism */}
      {isMobile && (
        <nav className="fixed bottom-0 left-0 right-0 z-40 bg-card/70 backdrop-blur-xl border-t border-border/30 shadow-sm">
          <div className="flex justify-around py-2 px-4">
            {guardianNavItems.map((item) => {
              const active = item.exact
                ? location.pathname === item.path
                : location.pathname.startsWith(item.path);
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={cn(
                    "flex flex-col items-center gap-1 px-4 py-1.5 rounded-2xl transition-all",
                    active ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="text-[10px] font-medium">{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
