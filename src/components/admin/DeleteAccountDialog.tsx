import { useState } from "react";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

export interface DeleteAccountTarget {
  user_id: string;
  full_name: string;
  email: string | null;
  role?: string;
}

interface Props {
  target: DeleteAccountTarget | null;
  onClose: () => void;
  onDeleted?: (userId: string) => void;
}

const FRIENDLY_ERRORS: Record<string, string> = {
  cannot_delete_self: "You cannot delete your own account.",
  cannot_delete_superadmin: "Superadmin accounts cannot be deleted from here.",
  protected_target: "This account is protected and cannot be deleted.",
  not_authorised: "You are not permitted to delete this account.",
  email_confirmation_mismatch: "The email you typed does not match.",
  invalid_target: "That user could not be found.",
  auth_delete_failed: "The account data was cleaned but sign-in access could not be revoked. A superadmin can retry.",
  cleanup_failed: "Deletion could not complete. Please try again.",
  unexpected_error: "Something went wrong. Please try again.",
  unauthorized: "Your session has expired. Please sign in again.",
};

export function DeleteAccountDialog({ target, onClose, onDeleted }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [typedEmail, setTypedEmail] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isOpen = !!target;
  const expectedEmail = (target?.email ?? "").trim().toLowerCase();
  const emailMatches = expectedEmail.length > 0 && typedEmail.trim().toLowerCase() === expectedEmail;
  const canSubmit = isOpen && emailMatches && confirmed && !submitting && !!target;

  const reset = () => {
    setTypedEmail("");
    setConfirmed(false);
    setSubmitting(false);
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const handleDelete = async () => {
    if (!target || !canSubmit) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("delete-user-account", {
        body: { target_user_id: target.user_id, confirm_email: typedEmail.trim().toLowerCase() },
      });
      if (error) {
        // Try to surface structured error code from function response.
        const anyErr = error as unknown as { context?: { body?: unknown } };
        let code = "cleanup_failed";
        try {
          const raw = anyErr.context?.body;
          const parsed = typeof raw === "string" ? JSON.parse(raw) : raw as any;
          if (parsed?.error && typeof parsed.error === "string") code = parsed.error;
        } catch { /* ignore */ }
        throw new Error(code);
      }
      if ((data as any)?.error) throw new Error((data as any).error);

      toast({ title: "User account permanently deleted" });
      onDeleted?.(target.user_id);
      // Invalidate downstream caches.
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["users"] }),
        qc.invalidateQueries({ queryKey: ["enrollments"] }),
        qc.invalidateQueries({ queryKey: ["class-enrollments"] }),
        qc.invalidateQueries({ queryKey: ["class-tutors"] }),
        qc.invalidateQueries({ queryKey: ["tutor-assignments"] }),
        qc.invalidateQueries({ queryKey: ["analytics"] }),
      ]);
      reset();
      onClose();
    } catch (e: any) {
      const code = e?.message ?? "cleanup_failed";
      toast({
        title: "Couldn't delete account",
        description: FRIENDLY_ERRORS[code] ?? FRIENDLY_ERRORS.cleanup_failed,
        variant: "destructive",
      });
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="rounded-3xl max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <DialogTitle>Permanently delete this account?</DialogTitle>
              <DialogDescription>
                {target?.full_name ?? "This user"} · <span className="font-mono">{expectedEmail || "no email on file"}</span>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3 text-sm text-slate-600">
          <p>This action cannot be undone. Deleting this account will:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Remove sign-in access immediately.</li>
            <li>Delete the user's profile and personal learning data.</li>
            <li>Remove their class enrolments and tutor assignments.</li>
            <li>Retain centre-owned teaching content (announcements, resources, quizzes) without personal attribution.</li>
          </ul>

          <div className="space-y-2 pt-2">
            <Label htmlFor="confirm-email">
              Type <span className="font-mono text-slate-900">{expectedEmail || "the user's email"}</span> to confirm
            </Label>
            <Input
              id="confirm-email"
              autoComplete="off"
              value={typedEmail}
              onChange={(e) => setTypedEmail(e.target.value)}
              disabled={submitting || !expectedEmail}
              placeholder={expectedEmail || "no email on file — deletion blocked"}
              className="rounded-full"
            />
          </div>

          <label className="flex items-start gap-2 pt-2 cursor-pointer">
            <Checkbox
              checked={confirmed}
              onCheckedChange={(v) => setConfirmed(v === true)}
              disabled={submitting}
              className="mt-0.5"
            />
            <span className="text-slate-700">I understand that this action is permanent.</span>
          </label>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={handleClose} disabled={submitting} className="rounded-full">
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!canSubmit}
            onClick={handleDelete}
            className="rounded-full gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            {submitting ? "Deleting…" : "Permanently delete account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
