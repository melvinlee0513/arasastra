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
  Check, Copy, Eye, Loader2, LogOut, Play, SkipForward, Trophy, Users, X,
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
import { advanceLiveQuizSession, mapLiveQuizError, type LiveQuizAction } from "@/lib/liveQuiz";
import { LiveQuizLeaderboard } from "@/components/quiz/live/LiveQuizLeaderboard";

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
            <div className="mt-5">
              <LiveQuizLeaderboard rows={snapshot.leaderboard} showPodium />
            </div>
          )}
          <div className="mt-6">
            <Button
              className="h-12 w-full rounded-full bg-gradient-to-r from-quiz-accent-pink to-quiz-accent text-[15px] font-extrabold text-white"
              onClick={() => navigate(`${basePath}/quizzes`)}
            >
              Back to quiz management
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
            <p className="truncate text-[11px] font-bold uppercase tracking-wide text-quiz-arena-muted">
              Quiz lobby · hosting
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
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Button
                  onClick={() => copy(s.game_code ?? "", "code")}
                  className="h-12 flex-1 rounded-full bg-white/12 text-[14px] font-bold text-quiz-arena-foreground hover:bg-white/20"
                >
                  {copied === "code" ? <Check className="mr-1.5 h-4 w-4" /> : <Copy className="mr-1.5 h-4 w-4" />}
                  Copy code
                </Button>
                <Button
                  onClick={() => copy(joinUrl, "link")}
                  className="h-12 flex-1 rounded-full bg-gradient-to-r from-quiz-accent-pink to-quiz-accent text-[14px] font-bold text-white"
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

            {/* Players */}
            <ArenaPanel className="mt-4">
              <div className="flex items-center justify-between">
                <p className="text-[14px] font-bold">
                  Players joined ({s.participant_count}/{s.max_players})
                </p>
                <Users className="h-4 w-4 text-quiz-arena-muted" />
              </div>
              {snapshot.players.length === 0 ? (
                <div className="mt-3 rounded-2xl border border-dashed border-white/15 px-4 py-6 text-center">
                  <ArenaArt src={QUIZ_ART.hourglass} className="mx-auto h-16 w-16" />
                  <p className="mt-2 text-[13px] text-quiz-arena-muted">
                    Waiting for students to join…
                  </p>
                </div>
              ) : (
                <ul className="mt-3 max-h-64 space-y-1.5 overflow-y-auto pr-1">
                  {snapshot.players.map((p) => (
                    <li
                      key={p.participant_id}
                      className="flex items-center gap-2.5 rounded-2xl bg-white/6 px-3 py-2"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/12 text-[12px] font-bold">
                        {p.avatar_url
                          ? <img src={p.avatar_url} alt="" className="h-full w-full object-cover" />
                          : p.display_name.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">
                        {p.display_name}
                      </span>
                      {p.status === "joined" ? (
                        <Check className="h-4 w-4 shrink-0 text-emerald-300" />
                      ) : (
                        <span className="shrink-0 text-[11px] font-bold text-quiz-arena-muted">left</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </ArenaPanel>

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
                <ArenaChip art={QUIZ_ART.goldStar} tone="good">
                  {s.answered_count}/{s.participant_count} answered
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
              {snapshot.question && (
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
            </ArenaPanel>

            {s.status === "leaderboard" && (
              <div className="mt-4">
                <LiveQuizLeaderboard rows={snapshot.leaderboard} />
              </div>
            )}
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
                <Button
                  className="h-12 min-h-[48px] flex-1 rounded-full bg-white/12 text-[14.5px] font-bold text-quiz-arena-foreground hover:bg-white/20"
                  disabled={advance.isPending}
                  onClick={() => advance.mutate("reveal")}
                >
                  <Eye className="mr-1.5 h-4 w-4" /> Reveal answer
                </Button>
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
                <Button
                  className="h-12 min-h-[48px] flex-1 rounded-full bg-white/12 text-[14.5px] font-bold text-quiz-arena-foreground hover:bg-white/20"
                  disabled={advance.isPending}
                  onClick={() => advance.mutate("leaderboard")}
                >
                  <Trophy className="mr-1.5 h-4 w-4" /> Leaderboard
                </Button>
              )}
              {(s.status === "answer_reveal" || s.status === "leaderboard") && (
                <Button
                  className="h-12 min-h-[48px] flex-1 rounded-full bg-gradient-to-r from-quiz-accent-pink to-quiz-accent text-[15px] font-extrabold text-white"
                  disabled={advance.isPending}
                  onClick={() => advance.mutate("next")}
                >
                  {advance.isPending
                    ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    : <SkipForward className="mr-1.5 h-4 w-4" />}
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
