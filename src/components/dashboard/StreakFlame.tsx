import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

interface StreakFlameProps {
  streak: number;
  className?: string;
}

/**
 * StreakFlame — Animated flame indicator for consecutive active days.
 * Soft-Tech: glassmorphism card, subtle glow, high whitespace.
 */
export function StreakFlame({ streak, className }: StreakFlameProps) {
  if (streak <= 0) return null;

  const intensity = streak >= 7 ? "legendary" : streak >= 5 ? "hot" : streak >= 3 ? "warm" : "spark";

  return (
    <Card className={cn(
      "inline-flex items-center gap-3 px-4 py-2.5 rounded-full",
      "bg-card/70 backdrop-blur-md border-border/40 shadow-sm",
      className
    )}>
      <div className="relative">
        {/* Glow layer */}
        <div
          className={cn(
            "absolute inset-0 rounded-full blur-md transition-all duration-500",
            intensity === "legendary" && "bg-destructive/30 animate-pulse scale-150",
            intensity === "hot" && "bg-accent/25 animate-pulse scale-125",
            intensity === "warm" && "bg-accent/15 scale-110",
            intensity === "spark" && "bg-accent/10"
          )}
        />
        <div className={cn(
          "relative w-9 h-9 rounded-full flex items-center justify-center",
          "transition-all duration-300",
          intensity === "legendary" && "animate-streak-flame-legendary",
          intensity === "hot" && "animate-streak-flame-hot",
          intensity === "warm" && "animate-streak-flame-warm",
          intensity === "spark" && "animate-streak-flame-spark"
        )}>
          <Flame
            className={cn(
              "w-5 h-5 transition-colors duration-300",
              intensity === "legendary" && "text-destructive",
              intensity === "hot" && "text-accent",
              intensity === "warm" && "text-accent",
              intensity === "spark" && "text-muted-foreground"
            )}
          />
        </div>
      </div>
      <div>
        <p className={cn(
          "text-sm font-bold leading-none",
          intensity === "legendary" ? "text-destructive" : "text-foreground"
        )}>
          {streak} Day{streak !== 1 ? "s" : ""}
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {intensity === "legendary" ? "🔥 On Fire!" : intensity === "hot" ? "Keep going!" : intensity === "warm" ? "Nice streak!" : "Started!"}
        </p>
      </div>
    </Card>
  );
}
