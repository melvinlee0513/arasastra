/**
 * Quiz Analytics — overview (tutor / admin, light mode).
 *
 * Every number is served by `get_quiz_analytics_overview` and
 * `get_quiz_question_analytics`. Nothing is averaged, ranked or classified in
 * the browser, and nothing is shown that the data cannot support:
 *
 *  - there is no "average score over time" line, because a quiz produces one
 *    graded result per attempt, not a time series. The score distribution is
 *    what the data actually is;
 *  - average time is labelled "per question, across the attempt", because
 *    student_quiz_answers carries no per-question timing;
 *  - Export writes a real CSV. There is no PDF button, because there is no PDF
 *    pipeline.
 */
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3, CheckCircle2, ChevronRight, Clock, Download, Loader2, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { QUIZ_ART } from "@/lib/quizArt";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/hooks/useAuth";
import {
  analyticsKeys, csvFilename, downloadCsv, formatPct, formatSeconds,
  getQuizAnalyticsOverview, getQuizQuestionAnalytics, getQuizStudentAnalytics,
  mapAnalyticsError, studentsToCsv,
} from "@/lib/quizAnalytics";
import {
  AccuracyBar, AnalyticsEmpty, AnalyticsError, AnalyticsShell, BandPill,
  QuizContextCard, SectionHeader, Skel, StatCard,
} from "@/components/quiz/analytics/AnalyticsChrome";

export function QuizAnalyticsOverview({ variant }: { variant: "tutor" | "admin" }) {
  const { classId, quizId } = useParams<{ classId: string; quizId: string }>();
  const navigate = useNavigate();
  const { currentTenantId } = useTenant();
  const { user } = useAuth();
  const base = variant === "admin" ? `/admin/classes/${classId}` : `/tutor/classes/${classId}`;
  const [exporting, setExporting] = useState(false);

  const enabled = !!quizId && !!user;

  const overview = useQuery({
    queryKey: analyticsKeys.overview(currentTenantId, quizId ?? ""),
    enabled,
    queryFn: () => getQuizAnalyticsOverview(quizId!),
    staleTime: 30_000,
  });

  const questions = useQuery({
    queryKey: analyticsKeys.questions(currentTenantId, quizId ?? ""),
    enabled,
    queryFn: () => getQuizQuestionAnalytics(quizId!),
    staleTime: 30_000,
  });

  const o = overview.data;
  const maxBucket = useMemo(
    () => Math.max(1, ...(o?.distribution ?? []).map((d) => d.count)),
    [o],
  );

  /** Fetches on demand rather than holding the cohort in memory all session. */
  async function onExport() {
    if (!quizId) return;
    setExporting(true);
    try {
      const data = await getQuizStudentAnalytics(quizId);
      if (data.students.length === 0) {
        toast.info("No completed attempts to export yet.");
        return;
      }
      downloadCsv(csvFilename(data.quiz_title), studentsToCsv(data));
      toast.success(`Exported ${data.students.length} student${data.students.length === 1 ? "" : "s"}.`);
    } catch (err) {
      toast.error(mapAnalyticsError(err, "Couldn't export results."));
    } finally {
      setExporting(false);
    }
  }

  if (overview.isError) {
    return (
      <AnalyticsShell title="Quiz Analytics" backTo={`${base}/quizzes`}>
        <AnalyticsError
          message={mapAnalyticsError(overview.error)}
          onRetry={() => void overview.refetch()}
        />
      </AnalyticsShell>
    );
  }

  return (
    <AnalyticsShell title="Quiz Analytics" backTo={`${base}/quizzes`}>
      {overview.isLoading || !o ? (
        <div className="space-y-3">
          <Skel className="h-[104px] rounded-3xl" />
          <div className="grid grid-cols-2 gap-3">
            <Skel className="h-[124px] rounded-3xl" />
            <Skel className="h-[124px] rounded-3xl" />
            <Skel className="h-[124px] rounded-3xl" />
            <Skel className="h-[124px] rounded-3xl" />
          </div>
          <Skel className="mt-6 h-[180px] rounded-3xl" />
        </div>
      ) : (
        <>
          <QuizContextCard
            title={o.quiz_title}
            subtitle={`${o.question_count} question${o.question_count === 1 ? "" : "s"} · ${o.total_points} pts`}
            art={QUIZ_ART.owlGamingCompact}
            action={
              <Button
                onClick={onExport}
                disabled={exporting || o.participants === 0}
                variant="outline"
                className="min-h-[44px] rounded-full border-slate-200 bg-white px-4 text-[13.5px] font-bold text-slate-700"
              >
                {exporting ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
                )}
                Export CSV
              </Button>
            }
          />

          {o.participants === 0 ? (
            <div className="mt-4">
              <AnalyticsEmpty
                art={QUIZ_ART.hourglass}
                title="No attempts yet"
                body="Once students complete this quiz, their results and question-level insights appear here."
              />
            </div>
          ) : (
            <>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <StatCard
                  icon={<Users className="h-5 w-5" />}
                  tone="violet"
                  value={String(o.participants)}
                  label="Students"
                  hint="Completed the quiz"
                />
                <StatCard
                  icon={<CheckCircle2 className="h-5 w-5" />}
                  tone="emerald"
                  value={formatPct(o.avg_score_pct)}
                  label="Avg score"
                  hint="Class average"
                />
                <StatCard
                  icon={<BarChart3 className="h-5 w-5" />}
                  tone="sky"
                  value={formatPct(o.completion_pct)}
                  label="Completed"
                  hint={`${o.participants} of ${o.eligible_students} enrolled`}
                />
                <StatCard
                  icon={<Clock className="h-5 w-5" />}
                  tone="amber"
                  value={formatSeconds(o.avg_seconds_per_question)}
                  label="Avg time"
                  hint="Per question, across the attempt"
                />
              </div>

              {/* Score distribution — the honest chart. A trend line would need
                  a time series this data does not have. */}
              <SectionHeader title="Score distribution" />
              <div className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                <ul className="space-y-3">
                  {o.distribution.map((d) => (
                    <li key={d.band} className="flex items-center gap-3">
                      <span className="w-16 shrink-0 text-[12.5px] font-semibold text-slate-600">
                        {d.label}
                      </span>
                      <div className="min-w-0 flex-1">
                        <AccuracyBar
                          pct={(d.count / maxBucket) * 100}
                          tone={d.band === "0-39" ? "warn" : d.band === "80-100" ? "good" : "accent"}
                        />
                      </div>
                      {/* Just the count: "9 students" wrapped to two lines in
                          the space available at 320px, and the section heading
                          already says what is being counted. The full phrasing
                          is in the screen-reader summary below. */}
                      <span className="w-8 shrink-0 text-right text-[13px] font-extrabold tabular-nums text-slate-800">
                        {d.count}
                      </span>
                    </li>
                  ))}
                </ul>
                {/* The bars are decorative; this table is the accessible copy. */}
                <p className="sr-only">
                  {o.distribution
                    .map((d) => `${d.label}: ${d.count} students`)
                    .join(". ")}
                </p>
              </div>
            </>
          )}

          <SectionHeader
            title="Question insights"
            to={`${base}/quizzes/${quizId}/analytics/questions`}
          />
          {questions.isLoading ? (
            <div className="space-y-2">
              <Skel className="h-[56px] rounded-2xl" />
              <Skel className="h-[56px] rounded-2xl" />
              <Skel className="h-[56px] rounded-2xl" />
            </div>
          ) : questions.isError ? (
            <AnalyticsError
              message={mapAnalyticsError(questions.error, "Couldn't load question insights.")}
              onRetry={() => void questions.refetch()}
            />
          ) : (questions.data?.questions.length ?? 0) === 0 ? (
            <AnalyticsEmpty
              art={QUIZ_ART.owlSad}
              title="This quiz has no questions"
              body="Add questions in the builder and they'll be analysed here once students answer them."
            />
          ) : (
            <ul className="space-y-2">
              {questions.data!.questions.map((q) => (
                <li key={q.question_id}>
                  <button
                    type="button"
                    onClick={() =>
                      navigate(
                        `${base}/quizzes/${quizId}/analytics/questions?q=${q.question_id}`,
                      )
                    }
                    className="flex min-h-[56px] w-full items-center gap-2.5 rounded-2xl border border-slate-200/80 bg-white px-3 py-2.5 text-left shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition active:scale-[0.99]"
                  >
                    <span className="flex h-7 shrink-0 items-center rounded-lg bg-quiz-tint px-2 text-[11.5px] font-black text-quiz-accent-strong">
                      Q{q.index + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-slate-800">
                      {q.question}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 text-[13.5px] font-black tabular-nums",
                        q.band === "difficult"
                          ? "text-amber-600"
                          : q.band === "strong"
                            ? "text-emerald-600"
                            : "text-slate-700",
                      )}
                    >
                      {formatPct(q.accuracy_pct)}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Student performance CTA */}
          <div className="mt-6 rounded-3xl border border-quiz-accent/20 bg-quiz-tint p-4">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-extrabold text-slate-900">Student performance</p>
                <p className="mt-0.5 text-[12.5px] leading-snug text-slate-600">
                  See detailed performance by student.
                </p>
              </div>
            </div>
            <Button
              onClick={() => navigate(`${base}/quizzes/${quizId}/analytics/students`)}
              className="mt-3 min-h-[48px] w-full rounded-full bg-gradient-to-r from-violet-600 to-quiz-accent text-[15px] font-extrabold text-white"
            >
              View students
              <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </>
      )}
    </AnalyticsShell>
  );
}

export default QuizAnalyticsOverview;
