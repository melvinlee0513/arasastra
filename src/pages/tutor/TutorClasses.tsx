import { useState, useEffect } from "react";
import { Calendar, Video, Users, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { format, isAfter, isBefore, addMinutes } from "date-fns";

export function TutorClasses() {
  const { user } = useAuth();
  const [classes, setClasses] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user?.id) fetchClasses();
  }, [user?.id]);

  const fetchClasses = async () => {
    setIsLoading(true);
    try {
      const { data: tutor } = await supabase
        .from("tutors")
        .select("id")
        .eq("user_id", user!.id)
        .single();

      if (!tutor) { setIsLoading(false); return; }

      const { data } = await supabase
        .from("classes")
        .select("*, subject:subjects(name, icon)")
        .eq("tutor_id", tutor.id)
        .eq("is_published", true)
        .order("scheduled_at", { ascending: false });

      setClasses(data || []);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <Skeleton className="h-10 w-48" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
      </div>
    );
  }

  const now = new Date();

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground">My Classes</h1>
        <p className="text-muted-foreground">View and manage your assigned classes</p>
      </div>

      {classes.length === 0 ? (
        <Card className="p-8 text-center bg-card border-border">
          <Calendar className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="font-semibold text-foreground">No classes assigned</h3>
          <p className="text-sm text-muted-foreground">Contact admin to get classes assigned</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {classes.map((cls) => {
            const start = new Date(cls.scheduled_at);
            const end = addMinutes(start, cls.duration_minutes || 60);
            const isLive = cls.is_live || (isAfter(now, start) && isBefore(now, end));
            const isPast = isAfter(now, end);

            return (
              <Card key={cls.id} className="p-4 bg-card border-border hover:shadow-md transition-shadow">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-2xl">
                    {cls.subject?.icon || "📚"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-foreground truncate">{cls.title}</h3>
                      {isLive && (
                        <Badge variant="destructive" className="gap-1 animate-pulse text-xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary-foreground" />
                          LIVE
                        </Badge>
                      )}
                      {isPast && <Badge variant="secondary" className="text-xs">Completed</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {cls.subject?.name} • {format(start, "MMM d, h:mm a")} • {cls.duration_minutes}min
                    </p>
                  </div>
                  {cls.zoom_link && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={cls.zoom_link} target="_blank" rel="noopener noreferrer">
                        <Video className="w-4 h-4 mr-1" /> Zoom
                      </a>
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
