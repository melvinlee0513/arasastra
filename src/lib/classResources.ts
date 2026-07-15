/**
 * Shared normalisation + preview helpers for `public.class_resources`.
 *
 * Single source of truth used by the student classroom
 * (`/dashboard/classes/:classId`) and the tutor resource manager
 * (`/tutor/classes/:classId/resources`) so a row published by a tutor
 * produces identical results in both places.
 */

export type ClassResourceLike = {
  resource_type?: string | null;
  source_type?: string | null;
  file_url?: string | null;
  file_path?: string | null;
  external_url?: string | null;
  embed_url?: string | null;
  title?: string | null;
  description?: string | null;
};

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
 */
export function resolvePlayableUrl(r: ClassResourceLike): string | null {
  const raw = r.embed_url || r.external_url || r.file_url;
  if (!raw) return null;
  const v = String(raw).trim();
  if (!v) return null;
  if (/^[a-zA-Z0-9_-]{11}$/.test(v)) return `https://www.youtube.com/embed/${v}`;
  try {
    const url = new URL(v);
    if (url.protocol === "http:" || url.protocol === "https:") return v;
  } catch {
    return null;
  }
  return null;
}

/* ------------------------- Preview helpers ------------------------- */

export function getYouTubeId(input?: string | null): string | null {
  if (!input) return null;
  const v = String(input).trim();
  if (!v) return null;
  if (/^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
  const patterns = [
    /(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([\w-]{11})/,
    /(?:youtu\.be\/)([\w-]{11})/,
  ];
  for (const p of patterns) {
    const m = v.match(p);
    if (m) return m[1];
  }
  return null;
}

export function getYouTubeThumbnail(input?: string | null): string | null {
  const id = getYouTubeId(input);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}

export function getHostname(input?: string | null): string | null {
  if (!input) return null;
  try {
    return new URL(String(input).trim()).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function getFaviconUrl(input?: string | null): string | null {
  const host = getHostname(input);
  return host ? `https://www.google.com/s2/favicons?domain=${host}&sz=64` : null;
}

export type ResourceCategory = "video" | "pdf" | "note" | "link" | "file";

export function categoriseResource(r: ClassResourceLike): ResourceCategory {
  const type = (r.resource_type ?? "").toLowerCase();
  if (isVideoResource(r)) return "video";
  if (type === "link") return "link";
  const url = r.external_url || r.file_url || r.file_path || "";
  if (/\.pdf($|\?)/i.test(url) || type === "worksheet" || type === "pdf") return "pdf";
  if (type === "note") return "note";
  return "file";
}

export interface ResourcePreview {
  category: ResourceCategory;
  thumbnailUrl: string | null;
  hostname: string | null;
  filename: string | null;
  href: string | null;
  excerpt: string | null;
}

export function buildResourcePreview(r: ClassResourceLike): ResourcePreview {
  const category = categoriseResource(r);
  const href = resolvePlayableUrl(r);
  const hostname = getHostname(r.external_url || r.embed_url || r.file_url);
  const filename =
    (r.file_path || r.file_url || "")
      .split("?")[0]
      .split("/")
      .filter(Boolean)
      .pop() || null;

  let thumbnailUrl: string | null = null;
  if (category === "video") {
    thumbnailUrl =
      getYouTubeThumbnail(r.embed_url) ||
      getYouTubeThumbnail(r.external_url) ||
      null;
  } else if (category === "link") {
    thumbnailUrl = getFaviconUrl(r.external_url);
  }

  const excerpt = r.description ? String(r.description).slice(0, 220) : null;

  return { category, thumbnailUrl, hostname, filename, href, excerpt };
}
