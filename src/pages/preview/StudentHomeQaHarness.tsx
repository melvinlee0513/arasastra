/**
 * TEMPORARY visual-QA harness for the student mobile Home redesign.
 *
 * Renders the presentational Home modules with local sample props so the layout
 * can be inspected without an authenticated session. Not routed in production
 * navigation and deleted once the visual pass is verified.
 */
import { StudentHomeHero } from "@/components/dashboard/home/StudentHomeHero";
import { StudentHomeAnnouncements } from "@/components/dashboard/home/StudentHomeAnnouncements";
import { StudentHomeContinueLearning } from "@/components/dashboard/home/StudentHomeContinueLearning";
import { StudentHomeQuickPractice } from "@/components/dashboard/home/StudentHomeQuickPractice";
import { StudentHomeComingUp } from "@/components/dashboard/home/StudentHomeComingUp";
import { HomePageDecor } from "@/components/dashboard/home/StudentHomeShared";
import type { StudentProfileRecord } from "@/lib/studentProfile";
import type {
  HomeAnnouncement,
  HomeContinueItem,
  HomeUpcomingItem,
} from "@/lib/studentHome";

const profile: StudentProfileRecord = {
  id: "p1",
  user_id: "u1",
  full_name: "Student Tan",
  display_name: "Student",
  bio: null,
  avatar_path: null,
  avatar_updated_at: null,
  center_id: "c1",
  form_year: "Form 5",
  created_at: null,
  home_header_color: "blue",
};

const announcements: HomeAnnouncement[] = [
  {
    id: "a1",
    class_id: "c1",
    title: "TESTING 1",
    preview: "Check your whatsapp group for latest updates!",
    is_pinned: true,
    at: new Date(Date.now() - 864e5).toISOString(),
    class_name: "Physics Form 5 Test",
    subject_name: "Physics",
    author_name: "Tutor 1",
  },
  {
    id: "a2",
    class_id: "c2",
    title: "Additional Mathematics",
    preview: "Extra class this Saturday at 10am.",
    is_pinned: false,
    at: new Date(Date.now() - 2 * 864e5).toISOString(),
    class_name: "Add Maths Form 5",
    subject_name: "Additional Mathematics",
    author_name: "Tutor 2",
  },
];

const continueItems: HomeContinueItem[] = [
  {
    item_id: "f1",
    class_id: "c1",
    title: "Chapter 1",
    kind: "flashcards",
    category: "flashcards",
    at: new Date(Date.now() - 864e5).toISOString(),
    in_progress: true,
    class_name: "Physics Form 5 Test",
    subject_name: "Physics",
  },
];

const upcoming: HomeUpcomingItem[] = [
  {
    item_id: "s1",
    class_id: "c1",
    title: "Physics Form 5",
    kind: "class",
    at: new Date(Date.now() + 6 * 36e5).toISOString(),
    class_name: "Physics Form 5",
    subject_name: "Physics",
  },
  {
    item_id: "s2",
    class_id: "c2",
    title: "Additional Mathematics",
    kind: "class",
    at: new Date(Date.now() + 8 * 36e5).toISOString(),
    class_name: "Additional Mathematics",
    subject_name: "Additional Mathematics",
  },
];

export default function StudentHomeQaHarness() {
  return (
    <div className="relative min-h-screen bg-[hsl(220_20%_98%)]">
      <HomePageDecor />
      <div className="relative mx-auto max-w-3xl space-y-7 px-4 pb-24 pt-5">
        <StudentHomeHero
          profile={profile}
          isLoading={false}
          showGamification
          showRank
          statsLoading={false}
          streak={1}
          totalXp={35}
          rank={1}
          unreadCount={2}
        />
        <StudentHomeAnnouncements
          items={announcements}
          isLoading={false}
          isError={false}
          onRetry={() => undefined}
          viewAllTo="/dashboard/classes"
        />
        <div className="space-y-3">
          <StudentHomeContinueLearning
            items={continueItems}
            isLoading={false}
            isError={false}
            onRetry={() => undefined}
          />
          <StudentHomeQuickPractice items={continueItems} isLoading={false} />
        </div>
        <StudentHomeComingUp
          items={upcoming}
          isLoading={false}
          isError={false}
          onRetry={() => undefined}
        />
      </div>
    </div>
  );
}
