/**
 * Canonical subject configuration — ONE source of truth for academic subject
 * identity across the whole platform.
 *
 * A Subject is a canonical academic category (Physics, Biology, …) identified
 * by a stable `subject_key` stored on `public.subjects.subject_key`.
 * A Class is a tenant-specific cohort created underneath a Subject.
 *
 * Subject visuals must ALWAYS be derived from the subject key (or, for legacy
 * rows without a key, from the alias matcher below) — never from ad-hoc
 * filename checks scattered across components.
 */

export const SUBJECT_KEYS = [
  "bahasa_melayu",
  "english",
  "mathematics",
  "additional_mathematics",
  "science",
  "physics",
  "chemistry",
  "biology",
  "sejarah",
] as const;

export type SubjectKey = (typeof SUBJECT_KEYS)[number];

export interface SubjectDefinition {
  key: SubjectKey;
  label: string;
  /** Illustration family key used by `src/lib/classIllustrations.ts`. */
  artFamily: string;
  /** Legacy free-text names that map onto this canonical subject. */
  aliases: RegExp;
}

/**
 * Order is significant for alias matching: more specific subjects (Additional
 * Mathematics) must be tested before broader ones (Mathematics).
 */
export const SUBJECT_DEFINITIONS: SubjectDefinition[] = [
  {
    key: "additional_mathematics",
    label: "Additional Mathematics",
    artFamily: "additional-mathematics",
    aliases: /(add(itional|\.|\b)[\s-]*(math|maths|mathematics)|matematik\s*tambahan)/i,
  },
  {
    key: "mathematics",
    label: "Mathematics",
    artFamily: "mathematics",
    aliases: /(math|maths|mathematics|matematik)/i,
  },
  { key: "physics", label: "Physics", artFamily: "physics", aliases: /(physic|fizik)/i },
  { key: "chemistry", label: "Chemistry", artFamily: "chemistry", aliases: /(chem|kimia)/i },
  { key: "biology", label: "Biology", artFamily: "biology", aliases: /(bio|biologi)/i },
  { key: "science", label: "Science", artFamily: "science", aliases: /(science|sains)/i },
  { key: "sejarah", label: "Sejarah", artFamily: "sejarah", aliases: /(sejarah|history)/i },
  {
    key: "bahasa_melayu",
    label: "Bahasa Melayu",
    artFamily: "bahasa-melayu",
    aliases: /(bahasa\s*melayu|bahasa\s*malaysia|\bbm\b)/i,
  },
  {
    key: "english",
    label: "English",
    artFamily: "english",
    aliases: /(english|bahasa\s*inggeris|\bbi\b)/i,
  },
];

const BY_KEY = new Map<string, SubjectDefinition>(
  SUBJECT_DEFINITIONS.map((d) => [d.key, d]),
);

/** Canonical options for the Create Subject dropdown, alphabetical by label. */
export const SUBJECT_OPTIONS: { key: SubjectKey; label: string }[] = [...SUBJECT_DEFINITIONS]
  .map((d) => ({ key: d.key, label: d.label }))
  .sort((a, b) => a.label.localeCompare(b.label));

export function isSubjectKey(value: unknown): value is SubjectKey {
  return typeof value === "string" && BY_KEY.has(value);
}

export function subjectDefinition(key?: string | null): SubjectDefinition | null {
  if (!key) return null;
  return BY_KEY.get(key) ?? null;
}

/** Display label for a subject: canonical label when keyed, else stored name. */
export function subjectLabel(key?: string | null, storedName?: string | null): string {
  return subjectDefinition(key)?.label ?? storedName?.trim() ?? "Subject";
}

/**
 * Resolve a canonical subject key. Prefers the stored `subject_key`; falls back
 * to alias matching on legacy free-text subject names (and, last, a class
 * title) so pre-migration rows still resolve to the right visuals.
 */
export function resolveSubjectKey(
  subjectKey?: string | null,
  ...names: (string | null | undefined)[]
): SubjectKey | null {
  if (isSubjectKey(subjectKey)) return subjectKey;
  for (const name of names) {
    if (!name) continue;
    const hit = SUBJECT_DEFINITIONS.find((d) => d.aliases.test(name));
    if (hit) return hit.key;
  }
  return null;
}

/** Illustration family key for a subject, or null when nothing matches. */
export function subjectArtFamily(
  subjectKey?: string | null,
  ...names: (string | null | undefined)[]
): string | null {
  const key = resolveSubjectKey(subjectKey, ...names);
  return key ? (BY_KEY.get(key)?.artFamily ?? null) : null;
}
