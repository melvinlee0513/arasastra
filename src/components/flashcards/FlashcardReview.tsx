/**
 * Shared spaced-repetition presentation pieces (Flashcards 3.0).
 *
 * Presentation only — these never fetch, mutate or decide scheduling. Mastery
 * stages, intervals and due dates are always server-authoritative; components
 * here only render what `submit_flashcard_review` and the review RPCs return.
 */
import { motion, useReducedMotion } from "framer-motion";
import { Flame, Loader2, RotateCcw, Sparkles, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { FLASHCARD_ART } from "@/lib/flashcardArt";
import {
  FLASHCARD_RATINGS,
  flashcardMasteryLabel,
  formatFlashcardNextDue,
  type FlashcardMastery,
  type FlashcardRating,
} from "@/lib/flashcards";

const RATING_TONE: Record<FlashcardRating, string> = {
  again: "bg-[hsl(0,72%,55%)] hover:bg-[hsl(0,72%,48%)]",
  hard: "bg-[hsl(28,88%,53%)] hover:bg-[hsl(28,88%,46%)]",
  good: "bg-[hsl(214,90%,54%)] hover:bg-[hsl(214,90%,46%)]",
  easy: "bg-[hsl(150,60%,42%)] hover:bg-[hsl(150,60%,35%)]",
};

/**
 * "How well did you know this?" — 2 x 2 on mobile, one row from `sm`.
 * Only rendered after the answer is revealed; disabled while saving so a
 * double tap cannot submit twice.
 */
export function FlashcardReviewRating({
  onRate,
  busy,
  pending,
  className,
}: {
  onRate: (rating: FlashcardRating) => void;
  busy?: boolean;
  pending?: FlashcardRating | null;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <div className={className}>
      <p className="mb-2 text-center text-[12.5px] font-bold text-slate-500">
        How well did you know this?
      </p>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {FLASHCARD_RATINGS.map((r) => {
          const selected = pending === r.value;
          return (
            <motion.button
              key={r.value}
              type="button"
              disabled={busy}
              aria-label={`${r.label} — ${r.hint}`}
              onClick={() => onRate(r.value)}
              whileTap={reduceMotion ? undefined : { scale: 0.96 }}
              className={cn(
                "flex min-h-[64px] flex-col items-center justify-center rounded-2xl px-2 text-white transition disabled:opacity-60",
                RATING_TONE[r.value],
                selected && "ring-2 ring-slate-900/20 ring-offset-2",
              )}
            >
              <span className="text-[14.5px] font-extrabold">{r.label}</span>
              <span className="text-[11px] font-semibold text-white/85">{r.hint}</span>
            </motion.button>
          );
        })}
      </div>
      {busy && (
        <p className="mt-2 flex items-center justify-center gap-1.5 text-[12px] text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Saving your review
        </p>
      )}
    </div>
  );
}

/** Session position plus a subtle due / new breakdown and the daily goal. */
export function FlashcardProgress({
  position,
  total,
  dueCount,
  newCount,
  goalDone,
  goal,
}: {
  position: number;
  total: number;
  dueCount?: number;
  newCount?: number;
  goalDone?: number;
  goal?: number;
}) {
  const pct = total > 0 ? Math.round((Math.min(position, total) / total) * 100) : 0;
  const goalPct = goal && goal > 0 ? Math.min(100, Math.round(((goalDone ?? 0) / goal) * 100)) : 0;
  return (
    <div>
      <Progress value={pct} className="h-2" aria-label={`${pct}% of this session`} />
      <div className="mt-1.5 flex items-center justify-between text-[11.5px] font-semibold text-slate-500">
        <span className="tabular-nums">
          {Math.min(position, total)} / {total}
        </span>
        <span className="tabular-nums">
          {typeof dueCount === "number" ? `${dueCount} due` : ""}
          {typeof newCount === "number" ? ` · ${newCount} new` : ""}
        </span>
      </div>
      {typeof goal === "number" && goal > 0 && (
        <>
          <div className="mt-2 flex items-center justify-between text-[11.5px] font-semibold text-slate-500">
            <span>Daily goal</span>
            <span className="tabular-nums">
              {Math.min(goalDone ?? 0, goal)}/{goal}
            </span>
          </div>
          <Progress value={goalPct} className="mt-1 h-1.5" />
        </>
      )}
    </div>
  );
}

const MASTERY_TONE: Record<FlashcardMastery, string> = {
  new: "bg-slate-100 text-slate-600",
  learning: "bg-amber-100 text-amber-700",
  review: "bg-sky-100 text-sky-700",
  mastered: "bg-emerald-100 text-emerald-700",
};

/** Compact mastery chip. */
export function FlashcardMasteryBadge({
  mastery,
  className,
}: {
  mastery: FlashcardMastery | null | undefined;
  className?: string;
}) {
  const key: FlashcardMastery = mastery ?? "new";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-black",
        MASTERY_TONE[key],
        className,
      )}
    >
      {flashcardMasteryLabel(key)}
    </span>
  );
}

/** "Today's Review" summary card with the real due count or the caught-up state. */
export function FlashcardDueSummary({
  dueCount,
  newCount,
  nextDueAt,
  goalDone,
  goal,
  onStart,
  startLabel = "Start Review",
}: {
  dueCount: number;
  newCount?: number;
  nextDueAt?: string | null;
  goalDone?: number;
  goal?: number;
  onStart: () => void;
  startLabel?: string;
}) {
  const ready = dueCount + (newCount ?? 0);
  return (
    <section className="rounded-[28px] border border-violet-100 bg-white p-4 shadow-[0_16px_38px_-26px_rgba(76,29,149,0.5)]">
      <div className="flex items-start gap-3">
        <img
          src={ready > 0 ? FLASHCARD_ART.target : FLASHCARD_ART.star}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="h-12 w-12 shrink-0 select-none object-contain"
        />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-violet-500">
            Today's Review
          </p>
          <p className="mt-0.5 text-[17px] font-black leading-tight text-slate-900">
            {ready > 0 ? `${ready} card${ready === 1 ? "" : "s"} ready` : "You're all caught up 🎉"}
          </p>
          <p className="mt-0.5 text-[12.5px] font-semibold text-slate-500">
            {ready > 0
              ? `${dueCount} due${typeof newCount === "number" ? ` · ${newCount} new` : ""}`
              : `Next review: ${formatFlashcardNextDue(nextDueAt)}`}
          </p>
        </div>
      </div>

      {typeof goal === "number" && goal > 0 && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[11.5px] font-bold text-slate-500">
            <span>Daily goal</span>
            <span className="tabular-nums">
              {Math.min(goalDone ?? 0, goal)}/{goal}
            </span>
          </div>
          <Progress
            value={Math.min(100, Math.round(((goalDone ?? 0) / goal) * 100))}
            className="mt-1.5 h-2"
          />
        </div>
      )}

      <Button
        onClick={onStart}
        className="mt-3.5 h-12 w-full rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 text-[15px] font-extrabold text-white shadow-[0_16px_32px_-18px_rgba(109,40,217,0.9)] hover:from-violet-700 hover:to-indigo-700"
      >
        {ready > 0 ? startLabel : "Practise anyway"}
      </Button>
    </section>
  );
}

/** Mastery / learning / new breakdown row, reused on deck detail and analytics. */
export function FlashcardMasterySummary({
  mastered,
  learning,
  newCount,
  due,
  className,
}: {
  mastered: number;
  learning: number;
  newCount: number;
  due?: number;
  className?: string;
}) {
  const items = [
    { label: "Mastered", value: mastered, tone: "text-emerald-600" },
    { label: "Learning", value: learning, tone: "text-amber-600" },
    { label: "New", value: newCount, tone: "text-slate-600" },
    ...(typeof due === "number" ? [{ label: "Due", value: due, tone: "text-violet-600" }] : []),
  ];
  return (
    <div className={cn("grid gap-2.5", typeof due === "number" ? "grid-cols-4" : "grid-cols-3", className)}>
      {items.map((i) => (
        <div
          key={i.label}
          className="rounded-2xl border border-violet-100 bg-white p-3 text-center shadow-[0_10px_28px_-20px_rgba(76,29,149,0.4)]"
        >
          <p className={cn("text-[19px] font-black leading-none tabular-nums", i.tone)}>{i.value}</p>
          <p className="mt-1 text-[11px] font-semibold text-slate-500">{i.label}</p>
        </div>
      ))}
    </div>
  );
}

/** End-of-session screen: real counts only, no invented achievements. */
export function FlashcardReviewComplete({
  reviewed,
  mastered,
  learning,
  needPractice,
  xp,
  nextDueAt,
  streak,
  onMore,
  onBack,
  canReviewMore,
}: {
  reviewed: number;
  mastered: number;
  learning: number;
  needPractice: number;
  xp: number;
  nextDueAt?: string | null;
  streak?: number;
  onMore?: () => void;
  onBack: () => void;
  canReviewMore?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
      <motion.img
        src={FLASHCARD_ART.trophy}
        alt=""
        aria-hidden="true"
        draggable={false}
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: reduceMotion ? 0.15 : 0.3 }}
        className="h-24 w-24 select-none object-contain"
      />
      <h2 className="mt-3 text-[21px] font-black tracking-tight text-slate-900">
        {reviewed > 0 ? "Review complete" : "Nothing due right now"}
      </h2>
      <p className="mt-1 max-w-xs text-[13.5px] text-slate-500">
        {reviewed > 0
          ? `${reviewed} card${reviewed === 1 ? "" : "s"} reviewed.`
          : "Your cards are scheduled for later."}
      </p>

      {reviewed > 0 && (
        <div className="mt-5 w-full max-w-sm">
          <FlashcardMasterySummary mastered={mastered} learning={learning} newCount={needPractice} />
          <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2 text-[12px] font-bold">
            {xp > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-3 py-1 text-violet-700">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> +{xp} XP
              </span>
            )}
            {typeof streak === "number" && streak > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-amber-700">
                <Flame className="h-3.5 w-3.5" aria-hidden="true" /> {streak} day streak
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-slate-600">
              <Trophy className="h-3.5 w-3.5" aria-hidden="true" /> Next review:{" "}
              {formatFlashcardNextDue(nextDueAt)}
            </span>
          </div>
        </div>
      )}

      <div className="mt-6 flex w-full max-w-xs flex-col gap-2">
        {canReviewMore && onMore && (
          <Button
            className="h-12 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 text-[15px] font-extrabold text-white hover:from-violet-700 hover:to-indigo-700"
            onClick={onMore}
          >
            <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" /> Check for more
          </Button>
        )}
        <Button variant="outline" className="h-12 rounded-full text-[15px] font-bold" onClick={onBack}>
          Back to My Flashcards
        </Button>
      </div>
    </div>
  );
}
