import { useEffect, useState } from "react";
import { TrendingUp, Users, BookOpen, Video, CreditCard, RefreshCw, FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";

interface EnrollmentBySubject {
  name: string;
  count: number;
}

interface AnalyticsStats {
  totalUsers: number;
  totalEnrollments: number;
  totalClasses: number;
  totalNotes: number;
  pendingPayments: number;
  activeSubscriptions: number;
}

interface WeeklyEnrollment {
  week: string;
  enrollments: number;
}

const COLORS = ["hsl(43, 90%, 55%)", "hsl(220, 45%, 22%)", "hsl(25, 50%, 35%)", "hsl(40, 30%, 96%)", "hsl(220, 40%, 28%)"];

export function AnalyticsDashboard() {
  const [enrollmentsBySubject, setEnrollmentsBySubject] = useState<EnrollmentBySubject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [stats, setStats] = useState<AnalyticsStats>({
    totalUsers: 0,
    totalEnrollments: 0,
    totalClasses: 0,
    totalNotes: 0,
    pendingPayments: 0,
    activeSubscriptions: 0,
  });
  const [weeklyEnrollments, setWeeklyEnrollments] = useState<WeeklyEnrollment[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    setIsLoading(true);
    try {
      // Fetch all stats in parallel
      const [
        profilesRes,
        enrollmentsRes,
        classesRes,
        notesRes,
        pendingPaymentsRes,
        activeSubsRes,
        subjectsRes,
      ] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("enrollments").select("id, enrolled_at", { count: "exact" }),
        supabase.from("classes").select("id", { count: "exact", head: true }),
        supabase.from("notes").select("id", { count: "exact", head: true }),
        supabase.from("payment_submissions").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("subjects").select("id, name"),
      ]);

      setStats({
        totalUsers: profilesRes.count || 0,
        totalEnrollments: enrollmentsRes.count || 0,
        totalClasses: classesRes.count || 0,
        totalNotes: notesRes.count || 0,
        pendingPayments: pendingPaymentsRes.count || 0,
        activeSubscriptions: activeSubsRes.count || 0,
      });

      // Calculate weekly enrollments from last 4 weeks
      const enrollmentsData = enrollmentsRes.data || [];
      const now = new Date();
      const weeklyData: WeeklyEnrollment[] = [];
      
      for (let i = 3; i >= 0; i--) {
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - (i + 1) * 7);
        const weekEnd = new Date(now);
        weekEnd.setDate(now.getDate() - i * 7);
        
        const count = enrollmentsData.filter((e) => {
          const enrolledAt = new Date(e.enrolled_at || "");
          return enrolledAt >= weekStart && enrolledAt < weekEnd;
        }).length;
        
        weeklyData.push({
          week: `Week ${4 - i}`,
          enrollments: count,
        });
      }
      setWeeklyEnrollments(weeklyData);

      // Fetch enrollments grouped by subject
      const subjects = subjectsRes.data || [];
      const subjectEnrollments = await Promise.all(
        subjects.map(async (subject) => {
          const { count } = await supabase
            .from("enrollments")
            .select("id", { count: "exact", head: true })
            .eq("subject_id", subject.id);

          return {
            name: subject.name,
            count: count || 0,
          };
        })
      );

      setEnrollmentsBySubject(subjectEnrollments.filter((s) => s.count > 0));
    } catch (error) {
      console.error("Error fetching analytics:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchAnalytics();
    setIsRefreshing(false);
    toast({
      title: "✅ Refreshed",
      description: "Analytics data has been updated",
    });
  };

  const statCards = [
    { label: "Total Users", value: stats.totalUsers, icon: Users, color: "text-primary" },
    { label: "Active Subscriptions", value: stats.activeSubscriptions, icon: CreditCard, color: "text-accent" },
    { label: "Total Enrollments", value: stats.totalEnrollments, icon: BookOpen, color: "text-primary" },
    { label: "Total Classes", value: stats.totalClasses, icon: Video, color: "text-accent" },
    { label: "Notes Uploaded", value: stats.totalNotes, icon: FileText, color: "text-primary" },
    { label: "Pending Payments", value: stats.pendingPayments, icon: TrendingUp, color: "text-destructive" },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Analytics Dashboard</h1>
          <p className="text-muted-foreground">Track enrollment and engagement metrics</p>
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {isLoading ? (
          Array(6).fill(0).map((_, i) => (
            <Card key={i} className="p-4 bg-card border-border">
              <Skeleton className="h-8 w-16 mb-2" />
              <Skeleton className="h-4 w-24" />
            </Card>
          ))
        ) : (
          statCards.map((stat) => (
            <Card key={stat.label} className="p-4 bg-card border-border">
              <div className="flex items-center gap-2 mb-2">
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
                <span className="text-2xl font-bold text-foreground">{stat.value}</span>
              </div>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </Card>
          ))
        )}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weekly Enrollments */}
        <Card className="p-6 bg-card border-border">
          <h3 className="text-lg font-semibold text-foreground mb-4">Weekly Enrollments</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyEnrollments}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="week" stroke="hsl(var(--muted-foreground))" />
                <YAxis stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Bar dataKey="enrollments" fill="hsl(43, 90%, 55%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Enrollments by Subject */}
        <Card className="p-6 bg-card border-border">
          <h3 className="text-lg font-semibold text-foreground mb-4">Enrollments by Subject</h3>
          <div className="h-64">
            {enrollmentsBySubject.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={enrollmentsBySubject}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="count"
                  >
                    {enrollmentsBySubject.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                No enrollment data yet
              </div>
            )}
          </div>
          {enrollmentsBySubject.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {enrollmentsBySubject.map((item, index) => (
                <div key={item.name} className="flex items-center gap-2 text-sm">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <span className="text-muted-foreground">{item.name}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Info Card */}
      <Card className="p-4 bg-gradient-to-r from-accent/10 to-primary/10 border-accent/30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-accent" />
          </div>
          <div>
            <p className="font-semibold text-foreground">Real-time Analytics</p>
            <p className="text-sm text-muted-foreground">
              All data is synced directly from the database. Click refresh for the latest stats.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}