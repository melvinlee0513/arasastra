import { supabase } from "@/integrations/supabase/client";
import { bestDisplayName } from "@/lib/profile";

export const CLASS_COVER_BUCKET = "class-covers";

/** Canonical object path — `{center_id}/{class_id}/cover.webp`. */
export function coverPathFor(centerId: string, classId: string): string {
  return `${centerId}/${classId}/cover.webp`;
}

const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

/**
 * Signed URL for a private class cover, cached ~50 min. Returns null on any
 * failure so callers can fall back to the branded gradient without surfacing
 * a raw storage error.
 */
export async function getClassCoverSignedUrl(
  path: string | null | undefined,
): Promise<string | null> {
  if (!path) return null;
  const now = Date.now();
  const cached = signedUrlCache.get(path);
  if (cached && cached.expiresAt > now + 30_000) return cached.url;
  const { data, error } = await supabase.storage
    .from(CLASS_COVER_BUCKET)
    .createSignedUrl(path, 60 * 60);
  if (error || !data?.signedUrl) return null;
  signedUrlCache.set(path, { url: data.signedUrl, expiresAt: now + 55 * 60_000 });
  return data.signedUrl;
}

export function invalidateClassCoverCache(path?: string | null) {
  if (path) signedUrlCache.delete(path);
  else signedUrlCache.clear();
}

/** Deterministic branded gradient fallback keyed on class id. */
const GRADIENTS = [
  "from-sky-100 via-white to-cyan-100",
  "from-indigo-100 via-white to-sky-100",
  "from-emerald-100 via-white to-teal-100",
  "from-amber-100 via-white to-rose-100",
  "from-violet-100 via-white to-fuchsia-100",
  "from-slate-100 via-white to-sky-50",
];
export function fallbackGradient(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
}

/**
 * Centre-crop the source image to 16:9 (~1200x675), encode as WebP. Re-encoding
 * strips EXIF metadata. Accepts JPEG/PNG/WebP up to 5 MB.
 */
export async function processCoverFile(file: File): Promise<Blob> {
  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(file.type)) {
    throw new Error("Please choose a JPEG, PNG or WebP image.");
  }
  if (file.size === 0) throw new Error("This image file is empty.");
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Image must be 5 MB or smaller.");
  }
  const bmp = await readBitmap(file);
  const targetW = 1200;
  const targetH = 675;
  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't prepare image on this device.");

  // 16:9 centre-crop from source
  const srcRatio = bmp.width / bmp.height;
  const dstRatio = targetW / targetH;
  let sx = 0, sy = 0, sw = bmp.width, sh = bmp.height;
  if (srcRatio > dstRatio) {
    // source wider — crop sides
    sw = Math.round(bmp.height * dstRatio);
    sx = Math.round((bmp.width - sw) / 2);
  } else if (srcRatio < dstRatio) {
    // source taller — crop top/bottom
    sh = Math.round(bmp.width / dstRatio);
    sy = Math.round((bmp.height - sh) / 2);
  }
  ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, targetW, targetH);

  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.85),
  );
  if (!blob) throw new Error("Couldn't compress image.");
  return blob;
}

async function readBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
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
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

// ------------------------------------------------------------------
// Tutor identity — canonical (class_tutors → profiles)
// ------------------------------------------------------------------

export type TutorIdentity = {
  full_name: string | null;
  display_name: string | null;
};

/**
 * Human label for a class's tutors, per product rules:
 *  - 0 tutors: "Tutor to be confirmed"
 *  - 1 tutor:  "Tutor: {name}"
 *  - 2 tutors: "{a} & {b}"
 *  - 3+:       "{first} + N tutors"
 * Uses display_name when available, otherwise full_name.
 */
export function tutorLabel(tutors: TutorIdentity[] | undefined | null): string {
  const list = (tutors || []).map((t) => bestDisplayName(t)).filter(Boolean);
  if (list.length === 0) return "Tutor to be confirmed";
  if (list.length === 1) return `Tutor: ${list[0]}`;
  if (list.length === 2) return `${list[0]} & ${list[1]}`;
  return `${list[0]} + ${list.length - 1} tutors`;
}

/**
 * Fetch tutor identities for a set of class ids using the canonical
 * `class_tutors` join and the safe `get_public_profiles` RPC (no emails).
 * Returns `Map<class_id, TutorIdentity[]>`.
 */
export async function fetchTutorsByClass(
  classIds: string[],
): Promise<Map<string, TutorIdentity[]>> {
  const map = new Map<string, TutorIdentity[]>();
  if (!classIds.length) return map;

  const { data: rows, error } = await supabase
    .from("class_tutors")
    .select("class_id, tutor_user_id")
    .in("class_id", classIds);
  if (error) throw error;

  const byClass = new Map<string, string[]>();
  const allUserIds = new Set<string>();
  for (const r of (rows || []) as Array<{ class_id: string; tutor_user_id: string }>) {
    if (!r.tutor_user_id) continue;
    if (!byClass.has(r.class_id)) byClass.set(r.class_id, []);
    byClass.get(r.class_id)!.push(r.tutor_user_id);
    allUserIds.add(r.tutor_user_id);
  }

  const ids = Array.from(allUserIds);
  const profByUser = new Map<string, TutorIdentity>();
  if (ids.length) {
    const { data: profs, error: pErr } = await supabase.rpc("get_public_profiles", {
      _user_ids: ids,
    });
    if (pErr) throw pErr;
    for (const p of (profs || []) as Array<{
      user_id: string;
      full_name: string | null;
      display_name: string | null;
    }>) {
      profByUser.set(p.user_id, {
        full_name: p.full_name,
        display_name: p.display_name,
      });
    }
  }

  for (const [classId, userIds] of byClass) {
    const identities = userIds
      .map((uid) => profByUser.get(uid))
      .filter((v): v is TutorIdentity => !!v);
    map.set(classId, identities);
  }
  return map;
}
