import { NavLink, useLocation } from "react-router-dom";
import { Home, Calendar, BookOpen, Inbox, User, ChevronLeft, ChevronRight, Video, Shield, GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import owlMascot from "@/assets/owl-mascot.png";
interface DesktopSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}
const navItems = [{
  path: "/",
  icon: Home,
  label: "Home"
}, {
  path: "/timetable",
  icon: Calendar,
  label: "Timetable"
}, {
  path: "/classes",
  icon: BookOpen,
  label: "Classes"
}, {
  path: "/inbox",
  icon: Inbox,
  label: "Inbox"
}, {
  path: "/account",
  icon: User,
  label: "Account"
}];
const dashboardItems = [{
  path: "/dashboard",
  icon: Home,
  label: "Dashboard",
  exact: true
}, {
  path: "/dashboard/replays",
  icon: Video,
  label: "Replays"
}, {
  path: "/dashboard/learning",
  icon: GraduationCap,
  label: "My Learning"
}];
export function DesktopSidebar({
  collapsed,
  onToggle
}: DesktopSidebarProps) {
  const location = useLocation();
  const {
    isAdmin,
    user
  } = useAuth();
  const isActive = (path: string, exact?: boolean) => {
    if (exact) return location.pathname === path;
    return location.pathname === path;
  };
  return <aside className={cn("fixed left-0 top-0 h-screen bg-sidebar border-r border-sidebar-border z-40", "transition-all duration-300 ease-in-out flex flex-col", collapsed ? "w-16" : "w-64")}>
      {/* Logo Section */}
      <div className="flex items-center gap-3 p-4 border-b bg-primary-foreground border-primary-foreground">
        <img src={owlMascot} alt="Arasa A+" className="w-10 h-10 rounded-xl object-contain" />
        {!collapsed && <div className="animate-fade-up">
            <h1 className="font-bold text-lg text-primary">Arasa A+</h1>
            <p className="text-xs text-secondary-foreground">Learning Platform</p>
          </div>}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {/* Main Nav Items */}
        {navItems.map(item => {
        const active = isActive(item.path);
        return <NavLink key={item.path} to={item.path} className={cn("flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200", "hover:bg-sidebar-accent group", active ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md" : "text-sidebar-foreground hover:text-sidebar-accent-foreground")}>
              <item.icon className={cn("w-5 h-5 transition-transform duration-200", "group-hover:scale-110", active && "text-sidebar-primary-foreground")} />
              {!collapsed && <span className="font-medium animate-fade-up">{item.label}</span>}
              {active && !collapsed && <div className="ml-auto w-2 h-2 rounded-full bg-sidebar-primary-foreground animate-pulse" />}
            </NavLink>;
      })}

        {/* Dashboard Section */}
        {user && <>
            <div className="my-4 border-t border-sidebar-border" />
            {!collapsed && <p className="px-3 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider mb-2">
                My Learning
              </p>}
            {dashboardItems.map(item => {
          const active = isActive(item.path, item.exact);
          return <NavLink key={item.path} to={item.path} className={cn("flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200", "hover:bg-sidebar-accent group", active ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md" : "text-sidebar-foreground hover:text-sidebar-accent-foreground")}>
                  <item.icon className={cn("w-5 h-5 transition-transform duration-200", "group-hover:scale-110", active && "text-sidebar-primary-foreground")} />
                  {!collapsed && <span className="font-medium animate-fade-up">{item.label}</span>}
                </NavLink>;
        })}
          </>}

        {/* Admin Link */}
        {isAdmin && <>
            <div className="my-4 border-t border-sidebar-border" />
            <NavLink to="/admin" className={cn("flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200", "hover:bg-sidebar-accent group", location.pathname.startsWith("/admin") ? "bg-accent text-accent-foreground shadow-md" : "text-sidebar-foreground hover:text-sidebar-accent-foreground")}>
              <Shield className="w-5 h-5 group-hover:scale-110 transition-transform" />
              {!collapsed && <span className="font-medium">Admin Portal</span>}
            </NavLink>
          </>}
      </nav>

      {/* Collapse Toggle */}
      <button onClick={onToggle} className={cn("m-3 p-2 rounded-xl border border-sidebar-border", "hover:bg-sidebar-accent transition-colors duration-200", "flex items-center justify-center text-sidebar-foreground")}>
        {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
      </button>
    </aside>;
}