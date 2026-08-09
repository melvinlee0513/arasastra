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

const PLINTH = {
  1: { height: "h-[62px]", fill: "from-[hsl(44_96%_70%)] to-[hsl(40_88%_50%)]", order: "order-2" },
  2: { height: "h-[42px]", fill: "from-[hsl(214_20%_86%)] to-[hsl(215_16%_66%)]", order: "order-1" },
  3: { height: "h-[34px]", fill: "from-[hsl(28_60%_78%)] to-[hsl(25_58%_54%)]", order: "order-3" },
} as const;

/** Tiny confetti motif — celebratory but restrained. */
function Confetti() {
  const bits = [
    "left-4 top-5 h-1.5 w-1.5 rounded-full bg-medal-gold/50",
    "left-10 top-12 h-1 w-1 rounded-full bg-primary/40",
    "right-6 top-4 h-1.5 w-1.5 rotate-45 bg-home-ranking-accent/40",
    "right-12 top-14 h-1 w-1 rounded-full bg-medal-gold/40",
    "left-1/2 top-2 h-1 w-1 rounded-full bg-primary/30",
  ];
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0">
      {bits.map((b) => (
        <span key={b} className={cn("absolute", b)} />
      ))}
    </span>
  );
}

/**
 * Top 3 stepped podium — identical on Home and the dedicated Leaderboard page.
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
  const solo = !!first && !second && !third;

  return (
    <section
      aria-label="Top three students"
      className="relative overflow-hidden rounded-[26px] border border-podium-border bg-gradient-to-b from-podium to-white px-3 pb-0 pt-5 shadow-[0_6px_22px_rgba(15,23,42,0.06)]"
    >
      <Confetti />

      <div
        className={cn(
          "relative flex items-end justify-center gap-2",
          solo && "px-[26%]",
        )}
      >
        {second && <PodiumColumn entry={second} place={2} meId={meId} />}
        {first && <PodiumColumn entry={first} place={1} meId={meId} />}
        {third && <PodiumColumn entry={third} place={3} meId={meId} />}
      </div>

      {footer && (
        <p className="relative border-t border-slate-100 py-2.5 text-center text-[12.5px] font-semibold text-slate-600">
          {footer}
        </p>
      )}
      {!footer && <div className="h-3" />}
    </section>
  );
}

function PodiumColumn({
  entry,
  place,
  meId,
}: {
  entry: LeaderboardEntry;
  place: 1 | 2 | 3;
  meId?: string;
}) {
  const medal = MEDALS[place];
  const plinth = PLINTH[place];
  const isMe = entry.user_id === meId;
  const isFirst = place === 1;

  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-col items-center text-center motion-safe:animate-fade-up",
        plinth.order,
      )}
    >
      {isFirst && <Crown className="mb-1 h-5 w-5 text-medal-gold" aria-hidden="true" />}
      <div className="relative">
        <UserAvatar
          path={entry.avatar_path}
          name={entry.name}
          className={cn(
            "ring-2 ring-offset-2 ring-offset-white",
            isFirst ? "h-[64px] w-[64px]" : "h-[50px] w-[50px]",
            medal.ring,
          )}
          fallbackClassName={isFirst ? "text-base" : "text-[13px]"}
        />
        {isMe && (
          <YouPill className="absolute -right-2 -top-1 shadow-[0_2px_6px_rgba(15,23,42,0.18)]" />
        )}
      </div>

      <p
        className={cn(
          "mt-2 w-full truncate font-bold text-slate-900",
          isFirst ? "text-[15px]" : "text-[13px]",
        )}
      >
        {isMe ? "You" : entry.name}
      </p>
      <p
        className={cn(
          "font-bold tabular-nums",
          isFirst ? "text-[14px]" : "text-[12.5px]",
          medal.xp,
        )}
      >
        {formatXp(entry.xp)}
      </p>

      {/* Stepped plinth block */}
      <div
        className={cn(
          "mt-2 flex w-full items-start justify-center rounded-t-[12px] bg-gradient-to-b pt-1.5 shadow-[inset_0_2px_6px_rgba(255,255,255,0.45)]",
          plinth.height,
          plinth.fill,
        )}
      >
        <span className="text-[17px] font-extrabold text-white/95 drop-shadow-sm">{place}</span>
      </div>
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
      className="rounded-[26px] border border-podium-border bg-gradient-to-b from-podium to-white px-3 pt-5"
      aria-hidden="true"
    >
      <div className="flex items-end justify-center gap-2">
        {[
          { a: "h-[50px] w-[50px]", p: "h-[42px]" },
          { a: "h-[64px] w-[64px]", p: "h-[62px]" },
          { a: "h-[50px] w-[50px]", p: "h-[34px]" },
        ].map((s, i) => (
          <div key={i} className="flex flex-1 flex-col items-center">
            <div className={`animate-pulse rounded-full bg-white/80 ${s.a}`} />
            <div className="mt-2 h-3.5 w-16 animate-pulse rounded-full bg-white/80" />
            <div className="mt-1.5 h-3 w-12 animate-pulse rounded-full bg-white/80" />
            <div className={`mt-2 w-full rounded-t-[12px] bg-white/70 ${s.p}`} />
          </div>
        ))}
      </div>
    </div>
  );
}
