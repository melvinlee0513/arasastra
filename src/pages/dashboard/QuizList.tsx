import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HelpCircle, Trophy, ChevronRight, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface QuizItem {
  id: string;
  title: string;
  class?: { title: string } | null;
  questions_count: number;
  best_score?: number | null;
  total_questions?: number;
}

export function QuizList() {
  const [quizzes, setQuizzes] = useState<QuizItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    const load = async () => {
      const { data: quizData } = await supabase
        .from("quizzes")
        .select("id, title, class:classes(title)")
        .order("created_at", { ascending: false });

      // Count questions per quiz
      const { data: allQs } = await supabase.from("quiz_questions").select("quiz_id");
      const countMap: Record<string, number> = {};
      (allQs || []).forEach((q) => {
        countMap[q.quiz_id] = (countMap[q.quiz_id] || 0) + 1;
      });

      // Get user's best scores
      let scoreMap: Record<string, { score: number; total: number }> = {};
      if (user) {
        const { data: results } = await supabase
          .from("quiz_results")
          .select("quiz_id, score, total_questions")
          .eq("user_id", user.id);
        (results || []).forEach((r) => {
          const existing = scoreMap[r.quiz_id];
          if (!existing || r.score > existing.score) {
            scoreMap[r.quiz_id] = { score: r.score, total: r.total_questions };
          }
        });
      }

      setQuizzes(
        (quizData || [])
          .filter((q) => (countMap[q.id] || 0) > 0) // only show quizzes with questions
          .map((q) => ({
            ...q,
            questions_count: countMap[q.id] || 0,
            best_score: scoreMap[q.id]?.score ?? null,
            total_questions: scoreMap[q.id]?.total,
          }))
      );
      setIsLoading(false);
    };
    load();
  }, [user]);

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-foreground">Quizzes</h1>
        {Array(3).fill(0).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">Quizzes</h1>
        <p className="text-muted-foreground">Test your knowledge and earn XP!</p>
      </div>

      {quizzes.length === 0 ? (
        <Card className="p-12 text-center border-border">
          <HelpCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold text-foreground mb-2">No quizzes available</h3>
          <p className="text-sm text-muted-foreground">Check back later for new quizzes.</p>
        </Card>
      ) : (
        <div className="grid gap-4">
          {quizzes.map((quiz) => (
            <Card
              key={quiz.id}
              className="p-5 border-border hover:shadow-md hover:border-accent/30 transition-all cursor-pointer group"
              onClick={() => navigate(`/quiz/${quiz.id}`)}
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <HelpCircle className="w-6 h-6 text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground text-lg truncate">{quiz.title}</h3>
                  <div className="flex items-center gap-3 mt-1">
                    <Badge variant="secondary" className="text-xs gap-1">
                      <Clock className="w-3 h-3" />
                      {quiz.questions_count} questions
                    </Badge>
                    {quiz.class && (
                      <Badge variant="outline" className="text-xs">
                        {quiz.class.title}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {quiz.best_score !== null && quiz.best_score !== undefined && (
                    <div className="text-right">
                      <div className="flex items-center gap-1 text-accent">
                        <Trophy className="w-4 h-4" />
                        <span className="font-bold text-sm">
                          {quiz.best_score}/{quiz.total_questions}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">Best</p>
                    </div>
                  )}
                  <Button variant="gold" size="sm" className="gap-1">
                    Play <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
