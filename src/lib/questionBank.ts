/**
 * Question Bank — client access layer.
 *
 * Every call is a SECURITY DEFINER RPC that resolves the caller's centre from
 * `auth.uid()`. The client never sends a centre id, never filters by centre,
 * and never reads `question_bank_options` directly — the answer key comes back
 * only through `get_question_bank_question`, which has already proven the
 * caller is staff of that centre.
 *
 * Adding to a quiz COPIES. See `add_question_bank_questions_to_quiz`: a
 * published quiz must never change because someone tidied up the bank.
 */
import { supabase } from "@/integrations/supabase/client";
import type { QuestionMediaCrop } from "@/lib/quizMedia";

export type BankSort = "recent" | "newest" | "oldest" | "most_used" | "az";

export const BANK_SORT_LABEL: Record<BankSort, string> = {
  recent: "Recently updated",
  newest: "Newest",
  oldest: "Oldest",
  most_used: "Most used",
  az: "A–Z",
};

export interface BankCollection {
  id: string;
  name: string;
  description: string | null;
  subject_id: string | null;
  subject_name: string | null;
  question_count: number;
}

export interface BankRecentQuestion {
  id: string;
  question: string;
  question_type: string;
  points: number;
  topic: string | null;
  collection_id: string | null;
  collection_name: string | null;
  subject_name: string | null;
  usage_count: number;
  updated_at: string;
}

export interface BankSubject {
  id: string;
  name: string;
}

export interface QuestionBankHome {
  center_id: string;
  question_count: number;
  collection_count: number;
  collections: BankCollection[];
  recent: BankRecentQuestion[];
  subjects: BankSubject[];
}

export interface BankQuestionRow {
  id: string;
  question: string;
  question_type: string;
  points: number;
  topic: string | null;
  explanation: string | null;
  collection_id: string | null;
  subject_id: string | null;
  usage_count: number;
  archived: boolean;
  updated_at: string;
  created_at: string;
  option_count: number;
}

export interface BankSearchResult {
  total: number;
  limit: number;
  offset: number;
  questions: BankQuestionRow[];
  /** Distinct topics actually present, for the chip row. Never invented. */
  topics: string[];
}

export interface BankOption {
  id: string;
  option_text: string;
  is_correct: boolean;
  order_index: number;
}

export interface BankUsedIn {
  quiz_id: string;
  title: string;
  status: string;
  class_id: string;
  question_count: number;
}

export interface BankAnswerConfig {
  /** short_answer / fill_blank. Never sent to a student. */
  accepted_answers: string[];
  answer_match_mode: "exact" | "ignore_case";
  numeric_answer: number | null;
  numeric_tolerance: number | null;
  /** Display label ("m/s²"). This one IS shown to students. */
  answer_unit: string | null;
}

export interface BankQuestionMedia {
  image_path: string | null;
  image_width: number | null;
  image_height: number | null;
  image_alt: string | null;
  image_crop: QuestionMediaCrop | null;
}

export interface BankQuestionDetail extends BankAnswerConfig, BankQuestionMedia {
  id: string;
  question: string;
  question_type: string;
  points: number;
  explanation: string | null;
  topic: string | null;
  collection_id: string | null;
  subject_id: string | null;
  collection_name: string | null;
  subject_name: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
  options: BankOption[];
  usage_count: number;
  used_in: BankUsedIn[];
}

export interface BankQuizTarget {
  id: string;
  title: string;
  status: string;
  class_id: string;
  class_title: string;
  subject_name: string | null;
  question_count: number;
  updated_at: string;
}

// ─── RPCs ──────────────────────────────────────────────────────────────────

export async function listQuestionBank(): Promise<QuestionBankHome> {
  const { data, error } = await supabase.rpc("list_question_bank" as never, {} as never);
  if (error) throw error;
  return data as unknown as QuestionBankHome;
}

export async function searchQuestionBank(args: {
  search?: string | null;
  collectionId?: string | null;
  subjectId?: string | null;
  questionType?: string | null;
  topic?: string | null;
  sort?: BankSort;
  includeArchived?: boolean;
  limit?: number;
  offset?: number;
} = {}): Promise<BankSearchResult> {
  const { data, error } = await supabase.rpc("search_question_bank" as never, {
    _search: args.search?.trim() || null,
    _collection_id: args.collectionId ?? null,
    _subject_id: args.subjectId ?? null,
    _question_type: args.questionType ?? null,
    _topic: args.topic ?? null,
    _sort: args.sort ?? "recent",
    _include_archived: args.includeArchived ?? false,
    _limit: args.limit ?? 50,
    _offset: args.offset ?? 0,
  } as never);
  if (error) throw error;
  return data as unknown as BankSearchResult;
}

export async function getBankQuestion(id: string): Promise<BankQuestionDetail> {
  const { data, error } = await supabase.rpc("get_question_bank_question" as never, {
    _question_id: id,
  } as never);
  if (error) throw error;
  return data as unknown as BankQuestionDetail;
}

export async function saveBankQuestion(args: {
  id?: string | null;
  question: string;
  questionType: string;
  points: number;
  explanation?: string | null;
  topic?: string | null;
  collectionId?: string | null;
  subjectId?: string | null;
  options: { option_text: string; is_correct: boolean }[];
  acceptedAnswers?: string[] | null;
  answerMatchMode?: "exact" | "ignore_case";
  numericAnswer?: number | null;
  numericTolerance?: number | null;
  answerUnit?: string | null;
  imagePath?: string | null;
  imageWidth?: number | null;
  imageHeight?: number | null;
  imageAlt?: string | null;
  imageCrop?: QuestionMediaCrop | null;
}): Promise<{ id: string }> {
  const { data, error } = await supabase.rpc("save_question_bank_question" as never, {
    _question_id: args.id ?? null,
    _question: args.question,
    _question_type: args.questionType,
    _points: args.points,
    _explanation: args.explanation ?? null,
    _topic: args.topic ?? null,
    _collection_id: args.collectionId ?? null,
    _subject_id: args.subjectId ?? null,
    _options: args.options,
    _accepted_answers: args.acceptedAnswers ?? null,
    _answer_match_mode: args.answerMatchMode ?? "ignore_case",
    _numeric_answer: args.numericAnswer ?? null,
    _numeric_tolerance: args.numericTolerance ?? null,
    _answer_unit: args.answerUnit ?? null,
    _image_path: args.imagePath ?? null,
    _image_width: args.imagePath ? (args.imageWidth ?? null) : null,
    _image_height: args.imagePath ? (args.imageHeight ?? null) : null,
    _image_alt: args.imagePath ? (args.imageAlt ?? null) : null,
    _image_crop: args.imagePath ? (args.imageCrop ?? null) : null,
  } as never);
  if (error) throw error;
  return data as unknown as { id: string };
}

export async function duplicateBankQuestions(ids: string[]): Promise<{ created: number; ids: string[] }> {
  const { data, error } = await supabase.rpc("duplicate_question_bank_questions" as never, {
    _question_ids: ids,
  } as never);
  if (error) throw error;
  return data as unknown as { created: number; ids: string[] };
}

export async function archiveBankQuestion(
  id: string,
  archived = true,
): Promise<{ id: string; archived: boolean }> {
  const { data, error } = await supabase.rpc("archive_question_bank_question" as never, {
    _question_id: id,
    _archived: archived,
  } as never);
  if (error) throw error;
  return data as unknown as { id: string; archived: boolean };
}

export async function saveBankCollection(args: {
  id?: string | null;
  name: string;
  description?: string | null;
  subjectId?: string | null;
}): Promise<{ id: string }> {
  const { data, error } = await supabase.rpc("save_question_bank_collection" as never, {
    _collection_id: args.id ?? null,
    _name: args.name,
    _description: args.description ?? null,
    _subject_id: args.subjectId ?? null,
  } as never);
  if (error) throw error;
  return data as unknown as { id: string };
}

/**
 * Copy the selected bank questions into a quiz.
 *
 * Idempotent per (quiz, bank question): the server skips anything already
 * copied, so a double tap on the CTA cannot duplicate a question. The result
 * reports both counts so the UI can say what actually happened.
 */
export async function addBankQuestionsToQuiz(args: {
  quizId: string;
  questionIds: string[];
}): Promise<{ added: number; skipped: number; quiz_id: string }> {
  const { data, error } = await supabase.rpc("add_question_bank_questions_to_quiz" as never, {
    _quiz_id: args.quizId,
    _question_ids: args.questionIds,
  } as never);
  if (error) throw error;
  return data as unknown as { added: number; skipped: number; quiz_id: string };
}

export async function listQuizzesForBank(): Promise<BankQuizTarget[]> {
  const { data, error } = await supabase.rpc("list_quizzes_for_question_bank" as never, {} as never);
  if (error) throw error;
  return (data as unknown as BankQuizTarget[]) ?? [];
}

// ─── Query keys ────────────────────────────────────────────────────────────

export const bankKeys = {
  home: (t: string | null) => ["question-bank", "home", t] as const,
  search: (t: string | null, args: Record<string, unknown>) =>
    ["question-bank", "search", t, args] as const,
  question: (t: string | null, id: string) => ["question-bank", "question", t, id] as const,
  quizTargets: (t: string | null) => ["question-bank", "quiz-targets", t] as const,
};

// ─── Helpers ───────────────────────────────────────────────────────────────

export const QUESTION_TYPE_LABEL: Record<string, string> = {
  mcq: "MCQ",
  multiple_choice: "MCQ",
  true_false: "T/F",
  multiple_select: "Multi",
  short_answer: "Short",
  numeric: "Numeric",
  fill_blank: "Blank",
};

/** Types whose answer is a set of options rather than typed text. */
export const CHOICE_TYPES = new Set(["mcq", "multiple_choice", "true_false", "multiple_select"]);
/** Types whose answer key is a list of accepted strings. */
export const TEXT_ANSWER_TYPES = new Set(["short_answer", "fill_blank"]);

export function typeLabel(t: string): string {
  return QUESTION_TYPE_LABEL[t] ?? t;
}

/** "Used 5 times" / "Not used yet" — derived server-side, never a stored tally. */
export function usageLabel(n: number): string {
  if (n === 0) return "Not used yet";
  return `Used ${n} time${n === 1 ? "" : "s"}`;
}

export function mapBankError(err: unknown, fallback = "Something went wrong."): string {
  const msg = (err as { message?: string })?.message ?? "";
  if (msg.includes("no_question_bank_access"))
    return "You don't have access to a question bank. Ask an admin to assign you to a class.";
  // Same message for missing and foreign-centre, so ids can't be probed.
  if (msg.includes("question_not_found")) return "That question is no longer available.";
  if (msg.includes("collection_not_found")) return "That collection is no longer available.";
  if (msg.includes("subject_not_found")) return "That subject is no longer available.";
  if (msg.includes("quiz_not_found")) return "That quiz is no longer available.";
  if (msg.includes("access_denied")) return "You can't add questions to that quiz.";
  if (msg.includes("question_text_required")) return "Enter the question text.";
  if (msg.includes("collection_name_required")) return "Give the collection a name.";
  if (msg.includes("no_questions_selected")) return "Select at least one question first.";
  if (msg.includes("not_authenticated")) return "Please sign in again.";
  return fallback;
}
