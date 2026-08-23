import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Paperclip, Send, X, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SUPPORT_ATTACHMENT, SUPPORT_CATEGORIES } from "@/content/supportFaq";
import {
  SupportFieldErrors,
  useSubmitSupportRequest,
  validateSupportRequest,
} from "@/lib/support";
import { showSupabaseError } from "@/lib/supabaseErrors";
import { SERVICE_CARD } from "@/components/dashboard/services/StudentServiceChrome";
import { cn } from "@/lib/utils";

const SERVER_MESSAGES: Record<string, string> = {
  rate_limited: "You've sent several requests recently. Please wait a few minutes and try again.",
  attachment_too_large: `That file is too large. ${SUPPORT_ATTACHMENT.humanRule}.`,
  attachment_unsupported: `That file type isn't supported. ${SUPPORT_ATTACHMENT.humanRule}.`,
  attachment_failed: "We couldn't upload your attachment. Try again without it.",
  invalid_email: "Enter a valid email address so we can reply.",
};

/**
 * Contact Support form.
 *
 * Submits through the `submit-support-request` edge function, which derives the
 * centre, user and role from the verified session — nothing sensitive is set by
 * this component.
 */
export function SupportContactForm({
  presetCategory,
  onPresetConsumed,
}: {
  presetCategory?: string | null;
  onPresetConsumed?: () => void;
}) {
  const { user, profile } = useAuth();
  const requireEmail = !user;

  const [category, setCategory] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<SupportFieldErrors>({});
  const [reference, setReference] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const submit = useSubmitSupportRequest();

  useEffect(() => {
    if (presetCategory) {
      setCategory(presetCategory);
      onPresetConsumed?.();
    }
  }, [presetCategory, onPresetConsumed]);

  if (reference) {
    return (
      <div className={cn(SERVICE_CARD, "p-5 text-center")}>
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" aria-hidden="true" />
        <h3 className="mt-2 text-[17px] font-bold text-slate-900">Request sent</h3>
        <p className="mt-1 text-[13px] leading-snug text-slate-600">
          Thanks — we've received your request. Your reference is{" "}
          <span className="font-semibold text-slate-900">{reference}</span>. We'll reply by email.
        </p>
        <Button
          variant="outline"
          className="mt-4 rounded-full"
          onClick={() => {
            setReference(null);
            setSubject("");
            setDescription("");
            setFile(null);
          }}
        >
          Send another request
        </Button>
      </div>
    );
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const input = {
      category,
      subject,
      description,
      email: requireEmail ? email : undefined,
      attachment: file,
      sourcePageUrl: window.location.pathname,
    };
    const nextErrors = validateSupportRequest(input, { requireEmail });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    try {
      const result = await submit.mutateAsync(input);
      setReference(result.reference);
    } catch (error) {
      const code =
        error && typeof error === "object" && "message" in error
          ? String((error as { message?: string }).message ?? "")
          : "";
      const friendly = Object.keys(SERVER_MESSAGES).find((key) => code.includes(key));
      if (friendly) setErrors({ description: SERVER_MESSAGES[friendly] });
      else showSupabaseError(error, "Couldn't send request");
    }
  };

  return (
    <form onSubmit={handleSubmit} className={cn(SERVICE_CARD, "space-y-4 p-4 md:p-5")} noValidate>
      {requireEmail && (
        <Field id="support-email" label="Your email" error={errors.email}>
          <Input
            id="support-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="h-11 rounded-2xl"
            aria-invalid={!!errors.email}
          />
        </Field>
      )}

      <Field id="support-category" label="Category" error={errors.category}>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger id="support-category" className="h-11 rounded-2xl" aria-invalid={!!errors.category}>
            <SelectValue placeholder="Choose a category" />
          </SelectTrigger>
          <SelectContent>
            {SUPPORT_CATEGORIES.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field id="support-subject" label="Subject" error={errors.subject}>
        <Input
          id="support-subject"
          value={subject}
          maxLength={120}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Brief summary of your issue"
          className="h-11 rounded-2xl"
          aria-invalid={!!errors.subject}
        />
      </Field>

      <Field id="support-description" label="Message" error={errors.description}>
        <Textarea
          id="support-description"
          value={description}
          maxLength={3000}
          rows={5}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Tell us what happened, and what you expected instead."
          className="rounded-2xl"
          aria-invalid={!!errors.description}
        />
        <p className="mt-1 text-right text-[11px] text-muted-foreground">{description.length}/3000</p>
      </Field>

      <div>
        <Label className="text-[13px] font-semibold text-slate-800">Attachment (optional)</Label>
        <input
          ref={fileInputRef}
          type="file"
          accept={SUPPORT_ATTACHMENT.accept}
          className="sr-only"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setErrors((prev) => ({ ...prev, attachment: undefined }));
          }}
        />
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 rounded-full"
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Choose file
          </Button>
          {file && (
            <span className="flex min-w-0 items-center gap-1.5 rounded-full bg-primary/8 px-3 py-1.5 text-[12px] text-slate-700">
              <span className="max-w-[180px] truncate">{file.name}</span>
              <button
                type="button"
                aria-label="Remove attachment"
                onClick={() => {
                  setFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="rounded-full p-0.5 hover:bg-slate-200"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </span>
          )}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">{SUPPORT_ATTACHMENT.humanRule}.</p>
        {errors.attachment && (
          <p className="mt-1 text-[12px] font-medium text-destructive">{errors.attachment}</p>
        )}
      </div>

      <Button
        type="submit"
        disabled={submit.isPending}
        className="min-h-11 w-full rounded-full text-[15px] font-semibold"
      >
        <Send className="mr-1.5 h-4 w-4" aria-hidden="true" />
        {submit.isPending ? "Sending…" : "Send request"}
      </Button>

      <p className="text-[11.5px] leading-snug text-muted-foreground">
        {user
          ? profile?.center_id
            ? "Your request is linked to your account and tuition centre so we can find your details."
            : "Your request is linked to your account so we can find your details."
          : "Prefer to sign in first? "}
        {!user && (
          <Link to="/auth" className="font-semibold text-primary underline-offset-2 hover:underline">
            Sign in
          </Link>
        )}
        {" "}
        See our{" "}
        <Link to="/privacy" className="font-semibold text-primary underline-offset-2 hover:underline">
          Privacy Policy
        </Link>
        .
      </p>
    </form>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={id} className="text-[13px] font-semibold text-slate-800">
        {label}
      </Label>
      <div className="mt-1.5">{children}</div>
      {error && <p className="mt-1 text-[12px] font-medium text-destructive">{error}</p>}
    </div>
  );
}
