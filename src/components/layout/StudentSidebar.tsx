import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Home,
  Inbox,
  LayoutGrid,
  LogOut,
  Trophy,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureEnabled } from "@/hooks/useFeature";
import { useStudentProfile, useStudentAccent, bestStudentName } from "@/lib/studentProfile";
import { useInboxUnreadCount } from "@/lib/studentInbox";
import { UserAvatar } from "@/components/profile/UserAvatar";
import owlMascot from "@/assets/owl-mascot.png";

/**
 * Light desktop sidebar for the student experience.
 *
 * Presentation-only: it mirrors the exact four student destinations used by the
 * mobile tab bar (Home · More · Study · Profile) and reveals the More services
 * as a nested group so desktop users can reach Timetable / Inbox / Achievements
 * / Leaderboard in one click. Feature flags gate the nested items only.
 */

interface StudentSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

interface Dest {
  path: string;
  label: string;
  icon: typeof Home;
  matches?: string[];
}

const PRIMARY: Dest[] = [
  { path: "/dashboard", label: "Home", icon: Home, matches: ["/dashboard/resources"] },
  { path: "/dashboard/more", label: "More", icon: LayoutGrid },
  { path: "/dashboard/classes", label: "Study", icon: GraduationCap },
  { path: "/dashboard/profile", label: "Profile", icon: User, matches: ["/account"] },
];

export function StudentSidebar({ collapsed, onToggle }: StudentSidebarProps) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { data: profile } = useStudentProfile();
  // Single source of truth: the student's personal accent (NOT tenant branding).
  const accent = useStudentAccent();

  const inboxOn = useFeatureEnabled("studentInbox");
  const gamificationOn = useFeatureEnabled("gamification");
  const leaderboardsOn = useFeatureEnabled("leaderboards");
  const unread = useInboxUnreadCount();

  const services: (Dest & { badge?: number })[] = [
    { path: "/timetable", label: "Timetable", icon: CalendarDays },
    ...(inboxOn
      ? [{ path: "/inbox", label: "Inbox", icon: Inbox, badge: unread.count }]
      : []),
    ...(gamificationOn
      ? [{ path: "/dashboard/achievements", label: "Achievements", icon: Trophy }]
      : []),
    ...(gamificationOn && leaderboardsOn
      ? [{ path: "/dashboard/leaderboard", label: "Leaderboard", icon: BarChart3 }]
      : []),
  ];

  const isActive = (d: Dest) =>
    pathname === d.path || (d.matches ?? []).some((m) => pathname === m || pathname.startsWith(`${m}/`));

  const studyActive = pathname.startsWith("/dashboard/classes");
  const serviceActive = services.some((s) => pathname === s.path);

  const activeFor = (d: Dest) => {
    if (d.path === "/dashboard/classes") return studyActive;
    if (d.path === "/dashboard/more") return pathname === "/dashboard/more" || serviceActive;
    return isActive(d);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <aside
      style={accent.vars}
      className={cn(
        "fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-slate-200/80",
        "bg-[linear-gradient(180deg,#ffffff_0%,#fbfcff_60%,#f6f9ff_100%)]",
        "shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-[width] duration-300 ease-in-out",
        collapsed ? "w-[76px]" : "w-[264px]",
      )}
    >
      {/* Brand */}
      <div className={cn("flex items-center gap-3 px-4 py-5", collapsed && "justify-center px-0")}>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] bg-white shadow-[0_6px_18px_rgba(15,23,42,0.08)] ring-1 ring-inset ring-white">
          <img src={owlMascot} alt="" aria-hidden="true" className="h-8 w-8 object-contain" />
        </span>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-[16px] font-extrabold tracking-[-0.02em] text-[#0F172A]">
              Aras A+
            </p>
            <p className="truncate text-[11.5px] text-slate-500">Student workspace</p>
          </div>
        )}
      </div>

      <nav aria-label="Student navigation" className="flex-1 overflow-y-auto px-3 pb-3">
        <ul className="space-y-1.5">
          {PRIMARY.map((d) => {
            const active = activeFor(d);
            // "More" stays recognisable as the active parent while the student
            // is inside one of its child services, but with a softer tint than
            // the child itself.
            const parentOnly = d.path === "/dashboard/more" && serviceActive && pathname !== d.path;
            return (
              <li key={d.path}>
                <NavLink
                  to={d.path}
                  aria-current={active && !parentOnly ? "page" : undefined}
                  title={collapsed ? d.label : undefined}
                  style={
                    active
                      ? {
                          backgroundColor: parentOnly
                            ? "var(--student-accent-softer)"
                            : "var(--student-accent-soft)",
                          color: "var(--student-accent-foreground)",
                        }
                      : undefined
                  }
                  className={cn(
                    "group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[14.5px] font-semibold transition-colors duration-200 motion-reduce:transition-none",
                    collapsed && "justify-center px-0",
                    active
                      ? "shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]"
                      : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900",
                  )}
                >
                  <d.icon
                    className="h-[21px] w-[21px] shrink-0"
                    style={active ? { color: "var(--student-accent)" } : undefined}
                    strokeWidth={active && !parentOnly ? 2.4 : 2}
                    aria-hidden="true"
                  />
                  {!collapsed && <span className="truncate">{d.label}</span>}
                </NavLink>

                {/* Nested student services under More */}
                {d.path === "/dashboard/more" && !collapsed && services.length > 0 && (
                  <ul className="mt-1 space-y-0.5 border-l border-slate-200/80 pl-3 ml-5">
                    {services.map((s) => {
                      const sActive = pathname === s.path;
                      return (
                        <li key={s.path}>
                          <NavLink
                            to={s.path}
                            aria-current={sActive ? "page" : undefined}
                            style={
                              sActive
                                ? {
                                    backgroundColor: "var(--student-accent-soft)",
                                    color: "var(--student-accent-foreground)",
                                    borderColor: "var(--student-accent-border)",
                                  }
                                : undefined
                            }
                            className={cn(
                              "flex items-center gap-2.5 rounded-xl border border-transparent px-2.5 py-2 text-[13.5px] transition-colors duration-200 motion-reduce:transition-none",
                              sActive
                                ? "font-semibold"
                                : "font-medium text-slate-500 hover:bg-slate-100/80 hover:text-slate-800",
                            )}
                          >
                            <s.icon
                              className="h-[17px] w-[17px] shrink-0"
                              style={sActive ? { color: "var(--student-accent)" } : undefined}
                              aria-hidden="true"
                            />
                            <span className="truncate">{s.label}</span>
                            {!!s.badge && s.badge > 0 && (
                              <span
                                className="ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none text-white"
                                style={{ backgroundColor: "var(--student-accent)" }}
                              >
                                {s.badge > 99 ? "99+" : s.badge}
                              </span>
                            )}
                          </NavLink>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>


      {/* Identity card */}
      {user && (
        <div className={cn("px-3 pb-2", collapsed && "px-2")}>
          <div
            className={cn(
              "flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-2.5",
              "shadow-[0_6px_18px_rgba(15,23,42,0.05)]",
              collapsed && "flex-col gap-2 p-2",
            )}
          >
            <UserAvatar
              path={profile?.avatar_path}
              name={bestStudentName(profile)}
              refreshKey={profile?.avatar_updated_at}
              className="h-9 w-9"
            />
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-semibold text-slate-900">
                  {bestStudentName(profile)}
                </p>
                <p className="truncate text-[11.5px] text-slate-500">Student</p>
              </div>
            )}
            <button
              type="button"
              onClick={handleSignOut}
              aria-label="Sign out"
              title="Sign out"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              <LogOut className="h-[17px] w-[17px]" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onToggle}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className={cn(
          "m-3 flex items-center justify-center gap-2 rounded-2xl border border-slate-200/80 bg-white/80 px-3 py-2",
          "text-[13px] font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900",
        )}
      >
        {collapsed ? (
          <ChevronRight className="h-[18px] w-[18px]" aria-hidden="true" />
        ) : (
          <>
            <ChevronLeft className="h-[18px] w-[18px]" aria-hidden="true" />
            <span>Collapse</span>
          </>
        )}
      </button>
    </aside>
  );
}

export default StudentSidebar;
