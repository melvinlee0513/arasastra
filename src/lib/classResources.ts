/**
 * Shared normalisation + preview helpers for `public.class_resources`.
 *
 * Single source of truth used by the student classroom
 * (`/dashboard/classes/:classId`) and the tutor resource manager
 * (`/tutor/classes/:classId/resources`) so a row published by a tutor
 * produces identical results in both places.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Max PDF size we accept from the tutor form (25 MB). */
export const MAX_PDF_BYTES = 25 * 1024 * 1024;

/** Signed URL TTL for private resource previews. */
export const THUMBNAIL_URL_TTL_SECONDS = 300;

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
 * Cached signed URL for a private thumbnail — we cache well below the URL
 * TTL so a card can re-render without re-signing on every mount.
 */
export function useSignedThumbnailUrl(thumbnailPath: string | null | undefined) {
  return useQuery({
    queryKey: ["resource-thumbnail", thumbnailPath ?? null],
    enabled: !!thumbnailPath,
    staleTime: (THUMBNAIL_URL_TTL_SECONDS - 30) * 1000,
    gcTime: THUMBNAIL_URL_TTL_SECONDS * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!thumbnailPath) return null;
      return await getSignedFileUrl(thumbnailPath, THUMBNAIL_URL_TTL_SECONDS);
    },
  });
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
  thumbnail_path?: string | null;
  title?: string | null;
  description?: string | null;
};

export const VIDEO_RESOURCE_TYPES = ["video", "replay"] as const;

export function isVideoResource(r: ClassResourceLike): boolean {
  const t = (r.resource_type ?? "").toLowerCase();
  return (VIDEO_RESOURCE_TYPES as readonly string[]).includes(t);
}

/**
 * Canonical mapping from a tutor/student filter tab key to the class_resources
 * that belong in it. Kept in one place so the tutor arrange view, tutor grid
 * and student classroom stay in sync.
 *
 * Tab keys: "all" | "note" | "video" | "worksheet" | "link".
 */
export function matchesResourceTab(r: ClassResourceLike, tab: string): boolean {
  if (tab === "all") return true;
  const type = (r.resource_type ?? "").toLowerCase();
  switch (tab) {
    case "video":
      return isVideoResource(r);
    case "note":
      return type === "note";
    case "worksheet":
      return type === "worksheet";
    case "link":
      return type === "link";
    default:
      return type === tab;
  }
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
    /(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/|live\/))([\w-]{11})/,
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

export function getVimeoId(input?: string | null): string | null {
  if (!input) return null;
  const v = String(input).trim();
  if (!v) return null;
  const patterns = [
    /vimeo\.com\/(?:video\/)?(\d{6,})/,
    /player\.vimeo\.com\/video\/(\d{6,})/,
  ];
  for (const p of patterns) {
    const m = v.match(p);
    if (m) return m[1];
  }
  return null;
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
export type VideoProvider = "youtube" | "vimeo" | "generic" | "upload" | null;

function extFromPath(pathish?: string | null): string | null {
  if (!pathish) return null;
  const clean = pathish.split("?")[0].split("#")[0];
  const m = clean.match(/\.([a-zA-Z0-9]{1,6})$/);
  return m ? m[1].toLowerCase() : null;
}

export function categoriseResource(r: ClassResourceLike): ResourceCategory {
  const type = (r.resource_type ?? "").toLowerCase();
  if (isVideoResource(r)) return "video";
  if (type === "link") return "link";
  const url = r.external_url || r.file_url || r.file_path || "";
  const ext = extFromPath(url);
  if (ext === "pdf" || type === "worksheet" || type === "pdf") return "pdf";
  if (type === "note") return "note";
  return "file";
}

export interface ResourcePreview {
  category: ResourceCategory;
  /** Best-known immutable image URL for the cover (thumbnail). */
  thumbnailUrl: string | null;
  /** Human-readable hostname when the source is an external URL. */
  hostname: string | null;
  /** Just the filename component of a stored file. */
  filename: string | null;
  /** Openable/playable URL (external only — private files use signed URLs). */
  href: string | null;
  /** Short excerpt drawn from the row description. */
  excerpt: string | null;
  /** Detected video provider (null for non-video). */
  provider: VideoProvider;
  /** Underlying storage/embed URL for PDF thumbnail rendering. */
  pdfSource: { kind: "external"; url: string } | { kind: "storage"; filePath: string } | null;
  /** Pre-generated preview path in private storage, if any. */
  storedThumbnailPath: string | null;
  /** True when the resource has a directly openable source. */
  isPlayable: boolean;
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
  let provider: VideoProvider = null;
  if (category === "video") {
    const ytId =
      getYouTubeId(r.embed_url) || getYouTubeId(r.external_url) || null;
    const vimeoId = getVimeoId(r.embed_url) || getVimeoId(r.external_url) || null;
    if (ytId) {
      provider = "youtube";
      thumbnailUrl = `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`;
    } else if (vimeoId) {
      provider = "vimeo";
      // No public thumbnail URL without oEmbed; fall back to generated cover.
    } else if ((r.source_type ?? "").toLowerCase() === "local_upload" || r.file_path) {
      provider = "upload";
    } else {
      provider = "generic";
    }
  } else if (category === "link") {
    thumbnailUrl = getFaviconUrl(r.external_url);
  }

  let pdfSource: ResourcePreview["pdfSource"] = null;
  if (category === "pdf") {
    if (r.file_path) pdfSource = { kind: "storage", filePath: r.file_path };
    else if (r.external_url && /\.pdf($|\?)/i.test(r.external_url)) {
      pdfSource = { kind: "external", url: r.external_url };
    } else if (r.file_url && /\.pdf($|\?)/i.test(r.file_url)) {
      pdfSource = { kind: "external", url: r.file_url };
    }
  }

  const excerpt = r.description ? String(r.description).slice(0, 220) : null;
  const isPlayable = Boolean(href || r.file_path);

  return {
    category,
    thumbnailUrl,
    hostname,
    filename,
    href,
    excerpt,
    provider,
    pdfSource,
    storedThumbnailPath: r.thumbnail_path ?? null,
    isPlayable,
  };
}

/* ------------------------- PDF thumbnail generation ------------------------- */

/**
 * Render the first page of a PDF (File/Blob or URL) to a WebP blob suitable
 * for upload. Returns null on any failure so callers can fall back gracefully.
 * The output is intentionally modest (~560px wide, quality 0.82) so it stays
 * small and fast to load in a grid of cards.
 */
export async function generatePdfPreviewBlob(
  input: File | Blob | string,
  options: { maxWidth?: number; quality?: number } = {},
): Promise<Blob | null> {
  const maxWidth = options.maxWidth ?? 560;
  const quality = options.quality ?? 0.82;
  try {
    const pdfjs: any = await import("pdfjs-dist/build/pdf.mjs");
    const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

    const src: any =
      typeof input === "string"
        ? { url: input, disableAutoFetch: true, disableStream: true }
        : { data: new Uint8Array(await (input as Blob).arrayBuffer()) };

    const doc = await pdfjs.getDocument(src).promise;
    try {
      const page = await doc.getPage(1);
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = Math.min(maxWidth / baseViewport.width, 2);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      const blob: Blob | null = await new Promise((resolve) => {
        // Prefer WebP; browsers that don't support it fall back to PNG via toBlob.
        canvas.toBlob(
          (b) => {
            if (b) return resolve(b);
            canvas.toBlob((jpg) => resolve(jpg), "image/jpeg", quality);
          },
          "image/webp",
          quality,
        );
      });
      page.cleanup?.();
      return blob;
    } finally {
      doc.destroy?.();
    }
  } catch {
    return null;
  }
}
