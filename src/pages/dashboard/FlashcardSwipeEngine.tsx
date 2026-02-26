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

interface Flashcard {
  id: string;
  front_text: string;
  back_text: string;
  sort_order: number;
}

const SWIPE_THRESHOLD = 100;

/**
 * FlashcardSwipeEngine — Fullscreen swipeable flashcards with framer-motion drag physics.
 * Swipe right = "Got It", left = "Review Again". Optimistic state updates.
 */
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
  const [exitDirection, setExitDirection] = useState<"left" | "right" | null>(null);

  // Motion values for drag
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 0, 200], [-15, 0, 15]);
  const opacity = useTransform(x, [-200, -100, 0, 100, 200], [0.5, 0.8, 1, 0.8, 0.5]);

  // Indicator overlays
  const gotItOpacity = useTransform(x, [0, SWIPE_THRESHOLD], [0, 1]);
  const reviewOpacity = useTransform(x, [-SWIPE_THRESHOLD, 0], [1, 0]);

  useEffect(() => {
    fetchCards();
  }, []);

  const fetchCards = async () => {
    setIsLoading(true);
    // Get the deckId from URL params or use all cards
    const urlParams = new URLSearchParams(window.location.search);
    const deckId = urlParams.get("deck");

    let query = supabase.from("flashcards").select("*").order("sort_order");
    if (deckId) query = query.eq("deck_id", deckId);

    const { data } = await query;
    if (data) setCards(data);
    setIsLoading(false);
  };

  const saveProgress = useCallback(async (flashcardId: string, status: "known" | "review") => {
    if (!user) return;
    // Fire and forget — optimistic
    supabase.from("flashcard_progress").upsert(
      {
        user_id: user.id,
        flashcard_id: flashcardId,
        status,
        reviewed_at: new Date().toISOString(),
      },
      { onConflict: "user_id,flashcard_id" }
    ).then(({ error }) => {
      if (error) console.error("Progress save error:", error);
    });
  }, [user]);

  const handleSwipe = useCallback((direction: "left" | "right") => {
    const card = cards[currentIndex];
    if (!card) return;

    setExitDirection(direction);

    // Optimistic update
    if (direction === "right") {
      setKnownCount((c) => c + 1);
      saveProgress(card.id, "known");
    } else {
      setReviewCount((c) => c + 1);
      saveProgress(card.id, "review");
    }

    setTimeout(() => {
      setIsFlipped(false);
      setExitDirection(null);
      if (currentIndex + 1 < cards.length) {
        setCurrentIndex((i) => i + 1);
      } else {
        setIsComplete(true);
      }
    }, 300);
  }, [cards, currentIndex, saveProgress]);

  const handleDragEnd = useCallback((_: any, info: { offset: { x: number }; velocity: { x: number } }) => {
    const swipe = info.offset.x;
    const velocity = Math.abs(info.velocity.x);
    if (swipe > SWIPE_THRESHOLD || (swipe > 50 && velocity > 500)) {
      handleSwipe("right");
    } else if (swipe < -SWIPE_THRESHOLD || (swipe < -50 && velocity > 500)) {
      handleSwipe("left");
    }
  }, [handleSwipe]);

  /* ── Loading ── */
  if (isLoading) {
    return (
      <div className="min-h-screen bg-secondary/30 flex items-center justify-center p-6">
        <div className="space-y-6 w-full max-w-lg text-center">
          <Skeleton className="h-80 rounded-3xl mx-auto max-w-sm w-full" />
          <Skeleton className="h-10 w-48 rounded-full mx-auto" />
        </div>
      </div>
    );
  }

  /* ── Empty ── */
  if (cards.length === 0) {
    return (
      <div className="min-h-screen bg-secondary/30 flex items-center justify-center p-6">
        <Card className="p-16 text-center rounded-3xl border-0 shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-card/90 backdrop-blur-md max-w-md w-full space-y-5">
          <div className="w-20 h-20 rounded-full bg-secondary/60 flex items-center justify-center mx-auto">
            <Layers className="w-10 h-10 text-muted-foreground" strokeWidth={1.5} />
          </div>
          <h2 className="text-xl font-bold text-foreground">No Flashcards</h2>
          <p className="text-muted-foreground text-sm">No flashcards available to study right now.</p>
          <Button variant="ghost" className="rounded-full" onClick={() => navigate("/dashboard/learning/flashcards")}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Decks
          </Button>
        </Card>
      </div>
    );
  }

  /* ── Complete ── */
  if (isComplete) {
    const total = knownCount + reviewCount;
    return (
      <div className="min-h-screen bg-secondary/30 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
        >
          <Card className="p-10 text-center rounded-3xl border-0 shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-card/90 backdrop-blur-md max-w-md w-full space-y-6">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Sparkles className="w-10 h-10 text-primary" strokeWidth={1.5} />
            </div>
            <h2 className="text-2xl font-bold text-foreground">Session Complete!</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-secondary/50 rounded-2xl p-5">
                <p className="text-3xl font-bold text-primary">{knownCount}</p>
                <p className="text-xs text-muted-foreground mt-1">Mastered</p>
              </div>
              <div className="bg-secondary/50 rounded-2xl p-5">
                <p className="text-3xl font-bold text-foreground">{reviewCount}</p>
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
              }}>
                <RefreshCw className="w-4 h-4 mr-2" strokeWidth={1.5} /> Retry
              </Button>
            </div>
          </Card>
        </motion.div>
      </div>
    );
  }

  /* ── Swipe UI ── */
  const card = cards[currentIndex];
  const progressPercent = cards.length > 0 ? ((currentIndex + 1) / cards.length) * 100 : 0;

  return (
    <div className="min-h-screen bg-secondary/30 flex flex-col">
      {/* Top bar */}
      <div className="p-4 md:p-6 flex items-center gap-3 max-w-lg mx-auto w-full">
        <Button variant="ghost" size="icon" className="rounded-full" onClick={() => navigate("/dashboard/learning/flashcards")}>
          <ArrowLeft className="w-5 h-5" strokeWidth={1.5} />
        </Button>
        <div className="flex-1">
          <Progress value={progressPercent} className="h-2 rounded-full" />
        </div>
        <Badge variant="secondary" className="rounded-full px-3 text-xs">{currentIndex + 1}/{cards.length}</Badge>
      </div>

      {/* Card area */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="relative w-full max-w-sm" style={{ perspective: "1200px" }}>
          {/* Swipe indicators */}
          <motion.div
            style={{ opacity: gotItOpacity }}
            className="absolute -right-4 top-1/2 -translate-y-1/2 z-10 bg-primary text-primary-foreground px-4 py-2 rounded-full text-sm font-bold shadow-[0_8px_30px_rgb(0,0,0,0.08)]"
          >
            Got It ✓
          </motion.div>
          <motion.div
            style={{ opacity: reviewOpacity }}
            className="absolute -left-4 top-1/2 -translate-y-1/2 z-10 bg-destructive text-destructive-foreground px-4 py-2 rounded-full text-sm font-bold shadow-[0_8px_30px_rgb(0,0,0,0.08)]"
          >
            Review ↺
          </motion.div>

          <AnimatePresence mode="wait">
            <motion.div
              key={card.id}
              style={{ x, rotate, opacity }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.7}
              onDragEnd={handleDragEnd}
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{
                x: exitDirection === "right" ? 300 : exitDirection === "left" ? -300 : 0,
                opacity: 0,
                scale: 0.8,
                transition: { duration: 0.3 },
              }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="cursor-grab active:cursor-grabbing touch-none"
              onClick={() => setIsFlipped(!isFlipped)}
            >
              <div
                className="relative w-full min-h-[380px]"
                style={{
                  transformStyle: "preserve-3d",
                  transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
                  transition: "transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
                }}
              >
                {/* Front */}
                <Card
                  className="absolute inset-0 p-10 rounded-3xl border-0 shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-card/90 backdrop-blur-md flex items-center justify-center"
                  style={{ backfaceVisibility: "hidden" }}
                >
                  <div className="text-center space-y-5">
                    <Badge variant="outline" className="text-xs rounded-full px-3 border-border/20">Question</Badge>
                    <h2 className="text-xl md:text-2xl font-bold text-foreground leading-relaxed">{card.front_text}</h2>
                    <p className="text-sm text-muted-foreground">Tap to flip · Swipe to answer</p>
                  </div>
                </Card>

                {/* Back */}
                <Card
                  className="absolute inset-0 p-10 rounded-3xl border-0 shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-primary/5 flex items-center justify-center"
                  style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
                >
                  <div className="text-center space-y-5">
                    <Badge className="bg-primary text-primary-foreground text-xs rounded-full px-3">Answer</Badge>
                    <h2 className="text-xl md:text-2xl font-bold text-foreground leading-relaxed">{card.back_text}</h2>
                  </div>
                </Card>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Bottom buttons */}
      <div className="p-6 max-w-sm mx-auto w-full flex gap-3">
        <Button
          variant="outline"
          className="flex-1 gap-2 rounded-full h-12 border-0 bg-secondary/50"
          onClick={() => handleSwipe("left")}
        >
          <RefreshCw className="w-4 h-4" strokeWidth={1.5} />
          Review
        </Button>
        <Button
          className="flex-1 gap-2 rounded-full h-12"
          onClick={() => handleSwipe("right")}
        >
          <Check className="w-4 h-4" strokeWidth={1.5} />
          Got It
        </Button>
      </div>
    </div>
  );
}
