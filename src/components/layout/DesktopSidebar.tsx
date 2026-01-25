import { NavLink, useLocation } from "react-router-dom";
import { Home, Calendar, BookOpen, Inbox, User, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
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
export function DesktopSidebar({
  collapsed,
  onToggle
}: DesktopSidebarProps) {
  const location = useLocation();
  return <aside className={cn("fixed left-0 top-0 h-screen bg-sidebar border-r border-sidebar-border z-40", "transition-all duration-300 ease-in-out flex flex-col", collapsed ? "w-16" : "w-64")}>
      {/* Logo Section */}
      <div className="flex items-center gap-3 p-4 border-b border-sidebar-border">
        <img src={owlMascot} alt="StudyOwl" className="w-10 h-10 rounded-xl object-contain" />
        {!collapsed && <div className="animate-fade-up">
            <h1 className="font-bold text-lg text-sidebar-foreground">Astra</h1>
            <p className="text-xs text-sidebar-foreground/60">Learning Platform</p>
          </div>}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map(item => {
        const isActive = location.pathname === item.path;
        return <NavLink key={item.path} to={item.path} className={cn("flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200", "hover:bg-sidebar-accent group", isActive ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md" : "text-sidebar-foreground hover:text-sidebar-accent-foreground")}>
              <item.icon className={cn("w-5 h-5 transition-transform duration-200", "group-hover:scale-110", isActive && "text-sidebar-primary-foreground")} />
              {!collapsed && <span className="font-medium animate-fade-up">{item.label}</span>}
              {isActive && !collapsed && <div className="ml-auto w-2 h-2 rounded-full bg-sidebar-primary-foreground animate-pulse" />}
            </NavLink>;
      })}
      </nav>

      {/* Collapse Toggle */}
      <button onClick={onToggle} className={cn("m-3 p-2 rounded-xl border border-sidebar-border", "hover:bg-sidebar-accent transition-colors duration-200", "flex items-center justify-center text-sidebar-foreground")}>
        {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
      </button>
    </aside>;
}