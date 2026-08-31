/**
 * Host participant management.
 *
 * Presence is reported honestly. The app has no presence channel, so it never
 * claims anyone is "Online": it shows the state it can actually prove — joined,
 * left, removed — plus the server's `last_seen_at`, which only moves when that
 * player did something the server saw (joined, rejoined, or answered).
 */
import { useState } from "react";
import { Check, Clock, Loader2, UserMinus } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArenaPanel } from "@/components/quiz/QuizArena";
import { cn } from "@/lib/utils";
import { formatRelative } from "@/lib/quizzes";
import type { LiveQuizPlayer } from "@/lib/liveQuiz";

function statusLabel(p: LiveQuizPlayer): { text: string; tone: string } {
  if (p.status === "removed") return { text: "Removed", tone: "text-rose-300" };
  if (p.status === "left") return { text: "Left", tone: "text-quiz-arena-muted" };
  return { text: "Joined", tone: "text-emerald-300" };
}

export function LiveQuizPlayerList({
  players,
  /** Show the answered column — only meaningful once a question is open. */
  showAnswered,
  onRemove,
  removingId,
  className,
}: {
  players: LiveQuizPlayer[];
  showAnswered: boolean;
  onRemove?: (participantId: string) => void;
  removingId?: string | null;
  className?: string;
}) {
  const [confirm, setConfirm] = useState<LiveQuizPlayer | null>(null);
  const active = players.filter((p) => p.status === "joined");

  return (
    <ArenaPanel className={cn("p-3", className)}>
      <div className="flex items-baseline justify-between">
        <p className="text-[11px] font-bold uppercase tracking-wide text-quiz-arena-muted">
          Players
        </p>
        <p className="text-[12px] font-semibold tabular-nums text-quiz-arena-muted">
          {active.length} in the game
        </p>
      </div>

      {players.length === 0 ? (
        <p className="mt-3 text-center text-[13px] text-quiz-arena-muted">No players yet.</p>
      ) : (
        <ul className="mt-2.5 max-h-[320px] space-y-1.5 overflow-y-auto pr-1">
          {players.map((p) => {
            const st = statusLabel(p);
            const gone = p.status !== "joined";
            return (
              <li
                key={p.participant_id}
                className={cn(
                  "flex items-center gap-2.5 rounded-2xl px-2.5 py-2",
                  gone ? "bg-white/4 opacity-60" : "bg-white/6",
                )}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/12 text-[12px] font-bold">
                  {p.avatar_url
                    ? <img src={p.avatar_url} alt="" className="h-full w-full object-cover" />
                    : p.display_name.slice(0, 1).toUpperCase()}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold">
                    {p.display_name}
                  </span>
                  {/* One line, truncated. Wrapping made each row three lines
                      tall, so a class of 30 barely fit on a phone. */}
                  <span className="mt-0.5 flex min-w-0 items-center gap-x-2 text-[11.5px]">
                    <span className={cn("shrink-0 font-semibold", st.tone)}>{st.text}</span>
                    {p.last_seen_at && (
                      <span className="inline-flex min-w-0 items-center gap-1 truncate text-quiz-arena-muted">
                        <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
                        <span className="truncate">seen {formatRelative(p.last_seen_at)}</span>
                      </span>
                    )}
                  </span>
                </span>

                {showAnswered && !gone && (
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                      p.answered ? "bg-quiz-correct/25" : "bg-white/8",
                    )}
                    aria-label={p.answered ? "Answered" : "Not answered yet"}
                    title={p.answered ? "Answered" : "Not answered yet"}
                  >
                    {p.answered
                      ? <Check className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
                      : <span className="h-1.5 w-1.5 rounded-full bg-white/40" />}
                  </span>
                )}

                {typeof p.score === "number" && (
                  <span className="w-14 shrink-0 text-right text-[13px] font-black tabular-nums">
                    {p.score.toLocaleString()}
                  </span>
                )}

                {onRemove && !gone && (
                  <button
                    type="button"
                    onClick={() => setConfirm(p)}
                    disabled={removingId === p.participant_id}
                    aria-label={`Remove ${p.display_name} from the game`}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-quiz-arena-muted transition active:scale-95 hover:bg-white/10 hover:text-rose-300 disabled:opacity-50"
                  >
                    {removingId === p.participant_id
                      ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      : <UserMinus className="h-4 w-4" aria-hidden="true" />}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {confirm?.display_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              They'll be dropped from this game and can't rejoin it or answer any more
              questions. Their answers so far stay on record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep them in</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (confirm) onRemove?.(confirm.participant_id);
                setConfirm(null);
              }}
            >
              Remove player
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ArenaPanel>
  );
}

export default LiveQuizPlayerList;
