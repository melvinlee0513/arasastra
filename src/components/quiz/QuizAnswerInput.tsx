/**
 * The student's answer control, one component per question type.
 *
 * The payload it receives has already been redacted by `get_quiz_for_attempt`:
 * options carry no `is_correct`, and there is no accepted-answer list, numeric
 * answer or tolerance anywhere in it. `answer_unit` is present because a
 * student needs to know what to type — it is a label, not a key.
 *
 * Nothing here decides correctness. The value is handed to the server as-is and
 * graded by `_quiz_answer_is_correct`.
 */
import { useId } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { ArenaAnswerGrid } from "@/components/quiz/QuizArena";
import { RichTextRenderer } from "@/components/richtext/RichTextRenderer";
import type { AnswerValue } from "@/lib/quizAnswers";

export type { AnswerValue };

export interface AttemptQuestion {
  id: string;
  question_type: string;
  prompt: string;
  points: number;
  answer_unit?: string | null;
  prompt_content?: unknown;
  options: { id: string; text: string; order_index: number; content?: unknown }[];
}

const LETTERS = "ABCDEFGH";

export function QuizAnswerInput({
  question,
  value,
  onChange,
  disabled,
}: {
  question: AttemptQuestion;
  value: AnswerValue | undefined;
  onChange: (v: AnswerValue) => void;
  disabled?: boolean;
}) {
  const inputId = useId();
  const type = question.question_type === "multiple_choice" ? "mcq" : question.question_type;

  // ── Single choice: the existing arena grid, unchanged ────────────────────
  //
  // true_false keeps its historical answer values ("true" / "false") rather
  // than option ids: attempts already saved in that shape must keep grading.
  if (type === "mcq" || type === "true_false") {
    const opts =
      type === "true_false"
        ? [{ id: "true", text: "True" }, { id: "false", text: "False" }]
        : question.options.map((o) => ({ id: o.id, text: o.text, content: o.content }));
    return (
      <ArenaAnswerGrid
        options={opts}
        selectedId={typeof value === "string" ? value : null}
        onSelect={(id) => onChange(id)}
        disabled={disabled}
      />
    );
  }

  // ── Multiple select ─────────────────────────────────────────────────────
  if (type === "multiple_select") {
    const chosen = Array.isArray(value) ? value : [];
    return (
      <div>
        <p className="mb-2 text-[12.5px] font-semibold text-quiz-arena-muted">
          Select all that apply.
        </p>
        <ul className="space-y-2" role="group" aria-label="Select all correct answers">
          {question.options.map((o, i) => {
            const on = chosen.includes(o.id);
            return (
              <li key={o.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  disabled={disabled}
                  onClick={() =>
                    onChange(on ? chosen.filter((x) => x !== o.id) : [...chosen, o.id])
                  }
                  className={cn(
                    "flex min-h-[56px] w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition active:scale-[0.99] disabled:opacity-60",
                    on
                      ? "border-quiz-accent bg-quiz-accent/20"
                      : "border-white/15 bg-white/8",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 text-[12px] font-black",
                      on ? "border-quiz-accent bg-quiz-accent text-white" : "border-white/30 text-quiz-arena-muted",
                    )}
                    aria-hidden="true"
                  >
                    {on ? <Check className="h-4 w-4" strokeWidth={3} /> : (LETTERS[i] ?? i + 1)}
                  </span>
                  <span className="min-w-0 flex-1 break-words text-[14.5px] font-semibold">
                    <RichTextRenderer value={o.content ?? null} fallbackText={o.text} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  // ── Numeric ─────────────────────────────────────────────────────────────
  if (type === "numeric") {
    return (
      <div>
        <label htmlFor={inputId} className="mb-2 block text-[12.5px] font-semibold text-quiz-arena-muted">
          Type your answer{question.answer_unit ? ` in ${question.answer_unit}` : ""}.
        </label>
        <div className="flex items-stretch gap-2">
          <input
            id={inputId}
            type="text"
            // `decimal` gives the numeric keypad with a decimal point, without
            // the spinner and locale quirks a number input brings.
            inputMode="decimal"
            autoComplete="off"
            disabled={disabled}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value.replace(/[^0-9.+-]/g, "").slice(0, 24))}
            placeholder="0.0"
            aria-label={`Answer for: ${question.prompt}`}
            className="min-h-[56px] min-w-0 flex-1 rounded-2xl border border-white/15 bg-white/8 px-4 text-[18px] font-bold tabular-nums text-quiz-arena-foreground outline-none transition placeholder:text-quiz-arena-muted focus:border-quiz-accent-pink focus:ring-2 focus:ring-quiz-accent-pink/40 disabled:opacity-60"
          />
          {question.answer_unit && (
            <span className="flex min-h-[56px] shrink-0 items-center rounded-2xl bg-white/12 px-3.5 text-[14.5px] font-bold text-quiz-arena-muted">
              {question.answer_unit}
            </span>
          )}
        </div>
      </div>
    );
  }

  // ── Short answer / fill in the blank ────────────────────────────────────
  if (type === "short_answer" || type === "fill_blank") {
    return (
      <div>
        <label htmlFor={inputId} className="mb-2 block text-[12.5px] font-semibold text-quiz-arena-muted">
          {type === "fill_blank" ? "Fill in the blank." : "Type your answer."}
        </label>
        <input
          id={inputId}
          type="text"
          autoComplete="off"
          autoCapitalize="off"
          disabled={disabled}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value.slice(0, 200))}
          placeholder="Your answer"
          aria-label={`Answer for: ${question.prompt}`}
          className="min-h-[56px] w-full rounded-2xl border border-white/15 bg-white/8 px-4 text-[16px] font-semibold text-quiz-arena-foreground outline-none transition placeholder:text-quiz-arena-muted focus:border-quiz-accent-pink focus:ring-2 focus:ring-quiz-accent-pink/40 disabled:opacity-60"
        />
      </div>
    );
  }

  // An unknown type must say so rather than silently showing nothing.
  return (
    <p className="rounded-2xl border border-white/15 bg-white/8 px-4 py-4 text-[13.5px] text-quiz-arena-muted">
      This question type isn't supported in this version of the app. Ask your tutor to check it.
    </p>
  );
}

export default QuizAnswerInput;
