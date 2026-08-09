/**
 * Contextual data for the student mobile "More" hub.
 *
 * Everything here delegates to the canonical production sources so the hub can
 * never contradict the full pages:
 *  - next class  → `get_student_timetable` (same reader as /timetable)
 *  - unread mail → `get_student_inbox` (same reader as /inbox)
 *  - leaderboard → `get_student_xp_leaderboard` via useStudentLeaderboard
 */

import { useNextTimetableClass } from "@/lib/studentTimetable";
import { useInboxUnreadCount } from "@/lib/studentInbox";

export interface NextClassPreview {
  class_id: string;
  title: string;
  class_name: string | null;
  subject_name: string | null;
  at: string;
}

/** Next upcoming enrolled class — identical dataset to the Timetable page. */
export function useNextClass() {
  const { next, isLoading, isError } = useNextTimetableClass();
  const preview: NextClassPreview | null = next
    ? {
        class_id: next.class_id,
        title: next.title,
        class_name: next.title,
        subject_name: next.subject_name,
        at: next.starts_at,
      }
    : null;

  return { next: preview, isLoading, isError };
}

/** Unread inbox count — reads the shared inbox cache entry, never a second counter. */
export function useUnreadInboxCount() {
  const { count, isLoading, isError } = useInboxUnreadCount();
  return { data: count, isLoading, isError };
}
