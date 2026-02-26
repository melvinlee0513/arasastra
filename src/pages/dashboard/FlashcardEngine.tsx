import { useEffect, useState } from "react";
import { ArrowLeft, BrainCircuit, Check, RefreshCw, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

interface Flashcard {
  id: string;
  front_text: string;
  back_text: string;
  sort_order: number;
}

interface FlashcardDeck {
  id: string;
  title: string;
  description: string | null;
  subject_name?: string;
}

/**
 * FlashcardEngine — Interactive 3D-flip flashcard study tool.
 * Soft-Tech aesthetic: glassmorphism cards, pill buttons, high whitespace.
 */
export function FlashcardEngine() {
  const { user } = useAuth();
  const [decks, setDecks] = useState<FlashcardDeck[]>([]);
  const [selectedDeck, setSelectedDeck] = useState<string | null>(null);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [knownCount, setKnownCount] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchDecks();
  }, []);

  const fetchDecks = async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from("flashcard_decks")
      .select("id, title, description, subject:subjects(name)")
      .order("created_at", { ascending: false });

    if (data) {
      setDecks(
        data.map((d) => ({
          ...d,
          subject_name: (d.subject as any)?.name || undefined,
        }))
      );
    }
    setIsLoading(false);
  };

  const startDeck = async (deckId: string) => {
    setSelectedDeck(deckId);
    setCurrentIndex(0);
    setIsFlipped(false);
    setKnownCount(0);
    setReviewCount(0);

    const { data } = await supabase
      .from("flashcards")
      .select("*")
      .eq("deck_id", deckId)
      .order("sort_order");

    if (data) setCards(data);
  };

  const handleKnowIt = async () => {
    if (!user || !cards[currentIndex]) return;
    setKnownCount((c) => c + 1);

    await supabase.from("flashcard_progress").upsert(
      {
        user_id: user.id,
        flashcard_id: cards[currentIndex].id,
        status: "known",
        reviewed_at: new Date().toISOString(),
      },
      { onConflict: "user_id,flashcard_id" }
    );

    nextCard();
  };

  const handleReviewAgain = async () => {
    if (!user || !cards[currentIndex]) return;
    setReviewCount((c) => c + 1);

    await supabase.from("flashcard_progress").upsert(
      {
        user_id: user.id,
        flashcard_id: cards[currentIndex].id,
        status: "review",
        reviewed_at: new Date().toISOString(),
      },
      { onConflict: "user_id,flashcard_id" }
    );

    nextCard();
  };

  const nextCard = () => {
    setIsFlipped(false);
    setTimeout(() => {
      if (currentIndex + 1 < cards.length) {
        setCurrentIndex((i) => i + 1);
      } else {
        setSelectedDeck("complete");
      }
    }, 250);
  };

  /* ── Deck list view ── */
  if (!selectedDeck) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <BrainCircuit className="w-5 h-5 text-accent" />
            Flashcards
          </h2>
          <p className="text-muted-foreground text-sm mt-1">Study with interactive flashcards</p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-32 rounded-2xl" />
            ))}
          </div>
        ) : decks.length === 0 ? (
          <Card className="p-16 text-center bg-card/70 backdrop-blur-md border-border/40 rounded-2xl shadow-sm">
            <div className="w-20 h-20 rounded-full bg-secondary/60 flex items-center justify-center mx-auto mb-5">
              <Layers className="w-10 h-10 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">No flashcard decks yet</h3>
            <p className="text-muted-foreground max-w-sm mx-auto">
              Your tutors will create flashcard decks for your enrolled subjects soon.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {decks.map((deck) => (
              <Card
                key={deck.id}
                className="p-6 bg-card/70 backdrop-blur-md border-border/40 rounded-2xl shadow-sm hover:shadow-md hover:border-accent/30 transition-all duration-200 cursor-pointer group"
                onClick={() => startDeck(deck.id)}
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <BrainCircuit className="w-6 h-6 text-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-foreground">{deck.title}</h3>
                    {deck.description && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{deck.description}</p>
                    )}
                    {deck.subject_name && (
                      <Badge variant="secondary" className="rounded-full mt-2 text-xs">{deck.subject_name}</Badge>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  /* ── Complete view ── */
  if (selectedDeck === "complete") {
    const total = knownCount + reviewCount;
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Card className="p-10 text-center bg-card/70 backdrop-blur-md border-border/40 rounded-2xl shadow-sm max-w-md w-full space-y-5">
          <div className="w-20 h-20 rounded-full bg-accent/15 flex items-center justify-center mx-auto">
            <Check className="w-10 h-10 text-accent" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">Session Complete!</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-secondary/50 rounded-2xl p-5">
              <p className="text-3xl font-bold text-accent">{knownCount}</p>
              <p className="text-xs text-muted-foreground mt-1">Mastered</p>
            </div>
            <div className="bg-secondary/50 rounded-2xl p-5">
              <p className="text-3xl font-bold text-foreground">{reviewCount}</p>
              <p className="text-xs text-muted-foreground mt-1">Needs Review</p>
            </div>
          </div>
          <Progress value={(knownCount / Math.max(total, 1)) * 100} className="h-2.5 rounded-full" />
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 rounded-full" onClick={() => setSelectedDeck(null)}>
              Back to Decks
            </Button>
            <Button variant="default" className="flex-1 rounded-full" onClick={() => startDeck(selectedDeck!)}>
              <RefreshCw className="w-4 h-4 mr-2" /> Retry
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  /* ── Flashcard study view ── */
  const card = cards[currentIndex];
  const progressPercent = cards.length > 0 ? ((currentIndex + 1) / cards.length) * 100 : 0;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Top bar */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="rounded-full" onClick={() => setSelectedDeck(null)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <Progress value={progressPercent} className="h-2.5 rounded-full" />
        </div>
        <Badge variant="secondary" className="rounded-full px-3">{currentIndex + 1}/{cards.length}</Badge>
      </div>

      {/* 3D Flip Card — glassmorphism */}
      <div
        className="cursor-pointer"
        onClick={() => setIsFlipped(!isFlipped)}
        style={{ perspective: "1200px" }}
      >
        <div
          className="relative w-full min-h-[320px]"
          style={{
            transformStyle: "preserve-3d",
            transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
            transition: "transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          {/* Front */}
          <Card
            className="absolute inset-0 p-10 bg-card/70 backdrop-blur-md border-border/40 rounded-2xl shadow-sm flex items-center justify-center"
            style={{ backfaceVisibility: "hidden" }}
          >
            <div className="text-center space-y-4">
              <Badge variant="outline" className="text-xs rounded-full px-3">Question</Badge>
              <h2 className="text-xl md:text-2xl font-bold text-foreground leading-relaxed">{card?.front_text}</h2>
              <p className="text-sm text-muted-foreground">Tap to reveal answer</p>
            </div>
          </Card>

          {/* Back */}
          <Card
            className="absolute inset-0 p-10 bg-primary/5 border-primary/20 rounded-2xl shadow-sm flex items-center justify-center"
            style={{
              backfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
            }}
          >
            <div className="text-center space-y-4">
              <Badge className="bg-primary text-primary-foreground text-xs rounded-full px-3">Answer</Badge>
              <h2 className="text-xl md:text-2xl font-bold text-foreground leading-relaxed">{card?.back_text}</h2>
            </div>
          </Card>
        </div>
      </div>

      {/* Action buttons — pill-shaped */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          className="flex-1 gap-2 rounded-full h-12"
          onClick={handleReviewAgain}
        >
          <RefreshCw className="w-4 h-4" />
          Review Again
        </Button>
        <Button
          variant="default"
          className="flex-1 gap-2 rounded-full h-12"
          onClick={handleKnowIt}
        >
          <Check className="w-4 h-4" />
          Know It
        </Button>
      </div>
    </div>
  );
}
