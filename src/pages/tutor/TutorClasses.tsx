import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Calendar, Video } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { supabase } from "@/integrations/supabase/client";
import { showSupabaseError } from "@/lib/supabaseErrors";
import { format } from "date-fns";

type AssignedClass = {
  id: string;
  title: string;
  status: string;
  scheduled_at: string | null;
  duration_minutes: number | null;
  is_live: boolean | null;
  zoom_link: string | null;
  center_id: string | null;
  subject: { name: string | null; icon: string | null } | null;
};

/** One row of `get_tutor_next_classes` — next real occurrence per class. */
interface TutorNextClass {
  class_id: string;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
  in_progress: boolean;
}

export function TutorClasses() {
  const { user, hasRole } = useAuth();
  const { currentTenantId } = useTenant();
  const isTutor = hasRole("tutor");
  const enabled = !!user?.id && !!currentTenantId && isTutor;

  const classesQuery = useQuery({
    queryKey: ["tutor-assigned-classes", currentTenantId ?? null, user?.id ?? null],
    enabled,
    queryFn: async (): Promise<AssignedClass[]> => {
      // Canonical assignment source: class_tutors, scoped to auth user + tenant.
      const { data, error } = await supabase
        .from("class_tutors")
        .select(
          `class:classes!class_tutors_class_id_fkey(
            id, title, status, scheduled_at, duration_minutes, is_live, zoom_link, center_id,
            subject:subjects(name, icon)
          )`,
        )
        .eq("tutor_user_id", user!.id)
        .eq("center_id", currentTenantId!);

      if (error) throw error;

      return ((data ?? []) as Array<{ class: AssignedClass | null }>)
        .map((r) => r.class)
        .filter((c): c is AssignedClass => !!c && c.center_id === currentTenantId);
    },
  });

  // Canonical schedule source — the same recurrence expansion the student
  // Timetable and Study cards use, so "next session" never shows a stale
  // one-off date.
  const nextQuery = useQuery({
    queryKey: ["tutor-next-classes", currentTenantId ?? null, user?.id ?? null],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<TutorNextClass[]> => {
      const { data, error } = await supabase.rpc("get_tutor_next_classes", {
        _horizon_days: 60,
      });
      if (error) throw error;
      return Array.isArray(data) ? (data as unknown as TutorNextClass[]) : [];
    },
  });

  if (classesQuery.error) showSupabaseError(classesQuery.error, "Could not load your classes");

  if (classesQuery.isLoading) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <Skeleton className="h-10 w-48" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  const nextByClass = new Map<string, TutorNextClass>(
    (nextQuery.data ?? []).map((n) => [n.class_id, n]),
  );

  const classes = (classesQuery.data ?? []).slice().sort((a, b) => {
    const an = nextByClass.get(a.id)?.starts_at;
    const bn = nextByClass.get(b.id)?.starts_at;
    if (an && bn) return new Date(an).getTime() - new Date(bn).getTime();
    if (an) return -1;
    if (bn) return 1;
    return a.title.localeCompare(b.title);
  });

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
            const next = nextByClass.get(cls.id);
            // Status is derived from the canonical class record, never from a
            // single past `scheduled_at` value.
            const isArchived = cls.status !== "active";
            const isLive = !!cls.is_live || !!next?.in_progress;

            return (
              <Card
                key={cls.id}
                className="p-4 bg-card border-border hover:shadow-md transition-shadow"
              >
                <div className="flex flex-wrap items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-2xl">
                    {cls.subject?.icon || "📚"}
                  </div>
                  <div className="flex-1 min-w-[12rem]">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-foreground truncate">{cls.title}</h3>
                      {isLive && (
                        <Badge variant="destructive" className="gap-1 animate-pulse text-xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary-foreground" />
                          LIVE
                        </Badge>
                      )}
                      {isArchived ? (
                        <Badge variant="secondary" className="text-xs">
                          Archived
                        </Badge>
                      ) : (
                        !isLive && (
                          <Badge variant="outline" className="text-xs">
                            Active
                          </Badge>
                        )
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {cls.subject?.name ?? "Class"} •{" "}
                      {isArchived
                        ? "Archived class"
                        : next
                          ? `Next: ${format(new Date(next.starts_at), "EEE, MMM d • h:mm a")}`
                          : nextQuery.isLoading
                            ? "Loading schedule…"
                            : "No upcoming session scheduled"}{" "}
                      • {cls.duration_minutes ?? 60}min
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
