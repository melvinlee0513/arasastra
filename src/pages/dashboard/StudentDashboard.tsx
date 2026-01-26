import { useEffect, useState } from "react";
import { Play, Clock, Video, ChevronRight, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import owlMascot from "@/assets/owl-mascot.png";

interface LiveClass {
  id: string;
  title: string;
  live_url: string | null;
  subject?: { name: string } | null;
  tutor?: { name: string; avatar_url: string | null } | null;
}

interface EnrolledSubject {
  id: string;
  subject: {
    id: string;
    name: string;
    icon: string | null;
    color: string | null;
  };
  progress?: number;
}

export function StudentDashboard() {
  const { profile } = useAuth();
  const [liveClasses, setLiveClasses] = useState<LiveClass[]>([]);
  const [enrolledSubjects, setEnrolledSubjects] = useState<EnrolledSubject[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (profile?.id) {
      fetchDashboardData();
    }
  }, [profile?.id]);

  const fetchDashboardData = async () => {
    setIsLoading(true);
    try {
      // Fetch live classes
      const { data: liveData } = await supabase
        .from("classes")
        .select("id, title, live_url, subject:subjects(name), tutor:tutors(name, avatar_url)")
        .eq("is_live", true)
        .eq("is_published", true);

      setLiveClasses(liveData || []);

      // Fetch enrolled subjects
      const { data: enrollmentData } = await supabase
        .from("enrollments")
        .select("id, subject:subjects(id, name, icon, color)")
        .eq("student_id", profile!.id)
        .eq("is_active", true);

      // Calculate progress for each subject (mock for now)
      const subjectsWithProgress = (enrollmentData || []).map((enrollment) => ({
        ...enrollment,
        progress: Math.floor(Math.random() * 100), // Mock progress
      }));

      setEnrolledSubjects(subjectsWithProgress);
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Welcome Header */}
      <div className="flex items-center gap-3">
        <img src={owlMascot} alt="Arasa A+" className="w-12 h-12 md:hidden" />
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">
            Welcome back, {profile?.full_name?.split(" ")[0]}! 👋
          </h1>
          <p className="text-muted-foreground">Ready to learn something new today?</p>
        </div>
      </div>

      {/* Live Now Section */}
      {liveClasses.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
            <h2 className="text-lg font-semibold text-foreground">Live Now</h2>
          </div>

          <div className="grid gap-4">
            {liveClasses.map((liveClass) => (
              <Card
                key={liveClass.id}
                className="relative overflow-hidden bg-gradient-to-br from-navy to-navy-light p-6 border-0"
              >
                <div className="absolute top-4 right-4">
                  <Badge variant="destructive" className="gap-1 animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-primary-foreground animate-ping" />
                    LIVE
                  </Badge>
                </div>

                <div className="flex flex-col md:flex-row md:items-center gap-4">
                  <div className="flex-1 space-y-3">
                    <Badge
                      variant="secondary"
                      className="bg-primary-foreground/10 text-primary-foreground border-0"
                    >
                      {liveClass.subject?.name || "General"}
                    </Badge>
                    <h3 className="text-xl md:text-2xl font-bold text-primary-foreground">
                      {liveClass.title}
                    </h3>
                    {liveClass.tutor && (
                      <div className="flex items-center gap-3">
                        <Avatar className="w-8 h-8 border-2 border-primary-foreground/20">
                          <AvatarImage src={liveClass.tutor.avatar_url || undefined} />
                          <AvatarFallback className="bg-accent text-accent-foreground text-xs">
                            {liveClass.tutor.name
                              .split(" ")
                              .map((n) => n[0])
                              .join("")}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-primary-foreground/80">{liveClass.tutor.name}</span>
                      </div>
                    )}
                  </div>

                  <Button
                    variant="live"
                    size="xl"
                    className="w-full md:w-auto"
                    onClick={() => liveClass.live_url && window.open(liveClass.live_url, "_blank")}
                    disabled={!liveClass.live_url}
                  >
                    <Play className="w-5 h-5" />
                    Join Class
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* My Subjects */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">My Subjects</h2>
          <Button variant="ghost" size="sm" className="text-accent">
            See All <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        {enrolledSubjects.length === 0 ? (
          <Card className="p-8 text-center bg-card border-border">
            <BookOpen className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="font-semibold text-foreground mb-2">No subjects enrolled</h3>
            <p className="text-muted-foreground text-sm">
              Contact your administrator to enroll in subjects.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {enrolledSubjects.map((enrollment) => (
              <Card
                key={enrollment.id}
                className="p-4 bg-card border-border hover:shadow-md hover:border-accent/30 transition-all duration-200 cursor-pointer group"
              >
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                    {enrollment.subject?.icon || "📚"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground truncate">
                      {enrollment.subject?.name}
                    </h3>
                    <p className="text-xs text-accent mt-1">Enrolled</p>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-medium text-foreground">{enrollment.progress}%</span>
                  </div>
                  <Progress value={enrollment.progress} className="h-2" />
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Upcoming Classes - Placeholder */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Upcoming Classes</h2>
        <Card className="p-6 bg-card border-border">
          <div className="flex items-center gap-4 text-muted-foreground">
            <Clock className="w-8 h-8" />
            <div>
              <p className="font-medium">No upcoming classes</p>
              <p className="text-sm">Check back later for scheduled classes</p>
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}
