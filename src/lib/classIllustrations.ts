/**
 * Aras A+ soft-3D illustration system.
 *
 * Single source of truth for the WebP illustration library that lives in
 * `public/assets/illustrations/`. Every path below was verified against the
 * repository — do not add entries without confirming the file exists.
 *
 * Assets are referenced by public URL (no bundler import) so they stay out of
 * the JS graph and can be lazily fetched by the browser.
 */

const BASE = "/assets/illustrations";

/** Encodes path segments (the "additional mathematics" folder contains a space). */
function asset(relative: string): string {
  return `${BASE}/${relative.split("/").map(encodeURIComponent).join("/")}`;
}

/** Class Hub section navigation tiles. */
export const CLASS_NAV_ART = {
  home: asset("ui/glossy_blue_graduation_cap_with_gold_tassel.webp"),
  announcements: asset("ui/glossy_3d_megaphone_icon.webp"),
  materials: asset("ui/glossy_3d_study_folder_icon.webp"),
  students: asset("learning/global-learning.webp"),
  discussions: asset("learning/notification-messages.webp"),
  quizzes: asset("ui/glossy_3d_quiz_card_icon.webp"),
  flashcards: asset("learning/learning-flashcards.webp"),
  about: asset("ui/glossy_blue_3d_information_bubble.webp"),
} as const;

/** Decorative accents — always rendered aria-hidden with pointer-events none. */
export const DECOR_ART = {
  star: asset("ui/sparkle-yellow.webp"),
  orbs: asset("decorative/orbs-blue-purple.webp"),
  cloud: asset("decorative/glossy_fluffy_cloud_icon.webp"),
  books: asset("learning/glossy_pastel_stack_of_books.webp"),
  paperPlane: asset("decorative/paper-plane-purple.webp"),
} as const;

/** Content illustrations used by empty/complete states. */
export const STATE_ART = {
  quiz: asset("ui/glossy_3d_quiz_card_icon.webp"),
  worksheet: asset("ui/glossy_3d_clipboard_and_pencil_worksheet.webp"),
  replay: asset("ui/glossy_purple_replay_camera_icon.webp"),
  notes: asset("ui/glossy_pastel_notebook_stack_icon.webp"),
  megaphone: asset("ui/glossy_3d_megaphone_icon.webp"),
  flashcards: asset("learning/learning-flashcards.webp"),
  calendar: asset("learning/glossy_pastel_calendar_with_checkmark.webp"),
  trophy: asset("decorative/glossy_golden_star_trophy_icon.webp"),
  lock: asset("gamification/glossy_purple_lock_medal_badge.webp"),
} as const;

const SUBJECT_ART: { match: RegExp; src: string }[] = [
  { match: /physic/i, src: asset("subjects/physics/atom-variant.webp") },
  { match: /chem/i, src: asset("subjects/chemistry/chemistry-flask-blue.webp") },
  { match: /bio/i, src: asset("subjects/biology/dna-helix.webp") },
  {
    match: /(add(itional)?[\s-]*math|matematik tambahan)/i,
    src: asset("subjects/additional mathematics/glossy_3d_graph_board_icon.webp"),
  },
  {
    match: /(math|matematik)/i,
    src: asset("subjects/mathematics/glossy_blue_3d_calculator_icon.webp"),
  },
  { match: /(science|sains)/i, src: asset("learning/glossy_pastel_atom_icon.webp") },
  { match: /(sejarah|history)/i, src: asset("learning/glossy_pastel_stack_of_books.webp") },
];

/**
 * Contextual soft-3D artwork for a subject. Used only as a branded fallback
 * when a class has no tutor-uploaded cover image — never as a replacement for
 * a real cover.
 */
export function subjectArt(subjectName?: string | null): string {
  if (subjectName) {
    const hit = SUBJECT_ART.find((s) => s.match.test(subjectName));
    if (hit) return hit.src;
  }
  return asset("learning/glossy_pastel_stack_of_books.webp");
}
