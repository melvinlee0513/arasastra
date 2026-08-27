/**
 * Quiz illustration registry.
 *
 * Single source of truth for the soft-3D WebP artwork used across the student
 * quiz experience. Components must never hardcode `/assets/illustrations/quiz/`
 * paths so art swaps stay a one-file change.
 */

const BASE = "/assets/illustrations/quiz";

export const QUIZ_ART = {
  // Mascots
  owlGaming: `${BASE}/owl-mascot-gaming-on-cloud.webp`,
  owlGamingStars: `${BASE}/owl-mascot-gaming-on-cloud-stars.webp`,
  owlGamingSparkles: `${BASE}/owl-mascot-gaming-on-cloud-sparkles.webp`,
  owlGamingCompact: `${BASE}/owl-mascot-gaming-on-cloud-compact.webp`,
  owlController: `${BASE}/owl-mascot-gaming-controller.webp`,
  owlCelebrating: `${BASE}/owl-mascot-celebrating-on-cloud.webp`,
  owlCelebratingStars: `${BASE}/owl-mascot-celebrating-stars-on-cloud.webp`,
  owlCelebratingSparkles: `${BASE}/owl-mascot-celebrating-sparkles-on-cloud.webp`,
  owlSad: `${BASE}/owl-mascot-sad-crying-on-cloud.webp`,
  owlTeary: `${BASE}/owl-mascot-sad-teary-on-cloud.webp`,
  owlAvatar: `${BASE}/owl-avatar-graduation-circle.webp`,

  // Badges / status
  xpGem: `${BASE}/xp-purple-gem-badge.webp`,
  xpHexagon: `${BASE}/quiz-badge-xp-hexagon.webp`,
  xpLightning: `${BASE}/xp-lightning-status-bar.webp`,
  streakFire: `${BASE}/quiz-streak-fire-icon.webp`,
  streakBar: `${BASE}/streak-fire-status-bar.webp`,
  levelStars: `${BASE}/quiz-level-progress-stars-bar.webp`,
  goldStar: `${BASE}/quiz-gold-star-icon.webp`,
  rankShield: `${BASE}/rank-star-purple-shield-badg.webp`,
  achievementStar: `${BASE}/quiz-badge-achievement-star.webp`,
  completionCheck: `${BASE}/quiz-badge-completion-check-ribbon.webp`,
  successMedal: `${BASE}/success-check-ribbon-medal.webp`,
  controllerIcon: `${BASE}/quiz-icon-game-controller-purple.webp`,
  crystalGem: `${BASE}/quiz-purple-crystal-gem.webp`,

  // Ranks
  rank1: `${BASE}/rank-1-gold-crown-medal.webp`,
  rank2: `${BASE}/rank-2-silver-crown-medal.webp`,
  rank3: `${BASE}/rank-3-bronze-crown-medal.webp`,
  podium: `${BASE}/quiz-podium-top-three-laurel.webp`,

  // Themed subject/quiz card art
  rocketClouds: `${BASE}/quiz-illustration-rocket-launch-clouds.webp`,
  rocketPlanet: `${BASE}/quiz-illustration-rocket-launch-planet.webp`,
  hourglass: `${BASE}/quiz-illustration-hourglass-clouds.webp`,
  potion: `${BASE}/quiz-illustration-magic-potion-star.webp`,
  plant: `${BASE}/quiz-illustration-growing-plant.webp`,
  trophyPodium: `${BASE}/quiz-illustration-trophy-purple-podium.webp`,
  trophyRibbon: `${BASE}/quiz-illustration-trophy-purple-ribbon.webp`,
  planet: `${BASE}/quiz-decoration-purple-ringed-planet.webp`,
  learningTip: `${BASE}/quiz-card-learning-tip.webp`,
  explanation: `${BASE}/answer-explanation-card.webp`,

  // Decorations
  cloudsBottomDark: `${BASE}/quiz-purple-clouds-bottom-dark.webp`,
  cloudsBottomLight: `${BASE}/quiz-purple-clouds-bottom-light.webp`,
  cloudsBottomSparkles: `${BASE}/quiz-purple-clouds-bottom-sparkles.webp`,
  cloudsOrbsLandscape: `${BASE}/quiz-clouds-orbs-landscape-decoration.webp`,
  starsOrbs: `${BASE}/quiz-stars-orbs-decoration.webp`,
  spaceBorder: `${BASE}/quiz-space-border-decoration.webp`,
  neonPanel: `${BASE}/quiz-purple-neon-panel-background.webp`,
  sparklePanel: `${BASE}/quiz-purple-sparkle-panel-background.webp`,
} as const;

export type QuizArtKey = keyof typeof QUIZ_ART;

/** Rotating themed card art so a list of quizzes never looks repetitive. */
const CARD_ART_CYCLE: string[] = [
  QUIZ_ART.rocketClouds,
  QUIZ_ART.potion,
  QUIZ_ART.plant,
  QUIZ_ART.hourglass,
  QUIZ_ART.rocketPlanet,
  QUIZ_ART.planet,
];

/** Stable per-id art pick (same quiz always shows the same illustration). */
export function quizCardArt(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) % 100000;
  return CARD_ART_CYCLE[hash % CARD_ART_CYCLE.length];
}

/** Subject-family art, when the quiz belongs to a known canonical subject. */
export function quizSubjectArt(subjectKey: string | null | undefined, seed: string): string {
  switch ((subjectKey ?? "").toLowerCase()) {
    case "physics":
      return QUIZ_ART.rocketPlanet;
    case "chemistry":
      return QUIZ_ART.potion;
    case "biology":
      return QUIZ_ART.plant;
    case "mathematics":
    case "additional_mathematics":
    case "add_maths":
      return QUIZ_ART.hourglass;
    default:
      return quizCardArt(seed);
  }
}
