import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Circle, XCircle, Loader2, Users, Trophy } from "lucide-react";
import { ClassShell } from "@/components/class/ClassShell";
import { useClassContext } from "@/hooks/useClassContext";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getQuizResultsForManager, getQuizAttemptForManager,
  mapQuizError, formatDateTime,
} from "@/lib/quizzes";
import { cn } from "@/lib/utils";

interface Props { variant: "tutor" | "admin" }

export function ClassQuizResultsManager({ variant }: Props) {
  const { classId, quizId, attemptId } = useParams<{ classId: string; quizId: string; attemptId?: string }>();
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const ctx = useClassContext(classId);

  const basePath = variant === "admin" ? `/admin/classes/${classId}` : `/tutor/classes/${classId}`;
  const materialsPath = `${basePath}/resources`;
  const resultsBase = `${basePath}/quizzes/${quizId}/results`;

  const summaryQ = useQuery({
    queryKey: ["quiz-manager", "results", currentTenantId, quizId, user?.id],
    enabled: !!quizId && !!user && !!ctx.data?.canManage && !attemptId,
    queryFn: () => getQuizResultsForManager(quizId!),
  });

  const attemptQ = useQuery({
    queryKey: ["quiz-manager", "attempt", currentTenantId, attemptId, user?.id],
    enabled: !!attemptId && !!user && !!ctx.data?.canManage,
    queryFn: () => getQuizAttemptForManager(attemptId!),
  });

  const breadcrumbs = useMemo(() => [
    { label: variant === "admin" ? "Admin" : "Tutor", to: variant === "admin" ? "/admin" : "/tutor" },
    { label: "Classes", to: variant === "admin" ? "/admin/curriculum" : "/tutor/classes" },
    { label: ctx.data?.klass?.title ?? "Class", to: basePath },
    { label: "Quizzes", to: `${basePath}/quizzes` },
    { label: attemptId ? "Attempt" : "Results" },
  ], [variant, basePath, ctx.data?.klass?.title, attemptId]);

  return (
    <ClassShell
      data={ctx.data}
      isLoading={ctx.isLoading}
      role={variant}
      section="quizzes"
      basePath={basePath}
      materialsPath={materialsPath}
      breadcrumbs={breadcrumbs}
    >
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm" className="rounded-full">
          <Link to={attemptId ? resultsBase : `${basePath}/quizzes`}>
            <ArrowLeft className="w-4 h-4 mr-1" /> {attemptId ? "Back to results" : "Back to quizzes"}
          </Link>
        </Button>
      </div>

      {!ctx.isLoading && ctx.data && !ctx.data.canManage ? (
        <Card className="p-8 text-center rounded-3xl">
          <h2 className="font-semibold text-slate-900 mb-1">Not available</h2>
          <p className="text-sm text-slate-500">You don't have permission to view results for this class.</p>
        </Card>
      ) : attemptId ? (
        <AttemptReview loading={attemptQ.isLoading} error={attemptQ.error} data={attemptQ.data} />
      ) : (
        <ResultsSummary
          loading={summaryQ.isLoading}
          error={summaryQ.error}
          data={summaryQ.data}
          resultsBase={resultsBase}
        />
      )}
    </ClassShell>
  );
}

function ResultsSummary({
  loading, error, data, resultsBase,
}: {
  loading: boolean;
  error: unknown;
  data: Awaited<ReturnType<typeof getQuizResultsForManager>> | undefined;
  resultsBase: string;
}) {
  if (loading) {
    return <div className="flex items-center justify-center py-16 text-slate-500"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…</div>;
  }
  if (error) {
    return <Card className="p-8 rounded-3xl border-red-200 text-center"><p className="text-sm text-red-600">{mapQuizError(error)}</p></Card>;
  }
  if (!data) return null;

  const { summary, students, quiz } = data;

  return (
    <div className="space-y-5">
      <Card className="rounded-3xl p-6 border-slate-200 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        <h2 className="font-semibold text-slate-900 mb-3">{quiz.title}</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Stat label="Enrolled" value={summary.total_enrolled} />
          <Stat label="Submitted" value={summary.total_submitted} />
          <Stat label="In progress" value={summary.total_in_progress} />
          <Stat label="Attempts" value={summary.total_attempts} />
          <Stat label="Average" value={summary.avg_percentage != null ? `${summary.avg_percentage}%` : "—"} />
        </div>
      </Card>

      <Card className="rounded-3xl p-4 sm:p-5 border-slate-200">
        <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" /> Students
        </h3>
        {students.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-6">No enrolments yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {students.map((s) => {
              const pct = s.percentage != null ? Math.round(Number(s.percentage)) : null;
              return (
                <li key={s.user_id} className="py-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-semibold shrink-0">
                    {(s.full_name || "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 text-sm truncate">{s.full_name}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {s.submitted_count} submitted · {s.in_progress_count} in progress
                      {s.submitted_at && <> · {formatDateTime(s.submitted_at)}</>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {s.attempt_id && s.total_points != null && s.max_points != null ? (
                      <Badge className="rounded-full bg-primary/10 text-primary border-0">
                        {s.total_points}/{s.max_points}{pct !== null && ` · ${pct}%`}
                      </Badge>
                    ) : s.in_progress_count > 0 ? (
                      <Badge variant="outline" className="rounded-full">In progress</Badge>
                    ) : (
                      <Badge variant="outline" className="rounded-full">Not started</Badge>
                    )}
                    {s.attempt_id && (
                      <Button asChild size="sm" variant="outline" className="rounded-full h-8">
                        <Link to={`${resultsBase}/${s.attempt_id}`}>Review</Link>
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function AttemptReview({
  loading, error, data,
}: {
  loading: boolean;
  error: unknown;
  data: Awaited<ReturnType<typeof getQuizAttemptForManager>> | undefined;
}) {
  if (loading) {
    return <div className="flex items-center justify-center py-16 text-slate-500"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading attempt…</div>;
  }
  if (error) {
    return <Card className="p-8 rounded-3xl border-red-200 text-center"><p className="text-sm text-red-600">{mapQuizError(error)}</p></Card>;
  }
  if (!data) return null;

  const pct = data.attempt.percentage != null ? Math.round(Number(data.attempt.percentage)) : null;
  const correct = data.questions.filter((q) => q.is_correct).length;

  return (
    <div className="space-y-5">
      <Card className="rounded-3xl p-6 border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center gap-6">
          <div className="w-16 h-16 rounded-3xl bg-primary/10 flex items-center justify-center shrink-0">
            <Trophy className="w-8 h-8 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-slate-500">{data.student.full_name}{data.student.email && ` · ${data.student.email}`}</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-black text-slate-900">{data.attempt.total_points}</span>
              <span className="text-slate-500">/ {data.attempt.max_points} pts</span>
              {pct !== null && <Badge className="ml-2 rounded-full bg-primary/10 text-primary border-0">{pct}%</Badge>}
            </div>
            <p className="text-sm text-slate-500 mt-1">
              {correct} of {data.questions.length} correct
              {data.attempt.submitted_at && <> · Submitted {formatDateTime(data.attempt.submitted_at)}</>}
              {data.result?.submission_reason && data.result.submission_reason !== "normal" && <> · {data.result.submission_reason}</>}
            </p>
          </div>
        </div>
      </Card>

      <div className="space-y-3">
        {data.questions.map((q, idx) => (
          <Card key={q.question_id} className="rounded-3xl p-5 border-slate-200">
            <div className="flex items-start gap-3">
              <div className={cn(
                "w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-sm font-semibold",
                q.is_correct ? "bg-emerald-500/15 text-emerald-700"
                  : (q.selected_option_id || q.selected_answer) ? "bg-destructive/15 text-destructive"
                  : "bg-slate-200 text-slate-600",
              )}>{idx + 1}</div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <Badge variant="outline" className="rounded-full text-xs">{q.points} pt{q.points === 1 ? "" : "s"}</Badge>
                  {q.is_correct ? (
                    <Badge className="rounded-full text-xs bg-emerald-500/15 text-emerald-700 border-0 gap-1">
                      <CheckCircle2 className="w-3 h-3" /> +{q.points_awarded}
                    </Badge>
                  ) : (
                    <Badge className="rounded-full text-xs bg-destructive/15 text-destructive border-0 gap-1">
                      <XCircle className="w-3 h-3" /> 0 / {q.points}
                    </Badge>
                  )}
                </div>
                <p className="font-medium text-slate-900 whitespace-pre-wrap">{q.prompt}</p>

                {q.options.length > 0 ? (
                  <ul className="mt-3 space-y-1.5">
                    {q.options.map((o) => {
                      const isSelected = o.id === q.selected_option_id;
                      return (
                        <li key={o.id} className={cn(
                          "flex items-start gap-2 rounded-2xl px-3 py-2 text-sm border",
                          o.is_correct ? "bg-emerald-500/5 border-emerald-500/30 text-emerald-900"
                            : isSelected ? "bg-destructive/5 border-destructive/30 text-destructive"
                            : "bg-slate-50 border-slate-200 text-slate-700",
                        )}>
                          {o.is_correct ? <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-600 shrink-0" />
                            : isSelected ? <XCircle className="w-4 h-4 mt-0.5 text-destructive shrink-0" />
                            : <Circle className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" />}
                          <span className="flex-1 whitespace-pre-wrap">{o.text}</span>
                          {isSelected && <Badge variant="outline" className="rounded-full text-[10px] uppercase tracking-wide">Selected</Badge>}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="rounded-2xl px-3 py-2 bg-slate-50 border border-slate-200">
                      <p className="text-xs uppercase tracking-wide text-slate-500 mb-0.5">Student answer</p>
                      <p className="text-slate-800 whitespace-pre-wrap">{q.selected_answer || "— no answer —"}</p>
                    </div>
                    {q.correct_answer && (
                      <div className="rounded-2xl px-3 py-2 bg-emerald-500/5 border border-emerald-500/30">
                        <p className="text-xs uppercase tracking-wide text-emerald-700 mb-0.5">Correct answer</p>
                        <p className="text-emerald-900 whitespace-pre-wrap">{q.correct_answer}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-slate-50 border border-slate-100 p-3">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-lg font-bold text-slate-900 mt-0.5">{value}</p>
    </div>
  );
}

export default ClassQuizResultsManager;
