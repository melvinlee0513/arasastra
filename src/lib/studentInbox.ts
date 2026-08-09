/**
 * Canonical student inbox data layer.
 *
 * One SECURITY DEFINER reader (`get_student_inbox`) merges the two existing
 * production sources — visible `class_announcements` for actively enrolled
 * classes and the student's own `notifications` rows — and returns per-item
 * read state plus a single `unread_count`. That count is the only unread source
 * of truth, shared by the Inbox page and the More-page Inbox badge.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";

export type InboxSource = "announcement" | "notification";
export type InboxKind = "announcement" | "reminder";

export interface InboxItem {
  source: InboxSource;
  id: string;
  kind: InboxKind;
  title: string;
  body: string | null;
  at: string;
  is_pinned: boolean;
  class_id: string | null;
  class_name: string | null;
  subject_name: string | null;
  author_name: string | null;
  is_read: boolean;
}

export interface StudentInbox {
  items: InboxItem[];
  unread_count: number;
}

const EMPTY: StudentInbox = { items: [], unread_count: 0 };

export async function fetchStudentInbox(limit = 50): Promise<StudentInbox> {
  const { data, error } = await supabase.rpc("get_student_inbox", { _limit: limit });
  if (error) throw error;
  const payload = (data ?? {}) as Record<string, unknown>;
  if (!payload || typeof payload !== "object") return EMPTY;
  return {
    items: Array.isArray(payload.items) ? (payload.items as unknown as InboxItem[]) : [],
    unread_count: Number(payload.unread_count ?? 0),
  };
}

export function studentInboxKey(tenantId: string | null, userId: string | null) {
  return ["student-inbox", tenantId, userId] as const;
}

export function useStudentInbox() {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();

  return useQuery({
    queryKey: studentInboxKey(currentTenantId ?? null, user?.id ?? null),
    enabled: !!user?.id,
    queryFn: () => fetchStudentInbox(50),
    staleTime: 30_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}

/** Unread count for the More-page Inbox badge — same query, same cache entry. */
export function useInboxUnreadCount() {
  const inbox = useStudentInbox();
  return {
    count: inbox.data?.unread_count ?? 0,
    isLoading: inbox.isLoading,
    isError: inbox.isError,
  };
}

/**
 * Mark one item read using its own canonical store:
 *  - announcements → `announcement_reads` receipt (insert, RLS-validated)
 *  - notifications → `notifications.is_read`
 */
export function useMarkInboxRead() {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const queryClient = useQueryClient();
  const key = studentInboxKey(currentTenantId ?? null, user?.id ?? null);

  return useMutation({
    mutationFn: async (item: InboxItem) => {
      if (!user?.id) return;
      if (item.source === "notification") {
        const { error } = await supabase
          .from("notifications")
          .update({ is_read: true })
          .eq("id", item.id)
          .eq("user_id", user.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from("announcement_reads")
        .upsert(
          { announcement_id: item.id, student_user_id: user.id },
          { onConflict: "announcement_id,student_user_id", ignoreDuplicates: true },
        );
      if (error) throw error;
    },
    onMutate: async (item) => {
      const previous = queryClient.getQueryData<StudentInbox>(key);
      if (previous) {
        queryClient.setQueryData<StudentInbox>(key, {
          items: previous.items.map((i) =>
            i.source === item.source && i.id === item.id ? { ...i, is_read: true } : i,
          ),
          unread_count: Math.max(0, previous.unread_count - (item.is_read ? 0 : 1)),
        });
      }
      return { previous };
    },
    onError: (_error, _item, context) => {
      const previous = (context as { previous?: StudentInbox } | undefined)?.previous;
      if (previous) queryClient.setQueryData(key, previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });
}
