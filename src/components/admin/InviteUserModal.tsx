import { useState } from "react";
import { Copy, Mail, UserPlus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { showSupabaseError } from "@/lib/supabaseErrors";
import { tenantHrefFor, hqHrefFor } from "@/lib/tenantSubdomain";



interface InviteUserModalProps {
  open: boolean;
  onClose: () => void;
}

type Role = "student" | "tutor";

export function InviteUserModal({ open, onClose }: InviteUserModalProps) {
  const { currentTenantId, center } = useTenant();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("student");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setEmail("");
    setRole("student");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTenantId) {
      toast.error("No active organization context");
      return;
    }
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error("Please enter a valid email address");
      return;
    }

    setSubmitting(true);
    try {
      // Guard against duplicates: block a second pending invite for same email in this centre.
      const { data: existing } = await supabase
        .from("invitations")
        .select("id")
        .eq("email", trimmed)
        .eq("center_id", currentTenantId)
        .eq("status", "pending")
        .maybeSingle();

      if (existing) {
        toast.error("A pending invitation already exists for this email in this organization.");
        return;
      }

      const { data: authData } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("invitations")
        .insert({
          email: trimmed,
          role,
          center_id: currentTenantId,
          status: "pending",
          invited_by: authData.user?.id ?? null,
        } as any)
        .select("id, token")
        .single();

      if (error) {
        // Postgres unique_violation
        if ((error as { code?: string }).code === "23505") {
          toast.error("A pending invitation already exists for this email in this organization.");
          return;
        }
        throw error;
      }

      const tokenValue = (data as any).token ?? data.id;
      const slug = center?.subdomainSlug ?? null;
      const link = slug
        ? tenantHrefFor(slug, `/invite?token=${tokenValue}`)
        : hqHrefFor(`/invite?token=${tokenValue}`);


      toast.success("Invitation created", {
        description: link,
        duration: 15000,
        action: {
          label: "Copy link",
          onClick: () => {
            navigator.clipboard.writeText(link);
            toast.success("Link copied to clipboard");
          },
        },
      });

      reset();
      onClose();
    } catch (err) {
      showSupabaseError(err as any, "Failed to create invitation");
    } finally {

      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[480px] bg-white/90 backdrop-blur-xl border-slate-200 rounded-3xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.08)]">
        <DialogHeader className="space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-[color:var(--brand-primary)]/10 flex items-center justify-center">
            <UserPlus className="w-6 h-6 text-[color:var(--brand-primary)]" />
          </div>
          <DialogTitle className="text-2xl font-semibold text-[color:var(--brand-midnight)]">Invite a new user</DialogTitle>
          <DialogDescription className="text-slate-500">
            Send a token-gated signup link to a student or tutor for your organization.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6 pt-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-email" className="text-[color:var(--brand-midnight)] font-medium">Email address</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                id="invite-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student@example.com"
                className="pl-10 rounded-full h-11 border-slate-200 focus-visible:ring-[color:var(--brand-primary)]"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-[color:var(--brand-midnight)] font-medium">Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger className="rounded-full h-11 border-slate-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-2xl">
                <SelectItem value="student">Student</SelectItem>
                <SelectItem value="tutor">Tutor</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              className="rounded-full text-slate-600 hover:text-[color:var(--brand-midnight)]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-[color:var(--brand-primary)] hover:opacity-90 text-white px-6 h-11 shadow-[0_8px_30px_rgb(0,82,255,0.25)]"
            >
              {submitting ? "Creating…" : (
                <span className="flex items-center gap-2">
                  <Copy className="w-4 h-4" /> Create invite link
                </span>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
