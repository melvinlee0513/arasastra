import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Building2, CheckCircle2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { showSupabaseError } from "@/lib/supabaseErrors";
import { toast } from "@/hooks/use-toast";
import {
  STATUS_LABEL,
  SupportStatusGroup,
  formatSupportDate,
  statusGroup,
  useSupportPeople,
  useSupportTicket,
  useSupportTicketEvents,
  useUpdateSupportTicket,
} from "@/lib/supportTickets";
import { SupportAttachment, SupportStatusBadge } from "./SupportRequestParts";
import { cn } from "@/lib/utils";

type Mode = "student" | "admin" | "superadmin";

const CARD = "rounded-[22px] border border-violet-100 bg-card p-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] md:p-5";

const EVENT_LABEL: Record<string, string> = {
  created: "Request submitted",
  status_changed: "Status changed",
  response_added: "Response added",
  completed: "Marked completed",
  reopened: "Reopened",
};

/** One role-aware request view: students read, admins/superadmins also respond and manage status. */
export function SupportRequestDetail({
  ticketId,
  mode,
  backTo,
  centreName,
}: {
  ticketId: string;
  mode: Mode;
  backTo: string;
  centreName?: string;
}) {
  const ticketQuery = useSupportTicket(ticketId);
  const eventsQuery = useSupportTicketEvents(ticketId);
  const ticket = ticketQuery.data;
  const people = useSupportPeople(mode !== "student" && ticket?.user_id ? [ticket.user_id] : []);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <Link to={backTo} className="inline-flex min-h-11 items-center gap-1.5 text-[14px] font-semibold text-primary">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to requests
      </Link>

      {ticketQuery.isLoading ? (
        <Skeleton className="h-64 rounded-[22px]" />
      ) : ticketQuery.isError ? (
        <div className={CARD}>
          <p className="text-[14px] text-muted-foreground">We couldn't load this request. Please try again.</p>
          <Button variant="outline" className="mt-3 rounded-full" onClick={() => ticketQuery.refetch()}>
            Retry
          </Button>
        </div>
      ) : !ticket ? (
        <div className={CARD}>
          <p className="text-[14px] text-muted-foreground">This request doesn't exist or you don't have access to it.</p>
        </div>
      ) : (
        <>
          <section className={CARD}>
            <div className="flex flex-wrap items-center gap-2">
              <SupportStatusBadge status={ticket.status} />
              <span className="text-[12.5px] text-muted-foreground">{ticket.category}</span>
            </div>
            <h1 className="mt-2 break-words text-[20px] font-bold leading-tight text-foreground">{ticket.subject}</h1>
            <dl className="mt-2 grid gap-1 text-[13px] text-muted-foreground">
              <div>Submitted {formatSupportDate(ticket.created_at)}</div>
              {mode !== "student" && (
                <div>
                  From {(ticket.user_id && people.data?.[ticket.user_id]) || ticket.requester_email || "Unknown"}
                  {ticket.role_snapshot ? ` (${ticket.role_snapshot})` : ""}
                </div>
              )}
              {mode === "superadmin" && (
                <div className="flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5" aria-hidden="true" /> {centreName ?? "No centre"}
                </div>
              )}
            </dl>
            <h2 className="mt-4 text-[13px] font-semibold text-foreground">
              {mode === "student" ? "Your request" : "Request"}
            </h2>
            <p className="mt-1 whitespace-pre-wrap break-words text-[14px] leading-relaxed text-foreground/90">
              {ticket.description}
            </p>
            {ticket.attachment_path && (
              <div className="mt-4">
                <h2 className="mb-1.5 text-[13px] font-semibold text-foreground">Attachment</h2>
                <SupportAttachment path={ticket.attachment_path} />
              </div>
            )}
          </section>

          <section className={cn(CARD, ticket.admin_response && "border-emerald-200 bg-emerald-50/40")}>
            <h2 className="text-[15px] font-bold text-foreground">Response from support</h2>
            {ticket.admin_response ? (
              <>
                <p className="mt-1.5 whitespace-pre-wrap break-words text-[14px] leading-relaxed text-foreground/90">
                  {ticket.admin_response}
                </p>
                <p className="mt-2 text-[12.5px] text-muted-foreground">
                  Responded {formatSupportDate(ticket.responded_at)}
                  {ticket.resolved_at && statusGroup(ticket.status) === "completed"
                    ? ` · Completed ${formatSupportDate(ticket.resolved_at)}`
                    : ""}
                </p>
              </>
            ) : (
              <p className="mt-1.5 text-[13.5px] text-muted-foreground">
                {mode === "student" ? "No response yet — we'll update this page when there is one." : "No response yet."}
              </p>
            )}
          </section>

          {mode !== "student" && <AdminActions ticketId={ticket.id} status={ticket.status} />}

          <section className={CARD}>
            <h2 className="text-[15px] font-bold text-foreground">Timeline</h2>
            {eventsQuery.isLoading ? (
              <Skeleton className="mt-2 h-16" />
            ) : eventsQuery.isError ? (
              <p className="mt-1.5 text-[13px] text-muted-foreground">Timeline unavailable.</p>
            ) : (eventsQuery.data ?? []).length === 0 ? (
              <p className="mt-1.5 text-[13px] text-muted-foreground">Submitted {formatSupportDate(ticket.created_at)}</p>
            ) : (
              <ol className="mt-2 space-y-2">
                {(eventsQuery.data ?? []).map((ev) => (
                  <li key={ev.id} className="flex gap-2 text-[13px]">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-violet-400" aria-hidden="true" />
                    <span>
                      <span className="font-semibold text-foreground">
                        {ev.to_status && ev.action !== "created"
                          ? `${EVENT_LABEL[ev.action] ?? ev.action}: ${STATUS_LABEL[statusGroup(ev.to_status)]}`
                          : EVENT_LABEL[ev.action] ?? ev.action}
                      </span>
                      <span className="text-muted-foreground"> · {formatSupportDate(ev.created_at)}</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function AdminActions({ ticketId, status }: { ticketId: string; status: string }) {
  const [response, setResponse] = useState("");
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateSupportTicket(ticketId);
  const group = statusGroup(status);

  const run = async (next: SupportStatusGroup | undefined, withResponse: boolean) => {
    setError(null);
    if (next === "completed" && !response.trim()) {
      setError("Add a response for the student before marking this request completed.");
      return;
    }
    if (withResponse && !next && !response.trim()) {
      setError("Write a response first.");
      return;
    }
    try {
      await update.mutateAsync({ status: next, response: withResponse ? response : undefined });
      if (withResponse) setResponse("");
      toast({ title: next ? `Marked ${STATUS_LABEL[next].toLowerCase()}` : "Response sent" });
    } catch (err) {
      const msg = err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : "";
      if (msg.includes("response_required")) setError("A response is required to complete this request.");
      else showSupabaseError(err, "Couldn't update request");
    }
  };

  return (
    <section className={CARD}>
      <h2 className="text-[15px] font-bold text-foreground">Manage request</h2>
      <div className="mt-2 flex flex-wrap gap-2">
        {group === "open" && (
          <Button variant="outline" className="min-h-11 rounded-full" disabled={update.isPending} onClick={() => run("in_progress", false)}>
            Mark in progress
          </Button>
        )}
        {group === "completed" && (
          <Button variant="outline" className="min-h-11 rounded-full" disabled={update.isPending} onClick={() => run("open", false)}>
            Reopen
          </Button>
        )}
      </div>
      <Label htmlFor="support-response" className="mt-4 block text-[13px] font-semibold">
        Response to student
      </Label>
      <Textarea
        id="support-response"
        rows={4}
        maxLength={4000}
        value={response}
        onChange={(e) => setResponse(e.target.value)}
        placeholder="e.g. The timetable issue has been fixed — please refresh and try again."
        className="mt-1.5 rounded-2xl"
      />
      {error && <p className="mt-1.5 text-[12.5px] font-medium text-destructive">{error}</p>}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Button variant="outline" className="min-h-11 rounded-full" disabled={update.isPending} onClick={() => run(undefined, true)}>
          <Send className="mr-1.5 h-4 w-4" aria-hidden="true" /> Send response
        </Button>
        {group !== "completed" && (
          <Button className="min-h-11 rounded-full" disabled={update.isPending} onClick={() => run("completed", true)}>
            <CheckCircle2 className="mr-1.5 h-4 w-4" aria-hidden="true" /> Mark as completed
          </Button>
        )}
      </div>
    </section>
  );
}
