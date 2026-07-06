import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  HelpCircle,
  Trophy,
  ChevronRight,
  Clock,
  AlertCircle,
  Sparkles,
  Lock,
  CheckCircle2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAccess } from "@/hooks/useAccess";
import { useToast } from "@/hooks/use-toast";

type AccessLevel = "demo" | "exclusive";

interface QuizItem {
  id: string;
  title: string;
  access_level: AccessLevel;
  class?: { title: string | null; subject_id: string | null; subject?: { name: string | null } | null } | null;
  questions_count: number;
  best_score: number | null;
  best_total: number | null;
  attempts: number;
}

interface QuizListProps {
  embedded?: boolean;
}

type FetchState = "loading" | "loaded" | "error";

export function QuizList({ embedded }: QuizListProps = {}) {
  const [quizzes, setQuizzes] = useState<QuizItem[]>([]);
  const [state, setState] = useState<FetchState>("loading");
  const navigate = useNavigate();
  const { user } = useAuth();
  const { hasAccess } = useAccess();
  const { toast } = useToast();

  const load = async () => {
    setState("loading");
    try {
      const { data: quizData, error: qErr } = await supabase
        .from("quizzes")
        .select(
          "id, title, access_level, class:classes(title, subject_id, subject:subjects(name))"
        )
        .order("created_at", { ascending: false });
      if (qErr) throw qErr;

      const { data: allQs, error: qqErr } = await supabase
        .from("quiz_questions")
        .select("quiz_id");
      if (qqErr) throw qqErr;

      const countMap: Record<string, number> = {};
      (allQs || []).forEach((q) => {
        countMap[q.quiz_id] = (countMap[q.quiz_id] || 0) + 1;
      });

      let scoreMap: Record<string, { score: number; total: number; attempts: number }> = {};
      if (user) {
        const { data: results } = await supabase
          .from("quiz_results")
          .select("quiz_id, score, total_questions")
          .eq("user_id", user.id);
        (results || []).forEach((r) => {
          const existing = scoreMap[r.quiz_id];
          if (!existing) {
            scoreMap[r.quiz_id] = { score: r.score, total: r.total_questions, attempts: 1 };
          } else {
            existing.attempts += 1;
            if (r.score > existing.score) {
              existing.score = r.score;
              existing.total = r.total_questions;
            }
          }
        });
      }

      const mapped: QuizItem[] = (quizData || [])
        .filter((q) => (countMap[q.id] || 0) > 0)
        .map((q) => ({
          id: q.id,
          title: q.title,
          access_level: (q.access_level as AccessLevel) ?? "exclusive",
          class: q.class as QuizItem["class"],
          questions_count: countMap[q.id] || 0,
          best_score: scoreMap[q.id]?.score ?? null,
          best_total: scoreMap[q.id]?.total ?? null,
          attempts: scoreMap[q.id]?.attempts ?? 0,
        }));

      setQuizzes(mapped);
      setState("loaded");
    } catch (e) {
      console.error("Quiz list load failed:", e);
      setState("error");
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const canPlay = (quiz: QuizItem) =>
    quiz.access_level === "demo" || hasAccess(quiz.class?.subject_id || "");

  const handleStart = (quiz: QuizItem) => {
    if (!canPlay(quiz)) {
      toast({
        title: "Enrollment required",
        description: "Enroll in this subject to attempt the quiz.",
      });
      return;
    }
    navigate(`/quiz/${quiz.id}/lobby`);
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (state === "loading") {
    return (
      <div className={embedded ? "space-y-4" : "p-4 md:p-6 space-y-4 max-w-4xl mx-auto"}>
        {!embedded && (
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Quizzes</h1>
            <p className="text-muted-foreground">Test your knowledge and earn XP!</p>
          </div>
        )}
        {Array(3).fill(0).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-3xl" />
        ))}
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (state === "error") {
    return (
      <div className={embedded ? "" : "p-4 md:p-6 max-w-4xl mx-auto"}>
        <Card className="p-8 text-center bg-card border-border rounded-3xl">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-destructive/10 flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-destructive" />
          </div>
          <h3 className="font-semibold text-foreground mb-1">Couldn't load quizzes</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Something went wrong. Please try again.
          </p>
          <Button onClick={load} className="rounded-full">Try again</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className={embedded ? "space-y-6" : "p-4 md:p-6 space-y-6 max-w-4xl mx-auto"}>
      {!embedded && (
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Quizzes</h1>
          <p className="text-muted-foreground">Test your knowledge and earn XP!</p>
        </div>
      )}

      {quizzes.length === 0 ? (
        <Card className="p-10 text-center border-border rounded-3xl bg-card">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-accent/10 flex items-center justify-center">
            <HelpCircle className="w-8 h-8 text-accent" />
          </div>
          <h3 className="font-semibold text-foreground mb-1">No quizzes available yet</h3>
          <p className="text-sm text-muted-foreground">
            Your tutors will publish quizzes for your enrolled subjects soon.
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 md:gap-4">
          {quizzes.map((quiz) => {
            const play = canPlay(quiz);
            const subjectName = quiz.class?.subject?.name;
            const completed = quiz.attempts > 0;
            const pct =
              quiz.best_score !== null && quiz.best_total && quiz.best_total > 0
                ? Math.round((quiz.best_score / quiz.best_total) * 100)
                : null;

            return (
              <Card
                key={quiz.id}
                className="p-4 md:p-5 border-border rounded-3xl bg-card hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:border-accent/30 transition-all group"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <HelpCircle className="w-6 h-6 text-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground text-base md:text-lg truncate">
                      {quiz.title}
                    </h3>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {subjectName && (
                        <Badge variant="secondary" className="rounded-full text-xs">
                          {subjectName}
                        </Badge>
                      )}
                      {quiz.class?.title && (
                        <Badge variant="outline" className="rounded-full text-xs">
                          {quiz.class.title}
                        </Badge>
                      )}
                      <Badge variant="secondary" className="rounded-full text-xs gap-1">
                        <Clock className="w-3 h-3" />
                        {quiz.questions_count} questions
                      </Badge>
                      {quiz.access_level === "demo" ? (
                        <Badge className="rounded-full text-xs bg-primary/15 text-primary border-0 gap-1">
                          <Sparkles className="w-3 h-3" /> Demo
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="rounded-full text-xs">
                          Exclusive
                        </Badge>
                      )}
                      {completed && (
                        <Badge className="rounded-full text-xs bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-0 gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Completed
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {pct !== null && (
                      <div className="flex items-center gap-1 text-accent">
                        <Trophy className="w-4 h-4" />
                        <span className="font-bold text-sm">{pct}%</span>
                      </div>
                    )}
                    {play ? (
                      <Button
                        size="sm"
                        className="rounded-full gap-1 h-10"
                        onClick={() => handleStart(quiz)}
                      >
                        {completed ? "Play again" : "Start"}
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full gap-1 h-10"
                        disabled
                      >
                        <Lock className="w-4 h-4" /> Locked
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
