import { useState } from "react";
import { Bell, Megaphone, Clock, Check, Circle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type NotificationType = "announcement" | "reminder";

interface Notification {
  id: number;
  type: NotificationType;
  title: string;
  message: string;
  time: string;
  read: boolean;
}

const notifications: Notification[] = [
  {
    id: 1,
    type: "announcement",
    title: "New Course Available",
    message: "Advanced Physics for Form 5 is now available. Enroll today to start learning!",
    time: "2 hours ago",
    read: false,
  },
  {
    id: 2,
    type: "reminder",
    title: "Upcoming Class: Mathematics",
    message: "Your Mathematics class with Dr. Sarah Chen starts in 30 minutes.",
    time: "30 min ago",
    read: false,
  },
  {
    id: 3,
    type: "announcement",
    title: "System Maintenance",
    message: "The platform will undergo maintenance on Saturday from 2 AM to 4 AM.",
    time: "1 day ago",
    read: true,
  },
  {
    id: 4,
    type: "reminder",
    title: "Assignment Due",
    message: "Your Chemistry assignment is due tomorrow. Don't forget to submit!",
    time: "1 day ago",
    read: true,
  },
  {
    id: 5,
    type: "announcement",
    title: "Holiday Schedule",
    message: "Classes will be suspended from Jan 28-30 for the holidays. Happy learning!",
    time: "2 days ago",
    read: true,
  },
  {
    id: 6,
    type: "reminder",
    title: "Live Session Recording",
    message: "The recording for yesterday's Biology class is now available in your Classes section.",
    time: "3 days ago",
    read: true,
  },
];

export function InboxPage() {
  const [readStatus, setReadStatus] = useState<Record<number, boolean>>(
    Object.fromEntries(notifications.map((n) => [n.id, n.read]))
  );

  const markAsRead = (id: number) => {
    setReadStatus((prev) => ({ ...prev, [id]: true }));
  };

  const filterByType = (type: NotificationType | "all") => {
    if (type === "all") return notifications;
    return notifications.filter((n) => n.type === type);
  };

  const unreadCount = Object.values(readStatus).filter((r) => !r).length;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Announcements</h1>
          <p className="text-muted-foreground">
            {unreadCount > 0 ? `${unreadCount} unread announcements` : "All caught up!"}
          </p>
        </div>
        {unreadCount > 0 && (
          <Badge variant="destructive" className="px-3 py-1">
            {unreadCount} New
          </Badge>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="all" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 bg-secondary">
          <TabsTrigger value="all" className="gap-2">
            All
          </TabsTrigger>
          <TabsTrigger value="announcements" className="gap-2">
            <Megaphone className="w-4 h-4" />
            Announcements
          </TabsTrigger>
          <TabsTrigger value="reminders" className="gap-2">
            <Bell className="w-4 h-4" />
            Reminders
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-3">
          <NotificationList
            notifications={filterByType("all")}
            readStatus={readStatus}
            onMarkAsRead={markAsRead}
          />
        </TabsContent>

        <TabsContent value="announcements" className="space-y-3">
          <NotificationList
            notifications={filterByType("announcement")}
            readStatus={readStatus}
            onMarkAsRead={markAsRead}
          />
        </TabsContent>

        <TabsContent value="reminders" className="space-y-3">
          <NotificationList
            notifications={filterByType("reminder")}
            readStatus={readStatus}
            onMarkAsRead={markAsRead}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface NotificationListProps {
  notifications: Notification[];
  readStatus: Record<number, boolean>;
  onMarkAsRead: (id: number) => void;
}

function NotificationList({ notifications, readStatus, onMarkAsRead }: NotificationListProps) {
  if (notifications.length === 0) {
    return (
      <Card className="p-8 text-center bg-card border border-border">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-secondary flex items-center justify-center">
          <Bell className="w-8 h-8 text-muted-foreground" />
        </div>
        <p className="text-muted-foreground">No notifications here</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {notifications.map((notification, index) => {
        const isRead = readStatus[notification.id];
        
        return (
          <Card
            key={notification.id}
            onClick={() => onMarkAsRead(notification.id)}
            className={cn(
              "p-4 bg-card border transition-all duration-200 cursor-pointer animate-fade-up",
              isRead 
                ? "border-border hover:border-border" 
                : "border-accent/30 bg-accent/5 hover:bg-accent/10"
            )}
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <div className="flex gap-4">
              {/* Icon */}
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
                notification.type === "announcement" 
                  ? "bg-primary/10" 
                  : "bg-accent/10"
              )}>
                {notification.type === "announcement" ? (
                  <Megaphone className="w-5 h-5 text-primary" />
                ) : (
                  <Bell className="w-5 h-5 text-accent" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <h3 className={cn(
                    "font-semibold text-foreground",
                    !isRead && "text-accent"
                  )}>
                    {notification.title}
                  </h3>
                  {isRead ? (
                    <Check className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  ) : (
                    <Circle className="w-3 h-3 fill-accent text-accent flex-shrink-0" />
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                  {notification.message}
                </p>
                <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  {notification.time}
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}