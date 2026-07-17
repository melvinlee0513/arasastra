import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";

export type AnnouncementStatus = "draft" | "scheduled" | "published" | "archived";

export type Announcement = {
  id: string;
  center_id: string;
  class_id: string;
  author_user_id: string;
  title: string;
  body: string;
  status: AnnouncementStatus;
  is_pinned: boolean;
  publish_at: string | null;
  published_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  edited_at: string | null;
};

/**
 * List all announcements for a class, ordered pinned first then newest.
 * RLS filters:
 *  - students only see visible published ones,
 *  - assigned tutors + same-centre admins see everything.
 */
export function useClassAnnouncements(classId: string | undefined, canView: boolean) {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();

  return useQuery({
    queryKey: ["class-announcements", currentTenantId, classId, user?.id],
    enabled: !!classId && !!user && canView,
    staleTime: 30_000,
    queryFn: async (): Promise<Announcement[]> => {
      const { data, error } = await supabase
        .from("class_announcements")
        .select(
          "id,center_id,class_id,author_user_id,title,body,status,is_pinned,publish_at,published_at,expires_at,created_at,updated_at,edited_at"
        )
        .eq("class_id", classId!)
        .order("is_pinned", { ascending: false })
        .order("published_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Announcement[];
    },
  });
}

/**
 * Fetch the single announcement most relevant to a student on Class Home:
 * latest pinned, otherwise latest published. Uses the visible-only RLS path,
 * so tutors previewing will still get the same student-visible row.
 */
export function useLatestClassAnnouncement(classId: string | undefined, canView: boolean) {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();

  return useQuery({
    queryKey: ["class-announcement-latest", currentTenantId, classId, user?.id],
    enabled: !!classId && !!user && canView,
    staleTime: 30_000,
    queryFn: async (): Promise<Announcement | null> => {
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from("class_announcements")
        .select(
          "id,center_id,class_id,author_user_id,title,body,status,is_pinned,publish_at,published_at,expires_at,created_at,updated_at,edited_at"
        )
        .eq("class_id", classId!)
        .eq("status", "published")
        .or(`publish_at.is.null,publish_at.lte.${nowIso}`)
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
        .order("is_pinned", { ascending: false })
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(1);
      if (error) throw error;
      return (data && data[0] ? (data[0] as Announcement) : null);
    },
  });
}
