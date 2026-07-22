import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
import { MoreHorizontal } from "lucide-react";

type Variant = "tutor" | "admin";

const STATUS_FILTERS = ["all", "draft", "published", "archived"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

interface Props {
  variant: Variant;
}

export function ClassQuizzesManager({ variant }: Props) {
  const { classId } = useParams<{ classId: string }>();
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

  const canManage = !!ctx.data?.canManage;

  const listQ = useQuery({
    queryKey: quizManagerKeys.list(currentTenantId, classId ?? ""),
    enabled: !!classId && !!user && canManage,
    queryFn: () => listClassQuizzesForManager(classId!),
    staleTime: 15_000,
  });

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
    onSuccess: () => {
      invalidate();
      toast({ title: "Duplicated as new draft" });
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
    <Button disabled className="rounded-full" title="Full builder ships in the next release">
      <Plus className="w-4 h-4 mr-1.5" />
      New quiz
      <span className="ml-2 text-[10px] uppercase tracking-wide bg-white/20 rounded-full px-1.5 py-0.5">Soon</span>
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
                className="pl-9 rounded-full"
              />
            </div>
            <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <TabsList className="rounded-full">
                {STATUS_FILTERS.map((f) => (
                  <TabsTrigger key={f} value={f} className="rounded-full capitalize">
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
                  : "Once the builder ships you'll be able to create quizzes for this class here."
              }
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map((row) => (
                <QuizCard
                  key={row.id}
                  row={row}
                  onStatus={(s) => statusMut.mutate({ id: row.id, status: s })}
                  onDelete={() => setPendingDelete(row)}
                  onArchive={() => setPendingArchive(row)}
                  onDuplicate={() => dupMut.mutate(row.id)}
                  onReleaseResults={(release) => releaseMut.mutate({ id: row.id, release })}
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
    </ClassShell>
  );
}

function QuizCard({
  row,
  onStatus,
  onDelete,
  onArchive,
  onDuplicate,
  onReleaseResults,
  busy,
}: {
  row: QuizManagerRow;
  onStatus: (s: "draft" | "published" | "archived") => void;
  onDelete: () => void;
  onArchive: () => void;
  onDuplicate: () => void;
  onReleaseResults: (release: boolean) => void;
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
    <article className="bg-white border border-slate-200 rounded-3xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-900 break-words">{row.title}</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Updated {formatRelative(row.updated_at)}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge className={`rounded-full ${statusColor}`}>{STATUS_LABEL[row.status]}</Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="rounded-full h-8 w-8" disabled={busy}>
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
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
        <p className="text-sm text-slate-600 line-clamp-2">{row.description}</p>
      )}

      <dl className="grid grid-cols-2 gap-2 text-xs text-slate-600">
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
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-2xl px-3 py-2 flex items-center gap-2">
          <Lock className="w-3 h-3" />
          Attempts exist — question edits are locked. Duplicate to make changes.
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

export default ClassQuizzesManager;
