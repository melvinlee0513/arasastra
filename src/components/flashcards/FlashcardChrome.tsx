/**
 * Shared "Lavender Stars" chrome for every Flashcards surface.
 *
 * Presentation only — these primitives never fetch or mutate data. They exist
 * so the student and tutor flashcard screens share one premium visual language
 * instead of each page re-inventing gradients, chips and stat tiles.
 */
import { cn } from "@/lib/utils";

/** Page background: pale lavender wash with soft layered light. */
export function FlashcardScreen({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative min-h-full overflow-x-hidden bg-gradient-to-b from-[hsl(258,80%,97%)] via-white to-[hsl(258,70%,97%)]",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-20 -top-24 h-56 w-56 rounded-full bg-violet-300/25 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 top-40 h-56 w-56 rounded-full bg-sky-300/25 blur-3xl"
      />
      <div className="relative">{children}</div>
    </div>
  );
}

/** Premium lavender hero with mascot artwork and optional stat pills. */
export function FlashcardHero({
  eyebrow,
  title,
  subtitle,
  art,
  artAlt,
  children,
  className,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  art?: string;
  artAlt?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-[28px] border border-white/70 bg-gradient-to-br from-[hsl(258,90%,66%)] via-[hsl(262,85%,60%)] to-[hsl(224,90%,58%)] p-5 text-white shadow-[0_22px_45px_-26px_rgba(76,29,149,0.75)]",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full bg-white/15 blur-2xl"
      />
      <div className="relative flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {eyebrow && (
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-white/75">
              {eyebrow}
            </p>
          )}
          <h1 className="mt-1 text-[23px] font-black leading-tight tracking-tight sm:text-[28px]">
            {title}
          </h1>
          {subtitle && <p className="mt-1.5 text-[13px] leading-relaxed text-white/85">{subtitle}</p>}
        </div>
        {art && (
          <img
            src={art}
            alt={artAlt ?? ""}
            aria-hidden={artAlt ? undefined : true}
            draggable={false}
            className="h-20 w-20 shrink-0 select-none object-contain drop-shadow-[0_10px_20px_rgba(15,23,42,0.35)] sm:h-24 sm:w-24"
          />
        )}
      </div>
      {children && <div className="relative mt-4">{children}</div>}
    </section>
  );
}

/** Compact translucent stat used inside a hero. */
export function HeroStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white/15 px-3 py-2.5 backdrop-blur-sm">
      <p className="text-[18px] font-black leading-none tabular-nums">{value}</p>
      <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-white/75">{label}</p>
    </div>
  );
}

/** White stat tile used on light surfaces. */
export function StatTile({
  art,
  label,
  value,
}: {
  art?: string;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-violet-100 bg-white p-3 shadow-[0_10px_28px_-18px_rgba(76,29,149,0.35)]">
      {art && (
        <img src={art} alt="" aria-hidden="true" draggable={false} className="h-7 w-7 select-none object-contain" />
      )}
      <p className="mt-1.5 text-[19px] font-black leading-none tabular-nums text-slate-900">{value}</p>
      <p className="mt-0.5 text-[11.5px] font-semibold text-slate-500">{label}</p>
    </div>
  );
}

export interface FilterChipOption {
  key: string;
  label: string;
  count?: number;
}

/** Horizontally scrollable pill filters (mobile-first, no wrap jump). */
export function FilterChips({
  options,
  active,
  onSelect,
  ariaLabel,
}: {
  options: readonly FilterChipOption[];
  active: string;
  onSelect: (key: string) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:px-0"
    >
      {options.map((o) => {
        const selected = o.key === active;
        return (
          <button
            key={o.key}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onSelect(o.key)}
            className={cn(
              "min-h-[38px] shrink-0 rounded-full px-4 text-[13px] font-bold transition active:scale-95",
              selected
                ? "bg-violet-600 text-white shadow-[0_10px_22px_-12px_rgba(109,40,217,0.9)]"
                : "border border-violet-100 bg-white text-slate-600 hover:border-violet-200",
            )}
          >
            {o.label}
            {typeof o.count === "number" && (
              <span className={cn("ml-1.5 tabular-nums", selected ? "text-white/80" : "text-slate-400")}>
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Premium empty state with artwork and an optional action. */
export function FlashcardEmptyState({
  art,
  title,
  description,
  action,
}: {
  art: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-[28px] border border-violet-100 bg-white p-8 text-center shadow-[0_18px_40px_-28px_rgba(76,29,149,0.45)]">
      <img
        src={art}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="mx-auto h-24 w-24 select-none object-contain"
      />
      <p className="mt-3 text-[16px] font-extrabold text-slate-900">{title}</p>
      <p className="mx-auto mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-slate-500">{description}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

/** Rounded deck identity tile: cover artwork when present, else deck art. */
export function DeckTile({ art, className }: { art?: string | null; className?: string }) {
  return (
    <span
      className={cn(
        "flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-violet-100 to-sky-100",
        className,
      )}
    >
      <img
        src={art || "/assets/illustrations/learning/flashcards-star-cards.webp"}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="h-8 w-8 select-none object-contain"
      />
    </span>
  );
}
