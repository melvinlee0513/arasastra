import { useEffect, useState } from "react";
import { ImageOff, Maximize2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  FULL_CROP,
  croppedAspectRatio,
  getFlashcardImageUrl,
  type FlashcardImageCrop,
} from "@/lib/flashcardMedia";

export interface FlashcardMediaValue {
  image_path?: string | null;
  image_width?: number | null;
  image_height?: number | null;
  image_alt?: string | null;
  image_crop?: FlashcardImageCrop | null;
}

/** Resolve a private flashcard image to a short-lived signed URL. */
export function useFlashcardImageUrl(imagePath: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setUrl(null);
    setFailed(false);
    if (!imagePath) return;
    getFlashcardImageUrl(imagePath)
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

function CroppedImage({
  url,
  alt,
  crop,
}: {
  url: string;
  alt: string;
  crop: FlashcardImageCrop;
}) {
  return (
    <div className="relative h-full w-full overflow-hidden">
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
 * Flashcard face image. Renders at the image's own aspect ratio (never
 * distorted, never wider than its container) and opens a full-screen view.
 */
export function FlashcardMedia({
  media,
  className,
  enableLightbox = true,
}: {
  media: FlashcardMediaValue | null | undefined;
  className?: string;
  enableLightbox?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { url, failed } = useFlashcardImageUrl(media?.image_path);

  if (!media?.image_path) return null;

  const alt = media.image_alt?.trim() || "Flashcard image";
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
          "flex items-center gap-2 rounded-2xl border border-violet-200 bg-white/70 px-4 py-3 text-[13px] text-slate-500",
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
      <figure className={cn("overflow-hidden rounded-2xl bg-white/70", className)}>
        <div
          className="relative w-full"
          style={ratio ? { aspectRatio: `${ratio}` } : { minHeight: "7rem" }}
        >
          {url ? (
            <>
              <CroppedImage url={url} alt={alt} crop={crop} />
              {enableLightbox && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(true);
                  }}
                  aria-label="View image full screen"
                  className="absolute bottom-2 right-2 rounded-full bg-slate-900/60 p-2 text-white backdrop-blur transition active:scale-95"
                >
                  <Maximize2 className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </>
          ) : (
            <div className="absolute inset-0 animate-pulse bg-violet-100" />
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
