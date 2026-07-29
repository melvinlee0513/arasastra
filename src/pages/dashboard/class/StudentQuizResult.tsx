import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  XCircle,
  Circle,
  Clock,
  ArrowLeft,
  Lock,
  AlertCircle,
  Trophy,
  Loader2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ClassShell } from "@/components/class/ClassShell";
import { useClassContext } from "@/hooks/useClassContext";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/hooks/useAuth";
import {
  getQuizResult,
  mapQuizError,
  RESULT_VISIBILITY_LABEL,
  quizStudentKeys,
  type QuizResultPayload,
} from "@/lib/quizzes";
import { cn } from "@/lib/utils";

// Bounded polling window used when the attempt is submitted but the async
// finaliser hasn't produced a scored quiz_results row yet.
const POLL_INTERVAL_MS = 1500;
const MAX_POLL_ATTEMPTS = 8; // ≈ 12 seconds

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function StudentQuizResult() {
  const params = useParams<{ classId: string; quizId: string; attemptId: string }>();
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const classCtx = useClassContext(params.classId);
  const qc = useQueryClient();

  const routeValid =
    !!params.classId && UUID_RE.test(params.classId) &&
    !!params.quizId && UUID_RE.test(params.quizId) &&
    !!params.attemptId && UUID_RE.test(params.attemptId);

  const [pollCount, setPollCount] = useState(0);
  const pollExhausted = pollCount >= MAX_POLL_ATTEMPTS;
  const pollAttemptIdRef = useRef<string | null>(null);

  const resultQ = useQuery({
    queryKey: quizStudentKeys.result(currentTenantId, params.classId ?? "", params.attemptId ?? "", user?.id),
    enabled: routeValid && !!user,
    queryFn: () => getQuizResult(params.attemptId!),
    refetchInterval: (query) => {
      const d = query.state.data as QuizResultPayload | undefined;
      if (!d) return false;
      if (d.status === "no_result" && !pollExhausted) return POLL_INTERVAL_MS;
      return false;
    },
  });

  // Reset the poll counter whenever the attempt in the URL changes.
  useEffect(() => {
    if (pollAttemptIdRef.current !== params.attemptId) {
      pollAttemptIdRef.current = params.attemptId ?? null;
      setPollCount(0);
    }
  }, [params.attemptId]);

  // Count each background refetch caused by our poll so we can stop after the
  // window closes without spinning forever.
  useEffect(() => {
    if (!resultQ.data) return;
    if (resultQ.data.status === "no_result" && resultQ.isFetching && !pollExhausted) {
      setPollCount((n) => n + 1);
    }
  }, [resultQ.isFetching, resultQ.data, pollExhausted]);

  // Validate the URL matches the underlying attempt to prevent tampered links.
  const routeMismatch = useMemo(() => {
    if (!resultQ.data) return false;
    return (
      resultQ.data.class_id !== params.classId ||
      resultQ.data.quiz_id !== params.quizId
    );
  }, [resultQ.data, params.classId, params.quizId]);

  const breadcrumbs = useMemo(
    () => [
      { label: "Home", to: "/dashboard" },
      { label: "My Classes", to: "/dashboard/classes" },
      { label: classCtx.data?.klass?.title || "Class", to: `/dashboard/classes/${params.classId}` },
      { label: "Quizzes", to: `/dashboard/classes/${params.classId}/quizzes` },
      { label: "Result" },
    ],
    [classCtx.data?.klass?.title, params.classId],
  );

  const backHref = `/dashboard/classes/${params.classId}/quizzes`;

  return (
    <ClassShell
      data={classCtx.data}
      isLoading={classCtx.isLoading}
      role="student"
      section="quizzes"
      basePath={`/dashboard/classes/${params.classId}`}
      materialsPath={`/dashboard/classes/${params.classId}/materials`}
      breadcrumbs={breadcrumbs}
    >
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm" className="rounded-full">
          <Link to={backHref}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to quizzes
          </Link>
        </Button>
      </div>

      {!routeValid ? (
        <StatusCard
          icon={<AlertCircle className="w-7 h-7 text-destructive" />}
          title="Invalid link"
          body="This result link isn't valid. Please open it from your quiz list."
          action={
            <Button asChild className="rounded-full">
              <Link to={backHref}>Back to quizzes</Link>
            </Button>
          }
        />
      ) : resultQ.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-32 rounded-3xl" />
          <Skeleton className="h-64 rounded-3xl" />
        </div>
      ) : resultQ.isError ? (
        <StatusCard
          icon={<AlertCircle className="w-7 h-7 text-destructive" />}
          title="Couldn't load result"
          body={mapQuizError(resultQ.error) || "Please try again in a moment."}
          action={
            <Button
              onClick={() => {
                setPollCount(0);
                resultQ.refetch();
              }}
              className="rounded-full"
            >
              Retry
            </Button>
          }
        />
      ) : routeMismatch ? (
        <StatusCard
          icon={<AlertCircle className="w-7 h-7 text-destructive" />}
          title="Link doesn't match this attempt"
          body="This result belongs to a different class or quiz. Please open it from your quiz list."
          action={
            <Button asChild className="rounded-full">
              <Link to={backHref}>Back to quizzes</Link>
            </Button>
          }
        />
      ) : resultQ.data!.status === "no_result" ? (
        <NoResultCard
          exhausted={pollExhausted}
          onRetry={() => {
            setPollCount(0);
            qc.invalidateQueries({
              queryKey: quizStudentKeys.result(
                currentTenantId,
                params.classId ?? "",
                params.attemptId ?? "",
                user?.id,
              ),
            });
          }}
        />
      ) : resultQ.data!.status === "not_submitted" ? (
        <StatusCard
          icon={<Clock className="w-7 h-7 text-primary" />}
          title="Attempt not submitted"
          body="This attempt hasn't been submitted yet."
          action={
            <Button asChild className="rounded-full">
              <Link to={backHref}>Back to quizzes</Link>
            </Button>
          }
        />
      ) : (
        <ResultBody data={resultQ.data!} quizId={params.quizId!} classId={params.classId!} />
      )}
    </ClassShell>
  );
}

function NoResultCard({ exhausted, onRetry }: { exhausted: boolean; onRetry: () => void }) {
  if (!exhausted) {
    return (
      <StatusCard
        icon={<Loader2 className="w-7 h-7 text-primary animate-spin" />}
        title="Finalising your result…"
        body="Your submission is being scored. This usually takes a few seconds."
      />
    );
  }
  return (
    <StatusCard
      icon={<AlertCircle className="w-7 h-7 text-amber-600" />}
      title="Result not available yet"
      body="We couldn't find a scored result for this attempt. If this persists, contact your tutor."
      action={
        <Button onClick={onRetry} className="rounded-full">
          Retry
        </Button>
      }
    />
  );
}

function ResultBody({
  data,
  classId,
}: {
  data: Exclude<QuizResultPayload, { status: "not_submitted" } | { status: "no_result" }>;
  quizId: string;
  classId: string;
}) {
  if (data.status === "hidden") {
    const label = RESULT_VISIBILITY_LABEL[data.visibility] ?? "Later";
    return (
      <StatusCard
        icon={<Lock className="w-7 h-7 text-slate-500" />}
        title="Results not released yet"
        body={
          data.visibility === "manual"
            ? "Your tutor will release results manually. Check back later."
            : data.visibility === "after_due"
            ? "Results will unlock after the quiz due date."
            : data.visibility === "never"
            ? "Results for this quiz aren't shared with students."
            : `Result visibility: ${label}.`
        }
      />
    );
  }

  if (data.status === "not_submitted" as never) {
    // Defensive — should be filtered upstream, but keep a friendly fallback.
    return (
      <StatusCard
        icon={<Clock className="w-7 h-7 text-primary" />}
        title="Attempt not submitted"
        body="This attempt hasn't been submitted yet."
        action={
          <Button asChild className="rounded-full">
            <Link to={`/dashboard/classes/${classId}/quizzes`}>Back to quizzes</Link>
          </Button>
        }
      />
    );
  }

  const pct = typeof data.percentage === "number" ? Math.round(data.percentage) : null;
  const correctCount = data.questions.filter((q) => q.is_correct).length;

  return (
    <div className="space-y-5">
      <Card className="rounded-3xl p-6 sm:p-8 border-slate-200 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        <div className="flex flex-col sm:flex-row sm:items-center gap-6">
          <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center shrink-0">
            <Trophy className="w-10 h-10 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-slate-500">Your score</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-4xl font-black text-slate-900">{data.total_points}</span>
              <span className="text-lg text-slate-500">/ {data.max_points} pts</span>
              {pct !== null && (
                <Badge className="ml-2 rounded-full bg-primary/10 text-primary border-0">{pct}%</Badge>
              )}
            </div>
            <p className="text-sm text-slate-500 mt-2">
              {correctCount} of {data.total_questions} questions correct
              {" · "}Submitted {new Date(data.completed_at).toLocaleString()}
              {data.submission_reason && data.submission_reason !== "manual" && (
                <> · {data.submission_reason === "auto_expired" ? "auto-submitted (time up)" : data.submission_reason}</>
              )}
            </p>
          </div>
        </div>
      </Card>

      <div className="space-y-3">
        {data.questions.map((q, idx) => (
          <Card key={q.question_id} className="rounded-3xl p-5 sm:p-6 border-slate-200">
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-sm font-semibold",
                  q.is_correct
                    ? "bg-emerald-500/15 text-emerald-700"
                    : q.selected_option_id || q.selected_answer
                    ? "bg-destructive/15 text-destructive"
                    : "bg-slate-200 text-slate-600",
                )}
              >
                {idx + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <Badge variant="outline" className="rounded-full text-xs">
                    {q.points} pt{q.points === 1 ? "" : "s"}
                  </Badge>
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
                        <li
                          key={o.id}
                          className={cn(
                            "flex items-start gap-2 rounded-2xl px-3 py-2 text-sm border",
                            o.is_correct
                              ? "bg-emerald-500/5 border-emerald-500/30 text-emerald-900"
                              : isSelected
                              ? "bg-destructive/5 border-destructive/30 text-destructive"
                              : "bg-slate-50 border-slate-200 text-slate-700",
                          )}
                        >
                          {o.is_correct ? (
                            <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-600 shrink-0" />
                          ) : isSelected ? (
                            <XCircle className="w-4 h-4 mt-0.5 text-destructive shrink-0" />
                          ) : (
                            <Circle className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" />
                          )}
                          <span className="flex-1 whitespace-pre-wrap">{o.text}</span>
                          {isSelected && (
                            <Badge
                              variant="outline"
                              className="rounded-full text-[10px] uppercase tracking-wide"
                            >
                              Your answer
                            </Badge>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="rounded-2xl px-3 py-2 bg-slate-50 border border-slate-200">
                      <p className="text-xs uppercase tracking-wide text-slate-500 mb-0.5">Your answer</p>
                      <p className="text-slate-800 whitespace-pre-wrap">
                        {q.selected_answer || "— no answer —"}
                      </p>
                    </div>
                    {q.correct_answer && (
                      <div className="rounded-2xl px-3 py-2 bg-emerald-500/5 border border-emerald-500/30">
                        <p className="text-xs uppercase tracking-wide text-emerald-700 mb-0.5">
                          Correct answer
                        </p>
                        <p className="text-emerald-900 whitespace-pre-wrap">{q.correct_answer}</p>
                      </div>
                    )}
                  </div>
                )}

                {q.explanation && (
                  <div className="mt-3 rounded-2xl border border-primary/20 bg-primary/5 px-3 py-2">
                    <p className="text-xs uppercase tracking-wide text-primary mb-0.5">Explanation</p>
                    <p className="text-sm text-slate-800 whitespace-pre-wrap">{q.explanation}</p>
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

function StatusCard({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className="rounded-3xl p-10 text-center border-slate-200">
      <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-slate-100 flex items-center justify-center">{icon}</div>
      <h2 className="font-semibold text-slate-900 mb-1">{title}</h2>
      <p className="text-sm text-slate-500 mb-4 max-w-md mx-auto">{body}</p>
      {action}
    </Card>
  );
}

export default StudentQuizResult;
