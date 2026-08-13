import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface MobileTopBarProps {
  /** Logical parent route — resolved, never history-only. */
  backTo: string;
  /** Short parent name shown next to the chevron. */
  backLabel: string;
  /** Current page/activity title. */
  title: string;
  /** Optional trailing slot (progress, timer, overflow menu). */
  right?: ReactNode;
  /**
   * `pill` renders the current title as a tinted chip (Class Hub sections);
   * `plain` keeps the default right-aligned label.
   */
  titleVariant?: "plain" | "pill";
  className?: string;
}


/**
 * Mobile-only floating pill navigation: `‹ Parent … Title [right]`.
 *
 * Sticky, inset from the viewport edges, safe-area aware. Desktop keeps
 * breadcrumbs so this component is hidden from `md:` up.
 */
export function MobileTopBar({
  backTo,
  backLabel,
  title,
  right,
  titleVariant = "plain",
  className,
}: MobileTopBarProps) {
  return (
    <div
      className={cn("md:hidden sticky z-40 -mx-1", className)}
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 10px)" }}
    >
      <div className="flex items-center gap-1 h-[50px] px-1.5 rounded-full bg-white/90 backdrop-blur-xl border border-slate-200/80 shadow-[0_6px_24px_rgb(0,0,0,0.08)]">
        <Link
          to={backTo}
          aria-label={`Back to ${backLabel}`}
          className="inline-flex items-center gap-0.5 h-[44px] min-w-[44px] pl-1.5 pr-2 rounded-full text-[14px] font-medium text-primary active:bg-primary/10 shrink-0 max-w-[45%]"
        >
          <ChevronLeft className="w-5 h-5 shrink-0" aria-hidden="true" />
          <span className="truncate">{backLabel}</span>
        </Link>
        {titleVariant === "pill" ? (
          <span className="flex-1 min-w-0 flex justify-end pr-1">
            <span className="max-w-full truncate rounded-full bg-hub-tint px-3 py-1.5 text-[13px] font-semibold text-hub-accent">
              {title}
            </span>
          </span>
        ) : (
          <span className="flex-1 min-w-0 text-right text-[15px] font-semibold text-slate-900 truncate pr-2">
            {title}
          </span>
        )}
        {right && <div className="min-w-[44px] flex items-center justify-end pr-1">{right}</div>}
      </div>
    </div>

  );
}
