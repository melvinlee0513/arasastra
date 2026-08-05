import { useCallback, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  Copy,
  Layers,
  Loader2,
  ListOrdered,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCcw,
  FolderInput,
  Search,
  Send,
  Trash2,
  Undo2,
  Users,
} from "lucide-react";
import { ClassShell } from "@/components/class/ClassShell";
import { TenantEmptyState } from "@/components/common/TenantGate";
import { useClassContext } from "@/hooks/useClassContext";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  FLASHCARD_STATUS_LABEL,
  type FlashcardDeckManagerRow,
  type FlashcardDeckStatus,
  deleteFlashcardDeckSafe,
  duplicateFlashcardDeckAsDraft,
  flashcardManagerKeys,
  formatFlashcardDate,
  formatFlashcardRelative,
  listClassFlashcardDecksForManager,
  mapFlashcardError,
  reorderFlashcardDecks,
  setFlashcardDeckStatus,
} from "@/lib/flashcards";
import { MoveToFolderDialog, type MoveTarget } from "@/components/class/MoveToFolderDialog";
import {
  fetchManagerContentTree,
  folderKeys,
  folderPath,
  type ContentFolder,
} from "@/lib/contentFolders";

type Variant = "tutor" | "admin";

const STATUS_FILTERS = ["all", "draft", "published", "archived"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

interface Props {
  variant: Variant;
}

export function ClassFlashcardsManager({ variant }: Props) {
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const ctx = useClassContext(classId);
  const qc = useQueryClient();
  const { toast } = useToast();

  const basePath = variant === "admin" ? `/admin/classes/${classId}` : `/tutor/classes/${classId}`;
  const materialsPath = `${basePath}/resources`;

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [reorderMode, setReorderMode] = useState(false);
  const [localOrder, setLocalOrder] = useState<FlashcardDeckManagerRow[] | null>(null);
  const [pendingDelete, setPendingDelete] = useState<FlashcardDeckManagerRow | null>(null);
  const [pendingArchive, setPendingArchive] = useState<FlashcardDeckManagerRow | null>(null);
  const [pendingMove, setPendingMove] = useState<MoveTarget | null>(null);

  const canManage = !!ctx.data?.canManage;
  const classMissing = !ctx.isLoading && !ctx.data?.klass;

  const listQ = useQuery({
    queryKey: flashcardManagerKeys.list(currentTenantId, classId ?? "", user?.id),
    enabled: !!classId && !!user && canManage,
    queryFn: () => listClassFlashcardDecksForManager(classId!),
    staleTime: 15_000,
  });

  // Folder placement comes from the canonical content tree.
  const treeQ = useQuery({
    queryKey: folderKeys.managerTree(currentTenantId, classId ?? "", user?.id),
    enabled: !!classId && !!user && canManage,
    queryFn: () => fetchManagerContentTree(classId!),
    staleTime: 15_000,
  });

  const folders: ContentFolder[] = treeQ.data?.folders ?? [];
  const folderByDeck = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const d of treeQ.data?.flashcard_decks ?? []) map.set(d.id, d.folder_id ?? null);
    return map;
  }, [treeQ.data]);

  const folderLabel = (deckId: string): string | null => {
    const folderId = folderByDeck.get(deckId) ?? null;
    if (!folderId) return null;
    const path = folderPath(folders, folderId);
    return path.length ? path.map((f) => f.name).join(" / ") : null;
  };

  const rows = localOrder ?? listQ.data ?? [];

  const filtering = statusFilter !== "all" || search.trim().length > 0;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (q && !r.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, statusFilter, search]);

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["flashcard-manager"] });
    qc.invalidateQueries({ queryKey: ["flashcard-student"] });
    qc.invalidateQueries({ queryKey: ["class-context", currentTenantId, classId] });
    qc.invalidateQueries({ queryKey: ["tutor-class-home"] });
    qc.invalidateQueries({ queryKey: ["student-class-materials"] });
    qc.invalidateQueries({ queryKey: ["class-content"] });
  }, [qc, currentTenantId, classId]);

  const statusMut = useMutation({
    mutationFn: (v: { id: string; status: FlashcardDeckStatus }) => setFlashcardDeckStatus(v.id, v.status),
    onSuccess: (_d, v) => {
      setLocalOrder(null);
      invalidate();
      toast({
        title:
          v.status === "published"
            ? "Deck published"
            : v.status === "archived"
              ? "Deck archived"
              : "Deck set to draft",
      });
    },
    onError: (err) =>
      toast({ title: "Action failed", description: mapFlashcardError(err), variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFlashcardDeckSafe(id),
    onSuccess: (res) => {
      setLocalOrder(null);
      invalidate();
      if (res.deleted) toast({ title: "Deck deleted" });
      else
        toast({
          title: "Archived instead",
          description:
            "Students already studied this deck, so its history is preserved and the deck was archived.",
        });
    },
    onError: (err) =>
      toast({ title: "Delete failed", description: mapFlashcardError(err), variant: "destructive" }),
    onSettled: () => setPendingDelete(null),
  });

  const dupMut = useMutation({
    mutationFn: (id: string) => duplicateFlashcardDeckAsDraft(id),
    onSuccess: (newId) => {
      setLocalOrder(null);
      invalidate();
      toast({ title: "Duplicated as new draft" });
      navigate(`${basePath}/flashcards/${newId}/edit`);
    },
    onError: (err) =>
      toast({ title: "Duplicate failed", description: mapFlashcardError(err), variant: "destructive" }),
  });

  const reorderMut = useMutation({
    mutationFn: (ids: string[]) => reorderFlashcardDecks(classId!, ids),
    onSuccess: () => {
      invalidate();
      toast({ title: "Deck order saved" });
    },
    onError: (err) => {
      setLocalOrder(null); // rollback optimistic order
      toast({ title: "Reorder failed", description: mapFlashcardError(err), variant: "destructive" });
    },
  });

  const move = (index: number, delta: number) => {
    const source = localOrder ?? listQ.data ?? [];
    const target = index + delta;
    if (target < 0 || target >= source.length) return;
    const next = [...source];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    setLocalOrder(next); // optimistic
    reorderMut.mutate(next.map((d) => d.id));
  };

  const busy =
    statusMut.isPending || deleteMut.isPending || dupMut.isPending || reorderMut.isPending;

  const breadcrumbs = [
    { label: variant === "admin" ? "Admin" : "Tutor", to: variant === "admin" ? "/admin" : "/tutor" },
    { label: "Classes", to: variant === "admin" ? "/admin/curriculum" : "/tutor/classes" },
    { label: ctx.data?.klass?.title ?? "Class", to: basePath },
    { label: "Flashcards" },
  ];

  const headerRight = (
    <Button
      className="rounded-full"
      onClick={() => navigate(`${basePath}/flashcards/new`)}
      disabled={!canManage}
    >
      <Plus className="w-4 h-4 mr-1.5" />
      New deck
    </Button>
  );

  return (
    <ClassShell
      data={ctx.data}
      isLoading={ctx.isLoading}
      role={variant}
      section="flashcards"
      basePath={basePath}
      materialsPath={materialsPath}
      breadcrumbs={breadcrumbs}
      headerRight={headerRight}
    >
      {classMissing ? (
        <TenantEmptyState
          title="Class unavailable"
          body="This class no longer exists or is not part of your centre."
        />
      ) : !canManage && !ctx.isLoading ? (
        <TenantEmptyState
          title="Not available"
          body="You don't have permission to manage flashcards for this class."
        />
      ) : (
        <div className="space-y-4">
          {/* Filters + reorder toggle */}
          <div className="bg-white border border-slate-200 rounded-3xl p-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search deck titles…"
                className="pl-9 rounded-full"
              />
            </div>
            <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <TabsList className="rounded-full">
                {STATUS_FILTERS.map((f) => (
                  <TabsTrigger key={f} value={f} className="rounded-full">
                    {f === "all" ? "All" : FLASHCARD_STATUS_LABEL[f as FlashcardDeckStatus]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <Button
              type="button"
              variant={reorderMode ? "default" : "outline"}
              className="rounded-full shrink-0"
              onClick={() => setReorderMode((v) => !v)}
              disabled={filtering || rows.length < 2}
              title={
                filtering
                  ? "Clear the search and status filter to reorder decks"
                  : "Reorder decks for this class"
              }
            >
              <ListOrdered className="w-4 h-4 mr-1.5" />
              {reorderMode ? "Done" : "Reorder"}
            </Button>
          </div>

          {filtering && (
            <p className="text-xs text-slate-500 px-1">
              Reordering is disabled while filtering or searching, because the global deck order
              would be ambiguous.
            </p>
          )}

          {/* Body */}
          {listQ.isLoading ? (
            <div className="flex items-center justify-center py-16 text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading decks…
            </div>
          ) : listQ.error ? (
            <div className="bg-white border border-red-200 rounded-3xl p-6 text-center">
              <p className="text-sm text-red-600 mb-3">
                Couldn't load flashcard decks. {mapFlashcardError(listQ.error)}
              </p>
              <Button variant="outline" onClick={() => listQ.refetch()} className="rounded-full">
                <RefreshCcw className="w-4 h-4 mr-1.5" /> Retry
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <TenantEmptyState
              title={rows.length ? "No matching decks" : "No flashcard decks yet"}
              body={
                rows.length
                  ? "Try a different filter or search term."
                  : "Create your first deck to give this class something to revise."
              }
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map((row) => {
                const index = rows.findIndex((r) => r.id === row.id);
                return (
                  <DeckCard
                    key={row.id}
                    row={row}
                    index={index}
                    total={rows.length}
                    reorderMode={reorderMode && !filtering}
                    busy={busy}
                    onEdit={() => navigate(`${basePath}/flashcards/${row.id}/edit`)}
                    onStatus={(s) => statusMut.mutate({ id: row.id, status: s })}
                    onArchive={() => setPendingArchive(row)}
                    onDelete={() => setPendingDelete(row)}
                    onDuplicate={() => dupMut.mutate(row.id)}
                    onMove={(delta) => move(index, delta)}
                    folderLabel={folderLabel(row.id)}
                    onMoveToFolder={() =>
                      setPendingMove({
                        kind: "flashcard_deck",
                        id: row.id,
                        title: row.title,
                        folderId: folderByDeck.get(row.id) ?? null,
                      })
                    }
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this deck?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes "{pendingDelete?.title}". Decks students have already
              studied cannot be permanently deleted — they are archived instead so progress and
              rewards are preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => pendingDelete && deleteMut.mutate(pendingDelete.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Archive confirm */}
      <AlertDialog open={!!pendingArchive} onOpenChange={(open) => !open && setPendingArchive(null)}>
        <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this deck?</AlertDialogTitle>
            <AlertDialogDescription>
              "{pendingArchive?.title}" will be hidden from students, but existing progress and XP
              history are preserved. You can restore it to draft anytime.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingArchive) statusMut.mutate({ id: pendingArchive.id, status: "archived" });
                setPendingArchive(null);
              }}
            >
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <MoveToFolderDialog
        open={!!pendingMove}
        onOpenChange={(open) => !open && setPendingMove(null)}
        folders={folders}
        target={pendingMove}
        onMoved={() => {
          setPendingMove(null);
          invalidate();
        }}
      />
    </ClassShell>
  );
}

function DeckCard({
  row,
  index,
  total,
  reorderMode,
  busy,
  onEdit,
  onStatus,
  onArchive,
  onDelete,
  onDuplicate,
  onMove,
  folderLabel,
  onMoveToFolder,
}: {
  row: FlashcardDeckManagerRow;
  index: number;
  total: number;
  reorderMode: boolean;
  busy: boolean;
  onEdit: () => void;
  onStatus: (s: FlashcardDeckStatus) => void;
  onArchive: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMove: (delta: number) => void;
  folderLabel: string | null;
  onMoveToFolder: () => void;
}) {
  const statusColor =
    row.status === "published"
      ? "bg-emerald-100 text-emerald-700"
      : row.status === "archived"
        ? "bg-slate-200 text-slate-600"
        : "bg-amber-100 text-amber-700";

  return (
    <article className="bg-white border border-slate-200 rounded-3xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-900 break-words">{row.title}</h3>
          <p className="text-xs text-slate-500 mt-0.5">Updated {formatFlashcardRelative(row.updated_at)}</p>
          <p className="text-xs text-slate-500 mt-1 inline-flex items-center gap-1 break-words">
            <FolderInput className="w-3 h-3 shrink-0" />
            {folderLabel ?? "Unfiled Materials"}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge className={`rounded-full ${statusColor}`}>{FLASHCARD_STATUS_LABEL[row.status]}</Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="rounded-full h-8 w-8"
                disabled={busy}
                aria-label={`Actions for ${row.title}`}
              >
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="w-4 h-4 mr-2" /> Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Lifecycle</DropdownMenuLabel>
              {row.status !== "published" && (
                <DropdownMenuItem onClick={() => onStatus("published")}>
                  <Send className="w-4 h-4 mr-2" /> Publish
                </DropdownMenuItem>
              )}
              {row.status === "published" && (
                <DropdownMenuItem onClick={() => onStatus("draft")}>
                  <Undo2 className="w-4 h-4 mr-2" /> Unpublish (to draft)
                </DropdownMenuItem>
              )}
              {row.status !== "archived" ? (
                <DropdownMenuItem onClick={onArchive}>
                  <Archive className="w-4 h-4 mr-2" /> Archive
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => onStatus("draft")}>
                  <ArchiveRestore className="w-4 h-4 mr-2" /> Restore to draft
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onMoveToFolder}>
                <FolderInput className="w-4 h-4 mr-2" /> Move to folder
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate}>
                <Copy className="w-4 h-4 mr-2" /> Duplicate as draft
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete} className="text-red-600 focus:text-red-600">
                <Trash2 className="w-4 h-4 mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {row.description && <p className="text-sm text-slate-600 line-clamp-2 break-words">{row.description}</p>}

      <dl className="grid grid-cols-2 gap-2 text-xs text-slate-600">
        <Stat
          label="Cards"
          value={
            <span className="inline-flex items-center gap-1">
              <Layers className="w-3 h-3" /> {row.card_count}
            </span>
          }
        />
        <Stat label="Complete cards" value={`${row.valid_card_count}`} />
        <Stat label="Order" value={`#${row.display_order + 1}`} />
        <Stat label="Version" value={`v${row.definition_version}`} />
        <Stat label="Published" value={formatFlashcardDate(row.published_at)} />
        <Stat label="Created" value={formatFlashcardDate(row.created_at)} />
      </dl>

      {row.has_learning_history && (
        <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-2xl px-3 py-2 flex items-center gap-2">
          <Users className="w-3 h-3 shrink-0" />
          Students have studied this deck — it can be archived but not permanently deleted.
        </div>
      )}

      {reorderMode && (
        <div className="flex items-center gap-2 pt-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-full"
            onClick={() => onMove(-1)}
            disabled={busy || index <= 0}
          >
            <ArrowUp className="w-3.5 h-3.5 mr-1" /> Move up
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-full"
            onClick={() => onMove(1)}
            disabled={busy || index >= total - 1}
          >
            <ArrowDown className="w-3.5 h-3.5 mr-1" /> Move down
          </Button>
        </div>
      )}
    </article>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="text-slate-800 truncate">{value}</dd>
    </div>
  );
}

export default ClassFlashcardsManager;
