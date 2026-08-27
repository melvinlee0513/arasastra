/**
 * Shared presentation primitives for the light-themed student quiz surfaces
 * (Quiz Hub, Quiz Library). Purely presentational — no data or access logic.
 */

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { QUIZ_ART } from "@/lib/quizArt";

export function QuizArt({
  src,
  className,
  alt = "",
}: {
  src: string;
  className?: string;
  alt?: string;
}) {
  return (
    <img
      src={src}
      alt={alt}
      aria-hidden={alt === "" ? true : undefined}
      loading="lazy"
      decoding="async"
      draggable={false}
      className={cn("pointer-events-none select-none object-contain", className)}
    />
  );
}

/** Rounded stat chip (streak / XP / level) used above the quiz surfaces. */
export function QuizStatChip({
  art,
  value,
  label,
  tone = "accent",
}: {
  art: string;
  value: string;
  label: string;
  tone?: "accent" | "xp" | "streak";
}) {
  const tones: Record<string, string> = {
    accent: "bg-quiz-tint text-quiz-accent-strong ring-quiz-accent/15",
    xp: "bg-amber-50 text-amber-700 ring-amber-400/20",
    streak: "bg-orange-50 text-orange-700 ring-orange-400/20",
  };
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 items-center gap-2 rounded-2xl px-3 py-2.5 ring-1 ring-inset",
        tones[tone],
      )}
    >
      <QuizArt src={art} className="h-7 w-7 shrink-0 drop-shadow-[0_4px_8px_rgba(15,23,42,0.14)]" />
      <div className="min-w-0">
        <p className="truncate text-[15px] font-bold leading-none">{value}</p>
        <p className="truncate text-[11px] font-medium opacity-70">{label}</p>
      </div>
    </div>
  );
}

export function QuizSectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3 px-0.5">
      <div className="min-w-0">
        <h2 className="truncate text-[17px] font-bold text-slate-900">{title}</h2>
        {subtitle && <p className="truncate text-[13px] text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/** Large featured card — the hub's primary call to action. */
export function QuizFeatureCard({
  eyebrow,
  title,
  meta,
  art,
  cta,
  to,
  onClick,
  disabled,
}: {
  eyebrow: string;
  title: string;
  meta: ReactNode;
  art: string;
  cta: string;
  to?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const body = (
    <div className="relative isolate overflow-hidden rounded-[28px] bg-gradient-to-br from-quiz-accent to-quiz-accent-strong p-5 text-white shadow-[0_18px_40px_-18px_hsl(var(--quiz-accent)/0.65)] sm:p-6">
      <QuizArt
        src={QUIZ_ART.starsOrbs}
        className="absolute -right-6 -top-8 h-32 w-32 opacity-40"
      />
      <QuizArt
        src={QUIZ_ART.cloudsBottomSparkles}
        className="absolute inset-x-0 bottom-0 h-16 w-full object-cover opacity-40"
      />
      <div className="relative flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/75">
            {eyebrow}
          </p>
          <h3 className="mt-1 line-clamp-2 text-[20px] font-extrabold leading-tight sm:text-2xl">
            {title}
          </h3>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">{meta}</div>
          <span
            className={cn(
              "mt-4 inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-5 text-[15px] font-bold shadow-sm",
              disabled
                ? "bg-white/25 text-white/70"
                : "bg-white text-quiz-accent-strong",
            )}
          >
            {cta} <ChevronRight className="h-4 w-4" />
          </span>
        </div>
        <QuizArt
          src={art}
          className="h-28 w-28 shrink-0 drop-shadow-[0_14px_24px_rgba(15,23,42,0.28)] sm:h-36 sm:w-36"
        />
      </div>
    </div>
  );

  if (disabled) return body;
  if (to) return <Link to={to} className="block active:scale-[0.99] transition-transform">{body}</Link>;
  return (
    <button type="button" onClick={onClick} className="block w-full text-left active:scale-[0.99] transition-transform">
      {body}
    </button>
  );
}

/** Compact pill used for question counts, durations, due dates. */
export function QuizMetaPill({
  icon,
  children,
  tone = "neutral",
}: {
  icon?: ReactNode;
  children: ReactNode;
  tone?: "neutral" | "light" | "warn" | "good";
}) {
  const tones: Record<string, string> = {
    neutral: "bg-slate-100 text-slate-600",
    light: "bg-white/20 text-white",
    warn: "bg-amber-100 text-amber-800",
    good: "bg-emerald-100 text-emerald-800",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold",
        tones[tone],
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/** Illustrated tile used in the hub's "Trending"/subject carousels. */
export function QuizTile({
  art,
  title,
  subtitle,
  meta,
  to,
  onClick,
  badge,
}: {
  art: string;
  title: string;
  subtitle?: string | null;
  meta?: ReactNode;
  to?: string;
  onClick?: () => void;
  badge?: ReactNode;
}) {
  const inner = (
    <div className="relative flex h-full w-[188px] shrink-0 snap-start flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-3.5 text-left shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-transform active:scale-[0.98] sm:w-[210px]">
      <div className="relative mb-3 flex h-24 items-center justify-center rounded-2xl bg-quiz-tint">
        <QuizArt src={art} className="h-20 w-20 drop-shadow-[0_10px_18px_rgba(15,23,42,0.18)]" />
        {badge && <div className="absolute right-2 top-2">{badge}</div>}
      </div>
      <p className="line-clamp-2 text-[14px] font-bold leading-snug text-slate-900">{title}</p>
      {subtitle && <p className="mt-0.5 truncate text-[12px] text-slate-500">{subtitle}</p>}
      {meta && <div className="mt-2 flex flex-wrap gap-1.5">{meta}</div>}
    </div>
  );
  if (to) return <Link to={to} className="shrink-0 snap-start">{inner}</Link>;
  return (
    <button type="button" onClick={onClick} className="shrink-0 snap-start">
      {inner}
    </button>
  );
}

/** Horizontal snap carousel wrapper with edge bleed on mobile. */
export function QuizCarousel({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:px-0">
      <div className="flex snap-x snap-mandatory gap-3">{children}</div>
    </div>
  );
}

/** Full-width list row (recently played, due soon, locked). */
export function QuizRow({
  art,
  title,
  subtitle,
  right,
  progress,
  to,
  onClick,
  disabled,
}: {
  art: string;
  title: string;
  subtitle?: string | null;
  right?: ReactNode;
  progress?: number | null;
  to?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const inner = (
    <div
      className={cn(
        "flex w-full items-center gap-3 rounded-3xl border border-slate-200/80 bg-white p-3.5 text-left shadow-[0_8px_30px_rgb(0,0,0,0.04)]",
        !disabled && "transition-transform active:scale-[0.99]",
        disabled && "opacity-70",
      )}
    >
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-quiz-tint">
        <QuizArt src={art} className="h-10 w-10 drop-shadow-[0_6px_12px_rgba(15,23,42,0.16)]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-bold text-slate-900">{title}</p>
        {subtitle && <p className="mt-0.5 truncate text-[12.5px] text-slate-500">{subtitle}</p>}
        {typeof progress === "number" && (
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-quiz-accent"
              style={{ width: `${Math.max(4, Math.min(100, progress))}%` }}
            />
          </div>
        )}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );

  if (disabled) return inner;
  if (to) return <Link to={to} className="block">{inner}</Link>;
  return (
    <button type="button" onClick={onClick} className="block w-full">
      {inner}
    </button>
  );
}

/** Illustrated empty / error state used across the quiz surfaces. */
export function QuizEmptyState({
  art,
  title,
  description,
  action,
}: {
  art: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white px-6 py-10 text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
      <QuizArt
        src={art}
        className="mx-auto mb-4 h-28 w-28 drop-shadow-[0_14px_24px_rgba(15,23,42,0.16)]"
      />
      <h3 className="text-[16px] font-bold text-slate-900">{title}</h3>
      <p className="mx-auto mt-1 max-w-sm text-[13.5px] text-slate-500">{description}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
