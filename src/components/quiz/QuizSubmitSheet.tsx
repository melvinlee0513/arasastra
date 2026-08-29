/**
 * Submit confirmation for the student quiz arena.
 *
 * A mobile bottom sheet in the arena's own language — deep violet glass, a
 * lavender border and a soft neon lift — so confirming a submission never feels
 * like a generic dialog pasted over the game.
 *
 * Presentation and state communication only: this component never submits, and
 * the counts it shows are always passed in from the live attempt.
 */
import { useEffect, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, Loader2, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { QUIZ_ART } from "@/lib/quizArt";

export interface QuizSubmitSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Questions with a saved answer. */
  answered: number;
  /** Total questions in the attempt. */
  total: number;
  submitting: boolean;
  onSubmit: () => void;
  /** Send the student to the first unanswered question. */
  onReview: () => void;
}

export function QuizSubmitSheet({
  open,
  onOpenChange,
  answered,
  total,
  submitting,
  onSubmit,
  onReview,
}: QuizSubmitSheetProps) {
  const reduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const unanswered = Math.max(0, total - answered);
  const complete = unanswered === 0;

  // Escape closes; focus starts on the confirm action.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    const t = setTimeout(() => confirmRef.current?.focus(), 60);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [open, submitting, onOpenChange]);

  // Keep Tab inside the sheet while it owns the screen.
  useEffect(() => {
    if (!open) return;
    const onTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onTab);
    return () => window.removeEventListener("keydown", onTab);
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          {/* Backdrop — dims the arena without hiding that it's still there. */}
          <motion.button
            type="button"
            aria-label="Close"
            tabIndex={-1}
            onClick={() => !submitting && onOpenChange(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2 }}
            className="absolute inset-0 cursor-default bg-quiz-arena-deep/80 backdrop-blur-sm"
          />

          <motion.div
            ref={panelRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="submit-sheet-title"
            aria-describedby="submit-sheet-desc"
            initial={reduceMotion ? { opacity: 0 } : { y: "100%", opacity: 0 }}
            animate={reduceMotion ? { opacity: 1 } : { y: 0, opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { y: "100%", opacity: 0 }}
            transition={
              reduceMotion
                ? { duration: 0.15 }
                : { type: "spring", stiffness: 380, damping: 34 }
            }
            className={cn(
              "relative w-full max-w-md",
              "rounded-t-[30px] sm:rounded-[30px] sm:mx-4",
              "border border-quiz-accent/40 border-b-0 sm:border-b",
              "bg-[hsl(258_55%_16%)]/95 backdrop-blur-2xl",
              "shadow-[0_-10px_60px_-12px_rgba(139,92,246,0.45),0_0_0_1px_rgba(255,255,255,0.04)_inset]",
              "px-5 pt-3 text-quiz-arena-foreground",
              "pb-[calc(env(safe-area-inset-bottom)+18px)] sm:pb-6",
            )}
          >
            {/* Grab handle — reads as a native sheet on touch. */}
            <div
              aria-hidden
              className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/25 sm:hidden"
            />

            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
                  complete
                    ? "bg-quiz-correct/20 text-emerald-200"
                    : "bg-amber-400/20 text-amber-200",
                )}
              >
                {complete ? (
                  <ShieldCheck className="h-5 w-5" />
                ) : (
                  <AlertTriangle className="h-5 w-5" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <h2
                  id="submit-sheet-title"
                  className="text-[19px] font-extrabold leading-tight"
                >
                  Submit quiz?
                </h2>
                <p className="mt-1 text-[14px] font-semibold text-quiz-arena-foreground/90">
                  You&apos;ve answered {answered} of {total}{" "}
                  {total === 1 ? "question" : "questions"}.
                </p>
              </div>
              <img
                src={complete ? QUIZ_ART.owlCelebrating : QUIZ_ART.owlGamingCompact}
                alt=""
                aria-hidden
                loading="lazy"
                decoding="async"
                draggable={false}
                className="pointer-events-none h-14 w-14 shrink-0 select-none object-contain drop-shadow-[0_10px_18px_rgba(0,0,0,0.5)]"
              />
            </div>

            <div id="submit-sheet-desc" className="mt-3 space-y-2">
              {!complete && (
                <div className="rounded-2xl border border-amber-300/30 bg-amber-400/12 px-3.5 py-2.5">
                  <p className="text-[13.5px] font-bold text-amber-100">
                    {unanswered} {unanswered === 1 ? "question is" : "questions are"} still
                    unanswered.
                  </p>
                </div>
              )}
              <p className="text-[13.5px] leading-snug text-quiz-arena-muted">
                Once submitted, you won&apos;t be able to change your answers.
              </p>
            </div>

            <div className="mt-5 flex flex-col gap-2.5">
              <button
                ref={confirmRef}
                type="button"
                onClick={onSubmit}
                disabled={submitting}
                className={cn(
                  "flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full",
                  "bg-gradient-to-r from-quiz-accent-pink to-quiz-accent",
                  "text-[15.5px] font-extrabold text-white",
                  "shadow-[0_10px_30px_-8px_rgba(168,85,247,0.7)]",
                  "transition active:scale-[0.98] disabled:opacity-70",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(258_55%_16%)]",
                )}
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {submitting ? "Submitting…" : complete ? "Submit quiz" : "Submit anyway"}
              </button>

              <button
                type="button"
                onClick={() => {
                  if (submitting) return;
                  if (complete) onOpenChange(false);
                  else onReview();
                }}
                disabled={submitting}
                className={cn(
                  "flex min-h-[52px] w-full items-center justify-center rounded-full",
                  "border border-white/18 bg-white/8 text-[15px] font-bold text-quiz-arena-foreground",
                  "transition active:scale-[0.98] disabled:opacity-60",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(258_55%_16%)]",
                )}
              >
                {complete ? "Keep editing" : "Review questions"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export default QuizSubmitSheet;
