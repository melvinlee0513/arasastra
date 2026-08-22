/**
 * Canonical tutor schedule data layer.
 *
 * Tutor surfaces must never derive "next class" from the legacy one-off
 * `classes.scheduled_at` value. `get_tutor_next_classes` expands the same
 * recurrence model the student Timetable / Study / Home surfaces use, scoped by
 * `auth.uid()`, the tutor's tenant and canonical `class_tutors` assignments.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";

/** One row of `get_tutor_next_classes` — next real occurrence per class. */
export interface TutorNextClass {
  class_id: string;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
  in_progress: boolean;
}

export async function fetchTutorNextClasses(
  horizonDays = 60,
): Promise<TutorNextClass[]> {
  const { data, error } = await supabase.rpc("get_tutor_next_classes", {
    _horizon_days: horizonDays,
  });
  if (error) throw error;
  return Array.isArray(data) ? (data as unknown as TutorNextClass[]) : [];
}

/**
 * Next occurrence per assigned class, keyed by class id. Shared by Tutor
 * My Classes and the Tutor dashboard so both render identical schedule data.
 */
export function useTutorNextClasses(horizonDays = 60) {
  const { user, hasRole } = useAuth();
  const { currentTenantId } = useTenant();

  const query = useQuery({
    queryKey: ["tutor-next-classes", currentTenantId ?? null, user?.id ?? null, horizonDays],
    enabled: !!user?.id && !!currentTenantId && hasRole("tutor"),
    staleTime: 60_000,
    queryFn: () => fetchTutorNextClasses(horizonDays),
  });

  const byClass = useMemo(
    () => new Map<string, TutorNextClass>((query.data ?? []).map((n) => [n.class_id, n])),
    [query.data],
  );

  const upcoming = useMemo(
    () =>
      (query.data ?? [])
        .slice()
        .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()),
    [query.data],
  );

  return { byClass, upcoming, isLoading: query.isLoading, error: query.error };
}
