import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";

interface StreakFlameProps {
  streak: number;
  className?: string;
}

export function StreakFlame({ streak, className }: StreakFlameProps) {
  if (streak <= 0) return null;

  const intensity = streak >= 7 ? "legendary" : streak >= 5 ? "hot" : streak >= 3 ? "warm" : "spark";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="relative">
        {/* Glow layers */}
        <div
          className={cn(
            "absolute inset-0 rounded-full blur-md transition-all duration-500",
            intensity === "legendary" && "bg-destructive/40 animate-pulse scale-150",
            intensity === "hot" && "bg-accent/30 animate-pulse scale-125",
            intensity === "warm" && "bg-accent/20 scale-110",
            intensity === "spark" && "bg-accent/10"
          )}
        />
        <div className={cn(
          "relative w-10 h-10 rounded-full flex items-center justify-center",
          "transition-all duration-300",
          intensity === "legendary" && "animate-streak-flame-legendary",
          intensity === "hot" && "animate-streak-flame-hot",
          intensity === "warm" && "animate-streak-flame-warm",
          intensity === "spark" && "animate-streak-flame-spark"
        )}>
          <Flame
            className={cn(
              "w-6 h-6 transition-colors duration-300",
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
        <p className="text-xs text-muted-foreground">
          {intensity === "legendary" ? "🔥 On Fire!" : intensity === "hot" ? "Keep going!" : intensity === "warm" ? "Nice streak!" : "Started!"}
        </p>
      </div>
    </div>
  );
}
