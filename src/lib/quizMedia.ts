/**
 * One optional image per quiz question.
 *
 * Storage layout (private bucket `quiz-question-media`):
 *   <center_id>/questions/<uuid>.webp
 *
 * `image_path` is stored in the database WITH the bucket prefix
 * (`quiz-question-media/<center_id>/...`) so the same value can be resolved by
 * the storage RLS guard (`can_read_quiz_media`) and by the client. The bucket is
 * private: every render goes through a short-lived signed URL.
 */
import { supabase } from "@/integrations/supabase/client";

export const QUIZ_MEDIA_BUCKET = "quiz-question-media";
export const QUIZ_MEDIA_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
export const QUIZ_MEDIA_MAX_EDGE = 1600; // px, longest edge after compression
export const QUIZ_MEDIA_ACCEPT = "image/jpeg,image/png,image/webp";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

/** Normalised crop rectangle (0-1), matching `_quiz_media_crop` server-side. */
export interface QuestionMediaCrop {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Media metadata carried on a question draft and on server payloads. */
export interface QuestionMedia {
  image_path: string | null;
  image_width: number | null;
  image_height: number | null;
  image_alt: string | null;
  image_crop: QuestionMediaCrop | null;
}

export const FULL_CROP: QuestionMediaCrop = { x: 0, y: 0, w: 1, h: 1 };

export function sanitizeCrop(value: unknown): QuestionMediaCrop | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const nums = ["x", "y", "w", "h"].map((k) => Number(raw[k]));
  if (nums.some((n) => !Number.isFinite(n))) return null;
  let [x, y, w, h] = nums;
  if (w <= 0 || h <= 0) return null;
  x = Math.min(Math.max(x, 0), 1);
  y = Math.min(Math.max(y, 0), 1);
  w = Math.min(Math.max(w, 0.01), 1 - x);
  h = Math.min(Math.max(h, 0.01), 1 - y);
  return { x, y, w, h };
}

export function isFullCrop(crop: QuestionMediaCrop | null): boolean {
  if (!crop) return true;
  return crop.x <= 0.001 && crop.y <= 0.001 && crop.w >= 0.999 && crop.h >= 0.999;
}

/** Aspect ratio (width / height) of the visible area after cropping. */
export function croppedAspectRatio(media: {
  image_width: number | null;
  image_height: number | null;
  image_crop: QuestionMediaCrop | null;
}): number | null {
  if (!media.image_width || !media.image_height) return null;
  const crop = media.image_crop ?? FULL_CROP;
  const w = media.image_width * crop.w;
  const h = media.image_height * crop.h;
  if (w <= 0 || h <= 0) return null;
  return w / h;
}

export class QuizMediaError extends Error {}

function readImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new QuizMediaError("That file could not be read as an image."));
    };
    img.src = url;
  });
}

/** Validate, downscale to WebP and return the encoded blob plus dimensions. */
export async function prepareQuestionImage(file: File): Promise<{
  blob: Blob;
  width: number;
  height: number;
}> {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new QuizMediaError("Please choose a JPG, PNG or WebP image.");
  }
  if (file.size > QUIZ_MEDIA_MAX_BYTES) {
    throw new QuizMediaError("Images must be 10 MB or smaller.");
  }

  const img = await readImage(file);
  const scale = Math.min(1, QUIZ_MEDIA_MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new QuizMediaError("This browser could not process the image.");
  ctx.drawImage(img, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/webp", 0.86),
  );
  if (!blob) throw new QuizMediaError("The image could not be converted.");
  return { blob, width, height };
}

/** Upload a prepared question image into the centre's private folder. */
export async function uploadQuestionImage(
  centerId: string,
  file: File,
): Promise<{ image_path: string; image_width: number; image_height: number }> {
  if (!centerId) throw new QuizMediaError("Missing centre for this quiz.");
  const { blob, width, height } = await prepareQuestionImage(file);
  const name = `${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}.webp`;
  const objectPath = `${centerId}/questions/${name}`;

  const { error } = await supabase.storage
    .from(QUIZ_MEDIA_BUCKET)
    .upload(objectPath, blob, { contentType: "image/webp", upsert: false });
  if (error) throw error;

  return {
    image_path: `${QUIZ_MEDIA_BUCKET}/${objectPath}`,
    image_width: width,
    image_height: height,
  };
}

/** Strip the stored bucket prefix, returning the object name inside the bucket. */
export function toObjectPath(imagePath: string | null | undefined): string | null {
  if (!imagePath) return null;
  const prefix = `${QUIZ_MEDIA_BUCKET}/`;
  return imagePath.startsWith(prefix) ? imagePath.slice(prefix.length) : imagePath;
}

const signedCache = new Map<string, { url: string; expiresAt: number }>();
const SIGNED_TTL_SECONDS = 3600;

/** Short-lived signed URL for a private question image (cached in-memory). */
export async function getQuestionImageUrl(imagePath: string | null): Promise<string | null> {
  const object = toObjectPath(imagePath);
  if (!object) return null;

  const cached = signedCache.get(object);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.url;

  const { data, error } = await supabase.storage
    .from(QUIZ_MEDIA_BUCKET)
    .createSignedUrl(object, SIGNED_TTL_SECONDS);
  if (error || !data?.signedUrl) return null;

  signedCache.set(object, {
    url: data.signedUrl,
    expiresAt: Date.now() + SIGNED_TTL_SECONDS * 1000,
  });
  return data.signedUrl;
}

/**
 * Delete an uploaded object. Only used for images the tutor discards before
 * saving — images referenced by a saved question are left in place because
 * duplicated quizzes and Question Bank snapshots share the same object.
 */
export async function deleteQuestionImageObject(imagePath: string | null): Promise<void> {
  const object = toObjectPath(imagePath);
  if (!object) return;
  signedCache.delete(object);
  await supabase.storage.from(QUIZ_MEDIA_BUCKET).remove([object]);
}
