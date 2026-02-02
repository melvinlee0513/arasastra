import { ReactNode, useState } from "react";
import { DesktopSidebar } from "./DesktopSidebar";
import { MobileBottomNav } from "./MobileBottomNav";
import { useIsMobile } from "@/hooks/use-mobile";
import { WhatsAppFAB } from "@/components/shared/WhatsAppFAB";

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const isMobile = useIsMobile();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop Sidebar */}
      {!isMobile && (
        <DesktopSidebar 
          collapsed={sidebarCollapsed} 
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} 
        />
      )}
      
      {/* Main Content */}
      <main 
        className={`
          transition-all duration-300 ease-in-out
          ${isMobile ? 'pb-20' : sidebarCollapsed ? 'ml-16' : 'ml-64'}
        `}
      >
        <div className="min-h-screen">
          {children}
        </div>
      </main>
      
      {/* Mobile Bottom Navigation */}
      {isMobile && <MobileBottomNav />}
      
      {/* WhatsApp Support FAB */}
      <WhatsAppFAB />
    </div>
  );
}