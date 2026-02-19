import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Timer, Trophy, Zap, ChevronRight, X, Star, Shield, Clock, Flame } from "lucide-react";
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
  playPowerUp, playGameStart, playResults, playStreak, playCombo,
} from "@/lib/quiz-sounds";
import { ScorePopup } from "@/components/quiz/ScorePopup";
import { QuizOptionButton } from "@/components/quiz/QuizOptionButton";
import { QuizTimer } from "@/components/quiz/QuizTimer";

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

  // Score popup
  const [popupScore, setPopupScore] = useState(0);
  const [popupStreak, setPopupStreak] = useState(0);
  const [popupCorrect, setPopupCorrect] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const [popupKey, setPopupKey] = useState(0);

  // Power-ups
  const [powerUps, setPowerUps] = useState<PowerUp[]>(INITIAL_POWERUPS);
  const [activeDoubleJeopardy, setActiveDoubleJeopardy] = useState(false);
  const [isTimeFrozen, setIsTimeFrozen] = useState(false);
  const [hiddenOptions, setHiddenOptions] = useState<number[]>([]);

  // Leaderboard
  const [leaderboard, setLeaderboard] = useState<{ name: string; score: number }[]>([]);
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  // Multiplier text
  const streakMultiplier = streak >= 5 ? 3 : streak >= 3 ? 2 : 1;

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
        setQuestions(qRes.data.map((q) => ({
          ...q,
          options: Array.isArray(q.options) ? (q.options as string[]) : [],
        })));
      }

      // Load leaderboard
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
          .select("user_id, full_name")
          .in("user_id", userIds);

        const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));
        const bestByUser = new Map<string, typeof results[0]>();
        results.forEach((r) => {
          const existing = bestByUser.get(r.user_id);
          if (!existing || r.score > existing.score) bestByUser.set(r.user_id, r);
        });

        setLeaderboard(
          [...bestByUser.values()]
            .sort((a, b) => b.score - a.score)
            .slice(0, 5)
            .map((r) => ({
              name: profileMap.get(r.user_id)?.full_name || "Student",
              score: r.score,
            }))
        );
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
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [gameState, currentIndex]);

  // Freeze timer effect
  useEffect(() => {
    if (isTimeFrozen && timerRef.current) clearInterval(timerRef.current);
  }, [isTimeFrozen]);

  const usePowerUp = (id: PowerUp["id"]) => {
    const pu = powerUps.find((p) => p.id === id);
    if (!pu || pu.used || gameState !== "playing") return;
    playPowerUp();
    setPowerUps((prev) => prev.map((p) => (p.id === id ? { ...p, used: true } : p)));

    if (id === "double_jeopardy") setActiveDoubleJeopardy(true);
    else if (id === "time_freeze") setIsTimeFrozen(true);
    else if (id === "fifty_fifty") {
      const current = questions[currentIndex];
      const wrongIndices = current.options
        .map((o, i) => (o !== current.correct_answer ? i : -1))
        .filter((i) => i !== -1);
      setHiddenOptions(wrongIndices.sort(() => Math.random() - 0.5).slice(0, 2));
    }
  };

  const handleAnswer = useCallback(
    (answer: string | null) => {
      if (gameState !== "playing") return;
      if (timerRef.current) clearInterval(timerRef.current);

      const current = questions[currentIndex];
      const isCorrect = answer === current.correct_answer;
      const timeBonus = isCorrect ? Math.round((timeLeft / QUESTION_TIME) * 500) : 0;
      const djMultiplier = activeDoubleJeopardy ? 2 : 1;
      const newStreak = isCorrect ? streak + 1 : 0;
      const streakMult = newStreak >= 5 ? 3 : newStreak >= 3 ? 2 : 1;
      const questionScore = isCorrect ? (1000 + timeBonus) * djMultiplier * streakMult : 0;

      if (isCorrect) {
        playCorrect();
        if (newStreak >= 3) {
          setTimeout(() => playStreak(), 300);
          confetti({ particleCount: 30, spread: 40, origin: { y: 0.5 }, colors: ["#FFD700", "#FFA500"] });
        }
        if (newStreak >= 5) setTimeout(() => playCombo(), 500);
      } else {
        playWrong();
      }

      // Show score popup
      setPopupScore(questionScore);
      setPopupStreak(newStreak);
      setPopupCorrect(isCorrect);
      setPopupKey((k) => k + 1);
      setShowPopup(true);
      setTimeout(() => setShowPopup(false), 1300);

      setSelectedAnswer(answer);
      setScore((s) => s + questionScore);

      if (isCorrect) {
        setStreak(newStreak);
        setBestStreak((best) => Math.max(best, newStreak));
      } else {
        setStreak(0);
      }

      setAnswers((a) => [...a, { correct: isCorrect, timeBonus }]);
      setGameState("feedback");
    },
    [gameState, currentIndex, questions, timeLeft, activeDoubleJeopardy, streak]
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
    setTimeout(() => confetti({ particleCount: 100, spread: 120, origin: { y: 0.4, x: 0.3 } }), 300);
    setTimeout(() => confetti({ particleCount: 100, spread: 120, origin: { y: 0.4, x: 0.7 } }), 600);

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
      <div className="fixed inset-0 bg-background flex items-center justify-center z-50">
        <div className="text-center space-y-4">
          <div className="w-20 h-20 rounded-full bg-accent/20 flex items-center justify-center mx-auto animate-pulse">
            <Zap className="w-10 h-10 text-accent" />
          </div>
          <p className="text-foreground text-xl font-bold animate-pulse">Loading Quiz...</p>
        </div>
      </div>
    );
  }

  // --- COUNTDOWN ---
  if (gameState === "countdown") {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center z-50">
        <div className="text-center space-y-6 animate-fade-up">
          <h2 className="text-foreground text-2xl font-bold">{quiz?.title}</h2>
          <p className="text-muted-foreground">{questions.length} questions</p>
          <div className={cn(
            "w-36 h-36 rounded-full flex items-center justify-center mx-auto",
            "bg-accent shadow-[0_0_60px_hsl(var(--accent)/0.4)]",
            countdown > 0 ? "animate-countdown-pulse" : "animate-bounce"
          )}>
            <span className="text-7xl font-black text-accent-foreground">
              {countdown || "GO!"}
            </span>
          </div>
          <div className="flex justify-center gap-3 mt-6">
            {INITIAL_POWERUPS.map((pu) => (
              <div key={pu.id} className="flex flex-col items-center gap-1 text-muted-foreground">
                <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
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
      <div className="fixed inset-0 bg-background flex items-center justify-center z-50 p-4 overflow-y-auto">
        <div className="w-full max-w-lg space-y-4 py-8">
          <Card className="bg-card border-border p-8 text-center space-y-6 animate-fade-up">
            <div className="w-24 h-24 rounded-full bg-accent/20 flex items-center justify-center mx-auto animate-bounce">
              <Trophy className="w-12 h-12 text-accent" />
            </div>

            <div>
              <h1 className="text-3xl font-black text-foreground">Quiz Complete!</h1>
              <p className="text-muted-foreground mt-1">{quiz?.title}</p>
            </div>

            <div className="grid grid-cols-3 gap-4">
              {[
                { value: grade, label: "Grade", highlight: true },
                { value: `${correctCount}/${questions.length}`, label: "Correct" },
                { value: `${percentage}%`, label: "Score" },
              ].map((item, i) => (
                <div key={i} className="bg-secondary rounded-xl p-4" style={{ animationDelay: `${i * 100 + 200}ms` }}>
                  <p className={cn("text-3xl font-black", item.highlight ? "text-accent" : "text-foreground")}>
                    {item.value}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{item.label}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-secondary/50 rounded-xl p-3 flex items-center gap-2">
                <Zap className="w-5 h-5 text-accent" />
                <div className="text-left">
                  <p className="font-black text-foreground">{xpEarned} XP</p>
                  <p className="text-xs text-muted-foreground">earned</p>
                </div>
              </div>
              <div className="bg-secondary/50 rounded-xl p-3 flex items-center gap-2">
                <Star className="w-5 h-5 text-accent" />
                <div className="text-left">
                  <p className="font-black text-foreground">{bestStreak}🔥</p>
                  <p className="text-xs text-muted-foreground">best streak</p>
                </div>
              </div>
            </div>

            <div className="bg-secondary/30 rounded-xl p-3">
              <p className="text-sm font-bold text-foreground mb-1">Total Score</p>
              <p className="text-4xl font-black text-accent">{score.toLocaleString()}</p>
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
                      {i === 0 ? "👑" : i + 1}
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
    <div className="fixed inset-0 bg-background z-50 flex flex-col">
      {/* Score popup */}
      <ScorePopup key={popupKey} score={popupScore} streak={popupStreak} isCorrect={popupCorrect} show={showPopup} />

      {/* Top Bar */}
      <div className="flex items-center gap-3 px-4 py-3 bg-card/50 border-b border-border/30">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground">
          <X className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <Progress value={progressPercent} className="h-2.5" />
        </div>
        <Badge variant="secondary" className="gap-1">
          <span className="text-xs font-bold">{currentIndex + 1}/{questions.length}</span>
        </Badge>
      </div>

      {/* Score & Streak & Timer */}
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-accent" />
          <span className="text-foreground font-black text-lg tabular-nums">{score.toLocaleString()}</span>
          {activeDoubleJeopardy && (
            <Badge className="bg-accent/30 text-accent border-accent/40 text-xs gap-0.5 animate-pulse">
              <Flame className="w-3 h-3" /> 2×
            </Badge>
          )}
        </div>

        {streak >= 2 && (
          <div className="flex items-center gap-1">
            <Badge className={cn(
              "border-accent/30 gap-1 font-bold",
              streak >= 5 ? "bg-accent text-accent-foreground animate-pulse" : "bg-accent/20 text-accent"
            )}>
              🔥 {streak} {streakMultiplier > 1 && `(${streakMultiplier}×)`}
            </Badge>
          </div>
        )}

        <QuizTimer timeLeft={timeLeft} totalTime={QUESTION_TIME} isFrozen={isTimeFrozen} />
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
                ? "bg-muted text-muted-foreground/40 cursor-not-allowed line-through"
                : "bg-secondary text-foreground hover:bg-accent/20 hover:text-accent hover:scale-105 active:scale-95"
            )}
          >
            <pu.icon className="w-3.5 h-3.5" />
            {pu.label}
          </button>
        ))}
      </div>

      {/* Question */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 pb-4 overflow-auto">
        <div className="w-full max-w-2xl space-y-6">
          <div className={cn(
            "bg-card rounded-2xl p-6 md:p-8 border border-border shadow-lg",
            gameState === "playing" && "animate-fade-up"
          )}>
            <h2 className="text-xl md:text-2xl font-bold text-foreground text-center leading-relaxed">
              {currentQuestion?.question}
            </h2>
          </div>

          {/* Options Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {currentQuestion?.options.map((option, i) => (
              <QuizOptionButton
                key={`${currentIndex}-${i}`}
                option={option}
                index={i}
                correctAnswer={currentQuestion.correct_answer}
                selectedAnswer={selectedAnswer}
                isFeedback={gameState === "feedback"}
                isHidden={hiddenOptions.includes(i)}
                onSelect={handleAnswer}
                animationDelay={i * 80}
              />
            ))}
          </div>

          {/* Next Button */}
          {gameState === "feedback" && (
            <div className="flex justify-center animate-fade-up">
              <Button variant="gold" size="lg" onClick={nextQuestion} className="gap-2 shadow-lg">
                {currentIndex + 1 >= questions.length ? "See Results 🏆" : "Next Question"}
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
            className="fixed bottom-4 right-4 w-11 h-11 rounded-full bg-accent flex items-center justify-center text-accent-foreground shadow-lg hover:scale-110 transition-transform z-50"
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
                    )}>{i === 0 ? "👑" : i + 1}</span>
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
