import { useEffect, useState, useCallback, useMemo } from "react";
import { motion, useMotionValue, useTransform } from "framer-motion";
import {
  ArrowLeft,
  Check,
  RefreshCw,
  Sparkles,
  Layers,
  Flame,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useGamification } from "@/hooks/useGamification";
import { useNavigate } from "react-router-dom";
import { playSwoosh } from "@/lib/swipe-sounds";

interface Flashcard {
  id: string;
  front_text: string;
  back_text: string;
  sort_order: number;
}

const SWIPE_THRESHOLD = 80;
const VELOCITY_THRESHOLD = 400;
const XP_PER_GOT_IT = 10;

export function FlashcardSwipeEngine() {
  const { user } = useAuth();
  const { recordActivity } = useGamification();
  const navigate = useNavigate();

  const [allCards, setAllCards] = useState<Flashcard[]>([]);
  const [queue, setQueue] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [knownCount, setKnownCount] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);
  const [reviewPile, setReviewPile] = useState<Flashcard[]>([]);
  const [streak, setStreak] = useState(0);
  const [xp, setXp] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isComplete, setIsComplete] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [swipeDirection, setSwipeDirection] = useState<"left" | "right" | null>(null);

  const x = useMotionValue(0);
  const rotate = useTransform(x, [-250, 0, 250], [-12, 0, 12]);
  const cardOpacity = useTransform(x, [-250, -150, 0, 150, 250], [0.6, 0.85, 1, 0.85, 0.6]);
  const gotItOpacity = useTransform(x, [0, SWIPE_THRESHOLD], [0, 1]);
  const reviewOpacity = useTransform(x, [-SWIPE_THRESHOLD, 0], [1, 0]);

  const deckId = useMemo(
    () => new URLSearchParams(window.location.search).get("deck"),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      let q = supabase
        .from("flashcards")
        .select("id, front_text, back_text, sort_order, deck_id")
        .order("sort_order");
      if (deckId) q = q.eq("deck_id", deckId);

      const { data, error } = await q;
      if (cancelled) return;
      if (error) console.error("[Flashcards] load failed", error);

      const cleaned = (data || []).filter(
        (c: any) =>
          typeof c.front_text === "string" &&
          c.front_text.trim() !== "" &&
          typeof c.back_text === "string" &&
          c.back_text.trim() !== "",
      );
      setAllCards(cleaned);
      setQueue(cleaned);
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [deckId]);

  const saveProgress = useCallback(
    (flashcardId: string, status: "known" | "review") => {
      if (!user) return;
      supabase
        .from("flashcard_progress")
        .upsert(
          {
            user_id: user.id,
            flashcard_id: flashcardId,
            status,
            reviewed_at: new Date().toISOString(),
          },
          { onConflict: "user_id,flashcard_id" },
        )
        .then(({ error }) => {
          if (error) console.error("Progress save error:", error);
        });
    },
    [user],
  );

  const advance = useCallback(() => {
    x.set(0);
    setIsFlipped(false);
    setSwipeDirection(null);
    setCurrentIndex((i) => {
      const next = i + 1;
      if (next >= queue.length) {
        setIsComplete(true);
        setIsAnimating(false);
        return i;
      }
      setIsAnimating(false);
      return next;
    });
  }, [queue.length, x]);

  const answer = useCallback(
    (direction: "left" | "right") => {
      if (isAnimating || isComplete) return;
      const card = queue[currentIndex];
      if (!card) return;

      setIsAnimating(true);
      setSwipeDirection(direction);
      playSwoosh(direction);

      if (direction === "right") {
        setKnownCount((c) => c + 1);
        setStreak((s) => s + 1);
        setXp((v) => v + XP_PER_GOT_IT);
        saveProgress(card.id, "known");
        // Fire-and-forget: award XP + update daily streak server-side.
        void recordActivity("flashcard_known", XP_PER_GOT_IT, {
          id: card.id,
          type: "flashcard",
        });
      } else {
        setReviewCount((c) => c + 1);
        setStreak(0);
        setReviewPile((p) => (p.some((r) => r.id === card.id) ? p : [...p, card]));
        saveProgress(card.id, "review");
      }

      // Advance after the exit animation duration. This guarantees the next
      // card mounts even if framer-motion's onAnimationComplete does not fire
      // (e.g. when the element unmounts mid-transition).
      window.setTimeout(advance, 340);
    },
    [isAnimating, isComplete, queue, currentIndex, saveProgress, recordActivity, advance],
  );


  const handleDragEnd = useCallback(
    (_: any, info: { offset: { x: number }; velocity: { x: number } }) => {
      if (isAnimating) return;
      const swipe = info.offset.x;
      const velocity = Math.abs(info.velocity.x);
      if (swipe > SWIPE_THRESHOLD || (swipe > 40 && velocity > VELOCITY_THRESHOLD)) {
        answer("right");
      } else if (swipe < -SWIPE_THRESHOLD || (swipe < -40 && velocity > VELOCITY_THRESHOLD)) {
        answer("left");
      }
    },
    [answer, isAnimating],
  );

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isLoading || isComplete) return;
      if (isAnimating) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setIsFlipped((f) => !f);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        answer("right");
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        answer("left");
      } else if (e.key === "Escape") {
        navigate("/dashboard/classes");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isAnimating, isLoading, isComplete, answer, navigate]);

  const restart = (cards: Flashcard[]) => {
    setQueue(cards);
    setCurrentIndex(0);
    setKnownCount(0);
    setReviewCount(0);
    setReviewPile([]);
    setStreak(0);
    setXp(0);
    setIsComplete(false);
    setIsAnimating(false);
    setSwipeDirection(null);
    setIsFlipped(false);
    x.set(0);
  };

  /* Loading */
  if (isLoading) {
    return (
      <div className="min-h-[100dvh] bg-secondary/30 flex items-center justify-center p-4">
        <div className="space-y-6 w-full max-w-sm text-center">
          <Skeleton className="h-72 sm:h-80 rounded-3xl mx-auto w-full" />
          <Skeleton className="h-10 w-48 rounded-full mx-auto" />
        </div>
      </div>
    );
  }

  /* Empty */
  if (queue.length === 0) {
    return (
      <div className="min-h-[100dvh] bg-secondary/30 flex items-center justify-center p-4">
        <Card className="p-10 sm:p-14 text-center rounded-3xl border-0 shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-card/60 backdrop-blur-lg max-w-md w-full space-y-5">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-secondary/60 flex items-center justify-center mx-auto">
            <Layers className="w-8 h-8 sm:w-10 sm:h-10 text-muted-foreground" strokeWidth={1.5} />
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-foreground">
            No flashcards available yet
          </h2>
          <p className="text-muted-foreground text-sm">
            Published flashcards from your enrolled classes will appear here once your tutors add
            them.
          </p>
          <Button
            variant="ghost"
            className="rounded-full"
            onClick={() => navigate("/dashboard/classes")}
          >
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Decks
          </Button>
        </Card>
      </div>
    );
  }

  /* Complete */
  if (isComplete) {
    const total = knownCount + reviewCount;
    const accuracy = total ? Math.round((knownCount / total) * 100) : 0;
    return (
      <div className="min-h-[100dvh] bg-secondary/30 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          className="w-full max-w-md"
        >
          <Card className="p-8 sm:p-10 text-center rounded-3xl border-0 shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-card/60 backdrop-blur-lg space-y-6">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Sparkles className="w-8 h-8 sm:w-10 sm:h-10 text-primary" strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground">
                Session complete!
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {accuracy}% mastery · +{xp} XP
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <StatTile value={knownCount} label="Got it" tone="primary" />
              <StatTile value={reviewCount} label="Review" tone="muted" />
              <StatTile value={xp} label="XP" tone="accent" icon={<Zap className="w-3.5 h-3.5" />} />
            </div>
            <Progress
              value={accuracy}
              className="h-2.5 rounded-full"
              aria-label={`Mastery ${accuracy}%`}
            />
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                variant="outline"
                className="flex-1 rounded-full border-0 bg-secondary/50"
                onClick={() => navigate("/dashboard/classes")}
              >
                Back to Flashcards
              </Button>
              {reviewPile.length > 0 ? (
                <Button
                  className="flex-1 rounded-full"
                  onClick={() => restart(reviewPile)}
                >
                  <RefreshCw className="w-4 h-4 mr-2" strokeWidth={1.5} />
                  Review {reviewPile.length} missed
                </Button>
              ) : (
                <Button
                  className="flex-1 rounded-full"
                  onClick={() => restart(allCards)}
                >
                  <RefreshCw className="w-4 h-4 mr-2" strokeWidth={1.5} />
                  Play again
                </Button>
              )}
            </div>
          </Card>
        </motion.div>
      </div>
    );
  }

  /* Play */
  const card = queue[currentIndex];
  const progressPercent = ((currentIndex + (swipeDirection ? 1 : 0)) / queue.length) * 100;

  return (
    <div className="min-h-[100dvh] bg-secondary/30 flex flex-col">
      {/* Top bar */}
      <div className="p-3 sm:p-4 md:p-6 flex items-center gap-3 max-w-lg mx-auto w-full">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Back to flashcards"
          className="rounded-full shrink-0 min-h-11 min-w-11"
          onClick={() => navigate("/dashboard/classes")}
        >
          <ArrowLeft className="w-5 h-5" strokeWidth={1.5} />
        </Button>
        <div className="flex-1">
          <Progress
            value={progressPercent}
            className="h-2 rounded-full"
            aria-label={`Card ${currentIndex + 1} of ${queue.length}`}
          />
        </div>
        <Badge variant="secondary" className="rounded-full px-3 text-xs shrink-0">
          {Math.min(currentIndex + 1, queue.length)}/{queue.length}
        </Badge>
      </div>

      {/* Gamification strip */}
      <div className="px-3 sm:px-4 md:px-6 flex items-center justify-center gap-2 max-w-lg mx-auto w-full -mt-1">
        <Badge
          variant="outline"
          className="rounded-full text-xs gap-1 border-border/40 bg-card/50"
          aria-label={`Streak ${streak}`}
        >
          <Flame
            className={streak > 0 ? "w-3.5 h-3.5 text-[hsl(20,90%,55%)]" : "w-3.5 h-3.5 text-muted-foreground"}
            strokeWidth={1.5}
          />
          {streak}
        </Badge>
        <Badge
          variant="outline"
          className="rounded-full text-xs gap-1 border-border/40 bg-card/50"
          aria-label={`Experience ${xp}`}
        >
          <Zap className="w-3.5 h-3.5 text-primary" strokeWidth={1.5} />
          {xp} XP
        </Badge>
      </div>

      {/* Card area */}
      <div className="flex-1 flex items-center justify-center px-4 sm:px-6 py-2">
        <div className="relative w-full max-w-[340px] sm:max-w-sm" style={{ perspective: "1200px" }}>
          {/* Swipe indicators */}
          <motion.div
            style={{ opacity: gotItOpacity }}
            className="absolute -right-2 sm:-right-4 top-1/2 -translate-y-1/2 z-10 bg-primary text-primary-foreground px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-bold shadow-[0_8px_30px_rgb(0,0,0,0.08)] pointer-events-none"
            aria-hidden="true"
          >
            Got It ✓
          </motion.div>
          <motion.div
            style={{ opacity: reviewOpacity }}
            className="absolute -left-2 sm:-left-4 top-1/2 -translate-y-1/2 z-10 bg-destructive text-destructive-foreground px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-bold shadow-[0_8px_30px_rgb(0,0,0,0.08)] pointer-events-none"
            aria-hidden="true"
          >
            Review ↺
          </motion.div>

          <motion.div
            key={card.id}
            style={!swipeDirection ? { x, rotate, opacity: cardOpacity } : undefined}
            drag={!isAnimating ? "x" : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.9}
            onDragEnd={handleDragEnd}
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={
              swipeDirection
                ? {
                    x: swipeDirection === "right" ? 380 : -380,
                    opacity: 0,
                    rotate: swipeDirection === "right" ? 18 : -18,
                    transition: { duration: 0.32, ease: "easeIn" },
                  }
                : { opacity: 1, scale: 1, y: 0, x: 0, rotate: 0 }
            }
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            className="cursor-grab active:cursor-grabbing touch-none rounded-3xl will-change-transform"

            role="button"
            tabIndex={0}
            aria-label={isFlipped ? "Answer side, tap to flip" : "Question side, tap to flip"}
            onClick={() => !isAnimating && setIsFlipped((f) => !f)}
          >
            <div
              className="relative w-full min-h-[300px] sm:min-h-[360px] md:min-h-[380px]"
              style={{
                transformStyle: "preserve-3d",
                transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
                transition: "transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
              }}
            >
              {/* Front */}
              <Card
                className="absolute inset-0 p-6 sm:p-8 md:p-10 rounded-3xl border-0 shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-card/60 backdrop-blur-lg flex items-center justify-center"
                style={{ backfaceVisibility: "hidden" }}
              >
                <div className="text-center space-y-4">
                  <Badge variant="outline" className="text-xs rounded-full px-3 border-border/20">
                    Question
                  </Badge>
                  <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-foreground leading-relaxed break-words">
                    {card.front_text}
                  </h2>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Tap to flip · Swipe or use ← / →
                  </p>
                </div>
              </Card>

              {/* Back */}
              <Card
                className="absolute inset-0 p-6 sm:p-8 md:p-10 rounded-3xl border-0 shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-primary/5 flex items-center justify-center"
                style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
              >
                <div className="text-center space-y-4">
                  <Badge className="bg-primary text-primary-foreground text-xs rounded-full px-3">
                    Answer
                  </Badge>
                  <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-foreground leading-relaxed break-words">
                    {card.back_text}
                  </h2>
                </div>
              </Card>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Bottom buttons */}
      <div className="p-4 sm:p-6 max-w-sm mx-auto w-full flex gap-3 pb-safe">
        <Button
          variant="outline"
          className="flex-1 gap-2 rounded-full h-11 sm:h-12 border-0 bg-secondary/50"
          onClick={() => answer("left")}
          disabled={isAnimating}
          aria-label="Review again"
        >
          <RefreshCw className="w-4 h-4" strokeWidth={1.5} />
          Review Again
        </Button>
        <Button
          className="flex-1 gap-2 rounded-full h-11 sm:h-12"
          onClick={() => answer("right")}
          disabled={isAnimating}
          aria-label="Got it"
        >
          <Check className="w-4 h-4" strokeWidth={1.5} />
          Got It
        </Button>
      </div>
    </div>
  );
}

function StatTile({
  value,
  label,
  tone,
  icon,
}: {
  value: number;
  label: string;
  tone: "primary" | "muted" | "accent";
  icon?: React.ReactNode;
}) {
  const valueTone =
    tone === "primary"
      ? "text-primary"
      : tone === "accent"
      ? "text-[hsl(35,90%,50%)]"
      : "text-foreground";
  return (
    <div className="bg-secondary/50 rounded-2xl p-3 sm:p-4">
      <p className={`text-2xl sm:text-3xl font-bold ${valueTone}`}>{value}</p>
      <p className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-1">
        {icon}
        {label}
      </p>
    </div>
  );
}
