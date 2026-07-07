/**
 * Global Supabase error mapper.
 *
 * Turns raw PostgREST / auth errors into short, friendly copy suitable for a
 * toast. Use `showSupabaseError(err)` inside catch blocks / mutation error
 * handlers so we never surface a raw `duplicate key value violates unique
 * constraint` string to a student, tutor, or admin.
 */
import { toast } from "sonner";

export interface FriendlyError {
  title: string;
  description: string;
}

type MaybeErr =
  | {
      code?: string | number;
      message?: string;
      details?: string;
      hint?: string;
      status?: number;
      error_description?: string;
      name?: string;
    }
  | Error
  | null
  | undefined;

const UNIQUE = "23505";
const FK = "23503";
const NOT_NULL = "23502";
const CHECK = "23514";
const INSUFFICIENT_PRIV = "42501";
const RLS = "PGRST301";
const NOT_FOUND = "PGRST116";

function pick(err: MaybeErr): {
  code: string;
  message: string;
  details: string;
  status?: number;
} {
  if (!err) return { code: "", message: "", details: "" };
  const anyErr = err as Record<string, unknown>;
  return {
    code: String(anyErr.code ?? ""),
    message: String(anyErr.message ?? (err instanceof Error ? err.message : "")),
    details: String(anyErr.details ?? anyErr.hint ?? anyErr.error_description ?? ""),
    status: typeof anyErr.status === "number" ? (anyErr.status as number) : undefined,
  };
}

export function mapSupabaseError(err: MaybeErr): FriendlyError {
  const { code, message, details, status } = pick(err);
  const m = `${message} ${details}`.toLowerCase();

  // Auth
  if (m.includes("invalid login credentials")) {
    return { title: "Sign-in failed", description: "Wrong email or password. Please try again." };
  }
  if (m.includes("email not confirmed")) {
    return { title: "Email not confirmed", description: "Check your inbox for the confirmation link." };
  }
  if (m.includes("user already registered")) {
    return { title: "Account exists", description: "This email is already registered — try signing in instead." };
  }
  if (m.includes("rate limit") || status === 429) {
    return { title: "Slow down", description: "You're doing that a bit too fast. Try again in a moment." };
  }

  // Postgres constraint / permission codes
  switch (code) {
    case UNIQUE:
      return {
        title: "Already exists",
        description: "That entry already exists. Please review and try again.",
      };
    case FK:
      return {
        title: "Cannot complete",
        description: "This item is linked to other data. Remove those links first.",
      };
    case NOT_NULL:
      return {
        title: "Missing required field",
        description: "Please fill in every required field before saving.",
      };
    case CHECK:
      return {
        title: "Invalid value",
        description: "One of the values isn't allowed. Please double-check and try again.",
      };
    case INSUFFICIENT_PRIV:
    case RLS:
      return {
        title: "Not allowed",
        description: "You don't have permission to do that.",
      };
    case NOT_FOUND:
      return { title: "Not found", description: "We couldn't find what you were looking for." };
  }

  // Network
  if (m.includes("failed to fetch") || m.includes("network")) {
    return { title: "Network problem", description: "Check your connection and try again." };
  }

  return {
    title: "Something went wrong",
    description: message || "Please try again in a moment.",
  };
}

/** Toast a friendly version of a Supabase / PostgREST / auth error. */
export function showSupabaseError(err: MaybeErr, fallbackTitle?: string): FriendlyError {
  const friendly = mapSupabaseError(err);
  if (import.meta.env.DEV) {
    // Keep the raw error visible to developers.
    // eslint-disable-next-line no-console
    console.error("[supabase]", err);
  }
  toast.error(fallbackTitle ?? friendly.title, { description: friendly.description });
  return friendly;
}
