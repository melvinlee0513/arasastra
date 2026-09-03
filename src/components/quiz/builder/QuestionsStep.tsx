/**
 * Step 2 — Questions.
 *
 * Mobile-first: one question is edited at a time, with a horizontal chip
 * navigator plus a bottom-sheet overview instead of a desktop side list.
 *
 * Only the two canonical question types are offered (mcq, true_false). The
 * reference design's Ordering type and per-question media uploads have no
 * backend support, so they are not exposed.
 */
import { useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  ListOrdered,
  Lock,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { QUIZ_ART } from "@/lib/quizArt";
import type { QuestionType } from "@/lib/quizzes";
import {
  BuilderCard,
  BuilderEmptyState,
  BuilderField,
  BuilderPill,
  BuilderSection,
} from "./QuizBuilderChrome";
import { useFeatureEnabled } from "@/hooks/useFeature";
import { questionTypesFor } from "@/lib/questionTypes";
import { QUESTION_TYPE_LABEL, isChoiceType, type QuestionDraft } from "./types";

const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"];
const MAX_OPTIONS = 6;
const EXPLANATION_MAX = 500;

export interface QuestionsStepProps {
  questions: QuestionDraft[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  locked: boolean;
  /** Question indexes with publish-blocking problems. */
  invalidIndexes: Set<number>;
  onAddQuestion: (type: QuestionType) => void;
  onPatchQuestion: (index: number, patch: Partial<QuestionDraft>) => void;
  onChangeType: (index: number, type: QuestionType) => void;
  onRemoveQuestion: (index: number) => void;
  onDuplicateQuestion: (index: number) => void;
  onMoveQuestion: (index: number, dir: -1 | 1) => void;
  onPatchOption: (qIndex: number, oIndex: number, patch: { option_text?: string }) => void;
  onSetCorrect: (qIndex: number, oIndex: number) => void;
  onAddOption: (qIndex: number) => void;
  onRemoveOption: (qIndex: number, oIndex: number) => void;
}

export function QuestionsStep(props: QuestionsStepProps) {
  const {
    questions,
    activeIndex,
    onActiveIndexChange,
    locked,
    invalidIndexes,
    onAddQuestion,
  } = props;

  // Authoring gate only — existing questions of any type keep editing/grading.
  const availableTypes = questionTypesFor(useFeatureEnabled("expandedQuestionTypes"));

  const [typeSheetOpen, setTypeSheetOpen] = useState(false);
  const [listSheetOpen, setListSheetOpen] = useState(false);

  const active = questions[activeIndex];

  const addAndFocus = (type: QuestionType) => {
    onAddQuestion(type);
    onActiveIndexChange(questions.length); // new question lands at the end
    setTypeSheetOpen(false);
  };

  return (
    <div className="space-y-4">
      {locked && (
        <BuilderCard tone="warn">
          <div className="flex items-start gap-2.5">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <p className="text-[13px] leading-snug text-amber-900">
              This quiz has student attempts, so questions and answers are locked to preserve
              historical results. Duplicate it as a new draft to make changes.
            </p>
          </div>
        </BuilderCard>
      )}

      {/* Header: count + add */}
      <BuilderCard>
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-bold leading-tight text-slate-900">
              Questions ({questions.length})
            </h2>
            <p className="mt-0.5 text-[12.5px] text-slate-500">
              {questions.length === 0
                ? "Add your first question to get started."
                : "Tap a number to jump to a question."}
            </p>
          </div>
          {!locked && (
            <Sheet open={typeSheetOpen} onOpenChange={setTypeSheetOpen}>
              <SheetTrigger asChild>
                <Button
                  size="sm"
                  className="h-11 shrink-0 rounded-full bg-quiz-accent px-4 text-[13px] font-bold text-white hover:bg-quiz-accent-strong"
                >
                  <Plus className="mr-1 h-4 w-4" /> Add
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="rounded-t-3xl pb-[calc(env(safe-area-inset-bottom)+16px)]">
                <SheetHeader className="text-left">
                  <SheetTitle>Add a question</SheetTitle>
                </SheetHeader>
                <div className="mt-4 max-h-[62vh] space-y-2 overflow-y-auto">
                  {availableTypes.map((t) => (
                    <QuestionTypeOption
                      key={t.value}
                      label={t.label}
                      description={t.hint}
                      onClick={() => addAndFocus(t.value)}
                    />
                  ))}
                </div>
              </SheetContent>
            </Sheet>
          )}
        </div>

        {questions.length > 0 && (
          <div className="mt-3.5 flex items-center gap-2">
            {/* Horizontal chip navigator */}
            <div className="-mx-1 flex-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex gap-1.5">
                {questions.map((q, i) => {
                  const isActive = i === activeIndex;
                  const invalid = invalidIndexes.has(i);
                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => onActiveIndexChange(i)}
                      aria-label={`Question ${i + 1}${invalid ? " — needs attention" : ""}`}
                      aria-current={isActive ? "true" : undefined}
                      className={cn(
                        "relative h-11 w-11 shrink-0 rounded-2xl text-[14px] font-bold transition active:scale-95",
                        isActive
                          ? "bg-quiz-accent text-white shadow-[0_6px_16px_-6px_hsl(var(--quiz-accent))]"
                          : "bg-slate-100 text-slate-600",
                      )}
                    >
                      {i + 1}
                      {invalid && (
                        <span
                          aria-hidden
                          className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Overview bottom sheet */}
            <Sheet open={listSheetOpen} onOpenChange={setListSheetOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="All questions"
                  className="h-11 w-11 shrink-0 rounded-2xl"
                >
                  <ListOrdered className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="bottom"
                className="max-h-[80vh] overflow-y-auto rounded-t-3xl pb-[calc(env(safe-area-inset-bottom)+16px)]"
              >
                <SheetHeader className="text-left">
                  <SheetTitle>All questions ({questions.length})</SheetTitle>
                </SheetHeader>
                <ul className="mt-4 space-y-2">
                  {questions.map((q, i) => (
                    <li key={q.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onActiveIndexChange(i);
                          setListSheetOpen(false);
                        }}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition active:scale-[0.99]",
                          i === activeIndex
                            ? "border-quiz-accent/40 bg-quiz-tint"
                            : "border-slate-200 bg-white",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[13px] font-bold",
                            invalidIndexes.has(i)
                              ? "bg-rose-100 text-rose-700"
                              : "bg-slate-100 text-slate-600",
                          )}
                        >
                          {i + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-2 block text-[13.5px] font-semibold leading-snug text-slate-900">
                            {q.question.trim() || "Untitled question"}
                          </span>
                          <span className="mt-1 flex flex-wrap items-center gap-1.5">
                            <BuilderPill tone="neutral">
                              {QUESTION_TYPE_LABEL[q.question_type]}
                            </BuilderPill>
                            <BuilderPill tone="accent">{q.points} pts</BuilderPill>
                            {invalidIndexes.has(i) && (
                              <BuilderPill tone="danger" icon={<AlertCircle className="h-3 w-3" />}>
                                Needs attention
                              </BuilderPill>
                            )}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </SheetContent>
            </Sheet>
          </div>
        )}
      </BuilderCard>

      {/* Editor */}
      {questions.length === 0 ? (
        <BuilderEmptyState
          art={QUIZ_ART.owlGaming}
          title="No questions yet"
          description="Add your first question to start building this quiz."
          action={
            locked ? undefined : (
              <Button
                onClick={() => setTypeSheetOpen(true)}
                className="min-h-[44px] rounded-full bg-quiz-accent px-6 font-bold text-white hover:bg-quiz-accent-strong"
              >
                <Plus className="mr-1.5 h-4 w-4" /> Add question
              </Button>
            )
          }
        />
      ) : active ? (
        <QuestionEditor
          key={active.id}
          {...props}
          question={active}
          index={activeIndex}
          total={questions.length}
          availableTypes={availableTypes}
        />
      ) : null}
    </div>
  );
}

function QuestionTypeOption({
  label,
  description,
  onClick,
}: {
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left transition active:scale-[0.99]"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-slate-900">{label}</span>
        <span className="mt-0.5 block text-[12.5px] leading-snug text-slate-500">
          {description}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
    </button>
  );
}

type QuestionEditorProps = QuestionsStepProps & {
  question: QuestionDraft;
  index: number;
  total: number;
  availableTypes: ReturnType<typeof questionTypesFor>;
};

function QuestionEditor({
  question,
  index,
  total,
  availableTypes,
  locked,
  invalidIndexes,
  onActiveIndexChange,
  onPatchQuestion,
  onChangeType,
  onRemoveQuestion,
  onDuplicateQuestion,
  onMoveQuestion,
  onPatchOption,
  onSetCorrect,
  onAddOption,
  onRemoveOption,
}: QuestionEditorProps) {
  const isTrueFalse = question.question_type === "true_false";
  const isMulti = question.question_type === "multiple_select";
  const choice = isChoiceType(question.question_type);
  const noCorrect = choice && !question.options.some((o) => o.is_correct);
  const accepted = question.accepted_answers ?? [""];
  const patchAccepted = (next: string[]) =>
    onPatchQuestion(index, { accepted_answers: next.length ? next : [""] });
  const flagged = invalidIndexes.has(index);

  return (
    <BuilderSection
      title={`Question ${index + 1}`}
      description={QUESTION_TYPE_LABEL[question.question_type]}
      action={
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous question"
            disabled={index === 0}
            onClick={() => onActiveIndexChange(index - 1)}
            className="h-11 w-11 rounded-xl"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-[12px] font-semibold tabular-nums text-slate-500">
            {index + 1}/{total}
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next question"
            disabled={index === total - 1}
            onClick={() => onActiveIndexChange(index + 1)}
            className="h-11 w-11 rounded-xl"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {flagged && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-[12.5px] text-rose-900"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>This question needs attention before the quiz can be published.</span>
          </div>
        )}

        {/* Type + points */}
        <div className="grid grid-cols-2 gap-3">
          <BuilderField label="Type" htmlFor={`q-type-${question.id}`}>
            <select
              id={`q-type-${question.id}`}
              value={question.question_type}
              disabled={locked}
              onChange={(e) => onChangeType(index, e.target.value as QuestionType)}
              className={cn(
                "h-[46px] w-full rounded-2xl border border-slate-200 bg-white px-3 text-[13.5px] font-semibold text-slate-800",
                locked && "opacity-60",
              )}
            >
              {availableTypes.some((t) => t.value === question.question_type) ? null : (
                <option value={question.question_type}>
                  {QUESTION_TYPE_LABEL[question.question_type]}
                </option>
              )}
              {availableTypes.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </BuilderField>

          <BuilderField label="Points">
            <Input
              inputMode="numeric"
              pattern="[0-9]*"
              value={String(question.points)}
              disabled={locked}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^0-9]/g, "");
                onPatchQuestion(index, { points: raw === "" ? 0 : parseInt(raw, 10) });
              }}
              className="h-[46px] rounded-2xl text-center text-[15px] font-bold bg-white border-slate-200"
            />
          </BuilderField>
        </div>

        <BuilderField label="Question" htmlFor={`q-text-${question.id}`} required>
          <Textarea
            id={`q-text-${question.id}`}
            value={question.question}
            disabled={locked}
            onChange={(e) => onPatchQuestion(index, { question: e.target.value })}
            placeholder="What is the main pigment used in photosynthesis?"
            rows={3}
            className="rounded-2xl text-[15px] bg-white border-slate-200"
          />
        </BuilderField>

        {/* Answers */}
        {choice ? (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[13px] font-semibold text-slate-800">
              Answer options <span className="text-rose-500">*</span>
            </span>
            {noCorrect && (
              <BuilderPill tone="danger" icon={<AlertCircle className="h-3 w-3" />}>
                {isMulti ? "Pick the correct ones" : "Pick the correct one"}
              </BuilderPill>
            )}
          </div>

          <div className="space-y-2">
            {question.options.map((opt, oIdx) => {
              const correct = opt.is_correct;
              return (
                <div
                  key={opt.id}
                  className={cn(
                    "flex items-center gap-2 rounded-2xl border p-2 transition",
                    correct ? "border-quiz-correct/50 bg-emerald-50" : "border-slate-200 bg-white",
                  )}
                >
                  {/* Correct-answer selector — 44px touch target */}
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => onSetCorrect(index, oIdx)}
                    aria-label={`Mark option ${OPTION_LETTERS[oIdx] ?? oIdx + 1}${isMulti ? " correct or incorrect" : " correct"}`}
                    aria-pressed={correct}
                    className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[13px] font-black transition active:scale-95",
                      correct
                        ? "bg-quiz-correct text-white"
                        : "bg-slate-100 text-slate-500",
                      locked && "opacity-60",
                    )}
                  >
                    {correct ? (
                      <Check className="h-5 w-5" strokeWidth={3} />
                    ) : (
                      (OPTION_LETTERS[oIdx] ?? oIdx + 1)
                    )}
                  </button>

                  {isTrueFalse ? (
                    <span className="min-w-0 flex-1 px-1 text-[15px] font-semibold text-slate-800">
                      {opt.option_text}
                    </span>
                  ) : (
                    <Input
                      value={opt.option_text}
                      disabled={locked}
                      onChange={(e) =>
                        onPatchOption(index, oIdx, { option_text: e.target.value })
                      }
                      placeholder={`Option ${OPTION_LETTERS[oIdx] ?? oIdx + 1}`}
                      className="h-11 min-w-0 flex-1 rounded-xl border-0 bg-transparent px-1 text-[15px] shadow-none focus-visible:ring-0"
                    />
                  )}

                  {!isTrueFalse && !locked && question.options.length > 2 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove option ${OPTION_LETTERS[oIdx] ?? oIdx + 1}`}
                      onClick={() => onRemoveOption(index, oIdx)}
                      className="h-11 w-11 shrink-0 rounded-xl text-slate-400 hover:text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>

          {!isTrueFalse && !locked && question.options.length < MAX_OPTIONS && (
            <Button
              variant="outline"
              onClick={() => onAddOption(index)}
              className="mt-2 min-h-[44px] w-full rounded-2xl border-dashed text-[13px] font-semibold"
            >
              <Plus className="mr-1.5 h-4 w-4" /> Add option
            </Button>
          )}
          {isTrueFalse && (
            <p className="mt-2 text-[12px] text-slate-500">
              True/false questions always have exactly these two options.
            </p>
          )}
        </div>
        ) : question.question_type === "numeric" ? (
          <div className="space-y-3">
            <BuilderField label="Correct answer" htmlFor={`q-num-${question.id}`} required>
              <Input
                id={`q-num-${question.id}`}
                inputMode="decimal"
                value={question.numeric_answer ?? ""}
                disabled={locked}
                onChange={(e) =>
                  onPatchQuestion(index, {
                    numeric_answer: e.target.value.replace(/[^0-9.+-]/g, "").slice(0, 24),
                  })
                }
                placeholder="42"
                className="h-[46px] rounded-2xl border-slate-200 bg-white text-[15px] font-bold"
              />
            </BuilderField>
            <div className="grid grid-cols-2 gap-3">
              <BuilderField
                label="Tolerance"
                htmlFor={`q-tol-${question.id}`}
                hint="Accepts answers within ± this amount."
              >
                <Input
                  id={`q-tol-${question.id}`}
                  inputMode="decimal"
                  value={question.numeric_tolerance ?? "0"}
                  disabled={locked}
                  onChange={(e) =>
                    onPatchQuestion(index, {
                      numeric_tolerance: e.target.value.replace(/[^0-9.]/g, "").slice(0, 12),
                    })
                  }
                  className="h-[46px] rounded-2xl border-slate-200 bg-white text-[15px]"
                />
              </BuilderField>
              <BuilderField label="Unit" htmlFor={`q-unit-${question.id}`} hint="Optional label.">
                <Input
                  id={`q-unit-${question.id}`}
                  value={question.answer_unit ?? ""}
                  disabled={locked}
                  onChange={(e) =>
                    onPatchQuestion(index, { answer_unit: e.target.value.slice(0, 24) })
                  }
                  placeholder="cm"
                  className="h-[46px] rounded-2xl border-slate-200 bg-white text-[15px]"
                />
              </BuilderField>
            </div>
          </div>
        ) : (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[13px] font-semibold text-slate-800">
                Accepted answers <span className="text-rose-500">*</span>
              </span>
              <BuilderPill tone="neutral">Any one matches</BuilderPill>
            </div>
            <div className="space-y-2">
              {accepted.map((a, aIdx) => (
                <div key={aIdx} className="flex items-center gap-2">
                  <Input
                    value={a}
                    disabled={locked}
                    onChange={(e) => {
                      const next = accepted.slice();
                      next[aIdx] = e.target.value.slice(0, 200);
                      patchAccepted(next);
                    }}
                    placeholder={aIdx === 0 ? "Chlorophyll" : "Another accepted spelling"}
                    aria-label={`Accepted answer ${aIdx + 1}`}
                    className="h-11 min-w-0 flex-1 rounded-2xl border-slate-200 bg-white text-[15px]"
                  />
                  {!locked && accepted.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove accepted answer ${aIdx + 1}`}
                      onClick={() => patchAccepted(accepted.filter((_, i) => i !== aIdx))}
                      className="h-11 w-11 shrink-0 rounded-xl text-slate-400 hover:text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            {!locked && accepted.length < 8 && (
              <Button
                variant="outline"
                onClick={() => patchAccepted([...accepted, ""])}
                className="mt-2 min-h-[44px] w-full rounded-2xl border-dashed text-[13px] font-semibold"
              >
                <Plus className="mr-1.5 h-4 w-4" /> Add accepted answer
              </Button>
            )}
            <label className="mt-3 flex items-center gap-2 text-[12.5px] font-semibold text-slate-700">
              <input
                type="checkbox"
                disabled={locked}
                checked={question.answer_match_mode === "exact"}
                onChange={(e) =>
                  onPatchQuestion(index, {
                    answer_match_mode: e.target.checked ? "exact" : "ignore_case",
                  })
                }
                className="h-4 w-4 rounded border-slate-300"
              />
              Match capitalisation exactly
            </label>
          </div>
        )}

        <BuilderField
          label="Explanation"
          htmlFor={`q-exp-${question.id}`}
          hint="Shown with the result when students can see answers. Optional."
        >
          <div className="relative">
            <Textarea
              id={`q-exp-${question.id}`}
              value={question.explanation}
              maxLength={EXPLANATION_MAX}
              disabled={locked}
              onChange={(e) => onPatchQuestion(index, { explanation: e.target.value })}
              placeholder="Chlorophyll is the primary pigment that captures light energy."
              rows={2}
              className="rounded-2xl pb-7 text-[15px] bg-white border-slate-200"
            />
            <span className="pointer-events-none absolute bottom-2.5 right-3 text-[11px] font-medium tabular-nums text-slate-400">
              {question.explanation.length}/{EXPLANATION_MAX}
            </span>
          </div>
        </BuilderField>

        {/* Question actions */}
        {!locked && (
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
            <Button
              variant="outline"
              size="sm"
              disabled={index === 0}
              onClick={() => {
                onMoveQuestion(index, -1);
                onActiveIndexChange(index - 1);
              }}
              className="min-h-[44px] rounded-full text-[13px]"
            >
              <ArrowUp className="mr-1 h-3.5 w-3.5" /> Move up
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={index === total - 1}
              onClick={() => {
                onMoveQuestion(index, 1);
                onActiveIndexChange(index + 1);
              }}
              className="min-h-[44px] rounded-full text-[13px]"
            >
              <ArrowDown className="mr-1 h-3.5 w-3.5" /> Move down
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onDuplicateQuestion(index);
                onActiveIndexChange(index + 1);
              }}
              className="min-h-[44px] rounded-full text-[13px]"
            >
              <Copy className="mr-1 h-3.5 w-3.5" /> Duplicate
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onRemoveQuestion(index);
                onActiveIndexChange(Math.max(0, index - 1));
              }}
              className="min-h-[44px] rounded-full text-[13px] text-rose-600 hover:bg-rose-50 hover:text-rose-700"
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
            </Button>
          </div>
        )}
      </div>
    </BuilderSection>
  );
}

export default QuestionsStep;
