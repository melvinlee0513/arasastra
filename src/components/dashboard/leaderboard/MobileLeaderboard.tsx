import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  BarChart3,
  ChevronLeft,
  Crown,
  Info,
  Trophy,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { UserAvatar } from "@/components/profile/UserAvatar";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import {
  formatXp,
  useStudentLeaderboard,
  type LeaderboardEntry,
  type LeaderboardPeriod,
} from "@/lib/studentHome";

/** Server-side page size — mobile never renders an unbounded roster. */
const BOARD_LIMIT = 50;

const PERIODS: { value: LeaderboardPeriod; label: string; blurb: string }[] = [
  { value: "week", label: "This Week", blurb: "See who's leading this week." },
  { value: "month", label: "This Month", blurb: "See who's leading this month." },
  { value: "all", label: "All Time", blurb: "All-time XP across your centre." },
];

const MEDALS = {
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

/**
 * Student mobile Leaderboard.
 *
 * Ranking, XP and the gap to the next rank all come from the canonical
 * centre-scoped reader (`get_student_xp_leaderboard`) — nothing is ranked or
 * recomputed in React, and no cross-tenant profile query exists here.
 */
export function MobileLeaderboard() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<LeaderboardPeriod>("week");
  const [infoOpen, setInfoOpen] = useState(false);

  const { data, isLoading, isError, refetch, isFetching } = useStudentLeaderboard(
    period,
    true,
    BOARD_LIMIT,
  );

  const entries = data?.top ?? [];
  const me = data?.me ?? null;
  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);
  const meInPodium = !!me && me.position <= 3;
  const activeBlurb = PERIODS.find((p) => p.value === period)?.blurb ?? "";

  // Sticky rank card appears only while the student's own row is off-screen.
  const myRowRef = useRef<HTMLLIElement | null>(null);
  const [myRowVisible, setMyRowVisible] = useState(true);
  useEffect(() => {
    const node = myRowRef.current;
    if (!node) {
      setMyRowVisible(false);
      return;
    }
    setMyRowVisible(false);
    const observer = new IntersectionObserver(
      ([entry]) => setMyRowVisible(entry.isIntersecting),
      { rootMargin: "-72px 0px -140px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [rest.length, me?.user_id, period]);

  const showSticky =
    !!me && !meInPodium && !myRowVisible && rest.length > 6 && !isLoading && !isError;

  return (
    <div
      className="min-h-screen bg-slate-50"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
    >
      <div className="mx-auto max-w-[480px] space-y-4 px-4 pb-[calc(96px+env(safe-area-inset-bottom))]">
        {/* Route-aware back to the More hub — no desktop breadcrumbs on mobile. */}
        <Link
          to="/dashboard/more"
          className="inline-flex h-11 items-center gap-1 -ml-1 pr-2 text-[13px] font-semibold text-slate-500"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          More
        </Link>

        <header className="flex items-start gap-3">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-primary/10">
            <BarChart3 className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-[22px] font-bold leading-tight text-slate-900">Leaderboard</h1>
            <p className="text-[13px] text-slate-500">{activeBlurb}</p>
          </div>
          <button
            type="button"
            onClick={() => setInfoOpen(true)}
            aria-label="How XP works"
            className="-mr-2 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-slate-400 active:bg-slate-100"
          >
            <Info className="h-[18px] w-[18px]" aria-hidden="true" />
          </button>
        </header>

        <PeriodSelector value={period} onChange={setPeriod} />

        {isLoading ? (
          <BoardSkeleton />
        ) : isError ? (
          <div className="rounded-[22px] border border-slate-200 bg-white p-6 text-center">
            <AlertCircle className="mx-auto mb-2 h-6 w-6 text-destructive" aria-hidden="true" />
            <p className="text-sm font-semibold text-slate-900">
              Couldn't load the leaderboard.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-3 h-10 rounded-full"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              Retry
            </Button>
          </div>
        ) : podium.length === 0 ? (
          <div className="flex flex-col items-center gap-1 rounded-[22px] border border-slate-200 bg-white px-5 py-7 text-center">
            <Trophy className="h-6 w-6 text-slate-300" aria-hidden="true" />
            <p className="text-sm font-semibold text-slate-900">
              {period === "all"
                ? "No leaderboard activity yet."
                : `No leaderboard activity yet ${period === "week" ? "this week" : "this month"}.`}
            </p>
            <p className="text-[13px] text-slate-500">
              Start earning XP to claim a spot.
            </p>
          </div>
        ) : (
          <>
            <Podium entries={podium} meId={user?.id} />

            {me && (
              <MyPosition
                me={me}
                inPodium={meInPodium}
                period={period}
              />
            )}

            {rest.length > 0 && (
              <section className="space-y-2">
                <h2 className="px-1 text-[15px] font-bold text-slate-900">Leaderboard</h2>
                <ul className="divide-y divide-slate-100 overflow-hidden rounded-[22px] border border-slate-200 bg-white">
                  {rest.map((entry) => {
                    const isMe = entry.user_id === user?.id;
                    return (
                      <li
                        key={entry.user_id}
                        ref={isMe ? myRowRef : undefined}
                        className={cn(
                          "flex items-center gap-3 px-3.5 py-3",
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
                        {isMe && (
                          <span className="flex-shrink-0 rounded-full bg-primary px-2 py-[3px] text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
                            You
                          </span>
                        )}
                        <span
                          className={cn(
                            "flex-shrink-0 text-[13.5px] font-semibold tabular-nums",
                            isMe ? "text-primary" : "text-slate-600",
                          )}
                        >
                          {formatXp(entry.xp)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </>
        )}
      </div>

      {/* Sticky own-rank card, seated above the floating tab bar. */}
      {showSticky && me && (
        <div
          className="fixed left-4 right-4 z-50 mx-auto max-w-[448px] animate-fade-up"
          style={{ bottom: "calc(88px + env(safe-area-inset-bottom, 0px))" }}
        >
          <div className="flex h-14 items-center gap-3 rounded-2xl border border-primary/25 bg-white/95 px-3.5 shadow-[0_8px_28px_rgba(15,23,42,0.14)] backdrop-blur">
            <span className="w-7 text-center text-[13px] font-bold tabular-nums text-primary">
              {me.position}
            </span>
            <UserAvatar
              path={me.avatar_path}
              name={me.name}
              className="h-9 w-9 flex-shrink-0"
              fallbackClassName="text-[11px]"
            />
            <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-slate-900">
              You
            </span>
            <span className="text-[13.5px] font-semibold tabular-nums text-primary">
              {formatXp(me.xp)}
            </span>
          </div>
        </div>
      )}

      <XpInfoSheet open={infoOpen} onOpenChange={setInfoOpen} />
    </div>
  );
}

/* ------------------------------- Period tabs ------------------------------ */

function PeriodSelector({
  value,
  onChange,
}: {
  value: LeaderboardPeriod;
  onChange: (p: LeaderboardPeriod) => void;
}) {
  const index = PERIODS.findIndex((p) => p.value === value);

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
          width: `calc((100% - 0.5rem) / ${PERIODS.length})`,
          transform: `translateX(calc(${index} * 100%))`,
        }}
      />
      {PERIODS.map((p) => (
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

function Podium({ entries, meId }: { entries: LeaderboardEntry[]; meId?: string }) {
  const first = entries.find((e) => e.position === 1) ?? entries[0];
  const second = entries.find((e) => e.position === 2);
  const third = entries.find((e) => e.position === 3);

  return (
    <section
      aria-label="Top three students"
      className="rounded-[24px] border border-podium-border bg-podium px-4 pb-4 pt-4"
    >
      {/* First place, centred and raised. */}
      {first && (
        <div className="flex flex-col items-center text-center">
          <Crown className="mb-1 h-4 w-4 text-medal-gold" aria-hidden="true" />
          <div className="relative">
            <UserAvatar
              path={first.avatar_path}
              name={first.name}
              className="h-[68px] w-[68px] ring-2 ring-offset-2 ring-offset-podium ring-medal-gold/60"
              fallbackClassName="text-base"
            />
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-medal-gold px-1.5 py-[1px] text-[10px] font-bold text-white shadow-sm">
              1
            </span>
          </div>
          <p className="mt-3 max-w-[190px] truncate text-[15px] font-bold text-slate-900">
            {first.user_id === meId ? "You" : first.name}
          </p>
          {first.user_id === meId && <YouPill />}
          <p className="text-[15px] font-bold tabular-nums text-medal-gold">
            {formatXp(first.xp)}
          </p>
        </div>
      )}

      {/* Runners-up, slightly lower and balanced. */}
      {(second || third) && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <PodiumSide entry={second} place={2} meId={meId} />
          <PodiumSide entry={third} place={3} meId={meId} />
        </div>
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
  // No ghost slots: a missing runner-up simply renders nothing.
  if (!entry) return <div aria-hidden="true" />;
  const medal = MEDALS[place];

  return (
    <div className="flex flex-col items-center text-center">
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
      {entry.user_id === meId && <YouPill />}
      <p className={cn("text-[13px] font-semibold tabular-nums", medal.xp)}>
        {formatXp(entry.xp)}
      </p>
    </div>
  );
}

function YouPill() {
  return (
    <span className="my-0.5 rounded-full bg-primary px-2 py-[2px] text-[9.5px] font-bold uppercase tracking-wide text-primary-foreground">
      You
    </span>
  );
}

/* ------------------------------ Your position ----------------------------- */

function periodLabel(period: LeaderboardPeriod): string {
  return period === "week" ? "this week" : period === "month" ? "this month" : "all time";
}

function MyPosition({
  me,
  inPodium,
  period,
}: {
  me: NonNullable<ReturnType<typeof useStudentLeaderboard>["data"]>["me"];
  inPodium: boolean;
  period: LeaderboardPeriod;
}) {
  if (!me) return null;

  // Gap is derived only from server-returned XP of the rank directly above.
  const gap = useMemo(() => {
    if (me.next_xp == null || me.next_position == null) return null;
    const diff = me.next_xp - me.xp;
    return diff > 0 ? `${diff.toLocaleString("en-US")} XP to #${me.next_position}` : null;
  }, [me.next_xp, me.next_position, me.xp]);

  if (inPodium) {
    return (
      <p className="px-1 text-[13px] font-medium text-slate-600">
        {me.position === 1
          ? `You're leading ${periodLabel(period)}.`
          : `You're #${me.position} ${periodLabel(period)}.${gap ? ` ${gap}.` : ""}`}
      </p>
    );
  }

  return (
    <section className="space-y-2">
      <h2 className="px-1 text-[15px] font-bold text-slate-900">Your position</h2>
      <div className="flex items-center gap-3 rounded-[20px] border border-primary/25 bg-primary/[0.07] px-3.5 py-3">
        <span className="w-6 flex-shrink-0 text-center text-[15px] font-bold tabular-nums text-primary">
          {me.position}
        </span>
        <UserAvatar
          path={me.avatar_path}
          name={me.name}
          className="h-10 w-10 flex-shrink-0"
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
    </section>
  );
}

/* ------------------------------- XP info sheet ---------------------------- */

function XpInfoSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-[24px] border-slate-200 pb-[calc(20px+env(safe-area-inset-bottom))]"
      >
        <SheetHeader className="text-left">
          <SheetTitle className="text-[17px]">How XP works</SheetTitle>
          <SheetDescription className="text-[13px]">
            XP is awarded by the server for completed learning activity in your centre.
          </SheetDescription>
        </SheetHeader>
        <ul className="mt-3 space-y-2.5 text-[13.5px] text-slate-600">
          <li className="flex gap-2">
            <span className="mt-[7px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
            Submitting a class quiz awards XP once for that attempt.
          </li>
          <li className="flex gap-2">
            <span className="mt-[7px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
            Completing a flashcard deck awards XP once per deck.
          </li>
          <li className="flex gap-2">
            <span className="mt-[7px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
            Rankings only include students from your own tuition centre.
          </li>
          <li className="flex gap-2">
            <span className="mt-[7px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
            This Week and This Month count XP earned in that period; All Time uses your
            total XP.
          </li>
        </ul>
      </SheetContent>
    </Sheet>
  );
}

/* --------------------------------- Skeleton ------------------------------- */

function BoardSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="rounded-[24px] border border-podium-border bg-podium p-4">
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
      <div className="h-[68px] rounded-[20px] bg-slate-200/70" />
      <div className="divide-y divide-slate-100 overflow-hidden rounded-[22px] border border-slate-200 bg-white">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3 px-3.5 py-3">
            <div className="h-3 w-4 rounded bg-slate-200/80" />
            <div className="h-10 w-10 rounded-full bg-slate-200/80" />
            <div className="h-3.5 flex-1 rounded-full bg-slate-200/70" />
            <div className="h-3.5 w-14 rounded-full bg-slate-200/70" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default MobileLeaderboard;
