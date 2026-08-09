/**
 * Typed contracts for the flexible class About content model
 * (`public.class_about_sections`).
 *
 * Tutors/admins create any number of ordered blocks — there is no fixed set of
 * headings. All mutations go through security-definer RPCs which enforce
 * `can_manage_class`, tenant scope and complete sibling sets for reorder.
 */

import { supabase } from "@/integrations/supabase/client";
import { getSignedFileUrl } from "@/lib/classResources";
import { useQuery } from "@tanstack/react-query";

export const ABOUT_IMAGE_BUCKET = "class-about";
export const MAX_ABOUT_IMAGE_BYTES = 5 * 1024 * 1024;
export const ABOUT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ABOUT_IMAGE_URL_TTL_SECONDS = 600;

export interface ClassAboutSection {
  id: string;
  center_id: string;
  class_id: string;
  title: string;
  content: string | null;
  image_path: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export const aboutKeys = {
  sections: (classId: string | undefined) => ["class-about-sections", classId ?? ""] as const,
};

export async function listClassAboutSections(classId: string): Promise<ClassAboutSection[]> {
  const { data, error } = await supabase
    .from("class_about_sections")
    .select("id,center_id,class_id,title,content,image_path,display_order,created_at,updated_at")
    .eq("class_id", classId)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ClassAboutSection[];
}

export async function saveClassAboutSection(input: {
  classId: string;
  title: string;
  content?: string | null;
  imagePath?: string | null;
  sectionId?: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc("save_class_about_section", {
    p_class_id: input.classId,
    p_title: input.title,
    p_content: input.content ?? null,
    p_image_path: input.imagePath ?? null,
    p_section_id: input.sectionId ?? null,
  });
  if (error) throw error;
  return data as unknown as string;
}

export async function deleteClassAboutSection(sectionId: string): Promise<void> {
  const { error } = await supabase.rpc("delete_class_about_section", { p_section_id: sectionId });
  if (error) throw error;
}

export async function reorderClassAboutSections(classId: string, sectionIds: string[]): Promise<void> {
  const { error } = await supabase.rpc("reorder_class_about_sections", {
    p_class_id: classId,
    p_section_ids: sectionIds,
  });
  if (error) throw error;
}

/**
 * Canonical storage path: `class-about/{centerId}/{classId}/{sectionId}/{fileId}.{ext}`.
 * The bucket policies derive the class id from segment 2, so the shape matters.
 */
export function buildAboutImagePath(
  centerId: string,
  classId: string,
  sectionKey: string,
  ext: string,
): string {
  const safeExt = /^(jpg|jpeg|png|webp)$/i.test(ext) ? ext.toLowerCase() : "webp";
  return `${ABOUT_IMAGE_BUCKET}/${centerId}/${classId}/${sectionKey}/${crypto.randomUUID()}.${safeExt}`;
}

/** Upload an About image and return the stored `bucket/name` path. */
export async function uploadAboutImage(params: {
  file: File;
  centerId: string;
  classId: string;
  sectionKey: string;
}): Promise<string> {
  const { file, centerId, classId, sectionKey } = params;
  if (!ABOUT_IMAGE_TYPES.includes(file.type)) {
    throw new Error("Please choose a JPEG, PNG or WebP image.");
  }
  if (file.size > MAX_ABOUT_IMAGE_BYTES) {
    throw new Error("Images must be 5 MB or smaller.");
  }
  const compressed = await compressImage(file);
  const ext = compressed.type === "image/webp" ? "webp" : (file.name.split(".").pop() ?? "webp");
  const fullPath = buildAboutImagePath(centerId, classId, sectionKey, ext);
  const objectName = fullPath.slice(ABOUT_IMAGE_BUCKET.length + 1);
  const { error } = await supabase.storage
    .from(ABOUT_IMAGE_BUCKET)
    .upload(objectName, compressed, { contentType: compressed.type, upsert: false });
  if (error) throw error;
  return fullPath;
}

export async function removeAboutImage(fullPath: string): Promise<void> {
  if (!fullPath.startsWith(`${ABOUT_IMAGE_BUCKET}/`)) return;
  const objectName = fullPath.slice(ABOUT_IMAGE_BUCKET.length + 1);
  await supabase.storage.from(ABOUT_IMAGE_BUCKET).remove([objectName]);
}

/** Cached signed URL for a private About image. */
export function useAboutImageUrl(imagePath: string | null | undefined) {
  return useQuery({
    queryKey: ["class-about-image", imagePath ?? null],
    enabled: !!imagePath,
    staleTime: (ABOUT_IMAGE_URL_TTL_SECONDS - 60) * 1000,
    gcTime: ABOUT_IMAGE_URL_TTL_SECONDS * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!imagePath) return null;
      return await getSignedFileUrl(imagePath, ABOUT_IMAGE_URL_TTL_SECONDS);
    },
  });
}

/**
 * Downscale to a sensible max width and re-encode as WebP so About images stay
 * responsive. Falls back to the original file when canvas encoding is
 * unavailable.
 */
async function compressImage(file: File, maxWidth = 1280, quality = 0.85): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxWidth / bitmap.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/webp", quality),
    );
    return blob ?? file;
  } catch {
    return file;
  }
}
