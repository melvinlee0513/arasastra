/**
 * Question detail (tutor / admin, light mode).
 *
 * Shows the question, its options with the correct one marked, the explanation,
 * and where it is used. Every action works: Edit opens the editor, Duplicate
 * creates a real copy, Archive hides it from search without touching the
 * quizzes it was copied into.
 *
 * "Used in" lists quizzes that contain a COPY of this question. Editing here
 * does not change any of them — that is the point of the snapshot.
 */
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive, ArchiveRestore, Check, ChevronRight, Copy, Lightbulb, Loader2,
  MoreVertical, Pencil,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { QUIZ_ART } from "@/lib/quizArt";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/hooks/useAuth";
import {
  archiveBankQuestion, bankKeys, duplicateBankQuestions, getBankQuestion,
  mapBankError, typeLabel, usageLabel,
} from "@/lib/questionBank";
import {
  AnalyticsEmpty, AnalyticsError, AnalyticsShell, Skel,
} from "@/components/quiz/analytics/AnalyticsChrome";

const LETTERS = "ABCDEFGH";

export function QuestionBankDetail({ variant }: { variant: "tutor" | "admin" }) {
  const { questionId } = useParams<{ questionId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { currentTenantId } = useTenant();
  const { user } = useAuth();
  const root = variant === "admin" ? "/admin/question-bank" : "/tutor/question-bank";

  const q = useQuery({
    queryKey: bankKeys.question(currentTenantId, questionId ?? ""),
    enabled: !!questionId && !!user,
    queryFn: () => getBankQuestion(questionId!),
    staleTime: 15_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["question-bank"] });

  const dup = useMutation({
    mutationFn: () => duplicateBankQuestions([questionId!]),
    onSuccess: (res) => {
      toast.success("Question duplicated.");
      invalidate();
      if (res.ids?.[0]) navigate(`${root}/questions/${res.ids[0]}`);
    },
    onError: (err) => toast.error(mapBankError(err, "Couldn't duplicate.")),
  });

  const arch = useMutation({
    mutationFn: (archived: boolean) => archiveBankQuestion(questionId!, archived),
    onSuccess: (res) => {
      toast.success(res.archived ? "Question archived." : "Question restored.");
      invalidate();
    },
    onError: (err) => toast.error(mapBankError(err, "Couldn't change that.")),
  });

  if (q.isError) {
    return (
      <AnalyticsShell title="Question" backTo={`${root}/questions`}>
        <AnalyticsEmpty
          art={QUIZ_ART.owlSad}
          title="Question unavailable"
          body={mapBankError(q.error, "That question is no longer available.")}
          action={
            <Button className="min-h-[44px] rounded-full" onClick={() => navigate(`${root}/questions`)}>
              Back to questions
            </Button>
          }
        />
      </AnalyticsShell>
    );
  }

  const d = q.data;

  return (
    <AnalyticsShell
      title="Question"
      backTo={`${root}/questions`}
      action={
        d && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Question actions"
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition active:scale-95"
              >
                <MoreVertical className="h-4 w-4" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => dup.mutate()} disabled={dup.isPending}>
                <Copy className="mr-2 h-4 w-4" aria-hidden="true" /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => arch.mutate(!d.archived)}
                disabled={arch.isPending}
              >
                {d.archived ? (
                  <><ArchiveRestore className="mr-2 h-4 w-4" aria-hidden="true" /> Restore</>
                ) : (
                  <><Archive className="mr-2 h-4 w-4" aria-hidden="true" /> Archive</>
                )}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      }
    >
      {q.isLoading || !d ? (
        <div className="space-y-3">
          <Skel className="h-[44px] rounded-2xl" />
          <Skel className="h-[280px] rounded-3xl" />
          <Skel className="h-[160px] rounded-3xl" />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-quiz-tint px-2.5 py-1 text-[11.5px] font-black text-quiz-accent-strong">
              {typeLabel(d.question_type)}
            </span>
            {d.subject_name && (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11.5px] font-semibold text-slate-600">
                {d.subject_name}
              </span>
            )}
            {d.topic && (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11.5px] font-semibold text-slate-600">
                {d.topic}
              </span>
            )}
            {d.archived && (
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11.5px] font-semibold text-amber-800">
                Archived
              </span>
            )}
          </div>

          <section className="mt-3 rounded-3xl border border-slate-200/80 bg-white p-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
            <h2 className="text-[16px] font-extrabold leading-snug text-slate-900">{d.question}</h2>
            <p className="mt-1 text-[12.5px] text-slate-500">
              {d.points} point{d.points === 1 ? "" : "s"}
            </p>

            {d.options.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {d.options.map((o, i) => (
                  <li
                    key={o.id}
                    className={cn(
                      "flex items-center gap-2.5 rounded-2xl border px-3 py-2.5",
                      o.is_correct ? "border-emerald-200 bg-emerald-50/70" : "border-slate-200 bg-white",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[12px] font-black",
                        o.is_correct ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600",
                      )}
                    >
                      {LETTERS[i] ?? i + 1}
                    </span>
                    <span
                      className={cn(
                        "min-w-0 flex-1 break-words text-[13.5px]",
                        o.is_correct ? "font-bold text-emerald-900" : "text-slate-700",
                      )}
                    >
                      {o.option_text}
                    </span>
                    {o.is_correct && (
                      <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-label="Correct answer" />
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 rounded-2xl bg-slate-50 px-3 py-3 text-[12.5px] text-slate-500">
                This question has no options stored.
              </p>
            )}

            {d.explanation && (
              <div className="mt-3 flex items-start gap-2.5 rounded-2xl bg-quiz-tint p-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-quiz-accent-strong">
                  <Lightbulb className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-bold text-slate-900">Explanation</span>
                  <span className="mt-0.5 block text-[12.5px] leading-snug text-slate-700">
                    {d.explanation}
                  </span>
                </span>
              </div>
            )}
          </section>

          <section className="mt-4 rounded-3xl border border-slate-200/80 bg-white p-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-[15px] font-extrabold text-slate-900">Used in</h3>
              <p className="text-[12.5px] font-semibold text-slate-500">{usageLabel(d.usage_count)}</p>
            </div>
            {d.used_in.length === 0 ? (
              <p className="mt-2 text-[12.5px] leading-snug text-slate-500">
                Not added to any quiz yet. Select it in the question list to add a copy to one.
              </p>
            ) : (
              <>
                <ul className="mt-2.5 divide-y divide-slate-100">
                  {d.used_in.map((u) => (
                    <li key={u.quiz_id}>
                      <button
                        type="button"
                        onClick={() =>
                          navigate(`/${variant}/classes/${u.class_id}/quizzes/${u.quiz_id}/edit`)
                        }
                        className="flex min-h-[52px] w-full items-center gap-2.5 py-2 text-left"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] font-bold text-slate-900">
                            {u.title}
                          </span>
                          <span className="block text-[11.5px] text-slate-500">
                            {u.question_count} question{u.question_count === 1 ? "" : "s"}
                          </span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[11.5px] leading-snug text-slate-500">
                  Those quizzes hold their own copy. Editing this question won't change them.
                </p>
              </>
            )}
          </section>

          <div className="sticky bottom-0 z-30 -mx-4 mt-6 border-t border-slate-200/70 bg-[hsl(250_40%_98%)]/95 px-4 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-3 backdrop-blur sm:-mx-6 sm:px-6">
            <Button
              onClick={() => navigate(`${root}/questions/${d.id}/edit`)}
              className="min-h-[52px] w-full rounded-full bg-gradient-to-r from-violet-600 to-quiz-accent text-[15.5px] font-extrabold text-white"
            >
              <Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" /> Edit question
            </Button>
          </div>
        </>
      )}
    </AnalyticsShell>
  );
}

export default QuestionBankDetail;
