import { Building2, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function NoOrganizationView() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleExit = async () => {
    if (user) {
      await supabase.auth.signOut();
    }
    navigate("/auth", { replace: true });
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-sky-50 p-8">
      <div className="flex flex-col items-center gap-6 max-w-md text-center rounded-3xl bg-white/70 backdrop-blur-xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-10">
        <div className="rounded-3xl bg-slate-100/70 p-6">
          <Building2 className="w-14 h-14 text-slate-400" strokeWidth={1.5} />
        </div>

        <div className="flex flex-col gap-3">
          <h1 className="text-2xl font-semibold" style={{ color: "#0F172A" }}>
            No Organization Assigned
          </h1>
          <p className="text-sm text-slate-500 leading-relaxed">
            Your account isn't linked to a tuition centre yet. Contact your
            administrator to be added to an organisation, then sign back in to
            continue.
          </p>
        </div>

        <button
          onClick={handleExit}
          className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium text-white shadow-[0_8px_30px_rgb(0,82,255,0.25)] transition-transform hover:scale-[1.02] active:scale-[0.98]"
          style={{ backgroundColor: "#0052FF" }}
        >
          <LogOut className="w-4 h-4" />
          {user ? "Log Out & Return to Login" : "Return to Login"}
        </button>
      </div>
    </div>
  );
}
