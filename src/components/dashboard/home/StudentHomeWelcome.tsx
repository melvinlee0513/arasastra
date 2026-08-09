import { Flame, Zap, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

interface StudentHomeWelcomeProps {
  firstName: string;
  isLoading?: boolean;
}

/**
 * Compact mobile greeting — plain page background, no giant card.
 */
export function StudentHomeWelcome({ firstName, isLoading }: StudentHomeWelcomeProps) {
  return (
    <header className="space-y-1">
      {isLoading ? (
        <>
          <div className="h-7 w-3/5 rounded-lg bg-slate-200 animate-pulse" />
          <div className="h-4 w-2/5 rounded bg-slate-200 animate-pulse" />
        </>
      ) : (
        <>
          <h1 className="text-[22px] md:text-3xl font-bold text-slate-900 leading-tight">
            Welcome back{firstName ? `, ${firstName}` : ""} 👋
          </h1>
          <p className="text-[14px] md:text-base text-slate-500">
            Ready to learn something new today?
          </p>
        </>
      )}
    </header>
  );
}

interface StudentHomeGamificationProps {
  show: boolean;
  showRank: boolean;
  isLoading: boolean;
  streak: number;
  totalXp: number;
  rank: number | null;
}

/** Three compact stat chips: streak, XP and weekly rank. */
export function StudentHomeGamification({
  show,
  showRank,
  isLoading,
  streak,
  totalXp,
  rank,
}: StudentHomeGamificationProps) {
  if (!show) return null;

  if (isLoading) {
    return (
      <div className="flex flex-wrap gap-2" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-9 w-[104px] rounded-full bg-slate-200 animate-pulse" />
        ))}
      </div>
    );
  }

  const chips: { icon: typeof Flame; label: string; tone: string }[] = [
    {
      icon: Flame,
      label: `${streak} day${streak === 1 ? "" : "s"} streak`,
      tone: "text-orange-500",
    },
    { icon: Zap, label: `${totalXp.toLocaleString()} XP`, tone: "text-primary" },
  ];

  if (showRank && rank !== null) {
    chips.push({ icon: Trophy, label: `#${rank} this week`, tone: "text-amber-500" });
  }

  return (
    <ul className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <li
          key={chip.label}
          className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-2 shadow-[0_2px_10px_rgba(15,23,42,0.04)]"
        >
          <chip.icon className={cn("w-4 h-4 shrink-0", chip.tone)} aria-hidden="true" />
          <span className="text-[13px] font-medium text-slate-900 whitespace-nowrap">
            {chip.label}
          </span>
        </li>
      ))}
    </ul>
  );
}
