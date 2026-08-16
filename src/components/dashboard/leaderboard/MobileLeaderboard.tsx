import { useEffect, useRef, useState } from "react";
import { AlertCircle, BarChart3, ChevronLeft, Info, Trophy } from "lucide-react";
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
import { useAuth } from "@/hooks/useAuth";
import { formatXp, useStudentLeaderboard, type LeaderboardPeriod } from "@/lib/studentHome";
import {
  CurrentStudentRank,
  LEADERBOARD_PERIODS,
  LeaderboardPeriodSelector,
  LeaderboardPodium,
  LeaderboardPodiumSkeleton,
  LeaderboardRow,
  gapToNextLabel,
  periodLabel,
} from "./LeaderboardShared";

/** Server-side page size — mobile never renders an unbounded roster. */
const PAGE_SIZE = 50;

/**
 * Student mobile Leaderboard.
 *
 * Uses the same shared podium/row/period components as the Home preview, and the
 * same canonical centre-scoped reader (`get_student_xp_leaderboard`), so ranking
 * data can never disagree between the two surfaces.
 */
export function MobileLeaderboard() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<LeaderboardPeriod>("week");
  const [infoOpen, setInfoOpen] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);

  const { data, isLoading, isError, refetch, isFetching } = useStudentLeaderboard(
    period,
    true,
    limit,
  );

  const entries = data?.top ?? [];
  const me = data?.me ?? null;
  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);
  const meInPodium = !!me && me.position <= 3;
  const total = data?.total ?? 0;
  const hasMore = entries.length < total;
  const activeBlurb = LEADERBOARD_PERIODS.find((p) => p.value === period)?.blurb ?? "";
  const gap = gapToNextLabel(me);

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
      <div className="mx-auto max-w-[480px] space-y-4 px-4 pb-[calc(96px+env(safe-area-inset-bottom))] md:max-w-2xl md:px-6 md:pb-12">
        <Link
          to="/dashboard/more"
          className="-ml-1 inline-flex h-11 items-center gap-1 pr-2 text-[13px] font-semibold text-slate-500"
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

        <LeaderboardPeriodSelector
          value={period}
          onChange={(p) => {
            setLimit(PAGE_SIZE);
            setPeriod(p);
          }}
        />

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
                : `No leaderboard activity yet ${periodLabel(period)}.`}
            </p>
            <p className="text-[13px] text-slate-500">Start earning XP to claim a spot.</p>
          </div>
        ) : (
          <>
            <LeaderboardPodium entries={podium} meId={user?.id} />

            {me && meInPodium && (
              <p className="px-1 text-[13px] font-medium text-slate-600">
                {me.position === 1
                  ? `You're leading ${periodLabel(period)}.`
                  : `You're #${me.position} ${periodLabel(period)}.${gap ? ` ${gap}.` : ""}`}
              </p>
            )}

            {me && !meInPodium && (
              <section className="space-y-2">
                <h2 className="px-1 text-[15px] font-bold text-slate-900">Your position</h2>
                <CurrentStudentRank me={me} />
              </section>
            )}

            {rest.length > 0 && (
              <section className="space-y-2">
                <h2 className="px-1 text-[15px] font-bold text-slate-900">Leaderboard</h2>
                <ul className="divide-y divide-slate-100 overflow-hidden rounded-[22px] border border-slate-200 bg-white">
                  {rest.map((entry) => {
                    const isMe = entry.user_id === user?.id;
                    return (
                      <li key={entry.user_id} ref={isMe ? myRowRef : undefined}>
                        <LeaderboardRow entry={entry} isMe={isMe} />
                      </li>
                    );
                  })}
                </ul>
                {hasMore && (
                  <Button
                    variant="outline"
                    className="h-11 w-full rounded-full"
                    onClick={() => setLimit((l) => l + PAGE_SIZE)}
                    disabled={isFetching}
                  >
                    {isFetching ? "Loading…" : "Show more"}
                  </Button>
                )}
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
      <LeaderboardPodiumSkeleton />
      <div className="h-[68px] rounded-[20px] bg-slate-200/70" />
      <div className="divide-y divide-slate-100 overflow-hidden rounded-[22px] border border-slate-200 bg-white">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3 px-3.5 py-3">
            <div className="h-3 w-4 rounded bg-slate-200/80" />
            <div className="h-10 w-10 rounded-full bg-slate-200/80" />
            <div className="h-3.5 flex-1 rounded-full bg-slate-200/80" />
            <div className="h-3.5 w-14 rounded-full bg-slate-200/80" />
          </div>
        ))}
      </div>
    </div>
  );
}
