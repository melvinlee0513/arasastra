import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { continueRoute, type HomeContinueItem } from "@/lib/studentHome";
import { HOME_CARD, HOME_ART, HomeDecorArt } from "./StudentHomeShared";
import { cn } from "@/lib/utils";

interface Props {
  items: HomeContinueItem[];
  isLoading: boolean;
}

/**
 * Quick Practice strip — a compact call to action that reuses the real Continue
 * Learning feed to pick a genuine practice candidate (flashcard deck first,
 * otherwise a quiz). No counts or durations are invented: everything shown comes
 * from the canonical feed. When no practice candidate exists the strip is simply
 * not rendered.
 */
export function StudentHomeQuickPractice({ items, isLoading }: Props) {
  if (isLoading) {
    return (
      <div
        aria-hidden="true"
        className={cn(HOME_CARD, "h-[76px] animate-pulse bg-home-learning/50")}
      />
    );
  }

  const candidate =
    items.find((i) => i.category === "flashcards") ?? items.find((i) => i.category === "quiz");
  if (!candidate) return null;

  const label = candidate.category === "flashcards" ? "Flashcards" : "Quiz";

  return (
    <Link
      to={continueRoute(candidate)}
      className={cn(
        HOME_CARD,
        "relative flex items-center gap-3 overflow-hidden border-home-learning-accent/15 bg-gradient-to-r from-home-learning to-white px-3.5 py-3 transition-transform duration-200 active:scale-[0.985] motion-reduce:transition-none",
      )}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[hsl(219_95%_60%)] to-[hsl(223_79%_45%)] shadow-[0_6px_16px_rgba(37,74,168,0.30)]">
        <HomeDecorArt src={HOME_ART.goldBolt} className="h-7 w-7 drop-shadow-[0_2px_6px_rgba(15,23,42,0.25)]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15.5px] font-bold text-slate-900">Quick Practice</span>
        <span className="block truncate text-[12.5px] text-slate-500">
          {label} · {candidate.class_name ?? candidate.subject_name ?? candidate.title}
        </span>
      </span>
      <span className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 text-[14px] font-bold text-primary-foreground shadow-[0_6px_16px_rgba(37,74,168,0.25)]">
        Start
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </span>
    </Link>
  );
}
