import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  CLASS_COVER_BUCKET, coverPathFor, invalidateClassCoverCache,
  processCoverFile,
} from "@/lib/classCovers";
import { ClassCover } from "@/components/class/ClassCover";
import { showSupabaseError } from "@/lib/supabaseErrors";

interface Props {
  classId: string;
  centerId: string;
  currentPath: string | null;
  currentVersion: string | null;
  /** Optional trigger override — defaults to a compact outline button. */
  trigger?: React.ReactNode;
}

/**
 * Upload / replace / remove the class cover image. Only rendered for users the
 * caller has already gated (assigned tutor or same-centre admin). Server-side
 * RLS enforces the same policy.
 */
export function ClassCoverManager({
  classId, centerId, currentPath, currentVersion, trigger,
}: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);

  function resetPreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewBlob(null);
  }

  async function handleFile(file: File | undefined | null) {
    if (!file) return;
    try {
      setBusy(true);
      const blob = await processCoverFile(file);
      resetPreview();
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      setPreviewBlob(blob);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't process this image.");
    } finally {
      setBusy(false);
    }
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!previewBlob) throw new Error("Choose an image first.");
      const path = coverPathFor(centerId, classId);
      const { error: upErr } = await supabase.storage
        .from(CLASS_COVER_BUCKET)
        .upload(path, previewBlob, {
          upsert: true,
          contentType: "image/webp",
          cacheControl: "3600",
        });
      if (upErr) throw upErr;

      const { error: dbErr } = await supabase
        .from("classes")
        .update({
          cover_image_path: path,
          cover_image_updated_at: new Date().toISOString(),
          cover_image_updated_by: user?.id ?? null,
        })
        .eq("id", classId);
      if (dbErr) throw dbErr;

      invalidateClassCoverCache(path);
      return path;
    },
    onSuccess: async () => {
      toast.success("Class cover updated");
      resetPreview();
      setOpen(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["class-cover-signed"] }),
        qc.invalidateQueries({ queryKey: ["class-context"] }),
        qc.invalidateQueries({ queryKey: ["student-enrolled-classes"] }),
      ]);
    },
    onError: (e) => showSupabaseError(e, "Couldn't update the class cover."),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const path = currentPath;
      const { error: dbErr } = await supabase
        .from("classes")
        .update({
          cover_image_path: null,
          cover_image_updated_at: new Date().toISOString(),
          cover_image_updated_by: user?.id ?? null,
        })
        .eq("id", classId);
      if (dbErr) throw dbErr;
      if (path) {
        try {
          await supabase.storage.from(CLASS_COVER_BUCKET).remove([path]);
        } catch {
          // best-effort — DB row already cleared, RLS may have blocked older objects
        }
        invalidateClassCoverCache(path);
      }
    },
    onSuccess: async () => {
      toast.success("Cover removed");
      resetPreview();
      setOpen(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["class-cover-signed"] }),
        qc.invalidateQueries({ queryKey: ["class-context"] }),
        qc.invalidateQueries({ queryKey: ["student-enrolled-classes"] }),
      ]);
    },
    onError: (e) => showSupabaseError(e, "Couldn't remove the class cover."),
  });

  return (
    <>
      <span
        onClick={() => setOpen(true)}
        className="inline-flex"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setOpen(true); }}
      >
        {trigger ?? (
          <Button variant="outline" size="sm" className="rounded-full">
            <ImagePlus className="w-4 h-4 mr-1.5" />
            {currentPath ? "Change cover" : "Add cover"}
          </Button>
        )}
      </span>

      <Dialog open={open} onOpenChange={(o) => { if (!o) resetPreview(); setOpen(o); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Class cover image</DialogTitle>
            <DialogDescription>
              JPEG, PNG or WebP up to 5 MB. Cropped to 16:9 automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-2xl overflow-hidden border border-slate-200">
              {previewUrl ? (
                <div className="relative aspect-video w-full bg-slate-50">
                  <img src={previewUrl} alt="Preview" className="absolute inset-0 h-full w-full object-cover" />
                </div>
              ) : (
                <ClassCover classId={classId} coverPath={currentPath} version={currentVersion} priority />
              )}
            </div>

            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => void handleFile(e.target.files?.[0])}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="rounded-full"
                onClick={() => inputRef.current?.click()}
                disabled={busy || save.isPending || remove.isPending}
              >
                <Upload className="w-4 h-4 mr-1.5" />
                {previewUrl ? "Choose another" : "Choose image"}
              </Button>
              {currentPath && !previewUrl && (
                <Button
                  variant="ghost"
                  className="rounded-full text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={() => {
                    if (confirm("Remove the current cover?")) remove.mutate();
                  }}
                  disabled={remove.isPending}
                >
                  {remove.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1.5" />}
                  Remove cover
                </Button>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => { resetPreview(); setOpen(false); }}>Cancel</Button>
            <Button
              className="rounded-full"
              disabled={!previewBlob || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <ImagePlus className="w-4 h-4 mr-1.5" />}
              Save cover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
