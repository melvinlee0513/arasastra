import { useMemo } from "react";
import { useReducedMotion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { RichTextRenderer } from "@/components/richtext/RichTextRenderer";
import { FlashcardMedia } from "@/components/flashcards/FlashcardMedia";
import type { FlashcardCard } from "@/lib/flashcards";

/** Deterministic sparkle positions so a card never "twinkles" on re-render. */
const SPARKLES = [
  { top: "10%", left: "8%", size: 14, opacity: 0.45 },
  { top: "18%", right: "12%", size: 10, opacity: 0.35 },
  { bottom: "14%", left: "14%", size: 11, opacity: 0.3 },
  { bottom: "9%", right: "9%", size: 15, opacity: 0.4 },
];

function LavenderFace({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex min-h-[280px] w-full flex-col overflow-hidden rounded-[28px] border border-white",
        "bg-gradient-to-br from-white via-violet-50 to-violet-100 p-6 text-left shadow-[0_18px_40px_-18px_rgba(76,29,149,0.35)]",
        className,
      )}
    >
      {SPARKLES.map((s, i) => (
        <Sparkles
          key={i}
          aria-hidden="true"
          className="pointer-events-none absolute text-violet-300"
          style={{ ...s, width: s.size, height: s.size, opacity: s.opacity }}
        />
      ))}
      <span className="relative z-10 inline-flex w-fit rounded-full bg-white/80 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-violet-600">
        {label}
      </span>
      <div className="relative z-10 mt-4 flex flex-1 flex-col justify-center gap-4">{children}</div>
    </div>
  );
}

export interface FlipCardProps {
  card: FlashcardCard;
  flipped: boolean;
  onFlip: () => void;
  frontLabel?: string;
  backLabel?: string;
  hint?: string;
  className?: string;
}

/**
 * The one Aras A+ "Lavender Stars" flashcard. Front and back share the exact
 * same template, so a flip feels like turning one physical card. Uses a real
 * 3D rotation, and a crossfade when the device asks for reduced motion.
 */
export function FlipCard({
  card,
  flipped,
  onFlip,
  frontLabel = "Question",
  backLabel = "Answer",
  hint = "Tap to reveal answer",
  className,
}: FlipCardProps) {
  const reduceMotion = useReducedMotion();

  const front = useMemo(
    () => (
      <LavenderFace label={frontLabel}>
        <RichTextRenderer
          className="text-[19px] font-semibold leading-snug text-slate-900"
          value={card.front_content ?? null}
          fallbackText={card.front}
        />
        {card.front_image_path && (
          <FlashcardMedia
            media={{
              image_path: card.front_image_path,
              image_width: card.front_image_width ?? null,
              image_height: card.front_image_height ?? null,
              image_alt: card.front_image_alt ?? null,
              image_crop: card.front_image_crop ?? null,
            }}
          />
        )}
        <span className="mt-1 text-[12.5px] font-semibold text-violet-500">{hint}</span>
      </LavenderFace>
    ),
    [card, frontLabel, hint],
  );

  const back = useMemo(
    () => (
      <LavenderFace label={backLabel}>
        <RichTextRenderer
          className="text-[18px] leading-snug text-slate-900"
          value={card.back_content ?? null}
          fallbackText={card.back}
        />
        {card.back_image_path && (
          <FlashcardMedia
            media={{
              image_path: card.back_image_path,
              image_width: card.back_image_width ?? null,
              image_height: card.back_image_height ?? null,
              image_alt: card.back_image_alt ?? null,
              image_crop: card.back_image_crop ?? null,
            }}
          />
        )}
      </LavenderFace>
    ),
    [card, backLabel],
  );

  if (reduceMotion) {
    return (
      <button
        type="button"
        onClick={onFlip}
        aria-label={flipped ? "Show the question" : "Reveal the answer"}
        className={cn(
          "block w-full text-left transition-opacity duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2",
          className,
        )}
      >
        {flipped ? back : front}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onFlip}
      aria-label={flipped ? "Show the question" : "Reveal the answer"}
      className={cn(
        "block w-full text-left [perspective:1400px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 active:scale-[0.995]",
        className,
      )}
    >
      <div
        className="relative transition-transform duration-[420ms] [transform-style:preserve-3d]"
        style={{ transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)", transitionTimingFunction: "cubic-bezier(0.2,0.8,0.2,1)" }}
      >
        <div className="[backface-visibility:hidden]">{front}</div>
        <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
          <div className="h-full overflow-y-auto">{back}</div>
        </div>
      </div>
    </button>
  );
}
