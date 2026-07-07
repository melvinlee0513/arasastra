import { Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface XPLevelChipProps {
  level: number;
  totalXp: number;
  progressPct: number;
  xpToNextLevel: number;
  className?: string;
}

/**
 * Compact XP + level indicator with animated fill bar.
 * Soft-Tech: glassmorphism pill, primary accent, high contrast typography.
 */
export function XPLevelChip({
  level,
  totalXp,
  progressPct,
  xpToNextLevel,
  className,
}: XPLevelChipProps) {
  return (
    <Card
      className={cn(
        "inline-flex items-center gap-3 pl-2 pr-4 py-2 rounded-full",
        "bg-card/70 backdrop-blur-md border-border/40 shadow-sm",
        className,
      )}
    >
      <div className="relative w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
        <Sparkles className="w-4 h-4 text-primary" />
        <span className="absolute -bottom-1 -right-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground shadow-sm">
          {level}
        </span>
      </div>
      <div className="min-w-[7rem]">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-bold text-foreground leading-none">Lv {level}</p>
          <p className="text-[11px] text-muted-foreground tabular-nums">
            {totalXp.toLocaleString()} XP
          </p>
        </div>
        <div className="mt-1.5 h-1.5 rounded-full bg-muted/50 overflow-hidden">
          <div
            className="h-full bg-primary transition-[width] duration-700 ease-out rounded-full"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          {xpToNextLevel} XP to Lv {level + 1}
        </p>
      </div>
    </Card>
  );
}
