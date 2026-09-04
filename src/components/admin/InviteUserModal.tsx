import { useMemo, useState } from "react";
import { Check, Copy, ClipboardList, UserPlus, AlertTriangle, Loader2, RefreshCw } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

type InviteResult =
  | "created"
  | "already_invited"
  | "already_member"
  | "duplicate_in_batch"
  | "invalid_email"
  | "invalid_role";

interface InviteRow {
  email: string;
  role: string;
  result: InviteResult;
  invitation_id: string | null;
  token: string | null;
  expires_at: string | null;
}

const RESULT_COPY: Record<InviteResult, { label: string; tone: string }> = {
  created: { label: "Invited", tone: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  already_invited: {
    label: "Already invited",
    tone: "border-amber-200 bg-amber-50 text-amber-700",
  },
  already_member: {
    label: "Already a member",
    tone: "border-slate-200 bg-slate-50 text-slate-600",
  },
  duplicate_in_batch: {
    label: "Duplicate in list",
    tone: "border-slate-200 bg-slate-50 text-slate-600",
  },
  invalid_email: { label: "Invalid email", tone: "border-red-200 bg-red-50 text-red-600" },
  invalid_role: { label: "Invalid role", tone: "border-red-200 bg-red-50 text-red-600" },
};

/** Split a pasted list on commas, semicolons, whitespace and newlines. */
function parseEmails(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\s,;]+/)
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

/**
 * Bulk invitation modal. Centre admins onboard whole cohorts, so invitations are
 * created in one tenant-checked server call that reports a per-email outcome
 * instead of failing the whole batch on the first duplicate.
 */
export function InviteUserModal({ open, onClose }: InviteUserModalProps) {
  const { currentTenantId, center } = useTenant();
  const [raw, setRaw] = useState("");
  const [role, setRole] = useState<Role>("student");
  const [submitting, setSubmitting] = useState(false);
  const [rows, setRows] = useState<InviteRow[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const emails = useMemo(() => parseEmails(raw), [raw]);

  const linkFor = (token: string) => {
    const slug = center?.subdomainSlug ?? null;
    const path = `/invite?token=${token}`;
    return slug ? tenantHrefFor(slug, path) : hqHrefFor(path);
  };

  const closeAll = () => {
    setRaw("");
    setRows(null);
    setCopied(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTenantId) {
      toast.error("No active organization context");
      return;
    }
    if (emails.length === 0) {
      toast.error("Add at least one email address");
      return;
    }
    if (emails.length > 200) {
      toast.error("Invite up to 200 people at a time");
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await (supabase as any).rpc("create_center_invitations", {
        _center_id: currentTenantId,
        _invites: emails.map((email) => ({ email, role })),
      });
      if (error) throw error;

      const result = (data ?? []) as InviteRow[];
      setRows(result);
      const createdCount = result.filter((r) => r.result === "created").length;
      if (createdCount > 0) {
        toast.success(
          `${createdCount} invitation${createdCount === 1 ? "" : "s"} created`,
        );
      } else {
        toast.error("No new invitations were created");
      }
    } catch (err) {
      showSupabaseError(err as any, "Failed to create invitations");
    } finally {
      setSubmitting(false);
    }
  };

  const created = (rows ?? []).filter((r) => r.result === "created" && r.token);

  const copy = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    toast.success("Copied to clipboard");
    window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeAll()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[560px] bg-white/95 backdrop-blur-xl border-slate-200 rounded-3xl p-6 sm:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.08)]">
        <DialogHeader className="space-y-3 text-left">
          <div className="w-12 h-12 rounded-2xl bg-[color:var(--brand-primary)]/10 flex items-center justify-center">
            <UserPlus className="w-6 h-6 text-[color:var(--brand-primary)]" />
          </div>
          <DialogTitle className="text-2xl font-semibold text-[color:var(--brand-midnight)]">
            Invite users
          </DialogTitle>
          <DialogDescription className="text-slate-500">
            Paste one or many email addresses. Each person gets their own single-use
            signup link for {center?.name ?? "your organization"}.
          </DialogDescription>
        </DialogHeader>

        {rows ? (
          <div className="flex flex-col gap-4 pt-2">
            <div className="space-y-2">
              {rows.map((row) => {
                const copyInfo = RESULT_COPY[row.result] ?? RESULT_COPY.invalid_email;
                return (
                  <div
                    key={`${row.email}-${row.result}`}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[color:var(--brand-midnight)]">
                        {row.email || "—"}
                      </p>
                      <p className="text-xs text-slate-500 capitalize">{row.role}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="outline" className={`text-[11px] ${copyInfo.tone}`}>
                        {copyInfo.label}
                      </Badge>
                      {row.result === "created" && row.token && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="rounded-full"
                          onClick={() => copy(linkFor(row.token as string), row.email)}
                        >
                          {copied === row.email ? (
                            <Check className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {created.length === 0 && (
              <p className="inline-flex items-center gap-2 text-sm text-amber-700">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                Nothing to send — review the results above.
              </p>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              {created.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  onClick={() =>
                    copy(
                      created
                        .map((r) => `${r.email}: ${linkFor(r.token as string)}`)
                        .join("\n"),
                      "__all__",
                    )
                  }
                >
                  <ClipboardList className="mr-2 h-4 w-4" /> Copy all links
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                className="rounded-full"
                onClick={() => {
                  setRows(null);
                  setRaw("");
                }}
              >
                Invite more
              </Button>
              <Button
                type="button"
                className="rounded-full bg-[color:var(--brand-primary)] px-6 text-white hover:opacity-90"
                onClick={closeAll}
              >
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-5 pt-2">
            <div className="flex flex-col gap-2">
              <Label
                htmlFor="invite-emails"
                className="font-medium text-[color:var(--brand-midnight)]"
              >
                Email addresses
              </Label>
              <Textarea
                id="invite-emails"
                required
                rows={5}
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                placeholder={"student1@example.com\nstudent2@example.com"}
                className="rounded-2xl border-slate-200 focus-visible:ring-[color:var(--brand-primary)]"
              />
              <p className="text-xs text-slate-500">
                {emails.length === 0
                  ? "Separate addresses with commas, spaces or new lines."
                  : `${emails.length} unique address${emails.length === 1 ? "" : "es"} detected.`}
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Label className="font-medium text-[color:var(--brand-midnight)]">
                Role for everyone in this batch
              </Label>
              <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger className="h-11 rounded-full border-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-2xl">
                  <SelectItem value="student">Student</SelectItem>
                  <SelectItem value="tutor">Tutor</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col-reverse items-stretch gap-2 pt-1 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
              <Button
                type="button"
                variant="ghost"
                onClick={closeAll}
                className="rounded-full text-slate-600 hover:text-[color:var(--brand-midnight)]"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting || emails.length === 0}
                className="h-11 rounded-full bg-[color:var(--brand-primary)] px-6 text-white shadow-[0_8px_30px_rgb(0,82,255,0.25)] hover:opacity-90"
              >
                {submitting
                  ? "Creating…"
                  : `Create ${emails.length || ""} invite${emails.length === 1 ? "" : "s"}`.trim()}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
