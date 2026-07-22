import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

// ─── Canonical types ────────────────────────────────────────────────────────
export type QuizStatus = "draft" | "published" | "archived";
export type ResultVisibility = "never" | "after_submit" | "after_due" | "manual";
export type QuestionType = "mcq" | "true_false"; // legacy 'multiple_choice' normalises to 'mcq'

export interface QuizManagerRow {
  id: string;
  class_id: string;
  center_id: string;
  title: string;
  description: string | null;
  status: QuizStatus;
  instructions: string | null;
  available_from: string | null;
  due_at: string | null;
  time_limit_seconds: number | null;
  attempt_limit: number;
  shuffle_questions: boolean;
  shuffle_options: boolean;
  result_visibility: ResultVisibility;
  results_released_at: string | null;
  published_at: string | null;
  total_points: number;
  question_count: number;
  submission_count: number;
  attempt_count: number;
  created_at: string;
  updated_at: string;
}

export interface QuizOptionDraft {
  option_text: string;
  is_correct: boolean;
}
export interface QuizQuestionDraft {
  question: string;
  question_type: QuestionType;
  points: number;
  explanation?: string | null;
  options: QuizOptionDraft[];
}
export interface QuizMetaDraft {
  title: string;
  description?: string | null;
  instructions?: string | null;
  available_from?: string | null;
  due_at?: string | null;
  time_limit_seconds?: number | null;
  attempt_limit?: number;
  shuffle_questions?: boolean;
  shuffle_options?: boolean;
  result_visibility?: ResultVisibility;
}
export interface QuizDefinitionDraft {
  meta: QuizMetaDraft;
  questions?: QuizQuestionDraft[];
}

export function normaliseQuestionType(t: string | null | undefined): QuestionType {
  if (t === "true_false") return "true_false";
  return "mcq"; // treat legacy 'multiple_choice' as mcq
}

// ─── Formatting helpers ─────────────────────────────────────────────────────
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (isNaN(then)) return "—";
  const diff = Date.now() - then;
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ${diff >= 0 ? "ago" : "from now"}`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ${diff >= 0 ? "ago" : "from now"}`;
  const days = Math.round(hours / 24);
  return `${days}d ${diff >= 0 ? "ago" : "from now"}`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "No time limit";
  const m = Math.round(seconds / 60);
  return `${m} min`;
}

export const RESULT_VISIBILITY_LABEL: Record<ResultVisibility, string> = {
  never: "Never shown",
  after_submit: "After submit",
  after_due: "After due date",
  manual: "Manual release",
};

export const STATUS_LABEL: Record<QuizStatus, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

export function attemptsLock(row: Pick<QuizManagerRow, "attempt_count">): boolean {
  return row.attempt_count > 0;
}

// ─── React Query keys ───────────────────────────────────────────────────────
export const quizManagerKeys = {
  list: (tenantId: string | null | undefined, classId: string) =>
    ["quiz-manager", "list", tenantId ?? "no-tenant", classId] as const,
  detail: (
    tenantId: string | null | undefined,
    classId: string,
    quizId: string,
  ) => ["quiz-manager", "detail", tenantId ?? "no-tenant", classId, quizId] as const,
  definition: (
    tenantId: string | null | undefined,
    classId: string,
    quizId: string,
    userId: string | null | undefined,
  ) =>
    [
      "quiz-manager",
      "definition",
      tenantId ?? "no-tenant",
      classId,
      quizId,
      userId ?? "anon",
    ] as const,
};

export interface QuizDefinitionForManager {
  quiz: {
    id: string;
    class_id: string;
    center_id: string;
    title: string;
    description: string | null;
    instructions: string | null;
    status: QuizStatus;
    available_from: string | null;
    due_at: string | null;
    time_limit_seconds: number | null;
    attempt_limit: number;
    shuffle_questions: boolean;
    shuffle_options: boolean;
    result_visibility: ResultVisibility;
    results_released_at: string | null;
    published_at: string | null;
    total_points: number;
    updated_at: string;
  };
  questions: Array<{
    id: string;
    question: string;
    question_type: QuestionType;
    points: number;
    explanation: string | null;
    order_index: number;
    options: Array<{
      id: string;
      option_text: string;
      is_correct: boolean;
      order_index: number;
    }>;
  }>;
  locked: boolean;
  has_attempts: boolean;
  has_results: boolean;
}

export async function getQuizDefinitionForManager(
  quizId: string,
): Promise<QuizDefinitionForManager> {
  const { data, error } = await supabase.rpc("get_quiz_definition_for_manager", {
    _quiz_id: quizId,
  });
  if (error) throw error;
  return data as unknown as QuizDefinitionForManager;
}

// ─── Typed RPC wrappers ─────────────────────────────────────────────────────
export async function listClassQuizzesForManager(
  classId: string,
): Promise<QuizManagerRow[]> {
  const { data, error } = await supabase.rpc("list_class_quizzes_for_manager", {
    _class_id: classId,
  });
  if (error) throw error;
  return (data ?? []) as unknown as QuizManagerRow[];
}

export async function setQuizStatus(quizId: string, status: QuizStatus) {
  const { data, error } = await supabase.rpc("set_quiz_status", {
    _quiz_id: quizId,
    _status: status,
  });
  if (error) throw error;
  return data;
}

export async function deleteQuizSafe(
  quizId: string,
): Promise<{ deleted: boolean; reason?: string; message?: string }> {
  const { data, error } = await supabase.rpc("delete_quiz_safe", { _quiz_id: quizId });
  if (error) throw error;
  return (data ?? { deleted: false }) as { deleted: boolean; reason?: string; message?: string };
}

export async function duplicateQuizAsDraft(quizId: string): Promise<string> {
  const { data, error } = await supabase.rpc("duplicate_quiz_as_draft", {
    _quiz_id: quizId,
  });
  if (error) throw error;
  return data as string;
}

export async function releaseQuizResults(quizId: string) {
  const { error } = await supabase.rpc("release_quiz_results", { _quiz_id: quizId });
  if (error) throw error;
}

export async function hideQuizResults(quizId: string) {
  const { error } = await supabase.rpc("hide_quiz_results", { _quiz_id: quizId });
  if (error) throw error;
}

export async function saveQuizDefinition(args: {
  classId: string;
  quizId?: string | null;
  definition: QuizDefinitionDraft;
  publish?: boolean;
}) {
  const payload: Database["public"]["Functions"]["save_quiz_definition"]["Args"] = {
    _class_id: args.classId,
    _quiz_id: args.quizId ?? undefined,
    _definition: args.definition as unknown as Database["public"]["Functions"]["save_quiz_definition"]["Args"]["_definition"],
    _publish: args.publish ?? false,
  };
  const { data, error } = await supabase.rpc("save_quiz_definition", payload);
  if (error) throw error;
  return data as { id: string; status: QuizStatus; updated_at: string; total_points: number; published_at: string | null };
}

// ─── Friendly error mapping ─────────────────────────────────────────────────
export function mapQuizError(err: unknown, fallback = "Something went wrong. Please try again."): string {
  const msg = (err as { message?: string })?.message ?? "";
  if (!msg) return fallback;
  if (msg.includes("not_authenticated")) return "Please sign in again.";
  if (msg.includes("access_denied")) return "You don't have permission to manage this quiz.";
  if (msg.includes("quiz_not_found") || msg.includes("class_not_found")) return "This quiz is no longer available.";
  if (msg.includes("quiz_class_mismatch")) return "That quiz belongs to a different class.";
  if (msg.includes("cannot_publish_after_attempts")) return "You can't publish a quiz that already has student attempts.";
  if (msg.includes("edit_locked_after_attempts")) return "This quiz has attempts — question edits are locked. Duplicate it to make changes.";
  if (msg.includes("publish_validation_failed")) {
    const idx = msg.indexOf(":");
    return idx > -1 ? msg.slice(idx + 1).trim() : "Please complete the quiz before publishing.";
  }
  if (msg.includes("invalid_status")) return "That status change isn't allowed.";
  return fallback;
}
