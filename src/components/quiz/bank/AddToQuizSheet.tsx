/**
 * Add selected bank questions to a quiz.
 *
 * The server copies each question; it does not link it. That is what stops a
 * later edit to the bank rewriting a quiz a class has already sat, and it is
 * why this sheet says "added", not "linked".
 *
 * The add is idempotent per (quiz, bank question), so a double tap adds nothing
 * the second time — the result reports skipped separately and the success
 * screen says so honestly rather than claiming a second batch was added.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, ChevronRight, Loader2 } from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { QUIZ_ART } from "@/lib/quizArt";
import { useTenant } from "@/contexts/TenantContext";
import {
  addBankQuestionsToQuiz, bankKeys, listQuizzesForBank, mapBankError,
  type BankQuizTarget,
} from "@/lib/questionBank";
import { BuilderArt } from "@/components/quiz/builder/QuizBuilderChrome";
import { AnalyticsEmpty, AnalyticsError, Skel } from "@/components/quiz/analytics/AnalyticsChrome";

export function AddToQuizSheet({
  open,
  onOpenChange,
  questionIds,
  onAdded,
  variant,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  questionIds: string[];
  /** Called after a successful add so the caller can clear its selection. */
  onAdded?: () => void;
  variant: "tutor" | "admin";
}) {
  const navigate = useNavigate();
  const { currentTenantId } = useTenant();
  const [chosen, setChosen] = useState<string | null>(null);
  const [done, setDone] = useState<{ added: number; skipped: number; quiz: BankQuizTarget } | null>(null);

  const quizzes = useQuery({
    queryKey: bankKeys.quizTargets(currentTenantId),
    enabled: open,
    queryFn: listQuizzesForBank,
    staleTime: 30_000,
  });

  const add = useMutation({
    mutationFn: () => addBankQuestionsToQuiz({ quizId: chosen!, questionIds }),
    onSuccess: (res) => {
      const quiz = (quizzes.data ?? []).find((z) => z.id === chosen);
      if (quiz) setDone({ added: res.added, skipped: res.skipped, quiz });
      onAdded?.();
    },
    onError: (err) => toast.error(mapBankError(err, "Couldn't add those questions.")),
  });

  function close() {
    onOpenChange(false);
    // Reset only after the sheet has animated away.
    setTimeout(() => { setDone(null); setChosen(null); }, 250);
  }

  const n = questionIds.length;

  return (
    <Sheet open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <SheetContent
        side="bottom"
        className="max-h-[88vh] overflow-y-auto rounded-t-[28px] pb-[calc(env(safe-area-inset-bottom)+16px)]"
      >
        {done ? (
          <>
            <SheetHeader className="text-left">
              <SheetTitle className="pr-8 text-[18px] font-extrabold">
                {done.added > 0 ? "Added!" : "Already in this quiz"}
              </SheetTitle>
            </SheetHeader>
            <div className="mt-3 rounded-3xl border border-emerald-200 bg-emerald-50/70 p-4 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500">
                <Check className="h-6 w-6 text-white" aria-hidden="true" />
              </span>
              <p className="mt-2.5 text-[14.5px] font-bold text-emerald-900">
                {done.added > 0
                  ? `${done.added} question${done.added === 1 ? "" : "s"} added to ${done.quiz.title}.`
                  : `Nothing to add — ${done.skipped === 1 ? "that question is" : "those questions are"} already in ${done.quiz.title}.`}
              </p>
              {done.added > 0 && done.skipped > 0 && (
                <p className="mt-1 text-[12.5px] text-emerald-800">
                  {done.skipped} {done.skipped === 1 ? "was" : "were"} already there and {done.skipped === 1 ? "was" : "were"} skipped.
                </p>
              )}
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Button
                onClick={() => {
                  close();
                  navigate(
                    `/${variant}/classes/${done.quiz.class_id}/quizzes/${done.quiz.id}/edit`,
                  );
                }}
                className="min-h-[48px] shrink-0 rounded-full bg-gradient-to-r from-violet-600 to-quiz-accent text-[15px] font-extrabold text-white sm:flex-1"
              >
                View quiz
                <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                variant="outline"
                onClick={close}
                className="min-h-[48px] shrink-0 rounded-full border-slate-200 text-[15px] font-bold sm:flex-1"
              >
                Keep browsing
              </Button>
            </div>
          </>
        ) : (
          <>
            <SheetHeader className="text-left">
              <SheetTitle className="pr-8 text-[18px] font-extrabold">Add to quiz</SheetTitle>
            </SheetHeader>

            <div className="mt-3 flex items-center gap-3 rounded-3xl border border-quiz-accent/20 bg-quiz-tint p-3.5">
              <div className="min-w-0 flex-1">
                <p className="text-[14.5px] font-extrabold text-slate-900">
                  {n} question{n === 1 ? "" : "s"} selected
                </p>
                <p className="mt-0.5 text-[12.5px] leading-snug text-slate-600">
                  A copy is added to the quiz. Editing the original later won't change it.
                </p>
              </div>
              <BuilderArt src={QUIZ_ART.owlGamingCompact} className="h-14 w-14 shrink-0" />
            </div>

            <p className="mb-2 mt-4 text-[13px] font-bold text-slate-800">Choose a quiz</p>

            {quizzes.isLoading ? (
              <div className="space-y-2">
                <Skel className="h-[68px] rounded-2xl" />
                <Skel className="h-[68px] rounded-2xl" />
                <Skel className="h-[68px] rounded-2xl" />
              </div>
            ) : quizzes.isError ? (
              <AnalyticsError
                message={mapBankError(quizzes.error, "Couldn't load your quizzes.")}
                onRetry={() => void quizzes.refetch()}
              />
            ) : (quizzes.data?.length ?? 0) === 0 ? (
              <AnalyticsEmpty
                art={QUIZ_ART.hourglass}
                title="No quizzes to add to"
                body="Create a quiz in a class you manage, then come back and add questions to it."
              />
            ) : (
              <ul role="radiogroup" aria-label="Choose a quiz" className="space-y-2">
                {quizzes.data!.map((z) => {
                  const selected = z.id === chosen;
                  return (
                    <li key={z.id}>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setChosen(z.id)}
                        className={cn(
                          "flex min-h-[68px] w-full items-center gap-3 rounded-2xl border p-3 text-left transition active:scale-[0.99]",
                          selected ? "border-quiz-accent bg-quiz-tint" : "border-slate-200 bg-white",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                            selected ? "border-quiz-accent" : "border-slate-300",
                          )}
                          aria-hidden="true"
                        >
                          {selected && <span className="h-2.5 w-2.5 rounded-full bg-quiz-accent" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14.5px] font-bold text-slate-900">
                            {z.title}
                          </span>
                          <span className="mt-0.5 block truncate text-[12px] text-slate-500">
                            {[z.subject_name, z.class_title].filter(Boolean).join(" · ")} ·{" "}
                            {z.question_count} question{z.question_count === 1 ? "" : "s"}
                          </span>
                        </span>
                        {z.status === "draft" && (
                          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
                            Draft
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            <Button
              onClick={() => add.mutate()}
              disabled={!chosen || add.isPending || n === 0}
              className="mt-4 min-h-[52px] w-full rounded-full bg-gradient-to-r from-violet-600 to-quiz-accent text-[15.5px] font-extrabold text-white"
            >
              {add.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Add {n} question{n === 1 ? "" : "s"}
            </Button>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default AddToQuizSheet;
