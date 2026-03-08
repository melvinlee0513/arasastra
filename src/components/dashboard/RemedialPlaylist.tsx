import { Play, BookOpen, AlertTriangle, Sparkles, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

interface SuggestedVideo {
  id: string;
  title: string;
  subject: string;
  duration: string;
  tag: string;
}

interface SuggestedDeck {
  id: string;
  title: string;
  cardCount: number;
  tag: string;
}

// Mock data — topics the student got wrong
const MOCK_WEAK_TOPICS = ["Quadratic Equations", "Forces & Motion", "Chemical Bonding"];

const MOCK_VIDEOS: SuggestedVideo[] = [
  { id: "1", title: "Mastering Quadratic Equations — Step by Step", subject: "Mathematics", duration: "18 min", tag: "Quadratic Equations" },
  { id: "2", title: "Newton's Laws Explained Simply", subject: "Physics", duration: "22 min", tag: "Forces & Motion" },
  { id: "3", title: "Chemical Bonding: Ionic vs Covalent", subject: "Chemistry", duration: "15 min", tag: "Chemical Bonding" },
];

const MOCK_DECK: SuggestedDeck = {
  id: "weak-deck",
  title: "Forces & Motion — Quick Review",
  cardCount: 12,
  tag: "Forces & Motion",
};

export function RemedialPlaylist() {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl bg-[hsl(35,90%,55%)]/10 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-[hsl(35,90%,55%)]" strokeWidth={1.5} />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">Recommended For You</h2>
          <p className="text-xs text-muted-foreground">Based on topics that need review</p>
        </div>
      </div>

      {/* Weak topic badges */}
      <div className="flex flex-wrap gap-2">
        {MOCK_WEAK_TOPICS.map((topic) => (
          <Badge
            key={topic}
            variant="outline"
            className="bg-[hsl(35,90%,55%)]/8 border-[hsl(35,90%,55%)]/20 text-[hsl(35,80%,40%)] text-xs gap-1"
          >
            <AlertTriangle className="w-3 h-3" strokeWidth={1.5} />
            {topic}
          </Badge>
        ))}
      </div>

      {/* Suggested Videos */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {MOCK_VIDEOS.map((video) => (
          <Card
            key={video.id}
            className="p-4 bg-card border-border/40 hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:border-accent/30 transition-all duration-200 cursor-pointer group rounded-2xl"
          >
            {/* Thumbnail placeholder */}
            <div className="relative aspect-video bg-secondary/50 rounded-xl mb-3 flex items-center justify-center overflow-hidden">
              <div className="w-10 h-10 rounded-full bg-accent/80 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Play className="w-5 h-5 text-accent-foreground fill-current" />
              </div>
              <Badge className="absolute top-2 left-2 bg-[hsl(35,90%,55%)]/90 text-[hsl(35,90%,15%)] border-0 text-[10px] gap-1">
                <TrendingUp className="w-2.5 h-2.5" strokeWidth={2} />
                Review
              </Badge>
              <span className="absolute bottom-2 right-2 text-[10px] bg-foreground/60 text-background px-1.5 py-0.5 rounded-full font-medium">
                {video.duration}
              </span>
            </div>

            <Badge variant="outline" className="text-[10px] mb-1.5">{video.subject}</Badge>
            <h3 className="text-sm font-medium text-foreground line-clamp-2 leading-snug break-words">{video.title}</h3>
          </Card>
        ))}
      </div>

      {/* Suggested Flashcard Deck */}
      <Card className="p-4 bg-card border-border/40 hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all rounded-2xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[hsl(35,90%,55%)]/10 flex items-center justify-center shrink-0">
            <BookOpen className="w-6 h-6 text-[hsl(35,90%,55%)]" strokeWidth={1.5} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className="font-medium text-foreground">{MOCK_DECK.title}</h3>
              <Badge className="bg-[hsl(35,90%,55%)]/15 text-[hsl(35,80%,40%)] border-0 text-[10px]">
                Needs Review
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">{MOCK_DECK.cardCount} flashcards</p>
          </div>
          <Link to="/dashboard/learning/flashcards/play">
            <Button size="sm" className="rounded-full gap-1.5 shadow-[0_0_12px_hsl(var(--accent)/0.2)]">
              <Play className="w-3.5 h-3.5" />
              Practice
            </Button>
          </Link>
        </div>
      </Card>
    </section>
  );
}
