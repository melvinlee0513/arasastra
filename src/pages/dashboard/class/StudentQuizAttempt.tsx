import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle, ChevronLeft, ChevronRight, CheckCircle2, Loader2, WifiOff, Save, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuizSubmitSheet } from "@/components/quiz/QuizSubmitSheet";
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
import { QUIZ_ART } from "@/lib/quizArt";
import { QuizAnswerInput } from "@/components/quiz/QuizAnswerInput";
import { hasAnswer, type AnswerValue } from "@/lib/quizAnswers";
import {
  ArenaAnswerGrid,
  ArenaArt,
  ArenaChip,
  ArenaCountdown,
  ArenaPanel,
  ArenaProgress,
  ArenaStatusCard,
  QuizArenaShell,
} from "@/components/quiz/QuizArena";

type SaveState = "unsaved" | "saving" | "saved" | "failed" | "conflict" | "offline";

/**
 * Ceiling on consecutive autosave retries. Past this the UI shows a failed state
 * and waits for a user action instead of hammering the Data API.
 */
const MAX_SAVE_FAILURES = 4;

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
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
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
  const totalSecondsRef = useRef<number | null>(null);
  /** Consecutive autosave failures — drives backoff and the retry ceiling. */
  const failuresRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * The exact answers object handed to us by the server. Autosave compares
   * against this by reference so hydrating an attempt stays a pure read —
   * writing the server's own answers back on every mount would be a save storm
   * on the RPC that caused the connection-pool incident.
   */
  const hydratedAnswersRef = useRef<Record<string, AnswerValue> | null>(null);

  // Initialise from server payload once loaded (or on refetch after conflict).
  useEffect(() => {
    if (!attemptQ.data || initedRef.current) return;
    const p: StudentAttemptPayload = attemptQ.data;
    const saved = p.attempt.saved_answers ?? {};
    hydratedAnswersRef.current = saved;
    setAnswers(saved);
    setRevision(p.attempt.progress_revision);
    setDeadline(p.attempt.deadline);
    if (p.attempt.status !== "in_progress") {
      setSubmitted(true);
      setLocked(true);
    } else {
      // Resume where the student stopped: the first question with no saved
      // answer, or the last question when every answer is already in.
      const qs = p.questions ?? [];
      if (qs.length > 0) {
        const firstUnanswered = qs.findIndex((qq) => !saved[qq.id]);
        setCurrent(firstUnanswered === -1 ? qs.length - 1 : firstUnanswered);
      }
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

  // Remember the largest observed remaining time so the ring has a sane total.
  if (secondsLeft !== null) {
    totalSecondsRef.current = Math.max(totalSecondsRef.current ?? 0, secondsLeft);
  }

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
  //
  // Autosave MUST never turn into a request storm: `save_quiz_progress` takes a
  // row lock on the attempt, so uncontrolled concurrent/immediate retries can
  // pile up on the shared Data API connection pool and stall unrelated traffic
  // (this caused a production bootstrap outage). Invariants enforced here:
  //   - at most one save in flight (savingRef)
  //   - a queued save is scheduled, never recursed into synchronously
  //   - consecutive failures back off, and stop after a bounded number of tries
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
      failuresRef.current = 0;
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? "";
      failuresRef.current += 1;
      if (msg.includes("progress_revision_conflict")) {
        // Another session owns this attempt — never retry, ask the user to reload.
        queuedRef.current = false;
        setSaveState("conflict");
      } else if (msg.includes("attempt_deadline_passed")) {
        queuedRef.current = false;
        setSaveState("failed");
        setLocked(true);
      } else {
        setSaveState("failed");
      }
    } finally {
      savingRef.current = false;
      if (queuedRef.current && failuresRef.current < MAX_SAVE_FAILURES) {
        queuedRef.current = false;
        // Back off on failures; never re-enter synchronously.
        const delay = failuresRef.current === 0
          ? 250
          : Math.min(8_000, 1_000 * 2 ** (failuresRef.current - 1));
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        retryTimerRef.current = setTimeout(() => { void persist(); }, delay);
      }
    }
  }, [answers, attemptId, revision, online, locked, submitted]);

  // Clear any pending retry when the attempt view goes away.
  useEffect(() => () => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
  }, []);

  // Debounced trigger when answers change
  useEffect(() => {
    if (!initedRef.current || locked || submitted) return;
    // Restoring an attempt is a read. The first post-hydration render still
    // holds the server's own object, so there is nothing new to persist.
    if (answers === hydratedAnswersRef.current) return;
    setSaveState((s) => (s === "saved" ? "unsaved" : s));
    const t = setTimeout(() => { void persist(); }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers]);

  // Retry once when reconnecting (guarded so it cannot loop on `persist` identity)
  useEffect(() => {
    if (!online || saveState !== "offline") return;
    void persist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

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
        navigate(`/dashboard/classes/${classId}/quizzes/${quizId}/results/${attemptId}`, { replace: true });
      } catch (err) {
        const msg = mapQuizError(err);
        toast.error(msg);
      }
    })();
  }, [secondsLeft, locked, submitted, attemptId, quizId, qc, currentTenantId, classId, navigate]);

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
      navigate(`/dashboard/classes/${classId}/quizzes/${quizId}/results/${attemptId}`, { replace: true });
    } catch (err) {
      const msg = mapQuizError(err);
      if (msg === "Something went wrong. Please try again.") showSupabaseError(err);
      else toast.error(msg);
    } finally {
      setSubmitting(false);
      setConfirmOpen(false);
    }
  }, [attemptId, quizId, classId, navigate, answers, persist, qc, saveState, submitting, currentTenantId]);

  const quizzesHref = `/dashboard/classes/${classId}/quizzes`;
  const resultsHref = `/dashboard/classes/${classId}/quizzes/${quizId}/results/${attemptId}`;

  /**
   * Reopening an already-submitted attempt must never present an editable
   * arena. Send the student to the result route, which is what applies the
   * quiz's result_visibility rules.
   */
  const alreadySubmitted =
    !!attemptQ.data && attemptQ.data.attempt.status !== "in_progress";
  useEffect(() => {
    if (alreadySubmitted) navigate(resultsHref, { replace: true });
  }, [alreadySubmitted, navigate, resultsHref]);

  // ── Render ───────────────────────────────────────────────────────────
  if (attemptQ.isLoading || classCtx.isLoading) {
    return (
      <QuizArenaShell className="items-center justify-center">
        <ArenaArt src={QUIZ_ART.owlGamingCompact} className="h-32 w-32 animate-pulse" />
        <p className="mt-4 flex items-center gap-2 text-[13.5px] font-semibold text-quiz-arena-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your quiz…
        </p>
      </QuizArenaShell>
    );
  }

  if (attemptQ.isError || !attemptQ.data) {
    const rawMessage =
      attemptQ.error instanceof Error ? attemptQ.error.message : String(attemptQ.error ?? "");
    if (import.meta.env.DEV && attemptQ.error) {
      // Safe developer diagnostics only — never rendered to students.
      console.warn("[quiz-attempt] load failed", { attemptId, quizId, classId, rawMessage });
    }
    const knownStates: Array<{ match: string; title: string; body: string }> = [
      { match: "not_authenticated", title: "Please sign in again", body: "Your session expired. Sign in and reopen this quiz." },
      { match: "attempt_not_found", title: "Attempt not found", body: "This attempt doesn't exist, or it belongs to a different account." },
      { match: "quiz_unavailable", title: "Quiz unavailable", body: "This quiz is no longer published for your class." },
      { match: "quiz_not_available", title: "Not open yet", body: "This quiz hasn't opened yet. Check back later." },
      { match: "quiz_past_due", title: "Quiz closed", body: "This quiz is past its due date." },
      { match: "not enrolled", title: "No longer enrolled", body: "You're no longer enrolled in this class." },
      { match: "attempt_not_editable", title: "Already submitted", body: "This attempt has been submitted. Open your result instead." },
    ];
    const state = knownStates.find((s) => rawMessage.includes(s.match));
    const canRetry = !state;
    return (
      <ArenaStatusCard
        art={QUIZ_ART.owlTeary}
        title={state?.title ?? "We couldn't load this attempt"}
        body={
          state?.body ??
          "Something interrupted loading. Your saved answers are safe — try again in a moment."
        }
        action={
          <>
            {canRetry && (
              <Button onClick={() => void attemptQ.refetch()} className="rounded-full">
                Try again
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => navigate(quizzesHref)}
              className="rounded-full"
            >
              Back to quizzes
            </Button>
          </>
        }
      />
    );
  }

  const payload = attemptQ.data;

  if (!payload.questions.length) {
    return (
      <ArenaStatusCard
        art={QUIZ_ART.hourglass}
        title="No questions yet"
        body="Your tutor hasn't added any questions to this quiz. Nothing to answer right now."
        action={
          <Button onClick={() => navigate(quizzesHref)} className="rounded-full">
            Back to quizzes
          </Button>
        }
      />
    );
  }

  if (submitted) {
    return (
      <ArenaStatusCard
        art={QUIZ_ART.owlCelebratingSparkles}
        title="Quiz submitted!"
        body="Your answers have been recorded. Results appear based on your tutor's settings."
        action={
          <Button onClick={() => navigate(quizzesHref)} className="rounded-full">
            Back to quizzes
          </Button>
        }
      />
    );
  }

  const q = payload.questions[current];
  const answeredCount = payload.questions.filter((qq) => hasAnswer(answers[qq.id])).length;
  const isLast = current === payload.questions.length - 1;


  return (
    <QuizArenaShell>
      {/* Top bar */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(quizzesHref)}
          aria-label="Exit quiz"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/12 backdrop-blur transition active:scale-95"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-bold uppercase tracking-wide text-quiz-arena-muted">
            {classCtx.data?.klass?.title ?? "Quiz"}
          </p>
          <h1 className="truncate text-[15px] font-extrabold leading-tight">{payload.quiz.title}</h1>
        </div>
        {secondsLeft !== null && (
          <ArenaCountdown
            secondsLeft={secondsLeft}
            totalSeconds={Math.max(1, totalSecondsRef.current ?? secondsLeft)}
          />
        )}
      </div>

      {/* Progress + status */}
      <div className="mt-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <ArenaChip art={QUIZ_ART.xpHexagon}>
            {current + 1} / {payload.questions.length}
          </ArenaChip>
          <ArenaChip art={QUIZ_ART.goldStar} tone="good">
            {answeredCount} answered
          </ArenaChip>
          <span className="ml-auto">
            <SaveIndicator state={saveState} />
          </span>
        </div>
        <ArenaProgress value={((current + 1) / payload.questions.length) * 100} />
      </div>

      {saveState === "conflict" && (
        <ArenaPanel className="mt-4 flex items-start gap-3 border-amber-300/40 bg-amber-400/15">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" />
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-bold">Your answers were updated elsewhere</p>
            <p className="text-[13px] text-quiz-arena-muted">
              Reload the latest saved answers to continue safely.
            </p>
          </div>
          <Button size="sm" onClick={reloadServer} className="rounded-full">
            Reload
          </Button>
        </ArenaPanel>
      )}

      {!online && (
        <ArenaPanel className="mt-4 flex items-center gap-2 py-3 text-[13px]">
          <WifiOff className="h-4 w-4" /> Offline — your answers will save when you reconnect.
        </ArenaPanel>
      )}

      {/* Question */}
      <ArenaPanel className="mt-4">
        <div className="flex items-start gap-3">
          <ArenaArt src={QUIZ_ART.crystalGem} className="h-9 w-9 shrink-0" />
          <h2 className="whitespace-pre-wrap text-[16px] font-bold leading-snug">{q.prompt}</h2>
          {q.image_path && <QuestionMedia media={q} className="mt-3" />}
        </div>
      </ArenaPanel>

      <div className="mt-4">
        <QuizAnswerInput
          question={q as never}
          value={answers[q.id]}
          onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
          disabled={locked}
        />
      </div>

      {/* Question navigator */}
      <div className="mt-5">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-quiz-arena-muted">
          Question navigator
        </p>
        <div className="flex flex-wrap gap-1.5">
          {payload.questions.map((qq, i) => {
            const done = hasAnswer(answers[qq.id]);
            const active = i === current;
            return (
              <button
                key={qq.id}
                type="button"
                onClick={() => setCurrent(i)}
                aria-label={`Question ${i + 1}${done ? " answered" : " unanswered"}`}
                className={cn(
                  "h-9 w-9 rounded-full text-[13px] font-bold transition active:scale-95",
                  active
                    ? "bg-white text-quiz-arena-deep"
                    : done
                    ? "bg-quiz-correct/30 text-emerald-100"
                    : "bg-white/12 text-quiz-arena-muted",
                )}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom actions */}
      <div className="sticky bottom-0 mt-auto -mx-4 flex items-center gap-2 bg-gradient-to-t from-quiz-arena-deep via-quiz-arena-deep/90 to-transparent px-4 pb-2 pt-5 sm:-mx-6 sm:px-6">
        <Button
          variant="secondary"
          className="h-12 rounded-full px-5"
          onClick={() => setCurrent((c) => Math.max(0, c - 1))}
          disabled={current === 0}
        >
          <ChevronLeft className="mr-1 h-4 w-4" /> Back
        </Button>
        {isLast ? (
          <Button
            className="h-12 flex-1 rounded-full bg-gradient-to-r from-quiz-xp to-quiz-accent text-[15px] font-extrabold text-white"
            onClick={() => setConfirmOpen(true)}
          >
            Submit quiz
          </Button>
        ) : (
          <Button
            className="h-12 flex-1 rounded-full bg-gradient-to-r from-quiz-accent to-quiz-accent-strong text-[15px] font-extrabold text-white"
            onClick={() => setCurrent((c) => Math.min(payload.questions.length - 1, c + 1))}
          >
            Next <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        )}
      </div>

      <QuizSubmitSheet
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        answered={answeredCount}
        total={payload.questions.length}
        submitting={submitting}
        onSubmit={doSubmit}
        onReview={() => {
          const firstUnanswered = payload.questions.findIndex((qq) => !hasAnswer(answers[qq.id]));
          if (firstUnanswered !== -1) setCurrent(firstUnanswered);
          setConfirmOpen(false);
        }}
      />
    </QuizArenaShell>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  const map: Record<SaveState, { label: string; cls: string; icon: React.ReactNode }> = {
    saving:   { label: "Saving…",     cls: "text-quiz-arena-muted", icon: <Loader2 className="h-3.5 w-3.5 animate-spin" /> },
    saved:    { label: "Saved",       cls: "text-emerald-300",      icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
    unsaved:  { label: "Unsaved",     cls: "text-quiz-arena-muted", icon: <Save className="h-3.5 w-3.5" /> },
    failed:   { label: "Save failed", cls: "text-rose-300",         icon: <AlertCircle className="h-3.5 w-3.5" /> },
    conflict: { label: "Conflict",    cls: "text-amber-200",        icon: <AlertCircle className="h-3.5 w-3.5" /> },
    offline:  { label: "Offline",     cls: "text-quiz-arena-muted", icon: <WifiOff className="h-3.5 w-3.5" /> },
  };
  const s = map[state];
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11.5px] font-bold", s.cls)}>
      {s.icon}
      {s.label}
    </span>
  );
}

export default StudentQuizAttempt;
