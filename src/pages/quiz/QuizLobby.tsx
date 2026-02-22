import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Trophy, Clock, HelpCircle, Play, RotateCcw, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface QuizInfo {
  id: string;
  title: string;
  sound_theme: string;
  class?: { title: string; description: string | null } | null;
}

interface LeaderboardEntry {
  name: string;
  avatar_url: string | null;
  score: number;
  total: number;
}

interface InProgressAttempt {
  id: string;
  current_question_index: number;
  score: number;
}

export function QuizLobby() {
  const { quizId } = useParams<{ quizId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [quiz, setQuiz] = useState<QuizInfo | null>(null);
  const [questionCount, setQuestionCount] = useState(0);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [inProgress, setInProgress] = useState<InProgressAttempt | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!quizId) return;
    const load = async () => {
      // Fetch quiz, questions count, leaderboard, and in-progress attempt in parallel
      const [quizRes, qCountRes, resultsRes, attemptRes] = await Promise.all([
        supabase.from("quizzes").select("id, title, sound_theme, class:classes(title, description)").eq("id", quizId).single(),
        supabase.from("quiz_questions").select("id").eq("quiz_id", quizId),
        supabase.from("quiz_results").select("score, total_questions, user_id").eq("quiz_id", quizId).order("score", { ascending: false }).limit(20),
        user ? supabase.from("quiz_attempts").select("id, current_question_index, score").eq("quiz_id", quizId).eq("user_id", user.id).eq("status", "in-progress").limit(1) : Promise.resolve({ data: null }),
      ]);

      if (quizRes.data) setQuiz(quizRes.data as unknown as QuizInfo);
      setQuestionCount(qCountRes.data?.length || 0);

      // Check in-progress attempt
      if (attemptRes.data && attemptRes.data.length > 0) {
        setInProgress(attemptRes.data[0] as InProgressAttempt);
      }

      // Build leaderboard (top 5 unique users)
      if (resultsRes.data && resultsRes.data.length > 0) {
        const userIds = [...new Set(resultsRes.data.map((r) => r.user_id))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name, avatar_url")
          .in("user_id", userIds);

        const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));
        const bestByUser = new Map<string, (typeof resultsRes.data)[0]>();
        resultsRes.data.forEach((r) => {
          const existing = bestByUser.get(r.user_id);
          if (!existing || r.score > existing.score) bestByUser.set(r.user_id, r);
        });

        setLeaderboard(
          [...bestByUser.values()]
            .sort((a, b) => b.score - a.score)
            .slice(0, 5)
            .map((r) => {
              const p = profileMap.get(r.user_id);
              return {
                name: p?.full_name || "Student",
                avatar_url: p?.avatar_url || null,
                score: r.score,
                total: r.total_questions,
              };
            })
        );
      }

      setIsLoading(false);
    };
    load();
  }, [quizId, user]);

  const handleStart = () => {
    if (inProgress) {
      navigate(`/quiz/${quizId}/play?resume=${inProgress.id}`);
    } else {
      navigate(`/quiz/${quizId}/play`);
    }
  };

  const estimatedTime = Math.ceil((questionCount * 25) / 60); // ~25s per question

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-4">
            <Skeleton className="h-48" />
            <Skeleton className="h-14" />
          </div>
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <Button variant="ghost" onClick={() => navigate(-1)} className="text-muted-foreground">
        ← Back to Quizzes
      </Button>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Left - Quiz Info */}
        <div className="md:col-span-2 space-y-6">
          <Card className="p-6 md:p-8 bg-card border-border space-y-4">
            <div className="space-y-2">
              <Badge variant="secondary" className="gap-1">
                <HelpCircle className="w-3 h-3" />
                Quiz
              </Badge>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">{quiz?.title}</h1>
              {quiz?.class?.description && (
                <p className="text-muted-foreground">{quiz.class.description}</p>
              )}
            </div>

            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <HelpCircle className="w-4 h-4 text-accent" />
                <span>{questionCount} Questions</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="w-4 h-4 text-accent" />
                <span>~{estimatedTime} min</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Zap className="w-4 h-4 text-accent" />
                <span>4 Power-ups</span>
              </div>
            </div>

            {inProgress && (
              <Card className="p-4 bg-accent/10 border-accent/20">
                <div className="flex items-center gap-3">
                  <RotateCcw className="w-5 h-5 text-accent" />
                  <div className="flex-1">
                    <p className="font-medium text-foreground">You have a saved attempt</p>
                    <p className="text-sm text-muted-foreground">
                      Question {inProgress.current_question_index + 1} of {questionCount} • Score: {inProgress.score}
                    </p>
                  </div>
                </div>
              </Card>
            )}
          </Card>

          {/* Start Button */}
          <Button
            variant="gold"
            size="lg"
            className="w-full text-lg py-6 gap-2 animate-pulse hover:animate-none shadow-lg"
            onClick={handleStart}
          >
            <Play className="w-6 h-6" />
            {inProgress ? "Resume Quiz" : "Start Quiz"}
          </Button>
        </div>

        {/* Right - Leaderboard */}
        <Card className="p-6 bg-card border-border">
          <h3 className="font-bold text-foreground flex items-center gap-2 mb-4">
            <Trophy className="w-5 h-5 text-accent" />
            Top Scholars
          </h3>

          {leaderboard.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Trophy className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No attempts yet.</p>
              <p className="text-xs">Be the first!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {leaderboard.map((entry, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${
                    i === 0 ? "bg-accent text-accent-foreground" :
                    i === 1 ? "bg-secondary text-foreground" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {i === 0 ? "👑" : i + 1}
                  </span>
                  <Avatar className="w-7 h-7">
                    <AvatarFallback className="text-[10px] bg-secondary text-foreground">
                      {entry.name.split(" ").map((n) => n[0]).join("")}
                    </AvatarFallback>
                  </Avatar>
                  <span className="flex-1 font-medium text-foreground text-sm truncate">{entry.name}</span>
                  <span className="font-bold text-sm text-accent">{entry.score}/{entry.total}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
