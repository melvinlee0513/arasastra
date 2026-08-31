/**
 * Live quiz — student view (dark arena).
 *
 * One component, five server-driven states: waiting room, open question,
 * locked/waiting, reveal feedback, leaderboard, and the final results. The
 * client renders whatever the snapshot permits and nothing more — correctness
 * arrives only when the session reaches a reveal state.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Check, Clock, Flame, Loader2, LogOut, Trophy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { QUIZ_ART } from "@/lib/quizArt";
import {
  ArenaArt, ArenaChip, ArenaCountdown, ArenaPanel, ArenaProgress, ArenaStatusCard, QuizArenaShell,
} from "@/components/quiz/QuizArena";
import { QuizExplanationFlipCard } from "@/components/quiz/QuizExplanationFlipCard";
import { LiveQuizLeaderboard } from "@/components/quiz/live/LiveQuizLeaderboard";
import { useLiveQuizSession } from "@/hooks/useLiveQuizSession";
import { leaveLiveQuizSession, mapLiveQuizError, submitLiveQuizAnswer } from "@/lib/liveQuiz";

export function LiveQuizPlay() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { snapshot, isLoading, isError, error, secondsLeft, refresh } = useLiveQuizSession(sessionId);

  /** Locked the instant the student taps, so a slow network can't double-send. */
  const [pending, setPending] = useState<string | null>(null);
  const submittedFor = useRef<number | null>(null);

  const s = snapshot?.session;
  const idx = s?.current_question_index ?? -1;

  // Clear the local lock when the server moves to a new question.
  useEffect(() => {
    if (submittedFor.current !== idx) setPending(null);
  }, [idx]);

  const answerMut = useMutation({
    mutationFn: (args: { optionId?: string; answerText?: string }) =>
      submitLiveQuizAnswer({
        sessionId: sessionId!,
        questionIndex: idx,
        optionId: args.optionId ?? null,
        answerText: args.answerText ?? null,
      }),
    onSuccess: () => {
      submittedFor.current = idx;
      refresh();
    },
    onError: (err) => {
      setPending(null);
      toast.error(mapLiveQuizError(err));
      refresh();
    },
  });

  const myAnswer = snapshot?.my_answer;
  const answered = !!myAnswer?.answered || pending !== null;

  const chosenId = myAnswer?.selected_option_id ?? myAnswer?.answer_text ?? pending;

  const options = useMemo(() => {
    const q = snapshot?.question;
    if (!q) return [];
    if (q.question_type === "true_false") {
      const t = q.options.find((o) => o.text.trim().toLowerCase() === "true");
      const f = q.options.find((o) => o.text.trim().toLowerCase() === "false");
      return [
        { key: "true", text: "True", isCorrect: t?.is_correct ?? null },
        { key: "false", text: "False", isCorrect: f?.is_correct ?? null },
      ];
    }
    return q.options.map((o) => ({ key: o.id, text: o.text, isCorrect: o.is_correct }));
  }, [snapshot?.question]);

  if (isLoading) {
    return (
      <QuizArenaShell className="items-center justify-center">
        <ArenaArt src={QUIZ_ART.owlGamingCompact} className="h-32 w-32 animate-pulse" />
        <p className="mt-4 flex items-center gap-2 text-[13.5px] font-semibold text-quiz-arena-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Joining the game…
        </p>
      </QuizArenaShell>
    );
  }

  if (isError || !snapshot || !s) {
    return (
      <ArenaStatusCard
        art={QUIZ_ART.owlTeary}
        title="Game unavailable"
        body={mapLiveQuizError(error, "We couldn't load this live quiz.")}
        action={
          <Button onClick={() => navigate("/dashboard")} className="rounded-full">
            Back to dashboard
          </Button>
        }
      />
    );
  }

  // ── Removed by the host ──────────────────────────────────────────────
  // Checked before every other state: a removed player must be told what
  // happened rather than left staring at a question they can no longer answer.
  if (snapshot.my_status === "removed") {
    return (
      <ArenaStatusCard
        art={QUIZ_ART.owlSad}
        title="You were removed"
        body="Your tutor removed you from this game. Ask them if you think this was a mistake."
        action={
          <Button onClick={() => navigate("/dashboard")} className="rounded-full">
            Back to dashboard
          </Button>
        }
      />
    );
  }

  // ── Cancelled ────────────────────────────────────────────────────────
  if (s.status === "cancelled") {
    return (
      <ArenaStatusCard
        art={QUIZ_ART.owlSad}
        title="Session ended"
        body="Your tutor ended this live quiz."
        action={
          <Button onClick={() => navigate("/dashboard")} className="rounded-full">
            Back to dashboard
          </Button>
        }
      />
    );
  }

  // ── Final results ────────────────────────────────────────────────────
  if (s.status === "completed") {
    const me = snapshot.me;
    const accuracy = s.question_count > 0 && me
      ? Math.round((me.correct_count / s.question_count) * 100)
      : 0;
    return (
      <QuizArenaShell>
        <div className="mx-auto w-full max-w-md pb-[calc(env(safe-area-inset-bottom)+24px)]">
          <div className="text-center">
            <ArenaArt src={QUIZ_ART.owlCelebratingSparkles} className="mx-auto h-28 w-28" />
            <h1 className="mt-2 text-[26px] font-extrabold leading-tight">Game complete!</h1>
            <p className="mt-1 text-[13.5px] text-quiz-arena-muted">{s.quiz_title}</p>
          </div>

          <LiveQuizLeaderboard rows={snapshot.leaderboard} showPodium className="mt-5" />

          {me && (
            <ArenaPanel className="mt-4">
              <p className="text-[11px] font-bold uppercase tracking-wide text-quiz-arena-muted">
                Your results
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2.5">
                <Stat label="Final rank" value={`#${me.rank}`} art={QUIZ_ART.rankShield} />
                <Stat label="Accuracy" value={`${accuracy}%`} art={QUIZ_ART.goldStar} />
                <Stat label="Total points" value={me.score.toLocaleString()} art={QUIZ_ART.xpGem} />
                <Stat label="Best streak" value={String(me.best_streak)} art={QUIZ_ART.streakFire} />
              </div>
              <p className="mt-3 text-center text-[12px] text-quiz-arena-muted">
                {me.correct_count} of {s.question_count} correct
              </p>
            </ArenaPanel>
          )}

          <Button
            className="mt-5 h-12 w-full rounded-full bg-gradient-to-r from-quiz-accent-pink to-quiz-accent text-[15px] font-extrabold text-white"
            onClick={() => navigate("/dashboard")}
          >
            Back to quiz hub
          </Button>
        </div>
      </QuizArenaShell>
    );
  }

  // ── Waiting room ─────────────────────────────────────────────────────
  if (s.status === "lobby") {
    return (
      <QuizArenaShell>
        <div className="mx-auto w-full max-w-md">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Leave game"
              onClick={async () => {
                try { await leaveLiveQuizSession(sessionId!); } catch { /* best effort */ }
                navigate("/dashboard");
              }}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/12 backdrop-blur active:scale-95"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-bold uppercase tracking-wide text-quiz-arena-muted">
                Waiting room
              </p>
              <h1 className="truncate text-[15px] font-extrabold leading-tight">{s.quiz_title}</h1>
            </div>
          </div>

          <div className="mt-6 text-center">
            <ArenaArt src={QUIZ_ART.owlGaming} className="mx-auto h-36 w-36" />
            <h2 className="mt-3 text-[20px] font-extrabold">You're in!</h2>
            <p className="mt-1 text-[13.5px] text-quiz-arena-muted">
              Waiting for your tutor to start the quiz…
            </p>
          </div>

          {snapshot.me && (
            <ArenaPanel className="mt-5 flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/12 text-[15px] font-bold">
                {snapshot.me.avatar_url
                  ? <img src={snapshot.me.avatar_url} alt="" className="h-full w-full object-cover" />
                  : snapshot.me.display_name.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14.5px] font-bold">{snapshot.me.display_name}</p>
                <p className="text-[12px] text-quiz-arena-muted">Ready to play</p>
              </div>
            </ArenaPanel>
          )}

          <ArenaPanel className="mt-3 flex items-center justify-between">
            <span className="text-[13.5px] font-semibold">Players joined</span>
            <span className="text-[15px] font-black tabular-nums">{s.participant_count}</span>
          </ArenaPanel>
          <ArenaPanel className="mt-3 flex items-center justify-between">
            <span className="text-[13.5px] font-semibold">Questions</span>
            <span className="text-[15px] font-black tabular-nums">{s.question_count}</span>
          </ArenaPanel>
        </div>
      </QuizArenaShell>
    );
  }

  // ── Leaderboard between questions ────────────────────────────────────
  if (s.status === "leaderboard") {
    return (
      <QuizArenaShell>
        <div className="mx-auto w-full max-w-md">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-quiz-xp" />
            <h1 className="text-[18px] font-extrabold">Leaderboard</h1>
            <span className="ml-auto rounded-full bg-quiz-accent-pink px-2 py-0.5 text-[10.5px] font-black uppercase tracking-wide">
              Live
            </span>
          </div>
          {snapshot.me && (
            <ArenaPanel className="mt-4">
              <div className="flex items-center gap-3">
                <ArenaArt src={QUIZ_ART.rankShield} className="h-12 w-12 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-quiz-arena-muted">
                    Your score
                  </p>
                  <p className="text-[26px] font-black leading-none tabular-nums">
                    {snapshot.me.score.toLocaleString()}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-quiz-arena-muted">
                    Rank
                  </p>
                  <p className="text-[22px] font-black leading-none">#{snapshot.me.rank}</p>
                </div>
              </div>
            </ArenaPanel>
          )}
          <LiveQuizLeaderboard rows={snapshot.leaderboard} className="mt-4" />
          <p className="mt-4 text-center text-[12.5px] text-quiz-arena-muted">
            Waiting for the next question…
          </p>
        </div>
      </QuizArenaShell>
    );
  }

  // ── Question: open / locked / reveal ─────────────────────────────────
  const q = snapshot.question;
  const revealing = s.status === "answer_reveal";
  const iWasCorrect = myAnswer?.is_correct ?? null;

  return (
    <QuizArenaShell>
      <div className="mx-auto w-full max-w-md pb-[calc(env(safe-area-inset-bottom)+24px)]">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-bold uppercase tracking-wide text-quiz-arena-muted">
              Live quiz
            </p>
            <h1 className="truncate text-[15px] font-extrabold leading-tight">{s.quiz_title}</h1>
          </div>
          {s.status === "question_open" && secondsLeft !== null && (
            <ArenaCountdown
              secondsLeft={secondsLeft}
              totalSeconds={Math.max(1, s.seconds_per_question)}
            />
          )}
        </div>

        {/* Progress + score */}
        <div className="mt-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <ArenaChip art={QUIZ_ART.xpHexagon}>
              Q {idx + 1} / {s.question_count}
            </ArenaChip>
            {snapshot.me && (
              <>
                <ArenaChip art={QUIZ_ART.goldStar} tone="good">
                  {snapshot.me.score.toLocaleString()} pts
                </ArenaChip>
                {snapshot.me.streak > 0 && (
                  <ArenaChip art={QUIZ_ART.streakFire}>{snapshot.me.streak} streak</ArenaChip>
                )}
              </>
            )}
          </div>
          <ArenaProgress value={s.question_count ? ((idx + 1) / s.question_count) * 100 : 0} />
        </div>

        {/* Reveal banner */}
        {revealing && iWasCorrect !== null && (
          <ArenaPanel
            className={cn(
              "mt-4 flex items-center gap-3",
              iWasCorrect
                ? "border-quiz-correct/40 bg-quiz-correct/15"
                : "border-quiz-wrong/40 bg-quiz-wrong/12",
            )}
          >
            <ArenaArt
              src={iWasCorrect ? QUIZ_ART.owlCelebrating : QUIZ_ART.owlTeary}
              className="h-14 w-14 shrink-0"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[18px] font-extrabold leading-tight">
                {iWasCorrect ? "Correct!" : "Not quite!"}
              </p>
              <p className="mt-0.5 text-[13px] text-quiz-arena-muted">
                {iWasCorrect
                  ? `+${myAnswer?.points_awarded ?? 0} pts`
                  : "The correct answer is highlighted below."}
              </p>
            </div>
          </ArenaPanel>
        )}
        {revealing && iWasCorrect === null && (
          <ArenaPanel className="mt-4 text-center">
            <p className="text-[14px] font-bold">Time's up</p>
            <p className="mt-0.5 text-[12.5px] text-quiz-arena-muted">
              You didn't answer this one.
            </p>
          </ArenaPanel>
        )}

        {/* Question */}
        <ArenaPanel className="mt-4">
          <div className="flex items-start gap-3">
            <ArenaArt src={QUIZ_ART.crystalGem} className="h-9 w-9 shrink-0" />
            <h2 className="whitespace-pre-wrap text-[16px] font-bold leading-snug">
              {q?.question ?? "—"}
            </h2>
          </div>
        </ArenaPanel>

        {/* Answers */}
        <div className="mt-4 grid grid-cols-1 gap-2.5">
          {options.map((o) => {
            const mine = chosenId === o.key;
            const correct = o.isCorrect === true;
            const wrongMine = revealing && mine && o.isCorrect === false;
            return (
              <button
                key={o.key}
                type="button"
                aria-pressed={mine}
                disabled={answered || s.status !== "question_open" || answerMut.isPending}
                onClick={() => {
                  if (answered) return;
                  setPending(o.key);
                  if (q?.question_type === "true_false") {
                    answerMut.mutate({ answerText: o.key });
                  } else {
                    answerMut.mutate({ optionId: o.key });
                  }
                }}
                className={cn(
                  "flex min-h-[60px] w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition",
                  "text-[15px] font-bold active:scale-[0.99] disabled:cursor-default",
                  revealing && correct && "border-quiz-correct bg-quiz-correct/25 text-emerald-50",
                  wrongMine && "border-quiz-wrong bg-quiz-wrong/25 text-rose-50",
                  !revealing && mine && "border-quiz-accent bg-quiz-accent/30",
                  !revealing && !mine && "border-white/12 bg-white/8",
                  revealing && !correct && !wrongMine && "border-white/10 bg-white/5 text-quiz-arena-muted",
                )}
              >
                <span className="min-w-0 flex-1 break-words">{o.text}</span>
                {revealing && correct && <Check className="h-5 w-5 shrink-0 text-emerald-300" />}
                {wrongMine && <X className="h-5 w-5 shrink-0 text-rose-300" />}
                {!revealing && mine && <Check className="h-5 w-5 shrink-0" />}
              </button>
            );
          })}
        </div>

        {/* Waiting / explanation */}
        {!revealing && answered && (
          <ArenaPanel className="mt-4 flex items-center gap-2.5">
            <Clock className="h-4 w-4 shrink-0 text-quiz-arena-muted" />
            <p className="text-[13px] text-quiz-arena-muted">
              Answer locked in — waiting for everyone else…
            </p>
          </ArenaPanel>
        )}
        {!revealing && !answered && s.status !== "question_open" && (
          <ArenaPanel className="mt-4 text-center">
            <p className="text-[13px] text-quiz-arena-muted">Answers are closed.</p>
          </ArenaPanel>
        )}

        {/* Reuses the existing Learning Tip flip card rather than a second
            explanation system. Only ever fed the reveal-gated explanation. */}
        {revealing && q?.explanation && <QuizExplanationFlipCard explanation={q.explanation} />}

        {snapshot.me && revealing && (
          <ArenaPanel className="mt-4 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold">
              <Flame className="h-4 w-4 text-quiz-streak" /> {snapshot.me.streak} streak
            </span>
            <span className="text-[13px] font-semibold">Rank #{snapshot.me.rank}</span>
          </ArenaPanel>
        )}

        <p className="mt-5 text-center text-[12px] text-quiz-arena-muted">
          Your tutor controls when the quiz moves on.
        </p>
      </div>
    </QuizArenaShell>
  );
}

function Stat({ label, value, art }: { label: string; value: string; art: string }) {
  return (
    <div className="rounded-2xl bg-white/6 px-3 py-2.5">
      <div className="flex items-center gap-1.5">
        <ArenaArt src={art} className="h-5 w-5 shrink-0" />
        {/* 11px floor: these are the labels that name the numbers, so they
            have to stay readable rather than shrink to fit. */}
        <p className="text-[11px] font-bold uppercase tracking-wide text-quiz-arena-muted">
          {label}
        </p>
      </div>
      <p className="mt-1 text-[19px] font-black leading-none tabular-nums">{value}</p>
    </div>
  );
}

export default LiveQuizPlay;
