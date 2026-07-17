import { supabase } from "@/integrations/supabase/client";

export const AVATAR_BUCKET = "avatars";

/** Initials for a fallback avatar, capped to two letters. */
export function initialsFor(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "?";
}

/** Best display label for a profile: display_name > full_name > "Student". */
export function bestDisplayName(p?: {
  display_name?: string | null;
  full_name?: string | null;
} | null): string {
  return (p?.display_name?.trim() || p?.full_name?.trim() || "Student");
}

const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

/**
 * Get a signed URL for a private avatar object, cached in memory for ~50 min
 * (bucket signs for 1h). Returns null on any failure so callers can fall back
 * to initials without surfacing a raw storage error.
 */
export async function getAvatarSignedUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const now = Date.now();
  const cached = signedUrlCache.get(path);
  if (cached && cached.expiresAt > now + 30_000) return cached.url;

  const { data, error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(path, 60 * 60);
  if (error || !data?.signedUrl) return null;

  signedUrlCache.set(path, { url: data.signedUrl, expiresAt: now + 55 * 60_000 });
  return data.signedUrl;
}

export function invalidateAvatarCache(path?: string | null) {
  if (path) signedUrlCache.delete(path);
  else signedUrlCache.clear();
}

/**
 * Read an image File, downscale to a 512x512 square (cover-crop) and re-encode
 * as WebP. Re-encoding also strips EXIF metadata.
 */
export async function processAvatarFile(file: File): Promise<Blob> {
  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(file.type)) {
    throw new Error("Please choose a JPEG, PNG or WebP image.");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Image must be 5 MB or smaller.");
  }

  const bitmap = await createBitmap(file);
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't prepare image on this device.");

  const src = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - src) / 2;
  const sy = (bitmap.height - src) / 2;
  ctx.drawImage(bitmap, sx, sy, src, src, 0, 0, size, size);

  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.85));
  if (!blob) throw new Error("Couldn't compress image.");
  return blob;
}

async function createBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try { return await createImageBitmap(file); } catch { /* fall through */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Couldn't read image."));
      img.src = url;
    });
    return img;
  } finally {
    // Revoke on next tick so drawImage has time to read pixels.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export function avatarPathFor(centerId: string, userId: string): string {
  return `${centerId}/${userId}/avatar.webp`;
}
