import { useMemo, useState } from "react";
import {
  Bell,
  Megaphone,
  Clock,
  AlertCircle,
  UserPlus,
  ChevronRight,
  Inbox as InboxIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { formatDistanceToNow } from "date-fns";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  ServiceArtBubble,
  ServiceFooterDecor,
  ServiceHeader,
  ServicePage,
  ServiceReveal,
  DecorArt,
} from "@/components/dashboard/services/StudentServiceChrome";
import { DECOR_ART, INBOX_ART } from "@/lib/studentIllustrations";
import {
  useMarkInboxRead,
  useStudentInbox,
  type InboxItem,
  type InboxKind,
} from "@/lib/studentInbox";

type Filter = "all" | InboxKind;

const EMPTY_COPY: Record<Filter, { title: string; body: string; art: string }> = {
  all: {
    title: "Nothing here yet",
    body: "Announcements and reminders from your classes will appear here.",
    art: INBOX_ART.inbox,
  },
  announcement: {
    title: "No announcements yet",
    body: "Your tutors haven't posted anything new.",
    art: INBOX_ART.announcement,
  },
  reminder: {
    title: "No reminders yet",
    body: "You're all caught up.",
    art: INBOX_ART.empty,
  },
};

const TABS: Array<{ value: Filter; label: string; icon: typeof Bell; tint: string }> = [
  { value: "all", label: "All", icon: InboxIcon, tint: "text-violet-600" },
  { value: "announcement", label: "Announcements", icon: Megaphone, tint: "text-amber-600" },
  { value: "reminder", label: "Reminders", icon: Bell, tint: "text-blue-600" },
];

export function InboxPage() {
  const { user } = useAuth();
  const { data, isLoading, isError, refetch, isFetching } = useStudentInbox();
  const markRead = useMarkInboxRead();
  const [tab, setTab] = useState<Filter>("all");

  const items = data?.items ?? [];
  const unreadCount = data?.unread_count ?? 0;

  const filtered = useMemo(
    () => (tab === "all" ? items : items.filter((i) => i.kind === tab)),
    [items, tab],
  );

  if (!user) {
    return (
      <ServicePage>
        <Card className="rounded-[26px] border border-slate-200 bg-white p-8 text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-slate-100">
            <UserPlus className="h-10 w-10 text-slate-400" aria-hidden="true" />
          </div>
          <h1 className="mb-2 text-xl font-bold text-slate-900">Sign in to view your inbox</h1>
          <p className="mb-6 text-slate-500">
            Your notifications and announcements will appear here.
          </p>
          <Link to="/auth">
            <Button variant="gold" size="lg">Sign In</Button>
          </Link>
        </Card>
      </ServicePage>
    );
  }

  const subtitle =
    unreadCount > 0
      ? `${unreadCount} unread ${unreadCount === 1 ? "message" : "messages"}`
      : "All caught up!";

  return (
    <ServicePage>
      <ServiceReveal>
        <ServiceHeader
          art={INBOX_ART.inbox}
          title="Inbox"
          subtitle={subtitle}
          bubbleClassName="bg-violet-50"
          trailing={
            unreadCount > 0 ? (
              <span className="flex shrink-0 animate-scale-in items-center gap-1.5 rounded-full bg-rose-500 px-3 py-1.5 text-[12px] font-bold text-white shadow-[0_4px_14px_rgba(244,63,94,0.35)] motion-reduce:animate-none">
                <Bell className="h-3.5 w-3.5" aria-hidden="true" />
                {unreadCount} New
              </span>
            ) : undefined
          }
        />
      </ServiceReveal>

      {/* Segmented filter */}
      <div
        role="tablist"
        aria-label="Filter inbox"
        className="mb-4 flex gap-1 rounded-[20px] border border-slate-200/70 bg-white/70 p-1.5 shadow-[0_4px_18px_rgba(15,23,42,0.05)] backdrop-blur-sm"
      >
        {TABS.map((t) => {
          const active = tab === t.value;
          return (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.value)}
              className={cn(
                "flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-[15px] px-2 text-[12.5px] font-semibold",
                "transition-all duration-200 ease-out active:scale-[0.97] motion-reduce:transition-none",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                active
                  ? "bg-white text-slate-900 shadow-[0_4px_14px_rgba(15,23,42,0.10)]"
                  : "text-slate-500 hover:text-slate-700",
              )}
            >
              <t.icon
                className={cn("h-4 w-4 shrink-0", active ? t.tint : "text-slate-400")}
                aria-hidden="true"
              />
              <span className="truncate">{t.label}</span>
            </button>
          );
        })}
      </div>

      <div className="space-y-3.5">
        {isLoading ? (
          <div className="space-y-3.5" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[120px] animate-pulse rounded-[24px] bg-white/70" />
            ))}
          </div>
        ) : isError ? (
          <Card className="rounded-[24px] border border-slate-200 bg-white p-5 text-center">
            <AlertCircle className="mx-auto mb-2 h-6 w-6 text-destructive" aria-hidden="true" />
            <p className="text-sm font-semibold text-slate-900">Couldn't load your inbox.</p>
            <Button
              size="sm"
              variant="outline"
              className="mt-3 h-9 rounded-full"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              Retry
            </Button>
          </Card>
        ) : filtered.length === 0 ? (
          <EmptyInbox filter={tab} />
        ) : (
          filtered.map((item, index) => (
            <ServiceReveal key={`${item.source}-${item.id}`} delay={index * 45}>
              <InboxRow
                item={item}
                onOpen={() => {
                  if (!item.is_read) markRead.mutate(item);
                }}
              />
            </ServiceReveal>
          ))
        )}
      </div>

      <ServiceFooterDecor />
    </ServicePage>
  );
}

function EmptyInbox({ filter }: { filter: Filter }) {
  const copy = EMPTY_COPY[filter];
  return (
    <div className="relative flex flex-col items-center gap-2 overflow-hidden rounded-[26px] border border-slate-200/70 bg-white px-5 py-9 text-center shadow-[0_6px_22px_rgba(15,23,42,0.05)]">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <DecorArt src={DECOR_ART.cloudSoft} className="absolute left-4 top-5 h-9 w-9 opacity-40" />
        <DecorArt src={DECOR_ART.star} className="absolute right-6 top-6 h-5 w-5 opacity-45" />
        <DecorArt src={DECOR_ART.orb} className="absolute -bottom-6 -right-6 h-20 w-20 opacity-[0.12]" />
      </div>
      <ServiceArtBubble src={copy.art} size="xl" className="relative bg-slate-50" />
      <p className="relative mt-1 text-[15px] font-bold text-slate-900">{copy.title}</p>
      <p className="relative max-w-[260px] text-[13px] text-slate-500">{copy.body}</p>
    </div>
  );
}

interface RowTheme {
  card: string;
  bubble: string;
  label: string;
  arrow: string;
  art: string;
}

function rowTheme(kind: InboxKind, unread: boolean): RowTheme {
  if (kind === "announcement") {
    return {
      card: unread
        ? "border-amber-200/90 bg-[linear-gradient(160deg,#fffdf6_0%,#fff7e8_100%)] shadow-[0_8px_26px_rgba(245,158,11,0.14)]"
        : "border-slate-200/70 bg-white shadow-[0_5px_18px_rgba(15,23,42,0.05)]",
      bubble: unread ? "bg-amber-100/70" : "bg-slate-50",
      label: unread ? "text-amber-700" : "text-slate-400",
      arrow: "bg-amber-500/10 text-amber-600",
      art: INBOX_ART.announcement,
    };
  }
  return {
    card: unread
      ? "border-violet-200/90 bg-[linear-gradient(160deg,#fbfaff_0%,#f3efff_100%)] shadow-[0_8px_26px_rgba(139,92,246,0.14)]"
      : "border-slate-200/70 bg-white shadow-[0_5px_18px_rgba(15,23,42,0.05)]",
    bubble: unread ? "bg-violet-100/70" : "bg-slate-50",
    label: unread ? "text-violet-700" : "text-slate-400",
    arrow: "bg-violet-500/10 text-violet-600",
    art: INBOX_ART.reminder,
  };
}

function InboxRow({ item, onOpen }: { item: InboxItem; onOpen: () => void }) {
  const isAnnouncement = item.kind === "announcement";
  const unread = !item.is_read;
  const theme = rowTheme(item.kind, unread);
  const timeAgo = item.at ? formatDistanceToNow(new Date(item.at), { addSuffix: true }) : "";
  const context = [item.class_name ?? item.subject_name, item.author_name]
    .filter(Boolean)
    .join(" · ");

  const body = (
    <>
      <div className="flex gap-3.5">
        <ServiceArtBubble src={theme.art} size="lg" className={theme.bubble} />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p
              className={cn(
                "text-[10px] font-bold uppercase tracking-[0.09em]",
                theme.label,
              )}
            >
              {isAnnouncement ? "Announcement" : "Reminder"}
            </p>
            <span className="flex shrink-0 items-center gap-1.5">
              {unread ? (
                <>
                  <span className="sr-only">Unread</span>
                  <span
                    aria-hidden="true"
                    className="block h-2.5 w-2.5 animate-scale-in rounded-full bg-rose-500 ring-2 ring-white motion-reduce:animate-none"
                  />
                </>
              ) : (
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Read
                </span>
              )}
            </span>
          </div>
          <h3
            className={cn(
              "mt-0.5 break-words text-[15.5px] font-bold leading-snug tracking-[-0.01em]",
              unread ? "text-slate-900" : "text-slate-700",
            )}
          >
            {item.title}
          </h3>
          {item.body && (
            <p className="mt-1 line-clamp-2 break-words text-[13px] leading-snug text-slate-600">
              {item.body}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-slate-500">
          {context && <span className="truncate">{context}</span>}
          {context && timeAgo && <span aria-hidden="true">•</span>}
          {timeAgo && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {timeAgo}
            </span>
          )}
        </div>
        <span
          aria-hidden="true"
          className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", theme.arrow)}
        >
          <ChevronRight className="h-4 w-4" />
        </span>
      </div>
    </>
  );

  const className = cn(
    "block rounded-[26px] border p-4 text-left",
    "transition-[transform,box-shadow] duration-200 ease-out motion-reduce:transition-none",
    "hover:-translate-y-0.5 active:scale-[0.985]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
    theme.card,
    !unread && "opacity-[0.94]",
  );

  if (item.class_id) {
    return (
      <Link
        to={`/dashboard/classes/${item.class_id}/announcements`}
        onClick={onOpen}
        className={className}
      >
        {body}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onOpen} className={cn(className, "w-full")}>
      {body}
    </button>
  );
}
