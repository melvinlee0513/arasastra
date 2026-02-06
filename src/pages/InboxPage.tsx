import { useState, useEffect } from "react";
import { Bell, Megaphone, Clock, Check, Circle, Loader2, UserPlus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatDistanceToNow } from "date-fns";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface Notification {
  id: string;
  title: string;
  message: string | null;
  type: string | null;
  is_read: boolean | null;
  created_at: string | null;
}

export function InboxPage() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user?.id) {
      fetchNotifications();
    } else {
      setIsLoading(false);
    }
  }, [user?.id]);

  const fetchNotifications = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setNotifications(data || []);
    } catch (error) {
      console.error("Error fetching notifications:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const markAsRead = async (id: string) => {
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );

    try {
      await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", id);
    } catch (error) {
      console.error("Error marking notification as read:", error);
    }
  };

  const getNotificationType = (type: string | null): "announcement" | "reminder" => {
    if (type === "reminder" || type === "class") return "reminder";
    return "announcement";
  };

  const filterByType = (type: "announcement" | "reminder" | "all") => {
    if (type === "all") return notifications;
    return notifications.filter((n) => getNotificationType(n.type) === type);
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // Guest view
  if (!user) {
    return (
      <div className="p-4 md:p-6 space-y-6 max-w-3xl mx-auto">
        <Card className="p-8 text-center bg-card border border-border">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-secondary flex items-center justify-center">
            <UserPlus className="w-10 h-10 text-muted-foreground" />
          </div>
          <h1 className="text-xl font-bold text-foreground mb-2">Sign in to view your inbox</h1>
          <p className="text-muted-foreground mb-6">
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
    <div className="p-4 md:p-6 space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Inbox</h1>
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

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Tabs defaultValue="all" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3 bg-secondary">
            <TabsTrigger value="all">All</TabsTrigger>
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
              onMarkAsRead={markAsRead}
            />
          </TabsContent>

          <TabsContent value="announcements" className="space-y-3">
            <NotificationList
              notifications={filterByType("announcement")}
              onMarkAsRead={markAsRead}
            />
          </TabsContent>

          <TabsContent value="reminders" className="space-y-3">
            <NotificationList
              notifications={filterByType("reminder")}
              onMarkAsRead={markAsRead}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

interface NotificationListProps {
  notifications: Notification[];
  onMarkAsRead: (id: string) => void;
}

function NotificationList({ notifications, onMarkAsRead }: NotificationListProps) {
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

  const getNotificationType = (type: string | null): "announcement" | "reminder" => {
    if (type === "reminder" || type === "class") return "reminder";
    return "announcement";
  };

  return (
    <div className="space-y-3">
      {notifications.map((notification, index) => {
        const isRead = notification.is_read;
        const notifType = getNotificationType(notification.type);
        const timeAgo = notification.created_at
          ? formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })
          : "";

        return (
          <Card
            key={notification.id}
            onClick={() => !isRead && onMarkAsRead(notification.id)}
            className={cn(
              "p-4 bg-card border transition-all duration-200 cursor-pointer animate-fade-up",
              isRead
                ? "border-border hover:border-border"
                : "border-accent/30 bg-accent/5 hover:bg-accent/10"
            )}
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <div className="flex gap-4">
              <div
                className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
                  notifType === "announcement" ? "bg-primary/10" : "bg-accent/10"
                )}
              >
                {notifType === "announcement" ? (
                  <Megaphone className="w-5 h-5 text-primary" />
                ) : (
                  <Bell className="w-5 h-5 text-accent" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <h3
                    className={cn(
                      "font-semibold text-foreground",
                      !isRead && "text-accent"
                    )}
                  >
                    {notification.title}
                  </h3>
                  {isRead ? (
                    <Check className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  ) : (
                    <Circle className="w-3 h-3 fill-accent text-accent flex-shrink-0" />
                  )}
                </div>
                {notification.message && (
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                    {notification.message}
                  </p>
                )}
                {timeAgo && (
                  <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    {timeAgo}
                  </div>
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
