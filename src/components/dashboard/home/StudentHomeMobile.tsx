import { useAuth } from "@/hooks/useAuth";
import { useGamification } from "@/hooks/useGamification";
import { useFeatureEnabled } from "@/hooks/useFeature";
import { useStudentProfile } from "@/lib/studentProfile";
import { useStudentHomeFeed, useStudentLeaderboard } from "@/lib/studentHome";
import { useInboxUnreadCount } from "@/lib/studentInbox";
import { StudentHomeHero } from "./StudentHomeHero";
import { StudentHomeAnnouncements } from "./StudentHomeAnnouncements";
import { StudentHomeContinueLearning } from "./StudentHomeContinueLearning";
import { StudentHomeQuickPractice } from "./StudentHomeQuickPractice";
import { StudentHomeComingUp } from "./StudentHomeComingUp";
import { StudentHomeLeaderboard } from "./StudentHomeLeaderboard";

/**
 * Student mobile Home — a playful-premium daily learning feed.
 *
 * Rhythm: open hero (avatar + greeting + bell + stat widgets) → Important
 * Updates carousel → Continue Learning deck → Quick Practice strip → Coming Up
 * timeline → Top 3 XP podium. Every section adopts the shape of its information;
 * no course-progress UX and no duplicate class browser.
 */
export function StudentHomeMobile() {
  const { user } = useAuth();
  const gamification = useGamification();
  const gamificationOn = useFeatureEnabled("gamification");
  const leaderboardsOn = useFeatureEnabled("leaderboards");
  const inboxOn = useFeatureEnabled("studentInbox");
  const showLeaderboard = gamificationOn && gamification.enabled && leaderboardsOn;

  const feed = useStudentHomeFeed();
  // Shares the "This Week" leaderboard query cache with the podium preview, so
  // the hero rank chip costs no extra request.
  const weekly = useStudentLeaderboard("week", showLeaderboard, 3);
  const profileQuery = useStudentProfile();
  const unread = useInboxUnreadCount();

  return (
    <div className="min-h-screen bg-[hsl(220_20%_98%)]">
      <div className="mx-auto max-w-3xl space-y-7 px-4 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-[calc(104px+env(safe-area-inset-bottom))]">
        <StudentHomeHero
          profile={profileQuery.data}
          isLoading={profileQuery.isLoading || !profileQuery.data}
          showGamification={gamificationOn && gamification.enabled}
          showRank={showLeaderboard}
          statsLoading={gamification.isLoading}
          streak={gamification.currentStreak}
          totalXp={gamification.totalXp}
          rank={weekly.data?.me?.position ?? null}
          unreadCount={inboxOn ? unread.count : 0}
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

        <div className="space-y-3">
          <StudentHomeContinueLearning
            items={feed.data?.continue_learning ?? []}
            isLoading={feed.isLoading}
            isError={feed.isError}
            onRetry={() => feed.refetch()}
          />

          <StudentHomeQuickPractice
            items={feed.data?.continue_learning ?? []}
            isLoading={feed.isLoading}
          />
        </div>

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
