import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Timer, Trophy, Zap, ChevronRight, X, CheckCircle, XCircle, Star, Shield, Clock, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import confetti from "canvas-confetti";
import {
  playCorrect, playWrong, playCountdownTick, playTimeWarning,
  playPowerUp, playGameStart, playResults,
} from "@/lib/quiz-sounds";

interface Question {
  id: string;
  question: string;
  options: string[];
  correct_answer: string;
  sort_order: number | null;
}

interface QuizData {
  id: string;
  title: string;
  class_id: string | null;
}

interface PowerUp {
  id: "double_jeopardy" | "time_freeze" | "fifty_fifty";
  label: string;
  icon: typeof Shield;
  description: string;
  used: boolean;
}

type GameState = "loading" | "countdown" | "playing" | "feedback" | "results";

const QUESTION_TIME = 20;
const OPTION_LABELS = ["A", "B", "C", "D"];
const OPTION_COLORS = [
  "bg-[hsl(0,72%,55%)] hover:bg-[hsl(0,72%,48%)]",
  "bg-[hsl(220,72%,55%)] hover:bg-[hsl(220,72%,48%)]",
  "bg-[hsl(43,90%,50%)] hover:bg-[hsl(43,90%,43%)]",
  "bg-[hsl(150,60%,45%)] hover:bg-[hsl(150,60%,38%)]",
];
const OPTION_SHAPES = ["rounded-tl-3xl", "rounded-tr-3xl", "rounded-bl-3xl", "rounded-br-3xl"];

const INITIAL_POWERUPS: PowerUp[] = [
  { id: "double_jeopardy", label: "2× Points", icon: Flame, description: "Double points for this question", used: false },
  { id: "time_freeze", label: "Freeze", icon: Clock, description: "Freeze the timer for this question", used: false },
  { id: "fifty_fifty", label: "50/50", icon: Shield, description: "Remove two wrong answers", used: false },
];

export function QuizPlay() {
  const { quizId } = useParams<{ quizId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [quiz, setQuiz] = useState<QuizData | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [gameState, setGameState] = useState<GameState>("loading");
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(QUESTION_TIME);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [answers, setAnswers] = useState<{ correct: boolean; timeBonus: number }[]>([]);
  const [countdown, setCountdown] = useState(3);
  const [xpEarned, setXpEarned] = useState(0);

  // Power-ups
  const [powerUps, setPowerUps] = useState<PowerUp[]>(INITIAL_POWERUPS);
  const [activeDoubleJeopardy, setActiveDoubleJeopardy] = useState(false);
  const [isTimeFrozen, setIsTimeFrozen] = useState(false);
  const [hiddenOptions, setHiddenOptions] = useState<number[]>([]);

  // Leaderboard
  const [leaderboard, setLeaderboard] = useState<{ name: string; score: number; avatar?: string }[]>([]);
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load quiz data
  useEffect(() => {
    if (!quizId) return;
    const load = async () => {
      const [quizRes, qRes] = await Promise.all([
        supabase.from("quizzes").select("id, title, class_id").eq("id", quizId).single(),
        supabase.from("quiz_questions").select("*").eq("quiz_id", quizId).order("sort_order"),
      ]);
      if (quizRes.data) setQuiz(quizRes.data);
      if (qRes.data) {
        const parsed = qRes.data.map((q) => ({
          ...q,
          options: Array.isArray(q.options) ? (q.options as string[]) : [],
        }));
        setQuestions(parsed);
      }

      // Load leaderboard
      if (quizId) {
        const { data: results } = await supabase
          .from("quiz_results")
          .select("score, total_questions, user_id")
          .eq("quiz_id", quizId)
          .order("score", { ascending: false })
          .limit(10);

        if (results && results.length > 0) {
          const userIds = [...new Set(results.map((r) => r.user_id))];
          const { data: profiles } = await supabase
            .from("profiles")
            .select("user_id, full_name, avatar_url")
            .in("user_id", userIds);

          const profileMap = new Map(
            (profiles || []).map((p) => [p.user_id, p])
          );

          // Keep best score per user
          const bestByUser = new Map<string, typeof results[0]>();
          results.forEach((r) => {
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
                  score: r.score,
                  avatar: p?.avatar_url || undefined,
                };
              })
          );
        }
      }

      setGameState("countdown");
    };
    load();
  }, [quizId]);

  // Countdown
  useEffect(() => {
    if (gameState !== "countdown") return;
    if (countdown <= 0) {
      playGameStart();
      setGameState("playing");
      return;
    }
    playCountdownTick();
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [gameState, countdown]);

  // Question timer
  useEffect(() => {
    if (gameState !== "playing") return;
    setTimeLeft(QUESTION_TIME);
    setHiddenOptions([]);
    setActiveDoubleJeopardy(false);
    setIsTimeFrozen(false);

    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current!);
          handleAnswer(null);
          return 0;
        }
        if (t === 6) playTimeWarning();
        return t - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameState, currentIndex]);

  // Freeze timer effect
  useEffect(() => {
    if (isTimeFrozen && timerRef.current) {
      clearInterval(timerRef.current);
    }
  }, [isTimeFrozen]);

  const usePowerUp = (id: PowerUp["id"]) => {
    const pu = powerUps.find((p) => p.id === id);
    if (!pu || pu.used || gameState !== "playing") return;

    playPowerUp();
    setPowerUps((prev) => prev.map((p) => (p.id === id ? { ...p, used: true } : p)));

    if (id === "double_jeopardy") {
      setActiveDoubleJeopardy(true);
    } else if (id === "time_freeze") {
      setIsTimeFrozen(true);
    } else if (id === "fifty_fifty") {
      const current = questions[currentIndex];
      const wrongIndices = current.options
        .map((o, i) => (o !== current.correct_answer ? i : -1))
        .filter((i) => i !== -1);
      // Randomly hide 2 wrong options
      const shuffled = wrongIndices.sort(() => Math.random() - 0.5);
      setHiddenOptions(shuffled.slice(0, 2));
    }
  };

  const handleAnswer = useCallback(
    (answer: string | null) => {
      if (gameState !== "playing") return;
      if (timerRef.current) clearInterval(timerRef.current);

      const current = questions[currentIndex];
      const isCorrect = answer === current.correct_answer;
      const timeBonus = isCorrect ? Math.round((timeLeft / QUESTION_TIME) * 500) : 0;
      const multiplier = activeDoubleJeopardy ? 2 : 1;
      const questionScore = isCorrect ? (1000 + timeBonus) * multiplier : 0;

      if (isCorrect) {
        playCorrect();
      } else {
        playWrong();
      }

      setSelectedAnswer(answer);
      setScore((s) => s + questionScore);

      if (isCorrect) {
        setStreak((s) => {
          const newStreak = s + 1;
          setBestStreak((best) => Math.max(best, newStreak));
          return newStreak;
        });
      } else {
        setStreak(0);
      }

      setAnswers((a) => [...a, { correct: isCorrect, timeBonus }]);
      setGameState("feedback");
    },
    [gameState, currentIndex, questions, timeLeft, activeDoubleJeopardy]
  );

  const nextQuestion = useCallback(() => {
    if (currentIndex + 1 >= questions.length) {
      finishQuiz();
    } else {
      setCurrentIndex((i) => i + 1);
      setSelectedAnswer(null);
      setGameState("playing");
    }
  }, [currentIndex, questions.length]);

  const finishQuiz = async () => {
    setGameState("results");
    playResults();
    const correctCount = answers.filter((a) => a.correct).length + (selectedAnswer === questions[currentIndex]?.correct_answer ? 1 : 0);
    const totalXP = Math.round(score / 100) + bestStreak * 5;
    setXpEarned(totalXP);

    confetti({ particleCount: 200, spread: 80, origin: { y: 0.6 } });

    if (user && quizId) {
      await supabase.from("quiz_results").insert({
        quiz_id: quizId,
        user_id: user.id,
        score: correctCount,
        total_questions: questions.length,
      });

      const { data: profile } = await supabase
        .from("profiles")
        .select("id, xp_points")
        .eq("user_id", user.id)
        .single();
      if (profile) {
        await supabase
          .from("profiles")
          .update({ xp_points: (profile.xp_points || 0) + totalXP })
          .eq("id", profile.id);
      }
    }
  };

  const resetQuiz = () => {
    setCurrentIndex(0);
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setAnswers([]);
    setSelectedAnswer(null);
    setCountdown(3);
    setPowerUps(INITIAL_POWERUPS.map((p) => ({ ...p, used: false })));
    setHiddenOptions([]);
    setActiveDoubleJeopardy(false);
    setIsTimeFrozen(false);
    setGameState("countdown");
  };

  const currentQuestion = questions[currentIndex];
  const progressPercent = questions.length > 0 ? ((currentIndex + (gameState === "results" ? 1 : 0)) / questions.length) * 100 : 0;

  // --- LOADING ---
  if (gameState === "loading") {
    return (
      <div className="fixed inset-0 bg-navy flex items-center justify-center z-50">
        <div className="text-center space-y-4 animate-pulse">
          <Zap className="w-16 h-16 text-accent mx-auto" />
          <p className="text-primary-foreground text-xl font-bold">Loading Quiz...</p>
        </div>
      </div>
    );
  }

  // --- COUNTDOWN ---
  if (gameState === "countdown") {
    return (
      <div className="fixed inset-0 bg-navy flex items-center justify-center z-50">
        <div className="text-center space-y-6">
          <h2 className="text-primary-foreground text-2xl font-bold">{quiz?.title}</h2>
          <p className="text-primary-foreground/60">{questions.length} questions</p>
          <div className="w-32 h-32 rounded-full bg-accent flex items-center justify-center mx-auto animate-pulse">
            <span className="text-6xl font-black text-accent-foreground">
              {countdown || "GO!"}
            </span>
          </div>
          {/* Power-ups preview */}
          <div className="flex justify-center gap-3 mt-6">
            {INITIAL_POWERUPS.map((pu) => (
              <div key={pu.id} className="flex flex-col items-center gap-1 text-primary-foreground/50">
                <div className="w-10 h-10 rounded-lg bg-primary-foreground/10 flex items-center justify-center">
                  <pu.icon className="w-5 h-5" />
                </div>
                <span className="text-xs">{pu.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // --- RESULTS ---
  if (gameState === "results") {
    const correctCount = answers.filter((a) => a.correct).length;
    const percentage = Math.round((correctCount / questions.length) * 100);
    const grade =
      percentage >= 90 ? "A+" : percentage >= 80 ? "A" : percentage >= 70 ? "B" : percentage >= 60 ? "C" : percentage >= 50 ? "D" : "F";

    return (
      <div className="fixed inset-0 bg-navy flex items-center justify-center z-50 p-4 overflow-y-auto">
        <div className="w-full max-w-lg space-y-4 py-8">
          <Card className="bg-card border-border p-8 text-center space-y-6 animate-fade-up">
            <div className="w-24 h-24 rounded-full bg-accent/20 flex items-center justify-center mx-auto">
              <Trophy className="w-12 h-12 text-accent" />
            </div>

            <div>
              <h1 className="text-3xl font-black text-foreground">Quiz Complete!</h1>
              <p className="text-muted-foreground mt-1">{quiz?.title}</p>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="bg-secondary rounded-xl p-4">
                <p className="text-3xl font-black text-accent">{grade}</p>
                <p className="text-xs text-muted-foreground mt-1">Grade</p>
              </div>
              <div className="bg-secondary rounded-xl p-4">
                <p className="text-3xl font-black text-foreground">
                  {correctCount}/{questions.length}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Correct</p>
              </div>
              <div className="bg-secondary rounded-xl p-4">
                <p className="text-3xl font-black text-foreground">{percentage}%</p>
                <p className="text-xs text-muted-foreground mt-1">Score</p>
              </div>
            </div>

            <div className="flex items-center justify-center gap-6 text-sm">
              <div className="flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-accent" />
                <span className="font-bold text-foreground">{xpEarned} XP</span>
                <span className="text-muted-foreground">earned</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Star className="w-4 h-4 text-accent" />
                <span className="font-bold text-foreground">{bestStreak}</span>
                <span className="text-muted-foreground">best streak</span>
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => navigate(-1)}>
                Back
              </Button>
              <Button variant="gold" className="flex-1" onClick={resetQuiz}>
                Retry Quiz
              </Button>
            </div>
          </Card>

          {/* Leaderboard */}
          {leaderboard.length > 0 && (
            <Card className="bg-card border-border p-6 animate-fade-up" style={{ animationDelay: "200ms" }}>
              <h3 className="font-bold text-foreground flex items-center gap-2 mb-4">
                <Trophy className="w-5 h-5 text-accent" />
                Leaderboard
              </h3>
              <div className="space-y-3">
                {leaderboard.map((entry, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className={cn(
                      "w-7 h-7 rounded-full flex items-center justify-center text-xs font-black",
                      i === 0 ? "bg-accent text-accent-foreground" :
                      i === 1 ? "bg-secondary text-foreground" :
                      "bg-muted text-muted-foreground"
                    )}>
                      {i + 1}
                    </span>
                    <span className="flex-1 font-medium text-foreground text-sm truncate">{entry.name}</span>
                    <span className="font-bold text-sm text-muted-foreground">{entry.score} pts</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    );
  }

  // --- PLAYING / FEEDBACK ---
  return (
    <div className="fixed inset-0 bg-navy z-50 flex flex-col">
      {/* Top Bar */}
      <div className="flex items-center gap-3 px-4 py-3 bg-navy-light/50">
        <Button variant="ghost" size="icon-sm" onClick={() => navigate(-1)} className="text-primary-foreground/60 hover:text-primary-foreground hover:bg-primary-foreground/10">
          <X className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <Progress value={progressPercent} className="h-2 bg-primary-foreground/10" />
        </div>
        <Badge className="bg-primary-foreground/10 text-primary-foreground border-0 gap-1">
          <span className="text-xs">{currentIndex + 1}/{questions.length}</span>
        </Badge>
      </div>

      {/* Score & Streak Bar */}
      <div className="flex items-center justify-between px-6 py-2">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-accent" />
          <span className="text-primary-foreground font-bold text-sm">{score.toLocaleString()}</span>
          {activeDoubleJeopardy && (
            <Badge className="bg-accent/30 text-accent border-accent/40 text-xs gap-0.5">
              <Flame className="w-3 h-3" /> 2×
            </Badge>
          )}
        </div>
        {streak >= 2 && (
          <Badge className="bg-accent/20 text-accent border-accent/30 gap-1 animate-pulse">
            🔥 {streak} streak!
          </Badge>
        )}
        <div className="flex items-center gap-2">
          {isTimeFrozen && (
            <Badge className="bg-[hsl(200,80%,50%)]/20 text-[hsl(200,80%,70%)] border-[hsl(200,80%,50%)]/30 text-xs">
              ❄️ Frozen
            </Badge>
          )}
          <Timer className="w-4 h-4 text-primary-foreground/60" />
          <span
            className={cn(
              "font-mono font-bold text-lg",
              timeLeft <= 5 ? "text-destructive animate-pulse" : "text-primary-foreground"
            )}
          >
            {timeLeft}
          </span>
        </div>
      </div>

      {/* Power-ups Bar */}
      <div className="flex items-center justify-center gap-2 px-4 pb-2">
        {powerUps.map((pu) => (
          <button
            key={pu.id}
            disabled={pu.used || gameState !== "playing"}
            onClick={() => usePowerUp(pu.id)}
            title={pu.description}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
              pu.used
                ? "bg-primary-foreground/5 text-primary-foreground/20 cursor-not-allowed"
                : "bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20 hover:scale-105 active:scale-95"
            )}
          >
            <pu.icon className="w-3.5 h-3.5" />
            {pu.label}
          </button>
        ))}
      </div>

      {/* Question */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 pb-4">
        <div className="w-full max-w-2xl space-y-8">
          <div className="bg-primary-foreground/5 rounded-2xl p-6 md:p-8 backdrop-blur-sm border border-primary-foreground/10">
            <h2 className="text-xl md:text-2xl font-bold text-primary-foreground text-center leading-relaxed">
              {currentQuestion?.question}
            </h2>
          </div>

          {/* Options Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {currentQuestion?.options.map((option, i) => {
              const isSelected = selectedAnswer === option;
              const isCorrect = option === currentQuestion.correct_answer;
              const showFeedback = gameState === "feedback";
              const isHidden = hiddenOptions.includes(i);

              if (isHidden && gameState === "playing") {
                return (
                  <div
                    key={i}
                    className="p-4 md:p-5 rounded-2xl bg-primary-foreground/5 opacity-30 flex items-center justify-center"
                  >
                    <span className="text-primary-foreground/30 text-sm">Eliminated</span>
                  </div>
                );
              }

              return (
                <button
                  key={i}
                  disabled={gameState === "feedback" || isHidden}
                  onClick={() => handleAnswer(option)}
                  className={cn(
                    "relative flex items-center gap-3 p-4 md:p-5 rounded-2xl text-left",
                    "transition-all duration-200 transform",
                    "font-semibold text-base md:text-lg",
                    OPTION_SHAPES[i],
                    !showFeedback && "hover:scale-[1.02] active:scale-[0.98]",
                    showFeedback && isCorrect && "ring-4 ring-[hsl(150,60%,45%)] bg-[hsl(150,60%,45%)]",
                    showFeedback && isSelected && !isCorrect && "ring-4 ring-destructive opacity-60",
                    showFeedback && !isSelected && !isCorrect && "opacity-40",
                    !showFeedback && OPTION_COLORS[i],
                    "text-primary-foreground"
                  )}
                >
                  <span className="w-8 h-8 rounded-lg bg-primary-foreground/20 flex items-center justify-center text-sm font-black shrink-0">
                    {OPTION_LABELS[i]}
                  </span>
                  <span className="flex-1">{option}</span>
                  {showFeedback && isCorrect && <CheckCircle className="w-6 h-6 shrink-0" />}
                  {showFeedback && isSelected && !isCorrect && <XCircle className="w-6 h-6 shrink-0" />}
                </button>
              );
            })}
          </div>

          {/* Next Button (feedback state) */}
          {gameState === "feedback" && (
            <div className="flex justify-center animate-fade-up">
              <Button variant="gold" size="lg" onClick={nextQuestion} className="gap-2">
                {currentIndex + 1 >= questions.length ? "See Results" : "Next Question"}
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Leaderboard Toggle */}
      {leaderboard.length > 0 && (
        <>
          <button
            onClick={() => setShowLeaderboard(!showLeaderboard)}
            className="fixed bottom-4 right-4 w-10 h-10 rounded-full bg-accent flex items-center justify-center text-accent-foreground shadow-lg hover:scale-110 transition-transform z-50"
          >
            <Trophy className="w-5 h-5" />
          </button>
          {showLeaderboard && (
            <div className="fixed bottom-16 right-4 w-64 bg-card border border-border rounded-xl shadow-xl p-4 z-50 animate-fade-up">
              <h4 className="font-bold text-foreground text-sm mb-3 flex items-center gap-1.5">
                <Trophy className="w-4 h-4 text-accent" /> Leaderboard
              </h4>
              <div className="space-y-2">
                {leaderboard.map((entry, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className={cn(
                      "w-5 h-5 rounded-full flex items-center justify-center font-bold",
                      i === 0 ? "bg-accent text-accent-foreground" : "bg-secondary text-muted-foreground"
                    )}>{i + 1}</span>
                    <span className="flex-1 text-foreground truncate">{entry.name}</span>
                    <span className="text-muted-foreground font-semibold">{entry.score}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
