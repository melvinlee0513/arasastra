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

  const libraryPath = `/dashboard/classes/${classId}/flashcards`;

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
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm">Loading deck…</p>
        </div>
      </Screen>
    );
  }

  if (loadError || !session) {
    return (
      <Screen>
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 text-center max-w-md">
          <h2 className="text-lg font-bold text-slate-900">Deck unavailable</h2>
          <p className="text-slate-500 mt-2 text-sm">{loadError ?? "This deck isn't available right now."}</p>
          <Button asChild className="rounded-full mt-5">
            <Link to={libraryPath}>Back to flashcards</Link>
          </Button>
        </div>
      </Screen>
    );
  }

  if (total === 0) {
    return (
      <Screen>
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 text-center max-w-md">
          <Layers className="w-8 h-8 text-slate-400 mx-auto" />
          <h2 className="text-lg font-bold text-slate-900 mt-3">No cards in this deck yet</h2>
          <p className="text-slate-500 mt-1 text-sm">Your tutor hasn't added any cards.</p>
          <Button asChild className="rounded-full mt-5">
            <Link to={libraryPath}>Back to flashcards</Link>
          </Button>
        </div>
      </Screen>
    );
  }

  const pct = Math.round((doneCount / total) * 100);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-2xl mx-auto p-4 sm:p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] space-y-5">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="rounded-full -ml-2" onClick={() => navigate(libraryPath)}>
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Exit
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="font-semibold text-slate-900 truncate">{session.deck.title}</h1>
          </div>
          <SaveIndicator state={saveState} />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              {doneCount} of {total} mastered
            </span>
            <span>{queue.length} left</span>
          </div>
          <Progress value={pct} className="h-2" aria-label={`${pct}% mastered`} />
        </div>

        {finished ? (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 mx-auto flex items-center justify-center">
              <Sparkles className="w-7 h-7 text-primary" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mt-4">Deck complete</h2>
            <p className="text-slate-500 mt-1 text-sm">
              You mastered all {total} cards{awarded ? " and earned 25 XP" : ""}.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center mt-6">
              <Button onClick={restart} disabled={busy} className="rounded-full min-h-[44px]">
                {busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-1.5" />}
                Restart deck
              </Button>
              <Button asChild variant="outline" className="rounded-full min-h-[44px]">
                <Link to={libraryPath}>Back to flashcards</Link>
              </Button>
            </div>
          </div>
        ) : (
          currentCard && (
            <>
              <div className="relative">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.button
                    key={`${currentCard.id}-${revealed ? "back" : "front"}`}
                    type="button"
                    onClick={() => setRevealed((r) => !r)}
                    initial={reduceMotion ? { opacity: 0 } : { opacity: 0, rotateX: -12 }}
                    animate={reduceMotion ? { opacity: 1 } : { opacity: 1, rotateX: 0 }}
                    exit={reduceMotion ? { opacity: 0 } : { opacity: 0, rotateX: 12 }}
                    transition={{ duration: reduceMotion ? 0.12 : 0.22 }}
                    aria-label={revealed ? "Show front of card" : "Reveal answer"}
                    className="w-full text-left bg-white rounded-3xl border border-slate-200 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6 sm:p-8 min-h-[240px] flex flex-col justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <span className="text-[11px] uppercase tracking-wide text-slate-400">
                      {revealed ? "Back" : "Front"}
                    </span>
                    <p className="mt-3 text-lg sm:text-xl font-medium text-slate-900 whitespace-pre-wrap break-words">
                      {revealed ? currentCard.back : currentCard.front}
                    </p>
                    {!revealed && (
                      <span className="mt-6 text-xs text-slate-400">Tap the card to reveal the answer</span>
                    )}
                  </motion.button>
                </AnimatePresence>
              </div>

              {revealed ? (
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant="outline"
                    onClick={() => answer(false)}
                    className="rounded-full min-h-[48px] border-slate-300"
                  >
                    <RefreshCcw className="w-4 h-4 mr-1.5" /> Review
                  </Button>
                  <Button onClick={() => answer(true)} className="rounded-full min-h-[48px]">
                    <Check className="w-4 h-4 mr-1.5" /> Got it
                  </Button>
                </div>
              ) : (
                <Button onClick={() => setRevealed(true)} className="rounded-full w-full min-h-[48px]">
                  Reveal answer
                </Button>
              )}
            </>
          )
        )}
      </div>
    </div>
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
