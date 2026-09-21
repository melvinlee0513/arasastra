/**
 * Student flashcard review session ("Today's Review" → rate your recall).
 *
 * Scheduling is server-authoritative: `submit_flashcard_review` decides the
 * next due date, the mastery stage and any XP, per student and per card. This
 * screen only shows cards and sends ratings, with an idempotency token per
 * card attempt so retries never double-rate.
 *
 * With `?deck=<id>` the queue is scoped to one deck (`get_student_flashcard_deck_review`);
 * otherwise it spans every enrolled class.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ArrowLeft, Check, Loader2, RefreshCw, Sparkles, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { useFeatureEnabled } from "@/hooks/useFeature";
import { useGamification } from "@/hooks/useGamification";
import { Button } from "@/components/ui/button";
import { FeatureUnavailable } from "@/pages/FeatureUnavailable";
import { RichTextRenderer } from "@/components/richtext/RichTextRenderer";
import {
  FlashcardProgress,
  FlashcardReviewComplete,
  FlashcardReviewRating,
} from "@/components/flashcards/FlashcardReview";
import {
  flashcardReviewKeys,
  getStudentFlashcardDeckReview,
  getStudentFlashcardReviewQueue,
  mapFlashcardError,
  submitFlashcardReview,
  type FlashcardRating,
  type FlashcardReviewCard,
} from "@/lib/flashcards";

export function FlashcardReviewSession() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const flashcardsOn = useFeatureEnabled("flashcards");
  const reduceMotion = useReducedMotion();
  const gamification = useGamification();
  const [params] = useSearchParams();
  const deckId = params.get("deck");

  const [queue, setQueue] = useState<FlashcardReviewCard[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<FlashcardRating | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(0);
  const [xp, setXp] = useState(0);
  const [mastered, setMastered] = useState(0);
  const [learning, setLearning] = useState(0);
  const [needPractice, setNeedPractice] = useState(0);
  const [goal, setGoal] = useState(20);
  const [doneToday, setDoneToday] = useState(0);
  const [nextDueAt, setNextDueAt] = useState<string | null>(null);

  // One idempotency token per card attempt: reused by every retry of that tap.
  const tokens = useRef(new Map<string, string>());

  const q = useQuery({
    queryKey: deckId
      ? flashcardReviewKeys.deck(currentTenantId, user?.id, deckId)
      : flashcardReviewKeys.queue(currentTenantId, user?.id),
    enabled: !!user && flashcardsOn,
    queryFn: async () => {
      if (deckId) {
        const d = await getStudentFlashcardDeckReview(deckId, 60);
        return {
          cards: d.cards ?? [],
          due_count: d.due_count ?? 0,
          new_count: d.new_count ?? 0,
          reviewed_today: 0,
          daily_goal: d.daily_goal ?? 20,
          next_due_at: d.next_due_at ?? null,
          title: d.deck_title,
        };
      }
      const r = await getStudentFlashcardReviewQueue(40);
      return {
        cards: r.cards ?? [],
        due_count: r.due_count ?? 0,
        new_count: r.new_count ?? 0,
        reviewed_today: r.reviewed_today ?? 0,
        daily_goal: r.daily_goal ?? 20,
        next_due_at: null as string | null,
        title: null as string | null,
      };
    },
    staleTime: 0,
  });

  useEffect(() => {
    if (!q.data) return;
    setQueue(q.data.cards);
    setIndex(0);
    setRevealed(false);
    setFailed(null);
    setGoal(q.data.daily_goal);
    setDoneToday(q.data.reviewed_today);
    setNextDueAt(q.data.next_due_at);
  }, [q.data]);

  const card = queue[index];
  const total = queue.length;
  const finished = !!q.data && (total === 0 || index >= total);

  const dueRemaining = useMemo(() => q.data?.due_count ?? 0, [q.data]);
  const newRemaining = useMemo(() => q.data?.new_count ?? 0, [q.data]);

  if (!flashcardsOn) return <FeatureUnavailable feature="Flashcards" />;

  async function rate(rating: FlashcardRating) {
    if (!card || busy) return;
    setBusy(true);
    setPending(rating);
    setFailed(null);
    const tokenKey = `${card.card_id}:${rating}`;
    let token = tokens.current.get(tokenKey);
    if (!token) {
      token = crypto.randomUUID();
      tokens.current.set(tokenKey, token);
    }
    try {
      const res = await submitFlashcardReview(card.card_id, rating, token);
      if (!res.replayed) {
        setReviewed((n) => n + 1);
        setXp((n) => n + (res.xp_awarded ?? 0));
        if (res.mastery === "mastered") setMastered((n) => n + 1);
        else if (rating === "again") setNeedPractice((n) => n + 1);
        else setLearning((n) => n + 1);
        if (res.daily_goal_reached) toast.success("Daily review goal reached! +10 XP");
        else if ((res.xp_awarded ?? 0) > 0) toast.success(`+${res.xp_awarded} XP`);
      }
      setDoneToday(res.reviewed_today ?? doneToday + 1);
      if (res.daily_goal) setGoal(res.daily_goal);
      setNextDueAt(res.due_at ?? nextDueAt);

      // "Again" keeps the card in this session, at the back of the queue.
      if (rating === "again") {
        setQueue((prev) => {
          const rest = prev.filter((_, i) => i !== index);
          return [...rest, card];
        });
      } else {
        setIndex((i) => i + 1);
      }
      setRevealed(false);
      tokens.current.delete(tokenKey);
      void qc.invalidateQueries({ queryKey: ["flashcard-review"] });
      void qc.invalidateQueries({ queryKey: ["gamification"] });
    } catch (err) {
      // Stay on the card: nothing advances until the review is safely saved.
      setFailed(mapFlashcardError(err, "Couldn't save that review."));
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  return (
    <div className="min-h-screen bg-[hsl(258_60%_98%)]">
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
              {card ? `${card.deck_title} · ${card.class_title}` : q.data?.title ?? "Spaced repetition"}
            </p>
          </div>
        </header>

        <div className="mt-3">
          <FlashcardProgress
            position={finished ? total : index + 1}
            total={Math.max(total, 1)}
            dueCount={dueRemaining}
            newCount={newRemaining}
            goalDone={doneToday}
            goal={goal}
          />
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
          <FlashcardReviewComplete
            reviewed={reviewed}
            mastered={mastered}
            learning={learning}
            needPractice={needPractice}
            xp={xp}
            nextDueAt={nextDueAt}
            streak={gamification.enabled ? gamification.currentStreak : undefined}
            canReviewMore={total > 0}
            onMore={() => void q.refetch()}
            onBack={() => navigate("/dashboard/flashcards")}
          />
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
                    className="flex min-h-[260px] w-full flex-col justify-center rounded-[28px] border border-violet-100 bg-white p-6 text-left shadow-[0_18px_40px_-26px_rgba(76,29,149,0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:p-8"
                  >
                    <span className="text-[11px] font-black uppercase tracking-wide text-violet-400">
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

              {failed && (
                <div className="mt-3 flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 p-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold text-slate-900">Review not saved</p>
                    <p className="mt-0.5 text-[12.5px] text-slate-600">{failed}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 rounded-full"
                    disabled={busy}
                    onClick={() => pending && void rate(pending)}
                  >
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Retry
                  </Button>
                </div>
              )}

              {revealed ? (
                <FlashcardReviewRating
                  className="mt-4"
                  busy={busy}
                  pending={pending}
                  onRate={(r) => void rate(r)}
                />
              ) : (
                <Button
                  className="mt-4 h-12 w-full rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 text-[15px] font-extrabold text-white hover:from-violet-700 hover:to-indigo-700"
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
