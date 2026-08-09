import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useGamification } from "@/hooks/useGamification";
import { useFeatureEnabled } from "@/hooks/useFeature";
import {
  useStudentHomeFeed,
  useStudentLeaderboard,
  type LeaderboardPeriod,
} from "@/lib/studentHome";
import {
  StudentHomeWelcome,
  StudentHomeGamification,
} from "./StudentHomeWelcome";
import { StudentHomeAnnouncements } from "./StudentHomeAnnouncements";
import { StudentHomeContinueLearning } from "./StudentHomeContinueLearning";
import { StudentHomeComingUp } from "./StudentHomeComingUp";
import { StudentHomeLeaderboard } from "./StudentHomeLeaderboard";

/**
 * Student mobile Home — a personalised command centre.
 *
 * Information areas, in order: Welcome + gamification, Important Updates,
 * Continue Learning, Coming Up, XP Leaderboard. No course-progress UX and no
 * duplicate class browser (that lives under the Study tab).
 */
export function StudentHomeMobile() {
  const { user, profile, isLoading: authLoading } = useAuth();
  const gamification = useGamification();
  const gamificationOn = useFeatureEnabled("gamification");
  const leaderboardsOn = useFeatureEnabled("leaderboards");
  const showLeaderboard = gamificationOn && gamification.enabled && leaderboardsOn;

  const [period, setPeriod] = useState<LeaderboardPeriod>("week");

  const feed = useStudentHomeFeed();
  // Shares the leaderboard query cache, so the rank chip costs no extra request
  // when the leaderboard is also showing "This Week".
  const weekly = useStudentLeaderboard("week", showLeaderboard);

  const firstName = (profile?.display_name || profile?.full_name || "").split(" ")[0] ?? "";

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-3xl space-y-6 px-4 pt-6">
        <StudentHomeWelcome firstName={firstName} isLoading={authLoading && !profile} />

        <StudentHomeGamification
          show={gamificationOn && gamification.enabled}
          showRank={showLeaderboard}
          isLoading={gamification.isLoading}
          streak={gamification.currentStreak}
          totalXp={gamification.totalXp}
          rank={weekly.data?.me?.position ?? null}
        />

        <StudentHomeAnnouncements
          items={feed.data?.announcements ?? []}
          isLoading={feed.isLoading}
          isError={feed.isError}
          onRetry={() => feed.refetch()}
          viewAllTo={
            feed.data?.announcements?.[0]
              ? `/dashboard/classes/${feed.data.announcements[0].class_id}/announcements`
              : undefined
          }
        />

        <StudentHomeContinueLearning
          items={feed.data?.continue_learning ?? []}
          isLoading={feed.isLoading}
          isError={feed.isError}
          onRetry={() => feed.refetch()}
        />

        <StudentHomeComingUp
          items={feed.data?.coming_up ?? []}
          isLoading={feed.isLoading}
          isError={feed.isError}
          onRetry={() => feed.refetch()}
        />

        {showLeaderboard && (
          <StudentHomeLeaderboard
            currentUserId={user?.id}
            period={period}
            onPeriodChange={setPeriod}
          />
        )}
      </div>
    </div>
  );
}
