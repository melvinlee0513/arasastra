import { Trophy } from "lucide-react";
import { useStudentLeaderboard } from "@/lib/studentHome";
import {
  CurrentStudentRank,
  LeaderboardPodium,
  LeaderboardPodiumSkeleton,
  gapToNextLabel,
} from "@/components/dashboard/leaderboard/LeaderboardShared";
import { HomeSection, HomeSectionHeader, HomeErrorState, HomeEmptyState } from "./StudentHomeShared";

interface Props {
  currentUserId: string | undefined;
}

/**
 * Home XP Leaderboard preview — Top 3 only, rendered with the exact same shared
 * podium component as More → Leaderboard, from the same canonical RPC. Fixed to
 * "This Week"; the full ranking list lives on the dedicated page.
 */
export function StudentHomeLeaderboard({ currentUserId }: Props) {
  const { data, isLoading, isError, refetch } = useStudentLeaderboard("week", true, 3);
  const top = data?.top ?? [];
  const me = data?.me ?? null;
  const meInTop = !!me && me.position <= 3;
  const gap = gapToNextLabel(me);

  return (
    <HomeSection
      header={
        <HomeSectionHeader
          title="XP Leaderboard"
          icon={Trophy}
          accentClassName="bg-home-ranking text-home-ranking-accent"
          caption="This week"
          action={{ label: "View all", to: "/dashboard/leaderboard" }}
          actionClassName="text-home-ranking-accent"
        />
      }
    >
      {isLoading ? (
        <LeaderboardPodiumSkeleton />
      ) : isError ? (
        <HomeErrorState message="Couldn’t load the leaderboard." onRetry={() => refetch()} />
      ) : top.length === 0 ? (
        <HomeEmptyState
          icon={Trophy}
          title="No leaderboard activity yet"
          description="Start earning XP this week to claim a spot."
          accentClassName="bg-home-ranking text-home-ranking-accent"
        />
      ) : (
        <div className="space-y-2.5">
          <LeaderboardPodium
            entries={top}
            meId={currentUserId}
            footer={
              me && meInTop
                ? me.position === 1
                  ? "You’re leading this week 🎉"
                  : gap ?? `You’re #${me.position} this week.`
                : undefined
            }
          />

          {me && !meInTop && (
            <div className="space-y-1.5">
              <p className="px-1 text-[13px] font-semibold text-slate-500">Your rank</p>
              <CurrentStudentRank me={me} compact />
            </div>
          )}
        </div>
      )}
    </HomeSection>
  );
}
