import { useEffect, useState } from "react";
import { Maximize2, ImageOff } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  FULL_CROP,
  croppedAspectRatio,
  getQuestionImageUrl,
  type QuestionMediaCrop,
} from "@/lib/quizMedia";

export interface QuestionMediaValue {
  image_path: string | null;
  image_width?: number | null;
  image_height?: number | null;
  image_alt?: string | null;
  image_crop?: QuestionMediaCrop | null;
}

/** Resolve a private question image to a short-lived signed URL. */
export function useQuestionImageUrl(imagePath: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setUrl(null);
    setFailed(false);
    if (!imagePath) return;
    getQuestionImageUrl(imagePath)
      .then((signed) => {
        if (!active) return;
        if (signed) setUrl(signed);
        else setFailed(true);
      })
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [imagePath]);

  return { url, failed };
}

/**
 * The cropped region of the original image, rendered at its own aspect ratio.
 * The crop is applied with CSS so the stored object stays untouched — the same
 * object is shared by quiz copies and Question Bank snapshots.
 */
function CroppedImage({
  url,
  alt,
  crop,
  className,
}: {
  url: string;
  alt: string;
  crop: QuestionMediaCrop;
  className?: string;
}) {
  return (
    <div className={cn("relative h-full w-full overflow-hidden", className)}>
      <img
        src={url}
        alt={alt}
        loading="lazy"
        draggable={false}
        className="absolute select-none"
        style={{
          width: `${100 / crop.w}%`,
          height: `${100 / crop.h}%`,
          left: `${(-crop.x / crop.w) * 100}%`,
          top: `${(-crop.y / crop.h) * 100}%`,
          objectFit: "fill",
        }}
      />
    </div>
  );
}

/**
 * Question image for students (attempt + result review) and for builder preview.
 * Renders at the image's own aspect ratio and opens a full-screen lightbox.
 */
export function QuestionMedia({
  media,
  className,
  enableLightbox = true,
}: {
  media: QuestionMediaValue | null | undefined;
  className?: string;
  enableLightbox?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { url, failed } = useQuestionImageUrl(media?.image_path);

  if (!media?.image_path) return null;

  const alt = media.image_alt?.trim() || "Image for this question";
  const crop = media.image_crop ?? FULL_CROP;
  const ratio = croppedAspectRatio({
    image_width: media.image_width ?? null,
    image_height: media.image_height ?? null,
    image_crop: media.image_crop ?? null,
  });

  if (failed) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[13px] text-slate-500",
          className,
        )}
      >
        <ImageOff className="h-4 w-4 shrink-0" aria-hidden="true" />
        This image could not be loaded.
      </div>
    );
  }

  return (
    <>
      <figure className={cn("overflow-hidden rounded-2xl bg-slate-100", className)}>
        <div
          className="relative w-full"
          style={ratio ? { aspectRatio: `${ratio}` } : { minHeight: "8rem" }}
        >
          {url ? (
            <>
              <CroppedImage url={url} alt={alt} crop={crop} />
              {enableLightbox && (
                <button
                  type="button"
                  onClick={() => setOpen(true)}
                  aria-label="View image full screen"
                  className="absolute bottom-2 right-2 rounded-full bg-slate-900/65 p-2 text-white backdrop-blur transition active:scale-95"
                >
                  <Maximize2 className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </>
          ) : (
            <div className="absolute inset-0 animate-pulse bg-slate-200" />
          )}
        </div>
      </figure>

      {enableLightbox && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-[96vw] border-0 bg-transparent p-0 shadow-none sm:max-w-3xl">
            {url && (
              <div
                className="w-full overflow-hidden rounded-2xl bg-black"
                style={ratio ? { aspectRatio: `${ratio}` } : undefined}
              >
                <CroppedImage url={url} alt={alt} crop={crop} />
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
