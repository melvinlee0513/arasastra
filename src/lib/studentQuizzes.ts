/**
 * Cross-class student quiz data layer (Quiz Hub + Quiz Library).
 *
 * Security model is unchanged and fully server-enforced:
 *   - the enrolled class set comes from canonical `class_enrollments`
 *     (status = 'active') plus RLS-visible `classes`;
 *   - each class's quizzes come from the existing student RPC
 *     `list_student_class_quizzes`, which validates auth.uid(), center_id,
 *     active enrolment and published status.
 *
 * Nothing here widens access: it only aggregates what the student may already
 * read on a single class quiz page.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { listStudentClassQuizzes, type StudentQuizListRow } from "@/lib/quizzes";

export interface StudentQuizFeedRow extends StudentQuizListRow {
  class_id: string;
  class_title: string | null;
  subject_name: string | null;
  subject_key: string | null;
}

export type QuizAvailability =
  | { kind: "upcoming"; availableFrom: string }
  | { kind: "closed" }
  | { kind: "in_progress"; attemptId: string }
  | { kind: "submitted"; attemptId: string | null }
  | { kind: "exhausted" }
  | { kind: "available" };

export function quizAvailability(row: StudentQuizListRow, now = Date.now()): QuizAvailability {
  if (row.in_progress_attempt_id) {
    return { kind: "in_progress", attemptId: row.in_progress_attempt_id };
  }
  if (row.available_from && new Date(row.available_from).getTime() > now) {
    return { kind: "upcoming", availableFrom: row.available_from };
  }
  if (row.due_at && new Date(row.due_at).getTime() < now) {
    return row.latest_submitted_attempt_id
      ? { kind: "submitted", attemptId: row.latest_submitted_attempt_id }
      : { kind: "closed" };
  }
  if (row.attempts_used >= (row.attempt_limit ?? 1)) {
    return row.latest_submitted_attempt_id
      ? { kind: "submitted", attemptId: row.latest_submitted_attempt_id }
      : { kind: "exhausted" };
  }
  return { kind: "available" };
}

interface EnrolledClass {
  id: string;
  title: string | null;
  subject_name: string | null;
  subject_key: string | null;
}

async function fetchEnrolledClasses(userId: string): Promise<EnrolledClass[]> {
  const { data: enrolments, error: enrErr } = await supabase
    .from("class_enrollments")
    .select("class_id")
    .eq("student_user_id", userId)
    .eq("status", "active");
  if (enrErr) throw enrErr;

  const classIds = Array.from(
    new Set((enrolments ?? []).map((r) => r.class_id as string).filter(Boolean)),
  );
  if (classIds.length === 0) return [];

  const { data: classRows, error: classErr } = await supabase
    .from("classes")
    .select("id,title,subject_id")
    .in("id", classIds);
  if (classErr) throw classErr;

  const subjectIds = Array.from(
    new Set((classRows ?? []).map((c) => c.subject_id as string | null).filter(Boolean) as string[]),
  );
  const subjects = new Map<string, { name: string | null; key: string | null }>();
  if (subjectIds.length) {
    const { data: subs, error: subErr } = await supabase
      .from("subjects")
      .select("id,name,subject_key")
      .in("id", subjectIds);
    if (subErr) throw subErr;
    for (const s of subs ?? []) {
      subjects.set(s.id as string, {
        name: (s.name as string | null) ?? null,
        key: (s.subject_key as string | null) ?? null,
      });
    }
  }

  return (classRows ?? []).map((c) => {
    const subject = c.subject_id ? subjects.get(c.subject_id as string) : undefined;
    return {
      id: c.id as string,
      title: (c.title as string | null) ?? null,
      subject_name: subject?.name ?? null,
      subject_key: subject?.key ?? null,
    };
  });
}

export const studentQuizKeys = {
  feed: (tenantId: string | null | undefined, userId: string | null | undefined) =>
    ["student-quiz-feed", tenantId ?? "no-tenant", userId ?? "anon"] as const,
};

export interface StudentQuizFeed {
  rows: StudentQuizFeedRow[];
  classCount: number;
}

/** Every published quiz the student may attempt, across all enrolled classes. */
export function useStudentQuizFeed() {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();

  return useQuery<StudentQuizFeed>({
    queryKey: studentQuizKeys.feed(currentTenantId, user?.id),
    enabled: !!user,
    staleTime: 30_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const classes = await fetchEnrolledClasses(user!.id);
      if (classes.length === 0) return { rows: [], classCount: 0 };

      const settled = await Promise.allSettled(
        classes.map(async (klass) => {
          const quizzes = await listStudentClassQuizzes(klass.id);
          return quizzes.map<StudentQuizFeedRow>((q) => ({
            ...q,
            class_id: klass.id,
            class_title: klass.title,
            subject_name: klass.subject_name,
            subject_key: klass.subject_key,
          }));
        }),
      );

      const rows = settled
        .filter((r): r is PromiseFulfilledResult<StudentQuizFeedRow[]> => r.status === "fulfilled")
        .flatMap((r) => r.value);

      return { rows, classCount: classes.length };
    },
  });
}

export interface QuizFeedGroups {
  /** Playable right now, never attempted. */
  fresh: StudentQuizFeedRow[];
  /** An attempt is still open — resume first. */
  inProgress: StudentQuizFeedRow[];
  /** Attempted at least once. */
  played: StudentQuizFeedRow[];
  /** Scheduled to open later. */
  upcoming: StudentQuizFeedRow[];
  /** Closed / attempts exhausted. */
  locked: StudentQuizFeedRow[];
  /** Sorted by soonest due date, for the "due soon" strip. */
  dueSoon: StudentQuizFeedRow[];
}

export function groupQuizFeed(rows: StudentQuizFeedRow[]): QuizFeedGroups {
  const groups: QuizFeedGroups = {
    fresh: [],
    inProgress: [],
    played: [],
    upcoming: [],
    locked: [],
    dueSoon: [],
  };

  for (const row of rows) {
    const state = quizAvailability(row);
    switch (state.kind) {
      case "in_progress":
        groups.inProgress.push(row);
        break;
      case "upcoming":
        groups.upcoming.push(row);
        break;
      case "closed":
      case "exhausted":
        groups.locked.push(row);
        break;
      case "submitted":
        groups.played.push(row);
        break;
      default:
        if (row.attempts_used > 0) groups.played.push(row);
        else groups.fresh.push(row);
    }
  }

  groups.dueSoon = rows
    .filter((r) => {
      if (!r.due_at) return false;
      const kind = quizAvailability(r).kind;
      return kind === "available" || kind === "in_progress";
    })
    .sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime());

  return groups;
}

export function useQuizFeedGroups(rows: StudentQuizFeedRow[] | undefined) {
  return useMemo(() => groupQuizFeed(rows ?? []), [rows]);
}

/** Canonical student routes for a feed row. */
export function quizRoutes(row: Pick<StudentQuizFeedRow, "class_id" | "id">) {
  const base = `/dashboard/classes/${row.class_id}/quizzes`;
  return {
    classQuizzes: base,
    attempt: (attemptId: string) => `${base}/${row.id}/attempt/${attemptId}`,
    result: (attemptId: string) => `${base}/${row.id}/results/${attemptId}`,
  };
}
