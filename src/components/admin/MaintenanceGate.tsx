import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Wrench } from "lucide-react";
import owlMascot from "@/assets/owl-mascot.png";

export function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);
  const [message, setMessage] = useState("We are upgrading the experience. Please check back shortly.");
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    checkMaintenance();
  }, []);

  const checkMaintenance = async () => {
    try {
      const { data } = await supabase
        .from("content_sections")
        .select("content")
        .eq("section_key", "maintenance_mode")
        .single();

      if (data?.content) {
        const content = data.content as Record<string, unknown>;
        const enabled = content.enabled as boolean;
        setIsMaintenanceMode(enabled || false);
        setMessage((content.message as string) || message);
      }

      // Check if current user is admin (admins bypass maintenance)
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", session.user.id)
          .single();
        setIsAdmin(roleData?.role === "admin");
      }
    } catch {
      // If check fails, allow access
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (isMaintenanceMode && !isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-6">
          <img src={owlMascot} alt="Arasa A+" className="w-24 h-24 mx-auto object-contain" />
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 text-accent">
              <Wrench className="w-4 h-4" />
              <span className="text-sm font-medium">System Maintenance</span>
            </div>
            <h1 className="text-3xl font-bold text-foreground">
              Upgrading the Experience
            </h1>
            <p className="text-muted-foreground">{message}</p>
          </div>
          <div className="rounded-3xl border border-border/40 bg-card/80 backdrop-blur-xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
            <p className="text-sm text-muted-foreground">
              Our team is making Arasa A+ even better for you. We'll be back shortly with exciting improvements!
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Arasa A+ Education • Your path to academic excellence
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
