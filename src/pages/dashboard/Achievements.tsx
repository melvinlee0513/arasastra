import { useState } from "react";
import { Award, Trophy, Star, Sparkles, CheckCircle, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CertificateModal } from "@/components/dashboard/CertificateModal";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

interface SubjectAchievement {
  id: string;
  name: string;
  icon: string;
  progress: number; // 0–100
  completed: boolean;
}

// Mock achievements — one subject at 100% for demo
const MOCK_ACHIEVEMENTS: SubjectAchievement[] = [
  { id: "1", name: "SPM Physics", icon: "⚛️", progress: 100, completed: true },
  { id: "2", name: "SPM Mathematics", icon: "📐", progress: 72, completed: false },
  { id: "3", name: "SPM Chemistry", icon: "🧪", progress: 45, completed: false },
  { id: "4", name: "SPM Biology", icon: "🧬", progress: 18, completed: false },
];

const MILESTONE_BADGES = [
  { label: "First Quiz", icon: Star, earned: true },
  { label: "7-Day Streak", icon: Sparkles, earned: true },
  { label: "50 Flashcards", icon: CheckCircle, earned: false },
  { label: "All Subjects", icon: Trophy, earned: false },
];

export function Achievements() {
  const { profile } = useAuth();
  const [certOpen, setCertOpen] = useState(false);
  const [certSubject, setCertSubject] = useState("");

  const handleClaim = (subject: SubjectAchievement) => {
    setCertSubject(subject.name);
    setCertOpen(true);
  };

  return (
    <div className="p-4 md:p-6 space-y-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-accent/10 flex items-center justify-center">
          <Trophy className="w-5 h-5 text-accent" strokeWidth={1.5} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Achievements</h1>
          <p className="text-sm text-muted-foreground">Track your progress and earn certificates</p>
        </div>
      </div>

      {/* Milestone Badges */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Milestone Badges</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {MILESTONE_BADGES.map((badge) => (
            <Card
              key={badge.label}
              className={cn(
                "p-4 text-center rounded-2xl transition-all",
                badge.earned
                  ? "bg-card border-accent/20 shadow-[0_8px_30px_rgb(0,0,0,0.04)]"
                  : "bg-muted/30 border-border/30 opacity-60"
              )}
            >
              <div className={cn(
                "w-12 h-12 rounded-full mx-auto mb-2 flex items-center justify-center",
                badge.earned ? "bg-accent/10" : "bg-muted"
              )}>
                {badge.earned ? (
                  <badge.icon className="w-6 h-6 text-accent" strokeWidth={1.5} />
                ) : (
                  <Lock className="w-5 h-5 text-muted-foreground" strokeWidth={1.5} />
                )}
              </div>
              <p className="text-sm font-medium text-foreground">{badge.label}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {badge.earned ? "Earned" : "Locked"}
              </p>
            </Card>
          ))}
        </div>
      </section>

      {/* Subject Completion */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Subject Completion</h2>
        <div className="space-y-3">
          {MOCK_ACHIEVEMENTS.map((subject) => (
            <Card
              key={subject.id}
              className={cn(
                "p-4 rounded-2xl transition-all",
                subject.completed
                  ? "bg-card border-accent/20 shadow-[0_8px_30px_rgb(0,0,0,0.04)]"
                  : "bg-card border-border/40"
              )}
            >
              <div className="flex items-center gap-4">
                <div className="text-2xl w-10 h-10 flex items-center justify-center">{subject.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium text-foreground">{subject.name}</h3>
                    {subject.completed && (
                      <Badge className="bg-accent/15 text-accent border-0 text-[10px] gap-1">
                        <CheckCircle className="w-3 h-3" />
                        Complete
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <Progress value={subject.progress} className="h-2 flex-1" />
                    <span className="text-sm font-medium text-foreground tabular-nums w-10 text-right">
                      {subject.progress}%
                    </span>
                  </div>
                </div>
                {subject.completed && (
                  <Button
                    size="sm"
                    onClick={() => handleClaim(subject)}
                    className="rounded-full gap-1.5 shadow-[0_0_16px_hsl(var(--accent)/0.2)]"
                  >
                    <Award className="w-3.5 h-3.5" strokeWidth={1.5} />
                    Claim Certificate
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* Certificate Modal */}
      <CertificateModal
        open={certOpen}
        onClose={() => setCertOpen(false)}
        studentName={profile?.full_name || "Student"}
        subjectName={certSubject}
      />
    </div>
  );
}
