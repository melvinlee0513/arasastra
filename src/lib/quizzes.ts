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
    definition_version: number;
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
  expectedVersion?: number | null;
}): Promise<{
  id: string;
  status: QuizStatus;
  updated_at: string;
  total_points: number;
  published_at: string | null;
  definition_version: number;
}> {
  // Types have not been regenerated for the 5th positional arg yet; cast is safe.
  const { data, error } = await supabase.rpc(
    "save_quiz_definition" as never,
    {
      _class_id: args.classId,
      _quiz_id: args.quizId ?? undefined,
      _definition: args.definition as unknown as Record<string, unknown>,
      _publish: args.publish ?? false,
      _expected_version: args.expectedVersion ?? null,
    } as never,
  );
  if (error) throw error;
  return data as {
    id: string;
    status: QuizStatus;
    updated_at: string;
    total_points: number;
    published_at: string | null;
    definition_version: number;
  };
}

// ─── Student attempt flow ───────────────────────────────────────────────────
export interface StudentQuizListRow {
  id: string;
  title: string;
  description: string | null;
  available_from: string | null;
  due_at: string | null;
  time_limit_seconds: number | null;
  attempt_limit: number;
  result_visibility: ResultVisibility;
  results_released_at: string | null;
  question_count: number;
  attempts_used: number;
  in_progress_attempt_id: string | null;
  latest_submitted_attempt_id: string | null;
}

export async function listStudentClassQuizzes(
  classId: string,
): Promise<StudentQuizListRow[]> {
  const { data, error } = await supabase.rpc(
    "list_student_class_quizzes" as never,
    { _class_id: classId } as never,
  );
  if (error) throw error;
  return (data ?? []) as unknown as StudentQuizListRow[];
}

export interface StudentAttemptOption {
  id: string;
  text: string;
  order_index: number;
}
export interface StudentAttemptQuestion {
  id: string;
  question_type: QuestionType;
  prompt: string;
  points: number;
  display_order: number;
  options: StudentAttemptOption[];
}
export interface StudentAttemptPayload {
  quiz: {
    id: string;
    title: string;
    description: string | null;
    instructions: string | null;
    time_limit_seconds: number | null;
    due_at: string | null;
    available_from: string | null;
    shuffle_questions: boolean;
    shuffle_options: boolean;
    attempt_limit: number;
    result_visibility: ResultVisibility;
    class_id: string;
    center_id: string;
  };
  attempt: {
    id: string;
    status: "in_progress" | "submitted" | "expired";
    saved_answers: Record<string, string> | null;
    started_at: string;
    submitted_at: string | null;
    deadline: string | null;
    progress_revision: number;
  };
  questions: StudentAttemptQuestion[];
}

export async function startQuizAttempt(quizId: string): Promise<string> {
  const { data, error } = await supabase.rpc("start_quiz_attempt", { _quiz_id: quizId });
  if (error) throw error;
  return data as string;
}

export async function getQuizForAttempt(
  attemptId: string,
): Promise<StudentAttemptPayload> {
  const { data, error } = await supabase.rpc("get_quiz_for_attempt", {
    _attempt_id: attemptId,
  });
  if (error) throw error;
  return data as unknown as StudentAttemptPayload;
}

export interface SaveProgressResult {
  saved: true;
  saved_at: string;
  deadline: string | null;
  progress_revision: number;
}

export async function saveQuizProgress(args: {
  attemptId: string;
  answers: Record<string, string>;
  expectedRevision: number;
}): Promise<SaveProgressResult> {
  const { data, error } = await supabase.rpc(
    "save_quiz_progress" as never,
    {
      _attempt_id: args.attemptId,
      _answers: args.answers,
      _expected_revision: args.expectedRevision,
    } as never,
  );
  if (error) throw error;
  return data as unknown as SaveProgressResult;
}

export async function submitQuizAttempt(args: {
  attemptId: string;
  answers?: Record<string, string> | null;
}) {
  const { data, error } = await supabase.rpc("submit_quiz_attempt", {
    _attempt_id: args.attemptId,
    _answers: (args.answers ?? null) as never,
  });
  if (error) throw error;
  return data;
}

// ─── Friendly error mapping ─────────────────────────────────────────────────
export function mapQuizError(err: unknown, fallback = "Something went wrong. Please try again."): string {
  const msg = (err as { message?: string })?.message ?? "";
  if (!msg) return fallback;
  if (msg.includes("not_authenticated")) return "Please sign in again.";
  if (msg.includes("access_denied")) return "You don't have permission to manage this quiz.";
  if (msg.includes("not_enrolled")) return "You aren't enrolled in this class.";
  if (msg.includes("quiz_not_found") || msg.includes("class_not_found")) return "This quiz is no longer available.";
  if (msg.includes("quiz_class_mismatch")) return "That quiz belongs to a different class.";
  if (msg.includes("cannot_publish_after_attempts")) return "You can't publish a quiz that already has student attempts.";
  if (msg.includes("quiz_schedule_locked_after_attempts")) return "This quiz has attempts — the schedule is locked. Duplicate it to change the dates.";
  if (msg.includes("quiz_definition_conflict")) return "This quiz was updated by another manager. Reload the latest version before saving.";
  if (msg.includes("quiz_locked_after_attempts")) {
    const idx = msg.indexOf(":");
    return idx > -1
      ? `Locked after attempts: ${msg.slice(idx + 1).trim()}`
      : "This quiz has student attempts — questions, answers and grading settings are locked. Duplicate it to make changes.";
  }
  if (msg.includes("edit_locked_after_attempts")) return "This quiz has attempts — question edits are locked. Duplicate it to make changes.";
  if (msg.includes("active_attempt_in_progress")) return "A student has an in-progress attempt right now. Wait for it to finish before changing the status.";
  if (msg.includes("progress_revision_conflict")) return "Your answers were updated in another tab. Reload to continue.";
  if (msg.includes("attempt_not_editable")) return "This attempt can no longer be edited.";
  if (msg.includes("attempt_deadline_passed")) return "The deadline for this attempt has passed.";
  if (msg.includes("attempt_not_found")) return "We couldn't find that attempt.";
  if (msg.includes("quiz_no_longer_accessible")) return "This quiz is no longer available.";
  if (msg.includes("attempts_exhausted")) return "You've used all your attempts on this quiz.";
  if (msg.includes("quiz_not_available")) return "This quiz isn't available yet.";
  if (msg.includes("quiz_past_due")) return "This quiz is past its due date.";
  if (msg.includes("publish_validation_failed")) {
    const idx = msg.indexOf(":");
    return idx > -1 ? msg.slice(idx + 1).trim() : "Please complete the quiz before publishing.";
  }
  if (msg.includes("invalid_status")) return "That status change isn't allowed.";
  return fallback;
}
