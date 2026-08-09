import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, RotateCcw } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Soft Modular Dashboard primitives for the student mobile Home.
 *
 * Every lower Home section is a rounded, pale-tinted module that shares radius,
 * padding, typography and inner-card treatment. Sections differ only by tone.
 */
export type HomeTone = "updates" | "learning" | "schedule" | "ranking";

const TONE_SURFACE: Record<HomeTone, string> = {
  updates: "bg-home-updates",
  learning: "bg-home-learning",
  schedule: "bg-home-schedule",
  ranking: "bg-home-ranking",
};

const TONE_ICON: Record<HomeTone, string> = {
  updates: "bg-white/80 text-home-updates-accent",
  learning: "bg-white/80 text-home-learning-accent",
  schedule: "bg-white/80 text-home-schedule-accent",
  ranking: "bg-white/80 text-home-ranking-accent",
};

const TONE_ACTION: Record<HomeTone, string> = {
  updates: "text-home-updates-accent",
  learning: "text-home-learning-accent",
  schedule: "text-home-schedule-accent",
  ranking: "text-home-ranking-accent",
};

interface HomeModuleProps {
  tone: HomeTone;
  title: string;
  icon: LucideIcon;
  action?: { label: string; to: string };
  /** Rendered inline in the header (e.g. a segmented control). */
  headerAside?: ReactNode;
  children: ReactNode;
}

/** Outer coloured section container: header + inner content. */
export function HomeModule({
  tone,
  title,
  icon: Icon,
  action,
  headerAside,
  children,
}: HomeModuleProps) {
  return (
    <section className={cn("rounded-[24px] p-4", TONE_SURFACE[tone])}>
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
            TONE_ICON[tone],
          )}
        >
          <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
        <h2 className="min-w-0 flex-1 truncate text-[18px] font-semibold text-slate-900">
          {title}
        </h2>
        {action && (
          <Link
            to={action.to}
            className={cn(
              "-my-2 inline-flex min-h-[44px] items-center gap-0.5 whitespace-nowrap px-1 text-[13px] font-medium active:opacity-70",
              TONE_ACTION[tone],
            )}
          >
            {action.label}
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        )}
      </div>

      {headerAside && <div className="mt-3">{headerAside}</div>}

      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Inner white content card shared by every module. */
export function HomeCard({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("rounded-[20px] bg-white/90 p-4", className)}>{children}</div>
  );
}

interface SectionHeaderProps {
  title: string;
  action?: { label: string; to: string };
  children?: React.ReactNode;
}

/** Legacy plain header, kept for non-modular surfaces. */
export function SectionHeader({ title, action, children }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-3 px-1">
      <h2 className="text-[17px] font-semibold text-slate-900">{title}</h2>
      {children}
      {action && (
        <Link
          to={action.to}
          className="inline-flex items-center gap-0.5 text-[13px] font-medium text-primary min-h-[44px] active:opacity-70"
        >
          {action.label}
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

interface HomeErrorStateProps {
  message: string;
  onRetry: () => void;
}

/** Compact, safe error state — never a fabricated empty state. */
export function HomeErrorState({ message, onRetry }: HomeErrorStateProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[20px] bg-white/90 px-4 py-3">
      <p className="text-[13px] text-slate-600">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-slate-100 px-3 py-2 text-[13px] font-medium text-slate-900 active:bg-slate-200"
      >
        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
        Retry
      </button>
    </div>
  );
}
