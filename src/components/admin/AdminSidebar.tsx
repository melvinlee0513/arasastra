import { NavLink, useLocation } from "react-router-dom";
import { 
  LayoutDashboard, 
  FileEdit, 
  Users, 
  Calendar, 
  BarChart3, 
  ChevronLeft, 
  ChevronRight,
  Home,
  LogOut,
  FileText,
  CreditCard
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import owlMascot from "@/assets/owl-mascot.png";

interface AdminSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

const navItems = [
  { path: "/admin", icon: LayoutDashboard, label: "Dashboard", exact: true },
  { path: "/admin/content", icon: FileEdit, label: "Content CMS" },
  { path: "/admin/users", icon: Users, label: "Users" },
  { path: "/admin/schedule", icon: Calendar, label: "Schedule" },
  { path: "/admin/notes", icon: FileText, label: "Notes Bank" },
  { path: "/admin/payments", icon: CreditCard, label: "Payments" },
  { path: "/admin/analytics", icon: BarChart3, label: "Analytics" },
];

export function AdminSidebar({ collapsed, onToggle }: AdminSidebarProps) {
  const location = useLocation();
  const { signOut, profile } = useAuth();

  const isActive = (path: string, exact?: boolean) => {
    if (exact) return location.pathname === path;
    return location.pathname.startsWith(path);
  };

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 h-screen bg-sidebar border-r border-sidebar-border z-40",
        "transition-all duration-300 ease-in-out flex flex-col",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo Section */}
      <div className="flex items-center gap-3 p-4 border-b border-sidebar-border">
        <img src={owlMascot} alt="Arasa A+" className="w-10 h-10 rounded-xl object-contain" />
        {!collapsed && (
          <div className="animate-fade-up">
            <h1 className="font-bold text-lg text-sidebar-foreground">Arasa A+</h1>
            <p className="text-xs text-sidebar-foreground/60">Admin Portal</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const active = isActive(item.path, item.exact);
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.exact}
              className={cn(
                "flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200",
                "hover:bg-sidebar-accent group",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md"
                  : "text-sidebar-foreground hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon
                className={cn(
                  "w-5 h-5 transition-transform duration-200",
                  "group-hover:scale-110",
                  active && "text-sidebar-primary-foreground"
                )}
              />
              {!collapsed && <span className="font-medium animate-fade-up">{item.label}</span>}
              {active && !collapsed && (
                <div className="ml-auto w-2 h-2 rounded-full bg-sidebar-primary-foreground animate-pulse" />
              )}
            </NavLink>
          );
        })}

        {/* Divider */}
        <div className="my-4 border-t border-sidebar-border" />

        {/* Quick Links */}
        <NavLink
          to="/"
          className={cn(
            "flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200",
            "hover:bg-sidebar-accent text-sidebar-foreground hover:text-sidebar-accent-foreground group"
          )}
        >
          <Home className="w-5 h-5 group-hover:scale-110 transition-transform" />
          {!collapsed && <span className="font-medium">Student View</span>}
        </NavLink>
      </nav>

      {/* User Section */}
      {!collapsed && profile && (
        <div className="p-3 border-t border-sidebar-border">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center text-sm font-medium text-sidebar-foreground">
              {profile.full_name?.charAt(0).toUpperCase() || "A"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">
                {profile.full_name}
              </p>
              <p className="text-xs text-sidebar-foreground/60">Administrator</p>
            </div>
          </div>
        </div>
      )}

      {/* Sign Out & Collapse Toggle */}
      <div className="p-3 space-y-2">
        <button
          onClick={signOut}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2 rounded-xl",
            "hover:bg-destructive/10 text-destructive transition-colors duration-200"
          )}
        >
          <LogOut className="w-5 h-5" />
          {!collapsed && <span className="font-medium">Sign Out</span>}
        </button>

        <button
          onClick={onToggle}
          className={cn(
            "w-full p-2 rounded-xl border border-sidebar-border",
            "hover:bg-sidebar-accent transition-colors duration-200",
            "flex items-center justify-center text-sidebar-foreground"
          )}
        >
          {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </button>
      </div>
    </aside>
  );
}
