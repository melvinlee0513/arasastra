/**
 * Shared normalisation helpers for `public.class_resources`.
 *
 * These are the single source of truth used by BOTH the student classroom
 * (`/dashboard/classes/:classId`) and the Replay Library
 * (`/dashboard/learning/replays`) so a row published by a tutor produces
 * identical results in both places.
 */

export type ClassResourceLike = {
  resource_type?: string | null;
  source_type?: string | null;
  file_url?: string | null;
  file_path?: string | null;
  external_url?: string | null;
  embed_url?: string | null;
};

/** Canonical resource_type values that count as a "video / replay". */
export const VIDEO_RESOURCE_TYPES = ["video", "replay"] as const;

export function isVideoResource(r: ClassResourceLike): boolean {
  const t = (r.resource_type ?? "").toLowerCase();
  return (VIDEO_RESOURCE_TYPES as readonly string[]).includes(t);
}

export function hasValidSource(r: ClassResourceLike): boolean {
  return Boolean(r.embed_url || r.external_url || r.file_url || r.file_path);
}

/**
 * Resolve a class_resources row to a canonical playable/openable URL.
 * Returns null when nothing safe/embeddable is available.
 *
 * Priority: embed_url → external_url → file_url. `file_path` alone is not
 * considered playable client-side because it needs a signed Storage URL.
 */
export function resolvePlayableUrl(r: ClassResourceLike): string | null {
  const raw = r.embed_url || r.external_url || r.file_url;
  if (!raw) return null;
  const v = String(raw).trim();
  if (!v) return null;
  // Bare 11-char YouTube IDs -> canonical embed URL.
  if (/^[a-zA-Z0-9_-]{11}$/.test(v)) return `https://www.youtube.com/embed/${v}`;
  try {
    const url = new URL(v);
    if (url.protocol === "http:" || url.protocol === "https:") return v;
  } catch {
    return null;
  }
  return null;
}
