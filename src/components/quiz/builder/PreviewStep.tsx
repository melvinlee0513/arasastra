/**
 * Step 4 — Preview.
 *
 * A MANAGER preview built from the live draft, so correct answers and
 * explanations are shown on purpose — this is not the student attempt view.
 *
 * No Share action: there is no share/link RPC in the quiz API, and a button
 * that does nothing is worse than its absence.
 */
import { useState } from "react";
import {
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Eye,
  HelpCircle,
  Repeat,
  Shuffle,
  Timer,
  Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { QUIZ_ART } from "@/lib/quizArt";
import { formatDateTime, RESULT_VISIBILITY_LABEL } from "@/lib/quizzes";
import {
  BuilderArt,
  BuilderCard,
  BuilderEmptyState,
  BuilderPill,
  BuilderSection,
} from "./QuizBuilderChrome";
import { QUESTION_TYPE_LABEL, isChoiceType, totalPoints, type BuilderState } from "./types";

const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"];

export interface PreviewStepProps {
  state: BuilderState;
  /** Publish-blocking messages, surfaced before the tutor commits. */
  publishIssues: string[];
  onGoToQuestions: () => void;
}

export function PreviewStep({ state, publishIssues, onGoToQuestions }: PreviewStepProps) {
  const [index, setIndex] = useState(0);
  const { meta, questions } = state;
  const points = totalPoints(state);
  const active = questions[Math.min(index, Math.max(0, questions.length - 1))];

  const timeLimit = meta.time_limit_seconds.trim();
  const attempts = parseInt(meta.attempt_limit, 10) || 1;

  return (
    <div className="space-y-4">
      {/* Hero */}
      <BuilderCard tone="accent" className="relative overflow-hidden">
        <div className="relative flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="break-words text-[20px] font-extrabold leading-tight text-slate-900">
              {meta.title.trim() || "Untitled quiz"}
            </h1>
            {meta.description.trim() && (
              <p className="mt-1.5 text-[13.5px] leading-snug text-slate-600">
                {meta.description}
              </p>
            )}
          </div>
          <BuilderArt
            src={QUIZ_ART.trophyRibbon}
            className="h-20 w-20 shrink-0 drop-shadow-[0_12px_20px_rgba(15,23,42,0.18)]"
          />
        </div>

        <div className="relative mt-4 grid grid-cols-2 gap-2">
          <StatTile
            icon={<HelpCircle className="h-4 w-4" />}
            value={String(questions.length)}
            label={questions.length === 1 ? "Question" : "Questions"}
          />
          <StatTile
            icon={<Trophy className="h-4 w-4" />}
            value={String(points)}
            label="Total points"
          />
          <StatTile
            icon={<Timer className="h-4 w-4" />}
            value={timeLimit ? `${timeLimit} min` : "None"}
            label="Time limit"
          />
          <StatTile
            icon={<Repeat className="h-4 w-4" />}
            value={String(attempts)}
            label={attempts === 1 ? "Attempt" : "Attempts"}
          />
        </div>
      </BuilderCard>

      {publishIssues.length > 0 && (
        <BuilderCard tone="warn">
          <p className="mb-1.5 text-[13px] font-bold text-amber-900">
            Before publishing, fix {publishIssues.length}{" "}
            {publishIssues.length === 1 ? "issue" : "issues"}
          </p>
          <ul className="list-inside list-disc space-y-0.5 text-[12.5px] text-amber-900">
            {publishIssues.slice(0, 5).map((m, i) => (
              <li key={i}>{m}</li>
            ))}
            {publishIssues.length > 5 && (
              <li>…and {publishIssues.length - 5} more.</li>
            )}
          </ul>
          <Button
            size="sm"
            variant="outline"
            onClick={onGoToQuestions}
            className="mt-3 min-h-[44px] rounded-full border-amber-300 bg-white text-[13px] font-semibold"
          >
            Review questions
          </Button>
        </BuilderCard>
      )}

      {/* Instructions */}
      {meta.instructions.trim() && (
        <BuilderSection title="Instructions" description="Shown before students start.">
          <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-slate-700">
            {meta.instructions}
          </p>
        </BuilderSection>
      )}

      {/* Sample question */}
      {questions.length === 0 ? (
        <BuilderEmptyState
          art={QUIZ_ART.hourglass}
          title="Nothing to preview yet"
          description="Add at least one question to see how this quiz will look."
          action={
            <Button
              onClick={onGoToQuestions}
              className="min-h-[44px] rounded-full bg-quiz-accent px-6 font-bold text-white hover:bg-quiz-accent-strong"
            >
              Add questions
            </Button>
          }
        />
      ) : (
        active && (
          <BuilderSection
            title="Question preview"
            description="Correct answers are shown to you only."
            icon={<Eye className="h-5 w-5" />}
            action={
              questions.length > 1 ? (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Previous question"
                    disabled={index === 0}
                    onClick={() => setIndex((i) => Math.max(0, i - 1))}
                    className="h-11 w-11 rounded-xl"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-[12px] font-semibold tabular-nums text-slate-500">
                    {index + 1}/{questions.length}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Next question"
                    disabled={index >= questions.length - 1}
                    onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}
                    className="h-11 w-11 rounded-xl"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              ) : undefined
            }
          >
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <BuilderPill tone="accent">{QUESTION_TYPE_LABEL[active.question_type]}</BuilderPill>
                <BuilderPill tone="neutral">
                  {active.points} {active.points === 1 ? "point" : "points"}
                </BuilderPill>
              </div>

              <p className="whitespace-pre-wrap break-words text-[15.5px] font-bold leading-snug text-slate-900">
                {active.question.trim() || "Untitled question"}
              </p>

              {active.image_path && (
                <QuestionMedia
                  media={{
                    image_path: active.image_path,
                    image_width: active.image_width,
                    image_height: active.image_height,
                    image_alt: active.image_alt,
                    image_crop: active.image_crop,
                  }}
                />
              )}

              <ul className="space-y-2">
                {active.options.map((o, i) => (
                  <li
                    key={o.id}
                    className={cn(
                      "flex items-start gap-2.5 rounded-2xl border px-3 py-2.5 text-[14px]",
                      o.is_correct
                        ? "border-quiz-correct/50 bg-emerald-50 text-emerald-900"
                        : "border-slate-200 bg-white text-slate-700",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[11px] font-black",
                        o.is_correct
                          ? "bg-quiz-correct text-white"
                          : "bg-slate-100 text-slate-500",
                      )}
                    >
                      {o.is_correct ? (
                        <Check className="h-3.5 w-3.5" strokeWidth={3} />
                      ) : (
                        (OPTION_LETTERS[i] ?? i + 1)
                      )}
                    </span>
                    <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
                      {o.option_text || (
                        <span className="italic text-slate-400">Empty option</span>
                      )}
                    </span>
                    {o.is_correct && (
                      <span className="shrink-0 rounded-full bg-quiz-correct/15 px-2 py-0.5 text-[11px] font-black uppercase tracking-wide text-emerald-700">
                        Correct
                      </span>
                    )}
                  </li>
                ))}
                {/* Typed-answer types show their answer key instead of options. */}
                {!isChoiceType(active.question_type) && (
                  <li className="rounded-2xl border border-quiz-correct/50 bg-emerald-50 px-3 py-2.5 text-[14px] text-emerald-900">
                    <span className="block text-[11px] font-black uppercase tracking-wide text-emerald-700">
                      Answer key
                    </span>
                    <span className="mt-0.5 block break-words font-semibold">
                      {active.question_type === "numeric"
                        ? [
                            (active.numeric_answer ?? "").trim() || "—",
                            Number(active.numeric_tolerance ?? "0") > 0
                              ? `± ${active.numeric_tolerance}`
                              : null,
                            (active.answer_unit ?? "").trim() || null,
                          ]
                            .filter(Boolean)
                            .join(" ")
                        : (active.accepted_answers ?? [])
                            .map((a) => a.trim())
                            .filter(Boolean)
                            .join("  ·  ") || "—"}
                    </span>
                  </li>
                )}
                {isChoiceType(active.question_type) && active.options.length === 0 && (
                  <li className="flex items-center gap-2 rounded-2xl border border-dashed border-slate-300 px-3 py-3 text-[13px] text-slate-500">
                    <Circle className="h-4 w-4" /> No options added yet.
                  </li>
                )}
              </ul>

              {active.explanation.trim() && (
                <div className="flex items-start gap-2.5 rounded-2xl border border-quiz-accent/20 bg-quiz-tint px-3 py-2.5">
                  <BuilderArt src={QUIZ_ART.explanation} className="h-8 w-8 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[11px] font-black uppercase tracking-wide text-quiz-accent-strong">
                      Explanation
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-snug text-slate-700">
                      {active.explanation}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </BuilderSection>
        )
      )}

      {/* Settings summary */}
      <BuilderSection
        title="Settings summary"
        description="What students will experience."
        icon={<CalendarClock className="h-5 w-5" />}
      >
        <dl className="divide-y divide-slate-100">
          <SummaryRow
            label="Available from"
            value={meta.available_from ? formatDateTime(meta.available_from) : "Immediately"}
          />
          <SummaryRow
            label="Due at"
            value={meta.due_at ? formatDateTime(meta.due_at) : "No deadline"}
          />
          <SummaryRow
            label="Results"
            value={RESULT_VISIBILITY_LABEL[meta.result_visibility]}
          />
          <SummaryRow
            label="Shuffle"
            value={
              [
                meta.shuffle_questions ? "Questions" : null,
                meta.shuffle_options ? "Options" : null,
              ]
                .filter(Boolean)
                .join(" · ") || "Off"
            }
            icon={<Shuffle className="h-3.5 w-3.5" />}
          />
        </dl>
      </BuilderSection>
    </div>
  );
}

function StatTile({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-2xl bg-white/80 px-3 py-2.5 ring-1 ring-inset ring-white">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-quiz-tint text-quiz-accent-strong">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[14px] font-extrabold leading-none text-slate-900">{value}</p>
        <p className="mt-0.5 truncate text-[11px] font-medium text-slate-500">{label}</p>
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <dt className="flex shrink-0 items-center gap-1.5 text-[13px] font-medium text-slate-500">
        {icon}
        {label}
      </dt>
      <dd className="ml-auto min-w-0 truncate text-right text-[13px] font-semibold text-slate-900">
        {value}
      </dd>
    </div>
  );
}

export default PreviewStep;
