import { useState, useMemo } from "react";
import { Search, Clock, PlayCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface TranscriptEntry {
  timestamp: number;
  text: string;
}

interface TranscriptSearchProps {
  onSeek: (seconds: number) => void;
}

// Mock transcript data — SPM-level Physics content
const MOCK_TRANSCRIPT: TranscriptEntry[] = [
  { timestamp: 0, text: "Welcome to today's lesson on Forces and Motion." },
  { timestamp: 15, text: "Let's start by reviewing Newton's First Law of Motion." },
  { timestamp: 45, text: "An object at rest stays at rest, and an object in motion stays in motion, unless acted upon by an external force." },
  { timestamp: 75, text: "This is also known as the Law of Inertia." },
  { timestamp: 120, text: "Let's look at Newton's Second Law: F equals m times a." },
  { timestamp: 150, text: "The acceleration of an object is directly proportional to the net force." },
  { timestamp: 195, text: "And inversely proportional to its mass." },
  { timestamp: 240, text: "Now, let's solve a practical example using the quadratic formula." },
  { timestamp: 300, text: "If a car of mass 1200 kg accelerates at 2 metres per second squared, what is the net force?" },
  { timestamp: 345, text: "Using F = ma, we get F = 1200 times 2, which equals 2400 Newtons." },
  { timestamp: 390, text: "Let's move on to Newton's Third Law: every action has an equal and opposite reaction." },
  { timestamp: 450, text: "When you push against a wall, the wall pushes back against you with equal force." },
  { timestamp: 510, text: "This is why rockets work — they expel gas downward, and the reaction force pushes them upward." },
  { timestamp: 570, text: "Let's discuss momentum: p equals m times v." },
  { timestamp: 630, text: "The principle of conservation of momentum states that total momentum is conserved in a closed system." },
  { timestamp: 690, text: "Here's a worked example involving a collision between two trolleys." },
  { timestamp: 750, text: "Before the collision, trolley A has mass 2 kg moving at 3 m/s." },
  { timestamp: 810, text: "After the collision, both trolleys stick together. What is their combined velocity?" },
  { timestamp: 870, text: "Using conservation of momentum: 2 × 3 = (2 + 1) × v, so v = 2 m/s." },
  { timestamp: 930, text: "That's all for today. Remember to complete the quiz on Forces and Motion!" },
];

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function TranscriptSearch({ onSeek }: TranscriptSearchProps) {
  const [query, setQuery] = useState("");

  const filteredResults = useMemo(() => {
    if (!query.trim()) return [];
    const lower = query.toLowerCase();
    return MOCK_TRANSCRIPT.filter((entry) =>
      entry.text.toLowerCase().includes(lower)
    );
  }, [query]);

  const highlightMatch = (text: string) => {
    if (!query.trim()) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className="bg-accent/20 text-accent-foreground rounded px-0.5">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  return (
    <div className="w-full space-y-2">
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search transcript…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-10 rounded-xl bg-card/80 backdrop-blur-sm border-border/40 shadow-[0_2px_12px_rgb(0,0,0,0.03)]"
        />
      </div>

      {/* Results */}
      {query.trim() && (
        <div className="rounded-2xl bg-card/90 backdrop-blur-md border border-border/30 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
          {filteredResults.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">
              No matches found for "{query}"
            </div>
          ) : (
            <ScrollArea className="max-h-[240px]">
              <div className="divide-y divide-border/30">
                {filteredResults.map((entry, i) => (
                  <button
                    key={i}
                    className={cn(
                      "w-full flex items-start gap-3 p-3 text-left",
                      "hover:bg-secondary/50 transition-colors duration-150 group"
                    )}
                    onClick={() => onSeek(entry.timestamp)}
                  >
                    <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                      <PlayCircle className="w-4 h-4 text-accent opacity-0 group-hover:opacity-100 transition-opacity" strokeWidth={1.5} />
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                        <Clock className="w-2.5 h-2.5" strokeWidth={1.5} />
                        {formatTimestamp(entry.timestamp)}
                      </span>
                    </div>
                    <p className="text-sm text-foreground/80 leading-relaxed">
                      {highlightMatch(entry.text)}
                    </p>
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}
          <div className="px-3 py-2 border-t border-border/30 text-xs text-muted-foreground">
            {filteredResults.length} result{filteredResults.length !== 1 ? "s" : ""}
          </div>
        </div>
      )}
    </div>
  );
}
