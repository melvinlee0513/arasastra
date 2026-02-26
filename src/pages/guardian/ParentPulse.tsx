import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, TrendingUp, Users, Calendar, CheckCircle,
  BrainCircuit, Mail, ArrowRight, LogOut, Activity
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  RadialBarChart, RadialBar
} from "recharts";
import { cn } from "@/lib/utils";
import owlMascot from "@/assets/owl-mascot.png";

/** Stagger animation for bento children */
const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};
const itemVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring" as const, stiffness: 300, damping: 28 } },
};

interface LinkedStudent {
  id: string;
  full_name: string;
  avatar_url: string | null;
  xp_points: number;
  form_year: string | null;
  user_id: string;
}

interface QuizScorePoint { date: string; score: number; }

/**
 * ParentPulse — Premium bento-grid parent dashboard.
 * No sidebar, fully centered, deep soft shadows, radial attendance ring.
 */
export function ParentPulse() {
  const [authedUser, setAuthedUser] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  const [students, setStudents] = useState<LinkedStudent[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<LinkedStudent | null>(null);
  const [quizScores, setQuizScores] = useState<QuizScorePoint[]>([]);
  const [attendance, setAttendance] = useState({ present: 0, total: 0 });
  const [totalClasses, setTotalClasses] = useState(0);
  const [isDataLoading, setIsDataLoading] = useState(false);

  /* ── Auth check ── */
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthedUser(data.session?.user ?? null);
      setIsAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setAuthedUser(session?.user ?? null);
      setIsAuthLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (authedUser) fetchLinkedStudents();
  }, [authedUser]);

  useEffect(() => {
    if (selectedStudent) fetchStudentData(selectedStudent);
  }, [selectedStudent]);

  /* ── Magic Link ── */
  const sendMagicLink = async () => {
    if (!email) return;
    await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/guardian-pulse` },
    });
    setMagicLinkSent(true);
  };

  /* ── Data fetching ── */
  const fetchLinkedStudents = async () => {
    if (!authedUser) return;
    setIsDataLoading(true);
    try {
      const { data: links } = await supabase
        .from("parent_student_links")
        .select("student_profile_id")
        .eq("parent_user_id", authedUser.id);

      if (links && links.length > 0) {
        const ids = links.map((l) => l.student_profile_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, avatar_url, xp_points, form_year, user_id")
          .in("id", ids);

        if (profiles && profiles.length > 0) {
          setStudents(profiles);
          setSelectedStudent(profiles[0]);
        }
      }
    } catch (e) {
      console.error("Error fetching linked students:", e);
    } finally {
      setIsDataLoading(false);
    }
  };

  const fetchStudentData = async (student: LinkedStudent) => {
    try {
      // Quiz scores
      const { data: results } = await supabase
        .from("quiz_results")
        .select("score, total_questions, completed_at")
        .eq("user_id", student.user_id)
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
      const { data: att } = await supabase
        .from("attendance")
        .select("status")
        .eq("user_id", student.user_id);

      if (att) {
        setAttendance({
          present: att.filter((a) => a.status === "present").length,
          total: att.length,
        });
      }

      const { count } = await supabase
        .from("classes")
        .select("id", { count: "exact", head: true })
        .eq("is_published", true);
      setTotalClasses(count || 0);
    } catch (e) {
      console.error("Error fetching student data:", e);
    }
  };

  const attendancePercent = attendance.total > 0 ? Math.round((attendance.present / attendance.total) * 100) : 0;
  const radialData = [{ name: "Attendance", value: attendancePercent, fill: "hsl(var(--primary))" }];

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setAuthedUser(null);
    setStudents([]);
    setSelectedStudent(null);
  };

  /* ── Auth Loading ── */
  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-secondary/30 flex items-center justify-center p-6">
        <div className="space-y-4 w-full max-w-lg">
          <Skeleton className="h-16 rounded-3xl" />
          <Skeleton className="h-12 rounded-full" />
        </div>
      </div>
    );
  }

  /* ── Magic Link Auth Screen ── */
  if (!authedUser) {
    return (
      <div className="min-h-screen bg-secondary/30 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 25 }}
          className="w-full max-w-md"
        >
          <Card className="p-10 rounded-3xl border-0 shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-card/90 backdrop-blur-md text-center space-y-6">
            <img src={owlMascot} alt="Arasa A+" className="w-16 h-16 mx-auto" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">Parent Pulse</h1>
              <p className="text-muted-foreground text-sm mt-1">Sign in with a magic link to view your child's progress</p>
            </div>

            <AnimatePresence mode="wait">
              {!magicLinkSent ? (
                <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                  <Input
                    type="email"
                    placeholder="Your email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-12 rounded-full text-center border-border/30 bg-secondary/30"
                  />
                  <Button onClick={sendMagicLink} className="w-full h-12 rounded-full gap-2" disabled={!email}>
                    <Mail className="w-4 h-4" strokeWidth={1.5} />
                    Send Magic Link
                  </Button>
                </motion.div>
              ) : (
                <motion.div key="sent" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-3 py-4">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                    <CheckCircle className="w-8 h-8 text-primary" strokeWidth={1.5} />
                  </div>
                  <p className="text-foreground font-medium">Check your inbox!</p>
                  <p className="text-sm text-muted-foreground">We sent a magic link to <span className="font-medium text-foreground">{email}</span></p>
                  <Button variant="ghost" size="sm" className="rounded-full" onClick={() => setMagicLinkSent(false)}>
                    Try a different email
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        </motion.div>
      </div>
    );
  }

  /* ── Data Loading ── */
  if (isDataLoading && students.length === 0) {
    return (
      <div className="min-h-screen bg-secondary/30 p-6 md:p-10">
        <div className="max-w-5xl mx-auto space-y-6">
          <Skeleton className="h-12 w-64 rounded-3xl" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-36 rounded-3xl" />)}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Skeleton className="h-72 rounded-3xl md:col-span-2" />
            <Skeleton className="h-72 rounded-3xl" />
          </div>
        </div>
      </div>
    );
  }

  /* ── Empty state ── */
  if (students.length === 0) {
    return (
      <div className="min-h-screen bg-secondary/30 flex items-center justify-center p-6">
        <Card className="p-16 text-center rounded-3xl border-0 shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-card/90 backdrop-blur-md max-w-md w-full space-y-5">
          <div className="w-20 h-20 rounded-full bg-secondary/60 flex items-center justify-center mx-auto">
            <Users className="w-10 h-10 text-muted-foreground" strokeWidth={1.5} />
          </div>
          <h2 className="text-xl font-bold text-foreground">No Linked Students</h2>
          <p className="text-muted-foreground text-sm">Contact your administrator to link your child's account.</p>
          <Button variant="ghost" size="sm" className="rounded-full gap-2" onClick={handleSignOut}>
            <LogOut className="w-4 h-4" strokeWidth={1.5} /> Sign Out
          </Button>
        </Card>
      </div>
    );
  }

  /* ── Bento Dashboard ── */
  return (
    <div className="min-h-screen bg-secondary/30">
      <div className="max-w-5xl mx-auto p-6 md:p-10 space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <img src={owlMascot} alt="" className="w-10 h-10" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">Parent Pulse</h1>
              <p className="text-sm text-muted-foreground">Real-time student vitals</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="rounded-full gap-2 text-muted-foreground" onClick={handleSignOut}>
            <LogOut className="w-4 h-4" strokeWidth={1.5} /> Sign Out
          </Button>
        </motion.div>

        {/* Student selector — pill buttons */}
        {students.length > 1 && (
          <div className="flex flex-wrap gap-3">
            {students.map((s) => (
              <motion.button
                key={s.id}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setSelectedStudent(s)}
                className={cn(
                  "flex items-center gap-2.5 px-5 py-2.5 rounded-full transition-all duration-200",
                  selectedStudent?.id === s.id
                    ? "bg-primary text-primary-foreground shadow-[0_8px_30px_rgb(0,0,0,0.04)]"
                    : "bg-card/80 text-foreground hover:bg-card border border-border/20"
                )}
              >
                <Avatar className="w-6 h-6">
                  <AvatarImage src={s.avatar_url || undefined} />
                  <AvatarFallback className="bg-secondary text-foreground text-[10px]">{s.full_name.charAt(0)}</AvatarFallback>
                </Avatar>
                <span className="font-medium text-sm">{s.full_name}</span>
              </motion.button>
            ))}
          </div>
        )}

        {/* Bento Grid */}
        <motion.div variants={containerVariants} initial="hidden" animate="show" className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Student Profile Card — spans 2 cols */}
          <motion.div variants={itemVariants} className="col-span-2">
            <Card className="p-6 rounded-3xl border-0 shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-card/90 backdrop-blur-md h-full">
              <div className="flex items-center gap-4">
                <Avatar className="w-16 h-16 ring-2 ring-border/20">
                  <AvatarImage src={selectedStudent?.avatar_url || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary text-xl font-bold">
                    {selectedStudent?.full_name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h2 className="text-xl font-bold text-foreground">{selectedStudent?.full_name}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    {selectedStudent?.form_year && (
                      <Badge variant="secondary" className="rounded-full text-xs">{selectedStudent.form_year}</Badge>
                    )}
                    <Badge variant="outline" className="rounded-full text-xs gap-1">
                      <Sparkles className="w-3 h-3" strokeWidth={1.5} /> {selectedStudent?.xp_points} XP
                    </Badge>
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>

          {/* Attendance Stat */}
          <motion.div variants={itemVariants}>
            <Card className="p-6 rounded-3xl border-0 shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-card/90 backdrop-blur-md h-full flex flex-col items-center justify-center text-center">
              <Activity className="w-5 h-5 text-primary mb-2" strokeWidth={1.5} />
              <p className="text-3xl font-bold text-foreground">{attendancePercent}%</p>
              <p className="text-xs text-muted-foreground mt-1">Attendance</p>
            </Card>
          </motion.div>

          {/* Quizzes Completed Stat */}
          <motion.div variants={itemVariants}>
            <Card className="p-6 rounded-3xl border-0 shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-card/90 backdrop-blur-md h-full flex flex-col items-center justify-center text-center">
              <BrainCircuit className="w-5 h-5 text-primary mb-2" strokeWidth={1.5} />
              <p className="text-3xl font-bold text-foreground">{quizScores.length}</p>
              <p className="text-xs text-muted-foreground mt-1">Quizzes Done</p>
            </Card>
          </motion.div>

          {/* Quiz Scores Chart — spans 3 cols */}
          <motion.div variants={itemVariants} className="col-span-2 md:col-span-3">
            <Card className="p-6 rounded-3xl border-0 shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-card/90 backdrop-blur-md h-full">
              <div className="flex items-center gap-2 mb-5">
                <TrendingUp className="w-4 h-4 text-primary" strokeWidth={1.5} />
                <h3 className="font-semibold text-foreground text-sm">Quiz Performance</h3>
              </div>
              {quizScores.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={quizScores}>
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "none",
                        borderRadius: "16px",
                        boxShadow: "0 8px 30px rgb(0,0,0,0.08)",
                        color: "hsl(var(--foreground))",
                      }}
                    />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <Line
                      type="monotone"
                      dataKey="score"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2.5}
                      dot={{ fill: "hsl(var(--primary))", r: 4, strokeWidth: 0 }}
                      activeDot={{ r: 6, strokeWidth: 0 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[220px] flex flex-col items-center justify-center text-muted-foreground gap-2">
                  <BrainCircuit className="w-10 h-10 text-muted-foreground/30" strokeWidth={1.5} />
                  <p className="text-sm">No quiz data yet</p>
                </div>
              )}
            </Card>
          </motion.div>

          {/* Attendance Radial — 1 col */}
          <motion.div variants={itemVariants}>
            <Card className="p-6 rounded-3xl border-0 shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-card/90 backdrop-blur-md h-full flex flex-col items-center justify-center">
              <h3 className="font-semibold text-foreground text-sm mb-3">Attendance</h3>
              <div className="w-32 h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <RadialBarChart
                    cx="50%" cy="50%"
                    innerRadius="70%" outerRadius="100%"
                    barSize={10}
                    data={radialData}
                    startAngle={90} endAngle={-270}
                  >
                    <RadialBar
                      dataKey="value"
                      cornerRadius={10}
                      background={{ fill: "hsl(var(--secondary))" }}
                    />
                  </RadialBarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-sm text-muted-foreground mt-2">{attendance.present}/{attendance.total} classes</p>
            </Card>
          </motion.div>

          {/* Quick Stats Row */}
          <motion.div variants={itemVariants} className="col-span-2 md:col-span-4">
            <Card className="p-6 rounded-3xl border-0 shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-card/90 backdrop-blur-md">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Calendar className="w-5 h-5 text-primary" strokeWidth={1.5} />
                  <div>
                    <p className="text-2xl font-bold text-foreground">{totalClasses}</p>
                    <p className="text-xs text-muted-foreground">Total Classes</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Sparkles className="w-5 h-5 text-primary" strokeWidth={1.5} />
                  <div>
                    <p className="text-2xl font-bold text-foreground">{selectedStudent?.xp_points || 0}</p>
                    <p className="text-xs text-muted-foreground">Experience Points</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <TrendingUp className="w-5 h-5 text-primary" strokeWidth={1.5} />
                  <div>
                    <p className="text-2xl font-bold text-foreground">
                      {quizScores.length > 0 ? `${quizScores[quizScores.length - 1].score}%` : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">Latest Quiz</p>
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
