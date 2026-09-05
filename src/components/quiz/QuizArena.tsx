/**
 * Immersive "arena" primitives for the student quiz attempt and result screens.
 *
 * Dark violet space theme with soft-3D artwork. Presentation only — attempt
 * lifecycle, autosave, grading and result visibility stay in the pages.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { RichTextRenderer } from "@/components/richtext/RichTextRenderer";
import { QUIZ_ART } from "@/lib/quizArt";

export function ArenaArt({
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
      decoding="async"
      draggable={false}
      className={cn("pointer-events-none select-none object-contain", className)}
    />
  );
}

/** Full-screen dark shell with layered decorations and safe-area padding. */
export function QuizArenaShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-quiz-arena-deep text-quiz-arena-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_-10%,hsl(var(--quiz-accent)/0.45),transparent_60%)]"
      />
      <ArenaArt
        src={QUIZ_ART.starsOrbs}
        className="absolute -right-10 top-6 h-40 w-40 opacity-30"
      />
      <ArenaArt
        src={QUIZ_ART.cloudsBottomDark}
        className="absolute inset-x-0 bottom-0 h-28 w-full object-cover opacity-70"
      />
      <div
        className={cn(
          "relative mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-[calc(env(safe-area-inset-top)+12px)] sm:px-6",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** Glass panel used for question cards, stats and overlays. */
export function ArenaPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[28px] border border-white/12 bg-white/10 p-5 shadow-[0_18px_50px_-20px_rgba(0,0,0,0.7)] backdrop-blur-xl",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Small status chip in the arena top bar. */
export function ArenaChip({
  art,
  children,
  tone = "default",
}: {
  art?: string;
  children: ReactNode;
  tone?: "default" | "warn" | "danger" | "good";
}) {
  const tones: Record<string, string> = {
    default: "bg-white/12 text-quiz-arena-foreground",
    warn: "bg-amber-400/20 text-amber-100",
    danger: "bg-quiz-wrong/25 text-rose-100",
    good: "bg-quiz-correct/25 text-emerald-100",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold backdrop-blur",
        tones[tone],
      )}
    >
      {art && <ArenaArt src={art} className="h-4 w-4" />}
      {children}
    </span>
  );
}

/** Question progress bar. */
export function ArenaProgress({ value }: { value: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-white/12">
      <div
        className="h-full rounded-full bg-gradient-to-r from-quiz-xp to-quiz-accent transition-[width] duration-500"
        style={{ width: `${Math.max(2, Math.min(100, value))}%` }}
      />
    </div>
  );
}

const OPTION_LABELS = ["A", "B", "C", "D", "E", "F"];

const OPTION_TONES = [
  "from-rose-500/90 to-rose-600/90",
  "from-sky-500/90 to-blue-600/90",
  "from-amber-400/90 to-orange-500/90",
  "from-emerald-500/90 to-teal-600/90",
  "from-fuchsia-500/90 to-purple-600/90",
  "from-cyan-400/90 to-sky-500/90",
];

/**
 * Gameplay answer grid. Two columns on mobile for short options, single column
 * when any option is long so text never truncates.
 */
export function ArenaAnswerGrid({
  options,
  selectedId,
  onSelect,
  disabled,
}: {
  options: Array<{ id: string; text: string; content?: unknown }>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
  const longest = options.reduce((m, o) => Math.max(m, o.text.length), 0);
  const twoCol = options.length > 2 && longest <= 34;

  return (
    <div className={cn("grid gap-3", twoCol ? "grid-cols-2" : "grid-cols-1")}>
      {options.map((option, i) => {
        const selected = selectedId === option.id;
        return (
          <button
            key={option.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(option.id)}
            aria-pressed={selected}
            className={cn(
              "group relative flex min-h-[76px] items-center gap-3 rounded-3xl bg-gradient-to-br p-3.5 text-left font-semibold text-white shadow-[0_14px_30px_-16px_rgba(0,0,0,0.85)] transition-transform",
              OPTION_TONES[i % OPTION_TONES.length],
              !disabled && "active:scale-[0.97]",
              selected
                ? "ring-4 ring-white/80"
                : "ring-1 ring-inset ring-white/15",
              disabled && "opacity-70",
            )}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/25 text-[13px] font-black">
              {OPTION_LABELS[i] ?? i + 1}
            </span>
            <span className="min-w-0 flex-1 break-words text-[14.5px] leading-snug">
              <RichTextRenderer value={option.content ?? null} fallbackText={option.text} />
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Circular countdown used in the arena header. */
export function ArenaCountdown({
  secondsLeft,
  totalSeconds,
}: {
  secondsLeft: number;
  totalSeconds: number | null;
}) {
  const pct =
    totalSeconds && totalSeconds > 0
      ? Math.max(0, Math.min(1, secondsLeft / totalSeconds))
      : 1;
  const r = 22;
  const circumference = 2 * Math.PI * r;
  const urgent = secondsLeft <= 30;
  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;

  return (
    <div className="relative flex h-14 w-14 items-center justify-center">
      <svg viewBox="0 0 48 48" className="absolute inset-0 -rotate-90">
        <circle cx="24" cy="24" r={r} fill="none" strokeWidth="3.5" className="stroke-white/15" />
        <circle
          cx="24"
          cy="24"
          r={r}
          fill="none"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - pct * circumference}
          className={cn(
            "transition-[stroke-dashoffset] duration-1000 ease-linear",
            urgent ? "stroke-quiz-wrong" : "stroke-quiz-xp",
          )}
        />
      </svg>
      <span
        className={cn(
          "z-10 font-mono text-[13px] font-black tabular-nums",
          urgent ? "text-rose-200" : "text-quiz-arena-foreground",
        )}
      >
        {mins}:{secs.toString().padStart(2, "0")}
      </span>
    </div>
  );
}

/** Centred arena status card (loading / error / gated states). */
export function ArenaStatusCard({
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
    <QuizArenaShell className="items-center justify-center">
      <ArenaPanel className="w-full max-w-md text-center">
        <ArenaArt
          src={art}
          className="mx-auto mb-4 h-28 w-28 drop-shadow-[0_16px_28px_rgba(0,0,0,0.5)]"
        />
        <h1 className="text-[18px] font-extrabold">{title}</h1>
        <p className="mx-auto mt-1.5 max-w-sm text-[13.5px] text-quiz-arena-muted">{body}</p>
        {/* Failure screens often carry the only way out, so their action has
            to clear the 44px touch minimum whatever the caller passes. */}
        {action && (
          <div className="mt-5 flex flex-wrap justify-center gap-2 [&_a]:min-h-[44px] [&_button]:min-h-[44px]">
            {action}
          </div>
        )}
      </ArenaPanel>
    </QuizArenaShell>
  );
}
