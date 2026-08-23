import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { guestSubjectPreview } from "@/lib/guestIllustrations";
import { getTenantSubdomain } from "@/lib/tenantSubdomain";


export interface PublicSubject {
  id: string;
  name: string;
  description: string | null;
}

/**
 * Public subject catalogue for the signed-out guest pages.
 *
 * Served through the tenant-scoped `get_public_subjects` RPC so anonymous
 * visitors can only ever see the catalogue of the tuition centre bound to the
 * current hostname — never every tenant on the platform.
 */
export function usePublicSubjects() {
  const { slug } = getTenantSubdomain();
  return useQuery({
    queryKey: ["guest-public-subjects", slug],
    queryFn: async (): Promise<PublicSubject[]> => {
      const { data, error } = await supabase.rpc("get_public_subjects", {
        _slug: slug,
      });
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

/** Public tutor directory for the current tenant only (marketing profiles). */
export function usePublicTutors() {
  const { slug } = getTenantSubdomain();
  return useQuery({
    queryKey: ["guest-public-tutors", slug],
    queryFn: async (): Promise<PublicTutor[]> => {
      const { data, error } = await supabase.rpc("get_public_tutors", {
        _slug: slug,
      });
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

/**
 * One entry per subject family for the guest catalogue, so generic and
 * Form-specific rows (e.g. "Biology" and "Biology Form 4") never both appear.
 * `preferred` names are surfaced first when the centre publishes them.
 */
export function uniqueSubjectFamilies(
  subjects: PublicSubject[] | undefined,
  limit: number,
  preferred: string[] = [],
): PublicSubject[] {
  const seen = new Set<string>();
  const unique = (subjects ?? []).filter((subject) => {
    const key = guestSubjectPreview(subject.name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const rank = (name: string) => {
    const n = name.toLowerCase();
    const i = preferred.findIndex((p) => n.includes(p.toLowerCase()));
    return i === -1 ? preferred.length : i;
  };
  return [...unique].sort((a, b) => rank(a.name) - rank(b.name)).slice(0, limit);
}
