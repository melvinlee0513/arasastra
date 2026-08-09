import { useAuth } from "@/hooks/useAuth";
import { useGamification } from "@/hooks/useGamification";
import { useFeatureEnabled } from "@/hooks/useFeature";
import { useStudentProfile } from "@/lib/studentProfile";
import { useStudentHomeFeed, useStudentLeaderboard } from "@/lib/studentHome";
import { StudentHomeHero } from "./StudentHomeHero";
import { StudentHomeAnnouncements } from "./StudentHomeAnnouncements";
import { StudentHomeContinueLearning } from "./StudentHomeContinueLearning";
import { StudentHomeComingUp } from "./StudentHomeComingUp";
import { StudentHomeLeaderboard } from "./StudentHomeLeaderboard";

/**
 * Student mobile Home — a daily learning feed.
 *
 * Rhythm: personalised header → Important Updates carousel → Continue Learning
 * deck → Coming Up timeline → Top 3 XP podium. Each section adopts the shape of
 * its information; no course-progress UX and no duplicate class browser.
 */
export function StudentHomeMobile() {
  const { user } = useAuth();
  const gamification = useGamification();
  const gamificationOn = useFeatureEnabled("gamification");
  const leaderboardsOn = useFeatureEnabled("leaderboards");
  const showLeaderboard = gamificationOn && gamification.enabled && leaderboardsOn;

  const feed = useStudentHomeFeed();
  // Shares the "This Week" leaderboard query cache with the podium preview, so
  // the hero rank chip costs no extra request.
  const weekly = useStudentLeaderboard("week", showLeaderboard, 3);
  const profileQuery = useStudentProfile();

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-3xl space-y-6 px-4 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(96px+env(safe-area-inset-bottom))]">
        <StudentHomeHero
          profile={profileQuery.data}
          isLoading={profileQuery.isLoading || !profileQuery.data}
          showGamification={gamificationOn && gamification.enabled}
          showRank={showLeaderboard}
          statsLoading={gamification.isLoading}
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

        {showLeaderboard && <StudentHomeLeaderboard currentUserId={user?.id} />}
      </div>
    </div>
  );
}
