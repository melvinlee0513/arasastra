import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, RotateCcw } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Student mobile Home primitives.
 *
 * The Home page is a "daily learning feed": a neutral page background with a
 * consistent section header, while each section's content adopts the visual
 * structure of the information it carries (carousel, deck, timeline, podium).
 */

interface HomeSectionHeaderProps {
  title: string;
  icon: LucideIcon;
  /** Icon bubble + accent colour classes, e.g. "bg-home-updates text-home-updates-accent". */
  accentClassName?: string;
  action?: { label: string; to: string };
  /** Small caption rendered under the title (e.g. "This week"). */
  caption?: string;
}

/** Unified section header: icon bubble, title, optional caption and action. */
export function HomeSectionHeader({
  title,
  icon: Icon,
  accentClassName = "bg-primary/10 text-primary",
  action,
  caption,
}: HomeSectionHeaderProps) {
  return (
    <div className="flex items-center gap-2.5 px-0.5">
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px]",
          accentClassName,
        )}
      >
        <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-[18px] font-bold leading-tight text-slate-900">
          {title}
        </h2>
        {caption && (
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            {caption}
          </p>
        )}
      </div>
      {action && (
        <Link
          to={action.to}
          className="-my-2 inline-flex min-h-[44px] items-center gap-0.5 whitespace-nowrap px-1 text-[13px] font-semibold text-slate-500 active:opacity-70"
        >
          {action.label}
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

/** Section wrapper: header + content, no pastel container. */
export function HomeSection({
  header,
  children,
  className,
}: {
  header: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-3", className)}>
      {header}
      {children}
    </section>
  );
}

/** Compact neutral empty state used across Home sections. */
export function HomeEmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; to: string };
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-[20px] border border-slate-200/80 bg-white px-4 py-6 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
        <Icon className="h-[18px] w-[18px] text-slate-400" aria-hidden="true" />
      </span>
      <p className="text-[14.5px] font-semibold text-slate-900">{title}</p>
      {description && <p className="text-[13px] text-slate-500">{description}</p>}
      {action && (
        <Link
          to={action.to}
          className="mt-1 inline-flex min-h-[44px] items-center gap-1 text-[13px] font-semibold text-primary active:opacity-70"
        >
          {action.label}
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

/** Compact, safe error state — never a fabricated empty state. */
export function HomeErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[20px] border border-slate-200/80 bg-white px-4 py-3">
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
