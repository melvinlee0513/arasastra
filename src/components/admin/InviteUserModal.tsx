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

interface InviteUserModalProps {
  open: boolean;
  onClose: () => void;
}

type Role = "student" | "tutor";

export function InviteUserModal({ open, onClose }: InviteUserModalProps) {
  const { currentTenantId } = useTenant();
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
      const { data, error } = await supabase
        .from("invitations")
        .insert({
          email: trimmed,
          role,
          center_id: currentTenantId,
          status: "pending",
        })
        .select("id")
        .single();

      if (error) throw error;

      const link = `${window.location.origin}/invite?token=${data.id}`;

      toast.success("Invitation created", {
        description: link,
        duration: 10000,
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
      const message = err instanceof Error ? err.message : "Failed to create invitation";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[480px] bg-white/90 backdrop-blur-xl border-slate-200 rounded-3xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.08)]">
        <DialogHeader className="space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-[#0052FF]/10 flex items-center justify-center">
            <UserPlus className="w-6 h-6 text-[#0052FF]" />
          </div>
          <DialogTitle className="text-2xl font-semibold text-[#0F172A]">Invite a new user</DialogTitle>
          <DialogDescription className="text-slate-500">
            Send a token-gated signup link to a student or tutor for your organization.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6 pt-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-email" className="text-[#0F172A] font-medium">Email address</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                id="invite-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student@example.com"
                className="pl-10 rounded-full h-11 border-slate-200 focus-visible:ring-[#0052FF]"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-[#0F172A] font-medium">Role</Label>
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
              className="rounded-full text-slate-600 hover:text-[#0F172A]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-[#0052FF] hover:bg-[#0047DB] text-white px-6 h-11 shadow-[0_8px_30px_rgb(0,82,255,0.25)]"
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
