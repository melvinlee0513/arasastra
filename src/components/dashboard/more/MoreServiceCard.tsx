import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { DecorArt } from "@/components/dashboard/services/StudentServiceChrome";
import { DECOR_ART } from "@/lib/studentIllustrations";

export type MoreTone = "timetable" | "inbox" | "achievements" | "leaderboard";

interface ToneStyle {
  /** Pastel illustration zone. */
  zone: string;
  /** Bottom accent edge / glow. */
  edge: string;
  /** Circular arrow affordance. */
  arrow: string;
  /** Soft outer ring. */
  border: string;
}

const TONES: Record<MoreTone, ToneStyle> = {
  timetable: {
    zone: "bg-[linear-gradient(160deg,#eaf2ff_0%,#dfeaff_100%)]",
    edge: "bg-blue-400/70 shadow-[0_-6px_18px_rgba(59,130,246,0.30)]",
    arrow: "bg-blue-500/10 text-blue-600",
    border: "border-blue-100",
  },
  inbox: {
    zone: "bg-[linear-gradient(160deg,#f1ecff_0%,#e8e1ff_100%)]",
    edge: "bg-violet-400/70 shadow-[0_-6px_18px_rgba(139,92,246,0.30)]",
    arrow: "bg-violet-500/10 text-violet-600",
    border: "border-violet-100",
  },
  achievements: {
    zone: "bg-[linear-gradient(160deg,#fff6e2_0%,#ffeecb_100%)]",
    edge: "bg-amber-400/80 shadow-[0_-6px_18px_rgba(245,158,11,0.30)]",
    arrow: "bg-amber-500/10 text-amber-600",
    border: "border-amber-100",
  },
  leaderboard: {
    zone: "bg-[linear-gradient(160deg,#f3edff_0%,#ece2ff_100%)]",
    edge: "bg-purple-400/70 shadow-[0_-6px_18px_rgba(168,85,247,0.30)]",
    arrow: "bg-purple-500/10 text-purple-600",
    border: "border-purple-100",
  },
};

export interface MoreServiceCardProps {
  to: string;
  title: string;
  /** Soft-3D illustration for the tinted top zone. */
  art: string;
  tone: MoreTone;
  /** Small muted label above the context value, e.g. "Next class". */
  contextLabel?: string;
  /** One-line context value, or a fallback CTA when data is unavailable. */
  contextValue?: string;
  /** Compact unread badge attached to the illustration zone. */
  badgeCount?: number;
  /** Accessible description appended to the card name. */
  accessibleContext?: string;
  loading?: boolean;
}

/**
 * One large illustrated service card in the student mobile "More" hub.
 * The whole card is the link; artwork and the arrow are decorative.
 */
export function MoreServiceCard({
  to,
  title,
  art,
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
        "group relative flex flex-col overflow-hidden rounded-[26px] border bg-white",
        t.border,
        "shadow-[0_6px_22px_rgba(15,23,42,0.06)]",
        "transition-[transform,box-shadow] duration-200 ease-out motion-reduce:transition-none",
        "hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(15,23,42,0.10)]",
        "active:scale-[0.975] active:shadow-[0_2px_8px_rgba(15,23,42,0.06)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
      )}
    >
      {/* Illustration zone */}
      <div className={cn("relative flex h-[104px] items-center justify-center", t.zone)}>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <DecorArt src={DECOR_ART.cloudSoft} className="absolute left-2 top-2 h-6 w-6 opacity-50" />
          <DecorArt src={DECOR_ART.star} className="absolute right-3 bottom-2 h-4 w-4 opacity-45" />
        </div>
        <img
          src={art}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          width={72}
          height={72}
          className="relative h-[64px] w-[64px] object-contain drop-shadow-[0_6px_10px_rgba(15,23,42,0.16)] transition-transform duration-200 ease-out group-hover:scale-105 group-active:scale-95 motion-reduce:transition-none"
        />
        {showBadge && (
          <span className="absolute right-2.5 top-2.5 flex h-[22px] min-w-[22px] animate-scale-in items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold leading-none text-white shadow-[0_2px_8px_rgba(244,63,94,0.45)] motion-reduce:animate-none">
            {badgeCount! > 9 ? "9+" : badgeCount}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col px-3.5 pb-3.5 pt-3">
        <p className="text-[15px] font-bold leading-tight tracking-[-0.01em] text-slate-900">{title}</p>

        <div className="mt-1.5 min-h-[32px] flex-1">
          {loading ? (
            <div className="space-y-1.5" aria-hidden="true">
              <div className="h-2.5 w-14 animate-pulse rounded-full bg-slate-200" />
              <div className="h-2.5 w-20 animate-pulse rounded-full bg-slate-100" />
            </div>
          ) : (
            <>
              {contextLabel && (
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {contextLabel}
                </p>
              )}
              {contextValue && (
                <p className="line-clamp-2 text-[12.5px] font-medium leading-snug text-slate-600">
                  {contextValue}
                </p>
              )}
            </>
          )}
        </div>

        <span
          aria-hidden="true"
          className={cn(
            "mt-2 flex h-7 w-7 items-center justify-center self-end rounded-full",
            t.arrow,
          )}
        >
          <ChevronRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none" />
        </span>
      </div>

      {/* Theme edge */}
      <span aria-hidden="true" className={cn("absolute inset-x-6 bottom-0 h-[3px] rounded-full", t.edge)} />
    </Link>
  );
}

export default MoreServiceCard;
