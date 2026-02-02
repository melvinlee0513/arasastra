import { Badge } from "@/components/ui/badge";
import { Star, Zap, Trophy, Crown, Flame } from "lucide-react";
import { cn } from "@/lib/utils";

interface LevelBadgeProps {
  xpPoints: number;
  className?: string;
  showXP?: boolean;
}

interface LevelInfo {
  level: number;
  title: string;
  icon: React.ElementType;
  minXP: number;
  maxXP: number;
  colorClass: string;
}

const levels: LevelInfo[] = [
  { level: 1, title: "Scholar", icon: Star, minXP: 0, maxXP: 199, colorClass: "bg-slate-500" },
  { level: 2, title: "Learner", icon: Zap, minXP: 200, maxXP: 499, colorClass: "bg-green-500" },
  { level: 3, title: "Achiever", icon: Trophy, minXP: 500, maxXP: 999, colorClass: "bg-blue-500" },
  { level: 4, title: "Expert", icon: Crown, minXP: 1000, maxXP: 1999, colorClass: "bg-purple-500" },
  { level: 5, title: "Master", icon: Flame, minXP: 2000, maxXP: Infinity, colorClass: "bg-accent" },
];

export function getLevelInfo(xpPoints: number): LevelInfo {
  return levels.find(l => xpPoints >= l.minXP && xpPoints <= l.maxXP) || levels[0];
}

export function LevelBadge({ xpPoints, className, showXP = false }: LevelBadgeProps) {
  const levelInfo = getLevelInfo(xpPoints);
  const Icon = levelInfo.icon;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Badge 
        variant="secondary" 
        className={cn(
          "gap-1.5 px-2 py-0.5 text-xs font-semibold",
          levelInfo.colorClass,
          "text-white border-0"
        )}
      >
        <Icon className="w-3 h-3" />
        Lvl {levelInfo.level} {levelInfo.title}
      </Badge>
      {showXP && (
        <span className="text-xs text-muted-foreground">
          {xpPoints.toLocaleString()} XP
        </span>
      )}
    </div>
  );
}
