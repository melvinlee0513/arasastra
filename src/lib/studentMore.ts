/**
 * Contextual data for the student mobile "More" hub.
 *
 * Everything here reuses existing production sources:
 *  - next class  → `get_student_home_feed` (coming_up, kind = "class")
 *  - unread mail → `notifications` (RLS-scoped to the authenticated user)
 *  - leaderboard → `get_student_xp_leaderboard` via useStudentLeaderboard
 *
 * No new tables, no new ranking implementation, no fabricated values.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { useStudentHomeFeed, type HomeUpcomingItem } from "@/lib/studentHome";

/** Next upcoming enrolled class, derived from the existing Home feed. */
export function useNextClass() {
  const feed = useStudentHomeFeed();
  const now = Date.now();
  const next: HomeUpcomingItem | null =
    (feed.data?.coming_up ?? [])
      .filter((i) => i.kind === "class" && new Date(i.at).getTime() >= now)
      .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())[0] ?? null;

  return { next, isLoading: feed.isLoading, isError: feed.isError };
}

/** Unread notification count for the signed-in student. */
export function useUnreadInboxCount() {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();

  return useQuery({
    queryKey: ["student-more-unread", currentTenantId ?? null, user?.id ?? null],
    enabled: !!user?.id,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .eq("is_read", false);
      if (error) throw error;
      return count ?? 0;
    },
  });
}
