import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2, UploadCloud } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { toSafeMessage } from "@/components/common/TenantGate";
import {
  clearFolderCover,
  getFolderCoverSignedUrl,
  processFolderCoverFile,
  uploadFolderCover,
} from "@/lib/folderCovers";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folder: { id: string; name: string; cover_image_path: string | null };
  classId: string;
  centerId: string | null | undefined;
  onSaved: () => void;
}

/**
 * Folder cover upload / replace / remove with a square crop preview. The image
 * is centre-cropped and re-encoded to a 600x600 WebP in the browser before it
 * ever reaches storage; the server RPC validates the destination path.
 */
export function FolderCoverManager({
  open,
  onOpenChange,
  folder,
  classId,
  centerId,
  onSaved,
}: Props) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBlob(null);
    setPreviewUrl(null);
    let active = true;
    void getFolderCoverSignedUrl(folder.cover_image_path).then((url) => {
      if (active) setCurrentUrl(url);
    });
    return () => {
      active = false;
    };
  }, [open, folder.cover_image_path]);

  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  async function pick(file: File | undefined) {
    if (!file) return;
    try {
      const processed = await processFolderCoverFile(file);
      setBlob(processed);
      setPreviewUrl(URL.createObjectURL(processed));
    } catch (err) {
      toast({
        title: "Couldn't use that image",
        description: toSafeMessage(err, "Please choose a JPEG, PNG or WebP under 5 MB."),
        variant: "destructive",
      });
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function save() {
    if (!blob || !centerId) return;
    setBusy(true);
    try {
      await uploadFolderCover({ centerId, classId, folderId: folder.id, blob });
      toast({ title: "Cover updated" });
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Couldn't save cover",
        description: toSafeMessage(err, "Please try again."),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await clearFolderCover(folder.id);
      toast({ title: "Cover removed" });
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Couldn't remove cover",
        description: toSafeMessage(err, "Please try again."),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  const shown = previewUrl ?? currentUrl;

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Folder cover</DialogTitle>
          <DialogDescription>
            Square artwork for “{folder.name}”. JPEG, PNG or WebP up to 5 MB — we crop to a
            600×600 square automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="mx-auto w-full max-w-[280px]">
          <div className="aspect-square w-full rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center">
            {shown ? (
              <img
                src={shown}
                alt={`${folder.name} cover preview`}
                className="w-full h-full object-cover"
              />
            ) : (
              <ImagePlus className="w-10 h-10 text-slate-300" />
            )}
          </div>
          {previewUrl && (
            <p className="text-[11px] text-slate-500 mt-2 text-center">
              Preview of the cropped square that will be saved.
            </p>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(e) => void pick(e.target.files?.[0])}
        />

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            className="rounded-full w-full sm:w-auto"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            <UploadCloud className="w-4 h-4 mr-1.5" />
            {folder.cover_image_path ? "Change image" : "Choose image"}
          </Button>
          {folder.cover_image_path && !previewUrl && (
            <Button
              type="button"
              variant="ghost"
              className="rounded-full text-red-600 hover:text-red-700 w-full sm:w-auto"
              onClick={() => void remove()}
              disabled={busy}
            >
              <Trash2 className="w-4 h-4 mr-1.5" /> Remove cover
            </Button>
          )}
          <Button
            type="button"
            className="rounded-full w-full sm:w-auto"
            onClick={() => void save()}
            disabled={busy || !blob || !centerId}
          >
            {busy && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />} Save cover
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
