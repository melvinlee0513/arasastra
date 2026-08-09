import { useMemo, useState } from "react";
import { Bell, Megaphone, Clock, Check, Circle, AlertCircle, UserPlus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { formatDistanceToNow } from "date-fns";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  useMarkInboxRead,
  useStudentInbox,
  type InboxItem,
  type InboxKind,
} from "@/lib/studentInbox";

type Filter = "all" | InboxKind;

const EMPTY_COPY: Record<Filter, string> = {
  all: "No notifications yet.",
  announcement: "No new announcements.",
  reminder: "No reminders right now.",
};

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
      <div
        className="mx-auto max-w-3xl space-y-6 p-4 md:p-6"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)" }}
      >
        <Card className="border border-border bg-card p-8 text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-secondary">
            <UserPlus className="h-10 w-10 text-muted-foreground" />
          </div>
          <h1 className="mb-2 text-xl font-bold text-foreground">Sign in to view your inbox</h1>
          <p className="mb-6 text-muted-foreground">
            Your notifications and announcements will appear here.
          </p>
          <Link to="/auth">
            <Button variant="gold" size="lg">Sign In</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div
      className="mx-auto max-w-3xl space-y-5 p-4 md:p-6"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)" }}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground md:text-3xl">Inbox</h1>
          <p className="text-muted-foreground">
            {unreadCount > 0 ? `${unreadCount} unread messages` : "All caught up!"}
          </p>
        </div>
        {unreadCount > 0 && (
          <Badge variant="destructive" className="px-3 py-1">
            {unreadCount} New
          </Badge>
        )}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Filter)} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 bg-secondary">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="announcement" className="gap-2">
            <Megaphone className="h-4 w-4" />
            Announcements
          </TabsTrigger>
          <TabsTrigger value="reminder" className="gap-2">
            <Bell className="h-4 w-4" />
            Reminders
          </TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="space-y-3">
          {isLoading ? (
            <div className="space-y-3" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-[86px] rounded-2xl bg-secondary/60" />
              ))}
            </div>
          ) : isError ? (
            <Card className="rounded-2xl border border-border bg-card p-4 text-center">
              <AlertCircle className="mx-auto mb-2 h-6 w-6 text-destructive" aria-hidden="true" />
              <p className="text-sm font-semibold text-foreground">Couldn't load your inbox.</p>
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
            <Card className="flex flex-col items-center gap-1 rounded-2xl border border-border bg-card px-4 py-6 text-center">
              <Bell className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">{EMPTY_COPY[tab]}</p>
            </Card>
          ) : (
            filtered.map((item, index) => (
              <InboxRow
                key={`${item.source}-${item.id}`}
                item={item}
                index={index}
                onOpen={() => {
                  if (!item.is_read) markRead.mutate(item);
                }}
              />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InboxRow({
  item,
  index,
  onOpen,
}: {
  item: InboxItem;
  index: number;
  onOpen: () => void;
}) {
  const isAnnouncement = item.kind === "announcement";
  const timeAgo = item.at ? formatDistanceToNow(new Date(item.at), { addSuffix: true }) : "";
  const context = [item.class_name ?? item.subject_name, item.author_name]
    .filter(Boolean)
    .join(" · ");

  const body = (
    <div className="flex gap-4">
      <div
        className={cn(
          "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl",
          isAnnouncement ? "bg-primary/10" : "bg-accent/10",
        )}
      >
        {isAnnouncement ? (
          <Megaphone className="h-5 w-5 text-primary" />
        ) : (
          <Bell className="h-5 w-5 text-accent" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              {isAnnouncement ? "Announcement" : "Reminder"}
            </p>
            <h3
              className={cn(
                "truncate font-semibold text-foreground",
                !item.is_read && "text-accent",
              )}
            >
              {item.title}
            </h3>
          </div>
          {item.is_read ? (
            <Check className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          ) : (
            <Circle className="h-3 w-3 flex-shrink-0 fill-accent text-accent" />
          )}
        </div>
        {item.body && (
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.body}</p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {context && <span className="truncate">{context}</span>}
          {timeAgo && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {timeAgo}
            </span>
          )}
        </div>
      </div>
    </div>
  );

  const className = cn(
    "block animate-fade-up cursor-pointer rounded-2xl border bg-card p-4 transition-all duration-200",
    item.is_read ? "border-border" : "border-accent/30 bg-accent/5",
  );
  const style = { animationDelay: `${index * 50}ms` };

  if (item.class_id) {
    return (
      <Link
        to={`/dashboard/classes/${item.class_id}/announcements`}
        onClick={onOpen}
        className={className}
        style={style}
      >
        {body}
      </Link>
    );
  }

  return (
    <Card onClick={onOpen} className={className} style={style}>
      {body}
    </Card>
  );
}
