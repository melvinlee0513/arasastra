/**
 * Semantic artwork registry for the Flashcards experience.
 *
 * Every path below exists under `public/assets/illustrations/`. Components must
 * reference these semantic names instead of raw asset URLs.
 */
const BASE = "/assets/illustrations";

function asset(relative: string): string {
  return `${BASE}/${relative.split("/").map(encodeURIComponent).join("/")}`;
}

export const FLASHCARD_ART = {
  /** Student "My Flashcards" hero mascot. */
  studentHero: asset("ui/aras-owl-book-cloud-mascot.webp"),
  /** Tutor / admin library hero mascot. */
  libraryHero: asset("ui/aras-owl-cloud-mascot.webp"),
  /** Deck identity tile fallback. */
  deck: asset("learning/flashcards-star-cards.webp"),
  /** Study session ambience + completion celebration. */
  sparkle: asset("decorative/sparkle-purple.png"),
  trophy: asset("decorative/glossy_golden_star_trophy_icon.webp"),
  star: asset("gamification/achievement-star.webp"),
  xp: asset("gamification/glossy_golden_lightning_bolt.webp"),
  streak: asset("gamification/glossy_3d_flame_icon.webp"),
  target: asset("learning/target-goal.webp"),
  empty: asset("learning/learning-flashcards.webp"),
} as const;
