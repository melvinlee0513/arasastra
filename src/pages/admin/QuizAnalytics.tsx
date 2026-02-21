import { useEffect, useState } from "react";
import { RefreshCw, HelpCircle, Target, Users, TrendingUp, Trophy, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface QuizStat {
  id: string;
  title: string;
  className: string | null;
  totalAttempts: number;
  uniquePlayers: number;
  avgScore: number;
  completionRate: number;
  topScore: number;
}

interface MissedQuestion {
  question: string;
  quizTitle: string;
  correctAnswer: string;
  missRate: number;
}

interface ScoreDistribution {
  range: string;
  count: number;
}

export function QuizAnalytics() {
  const [quizStats, setQuizStats] = useState<QuizStat[]>([]);
  const [missedQuestions, setMissedQuestions] = useState<MissedQuestion[]>([]);
  const [scoreDistribution, setScoreDistribution] = useState<ScoreDistribution[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedQuiz, setSelectedQuiz] = useState<string>("all");
  const { toast } = useToast();

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    setIsLoading(true);
    try {
      const [quizzesRes, resultsRes, questionsRes] = await Promise.all([
        supabase.from("quizzes").select("id, title, class:classes(title)"),
        supabase.from("quiz_results").select("*"),
        supabase.from("quiz_questions").select("*"),
      ]);

      const quizzes = quizzesRes.data || [];
      const results = resultsRes.data || [];
      const questions = questionsRes.data || [];

      // Build quiz stats
      const stats: QuizStat[] = quizzes.map((quiz) => {
        const quizResults = results.filter((r) => r.quiz_id === quiz.id);
        const uniqueUsers = new Set(quizResults.map((r) => r.user_id)).size;
        const quizQuestionCount = questions.filter((q) => q.quiz_id === quiz.id).length;
        const avgScore =
          quizResults.length > 0
            ? quizResults.reduce((sum, r) => sum + (r.total_questions > 0 ? (r.score / r.total_questions) * 100 : 0), 0) / quizResults.length
            : 0;
        const topScore =
          quizResults.length > 0
            ? Math.max(...quizResults.map((r) => (r.total_questions > 0 ? (r.score / r.total_questions) * 100 : 0)))
            : 0;
        const completionRate =
          quizQuestionCount > 0 && quizResults.length > 0
            ? (quizResults.filter((r) => r.total_questions === quizQuestionCount).length / quizResults.length) * 100
            : 0;

        return {
          id: quiz.id,
          title: quiz.title,
          className: (quiz.class as any)?.title || null,
          totalAttempts: quizResults.length,
          uniquePlayers: uniqueUsers,
          avgScore: Math.round(avgScore),
          completionRate: Math.round(completionRate),
          topScore: Math.round(topScore),
        };
      });

      setQuizStats(stats.sort((a, b) => b.totalAttempts - a.totalAttempts));

      // Score distribution across all quizzes
      const ranges = ["0-20%", "21-40%", "41-60%", "61-80%", "81-100%"];
      const dist: ScoreDistribution[] = ranges.map((range) => ({ range, count: 0 }));
      results.forEach((r) => {
        const pct = r.total_questions > 0 ? (r.score / r.total_questions) * 100 : 0;
        if (pct <= 20) dist[0].count++;
        else if (pct <= 40) dist[1].count++;
        else if (pct <= 60) dist[2].count++;
        else if (pct <= 80) dist[3].count++;
        else dist[4].count++;
      });
      setScoreDistribution(dist);

      // Most-missed questions (simulated from score data — we approximate by low-scoring quizzes)
      // Since we don't track per-question answers, we show questions from quizzes with lowest avg scores
      const lowScoreQuizIds = stats
        .filter((s) => s.totalAttempts > 0)
        .sort((a, b) => a.avgScore - b.avgScore)
        .slice(0, 5)
        .map((s) => s.id);

      const missed: MissedQuestion[] = questions
        .filter((q) => lowScoreQuizIds.includes(q.quiz_id))
        .slice(0, 10)
        .map((q) => {
          const quiz = quizzes.find((qz) => qz.id === q.quiz_id);
          const quizResults = results.filter((r) => r.quiz_id === q.quiz_id);
          const avgPct =
            quizResults.length > 0
              ? quizResults.reduce((sum, r) => sum + (r.total_questions > 0 ? (r.score / r.total_questions) * 100 : 0), 0) / quizResults.length
              : 50;
          return {
            question: q.question,
            quizTitle: quiz?.title || "Unknown",
            correctAnswer: q.correct_answer,
            missRate: Math.round(100 - avgPct),
          };
        });

      setMissedQuestions(missed);
    } catch (error) {
      console.error("Error fetching quiz analytics:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchAnalytics();
    setIsRefreshing(false);
    toast({ title: "✅ Refreshed", description: "Quiz analytics updated" });
  };

  const filteredStats =
    selectedQuiz === "all" ? quizStats : quizStats.filter((s) => s.id === selectedQuiz);

  const totalAttempts = quizStats.reduce((s, q) => s + q.totalAttempts, 0);
  const totalPlayers = new Set(quizStats.flatMap((q) => Array(q.uniquePlayers).fill(q.id))).size; // approximation
  const overallAvg =
    quizStats.length > 0
      ? Math.round(quizStats.reduce((s, q) => s + q.avgScore, 0) / quizStats.filter((q) => q.totalAttempts > 0).length || 0)
      : 0;

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Quiz Analytics</h1>
          <p className="text-muted-foreground">
            Completion rates, scores & most-missed questions
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedQuiz} onValueChange={setSelectedQuiz}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by quiz" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Quizzes</SelectItem>
              {quizStats.map((q) => (
                <SelectItem key={q.id} value={q.id}>
                  {q.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 border-border">
          <div className="flex items-center gap-2 mb-2">
            <HelpCircle className="w-5 h-5 text-primary" />
            <span className="text-2xl font-bold text-foreground">{quizStats.length}</span>
          </div>
          <p className="text-xs text-muted-foreground">Total Quizzes</p>
        </Card>
        <Card className="p-4 border-border">
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-5 h-5 text-accent" />
            <span className="text-2xl font-bold text-foreground">{totalAttempts}</span>
          </div>
          <p className="text-xs text-muted-foreground">Total Attempts</p>
        </Card>
        <Card className="p-4 border-border">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            <span className="text-2xl font-bold text-foreground">{overallAvg}%</span>
          </div>
          <p className="text-xs text-muted-foreground">Average Score</p>
        </Card>
        <Card className="p-4 border-border">
          <div className="flex items-center gap-2 mb-2">
            <Trophy className="w-5 h-5 text-accent" />
            <span className="text-2xl font-bold text-foreground">
              {quizStats.length > 0 ? Math.max(...quizStats.map((q) => q.topScore)) : 0}%
            </span>
          </div>
          <p className="text-xs text-muted-foreground">Highest Score</p>
        </Card>
      </div>

      {/* Charts + Table */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Score Distribution */}
        <Card className="p-6 border-border">
          <h3 className="text-lg font-semibold text-foreground mb-4">Score Distribution</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={scoreDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="range" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Per-Quiz Performance */}
        <Card className="p-6 border-border">
          <h3 className="text-lg font-semibold text-foreground mb-4">Quiz Performance</h3>
          <div className="space-y-4 max-h-64 overflow-y-auto">
            {filteredStats.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-8">No quiz data yet</p>
            ) : (
              filteredStats.map((quiz) => (
                <div key={quiz.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{quiz.title}</p>
                      {quiz.className && (
                        <p className="text-xs text-muted-foreground">{quiz.className}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">{quiz.totalAttempts} plays</Badge>
                      <Badge variant="outline" className="text-xs">{quiz.avgScore}% avg</Badge>
                    </div>
                  </div>
                  <Progress value={quiz.avgScore} className="h-2" />
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Most-Missed Questions */}
      <Card className="p-6 border-border">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="w-5 h-5 text-destructive" />
          <h3 className="text-lg font-semibold text-foreground">
            Most-Missed Questions
          </h3>
        </div>
        {missedQuestions.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">
            No quiz attempt data yet to determine missed questions.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Question</TableHead>
                  <TableHead>Quiz</TableHead>
                  <TableHead>Correct Answer</TableHead>
                  <TableHead className="text-right">Est. Miss Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {missedQuestions.map((mq, i) => (
                  <TableRow key={i}>
                    <TableCell className="max-w-[300px] truncate font-medium">
                      {mq.question}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">{mq.quizTitle}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{mq.correctAnswer}</TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant={mq.missRate > 60 ? "destructive" : "outline"}
                        className="text-xs"
                      >
                        {mq.missRate}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
