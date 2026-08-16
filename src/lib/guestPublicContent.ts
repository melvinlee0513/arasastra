import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PublicSubject {
  id: string;
  name: string;
  description: string | null;
}

/**
 * Public, anon-readable subject catalogue used by the signed-out guest pages.
 * No enrolment, progress or member data is ever requested here.
 */
export function usePublicSubjects() {
  return useQuery({
    queryKey: ["guest-public-subjects"],
    queryFn: async (): Promise<PublicSubject[]> => {
      const { data, error } = await supabase
        .from("subjects")
        .select("id, name, description")
        .eq("is_active", true)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PublicSubject[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export interface PublicTutor {
  id: string;
  name: string;
  specialization: string | null;
}

/** Public, anon-readable tutor directory (marketing profiles only). */
export function usePublicTutors() {
  return useQuery({
    queryKey: ["guest-public-tutors"],
    queryFn: async (): Promise<PublicTutor[]> => {
      const { data, error } = await supabase
        .from("tutors")
        .select("id, name, specialization")
        .eq("is_active", true)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PublicTutor[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Real public tutor name for a subject, or a neutral label when unmapped. */
export function tutorNameForSubject(
  tutors: PublicTutor[] | undefined,
  subjectName: string | null | undefined,
): string {
  const n = (subjectName ?? "").toLowerCase();
  const match = (tutors ?? []).find(
    (t) => t.specialization && n.includes(t.specialization.toLowerCase()),
  );
  return match?.name ?? "Expert Tutor";
}
