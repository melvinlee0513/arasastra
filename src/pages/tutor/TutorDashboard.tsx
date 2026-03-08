import { useState, useEffect } from "react";
import { Users, Calendar, CheckCircle, BookOpen, BarChart3, Video, MessageSquare } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface TutorStats {
  totalStudents: number;
  activeReplays: number;
  pendingQuestions: number;
  upcomingClasses: Array<{
    id: string;
    title: string;
    scheduled_at: string;
    subject_name: string;
  }>;
}

export function TutorDashboard() {
  const { user, profile } = useAuth();
  const [stats, setStats] = useState<TutorStats | null>(null);
  const [tutorRecord, setTutorRecord] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user?.id) fetchTutorData();
  }, [user?.id]);

  const fetchTutorData = async () => {
    setIsLoading(true);
    try {
      // Get tutor record
      const { data: tutor } = await supabase
        .from("tutors")
        .select("*")
        .eq("user_id", user!.id)
        .single();

      if (!tutor) {
        setIsLoading(false);
        return;
      }
      setTutorRecord(tutor);

      // Get classes for this tutor
      const { data: classes } = await supabase
        .from("classes")
        .select("id, title, scheduled_at, video_url, subject:subjects(name)")
        .eq("tutor_id", tutor.id)
        .eq("is_published", true)
        .order("scheduled_at", { ascending: true });

      const now = new Date();
      const upcoming = (classes || [])
        .filter((c) => new Date(c.scheduled_at) > now)
        .slice(0, 5)
        .map((c) => ({
          id: c.id,
          title: c.title,
          scheduled_at: c.scheduled_at,
          subject_name: (c.subject as any)?.name || "General",
        }));

      // Get video comments (pending questions) for tutor's classes
      const classIds = (classes || []).map((c) => c.id);
      let pendingQuestions = 0;
      let activeReplays = 0;

      if (classIds.length > 0) {
        const { data: comments } = await supabase
          .from("video_comments")
          .select("id")
          .in("class_id", classIds);
        pendingQuestions = (comments || []).length;

        // Count classes with video URLs as active replays
        activeReplays = (classes || []).filter((c) => c.video_url).length;
      }

      // Get active students count
      const { data: enrollments } = await supabase
        .from("enrollments")
        .select("student_id")
        .eq("is_active", true);

      const uniqueStudents = new Set((enrollments || []).map((e) => e.student_id));

      setStats({
        totalStudents: uniqueStudents.size,
        activeReplays,
        pendingQuestions,
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

  if (!tutorRecord) {
    return (
      <div className="p-6">
        <Card className="p-8 text-center">
          <BookOpen className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="font-semibold text-foreground mb-2">Tutor profile not found</h3>
          <p className="text-muted-foreground text-sm">
            Your account is not linked to a tutor profile. Please contact the administrator.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">
          Welcome, {profile?.full_name?.split(" ")[0]}! 👋
        </h1>
        <p className="text-muted-foreground">Here's your teaching overview</p>
      </div>

      {/* Vitals Grid */}
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

      {/* Upcoming Classes */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Upcoming Classes</h2>
        {stats?.upcomingClasses.length === 0 ? (
          <Card className="p-6 bg-card border-border text-center">
            <p className="text-muted-foreground">No upcoming classes scheduled</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {stats?.upcomingClasses.map((c) => (
              <Card key={c.id} className="p-4 bg-card border-border hover:shadow-md transition-shadow">
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
