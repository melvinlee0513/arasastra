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
  sparkleStar: asset("gamification/achievement-star.webp"),
  bell: asset("decorative/glossy_golden_notification_bell.webp"),
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
  /** "At a glance" header art — magnifier stands in for the reference binoculars. */
  glance: asset("ui/magnifying-glass.webp"),
  /** Link resources — globe/network artwork reads as an external destination. */
  link: asset("learning/global-learning.webp"),
  about: asset("ui/glossy_blue_3d_information_bubble.webp"),
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

// ------------------------------------------------------------------
// Subject art families (Study / My Classes premium class cards)
// ------------------------------------------------------------------

/**
 * Compositional artwork for one subject family. `hero` is the dominant object
 * in the card's visual region, `support`/`accent` are the smaller layered
 * objects. Every path is a real file in `public/assets/illustrations/subjects`
 * (or `/learning` for the generic fallback).
 */
export type SubjectArtSet = {
  /** Family key — useful for stable React keys and analytics-free debugging. */
  key: string;
  hero: string;
  support: string;
  accent: string;
  /** Tailwind gradient classes for the card's pale visual region. */
  tint: string;
};

const SUBJECT_FAMILIES: { key: string; match: RegExp; art: Omit<SubjectArtSet, "key"> }[] = [
  {
    key: "additional-mathematics",
    // "Add Maths", "Additional Maths", "Matematik Tambahan"
    match: /(add(itional|\.|\b)[\s-]*(math|maths|mathematics)|matematik\s*tambahan|add\s*maths)/i,
    art: {
      hero: asset("subjects/additional mathematics/glossy_3d_graph_board_icon.webp"),
      support: asset("subjects/additional mathematics/geometry-shapes.webp"),
      accent: asset("subjects/additional mathematics/ruler-yellow.webp"),
      tint: "from-indigo-100 via-sky-50 to-violet-100",
    },
  },
  {
    key: "mathematics",
    match: /(math|maths|mathematics|matematik)/i,
    art: {
      hero: asset("subjects/mathematics/glossy_blue_3d_calculator_icon.webp"),
      support: asset("subjects/mathematics/geometry-compass.webp"),
      accent: asset("subjects/mathematics/set-square.webp"),
      tint: "from-sky-100 via-blue-50 to-indigo-100",
    },
  },
  {
    key: "physics",
    match: /(physic|fizik)/i,
    art: {
      hero: asset("subjects/physics/atom-variant.webp"),
      support: asset("subjects/physics/physics-notebook.webp"),
      accent: asset("subjects/physics/glossy_red_and_blue_horseshoe_magnet.webp"),
      tint: "from-sky-100 via-white to-blue-100",
    },
  },
  {
    key: "chemistry",
    match: /(chem|kimia)/i,
    art: {
      hero: asset("subjects/chemistry/chemistry-flask-blue.webp"),
      support: asset("subjects/chemistry/glossy_colourful_molecule_icon.webp"),
      accent: asset("subjects/chemistry/beaker-blue.webp"),
      tint: "from-violet-100 via-sky-50 to-blue-100",
    },
  },
  {
    key: "biology",
    match: /(bio|biologi)/i,
    art: {
      hero: asset("subjects/biology/dna-helix.webp"),
      support: asset("subjects/biology/microscope.webp"),
      accent: asset("subjects/biology/glossy_pastel_animal_cell_cutaway.webp"),
      tint: "from-emerald-50 via-sky-50 to-teal-100",
    },
  },
  {
    key: "science",
    match: /(science|sains)/i,
    art: {
      hero: asset("subjects/science/glossy_blue_liquid_beaker_with_stirring_rod.webp"),
      support: asset("subjects/science/glossy_3d_science_notebook_icon.webp"),
      accent: asset("subjects/science/test-tube-rack-wood.webp"),
      tint: "from-cyan-100 via-sky-50 to-blue-100",
    },
  },
  {
    key: "sejarah",
    match: /(sejarah|history)/i,
    art: {
      hero: asset("subjects/sejarah/historical-monument.webp"),
      support: asset("subjects/sejarah/history-compass.webp"),
      accent: asset("learning/global-learning.webp"),
      tint: "from-amber-50 via-sky-50 to-indigo-100",
    },
  },
  {
    key: "bahasa-melayu",
    match: /(bahasa\s*melayu|bahasa\s*malaysia|\bbm\b|melayu)/i,
    art: {
      hero: asset("subjects/languages/bahasa-melayu-notebook.webp"),
      support: asset("subjects/languages/pantun-books.webp"),
      accent: asset("subjects/languages/quote-bubble.webp"),
      tint: "from-indigo-100 via-sky-50 to-violet-100",
    },
  },
  {
    key: "english",
    match: /(english|bahasa\s*inggeris|\bbi\b)/i,
    art: {
      hero: asset("subjects/languages/english-book.webp"),
      support: asset("subjects/languages/abc-blocks.webp"),
      accent: asset("subjects/languages/speech-bubbles.webp"),
      tint: "from-violet-100 via-sky-50 to-blue-100",
    },
  },
  {
    key: "languages",
    match: /(language|bahasa|mandarin|tamil|arab|literature|sastera)/i,
    art: {
      hero: asset("subjects/languages/english-book.webp"),
      support: asset("subjects/languages/fountain-pen.webp"),
      accent: asset("subjects/languages/quill.webp"),
      tint: "from-violet-100 via-sky-50 to-indigo-100",
    },
  },
];

const GENERIC_ART: Omit<SubjectArtSet, "key"> = {
  hero: asset("learning/glossy_pastel_stack_of_books.webp"),
  support: asset("ui/glossy_blue_graduation_cap_with_gold_tassel.webp"),
  accent: asset("learning/glossy_colourful_idea_lightbulb_icon.webp"),
  tint: "from-sky-100 via-white to-indigo-100",
};

/**
 * Resolve the soft-3D artwork family for a class. Matching prefers the subject
 * name, then falls back to the class title so classes without a linked subject
 * still get contextual artwork. Stored names are never mutated.
 */
export function subjectArtSet(
  subjectName?: string | null,
  classTitle?: string | null,
): SubjectArtSet {
  for (const candidate of [subjectName, classTitle]) {
    if (!candidate) continue;
    const hit = SUBJECT_FAMILIES.find((f) => f.match.test(candidate));
    if (hit) return { key: hit.key, ...hit.art };
  }
  return { key: "generic", ...GENERIC_ART };
}

// ------------------------------------------------------------------
// Composite class-tile artwork (Study / My Classes card covers)
// ------------------------------------------------------------------

/**
 * ONE class preview = ONE composite WebP. These files already contain the full
 * subject scene (notebook + instruments + decorative accents), so cards must
 * never recreate the composition from the smaller micro-assets.
 *
 * Keys match `subjectArtSet()` family keys. Every path was verified on disk.
 */
export const CLASS_TILE_ART: Record<string, string> = {
  physics: asset("subjects/physics/class-card-preview-physics.webp"),
  chemistry: asset("subjects/chemistry/class-card-preview-chemistry.webp"),
  biology: asset("subjects/biology/class-card-preview-biology.webp"),
  science: asset("subjects/science/class-card-preview-science.webp"),
  mathematics: asset("subjects/mathematics/class-card-preview-mathematics.webp"),
  "additional-mathematics": asset(
    "subjects/additional mathematics/class-card-preview-additional-mathematics.webp",
  ),
  english: asset("subjects/languages/class-card-preview-english.webp"),
  "bahasa-melayu": asset("subjects/languages/class-card-preview-bahasa-melayu.webp"),
  sejarah: asset("subjects/sejarah/class-card-preview-sejarah.webp"),
};

/** Very light, subject-appropriate cover backgrounds (one design system). */
const CLASS_TILE_TINT: Record<string, string> = {
  physics: "from-sky-50 via-sky-100/70 to-blue-100/70",
  chemistry: "from-indigo-50 via-violet-100/60 to-sky-100/70",
  biology: "from-emerald-50 via-teal-50 to-sky-100/70",
  science: "from-cyan-50 via-sky-50 to-blue-100/70",
  mathematics: "from-sky-50 via-blue-50 to-indigo-100/60",
  "additional-mathematics": "from-violet-50 via-indigo-50 to-sky-100/70",
  english: "from-sky-50 via-indigo-50 to-violet-100/60",
  "bahasa-melayu": "from-violet-50 via-indigo-50 to-sky-100/70",
  sejarah: "from-amber-50/80 via-sky-50 to-indigo-100/60",
  generic: "from-sky-50 via-white to-indigo-100/60",
};

export interface ClassTileArt {
  key: string;
  /** Composite subject scene, or null when no composite exists for the family. */
  src: string | null;
  /** Tailwind gradient classes for the cover surface. */
  tint: string;
}

/**
 * Resolve the composite cover artwork for a class. Matching is robust to
 * naming variants ("Physics Form 5", "Add Math", "BM") because it reuses the
 * canonical `subjectArtSet()` family matcher. Presentation only — it never
 * affects which classes a student can see.
 */
export function classTileArt(
  subjectName?: string | null,
  classTitle?: string | null,
): ClassTileArt {
  const { key } = subjectArtSet(subjectName, classTitle);
  return {
    key,
    src: CLASS_TILE_ART[key] ?? null,
    tint: CLASS_TILE_TINT[key] ?? CLASS_TILE_TINT.generic,
  };
}

/** Study / My Classes header + Up Next artwork. */
export const STUDY_ART = {
  graduationCap: asset("ui/glossy_blue_graduation_cap_with_gold_tassel.webp"),
  alarmClock: asset("learning/glossy_lavender_twin_bell_alarm_clock.webp"),
  emptyClasses: asset("learning/glossy_pastel_stack_of_books.webp"),
  error: asset("ui/glossy_blue_shield_with_golden_padlock.webp"),
  starYellow: asset("ui/sparkle-yellow.webp"),
  sparklePurple: asset("decorative/sparkle-purple.png"),
  cloud: asset("decorative/glossy_fluffy_cloud_icon.webp"),
  paperPlane: asset("decorative/paper-plane-purple.webp"),
  bookmark: asset("ui/glossy_blue_bookmark_icon.webp"),
  bookmarkActive: asset("ui/bookmark-yellow-active.webp"),
} as const;

