/**
 * Semantic illustration registry for the signed-out (guest) mobile experience.
 *
 * Every path below was verified against `public/assets/illustrations/`.
 * Guest components must reference these semantic names, never raw URLs.
 */

const BASE = "/assets/illustrations";

function asset(relative: string): string {
  return `${BASE}/${relative.split("/").map(encodeURIComponent).join("/")}`;
}

export const GUEST_ART = {
  // Mascots / heroes
  owlCloud: asset("ui/aras-owl-cloud-mascot.webp"),
  owlBookCloud: asset("ui/aras-owl-book-cloud-mascot.webp"),
  graduationCapClouds: asset("learning/graduation-cap-clouds-star.webp"),
  studentHero: asset("learning/student-learning-hero.webp"),

  // Decorative
  cloudCluster: asset("decorative/cloud-sphere-cluster.webp"),
  cloudSoft: asset("ui/cloud.webp"),
  star: asset("ui/sparkle-yellow.webp"),
  orb: asset("decorative/orbs-blue-purple.webp"),

  // Home — learning progress
  progressClock: asset("ui/progress-clock-star-icon.webp"),
  progressGrowth: asset("ui/progress-growth-chart-icon.webp"),
  progressPlay: asset("ui/progress-play-icon.webp"),

  // Subjects
  biology: asset("subjects/biology/dna-helix-icon.webp"),
  chemistry: asset("subjects/chemistry/chemistry-flask-icon.webp"),
  english: asset("subjects/languages/chat-bubbles-language-icon.webp"),
  mathematics: asset("subjects/mathematics/set-square.webp"),
  physics: asset("subjects/physics/atom-variant.webp"),
  science: asset("subjects/science/glossy_blue_liquid_beaker_with_stirring_rod.webp"),
  sejarah: asset("subjects/sejarah/history-scroll.webp"),
  subjectFallback: asset("ui/glossy_3d_study_folder_icon.webp"),

  // Class previews
  physicsPreview: asset("subjects/physics/class-card-preview-physics.webp"),
  biologyPreview: asset("subjects/biology/biology-class-preview-microscope-card.webp"),
  chemistryPreview: asset("subjects/chemistry/chemistry-class-preview-flask-card.webp"),

  // Learning tools
  flashcards: asset("learning/flashcards-star-cards.webp"),
  quizzes: asset("learning/quiz-clipboard-check.webp"),
  notes: asset("learning/notes-notebook-pencil.webp"),

  // Services
  inbox: asset("ui/inbox-envelope-notification.webp"),
  timetable: asset("ui/timetable-calendar-clock.webp"),
  announcements: asset("ui/announcement-megaphone.webp"),
  helpHeadset: asset("ui/help-support-headset.webp"),
  locked: asset("ui/locked-access-icon.webp"),

  // Why join
  scheduleClock: asset("ui/schedule-clock.webp"),
  materials: asset("learning/learning-materials-book-stack.webp"),
  bell: asset("ui/notification-bell-badge.webp"),

  // Profile unlocks / support
  trackProgress: asset("learning/track-progress-icon.webp"),
  saveClasses: asset("learning/save-classes-bookmark-icon.webp"),
  personaliseHome: asset("ui/personalise-home-icon.webp"),
  progressTracking: asset("ui/progress-tracking-clock.webp"),
  classBookmark: asset("ui/class-bookmark-illustration.webp"),
  personalisation: asset("ui/personalisation-puzzle.webp"),
  unlocked: asset("ui/unlocked-features-icon.webp"),
  supportChat: asset("ui/support-chat-bubble.webp"),
  contactPhone: asset("ui/contact-centre-phone-icon.webp"),
  privacyShield: asset("ui/privacy-policy-shield-icon.webp"),

  // CTA banners (mobile = tall composition, desktop = wide shallow composition)
  bestTutorsBanner: asset("ui/best-tutors-cta-banner.webp"),
  learningJourneyBanner: asset("ui/learning-journey-cta-banner.webp"),
  bestTutorsBannerDesktop: asset("ui/best-tutors-cta-banner-desktop.webp"),
  learningJourneyBannerDesktop: asset("ui/learning-journey-cta-banner-desktop.webp"),
} as const;

/** Decorative artwork helper props — never announced, never draggable. */
export const GUEST_DECOR_IMG_PROPS = {
  alt: "",
  "aria-hidden": true as const,
  draggable: false as const,
  loading: "lazy" as const,
  decoding: "async" as const,
};

/** Maps a public subject name onto an existing illustration. */
export function guestSubjectArt(name: string | null | undefined): string {
  const n = (name ?? "").toLowerCase();
  if (n.includes("bio")) return GUEST_ART.biology;
  if (n.includes("chem")) return GUEST_ART.chemistry;
  if (n.includes("physic")) return GUEST_ART.physics;
  if (n.includes("math") || n.includes("matemat")) return GUEST_ART.mathematics;
  if (n.includes("english") || n.includes("bahasa") || n.includes("language"))
    return GUEST_ART.english;
  if (n.includes("sejarah") || n.includes("history")) return GUEST_ART.sejarah;
  if (n.includes("science") || n.includes("sains")) return GUEST_ART.science;
  return GUEST_ART.subjectFallback;
}

/**
 * Per-subject presentation tuning for the mobile guest class-preview thumbnail.
 * Composite artwork is contained (never cropped); `scale` trims breathing room.
 */
export interface GuestPreviewArt {
  art: string;
  /** Fraction of the thumbnail box the artwork may occupy (0–1). */
  scale: number;
  objectPosition: string;
}

/** Subject-matched public class preview cover. */
export function guestSubjectPreview(name: string | null | undefined): string {
  const n = (name ?? "").toLowerCase();
  const cover = (rel: string) => asset(rel);
  if (n.includes("bio")) return cover("subjects/biology/class-card-preview-biology.webp");
  if (n.includes("chem")) return cover("subjects/chemistry/class-card-preview-chemistry.webp");
  if (n.includes("physic")) return cover("subjects/physics/class-card-preview-physics.webp");
  if (n.includes("add") && n.includes("math"))
    return cover("subjects/additional mathematics/class-card-preview-additional-mathematics.webp");
  if (n.includes("math") || n.includes("matemat"))
    return cover("subjects/mathematics/class-card-preview-mathematics.webp");
  if (n.includes("english")) return cover("subjects/languages/class-card-preview-english.webp");
  if (n.includes("bahasa") || n.includes("melayu"))
    return cover("subjects/languages/class-card-preview-bahasa-melayu.webp");
  if (n.includes("sejarah") || n.includes("history"))
    return cover("subjects/sejarah/class-card-preview-sejarah.webp");
  return cover("subjects/science/class-card-preview-science.webp");
}

/**
 * Centralised mobile guest preview art config. Subject compositions differ in
 * density, so each gets its own contained scale instead of scattered CSS.
 */
export function guestPreviewArt(name: string | null | undefined): GuestPreviewArt {
  const n = (name ?? "").toLowerCase();
  const art = guestSubjectPreview(name);
  if (n.includes("bio")) return { art, scale: 0.88, objectPosition: "center" };
  if (n.includes("chem")) return { art, scale: 0.89, objectPosition: "center" };
  if (n.includes("physic")) return { art, scale: 0.94, objectPosition: "center" };
  if (n.includes("math") || n.includes("matemat")) return { art, scale: 0.9, objectPosition: "center" };
  if (n.includes("english") || n.includes("bahasa") || n.includes("melayu") || n.includes("language"))
    return { art, scale: 0.9, objectPosition: "center" };
  if (n.includes("sejarah") || n.includes("history")) return { art, scale: 0.9, objectPosition: "center" };
  return { art, scale: 0.9, objectPosition: "center" };
}
