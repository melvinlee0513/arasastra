import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Users, TrendingUp, CheckCircle, BookOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

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
      // Get student's user_id from profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("id", profileId)
        .single();

      if (!profile) return;

      // Fetch quiz scores over time
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

      // Fetch attendance
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

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">Parent Overview</h1>
        <p className="text-muted-foreground">Monitor your child's academic progress</p>
      </div>

      {students.length === 0 ? (
        <Card className="p-12 text-center bg-card border-border">
          <Users className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold text-foreground mb-2">No linked students</h3>
          <p className="text-muted-foreground">Contact your administrator to link your child's account.</p>
        </Card>
      ) : (
        <>
          {/* Student selector */}
          {students.length > 1 && (
            <div className="flex gap-3">
              {students.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedStudent(s.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all ${
                    selectedStudent === s.id ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-secondary"
                  }`}
                >
                  <Avatar className="w-8 h-8">
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {students
              .filter((s) => s.id === selectedStudent)
              .map((student) => (
                <Card key={student.id} className="p-5 bg-card border-border">
                  <div className="flex items-center gap-3 mb-3">
                    <Avatar className="w-12 h-12">
                      <AvatarImage src={student.avatar_url || undefined} />
                      <AvatarFallback className="bg-accent text-accent-foreground">
                        {student.full_name.split(" ").map((n) => n[0]).join("")}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h3 className="font-bold text-foreground">{student.full_name}</h3>
                      {student.form_year && <Badge variant="secondary">{student.form_year}</Badge>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <TrendingUp className="w-4 h-4 text-accent" />
                    <span>{student.xp_points} XP earned</span>
                  </div>
                </Card>
              ))}

            <Card className="p-5 bg-card border-border flex items-center gap-4">
              <CheckCircle className="w-8 h-8 text-accent" />
              <div>
                <p className="text-2xl font-bold text-foreground">{attendance.present}/{attendance.total}</p>
                <p className="text-sm text-muted-foreground">Classes Attended</p>
              </div>
            </Card>

            <Card className="p-5 bg-card border-border flex items-center gap-4">
              <BookOpen className="w-8 h-8 text-accent" />
              <div>
                <p className="text-2xl font-bold text-foreground">{quizScores.length}</p>
                <p className="text-sm text-muted-foreground">Quizzes Completed</p>
              </div>
            </Card>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Quiz Scores Line Chart */}
            <Card className="p-5 bg-card border-border lg:col-span-2">
              <h3 className="font-bold text-foreground mb-4">Quiz Scores Over Time</h3>
              {quizScores.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={quizScores}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        color: "hsl(var(--foreground))",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="score"
                      stroke="hsl(var(--accent))"
                      strokeWidth={2}
                      dot={{ fill: "hsl(var(--accent))", r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                  No quiz data yet
                </div>
              )}
            </Card>

            {/* Attendance Ring */}
            <Card className="p-5 bg-card border-border flex flex-col items-center justify-center">
              <h3 className="font-bold text-foreground mb-4">Overall Attendance</h3>
              <div className="relative w-32 h-32">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="45" fill="none" stroke="hsl(var(--secondary))" strokeWidth="8" />
                  <circle
                    cx="50" cy="50" r="45" fill="none"
                    stroke="hsl(var(--accent))"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    className="transition-all duration-1000 ease-out"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl font-black text-foreground">{attendancePercent}%</span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mt-2">{attendance.present} of {attendance.total} classes</p>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
