import { ReactNode, useState } from "react";
import { DesktopSidebar } from "./DesktopSidebar";
import { MobileBottomNav } from "./MobileBottomNav";
import { NotificationBell } from "./NotificationBell";
import { CommandSearch } from "./CommandSearch";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/useAuth";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const isMobile = useIsMobile();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop Sidebar */}
      {!isMobile && (
        <DesktopSidebar 
          collapsed={sidebarCollapsed} 
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} 
        />
      )}
      
      {/* Top Bar with Notification Bell & Search */}
      {user && (
        <div 
          className={`fixed top-0 right-0 z-30 flex items-center gap-2 p-3 ${
            isMobile ? 'left-0 justify-end' : sidebarCollapsed ? 'left-16' : 'left-64'
          } transition-all duration-300`}
        >
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground gap-2 text-xs hidden sm:flex"
            onClick={() => setSearchOpen(true)}
          >
            <Search className="w-4 h-4" />
            <span>Search</span>
            <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
              ⌘K
            </kbd>
          </Button>
          <NotificationBell />
        </div>
      )}

      <CommandSearch />
      
      {/* Main Content */}
      <main 
        className={`
          transition-all duration-300 ease-in-out
          ${isMobile ? 'pb-20' : sidebarCollapsed ? 'ml-16' : 'ml-64'}
          ${user ? 'pt-14' : ''}
        `}
      >
        <div className="min-h-screen">
          {children}
        </div>
      </main>
      
      {/* Mobile Bottom Navigation */}
      {isMobile && <MobileBottomNav />}
    </div>
  );
}