import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { HelpCircle, Clock, Calendar, ChevronRight, Lock, Play, RotateCcw, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ClassShell } from "@/components/class/ClassShell";
import { useClassContext } from "@/hooks/useClassContext";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/hooks/useAuth";
import {
  listStudentClassQuizzes,
  startQuizAttempt,
  mapQuizError,
  formatDateTime,
  formatDuration,
  type StudentQuizListRow,
} from "@/lib/quizzes";
import { showSupabaseError } from "@/lib/supabaseErrors";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

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
    return { kind: "exhausted" };
  }
  if (row.latest_submitted_attempt_id && row.attempts_used >= (row.attempt_limit ?? 1)) {
    return { kind: "submitted" };
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

  const listQ = useQuery({
    queryKey: ["quiz-student", "list", currentTenantId, classId, user?.id],
    enabled: !!classId && !!user && !!classCtx.data?.isEnrolled,
    queryFn: () => listStudentClassQuizzes(classId!),
  });

  const startMut = useMutation({
    mutationFn: async (quizId: string) => startQuizAttempt(quizId),
    onSuccess: (attemptId, quizId) => {
      qc.invalidateQueries({ queryKey: ["quiz-student", "list", currentTenantId, classId] });
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
      {notEnrolled ? (
        <Card className="p-8 text-center rounded-3xl">
          <h2 className="font-semibold text-slate-900 mb-1">Enrollment required</h2>
          <p className="text-sm text-slate-500">You need to be enrolled in this class to take its quizzes.</p>
        </Card>
      ) : listQ.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-3xl" />)}
        </div>
      ) : listQ.isError ? (
        <Card className="p-8 text-center rounded-3xl">
          <h2 className="font-semibold text-slate-900 mb-1">Couldn't load quizzes</h2>
          <p className="text-sm text-slate-500 mb-4">Please try again in a moment.</p>
          <Button onClick={() => listQ.refetch()} className="rounded-full">Retry</Button>
        </Card>
      ) : (listQ.data ?? []).length === 0 ? (
        <Card className="p-10 text-center rounded-3xl">
          <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-primary/10 flex items-center justify-center">
            <HelpCircle className="w-7 h-7 text-primary" />
          </div>
          <h2 className="font-semibold text-slate-900 mb-1">No quizzes yet</h2>
          <p className="text-sm text-slate-500">Your tutor will publish quizzes here.</p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {(listQ.data ?? []).map((row) => {
            const s = stateOf(row);
            return (
              <Card key={row.id} className="p-4 sm:p-5 rounded-3xl border-slate-200">
                <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                    <HelpCircle className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-900 truncate">{row.title}</h3>
                    {row.description && (
                      <p className="text-sm text-slate-500 mt-0.5 line-clamp-2">{row.description}</p>
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
                        Attempts {row.attempts_used}/{row.attempt_limit}
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
                  <div className="shrink-0 flex sm:justify-end">
                    <QuizAction
                      row={row}
                      state={s}
                      onStart={() => startMut.mutate(row.id)}
                      isStarting={startMut.isPending && startMut.variables === row.id}
                    />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </ClassShell>
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

  if (state.kind === "in_progress") {
    return (
      <Button asChild className="rounded-full gap-1">
        <Link to={`/dashboard/classes/${classId}/quizzes/${row.id}/attempt/${state.attemptId}`}>
          <RotateCcw className="w-4 h-4" /> Resume
        </Link>
      </Button>
    );
  }
  if (state.kind === "upcoming" || state.kind === "closed") {
    return <Button variant="outline" className="rounded-full gap-1" disabled><Lock className="w-4 h-4" /> Locked</Button>;
  }
  if (state.kind === "exhausted") {
    return <Button variant="outline" className="rounded-full gap-1" disabled>Attempts used</Button>;
  }
  if (state.kind === "submitted") {
    return <Button variant="outline" className="rounded-full gap-1" disabled><CheckCircle2 className="w-4 h-4" /> Submitted</Button>;
  }
  return (
    <Button onClick={onStart} disabled={isStarting} className="rounded-full gap-1">
      <Play className="w-4 h-4" /> {isStarting ? "Starting…" : "Start quiz"}
      <ChevronRight className="w-4 h-4" />
    </Button>
  );
}

export default StudentClassQuizzes;
