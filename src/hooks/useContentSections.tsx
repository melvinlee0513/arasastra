import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ContentSection {
  id: string;
  section_key: string;
  title: string | null;
  subtitle: string | null;
  content: Record<string, unknown>;
  is_visible: boolean;
  display_order: number;
  updated_at: string | null;
}

export function useContentSections() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["content-sections"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_sections")
        .select("*")
        .order("display_order", { ascending: true });

      if (error) throw error;

      // Type-safe mapping
      return (data || []).map((section) => ({
        ...section,
        content:
          typeof section.content === "object" && section.content !== null
            ? (section.content as Record<string, unknown>)
            : {},
      })) as ContentSection[];
    },
    staleTime: 0, // Always refetch for latest content
    refetchOnWindowFocus: true,
  });

  const getSectionByKey = (key: string): ContentSection | undefined => {
    return query.data?.find((s) => s.section_key === key);
  };

  const getContentValue = (sectionKey: string, contentKey: string, fallback: string = ""): string => {
    const section = getSectionByKey(sectionKey);
    if (!section?.content) return fallback;
    const value = section.content[contentKey];
    return typeof value === "string" ? value : fallback;
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["content-sections"] });
  };

  return {
    sections: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    getSectionByKey,
    getContentValue,
    invalidate,
    refetch: query.refetch,
  };
}
