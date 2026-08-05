import { supabase } from "@/integrations/supabase/client";
import {
  CLASS_COVER_BUCKET,
  getClassCoverSignedUrl,
  invalidateClassCoverCache,
} from "@/lib/classCovers";

/**
 * Folder covers live in the existing private `class-covers` bucket but in their
 * own path namespace so they can never collide with class banner objects
 * (`{center}/{class}/cover.webp`):
 *
 *   {center_id}/{class_id}/folders/{folder_id}/{file_id}.webp
 *
 * The existing storage policies validate segments 1 and 2 (centre + class), so
 * assigned tutors and same-centre admins can write, enrolled students can read,
 * and anonymous/foreign-tenant access is denied. The server-side
 * `set_class_folder_cover` RPC re-validates the full prefix before persisting,
 * so a client cannot point a folder record at someone else's object.
 */
export const FOLDER_COVER_SIZE = 600;

export function folderCoverPrefix(centerId: string, classId: string, folderId: string): string {
  return `${centerId}/${classId}/folders/${folderId}`;
}

export function newFolderCoverPath(centerId: string, classId: string, folderId: string): string {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${folderCoverPrefix(centerId, classId, folderId)}/${id}.webp`;
}

export { getClassCoverSignedUrl as getFolderCoverSignedUrl };

/** Centre-crop to a 600x600 square and encode as WebP (strips EXIF). */
export async function processFolderCoverFile(file: File): Promise<Blob> {
  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(file.type)) {
    throw new Error("Please choose a JPEG, PNG or WebP image.");
  }
  if (file.size === 0) throw new Error("This image file is empty.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Image must be 5 MB or smaller.");

  const bmp = await readBitmap(file);
  const size = FOLDER_COVER_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't prepare image on this device.");

  const w = "width" in bmp ? bmp.width : 0;
  const h = "height" in bmp ? bmp.height : 0;
  const side = Math.min(w, h);
  const sx = Math.round((w - side) / 2);
  const sy = Math.round((h - side) / 2);
  ctx.drawImage(bmp as CanvasImageSource, sx, sy, side, side, 0, 0, size, size);

  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.85),
  );
  if (!blob) throw new Error("Couldn't compress image.");
  return blob;
}

async function readBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall through */
    }
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

type CoverResult = { cover_image_path: string | null; previous_cover_image_path: string | null };

/**
 * Upload → persist → delete previous. The old object is only removed once the
 * database update has succeeded, so a failed write never orphans the live cover.
 */
export async function uploadFolderCover(input: {
  centerId: string;
  classId: string;
  folderId: string;
  blob: Blob;
}): Promise<string> {
  const path = newFolderCoverPath(input.centerId, input.classId, input.folderId);
  const { error: upErr } = await supabase.storage
    .from(CLASS_COVER_BUCKET)
    .upload(path, input.blob, { contentType: "image/webp", upsert: true });
  if (upErr) throw upErr;

  const { data, error } = await supabase.rpc("set_class_folder_cover", {
    _folder_id: input.folderId,
    _cover_image_path: path,
  });
  if (error) {
    // Roll the orphan back — the folder record still points at the old cover.
    await supabase.storage.from(CLASS_COVER_BUCKET).remove([path]).catch(() => undefined);
    throw error;
  }
  const res = data as unknown as CoverResult | null;
  await removeCoverObject(res?.previous_cover_image_path ?? null, path);
  invalidateClassCoverCache(path);
  return path;
}

export async function clearFolderCover(folderId: string): Promise<void> {
  const { data, error } = await supabase.rpc("set_class_folder_cover", {
    _folder_id: folderId,
    _cover_image_path: null,
  });
  if (error) throw error;
  const res = data as unknown as CoverResult | null;
  await removeCoverObject(res?.previous_cover_image_path ?? null, null);
}

/** Best-effort storage cleanup; never surfaces a raw storage error to the user. */
export async function removeCoverObject(
  path: string | null | undefined,
  keep: string | null,
): Promise<void> {
  if (!path || path === keep) return;
  invalidateClassCoverCache(path);
  try {
    await supabase.storage.from(CLASS_COVER_BUCKET).remove([path]);
  } catch {
    /* orphan cleanup is best-effort */
  }
}
