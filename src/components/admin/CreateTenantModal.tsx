import { useState, useMemo } from "react";
import { Building2, Copy, Globe, Mail } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";
import {
  normalizeSlugInput,
  validateSubdomainSlug,
  tenantUrlFor,
  ROOT_DOMAIN,
} from "@/lib/tenantSubdomain";

interface CreateTenantModalProps {
  open: boolean;
  onClose: () => void;
}

export function CreateTenantModal({ open, onClose }: CreateTenantModalProps) {
  const { isSuperAdmin, refreshCenters } = useTenant();
  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!isSuperAdmin) return null;

  const reset = () => {
    setName("");
    setLogoUrl("");
    setAdminEmail("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = name.trim();
    const trimmedEmail = adminEmail.trim().toLowerCase();
    const trimmedLogo = logoUrl.trim();

    if (!trimmedName || trimmedName.length > 120) {
      toast.error("Please enter a valid centre name");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast.error("Please enter a valid admin email address");
      return;
    }
    if (trimmedLogo && !/^https?:\/\//i.test(trimmedLogo)) {
      toast.error("Logo URL must start with http(s)://");
      return;
    }

    setSubmitting(true);
    try {
      // Step 1: create tuition centre
      const { data: centre, error: centreError } = await supabase
        .from("tuition_centers")
        .insert({
          name: trimmedName,
          logo_url: trimmedLogo || null,
        })
        .select("id")
        .single();

      if (centreError) throw centreError;

      // Step 2: create pending admin invitation tied to the new centre
      const { data: invite, error: inviteError } = await supabase
        .from("invitations")
        .insert({
          email: trimmedEmail,
          role: "admin",
          center_id: centre.id,
          status: "pending",
        })
        .select("id")
        .single();

      if (inviteError) throw inviteError;

      const link = `${window.location.origin}/invite?token=${invite.id}`;

      toast.success("Tenant created", {
        description: link,
        duration: 15000,
        action: {
          label: "Copy link",
          onClick: () => {
            navigator.clipboard.writeText(link);
            toast.success("Invitation link copied");
          },
        },
      });

      await refreshCenters();
      reset();
      onClose();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create tenant";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[520px] bg-white/95 backdrop-blur-md border-slate-200 rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.08)]">
        <DialogHeader className="space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-[#0052FF]/10 flex items-center justify-center">
            <Building2 className="w-6 h-6 text-[#0052FF]" />
          </div>
          <DialogTitle className="text-2xl font-semibold text-[#0F172A]">
            Create a new tenant
          </DialogTitle>
          <DialogDescription className="text-slate-500">
            Provision a tuition centre and generate an admin invitation link.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="centre-name" className="text-[#0F172A] font-medium">
              Centre name
            </Label>
            <Input
              id="centre-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              placeholder="Arasa Learning Hub"
              className="rounded-full h-11 border-slate-200 focus-visible:ring-[#0052FF]"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="centre-logo" className="text-[#0F172A] font-medium">
              Centre logo URL <span className="text-slate-400 font-normal">(optional)</span>
            </Label>
            <Input
              id="centre-logo"
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://images.unsplash.com/..."
              className="rounded-full h-11 border-slate-200 focus-visible:ring-[#0052FF]"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="admin-email" className="text-[#0F172A] font-medium">
              Admin email
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                id="admin-email"
                type="email"
                required
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="admin@centre.com"
                className="pl-10 rounded-full h-11 border-slate-200 focus-visible:ring-[#0052FF]"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={submitting}
              className="rounded-full text-slate-600 hover:text-[#0F172A]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-[#0052FF] hover:bg-[#0047DB] text-white px-6 h-11 shadow-[0_8px_30px_rgb(0,82,255,0.25)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full border-2 border-white/60 border-t-white animate-spin" />
                  Provisioning…
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Copy className="w-4 h-4" /> Create tenant
                </span>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
