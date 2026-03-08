import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useUserProgress } from "@/hooks/useUserProgress";

/**
 * StreakWidget — Compact flame widget for the top navigation bar.
 * Muted when streak is 0, glowing Electric Blue when active.
 */
export function StreakWidget() {
  const { progress, isAuthenticated } = useUserProgress();
  const streak = progress.streak;

  if (!isAuthenticated) return null;

  const isActive = streak > 0;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className={cn(
            "relative flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all duration-300",
            "bg-card/70 backdrop-blur-md border border-border/40",
            isActive && "shadow-[0_0_16px_hsl(var(--accent)/0.3)]"
          )}
        >
          <div className="relative">
            {isActive && (
              <div className="absolute inset-0 rounded-full blur-md bg-accent/30 animate-pulse" />
            )}
            <Flame
              className={cn(
                "w-4 h-4 relative transition-all duration-300",
                isActive
                  ? "text-accent drop-shadow-[0_0_8px_hsl(var(--accent)/0.8)]"
                  : "text-muted-foreground"
              )}
              strokeWidth={1.5}
            />
          </div>
          <span
            className={cn(
              "text-sm font-bold tabular-nums",
              isActive ? "text-accent" : "text-muted-foreground"
            )}
          >
            {streak}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[220px] text-center">
        <p className="text-xs">
          {isActive
            ? `🔥 ${streak}-day streak! Keep it going!`
            : "Watch a video or finish a quiz to keep your streak alive!"}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
