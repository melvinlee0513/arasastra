import { useEffect, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { ShieldAlert, Mail, Lock, User, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Invitation {
  id: string;
  email: string;
  role: string;
  center_id: string;
  status: string;
}

export default function InvitePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") ?? "";

  const [loading, setLoading] = useState(true);
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!token) {
        setError("This invitation link is missing a token.");
        setLoading(false);
        return;
      }
      const { data, error: qErr } = await supabase
        .from("invitations")
        .select("id, email, role, center_id, status")
        .eq("id", token)
        .eq("status", "pending")
        .maybeSingle();

      if (qErr || !data) {
        setError("Invalid or Expired Invitation");
      } else {
        setInvitation(data as Invitation);
      }
      setLoading(false);
    };
    load();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invitation) return;
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setSubmitting(true);
    try {
      const { error: signUpErr } = await supabase.auth.signUp({
        email: invitation.email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: {
            invite_token: token,
            full_name: fullName.trim() || invitation.email,
          },
        },
      });
      if (signUpErr) throw signUpErr;
      toast.success("Welcome aboard", { description: "Your account is ready." });
      navigate("/dashboard", { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Signup failed";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-sky-50 flex items-center justify-center p-8">
      <div className="w-full max-w-md">
        {loading ? (
          <div className="rounded-3xl bg-white/80 backdrop-blur-md p-8 flex flex-col items-center gap-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
            <Loader2 className="w-8 h-8 animate-spin text-[#0052FF]" />
            <p className="text-slate-500">Verifying invitation…</p>
          </div>
        ) : error ? (
          <div className="rounded-3xl bg-white/80 backdrop-blur-md p-8 flex flex-col items-center gap-6 text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-red-100">
            <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center">
              <ShieldAlert className="w-8 h-8 text-red-500" />
            </div>
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl font-semibold text-[#0F172A]">Invitation Unavailable</h1>
              <p className="text-slate-500">{error}</p>
            </div>
            <Link to="/auth">
              <Button className="rounded-full bg-[#0052FF] hover:bg-[#0047DB] text-white px-6 h-11 shadow-[0_8px_30px_rgb(0,82,255,0.25)]">
                Return to Login
              </Button>
            </Link>
          </div>
        ) : invitation ? (
          <div className="rounded-3xl bg-white/80 backdrop-blur-md p-8 flex flex-col gap-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100">
            <div className="flex flex-col gap-2">
              <span className="inline-flex self-start rounded-full bg-[#0052FF]/10 text-[#0052FF] text-xs font-medium px-3 py-1 uppercase tracking-wide">
                {invitation.role} invitation
              </span>
              <h1 className="text-2xl font-semibold text-[#0F172A]">You're invited</h1>
              <p className="text-slate-500">
                Finish creating your account to join your organization.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <Label className="text-[#0F172A] font-medium">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    type="email"
                    value={invitation.email}
                    disabled
                    className="pl-10 rounded-full h-11 border-slate-200 bg-slate-50 text-slate-500"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="full-name" className="text-[#0F172A] font-medium">Full name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    id="full-name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your name"
                    className="pl-10 rounded-full h-11 border-slate-200 focus-visible:ring-[#0052FF]"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="invite-password" className="text-[#0F172A] font-medium">Create a password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    id="invite-password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="pl-10 rounded-full h-11 border-slate-200 focus-visible:ring-[#0052FF]"
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={submitting}
                className="rounded-full bg-[#0052FF] hover:bg-[#0047DB] text-white h-11 shadow-[0_8px_30px_rgb(0,82,255,0.25)]"
              >
                {submitting ? "Creating account…" : "Accept invitation & sign up"}
              </Button>
            </form>
          </div>
        ) : null}
      </div>
    </div>
  );
}
