/**
 * Live quiz — host view (dark arena).
 *
 * One screen for the whole session: lobby while waiting, then an operational
 * control panel through each question. Every transition goes through
 * `advance_live_quiz_session` with the state revision we last saw, so a double
 * tap can never skip a question.
 */
import { useCallback, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import {
  Check, Copy, Eye, Loader2, Lock, LogOut, Play, SkipForward, Trophy, Users, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { QUIZ_ART } from "@/lib/quizArt";
import {
  ArenaArt, ArenaChip, ArenaPanel, ArenaProgress, ArenaStatusCard, QuizArenaShell,
} from "@/components/quiz/QuizArena";
import { useLiveQuizSession } from "@/hooks/useLiveQuizSession";
import {
  advanceLiveQuizSession, mapLiveQuizError, removeLiveQuizParticipant,
  type LiveQuizAction,
} from "@/lib/liveQuiz";
import { LiveQuizLeaderboard } from "@/components/quiz/live/LiveQuizLeaderboard";
import { LiveQuizResponseBars } from "@/components/quiz/live/LiveQuizResponseBars";
import { LiveQuizPlayerList } from "@/components/quiz/live/LiveQuizPlayerList";

export function LiveQuizHost({ variant }: { variant: "tutor" | "admin" }) {
  const { classId, sessionId } = useParams<{ classId: string; sessionId: string }>();
  const navigate = useNavigate();
  const { snapshot, isLoading, isError, error, secondsLeft, refresh } = useLiveQuizSession(sessionId);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const basePath = variant === "admin" ? `/admin/classes/${classId}` : `/tutor/classes/${classId}`;

  const joinUrl = useMemo(() => {
    if (!snapshot?.session.game_code) return "";
    return `${window.location.origin}/dashboard/quiz/join?code=${snapshot.session.game_code}`;
  }, [snapshot?.session.game_code]);

  const advance = useMutation({
    mutationFn: (action: LiveQuizAction) =>
      advanceLiveQuizSession({
        sessionId: sessionId!,
        action,
        // Optimistic guard: the server rejects if the session already moved.
        expectedRevision: snapshot?.session.state_revision ?? null,
      }),
    onSuccess: () => refresh(),
    onError: (err) => {
      toast.error(mapLiveQuizError(err));
      refresh();
    },
  });

  const [removingId, setRemovingId] = useState<string | null>(null);
  const removeMut = useMutation({
    mutationFn: (participantId: string) => {
      setRemovingId(participantId);
      return removeLiveQuizParticipant({ sessionId: sessionId!, participantId });
    },
    onSettled: () => setRemovingId(null),
    onSuccess: () => refresh(),
    onError: (err) => {
      toast.error(mapLiveQuizError(err, "Couldn't remove that player."));
      refresh();
    },
  });

  const copy = useCallback(async (text: string, what: "code" | "link") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      toast.error("Couldn't copy — select and copy manually.");
    }
  }, []);

  if (isLoading) {
    return (
      <QuizArenaShell className="items-center justify-center">
        <ArenaArt src={QUIZ_ART.owlGamingCompact} className="h-32 w-32 animate-pulse" />
        <p className="mt-4 flex items-center gap-2 text-[13.5px] font-semibold text-quiz-arena-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading session…
        </p>
      </QuizArenaShell>
    );
  }

  if (isError || !snapshot) {
    return (
      <ArenaStatusCard
        art={QUIZ_ART.owlTeary}
        title="Session unavailable"
        body={mapLiveQuizError(error, "We couldn't load this live session.")}
        action={
          <Button onClick={() => navigate(`${basePath}/quizzes`)} className="rounded-full">
            Back to quizzes
          </Button>
        }
      />
    );
  }

  const s = snapshot.session;
  const total = s.question_count;
  const idx = s.current_question_index;
  const inLobby = s.status === "lobby";
  const finished = s.status === "completed" || s.status === "cancelled";

  if (finished) {
    return (
      <QuizArenaShell>
        <div className="mx-auto w-full max-w-2xl">
          <div className="text-center">
            <ArenaArt src={QUIZ_ART.trophyPodium} className="mx-auto h-28 w-28" />
            <h1 className="mt-3 text-[24px] font-extrabold">
              {s.status === "cancelled" ? "Session cancelled" : "Game complete"}
            </h1>
            <p className="mt-1 text-[13.5px] text-quiz-arena-muted">{s.quiz_title}</p>
          </div>
          {s.status === "completed" && (
            <>
              {/* Session summary — every figure is derived by the server from
                  the answers actually recorded. Average accuracy is omitted
                  rather than guessed when it isn't derivable. */}
              {s.summary && (
                <ArenaPanel className="mt-5 p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-quiz-arena-muted">
                    Session summary
                  </p>
                  <dl className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      { k: "Players", v: s.summary.players.toLocaleString() },
                      { k: "Questions", v: s.summary.questions.toLocaleString() },
                      { k: "Average score", v: s.summary.average_score.toLocaleString() },
                      {
                        k: "Average accuracy",
                        v: s.summary.average_accuracy_pct === null
                          ? "—"
                          : `${s.summary.average_accuracy_pct}%`,
                      },
                    ].map((x) => (
                      <div key={x.k} className="rounded-2xl bg-white/6 px-3 py-2.5">
                        <dt className="text-[11px] font-semibold text-quiz-arena-muted">{x.k}</dt>
                        <dd className="mt-0.5 text-[17px] font-black tabular-nums">{x.v}</dd>
                      </div>
                    ))}
                  </dl>
                </ArenaPanel>
              )}
              <div className="mt-4">
                <LiveQuizLeaderboard rows={snapshot.leaderboard} showPodium />
              </div>
            </>
          )}
          {s.status === "completed" && (
            <p className="mt-4 text-center text-[12px] leading-snug text-quiz-arena-muted">
              These standings are this session's record. The quiz results page tracks solo
              attempts, which are counted separately.
            </p>
          )}

          <div className="mt-5">
            <Button
              className="h-12 w-full rounded-full bg-gradient-to-r from-quiz-accent-pink to-quiz-accent text-[15px] font-extrabold text-white"
              onClick={() => navigate(`${basePath}/quizzes`)}
            >
              Return to quiz manager
            </Button>
          </div>
        </div>
      </QuizArenaShell>
    );
  }

  return (
    <QuizArenaShell>
      <div className="mx-auto w-full max-w-2xl pb-[calc(env(safe-area-inset-bottom)+96px)]">
        {/* Top bar */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setConfirmCancel(true)}
            aria-label="Cancel session"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/12 backdrop-blur active:scale-95"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            {/* The header used to read "Quiz lobby" for the whole game, long
                after the lobby was over. */}
            <p className="truncate text-[11px] font-bold uppercase tracking-wide text-quiz-arena-muted">
              {inLobby ? "Quiz lobby · hosting" : "Live · hosting"}
            </p>
            <h1 className="truncate text-[15px] font-extrabold leading-tight">{s.quiz_title}</h1>
          </div>
          <ArenaChip art={QUIZ_ART.xpHexagon}>{s.participant_count} joined</ArenaChip>
        </div>

        {inLobby ? (
          <>
            {/* Game code */}
            <ArenaPanel className="mt-4">
              <p className="text-[11px] font-bold uppercase tracking-wide text-quiz-arena-muted">
                Game code
              </p>
              <p className="mt-1 text-[13px] text-quiz-arena-muted">
                Share this with your students so they can join.
              </p>
              <p className="mt-3 text-center text-[40px] font-black leading-none tracking-[0.16em] tabular-nums">
                {s.game_code}
              </p>
              {/* `flex-1` is applied only from sm up. In the stacked column it
                  sets flex-basis:0 on the MAIN (vertical) axis, which collapsed
                  both buttons to 37px — under the 44px touch minimum — on every
                  phone width. */}
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Button
                  onClick={() => copy(s.game_code ?? "", "code")}
                  className="h-12 min-h-[48px] shrink-0 rounded-full bg-white/12 text-[14px] font-bold text-quiz-arena-foreground hover:bg-white/20 sm:flex-1"
                >
                  {copied === "code" ? <Check className="mr-1.5 h-4 w-4" /> : <Copy className="mr-1.5 h-4 w-4" />}
                  Copy code
                </Button>
                <Button
                  onClick={() => copy(joinUrl, "link")}
                  className="h-12 min-h-[48px] shrink-0 rounded-full bg-gradient-to-r from-quiz-accent-pink to-quiz-accent text-[14px] font-bold text-white sm:flex-1"
                >
                  {copied === "link" ? <Check className="mr-1.5 h-4 w-4" /> : <Copy className="mr-1.5 h-4 w-4" />}
                  Copy join link
                </Button>
              </div>
            </ArenaPanel>

            {/* QR — generated from the real join URL */}
            {joinUrl && (
              <ArenaPanel className="mt-4 flex items-center gap-4">
                <div className="rounded-2xl bg-white p-2.5">
                  <QRCodeSVG value={joinUrl} size={104} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-bold">Join via QR</p>
                  <p className="mt-0.5 text-[12.5px] leading-snug text-quiz-arena-muted">
                    Students can scan to open the join screen with the code filled in.
                  </p>
                </div>
              </ArenaPanel>
            )}

            {/* Players — same managed list the live screen uses, so a tutor
                can remove someone before the game starts too. */}
            {snapshot.players.length === 0 ? (
              <ArenaPanel className="mt-4">
                <div className="flex items-center justify-between">
                  <p className="text-[14px] font-bold">
                    Players joined (0/{s.max_players})
                  </p>
                  <Users className="h-4 w-4 text-quiz-arena-muted" aria-hidden="true" />
                </div>
                <div className="mt-3 rounded-2xl border border-dashed border-white/15 px-4 py-6 text-center">
                  <ArenaArt src={QUIZ_ART.hourglass} className="mx-auto h-16 w-16" />
                  <p className="mt-2 text-[13px] text-quiz-arena-muted">
                    Waiting for students to join…
                  </p>
                </div>
              </ArenaPanel>
            ) : (
              <LiveQuizPlayerList
                className="mt-4"
                players={snapshot.players}
                showAnswered={false}
                onRemove={(id) => removeMut.mutate(id)}
                removingId={removingId}
              />
            )}

            <ArenaPanel className="mt-4 flex items-center gap-3">
              <ArenaArt src={QUIZ_ART.crystalGem} className="h-9 w-9 shrink-0" />
              <p className="text-[12.5px] leading-snug text-quiz-arena-muted">
                {total} question{total === 1 ? "" : "s"} · {s.seconds_per_question}s each ·
                {s.show_player_names ? " names shown" : " names hidden"}
              </p>
            </ArenaPanel>
          </>
        ) : (
          <>
            {/* Live control */}
            <div className="mt-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <ArenaChip art={QUIZ_ART.xpHexagon}>
                  Q {Math.min(idx + 1, total)} / {total}
                </ArenaChip>
                {/* One source for "answered": the same tally the bars below
                    use, so the chip and the distribution can never disagree
                    on screen. Falls back to the session counter only when the
                    per-question stats aren't in the payload. */}
                <ArenaChip art={QUIZ_ART.goldStar} tone="good">
                  {snapshot.question_stats?.answered ?? s.answered_count}/{s.participant_count} answered
                </ArenaChip>
                {s.status === "question_open" && secondsLeft !== null && (
                  <span className="ml-auto text-[15px] font-black tabular-nums">{secondsLeft}s</span>
                )}
              </div>
              <ArenaProgress value={total ? ((idx + 1) / total) * 100 : 0} />
            </div>

            <ArenaPanel className="mt-4">
              <p className="text-[11px] font-bold uppercase tracking-wide text-quiz-arena-muted">
                {s.status === "question_open" && "Question open"}
                {s.status === "question_locked" && "Answers locked"}
                {s.status === "answer_reveal" && "Showing the answer"}
                {s.status === "leaderboard" && "Showing the leaderboard"}
              </p>
              <h2 className="mt-1.5 whitespace-pre-wrap text-[16px] font-bold leading-snug">
                {snapshot.question?.question ?? "—"}
              </h2>
              {/* Without stats (a payload that isn't the host's) fall back to
                  the plain option list rather than rendering nothing. */}
              {snapshot.question && !snapshot.question_stats && (
                <ul className="mt-3 space-y-1.5">
                  {snapshot.question.options.map((o) => (
                    <li
                      key={o.id}
                      className={cn(
                        "flex items-center gap-2 rounded-2xl border px-3 py-2 text-[13.5px]",
                        o.is_correct === true
                          ? "border-quiz-correct/50 bg-quiz-correct/15 text-emerald-50"
                          : "border-white/10 bg-white/5 text-quiz-arena-muted",
                      )}
                    >
                      {o.is_correct === true && <Check className="h-4 w-4 shrink-0 text-emerald-300" />}
                      <span className="min-w-0 flex-1 break-words">{o.text}</span>
                    </li>
                  ))}
                </ul>
              )}
              {/* A typed question has no options to mark, so at reveal the host
                  is shown the key itself — they are the one reading it out.
                  Withheld before reveal exactly as it is for a player. */}
              {(snapshot.question?.accepted_answers?.length ||
                snapshot.question?.numeric_answer != null) && (
                <div className="mt-3 rounded-2xl border border-quiz-correct/50 bg-quiz-correct/15 px-3 py-2">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-quiz-arena-muted">
                    {snapshot.question.accepted_answers &&
                    snapshot.question.accepted_answers.length > 1
                      ? "Accepted answers"
                      : "Correct answer"}
                  </p>
                  <p className="mt-0.5 break-words text-[14.5px] font-bold text-emerald-100">
                    {snapshot.question.accepted_answers?.length
                      ? snapshot.question.accepted_answers.join(", ")
                      : `${snapshot.question.numeric_answer}${
                          snapshot.question.answer_unit ? ` ${snapshot.question.answer_unit}` : ""
                        }`}
                  </p>
                </div>
              )}
            </ArenaPanel>

            {/* Response distribution — host only, and the correct option stays
                unmarked until the host has actually revealed it. */}
            {snapshot.question_stats && (
              <LiveQuizResponseBars
                className="mt-4"
                stats={snapshot.question_stats}
                revealed={s.status === "answer_reveal" || s.status === "leaderboard"}
              />
            )}

            {s.status === "leaderboard" && (
              <div className="mt-4">
                <LiveQuizLeaderboard rows={snapshot.leaderboard} />
              </div>
            )}

            <LiveQuizPlayerList
              className="mt-4"
              players={snapshot.players}
              showAnswered
              onRemove={(id) => removeMut.mutate(id)}
              removingId={removingId}
            />
          </>
        )}

        {/* Host actions */}
        <div className="sticky bottom-0 z-40 -mx-4 mt-6 flex items-center gap-2 bg-gradient-to-t from-quiz-arena-deep via-quiz-arena-deep/95 to-transparent px-4 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-5 sm:-mx-6 sm:px-6">
          {inLobby ? (
            <Button
              className="h-13 min-h-[52px] w-full rounded-full bg-gradient-to-r from-quiz-accent-pink to-quiz-accent text-[16px] font-extrabold text-white"
              disabled={advance.isPending || s.participant_count === 0}
              onClick={() => advance.mutate("start")}
            >
              {advance.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              {s.participant_count === 0 ? "Waiting for players…" : "Start game"}
            </Button>
          ) : (
            <>
              {s.status === "question_open" && (
                <>
                  {/* Stop the clock without revealing — useful when everyone
                      has answered and the tutor wants to talk first. */}
                  <Button
                    className="h-12 min-h-[48px] shrink-0 rounded-full bg-white/12 px-4 text-[14.5px] font-bold text-quiz-arena-foreground hover:bg-white/20"
                    disabled={advance.isPending}
                    onClick={() => advance.mutate("lock")}
                    aria-label="Lock answers"
                  >
                    <Lock className="h-4 w-4" aria-hidden="true" />
                    <span className="ml-1.5 hidden sm:inline">Lock</span>
                  </Button>
                  <Button
                    className="h-12 min-h-[48px] min-w-0 flex-1 rounded-full bg-gradient-to-r from-quiz-accent-pink to-quiz-accent text-[15px] font-extrabold text-white"
                    disabled={advance.isPending}
                    onClick={() => advance.mutate("reveal")}
                  >
                    <Eye className="mr-1.5 h-4 w-4 shrink-0" aria-hidden="true" /> Reveal answer
                  </Button>
                </>
              )}
              {s.status === "question_locked" && (
                <Button
                  className="h-12 min-h-[48px] flex-1 rounded-full bg-white/12 text-[14.5px] font-bold text-quiz-arena-foreground hover:bg-white/20"
                  disabled={advance.isPending}
                  onClick={() => advance.mutate("reveal")}
                >
                  <Eye className="mr-1.5 h-4 w-4" /> Reveal answer
                </Button>
              )}
              {s.status === "answer_reveal" && (
                // Both buttons are nowrap, so two full labels ran the primary
                // action off a 320px screen. The secondary one collapses to its
                // icon instead — the same trade the Lock button above makes.
                <Button
                  className="h-12 min-h-[48px] shrink-0 rounded-full bg-white/12 px-4 text-[14.5px] font-bold text-quiz-arena-foreground hover:bg-white/20"
                  disabled={advance.isPending}
                  onClick={() => advance.mutate("leaderboard")}
                  aria-label="Show the leaderboard"
                >
                  <Trophy className="h-4 w-4" aria-hidden="true" />
                  <span className="ml-1.5 hidden min-[400px]:inline">Leaderboard</span>
                </Button>
              )}
              {(s.status === "answer_reveal" || s.status === "leaderboard") && (
                <Button
                  className="h-12 min-h-[48px] min-w-0 flex-1 rounded-full bg-gradient-to-r from-quiz-accent-pink to-quiz-accent text-[15px] font-extrabold text-white"
                  disabled={advance.isPending}
                  onClick={() => advance.mutate("next")}
                >
                  {advance.isPending
                    ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    : <SkipForward className="mr-1.5 h-4 w-4 shrink-0" />}
                  {idx + 1 >= total ? "Finish game" : "Next question"}
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End this live session?</AlertDialogTitle>
            <AlertDialogDescription>
              Players will be returned to the quiz hub. Scores from this session won't be kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep hosting</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                advance.mutate("cancel");
                setConfirmCancel(false);
              }}
            >
              <LogOut className="mr-1.5 h-4 w-4" /> End session
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </QuizArenaShell>
  );
}

export default LiveQuizHost;
