import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * useTutorScope
 * Resolves the subjects, standards and class instances a user is allowed to
 * pick from when creating/uploading materials.
 *
 * - Admin: full access to every active subject/standard/class.
 * - Tutor: only subjects + standards from their `tutor_assignments` rows,
 *          and only classes where they are the assigned tutor.
 * - Anyone else: empty scope.
 */
export interface ScopeSubject { id: string; name: string }
export interface ScopeStandard { id: string; name: string; sort_order: number }
export interface ScopeClass {
  id: string;
  title: string;
  subject_id: string | null;
  standard_id: string | null;
  cohort_label: string | null;
  tutor_id: string | null;
}

export function useTutorScope() {
  const { user, role, isAdmin, isTutor } = useAuth();

  const enabled = !!user && (isAdmin || isTutor);

  return useQuery({
    queryKey: ["tutor-scope", user?.id, role],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      // Always load standards + subjects (cheap, used everywhere)
      const [subjectsRes, standardsRes] = await Promise.all([
        (supabase as any).from("subjects").select("id,name").eq("is_active", true).order("name"),
        (supabase as any).from("standards").select("id,name,sort_order").eq("is_active", true).order("sort_order"),
      ]);

      const allSubjects: ScopeSubject[] = subjectsRes.data || [];
      const allStandards: ScopeStandard[] = standardsRes.data || [];

      if (isAdmin) {
        const { data: classes } = await (supabase as any)
          .from("classes")
          .select("id,title,subject_id,standard_id,cohort_label,tutor_id")
          .order("scheduled_at", { ascending: false });
        return {
          isAdmin: true,
          subjects: allSubjects,
          standards: allStandards,
          classes: (classes || []) as ScopeClass[],
          assignments: [] as { subject_id: string; standard_id: string | null }[],
        };
      }

      // Tutor path — resolve tutor_id, then assignments
      const { data: tutorRow } = await (supabase as any)
        .from("tutors")
        .select("id")
        .eq("user_id", user!.id)
        .maybeSingle();

      if (!tutorRow) {
        return { isAdmin: false, subjects: [], standards: [], classes: [], assignments: [] };
      }

      const { data: assignments } = await (supabase as any)
        .from("tutor_assignments")
        .select("subject_id,standard_id")
        .eq("tutor_id", tutorRow.id);

      const subjectIds = new Set((assignments || []).map((a: any) => a.subject_id));
      const standardIds = new Set(
        (assignments || []).map((a: any) => a.standard_id).filter(Boolean),
      );

      const { data: classes } = await (supabase as any)
        .from("classes")
        .select("id,title,subject_id,standard_id,cohort_label,tutor_id")
        .eq("tutor_id", tutorRow.id)
        .order("scheduled_at", { ascending: false });

      return {
        isAdmin: false,
        subjects: allSubjects.filter((s) => subjectIds.has(s.id)),
        standards: standardIds.size
          ? allStandards.filter((s) => standardIds.has(s.id))
          : allStandards,
        classes: (classes || []) as ScopeClass[],
        assignments: (assignments || []) as { subject_id: string; standard_id: string | null }[],
      };
    },
  });
}
