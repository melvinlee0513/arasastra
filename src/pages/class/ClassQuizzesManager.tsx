import { useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Plus,
  RefreshCcw,
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
  QuizManagerRow,
  RESULT_VISIBILITY_LABEL,
  STATUS_LABEL,
  attemptsLock,
  deleteQuizSafe,
  duplicateQuizAsDraft,
  formatDateTime,
  formatDuration,
  formatRelative,
  hideQuizResults,
  listClassQuizzesForManager,
  mapQuizError,
  quizManagerKeys,
  releaseQuizResults,
  setQuizStatus,
} from "@/lib/quizzes";
import { MoreHorizontal, FolderInput } from "lucide-react";
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

export function ClassQuizzesManager({ variant }: Props) {
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const ctx = useClassContext(classId);
  const qc = useQueryClient();
  const { toast } = useToast();

  const basePath =
    variant === "admin"
      ? `/admin/classes/${classId}`
      : `/tutor/classes/${classId}`;
  const materialsPath = `${basePath}/resources`;

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [pendingDelete, setPendingDelete] = useState<QuizManagerRow | null>(null);
  const [pendingArchive, setPendingArchive] = useState<QuizManagerRow | null>(null);
  const [pendingMove, setPendingMove] = useState<MoveTarget | null>(null);

  const canManage = !!ctx.data?.canManage;

  const listQ = useQuery({
    queryKey: quizManagerKeys.list(currentTenantId, classId ?? ""),
    enabled: !!classId && !!user && canManage,
    queryFn: () => listClassQuizzesForManager(classId!),
    staleTime: 15_000,
  });

  // Folder placement lives in the canonical content tree, not the quiz list RPC.
  const treeQ = useQuery({
    queryKey: folderKeys.managerTree(currentTenantId, classId ?? "", user?.id),
    enabled: !!classId && !!user && canManage,
    queryFn: () => fetchManagerContentTree(classId!),
    staleTime: 15_000,
  });

  const folders: ContentFolder[] = treeQ.data?.folders ?? [];
  const folderByQuiz = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const q of treeQ.data?.quizzes ?? []) map.set(q.id, q.folder_id ?? null);
    return map;
  }, [treeQ.data]);

  const folderLabel = (quizId: string): string | null => {
    const folderId = folderByQuiz.get(quizId) ?? null;
    if (!folderId) return null;
    const path = folderPath(folders, folderId);
    return path.length ? path.map((f) => f.name).join(" / ") : null;
  };

  const filtered = useMemo(() => {
    const rows = listQ.data ?? [];
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (q && !r.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [listQ.data, statusFilter, search]);


  const invalidate = () => {
    qc.invalidateQueries({ queryKey: quizManagerKeys.list(currentTenantId, classId ?? "") });
    qc.invalidateQueries({ queryKey: ["class-context", currentTenantId, classId] });
    qc.invalidateQueries({ queryKey: ["tutor-class-home"] });
    // Manager result caches (summary + individual attempt review) must also
    // refresh so lifecycle actions like Release/Hide results appear immediately.
    qc.invalidateQueries({ queryKey: ["quiz-manager", "results"] });
    qc.invalidateQueries({ queryKey: ["quiz-manager", "attempt"] });
    // And the student-facing list/result caches — students should see status
    // changes (release/hide/archive) on next mount without a hard reload.
    qc.invalidateQueries({ queryKey: ["quiz-student"] });
    // Folder placement/counts come from the shared content tree.
    qc.invalidateQueries({ queryKey: ["class-content"] });

  };

  const statusMut = useMutation({
    mutationFn: (v: { id: string; status: "draft" | "published" | "archived" }) =>
      setQuizStatus(v.id, v.status),
    onSuccess: (_data, v) => {
      invalidate();
      toast({ title: v.status === "published" ? "Quiz published" : v.status === "archived" ? "Quiz archived" : "Quiz set to draft" });
    },
    onError: (err) =>
      toast({ title: "Action failed", description: mapQuizError(err), variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteQuizSafe(id),
    onSuccess: (res) => {
      invalidate();
      if (res.deleted) toast({ title: "Quiz deleted" });
      else toast({ title: "Cannot delete", description: res.message ?? "Attempts exist. Archive instead.", variant: "destructive" });
    },
    onError: (err) =>
      toast({ title: "Delete failed", description: mapQuizError(err), variant: "destructive" }),
    onSettled: () => setPendingDelete(null),
  });

  const dupMut = useMutation({
    mutationFn: (id: string) => duplicateQuizAsDraft(id),
    onSuccess: (newId) => {
      invalidate();
      toast({ title: "Duplicated as new draft" });
      navigate(`${basePath}/quizzes/${newId}/edit`);
    },
    onError: (err) =>
      toast({ title: "Duplicate failed", description: mapQuizError(err), variant: "destructive" }),
  });

  const releaseMut = useMutation({
    mutationFn: (v: { id: string; release: boolean }) =>
      v.release ? releaseQuizResults(v.id) : hideQuizResults(v.id),
    onSuccess: (_d, v) => {
      invalidate();
      toast({ title: v.release ? "Results released" : "Results hidden" });
    },
    onError: (err) =>
      toast({ title: "Action failed", description: mapQuizError(err), variant: "destructive" }),
  });

  const breadcrumbs = [
    { label: variant === "admin" ? "Admin" : "Tutor", to: variant === "admin" ? "/admin" : "/tutor" },
    { label: "Classes", to: variant === "admin" ? "/admin/curriculum" : "/tutor/classes" },
    { label: ctx.data?.klass?.title ?? "Class", to: basePath },
    { label: "Quizzes" },
  ];

  const headerRight = (
    <Button
      className="rounded-full"
      onClick={() => navigate(`${basePath}/quizzes/new`)}
      disabled={!canManage}
    >
      <Plus className="w-4 h-4 mr-1.5" />
      New quiz
    </Button>
  );

  return (
    <ClassShell
      data={ctx.data}
      isLoading={ctx.isLoading}
      role={variant}
      section="quizzes"
      basePath={basePath}
      materialsPath={materialsPath}
      breadcrumbs={breadcrumbs}
      headerRight={headerRight}
    >
      {!canManage && !ctx.isLoading ? (
        <TenantEmptyState
          title="Not available"
          body="You don't have permission to manage quizzes for this class."
        />
      ) : (
        <div className="space-y-4">
          {/* Filters */}
          <div className="bg-white border border-slate-200 rounded-3xl p-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search quiz titles…"
                className="h-12 pl-9 rounded-full bg-white border-slate-200 text-[15px]"
              />
            </div>
            <Tabs
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as StatusFilter)}
              className="w-full sm:w-auto"
            >
              {/* Four equal columns so the strip never overflows at 375px, and
                  p-0.5 keeps each trigger at a 44px touch target. */}
              <TabsList className="grid h-12 w-full grid-cols-4 rounded-full p-0.5 sm:w-auto sm:inline-flex">
                {STATUS_FILTERS.map((f) => (
                  <TabsTrigger
                    key={f}
                    value={f}
                    className="h-full rounded-full px-2 text-[12.5px] font-semibold capitalize sm:px-3"
                  >
                    {f === "all" ? "All" : STATUS_LABEL[f as "draft" | "published" | "archived"]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          {/* Body */}
          {listQ.isLoading ? (
            <div className="flex items-center justify-center py-16 text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading quizzes…
            </div>
          ) : listQ.error ? (
            <div className="bg-white border border-red-200 rounded-3xl p-6 text-center">
              <p className="text-sm text-red-600 mb-3">
                Couldn't load quizzes. {mapQuizError(listQ.error)}
              </p>
              <Button variant="outline" onClick={() => listQ.refetch()} className="rounded-full">
                <RefreshCcw className="w-4 h-4 mr-1.5" /> Retry
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <TenantEmptyState
              title={listQ.data?.length ? "No matching quizzes" : "No quizzes yet"}
              body={
                listQ.data?.length
                  ? "Try a different filter or search term."
                  : "Create your first quiz for this class with the New quiz button above."
              }
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map((row) => (
                <QuizCard
                  key={row.id}
                  row={row}
                  onEdit={() => navigate(`${basePath}/quizzes/${row.id}/edit`)}
                  onStatus={(s) => statusMut.mutate({ id: row.id, status: s })}
                  onDelete={() => setPendingDelete(row)}
                  onArchive={() => setPendingArchive(row)}
                  onDuplicate={() => dupMut.mutate(row.id)}
                  onReleaseResults={(release) => releaseMut.mutate({ id: row.id, release })}
                  folderLabel={folderLabel(row.id)}
                  onMove={() =>
                    setPendingMove({
                      kind: "quiz",
                      id: row.id,
                      title: row.title,
                      folderId: folderByQuiz.get(row.id) ?? null,
                    })
                  }

                  busy={
                    statusMut.isPending ||
                    dupMut.isPending ||
                    releaseMut.isPending ||
                    deleteMut.isPending
                  }
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this quiz?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes "{pendingDelete?.title}". Quizzes with student attempts
              cannot be permanently deleted — archive them instead.
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
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this quiz?</AlertDialogTitle>
            <AlertDialogDescription>
              "{pendingArchive?.title}" will be hidden from students but historical attempts and
              results are preserved. You can restore it to draft anytime.
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

function QuizCard({
  row,
  onEdit,
  onStatus,
  onDelete,
  onArchive,
  onDuplicate,
  onReleaseResults,
  folderLabel,
  onMove,
  busy,
}: {
  row: QuizManagerRow;
  onEdit: () => void;
  onStatus: (s: "draft" | "published" | "archived") => void;
  onDelete: () => void;
  onArchive: () => void;
  onDuplicate: () => void;
  onReleaseResults: (release: boolean) => void;
  folderLabel: string | null;
  onMove: () => void;
  busy: boolean;
}) {
  const locked = attemptsLock(row);
  const statusColor =
    row.status === "published"
      ? "bg-emerald-100 text-emerald-700"
      : row.status === "archived"
        ? "bg-slate-200 text-slate-600"
        : "bg-amber-100 text-amber-700";

  return (
    <article className="bg-white border border-slate-200 rounded-3xl p-4 sm:p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {/* The title is the card's primary tap target — opening the builder
              shouldn't require finding the overflow menu on a phone. */}
          <button
            type="button"
            onClick={onEdit}
            className="block w-full min-h-[44px] text-left"
          >
            <h3 className="text-[15px] font-bold leading-tight text-slate-900 break-words">
              {row.title}
            </h3>
            <p className="text-[11.5px] text-slate-500 mt-1">
              Updated {formatRelative(row.updated_at)}
            </p>
          </button>
          <p className="text-[11.5px] text-slate-500 mt-1 inline-flex items-center gap-1 break-words">
            <FolderInput className="w-3 h-3 shrink-0" />
            {folderLabel ?? "Unfiled Materials"}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Badge className={`rounded-full text-[11px] ${statusColor}`}>
            {STATUS_LABEL[row.status]}
          </Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Actions for ${row.title}`}
                className="rounded-full h-11 w-11 shrink-0"
                disabled={busy}
              >
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={onEdit}>
                <Send className="w-4 h-4 mr-2" /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to={`../quizzes/${row.id}/results`} relative="path">
                  <Users className="w-4 h-4 mr-2" /> View results
                </Link>
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
              <DropdownMenuItem onClick={onDuplicate}>
                <Copy className="w-4 h-4 mr-2" /> Duplicate as draft
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onMove}>
                <FolderInput className="w-4 h-4 mr-2" /> Move to folder
              </DropdownMenuItem>
              {row.result_visibility === "manual" && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Manual results</DropdownMenuLabel>
                  {row.results_released_at ? (
                    <DropdownMenuItem onClick={() => onReleaseResults(false)}>
                      <EyeOff className="w-4 h-4 mr-2" /> Hide results
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onClick={() => onReleaseResults(true)}>
                      <Eye className="w-4 h-4 mr-2" /> Release results
                    </DropdownMenuItem>
                  )}
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDelete}
                className="text-red-600 focus:text-red-600"
              >
                <Trash2 className="w-4 h-4 mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {row.description && (
        <p className="text-[13px] leading-snug text-slate-600 line-clamp-2">{row.description}</p>
      )}

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 rounded-2xl bg-slate-50/70 p-3 text-slate-600">
        <Stat label="Questions" value={`${row.question_count}`} />
        <Stat label="Points" value={`${row.total_points}`} />
        <Stat label="Attempts" value={`${row.attempt_limit}`} />
        <Stat label="Time" value={formatDuration(row.time_limit_seconds)} />
        <Stat label="Available" value={formatDateTime(row.available_from)} />
        <Stat label="Due" value={formatDateTime(row.due_at)} />
        <Stat label="Results" value={RESULT_VISIBILITY_LABEL[row.result_visibility]} />
        <Stat
          label="Submissions"
          value={
            <span className="inline-flex items-center gap-1">
              <Users className="w-3 h-3" /> {row.submission_count}
            </span>
          }
        />
      </dl>

      {locked && (
        <div className="text-[11.5px] leading-snug text-amber-800 bg-amber-50 border border-amber-200 rounded-2xl px-3 py-2 flex items-start gap-2">
          <Lock className="w-3 h-3 mt-0.5 shrink-0" />
          Attempts exist — question edits are locked. Duplicate to make changes.
        </div>
      )}
    </article>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="text-[12.5px] font-medium text-slate-800 truncate">{value}</dd>
    </div>
  );
}

export default ClassQuizzesManager;
