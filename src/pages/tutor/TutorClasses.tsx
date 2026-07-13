import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Calendar, Video } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { supabase } from "@/integrations/supabase/client";
import { showSupabaseError } from "@/lib/supabaseErrors";
import { format, isAfter, isBefore, addMinutes } from "date-fns";

type AssignedClass = {
  id: string;
  title: string;
  scheduled_at: string;
  duration_minutes: number | null;
  is_live: boolean | null;
  zoom_link: string | null;
  center_id: string | null;
  subject: { name: string | null; icon: string | null } | null;
};

export function TutorClasses() {
  const { user, hasRole } = useAuth();
  const { currentTenantId } = useTenant();
  const [classes, setClasses] = useState<AssignedClass[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const isTutor = hasRole("tutor");

  useEffect(() => {
    if (!user?.id || !currentTenantId || !isTutor) {
      setIsLoading(false);
      return;
    }
    void fetchClasses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, currentTenantId, isTutor]);

  const fetchClasses = async () => {
    setIsLoading(true);
    try {
      // Canonical assignment source: class_tutors, scoped to auth user + tenant.
      const { data, error } = await supabase
        .from("class_tutors")
        .select(
          `class:classes!class_tutors_class_id_fkey(
            id, title, scheduled_at, duration_minutes, is_live, zoom_link, center_id,
            subject:subjects(name, icon)
          )`,
        )
        .eq("tutor_user_id", user!.id)
        .eq("center_id", currentTenantId!);

      if (error) throw error;

      const rows = ((data ?? []) as Array<{ class: AssignedClass | null }>)
        .map((r) => r.class)
        .filter((c): c is AssignedClass => !!c && c.center_id === currentTenantId)
        .sort(
          (a, b) =>
            new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime(),
        );

      setClasses(rows);
    } catch (error) {
      showSupabaseError(error, "Could not load your classes");
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <Skeleton className="h-10 w-48" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  const now = new Date();

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground">My Classes</h1>
        <p className="text-muted-foreground">Classes assigned to you by your centre.</p>
      </div>

      {classes.length === 0 ? (
        <Card className="p-8 text-center bg-card border-border">
          <Calendar className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="font-semibold text-foreground">No classes assigned yet.</h3>
          <p className="text-sm text-muted-foreground">Contact your centre administrator.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {classes.map((cls) => {
            const start = new Date(cls.scheduled_at);
            const end = addMinutes(start, cls.duration_minutes || 60);
            const isLive = cls.is_live || (isAfter(now, start) && isBefore(now, end));
            const isPast = isAfter(now, end);

            return (
              <Card
                key={cls.id}
                className="p-4 bg-card border-border hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-2xl">
                    {cls.subject?.icon || "📚"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-foreground truncate">{cls.title}</h3>
                      {isLive && (
                        <Badge
                          variant="destructive"
                          className="gap-1 animate-pulse text-xs"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-primary-foreground" />
                          LIVE
                        </Badge>
                      )}
                      {isPast && (
                        <Badge variant="secondary" className="text-xs">
                          Completed
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {cls.subject?.name ?? "Class"} • {format(start, "MMM d, h:mm a")} •{" "}
                      {cls.duration_minutes ?? 60}min
                    </p>
                  </div>
                  {cls.zoom_link && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={cls.zoom_link} target="_blank" rel="noopener noreferrer">
                        <Video className="w-4 h-4 mr-1" /> Zoom
                      </a>
                    </Button>
                  )}
                  <Button size="sm" asChild className="rounded-full">
                    <Link to={`/tutor/classes/${cls.id}/resources`}>Manage materials</Link>
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
