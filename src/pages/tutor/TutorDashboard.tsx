import { useEffect, useState } from "react";
import { Users, Calendar, BookOpen, Video, MessageSquare } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface UpcomingClass {
  id: string;
  title: string;
  scheduled_at: string;
  subject_name: string;
}

interface TutorStats {
  totalStudents: number;
  activeReplays: number;
  pendingQuestions: number;
  assignedClassCount: number;
  upcomingClasses: UpcomingClass[];
}

export function TutorDashboard() {
  const { user, profile, hasRole } = useAuth();
  const [stats, setStats] = useState<TutorStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasTutorAccess, setHasTutorAccess] = useState(true);

  useEffect(() => {
    if (user?.id) fetchTutorData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, profile?.center_id]);

  const fetchTutorData = async () => {
    setIsLoading(true);
    try {
      const centerId = profile?.center_id;
      // Tutor identity comes from user_roles + same-tenant profile — not public.tutors.
      if (!centerId || !hasRole("tutor")) {
        setHasTutorAccess(false);
        setIsLoading(false);
        return;
      }
      setHasTutorAccess(true);

      // Canonical assignment source: class_tutors scoped to current tenant.
      const { data: assignments } = await supabase
        .from("class_tutors")
        .select("class_id")
        .eq("tutor_user_id", user!.id)
        .eq("center_id", centerId);

      const classIds = (assignments || []).map((a) => a.class_id);

      if (classIds.length === 0) {
        setStats({
          totalStudents: 0,
          activeReplays: 0,
          pendingQuestions: 0,
          assignedClassCount: 0,
          upcomingClasses: [],
        });
        setIsLoading(false);
        return;
      }

      const { data: classes } = await supabase
        .from("classes")
        .select("id, title, scheduled_at, video_url, subject:subjects(name)")
        .eq("center_id", centerId)
        .in("id", classIds)
        .order("scheduled_at", { ascending: true });

      const now = new Date();
      const upcoming: UpcomingClass[] = (classes || [])
        .filter((c) => c.scheduled_at && new Date(c.scheduled_at) > now)
        .slice(0, 5)
        .map((c) => ({
          id: c.id,
          title: c.title,
          scheduled_at: c.scheduled_at as string,
          subject_name: (c.subject as { name?: string } | null)?.name || "General",
        }));

      const activeReplays = (classes || []).filter((c) => c.video_url).length;

      const [commentsRes, enrollmentsRes] = await Promise.all([
        supabase.from("video_comments").select("id", { count: "exact", head: true }).in("class_id", classIds),
        supabase
          .from("class_enrollments")
          .select("student_user_id")
          .eq("status", "active")
          .in("class_id", classIds),
      ]);

      const uniqueStudents = new Set((enrollmentsRes.data || []).map((e) => e.student_user_id));

      setStats({
        totalStudents: uniqueStudents.size,
        activeReplays,
        pendingQuestions: commentsRes.count ?? 0,
        assignedClassCount: classIds.length,
        upcomingClasses: upcoming,
      });
    } catch (error) {
      console.error("Error fetching tutor data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!hasTutorAccess) {
    return (
      <div className="p-6">
        <Card className="p-8 text-center rounded-3xl">
          <BookOpen className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="font-semibold text-foreground mb-2">Tutor access not available</h3>
          <p className="text-muted-foreground text-sm">
            Your account does not have an active tutor role for this centre. Please contact your centre administrator.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">
          Welcome, {profile?.full_name?.split(" ")[0] || "Tutor"}! 👋
        </h1>
        <p className="text-muted-foreground">Here's your teaching overview</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-5 bg-card border-border rounded-3xl">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Users className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats?.totalStudents || 0}</p>
              <p className="text-sm text-muted-foreground">Total Students</p>
            </div>
          </div>
        </Card>

        <Card className="p-5 bg-card border-border rounded-3xl">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
              <Video className="w-6 h-6 text-accent" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats?.activeReplays || 0}</p>
              <p className="text-sm text-muted-foreground">Active Replays</p>
            </div>
          </div>
        </Card>

        <Card className="p-5 bg-card border-border rounded-3xl">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
              <MessageSquare className="w-6 h-6 text-accent" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats?.pendingQuestions || 0}</p>
              <p className="text-sm text-muted-foreground">Pending Questions</p>
            </div>
          </div>
        </Card>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Upcoming Classes</h2>
        {stats && stats.assignedClassCount === 0 ? (
          <Card className="p-6 bg-card border-border rounded-3xl text-center">
            <p className="text-muted-foreground">
              No classes assigned yet. Contact your centre administrator.
            </p>
          </Card>
        ) : stats?.upcomingClasses.length === 0 ? (
          <Card className="p-6 bg-card border-border rounded-3xl text-center">
            <p className="text-muted-foreground">No upcoming classes scheduled</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {stats?.upcomingClasses.map((c) => (
              <Card key={c.id} className="p-4 bg-card border-border rounded-2xl hover:shadow-md transition-shadow">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-foreground truncate">{c.title}</h3>
                    <p className="text-sm text-muted-foreground">{c.subject_name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-primary">
                      {format(new Date(c.scheduled_at), "MMM d")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(c.scheduled_at), "h:mm a")}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
