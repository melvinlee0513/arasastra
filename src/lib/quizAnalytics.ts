/**
 * Quiz analytics — client access layer for tutors and admins.
 *
 * Every figure on every analytics screen comes from one of these five RPCs.
 * None of them is computed here: the server aggregates, ranks and classifies,
 * so the tutor UI, a CSV export and any future report all agree. This file
 * holds types, query keys, formatting and the CSV writer — nothing else.
 *
 * All five are SECURITY DEFINER and gate on `can_manage_class`, so a student
 * calling them directly is refused by the database, not by a hidden route.
 */
import { supabase } from "@/integrations/supabase/client";

/** Server-side classification. Thresholds live in `quiz_difficulty_band`. */
export type DifficultyBand = "difficult" | "moderate" | "strong" | "unknown";

export interface AnalyticsDistributionBucket {
  band: string;
  label: string;
  count: number;
}

export interface QuizAnalyticsOverview {
  quiz_id: string;
  quiz_title: string;
  class_id: string;
  status: string;
  question_count: number;
  total_points: number;
  /** Active enrolments — the population that could have taken this quiz. */
  eligible_students: number;
  /** Distinct students with at least one graded result. */
  participants: number;
  avg_score_pct: number | null;
  completion_pct: number | null;
  /**
   * Derived from `submitted_at - started_at` divided by the question count.
   * `student_quiz_answers` carries no per-question timing, so this is an
   * average across the attempt — the UI labels it that way rather than
   * implying each question was measured.
   */
  avg_seconds_per_question: number | null;
  avg_attempt_seconds: number | null;
  distribution: AnalyticsDistributionBucket[];
  last_completed_at: string | null;
}

export interface QuestionOptionStat {
  option_id: string;
  text: string;
  /** Staff-only; this RPC is already gated on can_manage_class. */
  is_correct: boolean;
  count: number;
  pct: number | null;
}

export interface QuestionAnalytics {
  question_id: string;
  index: number;
  question: string;
  question_type: string;
  points: number;
  answered: number;
  correct: number;
  incorrect: number;
  accuracy_pct: number | null;
  band: DifficultyBand;
  options: QuestionOptionStat[];
}

export interface QuizQuestionAnalytics {
  quiz_id: string;
  quiz_title: string;
  questions: QuestionAnalytics[];
}

export interface StudentAnalyticsRow {
  user_id: string;
  result_id: string;
  display_name: string;
  avatar_url: string | null;
  score: number;
  total_questions: number;
  total_points: number | null;
  accuracy_pct: number;
  rank: number;
  avg_seconds_per_question: number | null;
  weak_questions: number;
  completed_at: string | null;
  band: DifficultyBand;
}

export interface QuizStudentAnalytics {
  quiz_id: string;
  quiz_title: string;
  question_count: number;
  students: StudentAnalyticsRow[];
}

export interface StudentReportBreakdownRow {
  question_id: string;
  index: number;
  question: string;
  question_type: string;
  points: number;
  answered: boolean;
  is_correct: boolean;
  points_awarded: number;
  selected_option_id: string | null;
  selected_answer: string | null;
}

export interface StudentQuizReport {
  quiz_id: string;
  quiz_title: string;
  class_id: string;
  question_count: number;
  student: { user_id: string; display_name: string; avatar_url: string | null } | null;
  result: {
    result_id: string;
    attempt_id: string;
    score: number;
    total_questions: number;
    total_points: number | null;
    accuracy_pct: number;
    rank: number;
    avg_seconds_per_question: number | null;
    completed_at: string | null;
  };
  breakdown: StudentReportBreakdownRow[];
}

export interface QuestionResponseRow {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  answered: boolean;
  is_correct: boolean;
  points_awarded: number;
  selected_option_id: string | null;
  selected_option_text: string | null;
  selected_answer: string | null;
}

export interface QuizQuestionResponses {
  quiz_id: string;
  question_id: string;
  question: string;
  responses: QuestionResponseRow[];
}

// ─── RPCs ──────────────────────────────────────────────────────────────────

export async function getQuizAnalyticsOverview(quizId: string): Promise<QuizAnalyticsOverview> {
  const { data, error } = await supabase.rpc("get_quiz_analytics_overview" as never, {
    _quiz_id: quizId,
  } as never);
  if (error) throw error;
  return data as unknown as QuizAnalyticsOverview;
}

export async function getQuizQuestionAnalytics(quizId: string): Promise<QuizQuestionAnalytics> {
  const { data, error } = await supabase.rpc("get_quiz_question_analytics" as never, {
    _quiz_id: quizId,
  } as never);
  if (error) throw error;
  return data as unknown as QuizQuestionAnalytics;
}

export async function getQuizStudentAnalytics(quizId: string): Promise<QuizStudentAnalytics> {
  const { data, error } = await supabase.rpc("get_quiz_student_analytics" as never, {
    _quiz_id: quizId,
  } as never);
  if (error) throw error;
  return data as unknown as QuizStudentAnalytics;
}

export async function getStudentQuizReport(
  quizId: string,
  userId: string,
): Promise<StudentQuizReport> {
  const { data, error } = await supabase.rpc("get_student_quiz_report" as never, {
    _quiz_id: quizId,
    _user_id: userId,
  } as never);
  if (error) throw error;
  return data as unknown as StudentQuizReport;
}

export async function getQuizQuestionResponses(
  quizId: string,
  questionId: string,
): Promise<QuizQuestionResponses> {
  const { data, error } = await supabase.rpc("get_quiz_question_responses" as never, {
    _quiz_id: quizId,
    _question_id: questionId,
  } as never);
  if (error) throw error;
  return data as unknown as QuizQuestionResponses;
}

// ─── Query keys ────────────────────────────────────────────────────────────

export const analyticsKeys = {
  overview: (t: string | null, quizId: string) => ["quiz-analytics", "overview", t, quizId] as const,
  questions: (t: string | null, quizId: string) => ["quiz-analytics", "questions", t, quizId] as const,
  students: (t: string | null, quizId: string) => ["quiz-analytics", "students", t, quizId] as const,
  report: (t: string | null, quizId: string, userId: string) =>
    ["quiz-analytics", "report", t, quizId, userId] as const,
  responses: (t: string | null, quizId: string, questionId: string) =>
    ["quiz-analytics", "responses", t, quizId, questionId] as const,
};

// ─── Presentation helpers ──────────────────────────────────────────────────

export const BAND_LABEL: Record<DifficultyBand, string> = {
  difficult: "Difficult",
  moderate: "Moderate",
  strong: "Strong",
  unknown: "No data",
};

/** Seconds, shown the way a tutor reads them. Null becomes an em dash. */
export function formatSeconds(secs: number | null | undefined): string {
  if (secs === null || secs === undefined || !Number.isFinite(secs)) return "—";
  if (secs < 60) return `${Number(secs.toFixed(1))} sec`;
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return s === 0 ? `${m} min` : `${m}m ${s}s`;
}

export function formatPct(pct: number | null | undefined): string {
  return pct === null || pct === undefined ? "—" : `${pct}%`;
}

/**
 * RFC 4180 escaping. A student called `Lim, Wei "Sam"` must not shift every
 * later column by one.
 */
function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function studentsToCsv(data: QuizStudentAnalytics): string {
  const header = [
    "Student", "Score", "Out of", "Accuracy %", "Rank",
    "Avg seconds per question", "Incorrect answers", "Completed at",
  ];
  const rows = data.students.map((s) => [
    s.display_name,
    s.score,
    s.total_questions,
    s.accuracy_pct,
    s.rank,
    s.avg_seconds_per_question ?? "",
    s.weak_questions,
    s.completed_at ?? "",
  ]);
  // \r\n and a UTF-8 BOM so Excel opens accented names correctly.
  return "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}

/** Trigger a client-side download of a generated CSV. */
export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** `Photosynthesis Quiz` → `photosynthesis-quiz-students.csv` */
export function csvFilename(quizTitle: string): string {
  const slug = quizTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${slug || "quiz"}-students.csv`;
}

export function mapAnalyticsError(err: unknown, fallback = "Couldn't load analytics."): string {
  const msg = (err as { message?: string })?.message ?? "";
  if (msg.includes("access_denied")) return "You don't have access to this quiz's analytics.";
  if (msg.includes("quiz_not_found")) return "That quiz no longer exists.";
  if (msg.includes("question_not_found")) return "That question is no longer part of this quiz.";
  if (msg.includes("no_result_for_student")) return "This student hasn't completed the quiz yet.";
  if (msg.includes("not_authenticated")) return "Please sign in again.";
  return fallback;
}
