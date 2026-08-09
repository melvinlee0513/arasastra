import { useState } from "react";
import { Link } from "react-router-dom";
import { Trophy, Medal, Award, ChevronRight } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  useStudentLeaderboard,
  type LeaderboardPeriod,
} from "@/lib/studentHome";
import { SectionHeader, HomeErrorState } from "./StudentHomeShared";
import { cn } from "@/lib/utils";

const PERIODS: { value: LeaderboardPeriod; label: string }[] = [
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "all", label: "All Time" },
];

function positionIcon(position: number) {
  if (position === 1) return <Trophy className="w-4 h-4 text-amber-500" aria-hidden="true" />;
  if (position === 2) return <Medal className="w-4 h-4 text-slate-400" aria-hidden="true" />;
  if (position === 3) return <Award className="w-4 h-4 text-orange-400" aria-hidden="true" />;
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
  /** Lift the selected period so the welcome rank chip can reuse it. */
  period: LeaderboardPeriod;
  onPeriodChange: (period: LeaderboardPeriod) => void;
}

/** Compact centre-scoped ranking: top 3 plus the student's own position. */
export function StudentHomeLeaderboard({ currentUserId, period, onPeriodChange }: Props) {
  const { data, isLoading, isError, refetch } = useStudentLeaderboard(period, true);
  const top = data?.top ?? [];
  const me = data?.me ?? null;
  const meInTop = !!me && top.some((e) => e.user_id === me.user_id);

  return (
    <section className="space-y-3">
      <SectionHeader title="XP Leaderboard">
        <div className="ml-auto flex rounded-full bg-slate-100 p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              aria-pressed={period === p.value}
              onClick={() => onPeriodChange(p.value)}
              className={cn(
                "rounded-full px-2.5 py-1.5 text-[12px] transition-colors",
                period === p.value
                  ? "bg-white font-semibold text-slate-900 shadow-sm"
                  : "font-medium text-slate-500",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </SectionHeader>

      {isLoading ? (
        <div className="space-y-2" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[52px] rounded-xl bg-slate-200/70 animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <HomeErrorState message="Couldn’t load the leaderboard." onRetry={() => refetch()} />
      ) : top.length === 0 ? (
        <div className="flex items-start gap-2 px-1 py-3">
          <Trophy className="w-4 h-4 mt-0.5 text-slate-400" aria-hidden="true" />
          <p className="text-[13px] text-slate-500">
            No leaderboard activity yet. Start earning XP to claim a spot.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <ul className="space-y-2">
            {top.map((entry) => {
              const isMe = entry.user_id === currentUserId;
              return (
                <li
                  key={entry.user_id}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border px-3 py-2.5",
                    isMe ? "border-primary/30 bg-primary/5" : "border-slate-200 bg-white",
                  )}
                >
                  <span className="flex w-5 justify-center">{positionIcon(entry.position)}</span>
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={entry.avatar_url || undefined} alt="" />
                    <AvatarFallback className="bg-slate-100 text-[11px] text-slate-600">
                      {initials(entry.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-slate-900">
                    {isMe ? "You" : entry.name}
                  </span>
                  <span className="text-[13px] font-semibold text-slate-900">
                    {entry.xp.toLocaleString()} XP
                  </span>
                </li>
              );
            })}
          </ul>

          {me && !meInTop && (
            <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5">
              <span className="flex w-5 justify-center text-[12px] font-semibold text-primary">
                #{me.position}
              </span>
              <span className="min-w-0 flex-1 text-[14px] font-semibold text-slate-900">You</span>
              <span className="text-[13px] font-semibold text-slate-900">
                {me.xp.toLocaleString()} XP
              </span>
            </div>
          )}

          <Link
            to="/dashboard/leaderboard"
            className="inline-flex items-center gap-0.5 px-1 text-[13px] font-medium text-primary min-h-[44px] active:opacity-70"
          >
            View leaderboard
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        </div>
      )}
    </section>
  );
}
