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
