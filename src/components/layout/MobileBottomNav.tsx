import { NavLink, useLocation } from "react-router-dom";
import { Home, LayoutGrid, GraduationCap, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBottomNavHidden } from "@/lib/uiChrome";

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
    matches: ["/timetable", "/inbox", "/dashboard/leaderboard", "/support", "/privacy"],
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
 * Student mobile tab bar — a floating capsule that never touches the viewport
 * edges. Rendered only on root-level student routes; the route-aware student
 * shell hides it inside classes and learning activities.
 */
export function MobileBottomNav() {
  const { pathname } = useLocation();
  const hidden = useBottomNavHidden();

  const isActive = (tab: TabItem) => {
    if (pathname === tab.path) return true;
    return (tab.matches ?? []).some((m) => pathname === m || pathname.startsWith(`${m}/`));
  };

  // Mobile overlays (Edit Profile sheet) suppress the pill so it can never
  // cover their action footer.
  if (hidden) return null;


  return (
    <nav
      aria-label="Student navigation"
      className={cn(
        "fixed z-[60] left-3 right-3 mx-auto w-auto max-w-[420px]",
        "bottom-[calc(0.625rem+env(safe-area-inset-bottom))]",
        "h-[68px] rounded-full border border-white/80 bg-white/92 backdrop-blur-xl",
        "shadow-[0_10px_30px_rgba(15,23,42,0.14),inset_0_1px_0_rgba(255,255,255,0.9)]",
      )}
    >
      <div className="flex h-full items-stretch px-1.5">
        {tabs.map((tab) => {
          const active = isActive(tab);
          return (
            <NavLink
              key={tab.path}
              to={tab.path}
              aria-label={tab.accessibleLabel ?? tab.label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex flex-1 basis-0 flex-col items-center justify-center gap-[3px]",
                "min-h-[44px] min-w-0 rounded-full transition-all duration-200 active:scale-95 motion-reduce:transition-none",
                active ? "text-primary" : "text-slate-500",
              )}
            >
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute inset-y-[6px] inset-x-1 rounded-[22px] bg-primary/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]"
                />
              )}
              <tab.icon
                className={cn(
                  "relative transition-transform duration-200 motion-reduce:transition-none",
                  active ? "h-[23px] w-[23px] -translate-y-[1px]" : "h-[21px] w-[21px]",
                )}
                strokeWidth={active ? 2.4 : 2}
                aria-hidden="true"
              />
              <span
                className={cn(
                  "relative text-[11px] leading-none",
                  active ? "font-bold" : "font-medium",
                )}
              >
                {tab.label}
              </span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
