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
  className?: string;
}

/**
 * Native-style mobile app bar: `← Parent   Title   [right]`.
 * Mobile-only by default — desktop keeps breadcrumbs.
 */
export function MobileTopBar({
  backTo,
  backLabel,
  title,
  right,
  className,
}: MobileTopBarProps) {
  return (
    <div
      className={cn(
        "md:hidden sticky top-0 z-40 -mx-4 px-2 bg-background/95 backdrop-blur-md border-b border-border",
        className,
      )}
    >
      <div className="h-14 flex items-center gap-1">
        <Link
          to={backTo}
          aria-label={`Back to ${backLabel}`}
          className="inline-flex items-center gap-0.5 min-h-[44px] min-w-[44px] px-2 rounded-full text-[15px] font-medium text-primary active:bg-primary/10"
        >
          <ChevronLeft className="w-5 h-5 shrink-0" />
          <span className="max-w-[30vw] truncate">{backLabel}</span>
        </Link>
        <span className="flex-1 min-w-0 text-center text-[15px] font-semibold text-foreground truncate px-1">
          {title}
        </span>
        <div className="min-w-[44px] flex items-center justify-end pr-1">{right}</div>
      </div>
    </div>
  );
}
