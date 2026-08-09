import { Trophy, Medal, Award } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useStudentLeaderboard, type LeaderboardPeriod } from "@/lib/studentHome";
import { HomeModule, HomeErrorState } from "./StudentHomeShared";
import { cn } from "@/lib/utils";

const PERIODS: { value: LeaderboardPeriod; label: string }[] = [
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "all", label: "All Time" },
];

function positionIcon(position: number) {
  if (position === 1) return <Trophy className="h-4 w-4 text-amber-500" aria-hidden="true" />;
  if (position === 2) return <Medal className="h-4 w-4 text-slate-400" aria-hidden="true" />;
  if (position === 3) return <Award className="h-4 w-4 text-orange-400" aria-hidden="true" />;
  return <span className="text-[12px] font-semibold text-slate-400">{position}</span>;
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

interface Props {
  currentUserId: string | undefined;
  /** Lift the selected period so the hero rank chip can reuse it. */
  period: LeaderboardPeriod;
  onPeriodChange: (period: LeaderboardPeriod) => void;
}

/** Pale-blush module: centre-scoped top 3 plus the student's own position. */
export function StudentHomeLeaderboard({ currentUserId, period, onPeriodChange }: Props) {
  const { data, isLoading, isError, refetch } = useStudentLeaderboard(period, true);
  const top = data?.top ?? [];
  const me = data?.me ?? null;
  const meInTop = !!me && top.some((e) => e.user_id === me.user_id);

  return (
    <HomeModule
      tone="ranking"
      title="XP Leaderboard"
      icon={Trophy}
      action={{ label: "View all", to: "/dashboard/leaderboard" }}
      headerAside={
        <div
          role="tablist"
          aria-label="Leaderboard period"
          className="flex rounded-[13px] bg-white/70 p-1"
        >
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              role="tab"
              aria-selected={period === p.value}
              onClick={() => onPeriodChange(p.value)}
              className={cn(
                "min-h-[38px] flex-1 rounded-[10px] px-2 text-[12.5px] transition-all motion-reduce:transition-none",
                period === p.value
                  ? "bg-white font-semibold text-slate-900 shadow-[0_1px_4px_rgba(15,23,42,0.08)]"
                  : "font-medium text-slate-500",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      }
    >
      {isLoading ? (
        <div className="space-y-2" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[52px] rounded-[20px] bg-white/70 animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <HomeErrorState message="Couldn’t load the leaderboard." onRetry={() => refetch()} />
      ) : top.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[20px] bg-white/90 px-4 py-6 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-home-ranking">
            <Trophy className="h-5 w-5 text-home-ranking-accent" aria-hidden="true" />
          </span>
          <p className="text-[14px] font-semibold text-slate-900">
            No leaderboard activity yet this week.
          </p>
          <p className="text-[13px] text-slate-500">Start earning XP to claim a spot.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-[20px] bg-white">
            {top.map((entry) => {
              const isMe = entry.user_id === currentUserId;
              return (
                <li
                  key={entry.user_id}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5",
                    isMe && "bg-home-ranking",
                  )}
                >
                  <span className="flex w-5 justify-center">{positionIcon(entry.position)}</span>
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={entry.avatar_url || undefined} alt="" />
                    <AvatarFallback className="bg-slate-100 text-[11px] text-slate-600">
                      {initials(entry.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-[14px] text-slate-900",
                      isMe ? "font-semibold" : "font-medium",
                    )}
                  >
                    {isMe ? "You" : entry.name}
                  </span>
                  <span
                    className={cn(
                      "text-[13px] text-slate-900",
                      isMe ? "font-bold" : "font-semibold",
                    )}
                  >
                    {entry.xp.toLocaleString()} XP
                  </span>
                </li>
              );
            })}
          </ul>

          {me && !meInTop && (
            <div className="flex items-center gap-3 rounded-[20px] border border-home-ranking-accent/30 bg-white px-3 py-2.5">
              <span className="flex w-5 justify-center text-[12px] font-semibold text-home-ranking-accent">
                #{me.position}
              </span>
              <span className="min-w-0 flex-1 text-[14px] font-semibold text-slate-900">You</span>
              <span className="text-[13px] font-bold text-slate-900">
                {me.xp.toLocaleString()} XP
              </span>
            </div>
          )}
        </div>
      )}
    </HomeModule>
  );
}
