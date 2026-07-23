import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle, ChevronLeft, ChevronRight, CheckCircle2, Clock, Loader2, WifiOff, Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/hooks/useAuth";
import { useClassContext } from "@/hooks/useClassContext";
import {
  getQuizForAttempt, saveQuizProgress, submitQuizAttempt, mapQuizError,
  type StudentAttemptPayload,
} from "@/lib/quizzes";
import { showSupabaseError } from "@/lib/supabaseErrors";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type SaveState = "unsaved" | "saving" | "saved" | "failed" | "conflict" | "offline";

export function StudentQuizAttempt() {
  const { classId, quizId, attemptId } = useParams<{ classId: string; quizId: string; attemptId: string }>();
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const classCtx = useClassContext(classId);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const queryKey = useMemo(
    () => ["quiz-student", "attempt", currentTenantId, classId, attemptId, user?.id] as const,
    [currentTenantId, classId, attemptId, user?.id],
  );

  const attemptQ = useQuery({
    queryKey,
    enabled: !!attemptId && !!user,
    queryFn: () => getQuizForAttempt(attemptId!),
    refetchOnWindowFocus: false,
  });

  // ── Local answer state ────────────────────────────────────────────────
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [revision, setRevision] = useState<number>(0);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [deadline, setDeadline] = useState<string | null>(null);
  const [now, setNow] = useState<number>(Date.now());
  const [current, setCurrent] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [locked, setLocked] = useState(false);
  const savingRef = useRef(false);
  const queuedRef = useRef(false);
  const initedRef = useRef(false);

  // Initialise from server payload once loaded (or on refetch after conflict).
  useEffect(() => {
    if (!attemptQ.data || initedRef.current) return;
    const p: StudentAttemptPayload = attemptQ.data;
    setAnswers(p.attempt.saved_answers ?? {});
    setRevision(p.attempt.progress_revision);
    setDeadline(p.attempt.deadline);
    if (p.attempt.status !== "in_progress") {
      setSubmitted(true);
      setLocked(true);
    }
    initedRef.current = true;
  }, [attemptQ.data]);

  // ── Authoritative timer ──────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const secondsLeft = useMemo(() => {
    if (!deadline) return null;
    return Math.max(0, Math.floor((new Date(deadline).getTime() - now) / 1000));
  }, [deadline, now]);

  // ── Online tracking ──────────────────────────────────────────────────
  const [online, setOnline] = useState<boolean>(typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  // ── Autosave with debounce + serialise ───────────────────────────────
  const persist = useCallback(async () => {
    if (!attemptId || locked || submitted) return;
    if (!online) { setSaveState("offline"); return; }
    if (savingRef.current) { queuedRef.current = true; return; }
    savingRef.current = true;
    setSaveState("saving");
    try {
      const res = await saveQuizProgress({ attemptId, answers, expectedRevision: revision });
      setRevision(res.progress_revision);
      setDeadline(res.deadline);
      setSaveState("saved");
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? "";
      if (msg.includes("progress_revision_conflict")) {
        setSaveState("conflict");
      } else if (msg.includes("attempt_deadline_passed")) {
        setSaveState("failed");
        setLocked(true);
      } else {
        setSaveState("failed");
      }
    } finally {
      savingRef.current = false;
      if (queuedRef.current) {
        queuedRef.current = false;
        void persist();
      }
    }
  }, [answers, attemptId, revision, online, locked, submitted]);

  // Debounced trigger when answers change
  useEffect(() => {
    if (!initedRef.current || locked || submitted) return;
    setSaveState((s) => (s === "saved" ? "unsaved" : s));
    const t = setTimeout(() => { void persist(); }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers]);

  // Retry when reconnecting
  useEffect(() => {
    if (online && saveState === "offline") void persist();
  }, [online, saveState, persist]);

  // ── Timer-driven expiry submission ───────────────────────────────────
  useEffect(() => {
    if (secondsLeft === null || locked || submitted) return;
    if (secondsLeft > 0) return;
    setLocked(true);
    (async () => {
      try {
        await submitQuizAttempt({ attemptId: attemptId!, answers: null });
        setSubmitted(true);
        qc.invalidateQueries({ queryKey: ["quiz-student", "list", currentTenantId, classId] });
        toast.info("Time's up — your saved answers were submitted.");
      } catch (err) {
        const msg = mapQuizError(err);
        toast.error(msg);
      }
    })();
  }, [secondsLeft, locked, submitted, attemptId, qc, currentTenantId, classId]);

  // Exit protection
  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (submitted || locked) return;
      if (saveState !== "saved") { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [saveState, submitted, locked]);

  const reloadServer = useCallback(async () => {
    initedRef.current = false;
    await qc.invalidateQueries({ queryKey });
    setSaveState("saved");
  }, [qc, queryKey]);

  const doSubmit = useCallback(async () => {
    if (!attemptId || submitting) return;
    setSubmitting(true);
    try {
      // Persist latest snapshot if unsaved.
      if (saveState !== "saved") await persist();
      await submitQuizAttempt({ attemptId, answers });
      setSubmitted(true);
      setLocked(true);
      qc.invalidateQueries({ queryKey: ["quiz-student", "list", currentTenantId, classId] });
      toast.success("Quiz submitted.");
    } catch (err) {
      const msg = mapQuizError(err);
      if (msg === "Something went wrong. Please try again.") showSupabaseError(err);
      else toast.error(msg);
    } finally {
      setSubmitting(false);
      setConfirmOpen(false);
    }
  }, [attemptId, answers, persist, qc, saveState, submitting, currentTenantId, classId]);

  // ── Render ───────────────────────────────────────────────────────────
  if (attemptQ.isLoading || classCtx.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }
  if (attemptQ.isError || !attemptQ.data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <Card className="max-w-md p-8 text-center rounded-3xl">
          <AlertCircle className="w-8 h-8 mx-auto text-destructive mb-2" />
          <h1 className="font-semibold text-slate-900 mb-1">This attempt isn't available</h1>
          <p className="text-sm text-slate-500 mb-4">
            {mapQuizError(attemptQ.error) || "It may have been submitted, cancelled, or belongs to another user."}
          </p>
          <Button onClick={() => navigate(`/dashboard/classes/${classId}/quizzes`)} className="rounded-full">
            Back to quizzes
          </Button>
        </Card>
      </div>
    );
  }

  const payload = attemptQ.data;
  const q = payload.questions[current];
  const unanswered = payload.questions.filter((qq) => !answers[qq.id]).length;

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <Card className="max-w-md p-8 text-center rounded-3xl">
          <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-emerald-500/15 flex items-center justify-center">
            <CheckCircle2 className="w-7 h-7 text-emerald-600" />
          </div>
          <h1 className="font-semibold text-slate-900 mb-1">Quiz submitted</h1>
          <p className="text-sm text-slate-500 mb-4">
            Your answers have been recorded. Results will appear based on your tutor's settings.
          </p>
          <Button onClick={() => navigate(`/dashboard/classes/${classId}/quizzes`)} className="rounded-full">
            Back to quizzes
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-30 bg-white/85 backdrop-blur border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-slate-500 truncate">Question {current + 1} of {payload.questions.length}</p>
            <h1 className="text-base sm:text-lg font-semibold text-slate-900 truncate">{payload.quiz.title}</h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {secondsLeft !== null && (
              <Badge className={cn(
                "rounded-full gap-1 border-0",
                secondsLeft <= 60 ? "bg-destructive/15 text-destructive" :
                secondsLeft <= 300 ? "bg-amber-500/15 text-amber-700" :
                "bg-primary/10 text-primary",
              )}>
                <Clock className="w-3.5 h-3.5" /> {fmtTime(secondsLeft)}
              </Badge>
            )}
            <SaveIndicator state={saveState} />
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        {saveState === "conflict" && (
          <Card className="p-4 rounded-2xl border-amber-300 bg-amber-50 text-amber-900 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-medium">Your answers were updated elsewhere</p>
              <p className="text-sm">Reload the latest saved answers to continue safely.</p>
            </div>
            <Button size="sm" onClick={reloadServer} className="rounded-full">Reload</Button>
          </Card>
        )}
        {!online && (
          <Card className="p-3 rounded-2xl border-slate-300 bg-slate-100 text-slate-700 flex items-center gap-2 text-sm">
            <WifiOff className="w-4 h-4" /> Offline — your answers will save when you reconnect.
          </Card>
        )}

        {q && (
          <Card className="p-5 sm:p-6 rounded-3xl">
            <h2 className="text-base sm:text-lg font-medium text-slate-900 whitespace-pre-wrap">{q.prompt}</h2>
            <div className="mt-4 space-y-2">
              {q.question_type === "true_false"
                ? ["true", "false"].map((val) => (
                    <OptionButton
                      key={val}
                      selected={answers[q.id] === val}
                      onClick={() => setAnswers((a) => ({ ...a, [q.id]: val }))}
                      label={val === "true" ? "True" : "False"}
                    />
                  ))
                : q.options.map((o) => (
                    <OptionButton
                      key={o.id}
                      selected={answers[q.id] === o.id}
                      onClick={() => setAnswers((a) => ({ ...a, [q.id]: o.id }))}
                      label={o.text}
                    />
                  ))}
            </div>
          </Card>
        )}

        <div className="flex items-center justify-between gap-3">
          <Button variant="outline" className="rounded-full" onClick={() => setCurrent((c) => Math.max(0, c - 1))} disabled={current === 0}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Previous
          </Button>
          {current < payload.questions.length - 1 ? (
            <Button className="rounded-full" onClick={() => setCurrent((c) => Math.min(payload.questions.length - 1, c + 1))}>
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button className="rounded-full" onClick={() => setConfirmOpen(true)}>
              Submit quiz
            </Button>
          )}
        </div>

        <div className="pt-2">
          <p className="text-xs text-slate-500 mb-2">Question navigator</p>
          <div className="flex flex-wrap gap-1.5">
            {payload.questions.map((qq, i) => {
              const done = !!answers[qq.id];
              const active = i === current;
              return (
                <button
                  key={qq.id}
                  onClick={() => setCurrent(i)}
                  className={cn(
                    "w-9 h-9 rounded-full text-sm font-medium border transition",
                    active ? "bg-primary text-primary-foreground border-primary" :
                    done ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                    "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
                  )}
                  aria-label={`Question ${i + 1}${done ? " answered" : " unanswered"}`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit quiz?</AlertDialogTitle>
            <AlertDialogDescription>
              {unanswered > 0
                ? `You have ${unanswered} unanswered question${unanswered === 1 ? "" : "s"}. You won't be able to change your answers after submitting.`
                : "You won't be able to change your answers after submitting."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={doSubmit} disabled={submitting}>
              {submitting ? "Submitting…" : "Submit"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function OptionButton({ selected, onClick, label }: { selected: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-2xl border px-4 py-3 transition min-h-[52px]",
        selected
          ? "bg-primary text-primary-foreground border-primary shadow-sm"
          : "bg-white border-slate-200 hover:border-primary/40 hover:bg-primary/5",
      )}
      aria-pressed={selected}
    >
      <span className="font-medium whitespace-pre-wrap break-words">{label}</span>
    </button>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  const map: Record<SaveState, { label: string; cls: string; icon: React.ReactNode }> = {
    saving:   { label: "Saving…",  cls: "text-slate-500",    icon: <Loader2 className="w-3.5 h-3.5 animate-spin" /> },
    saved:    { label: "Saved",    cls: "text-emerald-600",  icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
    unsaved:  { label: "Unsaved",  cls: "text-slate-500",    icon: <Save className="w-3.5 h-3.5" /> },
    failed:   { label: "Save failed", cls: "text-destructive", icon: <AlertCircle className="w-3.5 h-3.5" /> },
    conflict: { label: "Conflict", cls: "text-amber-700",    icon: <AlertCircle className="w-3.5 h-3.5" /> },
    offline:  { label: "Offline",  cls: "text-slate-500",    icon: <WifiOff className="w-3.5 h-3.5" /> },
  };
  const s = map[state];
  return <span className={cn("inline-flex items-center gap-1 text-xs font-medium", s.cls)}>{s.icon}{s.label}</span>;
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default StudentQuizAttempt;
