import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type MoreTone = "timetable" | "inbox" | "achievements" | "leaderboard";

const TONES: Record<MoreTone, { bubble: string; icon: string; tint: string }> = {
  timetable: {
    bubble: "bg-more-timetable",
    icon: "text-more-timetable-accent",
    tint: "bg-white",
  },
  inbox: { bubble: "bg-more-inbox", icon: "text-more-inbox-accent", tint: "bg-white" },
  achievements: {
    bubble: "bg-more-achievements",
    icon: "text-more-achievements-accent",
    tint: "bg-white",
  },
  leaderboard: {
    bubble: "bg-more-leaderboard",
    icon: "text-more-leaderboard-accent",
    tint: "bg-white",
  },
};

export interface MoreServiceCardProps {
  to: string;
  title: string;
  icon: LucideIcon;
  tone: MoreTone;
  /** Small muted label above the context value, e.g. "Next class". */
  contextLabel?: string;
  /** One-line context value, or a fallback CTA when data is unavailable. */
  contextValue?: string;
  /** Compact unread badge attached to the icon. */
  badgeCount?: number;
  /** Accessible description appended to the card name. */
  accessibleContext?: string;
  loading?: boolean;
}

/**
 * One tappable service card in the student mobile "More" utility hub.
 * The whole card is the link; the chevron is decorative.
 */
export function MoreServiceCard({
  to,
  title,
  icon: Icon,
  tone,
  contextLabel,
  contextValue,
  badgeCount,
  accessibleContext,
  loading,
}: MoreServiceCardProps) {
  const t = TONES[tone];
  const showBadge = typeof badgeCount === "number" && badgeCount > 0;

  return (
    <Link
      to={to}
      aria-label={accessibleContext ? `${title} — ${accessibleContext}` : title}
      className={cn(
        "group relative flex min-h-[132px] flex-col rounded-[22px] p-4",
        t.tint,
        "border border-slate-200/80 shadow-[0_2px_10px_rgba(15,23,42,0.04)]",
        "transition-transform duration-150 ease-out motion-reduce:transition-none",
        "active:scale-[0.985] active:shadow-[0_1px_4px_rgba(15,23,42,0.04)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
      )}
    >
      <div className="relative w-fit">
        <span
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-full",
            t.bubble,
          )}
        >
          <Icon className={cn("h-5 w-5", t.icon)} strokeWidth={1.75} aria-hidden="true" />
        </span>
        {showBadge && (
          <span
            className="absolute -right-1.5 -top-1.5 flex h-[19px] min-w-[19px] items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-semibold leading-none text-white"
            aria-hidden="true"
          >
            {badgeCount! > 9 ? "9+" : badgeCount}
          </span>
        )}
      </div>

      <p className="mt-3 text-[15px] font-semibold leading-tight text-slate-900">{title}</p>

      <div className="mt-2 min-h-[30px] flex-1">
        {loading ? (
          <div className="space-y-1.5" aria-hidden="true">
            <div className="h-2.5 w-14 animate-pulse rounded-full bg-slate-200" />
            <div className="h-2.5 w-20 animate-pulse rounded-full bg-slate-100" />
          </div>
        ) : (
          <>
            {contextLabel && (
              <p className="text-[11px] leading-tight text-slate-400">{contextLabel}</p>
            )}
            {contextValue && (
              <p className="line-clamp-2 text-[12.5px] font-medium leading-snug text-slate-600">
                {contextValue}
              </p>
            )}
          </>
        )}
      </div>

      <ChevronRight
        className="mt-1 h-4 w-4 self-end text-slate-300 transition-transform duration-150 ease-out group-active:translate-x-0.5 motion-reduce:transition-none"
        aria-hidden="true"
      />
    </Link>
  );
}

export default MoreServiceCard;
