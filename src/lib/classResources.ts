/**
 * Shared normalisation + preview helpers for `public.class_resources`.
 *
 * Single source of truth used by the student classroom
 * (`/dashboard/classes/:classId`) and the tutor resource manager
 * (`/tutor/classes/:classId/resources`) so a row published by a tutor
 * produces identical results in both places.
 */

import { supabase } from "@/integrations/supabase/client";

/** Max PDF size we accept from the tutor form (25 MB). */
export const MAX_PDF_BYTES = 25 * 1024 * 1024;

/** Split a stored `file_path` ("bucket/name") into bucket + object name. */
export function splitFilePath(filePath: string): { bucket: string; path: string } | null {
  const idx = filePath.indexOf("/");
  if (idx <= 0 || idx === filePath.length - 1) return null;
  return { bucket: filePath.slice(0, idx), path: filePath.slice(idx + 1) };
}

/** Sanitise a user-supplied filename for safe storage paths. */
export function sanitiseFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned.length ? cleaned.slice(0, 120) : "file";
}

/**
 * Fetch a short-lived signed URL for a private file. Returns null when the
 * caller isn't authorised (RLS denies) or the path is malformed.
 */
export async function getSignedFileUrl(
  filePath: string,
  ttlSeconds = 120,
): Promise<string | null> {
  const parts = splitFilePath(filePath);
  if (!parts) return null;
  const { data, error } = await supabase.storage
    .from(parts.bucket)
    .createSignedUrl(parts.path, ttlSeconds);
  if (error) return null;
  return data?.signedUrl ?? null;
}

/**
 * Open a class resource in a new tab. Uses the external/embed URL when the
 * row has one; otherwise mints a short-lived signed URL from the private
 * bucket (RLS enforces authorisation).
 */
export async function openClassResource(r: ClassResourceLike): Promise<boolean> {
  const direct = resolvePlayableUrl(r);
  if (direct) {
    window.open(direct, "_blank", "noopener,noreferrer");
    return true;
  }
  if (r.file_path) {
    const signed = await getSignedFileUrl(r.file_path, 120);
    if (signed) {
      window.open(signed, "_blank", "noopener,noreferrer");
      return true;
    }
  }
  return false;
}


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
