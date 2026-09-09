/**
 * Flashcard media (one optional image per card face, plus deck covers).
 *
 * Storage layout (private bucket `flashcard-media`):
 *   <center_id>/cards/<uuid>.webp
 *   <center_id>/covers/<uuid>.webp
 *
 * Paths are stored in the database WITH the bucket prefix so the storage RLS
 * guards (`can_read_flashcard_media` / `can_write_flashcard_media`) and the
 * client resolve the same value. The bucket is private: every render goes
 * through a short-lived signed URL.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  FULL_CROP,
  QUIZ_MEDIA_ACCEPT,
  QuizMediaError,
  croppedAspectRatio,
  isFullCrop,
  prepareQuestionImage,
  sanitizeCrop,
  type QuestionMediaCrop,
} from "@/lib/quizMedia";

export const FLASHCARD_MEDIA_BUCKET = "flashcard-media";
export const FLASHCARD_MEDIA_ACCEPT = QUIZ_MEDIA_ACCEPT;
export const FlashcardMediaError = QuizMediaError;

/** Shared crop helpers — flashcards use the exact same normalised crop model. */
export { FULL_CROP, croppedAspectRatio, isFullCrop, sanitizeCrop };
export type FlashcardImageCrop = QuestionMediaCrop;

export type FlashcardMediaFolder = "cards" | "covers";

/** Validate, downscale to WebP and upload into the centre's private folder. */
export async function uploadFlashcardImage(
  centerId: string,
  file: File,
  folder: FlashcardMediaFolder = "cards",
): Promise<{ image_path: string; image_width: number; image_height: number }> {
  if (!centerId) throw new QuizMediaError("Missing centre for this deck.");
  const { blob, width, height } = await prepareQuestionImage(file);
  const name = `${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}.webp`;
  const objectPath = `${centerId}/${folder}/${name}`;

  const { error } = await supabase.storage
    .from(FLASHCARD_MEDIA_BUCKET)
    .upload(objectPath, blob, { contentType: "image/webp", upsert: false });
  if (error) throw error;

  return {
    image_path: `${FLASHCARD_MEDIA_BUCKET}/${objectPath}`,
    image_width: width,
    image_height: height,
  };
}

/** Strip the stored bucket prefix, returning the object name inside the bucket. */
export function toFlashcardObjectPath(imagePath: string | null | undefined): string | null {
  if (!imagePath) return null;
  const prefix = `${FLASHCARD_MEDIA_BUCKET}/`;
  return imagePath.startsWith(prefix) ? imagePath.slice(prefix.length) : imagePath;
}

const signedCache = new Map<string, { url: string; expiresAt: number }>();
const SIGNED_TTL_SECONDS = 3600;

/** Short-lived signed URL for a private flashcard image (cached in-memory). */
export async function getFlashcardImageUrl(imagePath: string | null): Promise<string | null> {
  const object = toFlashcardObjectPath(imagePath);
  if (!object) return null;

  const cached = signedCache.get(object);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.url;

  const { data, error } = await supabase.storage
    .from(FLASHCARD_MEDIA_BUCKET)
    .createSignedUrl(object, SIGNED_TTL_SECONDS);
  if (error || !data?.signedUrl) return null;

  signedCache.set(object, {
    url: data.signedUrl,
    expiresAt: Date.now() + SIGNED_TTL_SECONDS * 1000,
  });
  return data.signedUrl;
}

/**
 * Delete an uploaded object. Only used for images discarded before saving —
 * saved images are left in place because duplicated decks share the object.
 */
export async function deleteFlashcardImageObject(imagePath: string | null): Promise<void> {
  const object = toFlashcardObjectPath(imagePath);
  if (!object) return;
  signedCache.delete(object);
  await supabase.storage.from(FLASHCARD_MEDIA_BUCKET).remove([object]);
}
