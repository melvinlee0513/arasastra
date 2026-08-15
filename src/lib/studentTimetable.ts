/**
 * Canonical student timetable data layer.
 *
 * One SECURITY DEFINER reader (`get_student_timetable`) is the single source of
 * truth for every timetable surface: By day, Upcoming, week indicator dots,
 * next-class card and the More-page contextual preview. It validates
 * `auth.uid()`, the student's own `center_id` and their **active**
 * `class_enrollments`, so nothing is filtered in React.
 *
 * Times come straight from `classes.scheduled_at` (timestamptz) plus
 * `duration_minutes`; the browser renders them in the viewer's local zone, so
 * Malaysian class times display correctly without manual offset maths.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, startOfWeek } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";

export interface TimetableEntry {
  class_id: string;
  title: string;
  subject_id: string | null;
  subject_name: string | null;
  tutor_name: string | null;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
}

export const WEEK_STARTS_ON = 0 as const; // Sunday-first week calendar.

export function weekStartOf(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: WEEK_STARTS_ON });
}

export async function fetchStudentTimetable(
  from: Date,
  to: Date,
): Promise<TimetableEntry[]> {
  const { data, error } = await supabase.rpc("get_student_timetable", {
    _from: from.toISOString(),
    _to: to.toISOString(),
  });
  if (error) throw error;
  return Array.isArray(data) ? (data as unknown as TimetableEntry[]) : [];
}

/**
 * Timetable for a window that covers the visible week plus the following
 * 6 weeks, so the same dataset can also answer "what is my next class?" and
 * power the Upcoming view without a second, divergent query.
 */
export function useStudentTimetable(weekStart: Date) {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const weekKey = weekStart.toISOString().slice(0, 10);

  const range = useMemo(() => {
    const from = weekStartOf(weekStart);
    return { from, to: addDays(from, 7 + 42) };
  }, [weekStart]);

  const query = useQuery({
    queryKey: ["student-timetable", currentTenantId ?? null, user?.id ?? null, weekKey],
    enabled: !!user?.id,
    queryFn: () => fetchStudentTimetable(range.from, range.to),
    staleTime: 60_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  const entries = query.data ?? [];

  const week = useMemo(() => {
    const end = addDays(range.from, 7).getTime();
    return entries.filter((e) => {
      const t = new Date(e.starts_at).getTime();
      return t >= range.from.getTime() && t < end;
    });
  }, [entries, range.from]);

  const upcoming = useMemo(() => {
    const now = Date.now();
    return entries
      .filter((e) => new Date(e.starts_at).getTime() >= now)
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  }, [entries]);

  return { ...query, entries, week, upcoming, nextClass: upcoming[0] ?? null };
}

/** Next enrolled class for compact previews (More hub) — same canonical source. */
export function useNextTimetableClass() {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();

  const query = useQuery({
    queryKey: ["student-timetable-next", currentTenantId ?? null, user?.id ?? null],
    enabled: !!user?.id,
    queryFn: () => {
      const from = new Date();
      return fetchStudentTimetable(from, addDays(from, 60));
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  const next = useMemo(() => {
    const now = Date.now();
    return (
      (query.data ?? [])
        .filter((e) => new Date(e.starts_at).getTime() >= now)
        .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())[0] ??
      null
    );
  }, [query.data]);

  return { next, isLoading: query.isLoading, isError: query.isError };
}

/* -------------------------------------------------- next session per class */

export interface NextClassSession {
  class_id: string;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
  in_progress: boolean;
}

/**
 * Next (or currently running) session for every class the student is actively
 * enrolled in, expanded from the class's canonical recurrence by
 * `get_student_next_classes`. This is the single source the Study page uses for
 * "Next class", so it can never drift from the Timetable.
 */
export function useStudentNextClassSessions() {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();

  const query = useQuery({
    queryKey: ["student-next-class-sessions", currentTenantId ?? null, user?.id ?? null],
    enabled: !!user?.id,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_student_next_classes", {
        _horizon_days: 60,
      });
      if (error) throw error;
      return Array.isArray(data) ? (data as unknown as NextClassSession[]) : [];
    },
  });

  const byClass = useMemo(() => {
    const map = new Map<string, NextClassSession>();
    for (const s of query.data ?? []) map.set(s.class_id, s);
    return map;
  }, [query.data]);

  return { ...query, sessions: query.data ?? [], byClass };
}


/* ---------------------------------------------------------------- subjects */

export type SubjectTone = "blue" | "violet" | "amber" | "green" | "cyan" | "slate";

const NAMED_TONES: Array<[RegExp, SubjectTone]> = [
  [/physic/i, "blue"],
  [/math/i, "violet"],
  [/chem/i, "amber"],
  [/bio/i, "green"],
  [/english|bahasa|language/i, "cyan"],
];

const TONE_ORDER: SubjectTone[] = ["blue", "violet", "amber", "green", "cyan", "slate"];

/** Deterministic pale tint per subject — derived, never persisted. */
export function subjectTone(subject?: string | null, subjectId?: string | null): SubjectTone {
  const name = subject ?? "";
  for (const [re, tone] of NAMED_TONES) if (re.test(name)) return tone;
  const seed = `${subjectId ?? ""}${name}`;
  if (!seed) return "slate";
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 997;
  return TONE_ORDER[hash % TONE_ORDER.length];
}

export const SUBJECT_SURFACE: Record<SubjectTone, string> = {
  blue: "bg-subject-blue",
  violet: "bg-subject-violet",
  amber: "bg-subject-amber",
  green: "bg-subject-green",
  cyan: "bg-subject-cyan",
  slate: "bg-subject-slate",
};

export const SUBJECT_ACCENT_TEXT: Record<SubjectTone, string> = {
  blue: "text-subject-blue-accent",
  violet: "text-subject-violet-accent",
  amber: "text-subject-amber-accent",
  green: "text-subject-green-accent",
  cyan: "text-subject-cyan-accent",
  slate: "text-subject-slate-accent",
};

export const SUBJECT_ACCENT_BG: Record<SubjectTone, string> = {
  blue: "bg-subject-blue-accent",
  violet: "bg-subject-violet-accent",
  amber: "bg-subject-amber-accent",
  green: "bg-subject-green-accent",
  cyan: "bg-subject-cyan-accent",
  slate: "bg-subject-slate-accent",
};
