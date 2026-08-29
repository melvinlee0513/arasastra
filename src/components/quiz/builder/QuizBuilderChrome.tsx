/**
 * Mobile-first presentation primitives for the Tutor/Admin quiz builder.
 *
 * Light design language — off-white ground, elevated white cards, soft shadows,
 * restrained purple accents from the existing `--quiz-*` tokens. Deliberately
 * NOT the dark Quiz Arena styling, which belongs to student gameplay.
 *
 * Purely presentational: no data access, no quiz lifecycle logic.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { BUILDER_STEPS, STEP_LABEL, type BuilderStep } from "./types";
import { Check } from "lucide-react";

/** Page ground + max width. Bottom padding clears the sticky footer. */
export function BuilderShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-3xl px-4 sm:px-6",
        // Footer height + safe area, so nothing hides behind the sticky bar.
        "pb-[calc(env(safe-area-inset-bottom)+112px)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Elevated white surface — the builder's fundamental block. */
export function BuilderCard({
  children,
  className,
  tone = "default",
}: {
  children: ReactNode;
  className?: string;
  tone?: "default" | "accent" | "warn";
}) {
  const tones: Record<string, string> = {
    default: "bg-white border-slate-200/80",
    accent: "bg-quiz-tint border-quiz-accent/20",
    warn: "bg-amber-50 border-amber-200",
  };
  return (
    <div
      className={cn(
        "rounded-3xl border p-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] sm:p-5",
        tones[tone],
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Card with a titled header row and an optional leading icon tile. */
export function BuilderSection({
  title,
  description,
  icon,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <BuilderCard className={className}>
      <div className="mb-4 flex items-start gap-3">
        {icon && (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-quiz-tint text-quiz-accent-strong">
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-bold leading-tight text-slate-900">{title}</h2>
          {description && (
            <p className="mt-0.5 text-[12.5px] leading-snug text-slate-500">{description}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </BuilderCard>
  );
}

/** Label + control + helper/error, stacked for mobile. */
export function BuilderField({
  label,
  htmlFor,
  required,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-[13px] font-semibold text-slate-800"
      >
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-[12px] font-medium text-rose-600">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-[12px] leading-snug text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

/** Horizontal step indicator. Compact enough for 375px. */
export function BuilderStepper({
  current,
  furthest,
  onSelect,
}: {
  current: BuilderStep;
  /** Steps up to here are treated as visited and become tappable. */
  furthest: BuilderStep;
  onSelect: (step: BuilderStep) => void;
}) {
  const currentIdx = BUILDER_STEPS.indexOf(current);
  const furthestIdx = BUILDER_STEPS.indexOf(furthest);

  return (
    <nav aria-label="Builder steps" className="mb-4">
      <ol className="flex items-center gap-1">
        {BUILDER_STEPS.map((step, i) => {
          const isCurrent = i === currentIdx;
          const isDone = i < currentIdx;
          const reachable = i <= Math.max(furthestIdx, currentIdx);
          return (
            <li key={step} className="flex min-w-0 flex-1 items-center gap-1">
              <button
                type="button"
                disabled={!reachable}
                aria-current={isCurrent ? "step" : undefined}
                onClick={() => reachable && onSelect(step)}
                className={cn(
                  "flex min-h-[44px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-1.5 transition",
                  isCurrent && "bg-quiz-tint",
                  !reachable && "opacity-40",
                  reachable && !isCurrent && "active:scale-[0.97]",
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black",
                    isCurrent
                      ? "bg-quiz-accent text-white"
                      : isDone
                        ? "bg-quiz-correct/20 text-emerald-700"
                        : "bg-slate-100 text-slate-500",
                  )}
                >
                  {isDone ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
                </span>
                <span
                  className={cn(
                    "w-full truncate text-center text-[11px] font-semibold leading-none",
                    isCurrent ? "text-quiz-accent-strong" : "text-slate-500",
                  )}
                >
                  {STEP_LABEL[step]}
                </span>
              </button>
              {i < BUILDER_STEPS.length - 1 && (
                <span aria-hidden className="h-px w-2 shrink-0 bg-slate-200 sm:w-3" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * Sticky bottom action bar.
 *
 * `position: sticky` (not fixed) so the mobile keyboard pushes it out of the
 * way instead of pinning it over the focused input.
 */
export function BuilderFooter({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-40 -mx-4 mt-6 border-t border-slate-200 bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-3 backdrop-blur sm:-mx-6 sm:px-6">
      <div className="mx-auto flex max-w-3xl items-center gap-2">{children}</div>
    </div>
  );
}

/** Small rounded stat/meta pill. */
export function BuilderPill({
  icon,
  children,
  tone = "neutral",
}: {
  icon?: ReactNode;
  children: ReactNode;
  tone?: "neutral" | "accent" | "warn" | "good" | "danger";
}) {
  const tones: Record<string, string> = {
    neutral: "bg-slate-100 text-slate-600",
    accent: "bg-quiz-tint text-quiz-accent-strong",
    warn: "bg-amber-100 text-amber-800",
    good: "bg-emerald-100 text-emerald-800",
    danger: "bg-rose-100 text-rose-700",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-semibold",
        tones[tone],
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/** Illustration helper — decorative by default, never focusable. */
export function BuilderArt({
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

/** Illustrated empty state used inside builder cards. */
export function BuilderEmptyState({
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
    <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50/60 px-5 py-8 text-center">
      <BuilderArt
        src={art}
        className="mx-auto mb-3 h-24 w-24 drop-shadow-[0_12px_20px_rgba(15,23,42,0.14)]"
      />
      <h3 className="text-[15px] font-bold text-slate-900">{title}</h3>
      <p className="mx-auto mt-1 max-w-xs text-[13px] leading-snug text-slate-500">{description}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/**
 * Settings toggle row.
 *
 * The WHOLE row is the control — a 24px switch is far below the 44px touch
 * guidance, and tapping the label is what people expect on mobile. The visual
 * switch is inert; the row itself carries the switch role and state.
 */
export function BuilderToggleRow({
  icon,
  title,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={title}
      disabled={disabled}
      onClick={() => !disabled && onCheckedChange(!checked)}
      className={cn(
        "flex min-h-[56px] w-full items-center gap-3 py-2 text-left transition",
        disabled ? "opacity-60" : "active:opacity-70",
      )}
    >
      {icon && (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-quiz-tint text-quiz-accent-strong">
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold leading-tight text-slate-900">
          {title}
        </span>
        {description && (
          <span className="mt-0.5 block text-[12px] leading-snug text-slate-500">
            {description}
          </span>
        )}
      </span>
      {/* Visual only — a real <button> here would be invalid DOM nesting. */}
      <span
        aria-hidden
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
          checked ? "bg-quiz-accent" : "bg-slate-200",
        )}
      >
        <span
          className={cn(
            "inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform",
            checked ? "translate-x-[22px]" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
}

/** Inline banner for validation problems, scoped to the current step. */
export function BuilderIssueList({
  title,
  messages,
  tone = "warn",
}: {
  title: string;
  messages: string[];
  tone?: "warn" | "danger";
}) {
  if (messages.length === 0) return null;
  const isDanger = tone === "danger";
  return (
    <div
      role="alert"
      className={cn(
        "rounded-3xl border p-4 text-[13px]",
        isDanger ? "border-rose-200 bg-rose-50 text-rose-900" : "border-amber-200 bg-amber-50 text-amber-900",
      )}
    >
      <p className="mb-1 font-bold">{title}</p>
      <ul className="list-inside list-disc space-y-0.5">
        {messages.map((m, i) => (
          <li key={i}>{m}</li>
        ))}
      </ul>
    </div>
  );
}
