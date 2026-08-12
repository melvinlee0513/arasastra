import { useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  HelpCircle, Clock, Calendar, ChevronRight, ChevronDown, Lock, Play, RotateCcw,
  CheckCircle2, EyeOff, RefreshCw, History,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ClassShell } from "@/components/class/ClassShell";
import { ClassHubEmptyState, Illustration } from "@/components/class/ClassHubChrome";
import { STATE_ART } from "@/lib/classIllustrations";

import { useClassContext } from "@/hooks/useClassContext";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/hooks/useAuth";
import {
  listStudentClassQuizzes,
  listMyQuizAttempts,
  startQuizAttempt,
  mapQuizError,
  formatDateTime,
  formatDuration,
  quizStudentKeys,
  type StudentQuizListRow,
  type StudentAttemptHistoryRow,
} from "@/lib/quizzes";
import { showSupabaseError } from "@/lib/supabaseErrors";
import { toast } from "sonner";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type QuizState =
  | { kind: "upcoming"; availableFrom: string }
  | { kind: "closed" }
  | { kind: "in_progress"; attemptId: string }
  | { kind: "submitted" }
  | { kind: "exhausted" }
  | { kind: "available" };

function stateOf(row: StudentQuizListRow, now = Date.now()): QuizState {
  if (row.in_progress_attempt_id) return { kind: "in_progress", attemptId: row.in_progress_attempt_id };
  if (row.available_from && new Date(row.available_from).getTime() > now) {
    return { kind: "upcoming", availableFrom: row.available_from };
  }
  if (row.due_at && new Date(row.due_at).getTime() < now) {
    return row.latest_submitted_attempt_id ? { kind: "submitted" } : { kind: "closed" };
  }
  if (row.attempts_used >= (row.attempt_limit ?? 1)) {
    return row.latest_submitted_attempt_id ? { kind: "submitted" } : { kind: "exhausted" };
  }
  return { kind: "available" };
}

export function StudentClassQuizzes() {
  const { classId } = useParams<{ classId: string }>();
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const classCtx = useClassContext(classId);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const routeValid = !!classId && UUID_RE.test(classId);

  const listQ = useQuery({
    queryKey: quizStudentKeys.list(currentTenantId, classId ?? "", user?.id),
    enabled: routeValid && !!user && !!classCtx.data?.isEnrolled,
    queryFn: () => listStudentClassQuizzes(classId!),
    // Cross-session freshness: a tutor releasing results on another device can
    // only reach this browser through a mount/focus/reconnect refetch.
    staleTime: 15_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  const startMut = useMutation({
    mutationFn: async (quizId: string) => startQuizAttempt(quizId),
    onSuccess: (attemptId, quizId) => {
      qc.invalidateQueries({ queryKey: quizStudentKeys.list(currentTenantId, classId ?? "", user?.id) });
      qc.invalidateQueries({ queryKey: quizStudentKeys.history(currentTenantId, quizId, user?.id) });
      navigate(`/dashboard/classes/${classId}/quizzes/${quizId}/attempt/${attemptId}`);
    },
    onError: (err) => {
      const msg = mapQuizError(err);
      if (msg === "Something went wrong. Please try again.") showSupabaseError(err);
      else toast.error(msg);
    },
  });

  const breadcrumbs = useMemo(
    () => [
      { label: "Home", to: "/dashboard" },
      { label: "My Classes", to: "/dashboard/classes" },
      { label: classCtx.data?.klass?.title || "Class", to: `/dashboard/classes/${classId}` },
      { label: "Quizzes" },
    ],
    [classCtx.data?.klass?.title, classId],
  );

  const notEnrolled = classCtx.data && !classCtx.data.isEnrolled;

  return (
    <ClassShell
      data={classCtx.data}
      isLoading={classCtx.isLoading}
      role="student"
      section="quizzes"
      basePath={`/dashboard/classes/${classId}`}
      materialsPath={`/dashboard/classes/${classId}/materials`}
      breadcrumbs={breadcrumbs}
    >
      {!routeValid ? (
        <ClassHubEmptyState
          art={STATE_ART.lock}
          title="Quizzes unavailable"
          description="This page isn't available right now."
        />
      ) : notEnrolled ? (
        <ClassHubEmptyState
          art={STATE_ART.lock}
          title="Enrollment required"
          description="You need to be enrolled in this class to take its quizzes."
        />
      ) : listQ.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-3xl" />)}
        </div>
      ) : listQ.isError ? (
        <ClassHubEmptyState
          art={STATE_ART.worksheet}
          title="Couldn't load quizzes"
          description="Something interrupted the connection. Please try again in a moment."
          action={
            <Button onClick={() => listQ.refetch()} className="rounded-full min-h-[44px] px-6">
              Retry
            </Button>
          }
        />
      ) : (listQ.data ?? []).length === 0 ? (
        <ClassHubEmptyState
          art={STATE_ART.quiz}
          title="No quizzes yet"
          description="Your tutor will publish quizzes here. You'll see them the moment they go live."
        />
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-medium text-slate-500 pl-1">
              {(listQ.data ?? []).length} quiz{(listQ.data ?? []).length === 1 ? "" : "zes"}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full text-slate-500 min-h-[40px]"
              onClick={() => listQ.refetch()}
              disabled={listQ.isFetching}
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1 ${listQ.isFetching ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>
          <div className="grid gap-3">
            {(listQ.data ?? []).map((row) => (
              <QuizCard key={row.id} row={row} onStart={() => startMut.mutate(row.id)} isStarting={startMut.isPending && startMut.variables === row.id} />
            ))}
          </div>
        </div>
      )}

    </ClassShell>
  );
}

function QuizCard({ row, onStart, isStarting }: { row: StudentQuizListRow; onStart: () => void; isStarting: boolean }) {
  const { classId } = useParams<{ classId: string }>();
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const [open, setOpen] = useState(false);
  const s = stateOf(row);

  const historyQ = useQuery({
    queryKey: quizStudentKeys.history(currentTenantId, row.id, user?.id),
    enabled: open && !!user,
    queryFn: () => listMyQuizAttempts(row.id),
    staleTime: 15_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  const remaining = Math.max(0, (row.attempt_limit ?? 1) - row.attempts_used);

  return (
    <Card className="p-4 sm:p-5 rounded-3xl border-slate-200/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3.5">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/[0.07] ring-1 ring-inset ring-primary/10">
            <Illustration
              src={STATE_ART.quiz}
              className="h-9 w-9 drop-shadow-[0_6px_12px_rgba(15,23,42,0.14)]"
            />
          </span>
          <div className="min-w-0 flex-1">


          <h3 className="font-semibold text-slate-900 break-words">{row.title}</h3>
          {row.description && (
            <p className="text-sm text-slate-500 mt-0.5 line-clamp-2 break-words">{row.description}</p>
          )}
          <div className="flex flex-wrap gap-1.5 mt-2">
            <Badge variant="secondary" className="rounded-full text-xs gap-1">
              <HelpCircle className="w-3 h-3" /> {row.question_count} questions
            </Badge>
            {row.time_limit_seconds && (
              <Badge variant="secondary" className="rounded-full text-xs gap-1">
                <Clock className="w-3 h-3" /> {formatDuration(row.time_limit_seconds)}
              </Badge>
            )}
            {row.due_at && (
              <Badge variant="outline" className="rounded-full text-xs gap-1">
                <Calendar className="w-3 h-3" /> Due {formatDateTime(row.due_at)}
              </Badge>
            )}
            <Badge variant="outline" className="rounded-full text-xs">
              Attempts {row.attempts_used}/{row.attempt_limit} · {remaining} left
            </Badge>
            {s.kind === "submitted" && (
              <Badge className="rounded-full text-xs bg-emerald-500/15 text-emerald-700 border-0 gap-1">
                <CheckCircle2 className="w-3 h-3" /> Submitted
              </Badge>
            )}
            {s.kind === "upcoming" && (
              <Badge variant="outline" className="rounded-full text-xs">Opens {formatDateTime(s.availableFrom)}</Badge>
            )}
            {s.kind === "closed" && (
              <Badge variant="outline" className="rounded-full text-xs">Closed</Badge>
            )}
          </div>
        </div>
        </div>
        <div className="shrink-0 flex sm:justify-end">
          <QuizAction row={row} state={s} onStart={onStart} isStarting={isStarting} />
        </div>

      </div>

      {row.attempts_used > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <Button
            variant="ghost"
            size="sm"
            className="rounded-full text-slate-600 px-2"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            <History className="w-3.5 h-3.5 mr-1" /> Attempt history
            <ChevronDown className={`w-3.5 h-3.5 ml-1 transition-transform ${open ? "rotate-180" : ""}`} />
          </Button>
          {open && (
            <div className="mt-3 space-y-2">
              {historyQ.isLoading ? (
                <Skeleton className="h-16 rounded-2xl" />
              ) : historyQ.isError ? (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm text-slate-500">Your attempt history isn't available right now.</p>
                  <Button size="sm" variant="outline" className="rounded-full" onClick={() => historyQ.refetch()}>Retry</Button>
                </div>
              ) : (historyQ.data?.attempts ?? []).length === 0 ? (
                <p className="text-sm text-slate-500">No attempts recorded yet.</p>
              ) : (
                (historyQ.data!.attempts).map((a, i, arr) => (
                  <AttemptRow
                    key={a.attempt_id}
                    attempt={a}
                    number={arr.length - i}
                    quizId={row.id}
                    classId={classId}
                  />
                ))
              )}
              {historyQ.data && !historyQ.data.results_visible && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <p className="text-xs text-slate-500 flex items-center gap-1">
                    <EyeOff className="w-3 h-3" /> Results are not published for this quiz yet.
                  </p>
                  <Button size="sm" variant="ghost" className="rounded-full text-xs h-7" onClick={() => historyQ.refetch()} disabled={historyQ.isFetching}>
                    <RefreshCw className={`w-3 h-3 mr-1 ${historyQ.isFetching ? "animate-spin" : ""}`} /> Check again
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function attemptStatusLabel(a: StudentAttemptHistoryRow): string {
  if (a.status === "in_progress") return "In progress";
  if (a.status === "abandoned") return "Attempt unavailable";
  switch (a.submission_reason) {
    case "time_expired":
      return "Submitted · time expired";
    case "due_expired":
      return "Submitted · due date passed";
    case "auto":
      return "Submitted automatically";
    default:
      return "Submitted";
  }
}

function AttemptRow({
  attempt, number, quizId, classId,
}: { attempt: StudentAttemptHistoryRow; number: number; quizId: string; classId?: string }) {
  const scoreVisible =
    attempt.results_visible && attempt.status === "submitted" && attempt.percentage !== null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-900">
          Attempt {number} · <span className="font-normal text-slate-600">{attemptStatusLabel(attempt)}</span>
        </p>
        <p className="text-xs text-slate-500 mt-0.5 break-words">
          Started {formatDateTime(attempt.started_at)}
          {attempt.submitted_at ? ` · Submitted ${formatDateTime(attempt.submitted_at)}` : ""}
        </p>
        {scoreVisible ? (
          <p className="text-xs font-semibold text-emerald-700 mt-1">
            Score {Math.round(Number(attempt.percentage))}%
            {attempt.total_points !== null && attempt.max_points !== null
              ? ` (${attempt.total_points}/${attempt.max_points})`
              : ""}
          </p>
        ) : attempt.status === "submitted" ? (
          <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
            <EyeOff className="w-3 h-3" /> Results hidden
          </p>
        ) : null}
      </div>
      <div className="shrink-0">
        {attempt.status === "in_progress" ? (
          <Button asChild size="sm" className="rounded-full min-h-[40px]">
            <Link to={`/dashboard/classes/${classId}/quizzes/${quizId}/attempt/${attempt.attempt_id}`}>
              <RotateCcw className="w-3.5 h-3.5 mr-1" /> Resume
            </Link>
          </Button>
        ) : attempt.status === "submitted" && attempt.results_visible ? (
          <Button asChild size="sm" variant="outline" className="rounded-full min-h-[40px]">
            <Link to={`/dashboard/classes/${classId}/quizzes/${quizId}/results/${attempt.attempt_id}`}>
              View result
            </Link>
          </Button>
        ) : (
          <Badge variant="outline" className="rounded-full text-xs">
            {attempt.status === "submitted" ? "Results hidden" : "Unavailable"}
          </Badge>
        )}
      </div>
    </div>
  );
}

function QuizAction({
  row,
  state,
  onStart,
  isStarting,
}: {
  row: StudentQuizListRow;
  state: QuizState;
  onStart: () => void;
  isStarting: boolean;
}) {
  const { classId } = useParams<{ classId: string }>();

  // Priority: resume → view latest available result → start → locked states.
  if (state.kind === "in_progress") {
    return (
      <Button asChild className="rounded-full gap-1">
        <Link to={`/dashboard/classes/${classId}/quizzes/${row.id}/attempt/${state.attemptId}`}>
          <RotateCcw className="w-4 h-4" /> Resume
        </Link>
      </Button>
    );
  }
  if (state.kind === "submitted") {
    const attemptId = row.latest_submitted_attempt_id;
    if (attemptId) {
      return (
        <Button asChild variant="outline" className="rounded-full gap-1">
          <Link to={`/dashboard/classes/${classId}/quizzes/${row.id}/results/${attemptId}`}>
            <CheckCircle2 className="w-4 h-4" /> View result
          </Link>
        </Button>
      );
    }
    return <Button variant="outline" className="rounded-full gap-1" disabled><CheckCircle2 className="w-4 h-4" /> Submitted</Button>;
  }
  if (state.kind === "upcoming" || state.kind === "closed") {
    return <Button variant="outline" className="rounded-full gap-1" disabled><Lock className="w-4 h-4" /> Locked</Button>;
  }
  if (state.kind === "exhausted") {
    return <Button variant="outline" className="rounded-full gap-1" disabled>Attempts used</Button>;
  }
  return (
    <Button onClick={onStart} disabled={isStarting} className="rounded-full gap-1">
      <Play className="w-4 h-4" /> {isStarting ? "Starting…" : row.attempts_used > 0 ? "Start another attempt" : "Start quiz"}
      <ChevronRight className="w-4 h-4" />
    </Button>
  );
}

export default StudentClassQuizzes;
