/**
 * Student Report (tutor / admin, light mode).
 *
 * One student's result for one quiz, with the full question breakdown.
 *
 * The reference design shows "Strong Areas" and "Needs Review" topic chips.
 * The canonical quiz schema has no topic or chapter field on a question, so
 * those sections are NOT rendered: inferring a topic from question text and
 * presenting it as curriculum metadata would be a fabrication. They become
 * available once questions carry a real `topic`, which the Question Bank
 * introduces — the breakdown below already groups by what genuinely exists.
 */
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Check, Clock, ClipboardList, Target, Trophy, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { QUIZ_ART } from "@/lib/quizArt";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/hooks/useAuth";
import {
  analyticsKeys, formatSeconds, getStudentQuizReport, mapAnalyticsError,
} from "@/lib/quizAnalytics";
import {
  AccuracyBar, AnalyticsEmpty, AnalyticsError, AnalyticsShell, Skel,
} from "@/components/quiz/analytics/AnalyticsChrome";
import { BuilderArt } from "@/components/quiz/builder/QuizBuilderChrome";

export function QuizStudentReport({ variant }: { variant: "tutor" | "admin" }) {
  const { classId, quizId, userId } = useParams<{
    classId: string; quizId: string; userId: string;
  }>();
  const { currentTenantId } = useTenant();
  const { user } = useAuth();
  const base = variant === "admin" ? `/admin/classes/${classId}` : `/tutor/classes/${classId}`;
  const backTo = `${base}/quizzes/${quizId}/analytics/students`;

  const q = useQuery({
    queryKey: analyticsKeys.report(currentTenantId, quizId ?? "", userId ?? ""),
    enabled: !!quizId && !!userId && !!user,
    queryFn: () => getStudentQuizReport(quizId!, userId!),
    staleTime: 30_000,
  });

  if (q.isError) {
    const msg = mapAnalyticsError(q.error);
    const noResult = String((q.error as { message?: string })?.message ?? "")
      .includes("no_result_for_student");
    return (
      <AnalyticsShell title="Student Report" backTo={backTo}>
        {noResult ? (
          <AnalyticsEmpty
            art={QUIZ_ART.hourglass}
            title="No result yet"
            body="This student hasn't completed the quiz, so there's nothing to report on."
          />
        ) : (
          <AnalyticsError message={msg} onRetry={() => void q.refetch()} />
        )}
      </AnalyticsShell>
    );
  }

  const d = q.data;
  const correct = d?.breakdown.filter((b) => b.is_correct).length ?? 0;

  return (
    <AnalyticsShell title="Student Report" backTo={backTo}>
      {q.isLoading || !d ? (
        <div className="space-y-3">
          <Skel className="h-[150px] rounded-3xl" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Skel className="h-[92px] rounded-3xl" />
            <Skel className="h-[92px] rounded-3xl" />
            <Skel className="h-[92px] rounded-3xl" />
            <Skel className="h-[92px] rounded-3xl" />
          </div>
          <Skel className="h-[220px] rounded-3xl" />
        </div>
      ) : (
        <>
          <div className="rounded-3xl border border-quiz-accent/20 bg-quiz-tint p-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
            <div className="flex items-center gap-3">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white text-[18px] font-bold text-slate-600 ring-2 ring-white">
                {d.student?.avatar_url
                  ? <img src={d.student.avatar_url} alt="" className="h-full w-full object-cover" />
                  : (d.student?.display_name ?? "S").slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-[19px] font-extrabold leading-tight text-slate-900">
                  {d.student?.display_name ?? "Student"}
                </h2>
                <p className="mt-0.5 truncate text-[13px] text-slate-600">{d.quiz_title}</p>
              </div>
              <BuilderArt src={QUIZ_ART.owlGamingCompact} className="hidden h-16 w-16 shrink-0 sm:block" />
            </div>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { k: "Accuracy", v: `${d.result.accuracy_pct}%`, icon: <Target className="h-4 w-4" />, tone: "bg-emerald-100 text-emerald-600" },
              { k: "Rank", v: `#${d.result.rank}`, icon: <Trophy className="h-4 w-4" />, tone: "bg-violet-100 text-violet-600" },
              { k: "Score", v: `${d.result.score} / ${d.result.total_questions}`, icon: <ClipboardList className="h-4 w-4" />, tone: "bg-sky-100 text-sky-600" },
              { k: "Avg time", v: formatSeconds(d.result.avg_seconds_per_question), icon: <Clock className="h-4 w-4" />, tone: "bg-amber-100 text-amber-600" },
            ].map((x) => (
              <div
                key={x.k}
                className="rounded-3xl border border-slate-200/80 bg-white p-3 shadow-[0_8px_30px_rgb(0,0,0,0.04)]"
              >
                <span className={cn("flex h-8 w-8 items-center justify-center rounded-xl", x.tone)} aria-hidden="true">
                  {x.icon}
                </span>
                <dd className="mt-2 text-[18px] font-extrabold leading-none tracking-[-0.01em] text-slate-900">
                  {x.v}
                </dd>
                <dt className="mt-1 text-[11.5px] font-semibold text-slate-500">{x.k}</dt>
              </div>
            ))}
          </dl>

          <div className="mt-4 rounded-3xl border border-slate-200/80 bg-white p-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[15px] font-extrabold text-slate-900">Performance</p>
              <p className="text-[14px] font-extrabold tabular-nums text-slate-900">
                {d.result.score}
                <span className="text-[12.5px] font-bold text-slate-400"> / {d.result.total_questions}</span>
              </p>
            </div>
            <AccuracyBar
              className="mt-2"
              pct={d.result.accuracy_pct}
              tone={d.result.accuracy_pct >= 80 ? "good" : d.result.accuracy_pct < 50 ? "warn" : "accent"}
            />
            <p className="mt-1.5 text-right text-[12.5px] font-bold text-slate-600">
              {d.result.accuracy_pct}%
            </p>
          </div>

          <div className="mt-4 rounded-3xl border border-slate-200/80 bg-white p-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
            <p className="text-[15px] font-extrabold text-slate-900">Question breakdown</p>
            <p className="mt-0.5 text-[12.5px] text-slate-500">
              {correct} of {d.breakdown.length} answered correctly
            </p>
            <ul className="mt-3 divide-y divide-slate-100">
              {d.breakdown.map((b) => (
                <li key={b.question_id} className="flex items-start gap-2.5 py-2.5">
                  <span className="flex h-7 shrink-0 items-center rounded-lg bg-quiz-tint px-2 text-[11.5px] font-black text-quiz-accent-strong">
                    Q{b.index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-[13.5px] leading-snug text-slate-800">
                      {b.question}
                    </span>
                    {b.answered && (b.selected_option_id || b.selected_answer) && (
                      <span className="mt-0.5 block truncate text-[12px] text-slate-500">
                        Answered · {b.points_awarded} pt{b.points_awarded === 1 ? "" : "s"}
                      </span>
                    )}
                    {!b.answered && (
                      <span className="mt-0.5 block text-[12px] text-slate-400">No answer</span>
                    )}
                  </span>
                  <span
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11.5px] font-bold",
                      b.is_correct ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700",
                    )}
                  >
                    {b.is_correct
                      ? <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      : <X className="h-3.5 w-3.5" aria-hidden="true" />}
                    {b.is_correct ? "Correct" : "Incorrect"}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* No "Strong Areas / Needs Review" block: the schema has no topic
              metadata, and inferring one from question text would present a
              guess as curriculum data. */}
        </>
      )}
    </AnalyticsShell>
  );
}

export default QuizStudentReport;
