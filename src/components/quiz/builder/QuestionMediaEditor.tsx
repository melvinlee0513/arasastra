import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, RotateCcw, Trash2, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { toast } from "@/hooks/use-toast";
import { useQuestionImageUrl } from "@/components/quiz/QuestionMedia";
import { BuilderField } from "./QuizBuilderChrome";
import {
  FULL_CROP,
  QUIZ_MEDIA_ACCEPT,
  QuizMediaError,
  croppedAspectRatio,
  deleteQuestionImageObject,
  isFullCrop,
  uploadQuestionImage,
  type QuestionMediaCrop,
} from "@/lib/quizMedia";

const ALT_MAX = 200;

export interface QuestionMediaEditorProps {
  centerId: string | null;
  questionId: string;
  locked: boolean;
  image_path: string | null;
  image_width: number | null;
  image_height: number | null;
  image_alt: string | null;
  image_crop: QuestionMediaCrop | null;
  onChange: (patch: {
    image_path?: string | null;
    image_width?: number | null;
    image_height?: number | null;
    image_alt?: string | null;
    image_crop?: QuestionMediaCrop | null;
  }) => void;
}

/** Zoom (1-3) and pan centre (0-1) derived from, and written back to, the crop. */
function cropFromView(zoom: number, cx: number, cy: number): QuestionMediaCrop {
  const size = 1 / zoom;
  const half = size / 2;
  const x = Math.min(Math.max(cx - half, 0), 1 - size);
  const y = Math.min(Math.max(cy - half, 0), 1 - size);
  return { x, y, w: size, h: size };
}

export function QuestionMediaEditor({
  centerId,
  questionId,
  locked,
  image_path,
  image_width,
  image_height,
  image_alt,
  image_crop,
  onChange,
}: QuestionMediaEditorProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [uploading, setUploading] = useState(false);
  const { url, failed } = useQuestionImageUrl(image_path);

  const crop = image_crop ?? FULL_CROP;
  const [zoom, setZoom] = useState(() => (image_crop ? 1 / Math.max(image_crop.w, 0.34) : 1));
  const dragRef = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);

  useEffect(() => {
    setZoom(image_crop ? 1 / Math.max(image_crop.w, 0.34) : 1);
  }, [image_path, image_crop]);

  const pickFile = () => fileRef.current?.click();

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!centerId) {
      toast({ title: "Save the quiz first", description: "The centre is not ready yet." });
      return;
    }
    setUploading(true);
    try {
      const previous = image_path;
      const uploaded = await uploadQuestionImage(centerId, file);
      onChange({ ...uploaded, image_crop: null, image_alt: image_alt ?? "" });
      if (previous) void deleteQuestionImageObject(previous);
    } catch (error) {
      toast({
        title: "Image not added",
        description:
          error instanceof QuizMediaError
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
    const previous = image_path;
    onChange({
      image_path: null,
      image_width: null,
      image_height: null,
      image_alt: null,
      image_crop: null,
    });
    if (previous) void deleteQuestionImageObject(previous);
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
    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      cx: crop.x + crop.w / 2,
      cy: crop.y + crop.h / 2,
    };
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
    image_width,
    image_height,
    image_crop: image_crop ?? null,
  });

  return (
    <BuilderField
      label="Image"
      hint="Optional. One image per question — diagrams, graphs or photos. JPG, PNG or WebP up to 10 MB."
    >
      <input
        ref={fileRef}
        type="file"
        accept={QUIZ_MEDIA_ACCEPT}
        className="sr-only"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />

      {!image_path ? (
        <Button
          type="button"
          variant="outline"
          disabled={locked || uploading}
          onClick={pickFile}
          className="min-h-[44px] w-full rounded-2xl border-dashed border-slate-300 bg-white text-[14px] font-semibold text-slate-600"
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
            className="relative w-full overflow-hidden rounded-2xl bg-slate-100"
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
                alt={image_alt || "Question image preview"}
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
              <div className="absolute inset-0 animate-pulse bg-slate-200" />
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
              {zoom > 1.01 && (
                <p className="text-[12px] text-slate-500">Drag the image to reposition it.</p>
              )}

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
                  disabled={isFullCrop(image_crop)}
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
              htmlFor={`q-alt-${questionId}`}
              className="mb-1.5 block text-[12.5px] font-semibold text-slate-600"
            >
              Image description
            </label>
            <Input
              id={`q-alt-${questionId}`}
              value={image_alt ?? ""}
              maxLength={ALT_MAX}
              disabled={locked}
              placeholder="Graph of distance against time"
              onChange={(e) => onChange({ image_alt: e.target.value })}
              className="min-h-[44px] rounded-2xl border-slate-200 bg-white text-[15px]"
            />
            <p className="mt-1 text-[12px] text-slate-500">
              Read aloud by screen readers. Describe what the image shows.
            </p>
          </div>
        </div>
      )}
    </BuilderField>
  );
}
