/**
 * The canonical question types the quiz engine supports, with the copy and
 * iconography the picker and the editor both use.
 *
 * Data, not a component — every entry here is fully supported end to end:
 * it saves, reloads, previews, publishes, is answered by a student and is
 * graded server-side by `_quiz_answer_is_correct`.
 */
import {
  CheckSquare, CircleDot, Hash, ListChecks, TextCursorInput, ToggleLeft,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { QUESTION_TYPE_LABELS, type QuestionType } from "@/lib/quizzes";

export interface QuestionTypeDef {
  value: QuestionType;
  label: string;
  hint: string;
  icon: LucideIcon;
  tone: string;
}

export const QUESTION_TYPES: QuestionTypeDef[] = [
  { value: "mcq", label: QUESTION_TYPE_LABELS.mcq,
    hint: "Choose one correct answer from the options.",
    icon: CircleDot, tone: "bg-violet-100 text-violet-600" },
  { value: "multiple_select", label: QUESTION_TYPE_LABELS.multiple_select,
    hint: "Choose all correct answers from the options.",
    icon: ListChecks, tone: "bg-emerald-100 text-emerald-600" },
  { value: "true_false", label: QUESTION_TYPE_LABELS.true_false,
    hint: "Select whether the statement is true or false.",
    icon: ToggleLeft, tone: "bg-amber-100 text-amber-600" },
  { value: "short_answer", label: QUESTION_TYPE_LABELS.short_answer,
    hint: "Provide a short written answer in one or two words.",
    icon: TextCursorInput, tone: "bg-sky-100 text-sky-600" },
  { value: "numeric", label: QUESTION_TYPE_LABELS.numeric,
    hint: "Enter a numeric answer, with or without units.",
    icon: Hash, tone: "bg-orange-100 text-orange-600" },
  { value: "fill_blank", label: QUESTION_TYPE_LABELS.fill_blank,
    hint: "Complete the sentence with the correct word or phrase.",
    icon: CheckSquare, tone: "bg-fuchsia-100 text-fuchsia-600" },
];

/**
 * The types Phase 5 added. Behind the `expandedQuestionTypes` flag, which gates
 * AUTHORING only: a quiz that already contains one of these keeps working, and
 * keeps grading, whatever the flag says. Turning the flag off must not strand a
 * tutor's existing content — it stops new questions of these types being added.
 */
const EXPANDED_TYPES: ReadonlySet<QuestionType> = new Set([
  "multiple_select",
  "short_answer",
  "numeric",
  "fill_blank",
]);

/** The types a tutor may add right now, for this centre. */
export function questionTypesFor(expandedEnabled: boolean): QuestionTypeDef[] {
  return expandedEnabled
    ? QUESTION_TYPES
    : QUESTION_TYPES.filter((t) => !EXPANDED_TYPES.has(t.value));
}
