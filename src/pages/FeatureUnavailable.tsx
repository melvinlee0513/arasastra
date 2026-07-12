import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTenant } from "@/contexts/TenantContext";

interface FeatureUnavailableProps {
  feature?: string;
}

export function FeatureUnavailable({ feature }: FeatureUnavailableProps) {
  const { center } = useTenant();
  return (
    <div className="min-h-[70vh] flex items-center justify-center p-8">
      <div className="max-w-md w-full text-center flex flex-col items-center gap-5 rounded-3xl bg-white/70 backdrop-blur-xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-10">
        <div className="w-14 h-14 rounded-2xl bg-[color:var(--brand-primary)]/10 flex items-center justify-center">
          <Sparkles className="w-7 h-7 text-[color:var(--brand-primary)]" />
        </div>
        <h1 className="text-2xl font-semibold text-[color:var(--brand-midnight)]">
          {feature ? `${feature} isn't enabled` : "This feature isn't enabled"}
        </h1>
        <p className="text-sm text-slate-500">
          {center?.name ?? "Your organisation"} hasn't turned this on yet. Contact your admin if you
          think it should be available for your account.
        </p>
        <Link to="/dashboard">
          <Button className="rounded-full bg-[color:var(--brand-primary)] hover:opacity-90 text-white px-6 h-11">
            Back to dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}

export default FeatureUnavailable;
