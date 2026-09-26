import { useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { SupportRequestCard } from "@/components/support/SupportRequestParts";
import { SupportRequestDetail } from "@/components/support/SupportRequestDetail";
import {
  STATUS_LABEL,
  SupportStatusGroup,
  statusGroup,
  useCentreSupportTickets,
  useSupportCentres,
  useSupportPeople,
  useSupportTicket,
} from "@/lib/supportTickets";
import { SUPPORT_CATEGORIES } from "@/content/supportFaq";
import { cn } from "@/lib/utils";

const GROUPS: SupportStatusGroup[] = ["open", "in_progress", "completed"];

/** Tenant admin (own centre via RLS) and superadmin (tenant selector) support dashboard. */
export function AdminSupportCenter() {
  const { isSuperAdmin } = useAuth();
  const [params, setParams] = useSearchParams();
  const centre = isSuperAdmin ? params.get("centre") ?? "all" : "all";
  const centres = useSupportCentres(isSuperAdmin);
  const tickets = useCentreSupportTickets(centre);
  const [status, setStatus] = useState<"all" | SupportStatusGroup>("all");
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");

  const all = tickets.data ?? [];
  const people = useSupportPeople(all.map((t) => t.user_id).filter((id): id is string => !!id));
  const centreName = (id: string | null) => centres.data?.find((c) => c.id === id)?.name ?? (id ? undefined : "No centre");

  const counts = useMemo(() => {
    const c = { open: 0, in_progress: 0, completed: 0 };
    all.forEach((t) => c[statusGroup(t.status)]++);
    return c;
  }, [all]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter(
      (t) =>
        (status === "all" || statusGroup(t.status) === status) &&
        (category === "all" || t.category === category) &&
        (!q ||
          t.subject.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          (t.user_id && people.data?.[t.user_id]?.toLowerCase().includes(q))),
    );
  }, [all, status, category, query, people.data]);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-4 md:p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[24px] font-bold text-foreground">Support Center</h1>
          <p className="text-[13.5px] text-muted-foreground">
            {isSuperAdmin ? "Requests across all tuition centres." : "Requests from your centre's users."}
          </p>
        </div>
        {isSuperAdmin && (
          <Select
            value={centre}
            onValueChange={(v) => {
              const next = new URLSearchParams(params);
              if (v === "all") next.delete("centre");
              else next.set("centre", v);
              setParams(next, { replace: true });
            }}
          >
            <SelectTrigger className="h-11 w-full rounded-2xl border-violet-200 sm:w-72" aria-label="Select tenant">
              <SelectValue placeholder="All tenants" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tenants</SelectItem>
              {(centres.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                  {c.subdomain_slug ? ` · ${c.subdomain_slug}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </header>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {GROUPS.map((g) => (
          <button
            key={g}
            onClick={() => setStatus(status === g ? "all" : g)}
            aria-pressed={status === g}
            className={cn(
              "rounded-[20px] border bg-card p-3 text-left shadow-[0_8px_30px_rgb(0,0,0,0.04)] sm:p-4",
              status === g ? "border-violet-500" : "border-violet-100",
            )}
          >
            <div className="text-[24px] font-bold text-foreground">{tickets.isLoading ? "–" : counts[g]}</div>
            <div className="text-[12.5px] font-semibold text-muted-foreground">{STATUS_LABEL[g]}</div>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex flex-1 items-center gap-2 rounded-full border border-violet-100 bg-card px-4">
          <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            aria-label="Search requests"
            placeholder="Search title, message or student"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-11 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-11 rounded-full sm:w-56" aria-label="Filter by category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {SUPPORT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {tickets.isLoading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-[22px]" />)}</div>
      ) : tickets.isError ? (
        <div className="rounded-[22px] border border-violet-100 bg-card p-5 text-center">
          <p className="text-[14px] text-muted-foreground">We couldn't load support requests.</p>
          <Button variant="outline" className="mt-3 rounded-full" onClick={() => tickets.refetch()}>Retry</Button>
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-[22px] border border-violet-100 bg-card p-6 text-center">
          <h2 className="text-[16px] font-bold text-foreground">
            {all.length === 0 ? (isSuperAdmin && centre !== "all" ? "No requests for this tenant" : "No support requests yet") : "No requests match"}
          </h2>
          {all.length === 0 && <p className="mt-1 text-[13.5px] text-muted-foreground">You're all caught up.</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((t) => (
            <SupportRequestCard
              key={t.id}
              ticket={t}
              to={`/admin/support/${t.id}`}
              studentName={(t.user_id && people.data?.[t.user_id]) || t.requester_email || undefined}
              centreName={isSuperAdmin && centre === "all" ? centreName(t.center_id) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function AdminSupportRequestPage() {
  const { requestId } = useParams();
  const { isSuperAdmin } = useAuth();
  const centres = useSupportCentres(isSuperAdmin);
  const ticket = useSupportTicket(requestId);
  const centreName = centres.data?.find((c) => c.id === ticket.data?.center_id)?.name;
  return (
    <div className="p-4 md:p-6">
      <SupportRequestDetail
        ticketId={requestId ?? ""}
        mode={isSuperAdmin ? "superadmin" : "admin"}
        backTo="/admin/support"
        centreName={centreName}
      />
    </div>
  );
}
