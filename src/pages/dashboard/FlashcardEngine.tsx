import { useEffect, useState } from "react";
import { ArrowLeft, BrainCircuit, Check, RefreshCw, Layers, Play, AlertCircle, Sparkles, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAccess } from "@/hooks/useAccess";
import { useToast } from "@/hooks/use-toast";
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
  access_level: "demo" | "exclusive";
  subject_id: string | null;
  subject_name?: string;
  card_count?: number;
  known_count?: number;
}

/**
 * FlashcardEngine — Deck list view with "Play Mode" CTA + inline study fallback.
 */
export function FlashcardEngine() {
  const { user } = useAuth();
  const { hasAccess } = useAccess();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [decks, setDecks] = useState<FlashcardDeck[]>([]);
  const [selectedDeck, setSelectedDeck] = useState<string | null>(null);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [knownCount, setKnownCount] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");

  useEffect(() => {
    fetchDecks();
  }, []);

  const fetchDecks = async () => {
    setState("loading");
    try {
      const { data, error } = await supabase
        .from("flashcard_decks")
        .select("id, title, description, access_level, subject_id, subject:subjects(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const deckIds = (data || []).map((d) => d.id);

      const [cardsRes, progressRes] = await Promise.all([
        deckIds.length
          ? supabase.from("flashcards").select("id, deck_id").in("deck_id", deckIds)
          : Promise.resolve({ data: [] as { id: string; deck_id: string }[] }),
        user && deckIds.length
          ? supabase
              .from("flashcard_progress")
              .select("flashcard_id, status")
              .eq("user_id", user.id)
          : Promise.resolve({ data: [] as { flashcard_id: string; status: string }[] }),
      ]);

      const cardToDeck = new Map<string, string>();
      const cardCount = new Map<string, number>();
      (cardsRes.data || []).forEach((c) => {
        cardToDeck.set(c.id, c.deck_id);
        cardCount.set(c.deck_id, (cardCount.get(c.deck_id) || 0) + 1);
      });
      const knownPerDeck = new Map<string, number>();
      (progressRes.data || []).forEach((p) => {
        if (p.status !== "known") return;
        const d = cardToDeck.get(p.flashcard_id);
        if (!d) return;
        knownPerDeck.set(d, (knownPerDeck.get(d) || 0) + 1);
      });

      setDecks(
        (data || []).map((d) => ({
          id: d.id,
          title: d.title,
          description: d.description,
          access_level: (d.access_level as "demo" | "exclusive") ?? "exclusive",
          subject_id: d.subject_id ?? null,
          subject_name: (d.subject as any)?.name || undefined,
          card_count: cardCount.get(d.id) || 0,
          known_count: knownPerDeck.get(d.id) || 0,
        }))
      );
      setState("loaded");
    } catch (e) {
      console.error("Flashcard decks load failed:", e);
      setState("error");
    }
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
      { user_id: user.id, flashcard_id: cards[currentIndex].id, status: "known", reviewed_at: new Date().toISOString() },
      { onConflict: "user_id,flashcard_id" }
    );
    nextCard();
  };

  const handleReviewAgain = async () => {
    if (!user || !cards[currentIndex]) return;
    setReviewCount((c) => c + 1);
    await supabase.from("flashcard_progress").upsert(
      { user_id: user.id, flashcard_id: cards[currentIndex].id, status: "review", reviewed_at: new Date().toISOString() },
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
            <BrainCircuit className="w-5 h-5 text-primary" strokeWidth={1.5} />
            Flashcards
          </h2>
          <p className="text-muted-foreground text-sm mt-1">Study with interactive flashcards</p>
        </div>

        {state === "loading" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-40 rounded-3xl" />
            ))}
          </div>
        ) : state === "error" ? (
          <Card className="p-10 text-center bg-card border-border rounded-3xl">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-destructive/10 flex items-center justify-center">
              <AlertCircle className="w-8 h-8 text-destructive" />
            </div>
            <h3 className="font-semibold text-foreground mb-1">Couldn't load flashcards</h3>
            <p className="text-sm text-muted-foreground mb-4">Please try again in a moment.</p>
            <Button onClick={fetchDecks} className="rounded-full">Try again</Button>
          </Card>
        ) : decks.length === 0 ? (
          <Card className="p-16 text-center bg-card/60 backdrop-blur-lg border-0 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
            <div className="w-20 h-20 rounded-full bg-secondary/60 flex items-center justify-center mx-auto mb-5">
              <Layers className="w-10 h-10 text-muted-foreground" strokeWidth={1.5} />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">No flashcard decks yet</h3>
            <p className="text-muted-foreground max-w-sm mx-auto">
              Your tutors will create flashcard decks for your enrolled subjects soon.
            </p>
            <Button
              onClick={() => navigate("/dashboard/classes")}
              className="mt-6 rounded-full gap-2 shadow-[0_0_20px_hsl(var(--primary)/0.3)]"
            >
              <Play className="w-4 h-4" strokeWidth={1.5} />
              Try Demo Deck
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {decks.map((deck) => {
              const isDemo = deck.access_level === "demo";
              const unlocked = isDemo || hasAccess(deck.subject_id || "");
              const total = deck.card_count || 0;
              const known = deck.known_count || 0;
              const pct = total > 0 ? Math.round((known / total) * 100) : 0;
              return (
                <Card
                  key={deck.id}
                  className="p-6 bg-card/60 backdrop-blur-lg border-0 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_12px_40px_rgb(0,0,0,0.08)] transition-all duration-200 group"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <BrainCircuit className="w-6 h-6 text-primary" strokeWidth={1.5} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-foreground truncate">{deck.title}</h3>
                      {deck.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{deck.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {deck.subject_name && (
                          <Badge variant="secondary" className="rounded-full text-xs">{deck.subject_name}</Badge>
                        )}
                        <Badge variant="outline" className="rounded-full text-xs border-border/20">
                          {total} cards
                        </Badge>
                        {isDemo ? (
                          <Badge className="rounded-full text-xs bg-primary/15 text-primary border-0 gap-1">
                            <Sparkles className="w-3 h-3" /> Demo
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="rounded-full text-xs">
                            Exclusive
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  {total > 0 && (
                    <div className="mt-4 space-y-1.5">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Mastered</span>
                        <span className="font-medium text-foreground">{known}/{total} · {pct}%</span>
                      </div>
                      <Progress value={pct} className="h-2 rounded-full" />
                    </div>
                  )}

                  {unlocked ? (
                    <div className="flex gap-2 mt-4">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 rounded-full border-0 bg-secondary/50 text-sm"
                        onClick={(e) => { e.stopPropagation(); startDeck(deck.id); }}
                      >
                        Study inline
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1 rounded-full gap-1.5 text-sm shadow-[0_0_20px_hsl(var(--primary)/0.3)]"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/dashboard/classes?deck=${deck.id}`);
                        }}
                      >
                        <Play className="w-3.5 h-3.5" strokeWidth={1.5} />
                        Play mode
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full mt-4 rounded-full gap-2"
                      disabled
                      onClick={() =>
                        toast({
                          title: "Enrollment required",
                          description: "Enroll in this subject to unlock the deck.",
                        })
                      }
                    >
                      <Lock className="w-4 h-4" /> Enroll to unlock
                    </Button>
                  )}
                </Card>
              );
            })}
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
        <Card className="p-10 text-center bg-card/60 backdrop-blur-lg border-0 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] max-w-md w-full space-y-5">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Check className="w-10 h-10 text-primary" strokeWidth={1.5} />
          </div>
          <h2 className="text-2xl font-bold text-foreground">Session Complete!</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-secondary/50 rounded-2xl p-5">
              <p className="text-3xl font-bold text-primary">{knownCount}</p>
              <p className="text-xs text-muted-foreground mt-1">Mastered</p>
            </div>
            <div className="bg-secondary/50 rounded-2xl p-5">
              <p className="text-3xl font-bold text-foreground">{reviewCount}</p>
              <p className="text-xs text-muted-foreground mt-1">Needs Review</p>
            </div>
          </div>
          <Progress value={(knownCount / Math.max(total, 1)) * 100} className="h-2.5 rounded-full" />
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 rounded-full border-0 bg-secondary/50" onClick={() => setSelectedDeck(null)}>
              Back to Decks
            </Button>
            <Button className="flex-1 rounded-full" onClick={() => startDeck(selectedDeck!)}>
              <RefreshCw className="w-4 h-4 mr-2" strokeWidth={1.5} /> Retry
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
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="rounded-full" onClick={() => setSelectedDeck(null)}>
          <ArrowLeft className="w-5 h-5" strokeWidth={1.5} />
        </Button>
        <div className="flex-1">
          <Progress value={progressPercent} className="h-2.5 rounded-full" />
        </div>
        <Badge variant="secondary" className="rounded-full px-3">{currentIndex + 1}/{cards.length}</Badge>
      </div>

      <div className="cursor-pointer" onClick={() => setIsFlipped(!isFlipped)} style={{ perspective: "1200px" }}>
        <div
          className="relative w-full min-h-[320px]"
          style={{
            transformStyle: "preserve-3d",
            transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
            transition: "transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          <Card
            className="absolute inset-0 p-10 bg-card/60 backdrop-blur-lg border-0 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex items-center justify-center"
            style={{ backfaceVisibility: "hidden" }}
          >
            <div className="text-center space-y-4">
              <Badge variant="outline" className="text-xs rounded-full px-3 border-border/20">Question</Badge>
              <h2 className="text-xl md:text-2xl font-bold text-foreground leading-relaxed">{card?.front_text}</h2>
              <p className="text-sm text-muted-foreground">Tap to reveal answer</p>
            </div>
          </Card>

          <Card
            className="absolute inset-0 p-10 bg-primary/5 border-0 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex items-center justify-center"
            style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
          >
            <div className="text-center space-y-4">
              <Badge className="bg-primary text-primary-foreground text-xs rounded-full px-3">Answer</Badge>
              <h2 className="text-xl md:text-2xl font-bold text-foreground leading-relaxed">{card?.back_text}</h2>
            </div>
          </Card>
        </div>
      </div>

      <div className="flex gap-3">
        <Button variant="outline" className="flex-1 gap-2 rounded-full h-12 border-0 bg-secondary/50" onClick={handleReviewAgain}>
          <RefreshCw className="w-4 h-4" strokeWidth={1.5} /> Review Again
        </Button>
        <Button className="flex-1 gap-2 rounded-full h-12" onClick={handleKnowIt}>
          <Check className="w-4 h-4" strokeWidth={1.5} /> Know It
        </Button>
      </div>
    </div>
  );
}
