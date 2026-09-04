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
