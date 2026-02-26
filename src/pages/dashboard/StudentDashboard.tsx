import { useEffect, useState } from "react";
import { Play, Clock, ChevronRight, BookOpen, Calendar, Video, CheckCircle, HelpCircle } from "lucide-react";
import { format, isAfter, isBefore, addMinutes } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import owlMascot from "@/assets/owl-mascot.png";
import { Link } from "react-router-dom";
import { XPLeaderboard } from "@/components/dashboard/XPLeaderboard";
import { StreakFlame } from "@/components/dashboard/StreakFlame";
import { useUserProgress } from "@/hooks/useUserProgress";

interface LiveClass {
  id: string;
  title: string;
  live_url: string | null;
  zoom_link: string | null;
  scheduled_at: string;
  duration_minutes: number;
  subject?: { name: string } | null;
  tutor?: { name: string; avatar_url: string | null } | null;
}

interface UpcomingClass {
  id: string;
  title: string;
  scheduled_at: string;
  duration_minutes: number;
  zoom_link?: string | null;
  subject?: { name: string; icon?: string | null } | null;
  tutor?: { name: string } | null;
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
  const { profile, user } = useAuth();
  const [liveClasses, setLiveClasses] = useState<LiveClass[]>([]);
  const [upcomingClasses, setUpcomingClasses] = useState<UpcomingClass[]>([]);
  const [enrolledSubjects, setEnrolledSubjects] = useState<EnrolledSubject[]>([]);
  const [attendanceScore, setAttendanceScore] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { progress: userProgress } = useUserProgress();

  useEffect(() => {
    if (profile?.id) {
      fetchDashboardData();
    }
  }, [profile?.id]);

  const fetchDashboardData = async () => {
    setIsLoading(true);
    try {
      const now = new Date();

      // Fetch classes that are currently live OR scheduled to be live now
      const { data: allClasses } = await supabase
        .from("classes")
        .select("id, title, live_url, zoom_link, scheduled_at, duration_minutes, is_live, subject:subjects(name), tutor:tutors(name, avatar_url)")
        .eq("is_published", true)
        .order("scheduled_at", { ascending: true });

      // Determine truly live classes (either marked live OR within scheduled time)
      const liveNow: LiveClass[] = [];
      const upcoming: UpcomingClass[] = [];

      (allClasses || []).forEach((classItem) => {
        const start = new Date(classItem.scheduled_at);
        const end = addMinutes(start, classItem.duration_minutes || 60);
        const isCurrentlyLive = classItem.is_live || (isAfter(now, start) && isBefore(now, end));

        if (isCurrentlyLive && (classItem.live_url || classItem.zoom_link)) {
          liveNow.push(classItem);
        } else if (isAfter(start, now)) {
          upcoming.push(classItem);
        }
      });

      setLiveClasses(liveNow);
      setUpcomingClasses(upcoming.slice(0, 5)); // Show only next 5

      // Fetch enrolled subjects with progress calculation
      const { data: enrollmentData } = await supabase
        .from("enrollments")
        .select("id, subject:subjects(id, name, icon, color)")
        .eq("student_id", profile!.id)
        .eq("is_active", true);

      // Fetch progress for enrolled subjects
      const { data: progressData } = await supabase
        .from("progress")
        .select("class_id, completed, classes(subject_id)")
        .eq("student_id", profile!.id);

      // Calculate progress per subject
      const subjectsWithProgress = (enrollmentData || []).map((enrollment) => {
        const subjectId = enrollment.subject?.id;
        const subjectProgress = (progressData || []).filter(
          (p) => (p.classes as { subject_id: string | null } | null)?.subject_id === subjectId
        );
        const completedCount = subjectProgress.filter((p) => p.completed).length;
        const totalCount = subjectProgress.length || 1;
        const progressPercent = Math.round((completedCount / totalCount) * 100);

        return {
          ...enrollment,
          progress: subjectProgress.length > 0 ? progressPercent : 0,
        };
      });

      setEnrolledSubjects(subjectsWithProgress);

      // Fetch attendance score
      if (user) {
        const { data: attendanceData } = await supabase
          .from("attendance")
          .select("status")
          .eq("user_id", user.id);

        if (attendanceData && attendanceData.length > 0) {
          const present = attendanceData.filter((a) => a.status === "present").length;
          setAttendanceScore(Math.round((present / attendanceData.length) * 100));
        }
      }
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Attendance Score + Welcome */}
      <div className="flex items-center gap-3">
        <img src={owlMascot} alt="Arasa A+" className="w-12 h-12 md:hidden" />
        <div className="flex-1">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">
            Welcome back, {profile?.full_name?.split(" ")[0]}! 👋
          </h1>
          <p className="text-muted-foreground">Ready to learn something new today?</p>
        </div>
        <div className="hidden md:flex items-center gap-3">
          <StreakFlame streak={userProgress.streak} />
          {attendanceScore !== null && (
            <Card className="p-3 bg-card border-border flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-accent" />
              <div>
                <p className="text-xl font-bold text-foreground">{attendanceScore}%</p>
                <p className="text-xs text-muted-foreground">Attendance</p>
              </div>
            </Card>
          )}
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
                    onClick={() => {
                      const link = liveClass.zoom_link || liveClass.live_url;
                      if (link) window.open(link, "_blank");
                    }}
                    disabled={!liveClass.live_url && !liveClass.zoom_link}
                  >
                    <Video className="w-5 h-5" />
                    Join Zoom
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

      {/* Upcoming Classes + XP Leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="space-y-3 lg:col-span-2">
          <h2 className="text-lg font-semibold text-foreground">Upcoming Classes</h2>
          {upcomingClasses.length === 0 ? (
            <Card className="p-6 bg-card border-border">
              <div className="flex items-center gap-4 text-muted-foreground">
                <Clock className="w-8 h-8" />
                <div>
                  <p className="font-medium">No upcoming classes</p>
                  <p className="text-sm">Check back later for scheduled classes</p>
                </div>
              </div>
            </Card>
          ) : (
            <div className="space-y-2">
              {upcomingClasses.map((classItem) => (
                <Card key={classItem.id} className="p-4 bg-card border-border hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                      <Calendar className="w-5 h-5 text-accent" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-foreground truncate">{classItem.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        {classItem.subject?.name} • {classItem.tutor?.name}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-accent">
                        {format(new Date(classItem.scheduled_at), "MMM d")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(classItem.scheduled_at), "h:mm a")}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* XP Leaderboard */}
        <section>
          <XPLeaderboard />
        </section>
      </div>

      {/* Quick Links */}
      <section className="grid grid-cols-3 gap-4">
        <Link to="/dashboard/replays">
          <Card className="p-4 bg-card border-border hover:shadow-md hover:border-accent/30 transition-all cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                <Play className="w-5 h-5 text-accent" />
              </div>
              <div>
                <h3 className="font-medium text-foreground">Replays</h3>
                <p className="text-xs text-muted-foreground">Watch past classes</p>
              </div>
            </div>
          </Card>
        </Link>
        <Link to="/dashboard/learning">
          <Card className="p-4 bg-card border-border hover:shadow-md hover:border-accent/30 transition-all cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-accent" />
              </div>
              <div>
                <h3 className="font-medium text-foreground">Notes Bank</h3>
                <p className="text-xs text-muted-foreground">Download materials</p>
              </div>
            </div>
          </Card>
        </Link>
        <Link to="/dashboard/learning/quizzes">
          <Card className="p-4 bg-card border-border hover:shadow-md hover:border-accent/30 transition-all cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                <HelpCircle className="w-5 h-5 text-accent" />
              </div>
              <div>
                <h3 className="font-medium text-foreground">Quizzes</h3>
                <p className="text-xs text-muted-foreground">Test your knowledge</p>
              </div>
            </div>
          </Card>
        </Link>
      </section>
    </div>
  );
}
