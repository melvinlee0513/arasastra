import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2, Trash2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { showSupabaseError } from "@/lib/supabaseErrors";
import {
  aboutKeys,
  removeAboutImage,
  saveClassAboutSection,
  uploadAboutImage,
  useAboutImageUrl,
  type ClassAboutSection,
} from "@/lib/classAbout";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId: string;
  centerId: string;
  /** Existing section when editing; null when adding. */
  section: ClassAboutSection | null;
}

/**
 * Add/edit form for one flexible About block. Same form for both actions —
 * title required, description and image optional.
 */
export function ClassAboutSectionDialog({ open, onOpenChange, classId, centerId, section }: Props) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const existingImage = useAboutImageUrl(pendingFile ? null : imagePath);

  useEffect(() => {
    if (!open) return;
    setTitle(section?.title ?? "");
    setContent(section?.content ?? "");
    setImagePath(section?.image_path ?? null);
    setPendingFile(null);
    setLocalPreview(null);
  }, [open, section]);

  useEffect(() => {
    if (!pendingFile) return;
    const url = URL.createObjectURL(pendingFile);
    setLocalPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingFile]);

  const save = useMutation({
    mutationFn: async () => {
      const trimmed = title.trim();
      if (!trimmed) throw new Error("Please add a title for this section.");
      let nextPath = imagePath;
      if (pendingFile) {
        nextPath = await uploadAboutImage({
          file: pendingFile,
          centerId,
          classId,
          sectionKey: section?.id ?? "new",
        });
      }
      await saveClassAboutSection({
        classId,
        title: trimmed,
        content: content.trim() || null,
        imagePath: nextPath,
        sectionId: section?.id ?? null,
      });
      // Drop the replaced image once the row points at the new one.
      if (pendingFile && section?.image_path && section.image_path !== nextPath) {
        await removeAboutImage(section.image_path);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: aboutKeys.sections(classId) });
      toast.success(section ? "Section updated" : "Section added");
      onOpenChange(false);
    },
    onError: (err) => showSupabaseError(err, "We couldn't save this section."),
  });

  const previewUrl = localPreview ?? existingImage.data ?? null;

  return (
    <Dialog open={open} onOpenChange={(next) => !save.isPending && onOpenChange(next)}>
      <DialogContent className="max-w-lg rounded-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{section ? "Edit information" : "Add information"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="about-title">Title</Label>
            <Input
              id="about-title"
              className="mt-1.5 rounded-2xl"
              placeholder="e.g. Consultation hours"
              value={title}
              maxLength={160}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="about-content">Description (optional)</Label>
            <Textarea
              id="about-content"
              className="mt-1.5 rounded-2xl min-h-[120px]"
              placeholder="e.g. Tuesday and Thursday, 3pm–5pm."
              value={content}
              maxLength={4000}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>

          <div>
            <Label>Image (optional)</Label>
            {previewUrl ? (
              <div className="mt-1.5 relative">
                <img
                  src={previewUrl}
                  alt=""
                  className="w-full max-h-56 object-cover rounded-2xl border border-slate-200"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  aria-label="Remove image"
                  className="absolute top-2 right-2 rounded-full"
                  onClick={() => {
                    setPendingFile(null);
                    setLocalPreview(null);
                    setImagePath(null);
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="mt-1.5 rounded-full w-full min-h-[44px]"
                onClick={() => fileRef.current?.click()}
              >
                <ImagePlus className="w-4 h-4 mr-2" /> Upload image
              </Button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                if (file.size > 5 * 1024 * 1024) {
                  toast.error("Images must be 5 MB or smaller.");
                  return;
                }
                setPendingFile(file);
              }}
            />
            <p className="text-xs text-slate-500 mt-1.5">JPEG, PNG or WebP, up to 5 MB.</p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            className="rounded-full"
            disabled={save.isPending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            className="rounded-full"
            disabled={!title.trim() || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
            {section ? "Save" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteSectionButton({
  classId,
  section,
}: {
  classId: string;
  section: ClassAboutSection;
}) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: async () => {
      const { deleteClassAboutSection } = await import("@/lib/classAbout");
      await deleteClassAboutSection(section.id);
      if (section.image_path) await removeAboutImage(section.image_path);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: aboutKeys.sections(classId) });
      toast.success("Section removed");
    },
    onError: (err) => showSupabaseError(err, "We couldn't remove this section."),
  });

  return (
    <Button
      variant="ghost"
      size="sm"
      className="rounded-full text-destructive min-h-[40px]"
      aria-label={`Delete ${section.title}`}
      disabled={del.isPending}
      onClick={() => {
        if (!confirm(`Delete “${section.title}”?`)) return;
        del.mutate();
      }}
    >
      {del.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
    </Button>
  );
}
