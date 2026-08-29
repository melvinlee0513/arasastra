/**
 * Step 3 — Settings.
 *
 * Strictly the settings `save_quiz_definition` persists. The reference design's
 * themes, background music, sound effects, memes/reactions, power-ups,
 * difficulty and leaderboard toggles are NOT rendered: they have no canonical
 * backend field, and a toggle that silently discards its value is worse than no
 * toggle at all.
 */
import { CalendarClock, Eye, Lock, Shuffle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { RESULT_VISIBILITY_LABEL, type ResultVisibility } from "@/lib/quizzes";
import {
  BuilderCard,
  BuilderField,
  BuilderSection,
  BuilderToggleRow,
} from "./QuizBuilderChrome";
import { RESULT_VISIBILITY_HINT, type MetaDraft } from "./types";

const VISIBILITY_ORDER: ResultVisibility[] = ["after_submit", "after_due", "manual", "never"];

export interface SettingsStepProps {
  meta: MetaDraft;
  onPatch: <K extends keyof MetaDraft>(key: K, value: MetaDraft[K]) => void;
  locked: boolean;
  invalidFields: Set<string>;
}

export function SettingsStep({ meta, onPatch, locked, invalidFields }: SettingsStepProps) {
  return (
    <div className="space-y-4">
      {locked && (
        <BuilderCard tone="warn">
          <div className="flex items-start gap-2.5">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <p className="text-[13px] leading-snug text-amber-900">
              Availability, due date, time limit and shuffle are locked because students have
              already attempted this quiz. You can still change result visibility and raise the
              attempt limit.
            </p>
          </div>
        </BuilderCard>
      )}

      <BuilderSection
        title="Time & access"
        description="When students can attempt this quiz."
        icon={<CalendarClock className="h-5 w-5" />}
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <BuilderField
              label="Available from"
              htmlFor="q-avail"
              hint="Leave empty to open immediately."
              error={
                invalidFields.has("schedule")
                  ? "Due date must be after the available date."
                  : undefined
              }
            >
              <Input
                id="q-avail"
                type="datetime-local"
                value={meta.available_from}
                disabled={locked}
                onChange={(e) => onPatch("available_from", e.target.value)}
                className="h-12 rounded-2xl text-[15px] bg-white border-slate-200"
              />
            </BuilderField>

            <BuilderField
              label="Due at"
              htmlFor="q-due"
              hint="Leave empty for no deadline."
            >
              <Input
                id="q-due"
                type="datetime-local"
                value={meta.due_at}
                disabled={locked}
                onChange={(e) => onPatch("due_at", e.target.value)}
                className="h-12 rounded-2xl text-[15px] bg-white border-slate-200"
              />
            </BuilderField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <BuilderField
              label="Time limit"
              htmlFor="q-tl"
              hint="Minutes. Empty means no limit."
              error={
                invalidFields.has("time_limit")
                  ? "Enter a whole number of minutes."
                  : undefined
              }
            >
              <div className="relative">
                <Input
                  id="q-tl"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={meta.time_limit_seconds}
                  disabled={locked}
                  onChange={(e) =>
                    onPatch("time_limit_seconds", e.target.value.replace(/[^0-9]/g, ""))
                  }
                  placeholder="No limit"
                  className="h-12 rounded-2xl pr-14 text-[15px] bg-white border-slate-200"
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[12px] font-semibold text-slate-400">
                  min
                </span>
              </div>
            </BuilderField>

            <BuilderField
              label="Attempts allowed"
              htmlFor="q-al"
              hint={locked ? "Only increases are allowed after attempts." : "How many times a student may attempt."}
              error={
                invalidFields.has("attempt_limit") ? "Must be at least 1." : undefined
              }
            >
              <Input
                id="q-al"
                inputMode="numeric"
                pattern="[0-9]*"
                value={meta.attempt_limit}
                onChange={(e) =>
                  onPatch("attempt_limit", e.target.value.replace(/[^0-9]/g, "") || "1")
                }
                className="h-12 rounded-2xl text-[15px] bg-white border-slate-200"
              />
            </BuilderField>
          </div>
        </div>
      </BuilderSection>

      <BuilderSection
        title="Question behaviour"
        description="How questions and answers are presented."
        icon={<Shuffle className="h-5 w-5" />}
      >
        <div className="divide-y divide-slate-100">
          <BuilderToggleRow
            title="Shuffle questions"
            description="Each student sees a different question order."
            disabled={locked}
            checked={meta.shuffle_questions}
            onCheckedChange={(v) => onPatch("shuffle_questions", v)}
          />
          <BuilderToggleRow
            title="Shuffle options"
            description="Randomise answer order within each question."
            disabled={locked}
            checked={meta.shuffle_options}
            onCheckedChange={(v) => onPatch("shuffle_options", v)}
          />
        </div>
      </BuilderSection>

      <BuilderSection
        title="Results"
        description="When students can see their score and answers."
        icon={<Eye className="h-5 w-5" />}
      >
        <div
          role="radiogroup"
          aria-label="Result visibility"
          className="space-y-2"
        >
          {VISIBILITY_ORDER.map((v) => {
            const selected = meta.result_visibility === v;
            return (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onPatch("result_visibility", v)}
                className={cn(
                  "flex w-full min-h-[56px] items-center gap-3 rounded-2xl border p-3 text-left transition active:scale-[0.99]",
                  selected
                    ? "border-quiz-accent/40 bg-quiz-tint"
                    : "border-slate-200 bg-white",
                )}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                    selected ? "border-quiz-accent" : "border-slate-300",
                  )}
                >
                  {selected && <span className="h-2.5 w-2.5 rounded-full bg-quiz-accent" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-bold text-slate-900">
                    {RESULT_VISIBILITY_LABEL[v]}
                  </span>
                  <span className="mt-0.5 block text-[12px] leading-snug text-slate-500">
                    {RESULT_VISIBILITY_HINT[v]}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        {invalidFields.has("result_visibility") && (
          <p role="alert" className="mt-2 text-[12px] font-medium text-rose-600">
            "After due date" needs a due date — set one under Time &amp; access.
          </p>
        )}
      </BuilderSection>
    </div>
  );
}

export default SettingsStep;
