/**
 * Question Insights (tutor / admin, light mode).
 *
 * Accuracy, difficulty band and the answer distribution for every question,
 * with a focused card for the selected one. The correct option is shown —
 * `get_quiz_question_analytics` is already gated on `can_manage_class`, and
 * since Phase 2 revoked `quiz_options.is_correct` from the authenticated role,
 * this RPC is the canonical staff-side read of the answer key.
 *
 * "View student responses" opens a real list backed by
 * `get_quiz_question_responses`, not a placeholder.
 */
import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, Check, CheckCircle2, ChevronRight, Users, X,
} from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { QUIZ_ART } from "@/lib/quizArt";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/hooks/useAuth";
import {
  analyticsKeys, formatPct, getQuizQuestionAnalytics, getQuizQuestionResponses,
  mapAnalyticsError, type QuestionAnalytics,
} from "@/lib/quizAnalytics";
import {
  AccuracyBar, AnalyticsEmpty, AnalyticsError, AnalyticsShell, BandPill,
  FilterChips, Skel,
} from "@/components/quiz/analytics/AnalyticsChrome";

type Filter = "all" | "difficult" | "strong";
const LETTERS = "ABCDEFGH";

export function QuizQuestionInsights({ variant }: { variant: "tutor" | "admin" }) {
  const { classId, quizId } = useParams<{ classId: string; quizId: string }>();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { currentTenantId } = useTenant();
  const { user } = useAuth();
  const base = variant === "admin" ? `/admin/classes/${classId}` : `/tutor/classes/${classId}`;

  const [filter, setFilter] = useState<Filter>("all");
  const [responsesFor, setResponsesFor] = useState<QuestionAnalytics | null>(null);

  const q = useQuery({
    queryKey: analyticsKeys.questions(currentTenantId, quizId ?? ""),
    enabled: !!quizId && !!user,
    queryFn: () => getQuizQuestionAnalytics(quizId!),
    staleTime: 30_000,
  });

  // Memoised so the `?? []` fallback doesn't mint a new array each render and
  // invalidate every downstream useMemo.
  const all = useMemo(() => q.data?.questions ?? [], [q.data]);
  const selectedId = params.get("q");
  const focused = useMemo(
    () => all.find((x) => x.question_id === selectedId) ?? all[0] ?? null,
    [all, selectedId],
  );

  const filtered = useMemo(() => {
    // With no filter the list is "the other questions", since the focused one
    // is already expanded above. With a filter active the list is the whole
    // matching set — excluding the focused card there once produced "No
    // difficult questions" on a quiz whose only difficult question was the one
    // being displayed.
    if (filter === "all") return all.filter((x) => x.question_id !== focused?.question_id);
    return all.filter((x) => x.band === filter);
  }, [all, filter, focused]);

  const responses = useQuery({
    queryKey: analyticsKeys.responses(
      currentTenantId, quizId ?? "", responsesFor?.question_id ?? "",
    ),
    enabled: !!quizId && !!responsesFor,
    queryFn: () => getQuizQuestionResponses(quizId!, responsesFor!.question_id),
    staleTime: 30_000,
  });

  if (q.isError) {
    return (
      <AnalyticsShell title="Question Insights" backTo={`${base}/quizzes/${quizId}/analytics`}>
        <AnalyticsError message={mapAnalyticsError(q.error)} onRetry={() => void q.refetch()} />
      </AnalyticsShell>
    );
  }

  return (
    <AnalyticsShell title="Question Insights" backTo={`${base}/quizzes/${quizId}/analytics`}>
      <FilterChips<Filter>
        label="Filter questions by difficulty"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "All" },
          { value: "difficult", label: "Difficult", icon: <AlertTriangle className="h-4 w-4" aria-hidden="true" /> },
          { value: "strong", label: "Strong", icon: <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> },
        ]}
      />

      {q.isLoading ? (
        <div className="mt-4 space-y-3">
          <Skel className="h-[320px] rounded-3xl" />
          <Skel className="h-[86px] rounded-3xl" />
          <Skel className="h-[86px] rounded-3xl" />
        </div>
      ) : all.length === 0 ? (
        <div className="mt-4">
          <AnalyticsEmpty
            art={QUIZ_ART.owlSad}
            title="No questions to analyse"
            body="This quiz has no questions yet, so there is nothing to report on."
          />
        </div>
      ) : (
        <>
          {focused && (
            <section
              className="mt-4 rounded-3xl border border-slate-200/80 bg-white p-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)]"
              aria-label={`Question ${focused.index + 1} detail`}
            >
              <div className="flex items-center gap-2">
                <span className="flex h-7 shrink-0 items-center rounded-lg bg-rose-100 px-2 text-[11.5px] font-black text-rose-600">
                  Q{focused.index + 1}
                </span>
                <p className="min-w-0 flex-1 truncate text-[15px] font-extrabold text-slate-900">
                  Question {focused.index + 1}
                </p>
                <BandPill band={focused.band} />
              </div>

              <div className="mt-3 flex items-start gap-3.5">
                {/* Accuracy dial. The number inside it is real text, so the
                    figure is never only available as a drawing. */}
                <div className="relative h-[92px] w-[92px] shrink-0">
                  <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
                    <circle cx="50" cy="50" r="42" fill="none" stroke="hsl(220 20% 92%)" strokeWidth="10" />
                    <circle
                      cx="50" cy="50" r="42" fill="none" strokeWidth="10" strokeLinecap="round"
                      stroke={
                        focused.band === "difficult" ? "hsl(32 95% 55%)"
                          : focused.band === "strong" ? "hsl(158 64% 44%)"
                            : "hsl(258 85% 62%)"
                      }
                      strokeDasharray={`${(focused.accuracy_pct ?? 0) * 2.639} 999`}
                    />
                  </svg>
                  <span className="absolute inset-0 flex flex-col items-center justify-center">
                    <span
                      className={cn(
                        "text-[21px] font-extrabold leading-none tabular-nums",
                        focused.band === "difficult" ? "text-amber-600"
                          : focused.band === "strong" ? "text-emerald-600" : "text-quiz-accent-strong",
                      )}
                    >
                      {formatPct(focused.accuracy_pct)}
                    </span>
                    <span className="mt-0.5 text-[11px] font-semibold text-slate-500">Accuracy</span>
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-[14.5px] font-bold leading-snug text-slate-900">
                    {focused.question}
                  </p>
                  <p className="mt-1.5 inline-flex items-center gap-1.5 text-[12.5px] text-slate-500">
                    <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {focused.incorrect} of {focused.answered} got this wrong
                  </p>
                </div>
              </div>

              {focused.options.length > 0 ? (
                <ul className="mt-3.5 space-y-2">
                  {focused.options.map((o, i) => (
                    <li
                      key={o.option_id}
                      className={cn(
                        "rounded-2xl border px-3 py-2.5",
                        o.is_correct ? "border-emerald-200 bg-emerald-50/70" : "border-slate-200 bg-white",
                      )}
                    >
                      <div className="flex items-center gap-2.5">
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
                            "min-w-0 flex-1 truncate text-[13.5px]",
                            o.is_correct ? "font-bold text-emerald-900" : "text-slate-700",
                          )}
                        >
                          {o.text}
                        </span>
                        <span className="shrink-0 text-[13px] font-black tabular-nums text-slate-800">
                          {formatPct(o.pct)}
                        </span>
                        {o.is_correct && (
                          <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                        )}
                      </div>
                      <AccuracyBar
                        className="mt-1.5"
                        pct={o.pct}
                        tone={o.is_correct ? "good" : "accent"}
                      />
                      <span className="sr-only">
                        {o.text}: {o.count} of {focused.answered} students, {formatPct(o.pct)}
                        {o.is_correct ? ", correct answer" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 rounded-2xl bg-slate-50 px-3 py-3 text-[12.5px] text-slate-500">
                  This question type has no fixed options, so there is no answer distribution to show.
                </p>
              )}

              <Button
                onClick={() => setResponsesFor(focused)}
                className="mt-3.5 min-h-[48px] w-full rounded-full bg-gradient-to-r from-violet-600 to-quiz-accent text-[15px] font-extrabold text-white"
              >
                View student responses
                <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
              </Button>
            </section>
          )}

          {filtered.length === 0 ? (
            <div className="mt-4">
              <AnalyticsEmpty
                art={QUIZ_ART.completionCheck}
                title={
                  filter === "difficult" ? "No difficult questions"
                    : filter === "strong" ? "No questions in the strong band yet"
                      : "No other questions"
                }
                body={
                  filter === "difficult"
                    ? "Nothing fell below the difficulty threshold — the class handled these well."
                    : filter === "strong"
                      ? "No question has reached the strong-accuracy threshold yet."
                      : "Every other question is already shown above."
                }
              />
            </div>
          ) : (
            <ul className="mt-4 space-y-2">
              {filtered.map((x) => (
                <li key={x.question_id}>
                  <button
                    type="button"
                    onClick={() => setParams({ q: x.question_id }, { replace: true })}
                    className="flex w-full items-start gap-2.5 rounded-2xl border border-slate-200/80 bg-white p-3 text-left shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition active:scale-[0.99]"
                  >
                    <span className="flex h-7 shrink-0 items-center rounded-lg bg-quiz-tint px-2 text-[11.5px] font-black text-quiz-accent-strong">
                      Q{x.index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-[13.5px] font-bold leading-snug text-slate-900">
                        {x.question}
                      </span>
                      <span className="mt-1 flex items-center gap-1.5 text-[12px] text-slate-500">
                        <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        {x.correct} of {x.answered} correct
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span
                        className={cn(
                          "block text-[16px] font-extrabold leading-none tabular-nums",
                          x.band === "difficult" ? "text-amber-600"
                            : x.band === "strong" ? "text-emerald-600" : "text-slate-700",
                        )}
                      >
                        {formatPct(x.accuracy_pct)}
                      </span>
                      <span className="mt-0.5 block text-[11px] font-semibold text-slate-500">
                        Accuracy
                      </span>
                    </span>
                    {x.band === "difficult" ? (
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
                    ) : x.band === "strong" ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {/* Student responses for one question */}
      <Sheet open={!!responsesFor} onOpenChange={(open) => !open && setResponsesFor(null)}>
        <SheetContent
          side="bottom"
          className="max-h-[86vh] overflow-y-auto rounded-t-[28px] pb-[calc(env(safe-area-inset-bottom)+16px)]"
        >
          <SheetHeader className="text-left">
            <SheetTitle className="pr-8 text-[17px] font-extrabold">
              Student responses
            </SheetTitle>
          </SheetHeader>
          {responsesFor && (
            <p className="mt-1 text-[13px] leading-snug text-slate-600">{responsesFor.question}</p>
          )}
          {responses.isLoading ? (
            <div className="mt-4 space-y-2">
              <Skel className="h-[58px] rounded-2xl" />
              <Skel className="h-[58px] rounded-2xl" />
              <Skel className="h-[58px] rounded-2xl" />
            </div>
          ) : responses.isError ? (
            <div className="mt-4">
              <AnalyticsError
                message={mapAnalyticsError(responses.error, "Couldn't load responses.")}
                onRetry={() => void responses.refetch()}
              />
            </div>
          ) : (responses.data?.responses.length ?? 0) === 0 ? (
            <div className="mt-4">
              <AnalyticsEmpty
                art={QUIZ_ART.hourglass}
                title="No responses yet"
                body="Nobody has answered this question."
              />
            </div>
          ) : (
            <ul className="mt-4 space-y-2">
              {responses.data!.responses.map((r) => (
                <li
                  key={r.user_id}
                  className={cn(
                    "flex items-center gap-2.5 rounded-2xl border px-3 py-2.5",
                    r.is_correct ? "border-emerald-200 bg-emerald-50/60" : "border-slate-200 bg-white",
                  )}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-[12px] font-bold text-slate-600">
                    {r.avatar_url
                      ? <img src={r.avatar_url} alt="" className="h-full w-full object-cover" />
                      : r.display_name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-bold text-slate-900">
                      {r.display_name}
                    </span>
                    <span className="block truncate text-[12px] text-slate-500">
                      {r.answered
                        ? (r.selected_option_text ?? r.selected_answer ?? "Answered")
                        : "No answer"}
                    </span>
                  </span>
                  {r.is_correct ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-label="Correct" />
                  ) : (
                    <X className="h-5 w-5 shrink-0 text-rose-500" aria-label="Incorrect" />
                  )}
                </li>
              ))}
            </ul>
          )}
        </SheetContent>
      </Sheet>
    </AnalyticsShell>
  );
}

export default QuizQuestionInsights;
