import { NavLink, useLocation } from "react-router-dom";
import { Home, Calendar, BookOpen, Inbox, User } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { path: "/", icon: Home, label: "Home" },
  { path: "/timetable", icon: Calendar, label: "Schedule" },
  { path: "/classes", icon: BookOpen, label: "Classes" },
  { path: "/inbox", icon: Inbox, label: "Inbox" },
  { path: "/account", icon: User, label: "Profile" },
];

export function MobileBottomNav() {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50 safe-area-inset-bottom">
      <div className="flex items-center justify-around px-2 py-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={cn(
                "flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all duration-200",
                "min-w-[60px]",
                isActive 
                  ? "text-accent bg-accent/10" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <item.icon 
                className={cn(
                  "w-5 h-5 transition-transform duration-200",
                  isActive && "scale-110"
                )} 
              />
              <span className={cn(
                "text-[10px] font-medium",
                isActive && "text-accent"
              )}>
                {item.label}
              </span>
              {isActive && (
                <div className="absolute -bottom-1 w-8 h-1 rounded-full bg-accent" />
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}