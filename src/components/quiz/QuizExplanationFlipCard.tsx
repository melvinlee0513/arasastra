/**
 * Learning Tip explanation card for the quiz result review.
 *
 * The Learning Tip artwork is the card's front face and the whole tap target —
 * not an icon beside the text. Tapping flips the card on Y to reveal the real
 * explanation stored for that question.
 *
 * Each card owns its own flipped state, so questions flip independently.
 * Reduced-motion users get a crossfade instead of a rotation.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { QUIZ_ART } from "@/lib/quizArt";
import { RichTextRenderer } from "@/components/richtext/RichTextRenderer";

export interface QuizExplanationFlipCardProps {
  /** The question's stored explanation. Nothing renders without one. */
  explanation: string | null | undefined;
  /** Canonical rich explanation JSON, when the tutor authored formatting. */
  explanationContent?: unknown;
  /** Front-face artwork. Defaults to the Learning Tip card. */
  art?: string;
  className?: string;
}

export function QuizExplanationFlipCard({
  explanation,
  explanationContent = null,
  art = QUIZ_ART.learningTip,
  className,
}: QuizExplanationFlipCardProps) {
  const [flipped, setFlipped] = useState(false);
  const reduceMotion = useReducedMotion();
  const backId = useId();

  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);

  /*
   * Both faces are absolutely stacked so neither is squeezed by the other, and
   * the card animates to the height of whichever face is showing. Sizing to the
   * tallest face instead would strand the artwork in a tall empty box; leaving
   * the faces in flow would collapse the card mid-rotation.
   */
  useLayoutEffect(() => {
    const measure = () => {
      const el = flipped ? backRef.current : frontRef.current;
      if (el) setHeight(el.offsetHeight);
    };
    measure();
    // Degrade to a one-off measurement rather than taking the page down where
    // ResizeObserver is missing (older webviews, jsdom).
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    if (frontRef.current) ro.observe(frontRef.current);
    if (backRef.current) ro.observe(backRef.current);
    return () => ro.disconnect();
  }, [flipped, explanation]);

  // The artwork settles its height only once decoded.
  useEffect(() => {
    const img = frontRef.current?.querySelector("img");
    if (!img || img.complete) return;
    const onLoad = () => {
      if (!flipped && frontRef.current) setHeight(frontRef.current.offsetHeight);
    };
    img.addEventListener("load", onLoad);
    return () => img.removeEventListener("load", onLoad);
  }, [flipped]);

  if (!explanation?.trim()) return null;

  const duration = reduceMotion ? 0.18 : 0.45;
  const spring = { type: "spring" as const, stiffness: 260, damping: 28 };

  return (
    <button
      type="button"
      onClick={() => setFlipped((f) => !f)}
      aria-expanded={flipped}
      aria-controls={backId}
      aria-label={flipped ? "Hide explanation" : "Show explanation"}
      className={cn(
        "group relative mt-3 block w-full rounded-3xl text-left",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-quiz-accent focus-visible:ring-offset-2 focus-visible:ring-offset-quiz-arena-deep",
        className,
      )}
      style={{ perspective: reduceMotion ? undefined : 1200 }}
    >
      <motion.div
        className="relative w-full"
        animate={{ height }}
        transition={reduceMotion ? { duration } : spring}
        style={{ height }}
      >
        <motion.div
          className="absolute inset-x-0 top-0"
          style={{ transformStyle: reduceMotion ? undefined : "preserve-3d" }}
          animate={reduceMotion ? undefined : { rotateY: flipped ? 180 : 0 }}
          transition={reduceMotion ? { duration } : spring}
        >
          {/* FRONT — the Learning Tip artwork is the card */}
          <div
            ref={frontRef}
            className="absolute inset-x-0 top-0 overflow-hidden rounded-3xl"
            style={{ backfaceVisibility: reduceMotion ? undefined : "hidden" }}
            aria-hidden={flipped}
          >
            <motion.img
              src={art}
              alt=""
              aria-hidden
              loading="lazy"
              decoding="async"
              draggable={false}
              animate={reduceMotion ? { opacity: flipped ? 0 : 1 } : undefined}
              transition={{ duration }}
              /*
               * The source artwork is padded with wide transparent margins, so
               * a plain contain-fit would render a small pill in a large empty
               * box. Cropping to the banner's own band lets it fill the card.
               */
              className="pointer-events-none block aspect-[7/2] w-full select-none rounded-3xl object-cover object-center transition-transform duration-300 group-active:scale-[0.99]"
            />
          </div>

          {/* BACK — the real explanation */}
          <motion.div
            ref={backRef}
            id={backId}
            className={cn(
              "absolute inset-x-0 top-0 flex flex-col rounded-3xl",
              "border border-quiz-accent/45 bg-[hsl(258_55%_17%)]",
              "px-4 py-4 shadow-[0_0_30px_-10px_rgba(168,85,247,0.6)_inset]",
            )}
            style={
              reduceMotion
                ? undefined
                : { backfaceVisibility: "hidden", transform: "rotateY(180deg)" }
            }
            animate={reduceMotion ? { opacity: flipped ? 1 : 0 } : undefined}
            transition={{ duration }}
            aria-hidden={!flipped}
          >
            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-quiz-arena-muted">
              <span aria-hidden>💡</span> Explanation
            </p>
            <div className="break-words text-[13.5px] leading-relaxed text-quiz-arena-foreground">
              <RichTextRenderer value={explanationContent} fallbackText={explanation ?? ""} />
            </div>
            <p className="mt-3 text-[11px] font-semibold text-quiz-arena-muted/80">
              Tap to see Learning Tip
            </p>
          </motion.div>
        </motion.div>
      </motion.div>
    </button>
  );
}

export default QuizExplanationFlipCard;
