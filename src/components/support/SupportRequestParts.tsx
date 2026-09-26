import { Link } from "react-router-dom";
import { CheckCircle2, Circle, Clock, ImageIcon, Lightbulb, MessageSquare, Bug, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  STATUS_LABEL,
  SupportStatusGroup,
  SupportTicket,
  formatSupportDate,
  statusGroup,
  useSupportAttachmentUrl,
} from "@/lib/supportTickets";

const STATUS_STYLE: Record<SupportStatusGroup, string> = {
  open: "bg-amber-50 text-amber-800 border-amber-200",
  in_progress: "bg-violet-50 text-violet-800 border-violet-200",
  completed: "bg-emerald-50 text-emerald-800 border-emerald-200",
};
const STATUS_ICON = { open: Circle, in_progress: Clock, completed: CheckCircle2 };

export function SupportStatusBadge({ status, className }: { status: string; className?: string }) {
  const group = statusGroup(status);
  const Icon = STATUS_ICON[group];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-semibold",
        STATUS_STYLE[group],
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {STATUS_LABEL[group]}
    </span>
  );
}

export function categoryIcon(category: string) {
  if (category === "Feature Feedback") return MessageSquare;
  if (category === "Improvement Suggestion") return Lightbulb;
  return Bug;
}

export function SupportRequestCard({
  ticket,
  to,
  studentName,
  centreName,
}: {
  ticket: SupportTicket;
  to: string;
  studentName?: string;
  centreName?: string;
}) {
  const Icon = categoryIcon(ticket.category);
  return (
    <Link
      to={to}
      className="group flex items-start gap-3 rounded-[22px] border border-violet-100 bg-card p-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition active:scale-[0.99] hover:border-violet-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <SupportStatusBadge status={ticket.status} />
          {ticket.attachment_path && (
            <span className="inline-flex items-center gap-1 text-[12px] text-muted-foreground">
              <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" /> Attachment
            </span>
          )}
        </div>
        <h3 className="mt-1.5 truncate text-[15px] font-bold text-foreground">{ticket.subject}</h3>
        <p className="line-clamp-2 text-[13px] leading-snug text-muted-foreground">{ticket.description}</p>
        <p className="mt-1.5 text-[12px] text-muted-foreground">
          {ticket.category} · {formatSupportDate(ticket.created_at)}
          {studentName ? ` · ${studentName}` : ""}
          {centreName ? ` · ${centreName}` : ""}
        </p>
      </div>
      <ChevronRight className="mt-3 h-5 w-5 shrink-0 text-muted-foreground" aria-label="View request" />
    </Link>
  );
}

export function SupportAttachment({ path }: { path: string }) {
  const { data: url, isLoading, isError } = useSupportAttachmentUrl(path);
  const [open, setOpen] = useState(false);
  const isPdf = path.endsWith(".pdf");
  if (isLoading) return <Skeleton className="h-32 w-40 rounded-2xl" />;
  if (isError || !url)
    return <p className="text-[13px] text-muted-foreground">The attachment couldn't be loaded.</p>;
  if (isPdf)
    return (
      <a href={url} target="_blank" rel="noreferrer" className="text-[13px] font-semibold text-primary underline">
        Open attached PDF
      </a>
    );
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="overflow-hidden rounded-2xl border border-violet-100"
        aria-label="Enlarge attachment"
      >
        <img src={url} alt="Attached screenshot" className="h-36 w-auto max-w-full object-cover" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[min(96vw,900px)] rounded-[20px] p-2">
          <DialogTitle className="sr-only">Attachment</DialogTitle>
          <img src={url} alt="Attached screenshot, enlarged" className="max-h-[85vh] w-full rounded-xl object-contain" />
        </DialogContent>
      </Dialog>
    </>
  );
}
