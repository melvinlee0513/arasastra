/**
 * Student mobile Home data layer.
 *
 * One aggregated, tenant-scoped RPC (`get_student_home_feed`) powers the
 * announcements, Continue Learning and Coming Up sections, and a second
 * centre-scoped RPC (`get_student_xp_leaderboard`) powers the leaderboard.
 * Both are SECURITY DEFINER readers that validate `auth.uid()`, the student's
 * own `center_id` and their active enrolments, so nothing is filtered in React.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";

export type AnnouncementPriority = "normal" | "important";

export interface HomeAnnouncement {
  id: string;
  class_id: string;
  title: string;
  preview: string | null;
  is_pinned: boolean;
  at: string | null;
  class_name: string | null;
  subject_name: string | null;
  author_name: string | null;
}

export type ContinueCategory = "resource" | "quiz" | "flashcards";

export interface HomeContinueItem {
  item_id: string;
  class_id: string;
  title: string;
  /** Underlying resource_type for materials, otherwise the category. */
  kind: string | null;
  category: ContinueCategory;
  at: string;
  in_progress: boolean;
  class_name: string | null;
  subject_name: string | null;
}

export type UpcomingKind = "class" | "quiz_due" | "quiz_open";

export interface HomeUpcomingItem {
  item_id: string;
  class_id: string;
  title: string;
  kind: UpcomingKind;
  at: string;
  class_name: string | null;
  subject_name: string | null;
}

export interface StudentHomeFeed {
  announcements: HomeAnnouncement[];
  continue_learning: HomeContinueItem[];
  coming_up: HomeUpcomingItem[];
}

export type LeaderboardPeriod = "week" | "month" | "all";

export interface LeaderboardEntry {
  user_id: string;
  name: string;
  avatar_url: string | null;
  /** Private-bucket avatar reference; rendered through <UserAvatar />. */
  avatar_path: string | null;
  xp: number;
  position: number;
}

export interface LeaderboardMe extends LeaderboardEntry {
  /** Rank held by the student directly above; null when leading. */
  next_position: number | null;
  next_xp: number | null;
}

export interface StudentLeaderboard {
  period: LeaderboardPeriod;
  top: LeaderboardEntry[];
  me: LeaderboardMe | null;
  /** Number of students with XP in this period (server-counted). */
  total: number;
}

const EMPTY_FEED: StudentHomeFeed = {
  announcements: [],
  continue_learning: [],
  coming_up: [],
};

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export async function fetchStudentHomeFeed(): Promise<StudentHomeFeed> {
  const { data, error } = await supabase.rpc("get_student_home_feed", {
    _announcement_limit: 3,
    _continue_limit: 5,
    _upcoming_limit: 6,
    _upcoming_days: 14,
  });
  if (error) throw error;
  const payload = (data ?? {}) as Record<string, unknown>;
  if (!payload || typeof payload !== "object") return EMPTY_FEED;
  return {
    announcements: asArray<HomeAnnouncement>(payload.announcements),
    continue_learning: asArray<HomeContinueItem>(payload.continue_learning),
    coming_up: asArray<HomeUpcomingItem>(payload.coming_up),
  };
}

export async function fetchStudentLeaderboard(
  period: LeaderboardPeriod,
  limit = 3,
): Promise<StudentLeaderboard> {
  const { data, error } = await supabase.rpc("get_student_xp_leaderboard", {
    _period: period,
    _limit: limit,
  });
  if (error) throw error;
  const payload = (data ?? {}) as Record<string, unknown>;
  return {
    period,
    top: asArray<LeaderboardEntry>(payload.top),
    me: (payload.me as StudentLeaderboard["me"]) ?? null,
    total: typeof payload.total === "number" ? payload.total : 0,
  };
}

/** Record that the student opened a published class material. Best effort. */
export async function recordResourceActivity(resourceId: string): Promise<void> {
  const { error } = await supabase.rpc("record_resource_activity", {
    _resource_id: resourceId,
  });
  if (error) {
    // Non-blocking: activity tracking must never break opening a resource.
    console.warn("[home] record_resource_activity failed", error.message);
  }
}

export const studentHomeKeys = {
  feed: (tenantId: string | null | undefined, userId: string | undefined) =>
    ["student-home-feed", tenantId ?? null, userId ?? null] as const,
  leaderboard: (
    tenantId: string | null | undefined,
    userId: string | undefined,
    period: LeaderboardPeriod,
    limit = 3,
  ) =>
    ["student-home-leaderboard", tenantId ?? null, userId ?? null, period, limit] as const,
};

export function useStudentHomeFeed() {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();

  return useQuery({
    queryKey: studentHomeKeys.feed(currentTenantId, user?.id),
    enabled: !!user?.id,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    queryFn: fetchStudentHomeFeed,
  });
}

export function useStudentLeaderboard(
  period: LeaderboardPeriod,
  enabled: boolean,
  limit = 3,
) {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();

  return useQuery({
    queryKey: studentHomeKeys.leaderboard(currentTenantId, user?.id, period, limit),
    enabled: enabled && !!user?.id,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    // Keeps the shell + selector stable while a new period loads.
    placeholderData: (prev) => prev,
    queryFn: () => fetchStudentLeaderboard(period, limit),
  });
}

/** Formats XP the same way everywhere: integer, thousands separated. */
export function formatXp(xp: number): string {
  return `${Math.round(xp).toLocaleString("en-US")} XP`;
}

/** Priority derived from the canonical announcement model (pinned = important). */
export function announcementPriority(a: HomeAnnouncement): AnnouncementPriority {
  return a.is_pinned ? "important" : "normal";
}

/** Existing student destination for an announcement. */
export function announcementRoute(a: HomeAnnouncement): string {
  return `/dashboard/classes/${a.class_id}/announcements`;
}

/** Existing student destination for a recently accessed item. */
export function continueRoute(item: HomeContinueItem): string {
  const base = `/dashboard/classes/${item.class_id}`;
  switch (item.category) {
    case "quiz":
      return `${base}/quizzes`;
    case "flashcards":
      return `${base}/flashcards`;
    default:
      return `${base}/materials`;
  }
}

/** Existing student destination for an upcoming agenda item. */
export function upcomingRoute(item: HomeUpcomingItem): string {
  const base = `/dashboard/classes/${item.class_id}`;
  return item.kind === "class" ? base : `${base}/quizzes`;
}

export function continueKindLabel(item: HomeContinueItem): string {
  if (item.category === "quiz") return "Quiz";
  if (item.category === "flashcards") return "Flashcards";
  const kind = (item.kind ?? "").toLowerCase();
  switch (kind) {
    case "note":
    case "notes":
      return "Notes";
    case "video":
      return "Video";
    case "replay":
      return "Replay";
    case "worksheet":
      return "Worksheet";
    case "link":
      return "Link";
    default:
      return "Material";
  }
}

export function upcomingKindLabel(kind: UpcomingKind): string {
  switch (kind) {
    case "quiz_due":
      return "Quiz due";
    case "quiz_open":
      return "Quiz opens";
    default:
      return "Tuition class";
  }
}
