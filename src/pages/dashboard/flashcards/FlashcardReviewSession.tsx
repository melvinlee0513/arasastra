/**
 * Student flashcard review session ("Today's Review" → "Rate Your Recall").
 *
 * Scheduling is server-authoritative: `submit_flashcard_review` decides the
 * next due date, the mastery stage and any XP, per student and per card. This
 * screen only shows cards and sends ratings.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ArrowLeft, Check, Loader2, Sparkles, Trophy, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { useFeatureEnabled } from "@/hooks/useFeature";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { FeatureUnavailable } from "@/pages/FeatureUnavailable";
import { RichTextRenderer } from "@/components/richtext/RichTextRenderer";
import { cn } from "@/lib/utils";
import {
  FLASHCARD_RATINGS,
  flashcardReviewKeys,
  getStudentFlashcardReviewQueue,
  mapFlashcardError,
  submitFlashcardReview,
  type FlashcardRating,
  type FlashcardReviewCard,
} from "@/lib/flashcards";

const RATING_TONE: Record<FlashcardRating, string> = {
  again: "bg-[hsl(0,72%,55%)] hover:bg-[hsl(0,72%,48%)]",
  hard: "bg-[hsl(28,88%,53%)] hover:bg-[hsl(28,88%,46%)]",
  good: "bg-[hsl(214,90%,54%)] hover:bg-[hsl(214,90%,46%)]",
  easy: "bg-[hsl(150,60%,42%)] hover:bg-[hsl(150,60%,35%)]",
};

export function FlashcardReviewSession() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const flashcardsOn = useFeatureEnabled("flashcards");
  const reduceMotion = useReducedMotion();

  const [queue, setQueue] = useState<FlashcardReviewCard[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [xp, setXp] = useState(0);
  const [mastered, setMastered] = useState(0);
  const [goal, setGoal] = useState(20);
  const [doneToday, setDoneToday] = useState(0);

  const q = useQuery({
    queryKey: flashcardReviewKeys.queue(currentTenantId, user?.id),
    enabled: !!user && flashcardsOn,
    queryFn: () => getStudentFlashcardReviewQueue(40),
    staleTime: 0,
  });

  useEffect(() => {
    if (!q.data) return;
    setQueue(q.data.cards ?? []);
    setIndex(0);
    setRevealed(false);
    setGoal(q.data.daily_goal ?? 20);
    setDoneToday(q.data.reviewed_today ?? 0);
  }, [q.data]);

  const card = queue[index];
  const total = queue.length;
  const progressPct = total > 0 ? Math.round((index / total) * 100) : 0;
  const finished = !!q.data && (total === 0 || index >= total);

  const goalPct = useMemo(
    () => (goal > 0 ? Math.min(100, Math.round((doneToday / goal) * 100)) : 0),
    [doneToday, goal],
  );

  if (!flashcardsOn) return <FeatureUnavailable feature="Flashcards" />;

  async function rate(rating: FlashcardRating) {
    if (!card || busy) return;
    setBusy(true);
    try {
      const res = await submitFlashcardReview(card.card_id, rating);
      setReviewed((n) => n + 1);
      setXp((n) => n + (res.xp_awarded ?? 0));
      if (res.newly_mastered) setMastered((n) => n + 1);
      setDoneToday(res.reviewed_today ?? doneToday + 1);
      if (res.daily_goal) setGoal(res.daily_goal);
      if (res.daily_goal_reached) toast.success("Daily review goal reached! +10 XP");
      else if ((res.xp_awarded ?? 0) > 0) toast.success(`+${res.xp_awarded} XP`);

      // "Again" keeps the card in this session, at the back of the queue.
      if (rating === "again") {
        setQueue((prev) => {
          const rest = prev.filter((_, i) => i !== index);
          return [...rest, card];
        });
        setRevealed(false);
      } else {
        setIndex((i) => i + 1);
        setRevealed(false);
      }
      void qc.invalidateQueries({ queryKey: ["flashcard-review"] });
      void qc.invalidateQueries({ queryKey: ["gamification"] });
    } catch (err) {
      toast.error(mapFlashcardError(err, "Couldn't save that rating."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-4 pb-8 pt-4 sm:px-6">
        <header className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Back to my flashcards"
            className="h-11 w-11 rounded-full"
            onClick={() => navigate("/dashboard/flashcards")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-extrabold text-slate-900">Today's Review</p>
            <p className="truncate text-[12px] text-slate-500">
              {card ? `${card.deck_title} · ${card.class_title}` : "Spaced repetition"}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[12px] font-bold tabular-nums text-slate-600 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
            {Math.min(index + (finished ? 0 : 1), Math.max(total, 1))}/{Math.max(total, 1)}
          </span>
        </header>

        <div className="mt-3">
          <Progress value={finished ? 100 : progressPct} className="h-2" />
          <div className="mt-1.5 flex items-center justify-between text-[11.5px] font-semibold text-slate-500">
            <span>Daily goal</span>
            <span className="tabular-nums">
              {Math.min(doneToday, goal)}/{goal}
            </span>
          </div>
          <Progress value={goalPct} className="mt-1 h-1.5" />
        </div>

        {q.isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" aria-hidden="true" />
          </div>
        ) : q.isError ? (
          <div className="mt-6 flex items-start gap-2.5 rounded-3xl border border-amber-200 bg-amber-50 p-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
            <div>
              <p className="text-[14px] font-bold text-slate-900">Couldn't load your review</p>
              <p className="mt-0.5 text-[13px] text-slate-600">{mapFlashcardError(q.error)}</p>
              <Button variant="outline" className="mt-3 rounded-full" onClick={() => void q.refetch()}>
                Try again
              </Button>
            </div>
          </div>
        ) : finished ? (
          <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-[hsl(214,90%,95%)] text-[hsl(214,90%,44%)]">
              <Trophy className="h-8 w-8" aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-[20px] font-extrabold text-slate-900">
              {reviewed > 0 ? "Session complete" : "Nothing due right now"}
            </h2>
            <p className="mt-1 max-w-xs text-[13.5px] text-slate-500">
              {reviewed > 0
                ? `You reviewed ${reviewed} card${reviewed === 1 ? "" : "s"}${
                    mastered > 0 ? `, mastered ${mastered}` : ""
                  }${xp > 0 ? ` and earned ${xp} XP` : ""}.`
                : "Your cards are scheduled for later. Come back when they're due."}
            </p>
            <div className="mt-6 flex w-full max-w-xs flex-col gap-2">
              {total > 0 && (
                <Button
                  className="h-12 rounded-full text-[15px] font-extrabold"
                  onClick={() => void q.refetch()}
                >
                  Check for more
                </Button>
              )}
              <Button asChild variant="outline" className="h-12 rounded-full text-[15px] font-bold">
                <Link to="/dashboard/flashcards">Back to my flashcards</Link>
              </Button>
            </div>
          </div>
        ) : (
          card && (
            <>
              <div className="mt-4 flex-1">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.button
                    key={`${card.card_id}-${revealed ? "back" : "front"}`}
                    type="button"
                    onClick={() => setRevealed((r) => !r)}
                    initial={reduceMotion ? { opacity: 0 } : { opacity: 0, rotateX: -12 }}
                    animate={reduceMotion ? { opacity: 1 } : { opacity: 1, rotateX: 0 }}
                    exit={reduceMotion ? { opacity: 0 } : { opacity: 0, rotateX: 12 }}
                    transition={{ duration: reduceMotion ? 0.12 : 0.22 }}
                    aria-label={revealed ? "Show the question" : "Reveal the answer"}
                    className="flex min-h-[260px] w-full flex-col justify-center rounded-3xl border border-slate-200 bg-white p-6 text-left shadow-[0_8px_30px_rgb(0,0,0,0.04)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:p-8"
                  >
                    <span className="text-[11px] font-black uppercase tracking-wide text-slate-400">
                      {revealed ? "Answer" : "Question"}
                    </span>
                    <RichTextRenderer
                      className="mt-3 text-[18px] font-medium leading-snug text-slate-900 sm:text-[20px]"
                      value={revealed ? card.back_content ?? null : card.front_content ?? null}
                      fallbackText={revealed ? card.back_text : card.front_text}
                    />
                    {!revealed && (
                      <span className="mt-6 text-[12px] text-slate-400">
                        Tap the card to reveal the answer
                      </span>
                    )}
                  </motion.button>
                </AnimatePresence>
              </div>

              {revealed ? (
                <div className="mt-4">
                  <p className="mb-2 text-center text-[12.5px] font-bold text-slate-500">
                    Rate your recall
                  </p>
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                    {FLASHCARD_RATINGS.map((r) => (
                      <button
                        key={r.value}
                        type="button"
                        disabled={busy}
                        onClick={() => void rate(r.value)}
                        className={cn(
                          "flex min-h-[62px] flex-col items-center justify-center rounded-2xl px-2 text-white transition active:scale-[0.97] disabled:opacity-60",
                          RATING_TONE[r.value],
                        )}
                      >
                        <span className="text-[14.5px] font-extrabold">{r.label}</span>
                        <span className="text-[11px] font-semibold text-white/80">{r.hint}</span>
                      </button>
                    ))}
                  </div>
                  {busy && (
                    <p className="mt-2 flex items-center justify-center gap-1.5 text-[12px] text-slate-500">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Saving
                    </p>
                  )}
                </div>
              ) : (
                <Button
                  className="mt-4 h-12 w-full rounded-full text-[15px] font-extrabold"
                  onClick={() => setRevealed(true)}
                >
                  <Check className="mr-1.5 h-4 w-4" aria-hidden="true" /> Reveal answer
                </Button>
              )}

              <p className="mt-3 flex items-center justify-center gap-1.5 text-[11.5px] text-slate-400">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Ratings set when you'll see
                this card again.
              </p>
            </>
          )
        )}
      </div>
    </div>
  );
}

export default FlashcardReviewSession;
