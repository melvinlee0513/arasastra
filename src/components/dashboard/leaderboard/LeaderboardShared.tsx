/**
 * Shared XP leaderboard visual system.
 *
 * These pieces are the single source of leaderboard presentation for both the
 * student mobile Home preview and the dedicated More → Leaderboard page. Every
 * value rendered here comes from the canonical centre-scoped reader
 * (`get_student_xp_leaderboard`) — nothing is ranked or recomputed in React.
 */

import { Crown } from "lucide-react";
import { UserAvatar } from "@/components/profile/UserAvatar";
import { cn } from "@/lib/utils";
import {
  formatXp,
  type LeaderboardEntry,
  type LeaderboardMe,
  type LeaderboardPeriod,
} from "@/lib/studentHome";

export const MEDALS = {
  1: {
    ring: "ring-medal-gold/60",
    badge: "bg-medal-gold text-white",
    xp: "text-medal-gold",
  },
  2: {
    ring: "ring-medal-silver/45",
    badge: "bg-medal-silver text-white",
    xp: "text-medal-silver",
  },
  3: {
    ring: "ring-medal-bronze/45",
    badge: "bg-medal-bronze text-white",
    xp: "text-medal-bronze",
  },
} as const;

export const LEADERBOARD_PERIODS: {
  value: LeaderboardPeriod;
  label: string;
  blurb: string;
}[] = [
  { value: "week", label: "This Week", blurb: "See who's leading this week." },
  { value: "month", label: "This Month", blurb: "See who's leading this month." },
  { value: "all", label: "All Time", blurb: "All-time XP across your centre." },
];

export function periodLabel(period: LeaderboardPeriod): string {
  return period === "week" ? "this week" : period === "month" ? "this month" : "all time";
}

/** Gap to the rank directly above, using only server-returned XP. */
export function gapToNextLabel(me: LeaderboardMe | null): string | null {
  if (!me || me.next_xp == null || me.next_position == null) return null;
  const diff = me.next_xp - me.xp;
  if (diff <= 0) return null;
  return `${diff.toLocaleString("en-US")} XP to #${me.next_position}`;
}

export function YouPill({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "rounded-full bg-primary px-2 py-[2px] text-[9.5px] font-bold uppercase tracking-wide text-primary-foreground",
        className,
      )}
    >
      You
    </span>
  );
}

/* ------------------------------- Period tabs ------------------------------ */

export function LeaderboardPeriodSelector({
  value,
  onChange,
}: {
  value: LeaderboardPeriod;
  onChange: (p: LeaderboardPeriod) => void;
}) {
  const index = LEADERBOARD_PERIODS.findIndex((p) => p.value === value);

  return (
    <div
      role="tablist"
      aria-label="Leaderboard period"
      className="relative flex h-[44px] items-center rounded-[14px] border border-slate-200 bg-white/70 p-1"
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-1 left-1 rounded-[11px] bg-white shadow-[0_1px_4px_rgba(15,23,42,0.10)] transition-transform duration-200 ease-out motion-reduce:transition-none"
        style={{
          width: `calc((100% - 0.5rem) / ${LEADERBOARD_PERIODS.length})`,
          transform: `translateX(calc(${index} * 100%))`,
        }}
      />
      {LEADERBOARD_PERIODS.map((p) => (
        <button
          key={p.value}
          role="tab"
          type="button"
          aria-selected={value === p.value}
          onClick={() => onChange(p.value)}
          className={cn(
            "relative z-10 flex-1 text-[13px] transition-colors",
            value === p.value ? "font-semibold text-slate-900" : "text-slate-500",
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------- Podium -------------------------------- */

/**
 * Top 3 podium — identical on Home and the dedicated Leaderboard page.
 * Missing runners-up simply render nothing; there are no ghost slots.
 */
export function LeaderboardPodium({
  entries,
  meId,
  footer,
}: {
  entries: LeaderboardEntry[];
  meId?: string;
  footer?: React.ReactNode;
}) {
  const first = entries.find((e) => e.position === 1) ?? entries[0];
  const second = entries.find((e) => e.position === 2);
  const third = entries.find((e) => e.position === 3);

  return (
    <section
      aria-label="Top three students"
      className="relative overflow-hidden rounded-[24px] border border-podium-border bg-podium px-4 pb-4 pt-4"
    >
      {/* Restrained Aras spark motif. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-5 top-4 h-1.5 w-1.5 rounded-full bg-medal-gold/40"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-6 top-9 h-1 w-1 rounded-full bg-medal-gold/30"
      />

      {first && (
        <div className="flex flex-col items-center text-center motion-safe:animate-fade-up">
          <Crown className="mb-1 h-4 w-4 text-medal-gold" aria-hidden="true" />
          <div className="relative">
            <UserAvatar
              path={first.avatar_path}
              name={first.name}
              className="h-[68px] w-[68px] ring-2 ring-medal-gold/60 ring-offset-2 ring-offset-podium"
              fallbackClassName="text-base"
            />
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-medal-gold px-1.5 py-[1px] text-[10px] font-bold text-white shadow-sm">
              1
            </span>
          </div>
          <p className="mt-3 max-w-[190px] truncate text-[15px] font-bold text-slate-900">
            {first.user_id === meId ? "You" : first.name}
          </p>
          {first.user_id === meId && <YouPill className="my-0.5" />}
          <p className="text-[15px] font-bold tabular-nums text-medal-gold">
            {formatXp(first.xp)}
          </p>
        </div>
      )}

      {(second || third) && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <PodiumSide entry={second} place={2} meId={meId} />
          <PodiumSide entry={third} place={3} meId={meId} />
        </div>
      )}

      {footer && (
        <p className="mt-3 text-center text-[12.5px] font-medium text-slate-600">{footer}</p>
      )}
    </section>
  );
}

function PodiumSide({
  entry,
  place,
  meId,
}: {
  entry?: LeaderboardEntry;
  place: 2 | 3;
  meId?: string;
}) {
  if (!entry) return <div aria-hidden="true" />;
  const medal = MEDALS[place];

  return (
    <div className="flex flex-col items-center text-center motion-safe:animate-fade-up">
      <div className="relative">
        <UserAvatar
          path={entry.avatar_path}
          name={entry.name}
          className={cn("h-[54px] w-[54px] ring-2 ring-offset-2 ring-offset-podium", medal.ring)}
          fallbackClassName="text-[13px]"
        />
        <span
          className={cn(
            "absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full px-1.5 py-[1px] text-[10px] font-bold shadow-sm",
            medal.badge,
          )}
        >
          {place}
        </span>
      </div>
      <p className="mt-2.5 w-full truncate text-[13.5px] font-semibold text-slate-900">
        {entry.user_id === meId ? "You" : entry.name}
      </p>
      {entry.user_id === meId && <YouPill className="my-0.5" />}
      <p className={cn("text-[13px] font-semibold tabular-nums", medal.xp)}>
        {formatXp(entry.xp)}
      </p>
    </div>
  );
}

/* ------------------------------- Ranking row ------------------------------ */

export function LeaderboardRow({
  entry,
  isMe,
}: {
  entry: LeaderboardEntry;
  isMe: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3.5 py-3 transition-colors active:bg-slate-50",
        isMe && "bg-primary/[0.06]",
      )}
    >
      <span
        className={cn(
          "w-6 flex-shrink-0 text-center text-[13px] font-semibold tabular-nums",
          isMe ? "text-primary" : "text-slate-400",
        )}
      >
        {entry.position}
      </span>
      <UserAvatar
        path={entry.avatar_path}
        name={entry.name}
        className="h-10 w-10 flex-shrink-0"
        fallbackClassName="text-[12px]"
      />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-[14.5px]",
            isMe ? "font-bold text-slate-900" : "font-medium text-slate-800",
          )}
        >
          {isMe ? "You" : entry.name}
        </p>
      </div>
      {isMe && <YouPill className="flex-shrink-0" />}
      <span
        className={cn(
          "flex-shrink-0 text-[13.5px] font-semibold tabular-nums",
          isMe ? "text-primary" : "text-slate-600",
        )}
      >
        {formatXp(entry.xp)}
      </span>
    </div>
  );
}

/* --------------------------- Current student rank ------------------------- */

/** Highlighted own-rank card used when the student sits outside the Top 3. */
export function CurrentStudentRank({
  me,
  compact = false,
}: {
  me: LeaderboardMe;
  compact?: boolean;
}) {
  const gap = gapToNextLabel(me);

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-[20px] border border-primary/25 bg-primary/[0.07] px-3.5",
        compact ? "py-2.5" : "py-3",
      )}
    >
      <span className="w-6 flex-shrink-0 text-center text-[15px] font-bold tabular-nums text-primary">
        {me.position}
      </span>
      <UserAvatar
        path={me.avatar_path}
        name={me.name}
        className={cn("flex-shrink-0", compact ? "h-9 w-9" : "h-10 w-10")}
        fallbackClassName="text-[12px]"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14.5px] font-bold text-slate-900">You</p>
        {gap && <p className="truncate text-[12px] text-primary">{gap}</p>}
      </div>
      <span className="flex-shrink-0 text-[14px] font-bold tabular-nums text-primary">
        {formatXp(me.xp)}
      </span>
    </div>
  );
}

/* ------------------------------ Podium skeleton --------------------------- */

export function LeaderboardPodiumSkeleton() {
  return (
    <div
      className="rounded-[24px] border border-podium-border bg-podium p-4"
      aria-hidden="true"
    >
      <div className="flex flex-col items-center">
        <div className="h-[68px] w-[68px] rounded-full bg-white/70" />
        <div className="mt-3 h-4 w-24 rounded-full bg-white/70" />
        <div className="mt-2 h-3.5 w-16 rounded-full bg-white/70" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {[0, 1].map((i) => (
          <div key={i} className="flex flex-col items-center">
            <div className="h-[54px] w-[54px] rounded-full bg-white/70" />
            <div className="mt-2.5 h-3.5 w-20 rounded-full bg-white/70" />
            <div className="mt-1.5 h-3 w-14 rounded-full bg-white/70" />
          </div>
        ))}
      </div>
    </div>
  );
}
