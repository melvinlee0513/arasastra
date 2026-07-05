import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { ShieldCheck, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

// Typed wrapper for the beta supabase.auth.oauth namespace.
type OAuthNs = {
  getAuthorizationDetails: (id: string) => Promise<{ data: any; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<{ data: any; error: { message: string } | null }>;
  denyAuthorization: (id: string) => Promise<{ data: any; error: { message: string } | null }>;
};
const oauth = (supabase.auth as unknown as { oauth: OAuthNs }).oauth;

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError("Missing authorization_id");
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = "/auth?next=" + encodeURIComponent(next);
        return;
      }
      const { data, error } = await oauth.getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (error) {
        setError(error.message);
        return;
      }
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  const decide = async (approve: boolean) => {
    setBusy(true);
    const { data, error } = approve
      ? await oauth.approveAuthorization(authorizationId)
      : await oauth.denyAuthorization(authorizationId);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-sky-50 flex items-center justify-center p-8">
      <div className="w-full max-w-md rounded-3xl bg-white/80 backdrop-blur-xl border border-white/40 shadow-[0_8px_30px_rgb(0,0,0,0.06)] p-8 space-y-6">
        <div className="w-12 h-12 rounded-2xl bg-[#0052FF]/10 flex items-center justify-center">
          <ShieldCheck className="w-6 h-6 text-[#0052FF]" />
        </div>

        {error ? (
          <div className="space-y-4">
            <h1 className="text-2xl font-semibold text-[#0F172A]">Authorization unavailable</h1>
            <p className="text-slate-500 text-sm">{error}</p>
            <Link to="/">
              <Button className="rounded-full bg-[#0052FF] hover:bg-[#0047DB] text-white h-11 px-6">
                Return home
              </Button>
            </Link>
          </div>
        ) : !details ? (
          <div className="flex items-center gap-3 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin text-[#0052FF]" />
            Loading authorization request…
          </div>
        ) : (
          <div className="space-y-5">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold text-[#0F172A]">
                Connect {details.client?.name ?? "an app"} to Arasa A+
              </h1>
              <p className="text-slate-500 text-sm">
                {details.client?.name ?? "The client"} will act on your behalf using your Arasa A+
                account. You can revoke access at any time.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3">
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => decide(false)}
                className="rounded-full text-slate-600 hover:text-[#0F172A]"
              >
                Deny
              </Button>
              <Button
                disabled={busy}
                onClick={() => decide(true)}
                className="rounded-full bg-[#0052FF] hover:bg-[#0047DB] text-white h-11 px-6 shadow-[0_8px_30px_rgb(0,82,255,0.25)]"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Approve"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
