import { useEffect, useState } from "react";
import { TrendingUp, Users, BookOpen, Video } from "lucide-react";
import { Card } from "@/components/ui/card";
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
  LineChart,
  Line,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";

interface EnrollmentBySubject {
  name: string;
  count: number;
}

const COLORS = ["hsl(43, 90%, 55%)", "hsl(220, 45%, 22%)", "hsl(25, 50%, 35%)", "hsl(40, 30%, 96%)", "hsl(220, 40%, 28%)"];

export function AnalyticsDashboard() {
  const [enrollmentsBySubject, setEnrollmentsBySubject] = useState<EnrollmentBySubject[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Mock data for demonstration
  const weeklyEnrollments = [
    { week: "Week 1", enrollments: 12 },
    { week: "Week 2", enrollments: 19 },
    { week: "Week 3", enrollments: 15 },
    { week: "Week 4", enrollments: 28 },
  ];

  const classAttendance = [
    { month: "Jan", attendance: 85 },
    { month: "Feb", attendance: 88 },
    { month: "Mar", attendance: 92 },
    { month: "Apr", attendance: 87 },
    { month: "May", attendance: 90 },
    { month: "Jun", attendance: 94 },
  ];

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    setIsLoading(true);
    try {
      // Fetch enrollments grouped by subject
      const { data: subjects } = await supabase
        .from("subjects")
        .select("id, name");

      const subjectEnrollments = await Promise.all(
        (subjects || []).map(async (subject) => {
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

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Analytics Dashboard</h1>
        <p className="text-muted-foreground">Track enrollment and engagement metrics</p>
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

        {/* Class Attendance Trend */}
        <Card className="p-6 bg-card border-border lg:col-span-2">
          <h3 className="text-lg font-semibold text-foreground mb-4">Class Attendance Trend</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={classAttendance}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" />
                <YAxis stroke="hsl(var(--muted-foreground))" domain={[0, 100]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                  formatter={(value) => [`${value}%`, "Attendance"]}
                />
                <Line
                  type="monotone"
                  dataKey="attendance"
                  stroke="hsl(220, 45%, 22%)"
                  strokeWidth={2}
                  dot={{ fill: "hsl(43, 90%, 55%)", strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Info Card */}
      <Card className="p-4 bg-accent/10 border-accent/30">
        <p className="text-sm text-foreground">
          <strong>📊 Note:</strong> Analytics data is based on actual enrollments and class records.
          Some charts show sample data for demonstration purposes.
        </p>
      </Card>
    </div>
  );
}
