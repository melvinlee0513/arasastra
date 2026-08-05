import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Loader2 } from "lucide-react";
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
import { reorderContentFolders, type ContentFolder } from "@/lib/contentFolders";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId: string;
  parentId: string | null;
  /** Complete sibling set for `parentId`, in current display order. */
  siblings: ContentFolder[];
  onSaved: () => void;
}

/**
 * Arrange folders mode. Move Up / Move Down keeps this usable on touch devices
 * (no drag dependency). The complete sibling id set is always sent, and local
 * state rolls back if the RPC rejects the order.
 */
export function FolderArrangeDialog({
  open,
  onOpenChange,
  classId,
  parentId,
  siblings,
  onSaved,
}: Props) {
  const { toast } = useToast();
  const [order, setOrder] = useState<ContentFolder[]>(siblings);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setOrder(siblings);
  }, [open, siblings]);

  function move(index: number, delta: number) {
    setOrder((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function save() {
    setBusy(true);
    const snapshot = order;
    try {
      await reorderContentFolders(
        classId,
        order.map((f) => f.id),
        parentId,
      );
      toast({ title: "Folder order saved" });
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setOrder(siblings); // rollback optimistic local order
      void snapshot;
      toast({
        title: "Couldn't save order",
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
          <DialogTitle>Arrange folders</DialogTitle>
          <DialogDescription>
            Set the order students see. Only folders in this level are reordered.
          </DialogDescription>
        </DialogHeader>

        {order.length === 0 ? (
          <p className="text-sm text-slate-500">There are no folders to arrange here yet.</p>
        ) : (
          <ol className="space-y-2">
            {order.map((f, i) => (
              <li
                key={f.id}
                className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2"
              >
                <span className="text-xs font-semibold text-slate-400 w-5 shrink-0">{i + 1}</span>
                <span className="flex-1 min-w-0 text-sm font-medium text-slate-800 break-words">
                  {f.name}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="rounded-full h-8 w-8 shrink-0"
                  aria-label={`Move ${f.name} up`}
                  disabled={i === 0 || busy}
                  onClick={() => move(i, -1)}
                >
                  <ArrowUp className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="rounded-full h-8 w-8 shrink-0"
                  aria-label={`Move ${f.name} down`}
                  disabled={i === order.length - 1 || busy}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown className="w-4 h-4" />
                </Button>
              </li>
            ))}
          </ol>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            className="rounded-full"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            className="rounded-full"
            onClick={() => void save()}
            disabled={busy || order.length < 2}
          >
            {busy && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />} Save order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
