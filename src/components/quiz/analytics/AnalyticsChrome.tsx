/**
 * Shared furniture for the tutor/admin analytics screens.
 *
 * Light mode, same family as the quiz builder: white cards on the off-white
 * page ground, lavender borders, pastel icon tiles, restrained purple accents.
 * The dark Quiz Arena belongs to student gameplay and never appears here.
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BuilderArt } from "@/components/quiz/builder/QuizBuilderChrome";
import { BAND_LABEL, type DifficultyBand } from "@/lib/quizAnalytics";

/** Page shell: sticky mobile header, safe-area padding, centred column. */
export function AnalyticsShell({
  title,
  backTo,
  onBack,
  action,
  children,
}: {
  title: string;
  backTo?: string;
  onBack?: () => void;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[hsl(250_40%_98%)]">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-[hsl(250_40%_98%)]/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+12px)] sm:px-6">
          {backTo ? (
            <Link
              to={backTo}
              aria-label="Back"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition active:scale-95"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </Link>
          ) : (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition active:scale-95"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
          <h1 className="min-w-0 flex-1 truncate text-center text-[19px] font-extrabold tracking-[-0.01em] text-slate-900 sm:text-[22px]">
            {title}
          </h1>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center">{action}</div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 pb-[calc(env(safe-area-inset-bottom)+28px)] pt-4 sm:px-6">
        {children}
      </main>
    </div>
  );
}

/** Quiz identity card with optional artwork — the hero on every screen. */
export function QuizContextCard({
  title,
  subtitle,
  art,
  action,
}: {
  title: string;
  subtitle?: string;
  art?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-quiz-accent/20 bg-quiz-tint p-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] sm:p-5">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[17px] font-extrabold leading-tight text-slate-900">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-0.5 truncate text-[13px] text-slate-600">{subtitle}</p>
          )}
          {action && <div className="mt-3">{action}</div>}
        </div>
        {art && <BuilderArt src={art} className="h-[72px] w-[72px] shrink-0 sm:h-20 sm:w-20" />}
      </div>
    </div>
  );
}

/** One headline number. The 2-column grid on the reference overview. */
export function StatCard({
  icon,
  tone,
  value,
  label,
  hint,
}: {
  icon: ReactNode;
  tone: "violet" | "emerald" | "sky" | "amber";
  value: string;
  label: string;
  hint?: string;
}) {
  const tones = {
    violet: "bg-violet-100 text-violet-600",
    emerald: "bg-emerald-100 text-emerald-600",
    sky: "bg-sky-100 text-sky-600",
    amber: "bg-amber-100 text-amber-600",
  } as const;
  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white p-3.5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] sm:p-4">
      <span
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-2xl",
          tones[tone],
        )}
        aria-hidden="true"
      >
        {icon}
      </span>
      <p className="mt-2.5 text-[22px] font-extrabold leading-none tracking-[-0.02em] text-slate-900 sm:text-[24px]">
        {value}
      </p>
      <p className="mt-1 text-[13px] font-semibold text-slate-700">{label}</p>
      {hint && <p className="mt-0.5 text-[11.5px] leading-snug text-slate-500">{hint}</p>}
    </div>
  );
}

/** Difficulty chip. Wording and colour both come from the server's band. */
export function BandPill({ band }: { band: DifficultyBand }) {
  const tones: Record<DifficultyBand, string> = {
    difficult: "bg-amber-100 text-amber-800",
    moderate: "bg-slate-100 text-slate-600",
    strong: "bg-emerald-100 text-emerald-700",
    unknown: "bg-slate-100 text-slate-500",
  };
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11.5px] font-semibold",
        tones[band],
      )}
    >
      {BAND_LABEL[band]}
    </span>
  );
}

/** Horizontal filter chips. Wraps rather than scrolling off a 320px screen. */
export function FilterChips<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: ReactNode }[];
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className={cn(
              "inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-4 text-[13.5px] font-semibold transition active:scale-95",
              active
                ? "border-quiz-accent bg-quiz-accent text-white"
                : "border-slate-200 bg-white text-slate-700",
            )}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Accuracy bar. Always paired with the number beside it — a bar alone would
 * make the value unavailable to a screen reader.
 */
export function AccuracyBar({
  pct,
  tone = "accent",
  className,
}: {
  pct: number | null;
  tone?: "accent" | "good" | "warn";
  className?: string;
}) {
  const tones = {
    accent: "bg-gradient-to-r from-violet-500 to-quiz-accent",
    good: "bg-emerald-500",
    warn: "bg-amber-500",
  } as const;
  return (
    <div
      className={cn("h-2 overflow-hidden rounded-full bg-slate-100", className)}
      aria-hidden="true"
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none", tones[tone])}
        style={{ width: `${Math.max(0, Math.min(100, pct ?? 0))}%` }}
      />
    </div>
  );
}

/** Section heading with an optional "View all" affordance. */
export function SectionHeader({
  title,
  to,
  actionLabel = "View all",
  onAction,
}: {
  title: string;
  to?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="mb-2.5 mt-6 flex items-center justify-between gap-3">
      <h2 className="text-[16px] font-extrabold tracking-[-0.01em] text-slate-900 sm:text-[18px]">
        {title}
      </h2>
      {to ? (
        <Link
          to={to}
          className="inline-flex min-h-[44px] items-center gap-0.5 text-[13.5px] font-bold text-quiz-accent-strong"
        >
          {actionLabel}
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      ) : onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex min-h-[44px] items-center gap-0.5 text-[13.5px] font-bold text-quiz-accent-strong"
        >
          {actionLabel}
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

/** Polished empty state — never a blank screen. */
export function AnalyticsEmpty({
  art,
  title,
  body,
  action,
}: {
  art: string;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-white/70 px-5 py-8 text-center">
      <BuilderArt src={art} className="mx-auto h-24 w-24" />
      <p className="mt-3 text-[15px] font-bold text-slate-800">{title}</p>
      <p className="mx-auto mt-1 max-w-xs text-[13px] leading-snug text-slate-500">{body}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function AnalyticsError({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-3xl border border-rose-200 bg-rose-50/70 px-5 py-6 text-center">
      <p className="text-[14.5px] font-bold text-rose-900">Something went wrong</p>
      <p className="mx-auto mt-1 max-w-sm text-[13px] leading-snug text-rose-700">{message}</p>
      {onRetry && (
        <Button
          onClick={onRetry}
          variant="outline"
          className="mt-4 min-h-[44px] rounded-full border-rose-300 bg-white text-rose-800"
        >
          <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" /> Try again
        </Button>
      )}
    </div>
  );
}

/** Skeleton block whose geometry matches the real card it replaces. */
export function Skel({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-2xl bg-slate-200/60", className)} aria-hidden="true" />;
}
