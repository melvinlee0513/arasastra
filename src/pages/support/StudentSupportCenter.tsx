import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { LifeBuoy, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { SupportContactForm } from "@/components/support/SupportContactForm";
import { SupportRequestCard } from "@/components/support/SupportRequestParts";
import { SupportRequestDetail } from "@/components/support/SupportRequestDetail";
import { STATUS_LABEL, SupportStatusGroup, statusGroup, supportKeys, useMySupportTickets } from "@/lib/supportTickets";
import { cn } from "@/lib/utils";

const FILTERS: Array<"all" | SupportStatusGroup> = ["all", "open", "in_progress", "completed"];

export function StudentSupportCenter() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const tickets = useMySupportTickets(user?.id);
  const [filter, setFilter] = useState<"all" | SupportStatusGroup>("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (tickets.data ?? []).filter(
      (t) =>
        (filter === "all" || statusGroup(t.status) === filter) &&
        (!q || t.subject.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)),
    );
  }, [tickets.data, filter, query]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-28 pt-4 md:px-6">
      <header className="mb-4 rounded-[26px] bg-[linear-gradient(135deg,hsl(262_83%_62%),hsl(250_85%_68%))] p-5 text-primary-foreground shadow-[0_12px_30px_rgba(124,58,237,0.25)]">
        <LifeBuoy className="h-8 w-8" aria-hidden="true" />
        <h1 className="mt-2 text-[22px] font-bold leading-tight">My Support Requests</h1>
        <p className="mt-1 text-[13.5px] opacity-90">Report a problem, share feedback, and track our replies.</p>
        <Button
          onClick={() => setOpen(true)}
          className="mt-4 min-h-12 w-full rounded-full bg-card text-[15px] font-semibold text-violet-700 hover:bg-card/90 sm:w-auto"
        >
          <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" /> Submit Request
        </Button>
      </header>

      <div className="mb-3 flex items-center gap-2 rounded-full border border-violet-100 bg-card px-4">
        <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <Input
          type="search"
          aria-label="Search my requests"
          placeholder="Search my requests"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-11 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
        />
      </div>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={filter === f}
            onClick={() => setFilter(f)}
            className={cn(
              "min-h-10 shrink-0 rounded-full border px-4 text-[13px] font-semibold",
              filter === f ? "border-violet-600 bg-violet-600 text-primary-foreground" : "border-violet-100 bg-card text-foreground",
            )}
          >
            {f === "all" ? "All" : STATUS_LABEL[f]}
          </button>
        ))}
      </div>

      {tickets.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-[22px]" />)}
        </div>
      ) : tickets.isError ? (
        <div className="rounded-[22px] border border-violet-100 bg-card p-5 text-center">
          <p className="text-[14px] text-muted-foreground">We couldn't load your requests.</p>
          <Button variant="outline" className="mt-3 rounded-full" onClick={() => tickets.refetch()}>Retry</Button>
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-[22px] border border-violet-100 bg-card p-6 text-center">
          <h2 className="text-[16px] font-bold text-foreground">
            {(tickets.data ?? []).length === 0 ? "No support requests yet" : "No requests match"}
          </h2>
          <p className="mt-1 text-[13.5px] text-muted-foreground">Need help? We're here to help.</p>
          <Button className="mt-4 min-h-11 rounded-full" onClick={() => setOpen(true)}>Submit Request</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((t) => <SupportRequestCard key={t.id} ticket={t} to={`/dashboard/support/${t.id}`} />)}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] max-w-[560px] overflow-y-auto rounded-[24px]">
          <DialogHeader>
            <DialogTitle>Submit a support request</DialogTitle>
            <DialogDescription>Tell us about a problem, feedback or an idea.</DialogDescription>
          </DialogHeader>
          <SupportContactForm onSubmitted={() => qc.invalidateQueries({ queryKey: supportKeys.mine(user?.id) })} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function StudentSupportRequestPage() {
  const { requestId } = useParams();
  return (
    <div className="px-4 pb-28 pt-4 md:px-6">
      <SupportRequestDetail ticketId={requestId ?? ""} mode="student" backTo="/dashboard/support" />
    </div>
  );
}
