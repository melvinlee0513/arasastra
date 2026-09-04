import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  XCircle,
  Circle,
  ArrowLeft,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useClassContext } from "@/hooks/useClassContext";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/hooks/useAuth";
import {
  getQuizResult,
  mapQuizError,
  RESULT_VISIBILITY_LABEL,
  quizStudentKeys,
  resultChosenOptionIds as chosenIds,
  resultCorrectAnswerText as correctText,
  type QuizResultPayload,
} from "@/lib/quizzes";
import { cn } from "@/lib/utils";
import { QUIZ_ART } from "@/lib/quizArt";
import {
  ArenaArt,
  ArenaChip,
  ArenaPanel,
  ArenaProgress,
  ArenaStatusCard,
  QuizArenaShell,
} from "@/components/quiz/QuizArena";
import { QuizExplanationFlipCard } from "@/components/quiz/QuizExplanationFlipCard";

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
    // A tutor releasing results elsewhere only reaches this tab on
    // mount/focus/reconnect, so opt out of the global no-focus-refetch default.
    staleTime: 15_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
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

  const backHref = `/dashboard/classes/${params.classId}/quizzes`;

  const backAction = (
    <Button asChild className="rounded-full">
      <Link to={backHref}>Back to quizzes</Link>
    </Button>
  );

  if (!routeValid) {
    return (
      <ArenaStatusCard
        art={QUIZ_ART.owlTeary}
        title="Invalid link"
        body="This result link isn't valid. Please open it from your quiz list."
        action={backAction}
      />
    );
  }

  if (resultQ.isLoading) {
    return (
      <QuizArenaShell className="items-center justify-center">
        <ArenaArt src={QUIZ_ART.owlGamingCompact} className="h-32 w-32 animate-pulse" />
        <p className="mt-4 flex items-center gap-2 text-[13.5px] font-semibold text-quiz-arena-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your result…
        </p>
      </QuizArenaShell>
    );
  }

  if (resultQ.isError) {
    return (
      <ArenaStatusCard
        art={QUIZ_ART.owlSad}
        title="Couldn't load result"
        body={mapQuizError(resultQ.error) || "Please try again in a moment."}
        action={
          <Button
            onClick={() => {
              setPollCount(0);
              void resultQ.refetch();
            }}
            className="rounded-full"
          >
            Retry
          </Button>
        }
      />
    );
  }

  if (routeMismatch) {
    return (
      <ArenaStatusCard
        art={QUIZ_ART.owlTeary}
        title="Link doesn't match this attempt"
        body="This result belongs to a different class or quiz. Please open it from your quiz list."
        action={backAction}
      />
    );
  }

  const data = resultQ.data!;

  if (data.status === "no_result") {
    if (!pollExhausted) {
      return (
        <ArenaStatusCard
          art={QUIZ_ART.hourglass}
          title="Finalising your result…"
          body="Your submission is being scored. This usually takes a few seconds."
        />
      );
    }
    return (
      <ArenaStatusCard
        art={QUIZ_ART.hourglass}
        title="Result not available yet"
        body="We couldn't find a scored result for this attempt. If this persists, contact your tutor."
        action={
          <Button
            onClick={() => {
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
            className="rounded-full"
          >
            Retry
          </Button>
        }
      />
    );
  }

  if (data.status === "not_submitted") {
    return (
      <ArenaStatusCard
        art={QUIZ_ART.hourglass}
        title="Attempt not submitted"
        body="This attempt hasn't been submitted yet."
        action={backAction}
      />
    );
  }

  if (data.status === "hidden") {
    const label = RESULT_VISIBILITY_LABEL[data.visibility] ?? "Later";
    return (
      <ArenaStatusCard
        art={QUIZ_ART.completionCheck}
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
        action={backAction}
      />
    );
  }

  const pct = typeof data.percentage === "number" ? Math.round(data.percentage) : null;
  const correctCount = data.questions.filter((q) => q.is_correct).length;
  const strong = (pct ?? 0) >= 60;

  return (
    <QuizArenaShell>
      <div className="flex items-center gap-3">
        <Button
          asChild
          variant="secondary"
          size="sm"
          className="h-10 rounded-full px-4"
        >
          <Link to={backHref}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Quizzes
          </Link>
        </Button>
        <p className="min-w-0 flex-1 truncate text-[11px] font-bold uppercase tracking-wide text-quiz-arena-muted">
          {classCtx.data?.klass?.title ?? "Class"}
        </p>
      </div>

      {/* Score hero */}
      <ArenaPanel className="mt-4 text-center">
        <ArenaArt
          src={strong ? QUIZ_ART.owlCelebratingSparkles : QUIZ_ART.owlTeary}
          className="mx-auto h-32 w-32 drop-shadow-[0_16px_28px_rgba(0,0,0,0.5)]"
        />
        <h1 className="mt-1 text-[20px] font-black">
          {strong ? "Great work!" : "Quiz complete"}
        </h1>
        <div className="mt-2 flex items-end justify-center gap-1.5">
          <span className="text-[42px] font-black leading-none">{data.total_points}</span>
          <span className="pb-1 text-[15px] font-bold text-quiz-arena-muted">
            / {data.max_points} pts
          </span>
        </div>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {pct !== null && <ArenaChip art={QUIZ_ART.xpHexagon}>{pct}%</ArenaChip>}
          <ArenaChip art={QUIZ_ART.goldStar} tone="good">
            {correctCount} / {data.total_questions} correct
          </ArenaChip>
        </div>
        {pct !== null && (
          <div className="mt-4">
            <ArenaProgress value={pct} />
          </div>
        )}
        <p className="mt-3 text-[12px] text-quiz-arena-muted">
          Submitted {new Date(data.completed_at).toLocaleString()}
          {data.submission_reason && data.submission_reason !== "manual" && (
            <>
              {" · "}
              {data.submission_reason === "auto_expired"
                ? "auto-submitted (time up)"
                : data.submission_reason}
            </>
          )}
        </p>
      </ArenaPanel>

      {/* Answer review */}
      <div className="mt-4 space-y-3 pb-4">
        {data.questions.map((q, idx) => (
          <ArenaPanel key={q.question_id}>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-black",
                  q.is_correct
                    ? "bg-quiz-correct/30 text-emerald-100"
                    : q.selected_option_id || q.selected_answer
                    ? "bg-quiz-wrong/30 text-rose-100"
                    : "bg-white/12 text-quiz-arena-muted",
                )}
              >
                {idx + 1}
              </span>
              {q.is_correct ? (
                <ArenaChip tone="good">+{q.points_awarded} pts</ArenaChip>
              ) : (
                <ArenaChip tone="danger">0 / {q.points} pts</ArenaChip>
              )}
            </div>

            <p className="whitespace-pre-wrap text-[15px] font-bold leading-snug">{q.prompt}</p>
            {q.image_path && <QuestionMedia media={q} className="mt-3" />}

            {q.options.length > 0 ? (
              <ul className="mt-3 space-y-1.5">
                {q.options.map((o) => {
                  // A multiple select stores its picks as a JSON array in
                  // selected_answer, not in selected_option_id, so comparing
                  // against that column alone marked none of them as the
                  // student's own.
                  const isSelected = chosenIds(q).includes(o.id);
                  return (
                    <li
                      key={o.id}
                      className={cn(
                        "flex items-start gap-2 rounded-2xl border px-3 py-2 text-[13.5px]",
                        o.is_correct
                          ? "border-quiz-correct/50 bg-quiz-correct/15 text-emerald-50"
                          : isSelected
                          ? "border-quiz-wrong/50 bg-quiz-wrong/15 text-rose-50"
                          : "border-white/10 bg-white/5 text-quiz-arena-muted",
                      )}
                    >
                      {o.is_correct ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                      ) : isSelected ? (
                        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
                      ) : (
                        <Circle className="mt-0.5 h-4 w-4 shrink-0 opacity-60" />
                      )}
                      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{o.text}</span>
                      {isSelected && (
                        <span className="shrink-0 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide">
                          You
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="mt-3 space-y-2 text-[13.5px]">
                <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                  <p className="mb-0.5 text-[10.5px] font-black uppercase tracking-wide text-quiz-arena-muted">
                    Your answer
                  </p>
                  <p className="whitespace-pre-wrap">
                    {q.selected_answer
                      ? q.selected_answer + (q.answer_unit ? ` ${q.answer_unit}` : "")
                      : "— no answer —"}
                  </p>
                </div>
                {/* The key lives in a different column for each of the Phase 5
                    types, and in none of them is it `correct_answer`. Reading
                    only that column left a student who got a short answer or a
                    numeric question wrong with nothing to learn from. */}
                {correctText(q) && (
                  <div className="rounded-2xl border border-quiz-correct/50 bg-quiz-correct/15 px-3 py-2">
                    <p className="mb-0.5 text-[10.5px] font-black uppercase tracking-wide text-emerald-200">
                      {q.accepted_answers && q.accepted_answers.length > 1
                        ? "Accepted answers"
                        : "Correct answer"}
                    </p>
                    <p className="whitespace-pre-wrap text-emerald-50">{correctText(q)}</p>
                  </div>
                )}
              </div>
            )}

            <QuizExplanationFlipCard explanation={q.explanation} />
          </ArenaPanel>
        ))}
      </div>

      <div className="mt-auto pt-2">
        <Button asChild className="h-12 w-full rounded-full bg-gradient-to-r from-quiz-xp to-quiz-accent text-[15px] font-extrabold text-white">
          <Link to={backHref}>Back to quizzes</Link>
        </Button>
      </div>
    </QuizArenaShell>
  );
}

export default StudentQuizResult;
