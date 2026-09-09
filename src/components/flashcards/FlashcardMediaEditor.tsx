import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, RotateCcw, Trash2, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { toast } from "@/hooks/use-toast";
import { useFlashcardImageUrl } from "@/components/flashcards/FlashcardMedia";
import {
  FLASHCARD_MEDIA_ACCEPT,
  FULL_CROP,
  FlashcardMediaError,
  croppedAspectRatio,
  deleteFlashcardImageObject,
  isFullCrop,
  uploadFlashcardImage,
  type FlashcardImageCrop,
  type FlashcardMediaFolder,
} from "@/lib/flashcardMedia";

const ALT_MAX = 200;

export interface FlashcardImageValue {
  image_path: string | null;
  image_width: number | null;
  image_height: number | null;
  image_alt: string | null;
  image_crop: FlashcardImageCrop | null;
}

export interface FlashcardMediaEditorProps {
  centerId: string | null;
  fieldId: string;
  label?: string;
  hint?: string;
  folder?: FlashcardMediaFolder;
  locked?: boolean;
  value: FlashcardImageValue;
  onChange: (patch: Partial<FlashcardImageValue>) => void;
}

function cropFromView(zoom: number, cx: number, cy: number): FlashcardImageCrop {
  const size = 1 / zoom;
  const half = size / 2;
  const x = Math.min(Math.max(cx - half, 0), 1 - size);
  const y = Math.min(Math.max(cy - half, 0), 1 - size);
  return { x, y, w: size, h: size };
}

/**
 * Upload / preview / zoom / pan / reset / replace / remove for one flashcard
 * image. Uploads go straight to the private tenant-scoped bucket; the crop is
 * stored as metadata so the original object stays untouched.
 */
export function FlashcardMediaEditor({
  centerId,
  fieldId,
  label = "Image",
  hint = "Optional. One image per side. JPG, PNG or WebP up to 10 MB.",
  folder = "cards",
  locked = false,
  value,
  onChange,
}: FlashcardMediaEditorProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [uploading, setUploading] = useState(false);
  const { url, failed } = useFlashcardImageUrl(value.image_path);
  /**
   * Objects uploaded in this editing session and never saved to a card. Only
   * these may be deleted from storage — a path that came from the server can be
   * shared by duplicated decks, so removing it here would break other cards.
   */
  const unsavedRef = useRef<Set<string>>(new Set());

  const crop = value.image_crop ?? FULL_CROP;
  const [zoom, setZoom] = useState(() => (value.image_crop ? 1 / Math.max(value.image_crop.w, 0.34) : 1));
  const dragRef = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);

  useEffect(() => {
    setZoom(value.image_crop ? 1 / Math.max(value.image_crop.w, 0.34) : 1);
  }, [value.image_path, value.image_crop]);

  const pickFile = () => fileRef.current?.click();

  /** Discard an object only when this session uploaded it and never saved it. */
  const discardIfUnsaved = (path: string | null | undefined) => {
    if (!path || !unsavedRef.current.has(path)) return;
    unsavedRef.current.delete(path);
    void deleteFlashcardImageObject(path).catch(() => undefined);
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!centerId) {
      toast({ title: "Not ready yet", description: "Save the deck first, then add images." });
      return;
    }
    setUploading(true);
    const previous = value.image_path;
    try {
      const uploaded = await uploadFlashcardImage(centerId, file, folder);
      unsavedRef.current.add(uploaded.image_path);
      onChange({ ...uploaded, image_crop: null, image_alt: value.image_alt ?? "" });
      discardIfUnsaved(previous);
    } catch (error) {
      toast({
        title: "Image not added",
        description:
          error instanceof FlashcardMediaError
            ? error.message
            : "The image could not be uploaded. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeImage = () => {
    const previous = value.image_path;
    onChange({
      image_path: null,
      image_width: null,
      image_height: null,
      image_alt: null,
      image_crop: null,
    });
    discardIfUnsaved(previous);
  };


  const applyZoom = (next: number) => {
    setZoom(next);
    if (next <= 1.01) {
      onChange({ image_crop: null });
      return;
    }
    onChange({ image_crop: cropFromView(next, crop.x + crop.w / 2, crop.y + crop.h / 2) });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (locked || zoom <= 1.01) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, cx: crop.x + crop.w / 2, cy: crop.y + crop.h / 2 };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    const frame = frameRef.current;
    if (!drag || !frame) return;
    const rect = frame.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dx = ((e.clientX - drag.x) / rect.width) * crop.w;
    const dy = ((e.clientY - drag.y) / rect.height) * crop.h;
    onChange({ image_crop: cropFromView(zoom, drag.cx - dx, drag.cy - dy) });
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const ratio = croppedAspectRatio({
    image_width: value.image_width,
    image_height: value.image_height,
    image_crop: value.image_crop ?? null,
  });

  return (
    <div className="space-y-2">
      <div>
        <p className="text-[12.5px] font-semibold text-slate-700">{label}</p>
        {hint && <p className="text-[12px] text-slate-500">{hint}</p>}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={FLASHCARD_MEDIA_ACCEPT}
        className="sr-only"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />

      {!value.image_path ? (
        <Button
          type="button"
          variant="outline"
          disabled={locked || uploading}
          onClick={pickFile}
          className="min-h-[44px] w-full rounded-2xl border-dashed border-violet-300 bg-white text-[14px] font-semibold text-slate-600"
        >
          {uploading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading…
            </>
          ) : (
            <>
              <ImagePlus className="mr-2 h-4 w-4" /> Add image
            </>
          )}
        </Button>
      ) : (
        <div className="space-y-3">
          <div
            ref={frameRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className="relative w-full overflow-hidden rounded-2xl bg-violet-50"
            style={{
              aspectRatio: ratio ? `${ratio}` : undefined,
              minHeight: ratio ? undefined : "8rem",
              cursor: zoom > 1.01 && !locked ? "grab" : "default",
              touchAction: zoom > 1.01 ? "none" : "auto",
            }}
          >
            {url ? (
              <img
                src={url}
                alt={value.image_alt || "Flashcard image preview"}
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
            ) : failed ? (
              <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-[13px] text-slate-500">
                This image could not be loaded.
              </div>
            ) : (
              <div className="absolute inset-0 animate-pulse bg-violet-100" />
            )}
          </div>

          {!locked && (
            <>
              <div className="flex items-center gap-3">
                <ZoomIn className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                <Slider
                  aria-label="Zoom image"
                  min={1}
                  max={3}
                  step={0.05}
                  value={[zoom]}
                  onValueChange={([v]) => applyZoom(v)}
                  className="flex-1"
                />
                <span className="w-10 shrink-0 text-right text-[12px] font-semibold tabular-nums text-slate-500">
                  {zoom.toFixed(1)}×
                </span>
              </div>
              {zoom > 1.01 && <p className="text-[12px] text-slate-500">Drag the image to reposition it.</p>}

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={pickFile}
                  disabled={uploading}
                  className="min-h-[40px] rounded-full text-[13px]"
                >
                  {uploading ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ImagePlus className="mr-1 h-3.5 w-3.5" />
                  )}
                  Replace
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isFullCrop(value.image_crop)}
                  onClick={() => applyZoom(1)}
                  className="min-h-[40px] rounded-full text-[13px]"
                >
                  <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reset crop
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={removeImage}
                  className="min-h-[40px] rounded-full text-[13px] text-rose-600 hover:text-rose-700"
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove
                </Button>
              </div>
            </>
          )}

          <div>
            <label
              htmlFor={`fc-alt-${fieldId}`}
              className="mb-1.5 block text-[12.5px] font-semibold text-slate-600"
            >
              Image description
            </label>
            <Input
              id={`fc-alt-${fieldId}`}
              value={value.image_alt ?? ""}
              maxLength={ALT_MAX}
              disabled={locked}
              placeholder="Diagram of a solenoid and magnet"
              onChange={(e) => onChange({ image_alt: e.target.value })}
              className="min-h-[44px] rounded-2xl border-slate-200 bg-white text-[15px]"
            />
            <p className="mt-1 text-[12px] text-slate-500">
              Read aloud by screen readers. Describe what the image shows.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
