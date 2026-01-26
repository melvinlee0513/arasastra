import { useEffect, useState } from "react";
import { Users, BookOpen, Video, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

interface Stats {
  totalStudents: number;
  totalSubjects: number;
  totalClasses: number;
  totalEnrollments: number;
}

export function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({
    totalStudents: 0,
    totalSubjects: 0,
    totalClasses: 0,
    totalEnrollments: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const [profiles, subjects, classes, enrollments] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("subjects").select("id", { count: "exact", head: true }),
        supabase.from("classes").select("id", { count: "exact", head: true }),
        supabase.from("enrollments").select("id", { count: "exact", head: true }),
      ]);

      setStats({
        totalStudents: profiles.count || 0,
        totalSubjects: subjects.count || 0,
        totalClasses: classes.count || 0,
        totalEnrollments: enrollments.count || 0,
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const statCards = [
    { title: "Total Students", value: stats.totalStudents, icon: Users, color: "text-accent" },
    { title: "Subjects", value: stats.totalSubjects, icon: BookOpen, color: "text-gold" },
    { title: "Classes", value: stats.totalClasses, icon: Video, color: "text-navy-light" },
    { title: "Enrollments", value: stats.totalEnrollments, icon: TrendingUp, color: "text-brown" },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Admin Dashboard</h1>
        <p className="text-muted-foreground">Welcome to the Arasa A+ admin portal</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, index) => (
          <Card key={index} className="p-6 bg-card border-border hover:shadow-lg transition-shadow">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-xl bg-muted ${stat.color}`}>
                <stat.icon className="w-6 h-6" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">
                  {isLoading ? "..." : stat.value}
                </p>
                <p className="text-sm text-muted-foreground">{stat.title}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6 bg-card border-border">
          <h2 className="text-lg font-semibold text-foreground mb-4">Quick Actions</h2>
          <div className="space-y-3">
            <QuickActionButton href="/admin/content" icon={BookOpen} label="Edit Landing Page" />
            <QuickActionButton href="/admin/users" icon={Users} label="Manage Users" />
            <QuickActionButton href="/admin/schedule" icon={Video} label="Schedule Class" />
          </div>
        </Card>

        <Card className="p-6 bg-card border-border">
          <h2 className="text-lg font-semibold text-foreground mb-4">Recent Activity</h2>
          <div className="space-y-3 text-muted-foreground">
            <p className="text-sm">• System initialized</p>
            <p className="text-sm">• Database connected</p>
            <p className="text-sm">• Ready for configuration</p>
          </div>
        </Card>
      </div>
    </div>
  );
}

function QuickActionButton({ href, icon: Icon, label }: { href: string; icon: any; label: string }) {
  return (
    <a
      href={href}
      className="flex items-center gap-3 p-3 rounded-xl bg-muted hover:bg-accent/10 transition-colors text-foreground"
    >
      <Icon className="w-5 h-5 text-accent" />
      <span className="font-medium">{label}</span>
    </a>
  );
}
