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
import type { QuestionType } from "@/lib/quizzes";

export interface QuestionTypeDef {
  value: QuestionType;
  label: string;
  hint: string;
  icon: LucideIcon;
  tone: string;
}

export const QUESTION_TYPES: QuestionTypeDef[] = [
  { value: "mcq", label: "Multiple Choice",
    hint: "Choose one correct answer from the options.",
    icon: CircleDot, tone: "bg-violet-100 text-violet-600" },
  { value: "multiple_select", label: "Multiple Select",
    hint: "Choose all correct answers from the options.",
    icon: ListChecks, tone: "bg-emerald-100 text-emerald-600" },
  { value: "true_false", label: "True / False",
    hint: "Select whether the statement is true or false.",
    icon: ToggleLeft, tone: "bg-amber-100 text-amber-600" },
  { value: "short_answer", label: "Short Answer",
    hint: "Provide a short written answer in one or two words.",
    icon: TextCursorInput, tone: "bg-sky-100 text-sky-600" },
  { value: "numeric", label: "Numeric",
    hint: "Enter a numeric answer, with or without units.",
    icon: Hash, tone: "bg-orange-100 text-orange-600" },
  { value: "fill_blank", label: "Fill in the Blank",
    hint: "Complete the sentence with the correct word or phrase.",
    icon: CheckSquare, tone: "bg-fuchsia-100 text-fuchsia-600" },
];
