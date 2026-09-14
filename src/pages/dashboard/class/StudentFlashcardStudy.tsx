import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  ArrowLeft, Check, Loader2, RotateCcw, Sparkles, Layers, CloudOff, RefreshCcw,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { useFeatureEnabled } from "@/hooks/useFeature";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { FeatureUnavailable } from "@/pages/FeatureUnavailable";
import { FlipCard } from "@/components/flashcards/FlipCard";
import {
  DeckTile,
  FlashcardEmptyState,
  FlashcardScreen,
} from "@/components/flashcards/FlashcardChrome";
import { FLASHCARD_ART } from "@/lib/flashcardArt";

import {
  flashcardStudentKeys,
  isFlashcardProgressConflict,
  mapFlashcardError,
  recordFlashcardDeckCompletion,
  restartFlashcardDeck,
  saveFlashcardProgress,
  startOrResumeFlashcardDeck,
  type FlashcardCard,
  type FlashcardProgressPatch,
  type FlashcardStudySession,
} from "@/lib/flashcards";

type SaveState = "idle" | "saving" | "error";

/**
 * Student flashcard study flow. All state is owned by the server
 * (`start_or_resume_flashcard_deck` / `save_flashcard_progress` /
 * `restart_flashcard_deck`), so a refresh resumes exactly where the student
 * left off. Saves are serialized and revision-guarded so a stale tab can never
 * overwrite newer progress.
 */
export function StudentFlashcardStudy() {
  const { classId, deckId } = useParams<{ classId: string; deckId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const flashcardsOn = useFeatureEnabled("flashcards");
  const reduceMotion = useReducedMotion();

  const [session, setSession] = useState<FlashcardStudySession | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [revealed, setRevealed] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [busy, setBusy] = useState(false);
  const [awarded, setAwarded] = useState(false);

  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const revisionRef = useRef<number>(0);
  const completionClaimed = useRef(false);

  // Studying can be entered from a class hub or from My Flashcards.
  const libraryPath = classId ? `/dashboard/classes/${classId}/flashcards` : "/dashboard/flashcards";


  const applySession = useCallback((next: FlashcardStudySession) => {
    setSession(next);
    revisionRef.current = next.progress.progress_revision;
  }, []);

  // Initial load / resume.
  useEffect(() => {
    if (!deckId || !user || !flashcardsOn) return;
    let cancelled = false;
    setIsLoading(true);
    startOrResumeFlashcardDeck(deckId)
      .then((s) => {
        if (cancelled) return;
        applySession(s);
        setLoadError(null);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(mapFlashcardError(err, "This deck isn't available right now."));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [deckId, user, flashcardsOn, applySession]);

  const cards = session?.deck.cards ?? [];
  const cardById = useMemo(() => {
    const m = new Map<string, FlashcardCard>();
    cards.forEach((c) => m.set(c.id, c));
    return m;
  }, [cards]);

  const queue = session?.progress.queue ?? [];
  const completedIds = session?.progress.completed_ids ?? [];
  const total = cards.length;
  const doneCount = completedIds.length;
  const currentId = session?.progress.current_card_id ?? queue[0] ?? null;
  const currentCard = currentId ? cardById.get(currentId) ?? null : null;
  const finished = !!session && total > 0 && queue.length === 0;

  const invalidateLibrary = useCallback(() => {
    if (!classId) return;
    queryClient.invalidateQueries({
      queryKey: flashcardStudentKeys.list(currentTenantId, classId, user?.id),
    });
  }, [classId, currentTenantId, queryClient, user?.id]);

  /** Serialized, revision-guarded progress save. */
  const pushProgress = useCallback(
    (patch: FlashcardProgressPatch) => {
      if (!deckId) return;
      setSaveState("saving");
      chain.current = chain.current
        .then(() => saveFlashcardProgress(deckId, patch, revisionRef.current))
        .then((progress) => {
          revisionRef.current = progress.progress_revision;
          setSession((prev) => (prev ? { ...prev, progress } : prev));
          setSaveState("idle");
        })
        .catch(async (err) => {
          if (isFlashcardProgressConflict(err)) {
            try {
              const fresh = await startOrResumeFlashcardDeck(deckId);
              applySession(fresh);
              setRevealed(false);
              setSaveState("idle");
              toast.info("Your progress was updated in another tab. Reloaded the latest.");
              return;
            } catch {
              /* fall through to error state */
            }
          }
          setSaveState("error");
          toast.error(mapFlashcardError(err, "Couldn't save your progress. Check your connection."));
        });
    },
    [applySession, deckId],
  );

  const answer = useCallback(
    (gotIt: boolean) => {
      if (!session || !currentId) return;
      const p = session.progress;
      const restQueue = p.queue.filter((id) => id !== currentId);
      const nextQueue = gotIt ? restQueue : [...restQueue, currentId];
      const nextCompleted = gotIt && !p.completed_ids.includes(currentId)
        ? [...p.completed_ids, currentId]
        : p.completed_ids;
      const nextReviewed = p.reviewed_ids.includes(currentId)
        ? p.reviewed_ids
        : [...p.reviewed_ids, currentId];
      const patch: FlashcardProgressPatch = {
        queue: nextQueue,
        completed_ids: nextCompleted,
        reviewed_ids: nextReviewed,
        current_card_id: nextQueue[0] ?? null,
      };
      // Optimistic UI; the server response reconciles revision + timestamps.
      setSession({ ...session, progress: { ...p, ...patch } });
      setRevealed(false);
      pushProgress(patch);
    },
    [currentId, pushProgress, session],
  );

  // Completion XP: claimed once per mount, after the queue drains and saves settle.
  useEffect(() => {
    if (!deckId || !finished || completionClaimed.current || total === 0) return;
    if (doneCount < total) return;
    completionClaimed.current = true;
    chain.current = chain.current
      .then(() => recordFlashcardDeckCompletion(deckId))
      .then((res) => {
        if (res.awarded) {
          setAwarded(true);
          toast.success("Deck complete! +25 XP");
        }
        invalidateLibrary();
      })
      .catch(() => {
        // XP is a bonus: never block the completion screen on it.
        completionClaimed.current = false;
      });
  }, [deckId, doneCount, finished, invalidateLibrary, total]);

  const restart = useCallback(async () => {
    if (!deckId) return;
    setBusy(true);
    try {
      const fresh = await restartFlashcardDeck(deckId);
      applySession(fresh);
      setRevealed(false);
      completionClaimed.current = false;
      setAwarded(false);
      invalidateLibrary();
    } catch (err) {
      toast.error(mapFlashcardError(err, "Couldn't restart this deck."));
    } finally {
      setBusy(false);
    }
  }, [applySession, deckId, invalidateLibrary]);

  // Keyboard support: space/enter reveals, 1/2 answers.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!currentCard) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (!revealed) setRevealed(true);
        return;
      }
      if (!revealed) return;
      if (e.key === "1") answer(true);
      if (e.key === "2") answer(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [answer, currentCard, revealed]);

  useEffect(() => {
    return () => {
      invalidateLibrary();
    };
  }, [invalidateLibrary]);

  if (!flashcardsOn) return <FeatureUnavailable feature="Flashcards" />;

  if (isLoading) {
    return (
      <Screen>
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
          <p className="text-sm font-semibold">Loading deck…</p>
        </div>
      </Screen>
    );
  }

  if (loadError || !session) {
    return (
      <Screen>
        <div className="w-full max-w-md">
          <FlashcardEmptyState
            art={FLASHCARD_ART.empty}
            title="Deck unavailable"
            description={loadError ?? "This deck isn't available right now."}
            action={
              <Button asChild className="rounded-full bg-violet-600 hover:bg-violet-700">
                <Link to={libraryPath}>Back to flashcards</Link>
              </Button>
            }
          />
        </div>
      </Screen>
    );
  }

  if (total === 0) {
    return (
      <Screen>
        <div className="w-full max-w-md">
          <FlashcardEmptyState
            art={FLASHCARD_ART.empty}
            title="No cards in this deck yet"
            description="Your tutor hasn't added any cards to this deck."
            action={
              <Button asChild className="rounded-full bg-violet-600 hover:bg-violet-700">
                <Link to={libraryPath}>Back to flashcards</Link>
              </Button>
            }
          />
        </div>
      </Screen>
    );
  }

  const pct = Math.round((doneCount / total) * 100);
  const showProgress = session.deck.show_progress ?? true;
  const position = Math.min(doneCount + 1, total);

  return (
    <FlashcardScreen className="min-h-screen">
      <div className="mx-auto max-w-2xl space-y-4 p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:p-6">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 rounded-full text-slate-600"
            onClick={() => navigate(libraryPath)}
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Exit
          </Button>
          <span className="flex-1" />
          <SaveIndicator state={saveState} />
        </div>

        {/* Deck identity */}
        <div className="flex items-center gap-3 rounded-[24px] border border-violet-100 bg-white/85 p-3.5 shadow-[0_14px_34px_-26px_rgba(76,29,149,0.5)] backdrop-blur">
          <DeckTile />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-extrabold text-slate-900">{session.deck.title}</p>
            <p className="text-[12px] font-semibold text-slate-500">
              Card {position} of {total}
            </p>
          </div>
          {(session.deck.award_xp ?? true) && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-black text-amber-600">
              <img
                src={FLASHCARD_ART.xp}
                alt=""
                aria-hidden="true"
                draggable={false}
                className="h-3.5 w-3.5 select-none object-contain"
              />
              XP
            </span>
          )}
        </div>

        {showProgress && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[12px] font-bold text-slate-500">
              <span className="tabular-nums">
                {doneCount} of {total} got it
              </span>
              <span className="tabular-nums">{queue.length} left</span>
            </div>
            <Progress value={pct} className="h-2.5" aria-label={`${pct}% complete`} />
          </div>
        )}

        {finished ? (
          <div className="relative overflow-hidden rounded-[28px] border border-white/70 bg-gradient-to-br from-white via-violet-50 to-violet-100 p-8 text-center shadow-[0_22px_45px_-26px_rgba(76,29,149,0.6)]">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-violet-300/30 blur-2xl"
            />
            <img
              src={FLASHCARD_ART.trophy}
              alt=""
              aria-hidden="true"
              draggable={false}
              className="relative mx-auto h-28 w-28 select-none object-contain drop-shadow-[0_12px_22px_rgba(76,29,149,0.3)]"
            />
            <h2 className="relative mt-3 text-[24px] font-black tracking-tight text-slate-900">Study complete</h2>
            <p className="relative mt-1.5 text-[14px] text-slate-600">
              You worked through all {total} card{total === 1 ? "" : "s"} in this deck.
            </p>
            {awarded && (
              <p className="relative mt-3 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-[12.5px] font-black text-amber-600">
                <Sparkles className="h-4 w-4" aria-hidden="true" /> +25 XP earned
              </p>
            )}
            <div className="relative mt-6 flex flex-col gap-2.5">
              <Button
                onClick={restart}
                disabled={busy}
                className="h-12 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 text-[15px] font-extrabold shadow-[0_16px_32px_-16px_rgba(109,40,217,0.9)] hover:from-violet-700 hover:to-indigo-700"
              >
                {busy ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="mr-1.5 h-4 w-4" />
                )}
                Study again
              </Button>
              <Button asChild variant="outline" className="h-12 rounded-full text-[15px] font-bold">
                <Link to={libraryPath}>Back to flashcards</Link>
              </Button>
            </div>
          </div>
        ) : (
          currentCard && (
            <>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={currentCard.id}
                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
                  animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -12 }}
                  transition={{ duration: reduceMotion ? 0.12 : 0.22 }}
                >
                  <FlipCard
                    card={currentCard}
                    flipped={revealed}
                    onFlip={() => setRevealed((r) => !r)}
                    hint={revealed ? "Tap to see the question" : "Tap to reveal the answer"}
                  />
                </motion.div>
              </AnimatePresence>

              {/* Study navigation: review · flip · got it */}
              <div className="flex items-center gap-2.5">
                <Button
                  variant="outline"
                  onClick={() => answer(false)}
                  disabled={!revealed}
                  aria-label="Review this card again later"
                  className="h-14 flex-1 rounded-full border-violet-200 bg-white text-[13.5px] font-bold text-slate-600"
                >
                  <RefreshCcw className="mr-1.5 h-4 w-4" /> Review
                </Button>
                <Button
                  onClick={() => setRevealed((r) => !r)}
                  className="h-14 flex-[1.4] rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 text-[15px] font-extrabold text-white shadow-[0_16px_32px_-14px_rgba(109,40,217,0.95)] hover:from-violet-700 hover:to-indigo-700"
                >
                  {revealed ? "Show question" : "Flip card"}
                </Button>
                <Button
                  onClick={() => answer(true)}
                  disabled={!revealed}
                  aria-label="I got this card right"
                  className="h-14 flex-1 rounded-full bg-emerald-500 text-[13.5px] font-bold text-white hover:bg-emerald-600"
                >
                  <Check className="mr-1.5 h-4 w-4" /> Got it
                </Button>
              </div>
            </>
          )
        )}
      </div>
    </FlashcardScreen>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "saving")
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving
      </span>
    );
  if (state === "error")
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-destructive">
        <CloudOff className="w-3.5 h-3.5" /> Not saved
      </span>
    );
  return <span className="text-xs text-slate-400">Saved</span>;
}

function Screen({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">{children}</div>;
}

export default StudentFlashcardStudy;
