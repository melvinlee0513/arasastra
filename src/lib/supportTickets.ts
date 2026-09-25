/**
 * Support Center data layer.
 *
 * Reads go through RLS on `support_tickets` / `support_ticket_events`:
 *   student  → own tickets only
 *   admin    → own centre only
 *   superadmin → all centres (optionally narrowed by a selected centre)
 * Status/response changes go through the `update_support_ticket` RPC, which
 * re-checks authorisation server-side.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SupportStatusGroup = "open" | "in_progress" | "completed";

export interface SupportTicket {
  id: string;
  center_id: string | null;
  user_id: string | null;
  role_snapshot: string | null;
  requester_email: string | null;
  category: string;
  subject: string;
  description: string;
  attachment_path: string | null;
  status: string;
  admin_response: string | null;
  responded_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupportTicketEvent {
  id: string;
  action: string;
  actor_role: string | null;
  from_status: string | null;
  to_status: string | null;
  message: string | null;
  created_at: string;
}

const TICKET_COLUMNS =
  "id, center_id, user_id, role_snapshot, requester_email, category, subject, description, attachment_path, status, admin_response, responded_at, resolved_at, created_at, updated_at";

export function statusGroup(status: string): SupportStatusGroup {
  if (status === "resolved" || status === "closed") return "completed";
  if (status === "in_progress" || status === "waiting_for_user") return "in_progress";
  return "open";
}

/** Canonical DB value written for each lifecycle step. */
export const STATUS_VALUE: Record<SupportStatusGroup, string> = {
  open: "open",
  in_progress: "in_progress",
  completed: "resolved",
};

export const STATUS_LABEL: Record<SupportStatusGroup, string> = {
  open: "Open",
  in_progress: "In progress",
  completed: "Completed",
};

export const supportKeys = {
  all: ["support-tickets"] as const,
  mine: (userId: string | undefined) => ["support-tickets", "mine", userId] as const,
  centre: (scope: string) => ["support-tickets", "centre", scope] as const,
  detail: (id: string | undefined) => ["support-tickets", "detail", id] as const,
  events: (id: string | undefined) => ["support-tickets", "events", id] as const,
  attachment: (path: string | null) => ["support-tickets", "attachment", path] as const,
  centres: ["support-tickets", "centres"] as const,
  people: (ids: string) => ["support-tickets", "people", ids] as const,
};

export function useMySupportTickets(userId: string | undefined) {
  return useQuery({
    queryKey: supportKeys.mine(userId),
    enabled: !!userId,
    queryFn: async (): Promise<SupportTicket[]> => {
      const { data, error } = await supabase
        .from("support_tickets")
        .select(TICKET_COLUMNS)
        .eq("user_id", userId as string)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as SupportTicket[];
    },
  });
}

/**
 * Admin list. RLS already restricts centre admins to their own centre;
 * `centerId` only narrows a superadmin's view ("all" = no narrowing).
 */
export function useCentreSupportTickets(centerId: string | "all") {
  return useQuery({
    queryKey: supportKeys.centre(centerId),
    queryFn: async (): Promise<SupportTicket[]> => {
      let query = supabase
        .from("support_tickets")
        .select(TICKET_COLUMNS)
        .order("created_at", { ascending: false })
        .limit(300);
      if (centerId !== "all") query = query.eq("center_id", centerId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as SupportTicket[];
    },
  });
}

export function useSupportTicket(id: string | undefined) {
  return useQuery({
    queryKey: supportKeys.detail(id),
    enabled: !!id,
    queryFn: async (): Promise<SupportTicket | null> => {
      const { data, error } = await supabase
        .from("support_tickets")
        .select(TICKET_COLUMNS)
        .eq("id", id as string)
        .maybeSingle();
      if (error) throw error;
      return (data as SupportTicket | null) ?? null;
    },
  });
}

export function useSupportTicketEvents(id: string | undefined) {
  return useQuery({
    queryKey: supportKeys.events(id),
    enabled: !!id,
    queryFn: async (): Promise<SupportTicketEvent[]> => {
      const { data, error } = await supabase
        .from("support_ticket_events")
        .select("id, action, actor_role, from_status, to_status, message, created_at")
        .eq("ticket_id", id as string)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SupportTicketEvent[];
    },
  });
}

/** Short-lived signed URL; storage policy re-checks ticket authorisation. */
export function useSupportAttachmentUrl(path: string | null) {
  return useQuery({
    queryKey: supportKeys.attachment(path),
    enabled: !!path,
    staleTime: 4 * 60 * 1000,
    queryFn: async (): Promise<string> => {
      const { data, error } = await supabase.storage
        .from("support-attachments")
        .createSignedUrl(path as string, 300);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}

export interface SupportCentreOption {
  id: string;
  name: string;
  subdomain_slug: string | null;
}

export function useSupportCentres(enabled: boolean) {
  return useQuery({
    queryKey: supportKeys.centres,
    enabled,
    queryFn: async (): Promise<SupportCentreOption[]> => {
      const { data, error } = await supabase
        .from("tuition_centers")
        .select("id, name, subdomain_slug")
        .order("name");
      if (error) throw error;
      return (data ?? []) as SupportCentreOption[];
    },
  });
}

export function useSupportPeople(userIds: string[]) {
  const ids = Array.from(new Set(userIds)).sort();
  return useQuery({
    queryKey: supportKeys.people(ids.join(",")),
    enabled: ids.length > 0,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase.rpc("get_public_profiles", { _user_ids: ids });
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const row of (data ?? []) as Array<{ user_id: string; display_name: string | null; full_name: string | null }>) {
        map[row.user_id] = row.display_name || row.full_name || "Student";
      }
      return map;
    },
  });
}

export function useUpdateSupportTicket(ticketId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { status?: SupportStatusGroup; response?: string }) => {
      const { data, error } = await supabase.rpc("update_support_ticket", {
        _ticket_id: ticketId,
        _status: input.status ? STATUS_VALUE[input.status] : undefined,
        _response: input.response?.trim() || undefined,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: supportKeys.detail(ticketId) });
      queryClient.invalidateQueries({ queryKey: supportKeys.events(ticketId) });
      queryClient.invalidateQueries({ queryKey: ["support-tickets", "centre"] });
    },
  });
}

export function formatSupportDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });
}
