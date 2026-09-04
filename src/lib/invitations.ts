import { supabase } from "@/integrations/supabase/client";

export interface InvitationEmailResult {
  emailed: boolean;
  error?: string;
}

/**
 * Ask the trusted backend to email an existing invitation to its recipient.
 * Authorisation, token retrieval and tenant hostname resolution all happen
 * server-side — the client only supplies the invitation id.
 */
export async function sendInvitationEmail(
  invitationId: string,
): Promise<InvitationEmailResult> {
  try {
    const { data, error } = await supabase.functions.invoke<InvitationEmailResult>(
      "send-invitation-email",
      { body: { invitationId } },
    );
    if (error) return { emailed: false, error: error.message };
    return { emailed: Boolean(data?.emailed), error: data?.error };
  } catch (err) {
    return {
      emailed: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export interface VerifyEmailResult {
  verified: boolean;
  email?: string | null;
  /** Stable, non-leaking failure code from the backend. */
  code?: "forbidden" | "not_found" | "already_verified" | "failed";
}

const VERIFY_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to verify this account.",
  not_found: "Account not found.",
  already_verified: "This email is already verified.",
  failed: "Unable to verify the email right now. Please try again.",
};

/** User-facing copy for a failed manual verification. Never leaks backend detail. */
export function verifyEmailMessage(code?: string): string {
  return VERIFY_MESSAGES[code ?? "failed"] ?? VERIFY_MESSAGES.failed;
}

/**
 * Ask the trusted backend to mark an invited user's Auth email as confirmed.
 * Tenant authorisation, target resolution and the privileged Auth Admin call
 * all happen server-side — the client only supplies the invitation id.
 */
export async function verifyInvitedUserEmail(
  invitationId: string,
): Promise<VerifyEmailResult> {
  try {
    const { data, error } = await supabase.functions.invoke<VerifyEmailResult>(
      "admin-verify-user-email",
      { body: { invitationId } },
    );
    if (error) {
      let code: VerifyEmailResult["code"] = "failed";
      const ctx = (error as { context?: { text?: () => Promise<string> } }).context;
      if (ctx?.text) {
        try {
          const parsed = JSON.parse(await ctx.text()) as { code?: VerifyEmailResult["code"] };
          if (parsed?.code) code = parsed.code;
        } catch { /* keep the generic code */ }
      }
      return { verified: false, code };
    }
    if (data?.verified) return { verified: true, email: data.email ?? null };
    return { verified: false, code: data?.code ?? "failed" };
  } catch {
    return { verified: false, code: "failed" };
  }
}
