import { useEffect, useState, useCallback } from "react";
import { motion, useMotionValue, useTransform, AnimatePresence } from "framer-motion";
import { ArrowLeft, BrainCircuit, Check, RefreshCw, Sparkles, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { playSwoosh } from "@/lib/swipe-sounds";

interface Flashcard {
  id: string;
  front_text: string;
  back_text: string;
  sort_order: number;
}

const SEED_CARDS: Flashcard[] = [
  { id: "seed-1", front_text: "What is Newton's First Law of Motion?", back_text: "An object at rest stays at rest, and an object in motion stays in motion unless acted upon by an external force.", sort_order: 1 },
  { id: "seed-2", front_text: "Define acceleration.", back_text: "The rate of change of velocity with respect to time. a = Δv / Δt", sort_order: 2 },
  { id: "seed-3", front_text: "What is Ohm's Law?", back_text: "V = IR — Voltage equals current times resistance.", sort_order: 3 },
  { id: "seed-4", front_text: "State the principle of conservation of energy.", back_text: "Energy cannot be created or destroyed, only transformed from one form to another.", sort_order: 4 },
  { id: "seed-5", front_text: "What is the formula for kinetic energy?", back_text: "KE = ½mv² where m is mass and v is velocity.", sort_order: 5 },
  { id: "seed-6", front_text: "Define wavelength.", back_text: "The distance between two consecutive points in phase on a wave (e.g., crest to crest).", sort_order: 6 },
  { id: "seed-7", front_text: "What is the relationship between frequency and period?", back_text: "f = 1/T — Frequency is the reciprocal of the period.", sort_order: 7 },
  { id: "seed-8", front_text: "State Newton's Third Law.", back_text: "For every action, there is an equal and opposite reaction.", sort_order: 8 },
  { id: "seed-9", front_text: "What is the unit of electric current?", back_text: "Ampere (A) — the SI unit of electric current.", sort_order: 9 },
  { id: "seed-10", front_text: "Define gravitational potential energy.", back_text: "GPE = mgh — Energy stored due to an object's position in a gravitational field.", sort_order: 10 },
];

const SWIPE_THRESHOLD = 80;
const VELOCITY_THRESHOLD = 400;

export function FlashcardSwipeEngine() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [knownCount, setKnownCount] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isComplete, setIsComplete] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [swipeDirection, setSwipeDirection] = useState<"left" | "right" | null>(null);

  const x = useMotionValue(0);
  const rotate = useTransform(x, [-250, 0, 250], [-12, 0, 12]);
  const cardOpacity = useTransform(x, [-250, -150, 0, 150, 250], [0.6, 0.85, 1, 0.85, 0.6]);

  // Overlay opacities
  const gotItOpacity = useTransform(x, [0, SWIPE_THRESHOLD], [0, 1]);
  const reviewOpacity = useTransform(x, [-SWIPE_THRESHOLD, 0], [1, 0]);

  // Border glow
  const borderColor = useTransform(
    x,
    [-SWIPE_THRESHOLD, -20, 0, 20, SWIPE_THRESHOLD],
    [
      "hsl(0 84% 60%)",
      "hsl(0 84% 60% / 0.2)",
      "hsl(var(--border) / 0.1)",
      "hsl(142 76% 36% / 0.2)",
      "hsl(142 76% 36%)",
    ]
  );

  useEffect(() => {
    fetchCards();
  }, []);

  const fetchCards = async () => {
    setIsLoading(true);
    const urlParams = new URLSearchParams(window.location.search);
    const deckId = urlParams.get("deck");

    let query = supabase.from("flashcards").select("*").order("sort_order");
    if (deckId) query = query.eq("deck_id", deckId);

    const { data } = await query;
    setCards(data && data.length > 0 ? data : SEED_CARDS);
    setIsLoading(false);
  };

  const saveProgress = useCallback(async (flashcardId: string, status: "known" | "review") => {
    if (!user || flashcardId.startsWith("seed-")) return;
    supabase.from("flashcard_progress").upsert(
      { user_id: user.id, flashcard_id: flashcardId, status, reviewed_at: new Date().toISOString() },
      { onConflict: "user_id,flashcard_id" }
    ).then(({ error }) => {
      if (error) console.error("Progress save error:", error);
    });
  }, [user]);

  const advanceCard = useCallback(() => {
    setIsFlipped(false);
    setIsAnimating(false);
    setSwipeDirection(null);
    x.set(0);
    if (currentIndex + 1 < cards.length) {
      setCurrentIndex((i) => i + 1);
    } else {
      setIsComplete(true);
    }
  }, [cards.length, currentIndex, x]);

  const handleSwipe = useCallback((direction: "left" | "right") => {
    if (isAnimating) return;
    const card = cards[currentIndex];
    if (!card) return;

    setIsAnimating(true);
    setSwipeDirection(direction);
    playSwoosh(direction);

    if (direction === "right") {
      setKnownCount((c) => c + 1);
      saveProgress(card.id, "known");
    } else {
      setReviewCount((c) => c + 1);
      saveProgress(card.id, "review");
    }
  }, [cards, currentIndex, saveProgress, isAnimating]);

  const handleDragEnd = useCallback((_: any, info: { offset: { x: number }; velocity: { x: number } }) => {
    if (isAnimating) return;
    const swipe = info.offset.x;
    const velocity = Math.abs(info.velocity.x);

    if (swipe > SWIPE_THRESHOLD || (swipe > 40 && velocity > VELOCITY_THRESHOLD)) {
      handleSwipe("right");
    } else if (swipe < -SWIPE_THRESHOLD || (swipe < -40 && velocity > VELOCITY_THRESHOLD)) {
      handleSwipe("left");
    }
  }, [handleSwipe, isAnimating]);

  /* Loading */
  if (isLoading) {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-secondary/30 flex items-center justify-center p-4">
        <div className="space-y-6 w-full max-w-sm text-center">
          <Skeleton className="h-72 sm:h-80 rounded-3xl mx-auto w-full" />
          <Skeleton className="h-10 w-48 rounded-full mx-auto" />
        </div>
      </div>
    );
  }

  /* Empty */
  if (cards.length === 0) {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-secondary/30 flex items-center justify-center p-4">
        <Card className="p-10 sm:p-16 text-center rounded-3xl border-0 shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-card/60 backdrop-blur-lg max-w-md w-full space-y-5">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-secondary/60 flex items-center justify-center mx-auto">
            <Layers className="w-8 h-8 sm:w-10 sm:h-10 text-muted-foreground" strokeWidth={1.5} />
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-foreground">No Flashcards</h2>
          <p className="text-muted-foreground text-sm">No flashcards available to study right now.</p>
          <Button variant="ghost" className="rounded-full" onClick={() => navigate("/dashboard/learning/flashcards")}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Decks
          </Button>
        </Card>
      </div>
    );
  }

  /* Complete */
  if (isComplete) {
    const total = knownCount + reviewCount;
    return (
      <div className="min-h-screen min-h-[100dvh] bg-secondary/30 flex items-center justify-center p-4">
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
            <h2 className="text-xl sm:text-2xl font-bold text-foreground">Session Complete!</h2>
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div className="bg-secondary/50 rounded-2xl p-4 sm:p-5">
                <p className="text-2xl sm:text-3xl font-bold text-primary">{knownCount}</p>
                <p className="text-xs text-muted-foreground mt-1">Mastered</p>
              </div>
              <div className="bg-secondary/50 rounded-2xl p-4 sm:p-5">
                <p className="text-2xl sm:text-3xl font-bold text-foreground">{reviewCount}</p>
                <p className="text-xs text-muted-foreground mt-1">Review</p>
              </div>
            </div>
            <Progress value={(knownCount / Math.max(total, 1)) * 100} className="h-2.5 rounded-full" />
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 rounded-full border-0 bg-secondary/50" onClick={() => navigate("/dashboard/learning/flashcards")}>
                Back to Decks
              </Button>
              <Button className="flex-1 rounded-full" onClick={() => {
                setCurrentIndex(0);
                setKnownCount(0);
                setReviewCount(0);
                setIsComplete(false);
                setIsAnimating(false);
                setSwipeDirection(null);
              }}>
                <RefreshCw className="w-4 h-4 mr-2" strokeWidth={1.5} /> Retry
              </Button>
            </div>
          </Card>
        </motion.div>
      </div>
    );
  }

  /* Swipe UI */
  const card = cards[currentIndex];
  const progressPercent = ((currentIndex + 1) / cards.length) * 100;

  return (
    <div className="min-h-screen min-h-[100dvh] bg-secondary/30 flex flex-col">
      {/* Top bar */}
      <div className="p-3 sm:p-4 md:p-6 flex items-center gap-3 max-w-lg mx-auto w-full">
        <Button variant="ghost" size="icon" className="rounded-full shrink-0" onClick={() => navigate("/dashboard/learning/flashcards")}>
          <ArrowLeft className="w-5 h-5" strokeWidth={1.5} />
        </Button>
        <div className="flex-1">
          <Progress value={progressPercent} className="h-2 rounded-full" />
        </div>
        <Badge variant="secondary" className="rounded-full px-3 text-xs shrink-0">{currentIndex + 1}/{cards.length}</Badge>
      </div>

      {/* Card area — centered with safe touch area */}
      <div className="flex-1 flex items-center justify-center px-4 sm:px-6 py-2">
        <div className="relative w-full max-w-[340px] sm:max-w-sm" style={{ perspective: "1200px" }}>
          {/* Swipe indicators */}
          <motion.div
            style={{ opacity: gotItOpacity }}
            className="absolute -right-2 sm:-right-4 top-1/2 -translate-y-1/2 z-10 bg-primary text-primary-foreground px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-bold shadow-[0_8px_30px_rgb(0,0,0,0.08)] pointer-events-none"
          >
            Got It ✓
          </motion.div>
          <motion.div
            style={{ opacity: reviewOpacity }}
            className="absolute -left-2 sm:-left-4 top-1/2 -translate-y-1/2 z-10 bg-destructive text-destructive-foreground px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-bold shadow-[0_8px_30px_rgb(0,0,0,0.08)] pointer-events-none"
          >
            Review ↺
          </motion.div>

          <AnimatePresence mode="popLayout" onExitComplete={advanceCard}>
            {!isAnimating || swipeDirection ? (
              <motion.div
                key={card.id + "-" + currentIndex}
                style={!swipeDirection ? { x, rotate, opacity: cardOpacity, borderColor } : undefined}
                drag={!isAnimating ? "x" : false}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.9}
                onDragEnd={handleDragEnd}
                initial={{ opacity: 0, scale: 0.92, y: 16 }}
                animate={swipeDirection ? {
                  x: swipeDirection === "right" ? 350 : -350,
                  opacity: 0,
                  rotate: swipeDirection === "right" ? 15 : -15,
                  transition: { duration: 0.3, ease: "easeIn" },
                } : {
                  opacity: 1,
                  scale: 1,
                  y: 0,
                }}
                exit={{ opacity: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 28 }}
                className="cursor-grab active:cursor-grabbing touch-none rounded-3xl border-2 will-change-transform"
                onClick={() => !isAnimating && setIsFlipped(!isFlipped)}
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
                      <Badge variant="outline" className="text-xs rounded-full px-3 border-border/20">Question</Badge>
                      <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-foreground leading-relaxed">{card.front_text}</h2>
                      <p className="text-xs sm:text-sm text-muted-foreground">Tap to flip · Swipe to answer</p>
                    </div>
                  </Card>

                  {/* Back */}
                  <Card
                    className="absolute inset-0 p-6 sm:p-8 md:p-10 rounded-3xl border-0 shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-primary/5 flex items-center justify-center"
                    style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
                  >
                    <div className="text-center space-y-4">
                      <Badge className="bg-primary text-primary-foreground text-xs rounded-full px-3">Answer</Badge>
                      <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-foreground leading-relaxed">{card.back_text}</h2>
                    </div>
                  </Card>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      {/* Bottom buttons */}
      <div className="p-4 sm:p-6 max-w-sm mx-auto w-full flex gap-3 pb-safe">
        <Button
          variant="outline"
          className="flex-1 gap-2 rounded-full h-11 sm:h-12 border-0 bg-secondary/50"
          onClick={() => handleSwipe("left")}
          disabled={isAnimating}
        >
          <RefreshCw className="w-4 h-4" strokeWidth={1.5} />
          Review
        </Button>
        <Button
          className="flex-1 gap-2 rounded-full h-11 sm:h-12"
          onClick={() => handleSwipe("right")}
          disabled={isAnimating}
        >
          <Check className="w-4 h-4" strokeWidth={1.5} />
          Got It
        </Button>
      </div>
    </div>
  );
}
