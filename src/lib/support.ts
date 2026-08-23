/**
 * Help & Support client helpers.
 *
 * Support requests are NEVER written to the database from the browser: the
 * `submit-support-request` edge function derives the centre, user and role from
 * the caller's verified session (or records an anonymous request) so a client
 * cannot spoof tenant attribution.
 */
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SUPPORT_ATTACHMENT, isSupportCategory } from "@/content/supportFaq";

export interface SupportRequestInput {
  category: string;
  subject: string;
  description: string;
  /** Required for signed-out visitors; ignored for signed-in users. */
  email?: string;
  attachment?: File | null;
  /** Page the user was on, for triage context. */
  sourcePageUrl?: string;
}

export interface SupportRequestResult {
  reference: string;
}

export type SupportFieldErrors = Partial<
  Record<"category" | "subject" | "description" | "email" | "attachment", string>
>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Client-side validation mirroring the server rules. */
export function validateSupportRequest(
  input: SupportRequestInput,
  opts: { requireEmail: boolean },
): SupportFieldErrors {
  const errors: SupportFieldErrors = {};

  if (!input.category || !isSupportCategory(input.category)) {
    errors.category = "Choose a category.";
  }

  const subject = input.subject.trim();
  if (subject.length < 3) errors.subject = "Add a short subject (at least 3 characters).";
  else if (subject.length > 120) errors.subject = "Keep the subject under 120 characters.";

  const description = input.description.trim();
  if (description.length < 10) errors.description = "Tell us a little more (at least 10 characters).";
  else if (description.length > 3000) errors.description = "Keep the message under 3000 characters.";

  if (opts.requireEmail) {
    const email = (input.email ?? "").trim();
    if (!email) errors.email = "Enter an email so we can reply.";
    else if (!EMAIL_RE.test(email) || email.length > 254) errors.email = "Enter a valid email address.";
  }

  const file = input.attachment;
  if (file) {
    if (file.size > SUPPORT_ATTACHMENT.maxBytes) {
      errors.attachment = `File is too large. ${SUPPORT_ATTACHMENT.humanRule}.`;
    } else if (!(SUPPORT_ATTACHMENT.mimeTypes as readonly string[]).includes(file.type)) {
      errors.attachment = `Unsupported file type. ${SUPPORT_ATTACHMENT.humanRule}.`;
    }
  }

  return errors;
}

async function submitSupportRequest(input: SupportRequestInput): Promise<SupportRequestResult> {
  const form = new FormData();
  form.set("category", input.category);
  form.set("subject", input.subject.trim());
  form.set("description", input.description.trim());
  if (input.email) form.set("email", input.email.trim());
  if (input.sourcePageUrl) form.set("sourcePageUrl", input.sourcePageUrl.slice(0, 500));
  if (input.attachment) form.set("attachment", input.attachment);

  const { data, error } = await supabase.functions.invoke<{
    reference?: string;
    error?: string;
  }>("submit-support-request", { body: form });

  if (error) throw error;
  if (!data?.reference) throw new Error(data?.error ?? "submit_failed");
  return { reference: data.reference };
}

export function useSubmitSupportRequest() {
  return useMutation({ mutationFn: submitSupportRequest });
}
