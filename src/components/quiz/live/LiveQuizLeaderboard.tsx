/**
 * Live leaderboard.
 *
 * Rows arrive already ranked by `get_live_quiz_snapshot` — score, then correct
 * count, then total response time, then join order. This component never
 * sorts, re-ranks or recomputes anything; doing so client-side would make an
 * untrusted value look authoritative.
 */
import { cn } from "@/lib/utils";
import { QUIZ_ART } from "@/lib/quizArt";
import { ArenaArt, ArenaPanel } from "@/components/quiz/QuizArena";
import type { LiveQuizLeaderboardRow } from "@/lib/liveQuiz";

const MEDAL: Record<number, string> = {
  1: QUIZ_ART.rank1,
  2: QUIZ_ART.rank2,
  3: QUIZ_ART.rank3,
};

export function LiveQuizLeaderboard({
  rows,
  showPodium = false,
  className,
}: {
  rows: LiveQuizLeaderboardRow[];
  /** Render the top three as a podium above the list. */
  showPodium?: boolean;
  className?: string;
}) {
  if (rows.length === 0) {
    return (
      <ArenaPanel className={className}>
        <p className="text-center text-[13px] text-quiz-arena-muted">No players yet.</p>
      </ArenaPanel>
    );
  }

  const podium = showPodium && rows.length >= 3 ? rows.slice(0, 3) : [];
  const list = podium.length ? rows.slice(3) : rows;

  return (
    <div className={cn("space-y-3", className)}>
      {podium.length > 0 && (
        <div className="grid grid-cols-3 items-end gap-2">
          {/* 2nd, 1st, 3rd — the winner sits in the middle and tallest. */}
          {[podium[1], podium[0], podium[2]].map((r, i) => {
            const isWinner = i === 1;
            return (
              <div
                key={r.participant_id}
                className={cn(
                  "flex flex-col items-center rounded-3xl border px-2 pb-3 pt-4",
                  isWinner
                    ? "border-quiz-xp/50 bg-quiz-xp/12 pt-6"
                    : "border-white/12 bg-white/6",
                  r.is_me && "ring-2 ring-quiz-accent-pink",
                )}
              >
                <ArenaArt src={MEDAL[r.rank]} className={cn("shrink-0", isWinner ? "h-14 w-14" : "h-11 w-11")} />
                <p className="mt-1.5 w-full truncate text-center text-[12.5px] font-bold">
                  {r.display_name}
                </p>
                <p className="text-[13px] font-black tabular-nums text-quiz-arena-foreground">
                  {r.score.toLocaleString()}
                </p>
                <p className="text-[11px] font-semibold text-quiz-arena-muted">pts</p>
              </div>
            );
          })}
        </div>
      )}

      <ArenaPanel className="p-3">
        <ul className="space-y-1.5">
          {list.map((r) => (
            <li
              key={r.participant_id}
              className={cn(
                "flex items-center gap-2.5 rounded-2xl px-3 py-2.5",
                r.is_me ? "bg-quiz-accent-pink/20 ring-1 ring-quiz-accent-pink/50" : "bg-white/6",
              )}
            >
              <span className="w-6 shrink-0 text-center text-[13px] font-black tabular-nums text-quiz-arena-muted">
                {r.rank}
              </span>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/12 text-[12px] font-bold">
                {r.avatar_url
                  ? <img src={r.avatar_url} alt="" className="h-full w-full object-cover" />
                  : r.display_name.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">
                {r.display_name}
                {r.is_me && (
                  <span className="ml-1.5 rounded-full bg-white/20 px-1.5 py-0.5 text-[11px] font-black uppercase">
                    You
                  </span>
                )}
              </span>
              <span className="shrink-0 text-[14px] font-black tabular-nums">
                {r.score.toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      </ArenaPanel>
    </div>
  );
}

export default LiveQuizLeaderboard;
