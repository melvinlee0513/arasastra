import { useState } from "react";
import { Loader2, MoveRight } from "lucide-react";
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
import { FolderSelect } from "@/components/class/FolderSelect";
import {
  moveContentFolder,
  moveContentItem,
  type ContentFolder,
  type ContentItemType,
} from "@/lib/contentFolders";

export type MoveTarget =
  | { kind: "folder"; id: string; title: string; parentId: string | null }
  | { kind: ContentItemType; id: string; title: string; folderId: string | null };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folders: ContentFolder[];
  target: MoveTarget | null;
  onMoved: () => void;
}

/**
 * Single-item move dialog for folders, resources, quizzes and flashcard decks.
 * Moving never touches item content: attempts, results, flashcard progress and
 * XP history are unaffected because only `folder_id`/`parent_id` changes.
 */
export function MoveToFolderDialog({ open, onOpenChange, folders, target, onMoved }: Props) {
  const { toast } = useToast();
  const initial =
    target?.kind === "folder" ? target.parentId : (target?.folderId ?? null);
  const [dest, setDest] = useState<string | null>(initial ?? null);
  const [busy, setBusy] = useState(false);
  const [openedFor, setOpenedFor] = useState<string | null>(null);

  // Re-seed when the dialog opens for a different target.
  if (open && target && openedFor !== target.id) {
    setOpenedFor(target.id);
    setDest(initial ?? null);
  }

  async function submit() {
    if (!target) return;
    setBusy(true);
    try {
      if (target.kind === "folder") {
        await moveContentFolder(target.id, dest);
      } else {
        await moveContentItem(target.kind, target.id, dest);
      }
      toast({ title: "Moved" });
      onMoved();
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Couldn't move this",
        description: toSafeMessage(err, "Please try again."),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Move to folder</DialogTitle>
          <DialogDescription className="break-words">
            Choose where “{target?.title ?? "this item"}” should live. Nothing else changes —
            content, student progress and results stay exactly as they are.
          </DialogDescription>
        </DialogHeader>

        <FolderSelect
          folders={folders}
          value={dest}
          onChange={setDest}
          excludeFolderId={target?.kind === "folder" ? target.id : undefined}
          label="Destination"
          id="move-destination"
          disabled={busy}
        />

        <DialogFooter>
          <Button
            variant="outline"
            className="rounded-full"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button className="rounded-full" onClick={() => void submit()} disabled={busy}>
            {busy ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <MoveRight className="w-4 h-4 mr-1.5" />
            )}
            Move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
