import { useEffect, useState } from "react";
import { ArrowLeft, RotateCcw, Check, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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

interface FlashcardDeck {
  id: string;
  title: string;
  description: string | null;
  subject_name?: string;
}

export function FlashcardEngine() {
  const { user } = useAuth();
  const navigate = useNavigate();
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
    }, 200);
  };

  // Deck list view
  if (!selectedDeck) {
    return (
      <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Flashcards</h1>
          <p className="text-muted-foreground">Study with interactive flashcards</p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-6 bg-card border-border animate-pulse">
                <div className="h-5 bg-muted rounded w-2/3 mb-3" />
                <div className="h-4 bg-muted rounded w-1/2" />
              </Card>
            ))}
          </div>
        ) : decks.length === 0 ? (
          <Card className="p-12 text-center bg-card border-border">
            <RotateCcw className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No flashcard decks yet</h3>
            <p className="text-muted-foreground">Your tutors will create flashcard decks soon.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {decks.map((deck) => (
              <Card
                key={deck.id}
                className="p-5 bg-card border-border hover:shadow-md hover:border-accent/30 transition-all cursor-pointer"
                onClick={() => startDeck(deck.id)}
              >
                <h3 className="font-bold text-foreground">{deck.title}</h3>
                {deck.description && <p className="text-sm text-muted-foreground mt-1">{deck.description}</p>}
                {deck.subject_name && <Badge variant="secondary" className="mt-2">{deck.subject_name}</Badge>}
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Complete view
  if (selectedDeck === "complete") {
    const total = knownCount + reviewCount;
    return (
      <div className="p-4 md:p-6 flex items-center justify-center min-h-[60vh]">
        <Card className="p-8 text-center bg-card border-border max-w-md w-full space-y-4">
          <div className="w-20 h-20 rounded-full bg-accent/20 flex items-center justify-center mx-auto">
            <Check className="w-10 h-10 text-accent" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">Session Complete!</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-secondary rounded-xl p-4">
              <p className="text-2xl font-bold text-accent">{knownCount}</p>
              <p className="text-xs text-muted-foreground">Mastered</p>
            </div>
            <div className="bg-secondary rounded-xl p-4">
              <p className="text-2xl font-bold text-foreground">{reviewCount}</p>
              <p className="text-xs text-muted-foreground">Needs Review</p>
            </div>
          </div>
          <Progress value={(knownCount / Math.max(total, 1)) * 100} className="h-2" />
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setSelectedDeck(null)}>
              Back to Decks
            </Button>
            <Button variant="default" className="flex-1" onClick={() => startDeck(selectedDeck!)}>
              <RefreshCw className="w-4 h-4 mr-2" /> Retry
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // Flashcard study view
  const card = cards[currentIndex];
  const progressPercent = cards.length > 0 ? ((currentIndex + 1) / cards.length) * 100 : 0;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setSelectedDeck(null)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <Progress value={progressPercent} className="h-2" />
        </div>
        <Badge variant="secondary">{currentIndex + 1}/{cards.length}</Badge>
      </div>

      {/* 3D Flip Card */}
      <div
        className="perspective-1000 cursor-pointer"
        onClick={() => setIsFlipped(!isFlipped)}
        style={{ perspective: "1000px" }}
      >
        <div
          className={cn(
            "relative w-full min-h-[300px] transition-transform duration-500",
            "transform-style-3d"
          )}
          style={{
            transformStyle: "preserve-3d",
            transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
            transition: "transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          {/* Front */}
          <Card
            className="absolute inset-0 p-8 bg-card border-border flex items-center justify-center backface-hidden"
            style={{ backfaceVisibility: "hidden" }}
          >
            <div className="text-center space-y-3">
              <Badge variant="outline" className="text-xs">Question</Badge>
              <h2 className="text-xl md:text-2xl font-bold text-foreground">{card?.front_text}</h2>
              <p className="text-sm text-muted-foreground">Tap to reveal answer</p>
            </div>
          </Card>

          {/* Back */}
          <Card
            className="absolute inset-0 p-8 bg-accent/5 border-accent/20 flex items-center justify-center"
            style={{
              backfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
            }}
          >
            <div className="text-center space-y-3">
              <Badge className="bg-accent text-accent-foreground text-xs">Answer</Badge>
              <h2 className="text-xl md:text-2xl font-bold text-foreground">{card?.back_text}</h2>
            </div>
          </Card>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          className="flex-1 gap-2"
          onClick={handleReviewAgain}
        >
          <RefreshCw className="w-4 h-4" />
          Review Again
        </Button>
        <Button
          variant="default"
          className="flex-1 gap-2"
          onClick={handleKnowIt}
        >
          <Check className="w-4 h-4" />
          Know It
        </Button>
      </div>
    </div>
  );
}
