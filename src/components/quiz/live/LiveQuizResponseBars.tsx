/**
 * Host-only response distribution for the current question.
 *
 * The counts come from `question_stats`, which the server includes only for a
 * caller `can_manage_class` says is the host — a player's snapshot has no
 * `question_stats` at all. That matters: publishing per-option counts to
 * players would leak the answer by popularity long before the reveal.
 *
 * Which option is correct is therefore also known here before the reveal, but
 * this component still withholds it until `revealed`, so a tutor screen-sharing
 * the host view cannot give the game away.
 */
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { ArenaPanel } from "@/components/quiz/QuizArena";
import type { LiveQuizQuestionStats } from "@/lib/liveQuiz";

const LETTERS = "ABCDEFGH";

export function LiveQuizResponseBars({
  stats,
  revealed,
  className,
}: {
  stats: LiveQuizQuestionStats;
  /** Only after the host reveals is the correct option marked. */
  revealed: boolean;
  className?: string;
}) {
  // A multi-select answer counts once per option chosen, so the per-option
  // counts can exceed the number of players. `answered` is the honest headline.
  const total = stats.options.reduce((sum, o) => sum + o.count, 0);

  // Short answer, numeric and fill-in-the-blank have no options to distribute
  // over. Rendering an empty bar chart would read as "nobody answered".
  if (stats.options.length === 0) {
    return (
      <ArenaPanel className={cn("p-3", className)}>
        <div className="flex items-baseline justify-between">
          <p className="text-[11px] font-bold uppercase tracking-wide text-quiz-arena-muted">
            Responses
          </p>
          <p className="text-[12px] font-semibold text-quiz-arena-muted tabular-nums">
            {stats.answered} answered
          </p>
        </div>
        <p className="mt-2 text-[12.5px] text-quiz-arena-muted">
          This question is answered by typing, so there is no per-option breakdown.
        </p>
      </ArenaPanel>
    );
  }

  return (
    <ArenaPanel className={cn("p-3", className)}>
      <div className="flex items-baseline justify-between">
        <p className="text-[11px] font-bold uppercase tracking-wide text-quiz-arena-muted">
          Responses
        </p>
        <p className="text-[12px] font-semibold text-quiz-arena-muted tabular-nums">
          {stats.answered} answered
        </p>
      </div>

      <ul className="mt-2.5 space-y-2">
        {stats.options.map((o, i) => {
          // Percentage of answers given, not of players — an unanswered
          // question would otherwise show four bars that sum to nothing.
          const pct = total > 0 ? Math.round((o.count / total) * 100) : 0;
          const isRight = revealed && o.is_correct;
          return (
            <li key={o.option_id}>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[11.5px] font-black",
                    isRight ? "bg-quiz-correct text-white" : "bg-white/12 text-quiz-arena-muted",
                  )}
                >
                  {LETTERS[i] ?? i + 1}
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-[13px]",
                    isRight ? "font-bold text-emerald-200" : "text-quiz-arena-foreground",
                  )}
                >
                  {o.text}
                </span>
                {isRight && <Check className="h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />}
                <span className="shrink-0 text-[12.5px] font-bold tabular-nums text-quiz-arena-muted">
                  {o.count}
                </span>
                <span className="w-9 shrink-0 text-right text-[12.5px] font-black tabular-nums">
                  {pct}%
                </span>
              </div>
              <div
                className="mt-1 h-2 overflow-hidden rounded-full bg-white/8"
                role="img"
                aria-label={`${o.text}: ${o.count} of ${total} answers, ${pct} percent`}
              >
                <div
                  className={cn(
                    "h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none",
                    isRight
                      ? "bg-quiz-correct"
                      : "bg-gradient-to-r from-quiz-accent-pink to-quiz-accent",
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </ArenaPanel>
  );
}

export default LiveQuizResponseBars;
