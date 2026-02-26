import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Users, TrendingUp, CheckCircle, BrainCircuit, Presentation } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface LinkedStudent {
  id: string;
  full_name: string;
  avatar_url: string | null;
  xp_points: number;
  form_year: string | null;
}

interface QuizScoreData {
  date: string;
  score: number;
}

/**
 * ParentOverview — Student vitals, quiz score trend, and attendance ring.
 * Soft-Tech aesthetic with glassmorphism cards and high whitespace.
 */
export function ParentOverview() {
  const { user } = useAuth();
  const [students, setStudents] = useState<LinkedStudent[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [quizScores, setQuizScores] = useState<QuizScoreData[]>([]);
  const [attendance, setAttendance] = useState({ present: 0, total: 0 });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user) fetchLinkedStudents();
  }, [user]);

  useEffect(() => {
    if (selectedStudent) fetchStudentData(selectedStudent);
  }, [selectedStudent]);

  const fetchLinkedStudents = async () => {
    if (!user) return;
    try {
      const { data: links } = await supabase
        .from("parent_student_links")
        .select("student_profile_id")
        .eq("parent_user_id", user.id);

      if (links && links.length > 0) {
        const ids = links.map((l) => l.student_profile_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, avatar_url, xp_points, form_year, user_id")
          .in("id", ids);

        if (profiles) {
          setStudents(profiles);
          setSelectedStudent(profiles[0]?.id || null);
        }
      }
    } catch (e) {
      console.error("Error fetching linked students:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchStudentData = async (profileId: string) => {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("id", profileId)
        .single();

      if (!profile) return;

      // Quiz scores over time
      const { data: results } = await supabase
        .from("quiz_results")
        .select("score, total_questions, completed_at")
        .eq("user_id", profile.user_id)
        .order("completed_at", { ascending: true })
        .limit(20);

      if (results) {
        setQuizScores(
          results.map((r) => ({
            date: new Date(r.completed_at || "").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
            score: r.total_questions > 0 ? Math.round((r.score / r.total_questions) * 100) : 0,
          }))
        );
      }

      // Attendance
      const { data: attendanceData } = await supabase
        .from("attendance")
        .select("status")
        .eq("user_id", profile.user_id);

      if (attendanceData) {
        setAttendance({
          present: attendanceData.filter((a) => a.status === "present").length,
          total: attendanceData.length,
        });
      }
    } catch (e) {
      console.error("Error fetching student data:", e);
    }
  };

  const attendancePercent = attendance.total > 0 ? Math.round((attendance.present / attendance.total) * 100) : 0;
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (attendancePercent / 100) * circumference;

  /* ── Loading skeleton ── */
  if (isLoading) {
    return (
      <div className="p-6 md:p-10 space-y-8 max-w-6xl mx-auto">
        <div className="space-y-2">
          <Skeleton className="h-9 w-56 rounded-2xl" />
          <Skeleton className="h-5 w-80 rounded-full" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Skeleton className="h-36 rounded-2xl" />
          <Skeleton className="h-36 rounded-2xl" />
          <Skeleton className="h-36 rounded-2xl" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <Skeleton className="h-72 rounded-2xl lg:col-span-2" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 space-y-8 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">Parent Overview</h1>
        <p className="text-muted-foreground mt-1">Monitor your child's academic progress</p>
      </div>

      {/* Empty state */}
      {students.length === 0 ? (
        <Card className="p-16 text-center bg-card/70 backdrop-blur-md border-border/40 rounded-2xl shadow-sm">
          <div className="w-20 h-20 rounded-full bg-secondary/60 flex items-center justify-center mx-auto mb-5">
            <Users className="w-10 h-10 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">No linked students</h3>
          <p className="text-muted-foreground max-w-sm mx-auto">
            Contact your administrator to link your child's account to your parent portal.
          </p>
        </Card>
      ) : (
        <>
          {/* Student selector — pill buttons */}
          {students.length > 1 && (
            <div className="flex flex-wrap gap-3">
              {students.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedStudent(s.id)}
                  className={cn(
                    "flex items-center gap-2.5 px-5 py-2.5 rounded-full border transition-all duration-200",
                    selectedStudent === s.id
                      ? "border-primary bg-primary/10 shadow-sm"
                      : "border-border/40 bg-card/70 backdrop-blur-sm hover:bg-secondary/50"
                  )}
                >
                  <Avatar className="w-7 h-7">
                    <AvatarImage src={s.avatar_url || undefined} />
                    <AvatarFallback className="bg-accent text-accent-foreground text-xs">
                      {s.full_name.split(" ").map((n) => n[0]).join("")}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-medium text-foreground text-sm">{s.full_name}</span>
                </button>
              ))}
            </div>
          )}

          {/* Student Vitals Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {students
              .filter((s) => s.id === selectedStudent)
              .map((student) => (
                <Card key={student.id} className="p-6 bg-card/70 backdrop-blur-md border-border/40 rounded-2xl shadow-sm">
                  <div className="flex items-center gap-3 mb-4">
                    <Avatar className="w-14 h-14 ring-2 ring-border/30">
                      <AvatarImage src={student.avatar_url || undefined} />
                      <AvatarFallback className="bg-accent text-accent-foreground text-lg font-bold">
                        {student.full_name.split(" ").map((n) => n[0]).join("")}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h3 className="font-bold text-foreground text-lg">{student.full_name}</h3>
                      {student.form_year && (
                        <Badge variant="secondary" className="rounded-full mt-1">{student.form_year}</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <TrendingUp className="w-4 h-4 text-accent" />
                    <span>{student.xp_points} XP earned</span>
                  </div>
                </Card>
              ))}

            <Card className="p-6 bg-card/70 backdrop-blur-md border-border/40 rounded-2xl shadow-sm flex items-center gap-5">
              <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center">
                <Presentation className="w-7 h-7 text-accent" />
              </div>
              <div>
                <p className="text-3xl font-bold text-foreground">{attendance.present}/{attendance.total}</p>
                <p className="text-sm text-muted-foreground">Classes Attended</p>
              </div>
            </Card>

            <Card className="p-6 bg-card/70 backdrop-blur-md border-border/40 rounded-2xl shadow-sm flex items-center gap-5">
              <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center">
                <BrainCircuit className="w-7 h-7 text-accent" />
              </div>
              <div>
                <p className="text-3xl font-bold text-foreground">{quizScores.length}</p>
                <p className="text-sm text-muted-foreground">Quizzes Completed</p>
              </div>
            </Card>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Quiz Scores Line Chart */}
            <Card className="p-6 bg-card/70 backdrop-blur-md border-border/40 rounded-2xl shadow-sm lg:col-span-2">
              <h3 className="font-bold text-foreground mb-5">Quiz Scores Over Time</h3>
              {quizScores.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={quizScores}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "12px",
                        color: "hsl(var(--foreground))",
                        boxShadow: "var(--shadow-sm)",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="score"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2.5}
                      dot={{ fill: "hsl(var(--primary))", r: 4, strokeWidth: 0 }}
                      activeDot={{ r: 6, fill: "hsl(var(--primary))", strokeWidth: 0 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[260px] flex flex-col items-center justify-center text-muted-foreground gap-3">
                  <BrainCircuit className="w-12 h-12 text-muted-foreground/40" />
                  <p className="text-sm">No quiz data yet</p>
                </div>
              )}
            </Card>

            {/* Attendance Ring */}
            <Card className="p-6 bg-card/70 backdrop-blur-md border-border/40 rounded-2xl shadow-sm flex flex-col items-center justify-center">
              <h3 className="font-bold text-foreground mb-5">Overall Attendance</h3>
              <div className="relative w-36 h-36">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="45" fill="none" stroke="hsl(var(--secondary))" strokeWidth="7" />
                  <circle
                    cx="50" cy="50" r="45" fill="none"
                    stroke="hsl(var(--primary))"
                    strokeWidth="7"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    className="transition-all duration-1000 ease-out"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-black text-foreground">{attendancePercent}%</span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mt-3">{attendance.present} of {attendance.total} classes</p>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
