/**
 * Student class bookmarks.
 *
 * Persistence lives in `public.class_bookmarks`, which is RLS-scoped to
 * `auth.uid()` and to the student's own `center_id`, so bookmarks are private
 * and tenant-isolated. Bookmarks are a presentation preference only — they
 * never widen which classes a student can read.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const classBookmarkKeys = {
  list: (userId: string | undefined) => ["student-class-bookmarks", userId ?? null] as const,
};

/** Set of class ids the signed-in student has bookmarked. */
export function useClassBookmarks() {
  const { user } = useAuth();
  return useQuery({
    queryKey: classBookmarkKeys.list(user?.id),
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from("class_bookmarks")
        .select("class_id")
        .eq("student_user_id", user!.id);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.class_id as string));
    },
  });
}

export interface ToggleBookmarkInput {
  classId: string;
  /** Current state — the mutation flips it. */
  bookmarked: boolean;
  /** Student's own center_id, required by the insert policy. */
  centerId: string | null;
}

/** Optimistic bookmark toggle. */
export function useToggleClassBookmark() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const queryKey = classBookmarkKeys.list(user?.id);

  return useMutation({
    mutationFn: async ({ classId, bookmarked, centerId }: ToggleBookmarkInput) => {
      if (!user?.id) throw new Error("Sign in required.");
      if (bookmarked) {
        const { error } = await supabase
          .from("class_bookmarks")
          .delete()
          .eq("student_user_id", user.id)
          .eq("class_id", classId);
        if (error) throw error;
        return false;
      }
      if (!centerId) throw new Error("Your profile is still loading. Please try again.");
      const { error } = await supabase.from("class_bookmarks").insert({
        class_id: classId,
        student_user_id: user.id,
        center_id: centerId,
      });
      if (error) throw error;
      return true;
    },
    onMutate: async ({ classId, bookmarked }) => {
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<Set<string>>(queryKey);
      const next = new Set(previous ?? []);
      if (bookmarked) next.delete(classId);
      else next.add(classId);
      qc.setQueryData(queryKey, next);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(queryKey, context.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey });
    },
  });
}
