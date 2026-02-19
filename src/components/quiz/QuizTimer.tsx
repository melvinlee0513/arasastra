import { cn } from "@/lib/utils";

interface QuizTimerProps {
  timeLeft: number;
  totalTime: number;
  isFrozen: boolean;
}

export function QuizTimer({ timeLeft, totalTime, isFrozen }: QuizTimerProps) {
  const pct = (timeLeft / totalTime) * 100;
  const circumference = 2 * Math.PI * 22;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="relative w-14 h-14 flex items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 48 48">
        <circle cx="24" cy="24" r="22" fill="none" stroke="currentColor" strokeWidth="3"
          className="text-primary-foreground/10" />
        <circle cx="24" cy="24" r="22" fill="none" strokeWidth="3"
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          className={cn(
            "transition-all duration-1000 ease-linear",
            timeLeft <= 5 ? "text-destructive" : timeLeft <= 10 ? "text-accent" : "text-[hsl(150,60%,45%)]",
            isFrozen && "text-[hsl(200,80%,60%)]"
          )}
        />
      </svg>
      <span className={cn(
        "font-mono font-black text-lg z-10",
        timeLeft <= 5 ? "text-destructive animate-pulse" : "text-primary-foreground",
        isFrozen && "text-[hsl(200,80%,60%)]"
      )}>
        {isFrozen ? "❄️" : timeLeft}
      </span>
    </div>
  );
}
