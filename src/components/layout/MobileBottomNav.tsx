import { NavLink, useLocation } from "react-router-dom";
import { Home, LayoutGrid, GraduationCap, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface TabItem {
  path: string;
  icon: typeof Home;
  label: string;
  /** Accessible name when the visual label is shortened. */
  accessibleLabel?: string;
  /** Extra prefixes that keep this tab active. */
  matches?: string[];
}

const tabs: TabItem[] = [
  { path: "/dashboard", icon: Home, label: "Home", matches: ["/dashboard/achievements", "/dashboard/resources"] },
  {
    path: "/dashboard/more",
    icon: LayoutGrid,
    label: "More",
    accessibleLabel: "More student services",
    matches: ["/timetable", "/inbox", "/dashboard/leaderboard"],
  },
  {
    path: "/dashboard/classes",
    icon: GraduationCap,
    label: "Study",
    accessibleLabel: "Study — my classes",
  },
  { path: "/dashboard/profile", icon: User, label: "Profile", matches: ["/account"] },
];

/**
 * Student mobile tab bar. Rendered only on root-level student routes — the
 * route-aware student shell hides it inside classes and learning activities.
 */
export function MobileBottomNav() {
  const { pathname } = useLocation();

  const isActive = (tab: TabItem) => {
    if (pathname === tab.path) return true;
    return (tab.matches ?? []).some((m) => pathname === m || pathname.startsWith(`${m}/`));
  };

  return (
    <nav
      aria-label="Student navigation"
      className="fixed bottom-0 left-0 right-0 z-[60] bg-card/95 backdrop-blur-lg border-t border-border pb-[env(safe-area-inset-bottom)]"
    >
      <div className="flex items-stretch justify-around px-1">
        {tabs.map((tab) => {
          const active = isActive(tab);
          return (
            <NavLink
              key={tab.path}
              to={tab.path}
              aria-label={tab.accessibleLabel ?? tab.label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex flex-1 flex-col items-center justify-center gap-1 min-h-[56px] min-w-[44px] py-2 rounded-xl transition-colors",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <tab.icon
                className={cn("w-[22px] h-[22px] transition-transform", active && "scale-110")}
                aria-hidden="true"
              />
              <span className={cn("text-[11px] font-medium leading-none", active && "font-semibold")}>
                {tab.label}
              </span>
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute top-0 w-8 h-[3px] rounded-full bg-primary"
                />
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
