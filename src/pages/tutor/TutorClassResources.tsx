import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { showSupabaseError } from "@/lib/supabaseErrors";
import { ResourcePreviewCard } from "@/components/resources/ResourcePreviewCard";
import {
  MAX_PDF_BYTES,
  sanitiseFilename,
  openClassResource,
  splitFilePath,
} from "@/lib/classResources";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import {
  ArrowLeft,
  Plus,
  FileText,
  Trash2,
  Eye,
  EyeOff,
  Upload,
  GripVertical,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
  Check,
  ExternalLink,
  Pencil,
} from "lucide-react";

const ELECTRIC_BLUE = "#0052FF";

type SourceType = "local_upload" | "external_link" | "youtube" | "google_drive" | "onedrive";
type ResourceType = "note" | "video" | "worksheet" | "link";

type Resource = {
  id: string;
  title: string;
  description: string | null;
  resource_type: string;
  source_type: string;
  file_url: string | null;
  file_path: string | null;
  external_url: string | null;
  embed_url: string | null;
  status: string;
  created_at: string;
  published_at: string | null;
  display_order: number | null;
};

type ClassInfo = {
  id: string;
  title: string;
  center_id: string | null;
  subject_id: string | null;
};

const RESOURCE_TABS = [
  { key: "all", label: "All" },
  { key: "note", label: "Notes" },
  { key: "video", label: "Videos" },
  { key: "worksheet", label: "Worksheets" },
  { key: "link", label: "Links" },
] as const;

export default function TutorClassResources() {
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const { currentTenantId } = useTenant();

  const [classInfo, setClassInfo] = useState<ClassInfo | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Resource | null>(null);
  const [tab, setTab] = useState<string>("all");

  // Arrange mode
  const [arrangeMode, setArrangeMode] = useState(false);
  const [draftOrder, setDraftOrder] = useState<Resource[]>([]);
  const [savingOrder, setSavingOrder] = useState(false);

  useEffect(() => {
    if (!classId || !user?.id) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, user?.id]);

  async function load() {
    if (!classId || !user?.id) return;
    setLoading(true);

    const { data: cls } = await supabase
      .from("classes")
      .select("id, title, center_id, subject_id")
      .eq("id", classId)
      .maybeSingle();

    if (!cls) {
      setAllowed(false);
      setLoading(false);
      return;
    }
    setClassInfo(cls as ClassInfo);

    let hasAccess = false;
    if (isAdmin && cls.center_id === currentTenantId) hasAccess = true;
    if (!hasAccess) {
      const { data: assignment } = await supabase
        .from("class_tutors")
        .select("id")
        .eq("class_id", classId)
        .eq("tutor_user_id", user.id)
        .maybeSingle();
      if (assignment) hasAccess = true;
    }
    setAllowed(hasAccess);
    if (!hasAccess) {
      setLoading(false);
      return;
    }

    const { data: res } = await supabase
      .from("class_resources")
      .select(
        "id, title, description, resource_type, source_type, file_url, file_path, external_url, embed_url, status, created_at, published_at, display_order",
      )
      .eq("class_id", classId)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    setResources((res ?? []) as Resource[]);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    if (tab === "all") return resources;
    return resources.filter((r) => r.resource_type === tab);
  }, [resources, tab]);

  async function togglePublish(r: Resource) {
    const next = r.status === "published" ? "draft" : "published";
    const { error } = await supabase
      .from("class_resources")
      .update({
        status: next,
        published_at: next === "published" ? new Date().toISOString() : null,
      })
      .eq("id", r.id);
    if (error) {
      showSupabaseError(error, "Could not update visibility");
      return;
    }
    toast.success(next === "published" ? "Published to students" : "Moved to draft");
    void load();
  }

  async function remove(r: Resource) {
    if (!confirm(`Delete "${r.title}"?`)) return;
    // Try storage cleanup first (best-effort — RLS still enforces access).
    if (r.file_path) {
      const parts = splitFilePath(r.file_path);
      if (parts) {
        await supabase.storage.from(parts.bucket).remove([parts.path]).catch(() => null);
      }
    }
    const { error } = await supabase.from("class_resources").delete().eq("id", r.id);
    if (error) {
      showSupabaseError(error, "Could not delete");
      return;
    }
    toast.success("Deleted");
    void load();
  }

  function enterArrangeMode() {
    setDraftOrder([...resources]);
    setArrangeMode(true);
    setTab("all");
  }

  function cancelArrange() {
    setArrangeMode(false);
    setDraftOrder([]);
  }

  function moveDraft(id: string, dir: -1 | 1) {
    setDraftOrder((prev) => {
      const idx = prev.findIndex((r) => r.id === id);
      const next = idx + dir;
      if (idx < 0 || next < 0 || next >= prev.length) return prev;
      return arrayMove(prev, idx, next);
    });
  }

  async function saveOrder() {
    if (!classId) return;
    setSavingOrder(true);
    const { data, error } = await supabase.rpc("reorder_class_resources", {
      requested_class_id: classId,
      ordered_resource_ids: draftOrder.map((r) => r.id),
    });
    setSavingOrder(false);
    if (error) {
      showSupabaseError(error, "Could not save order");
      return;
    }
    if (!data) {
      toast.error("Order not confirmed by server");
      return;
    }
    toast.success("Order saved");
    setArrangeMode(false);
    setDraftOrder([]);
    void load();
  }

  if (loading || allowed === null) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="p-10 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Not assigned to this class</h1>
        <p className="text-sm text-slate-500 mt-2">
          Ask a centre admin to assign you as a tutor for this class.
        </p>
        <Button asChild variant="outline" className="rounded-full mt-4">
          <Link to="/tutor/classes">Back to classes</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <button
            onClick={() => navigate(-1)}
            className="text-sm text-slate-500 hover:text-slate-800 flex items-center gap-1 mb-2"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">
            {classInfo?.title ?? "Class"}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Attach notes, replay videos, worksheets, and links for enrolled students.
          </p>
        </div>
        <div className="flex gap-2">
          {!arrangeMode ? (
            <>
              <Button
                onClick={enterArrangeMode}
                variant="outline"
                className="rounded-full"
                disabled={resources.length < 2}
              >
                <ArrowUpDown className="h-4 w-4 mr-1" /> Arrange materials
              </Button>
              <Button
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
                className="rounded-full text-white shadow-sm hover:opacity-90"
                style={{ backgroundColor: ELECTRIC_BLUE }}
              >
                <Plus className="h-4 w-4 mr-1" /> Attach material
              </Button>
            </>
          ) : (
            <>
              <Button
                onClick={cancelArrange}
                variant="outline"
                className="rounded-full"
                disabled={savingOrder}
              >
                <X className="h-4 w-4 mr-1" /> Cancel
              </Button>
              <Button
                onClick={saveOrder}
                className="rounded-full text-white"
                style={{ backgroundColor: ELECTRIC_BLUE }}
                disabled={savingOrder}
              >
                <Check className="h-4 w-4 mr-1" />
                {savingOrder ? "Saving…" : "Save order"}
              </Button>
            </>
          )}
        </div>
      </div>

      {arrangeMode ? (
        <ArrangeList
          items={draftOrder}
          onReorder={setDraftOrder}
          onMove={moveDraft}
        />
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="rounded-full bg-slate-100/70 p-1 flex-wrap h-auto">
            {RESOURCE_TABS.map((t) => (
              <TabsTrigger key={t.key} value={t.key} className="rounded-full px-4 text-xs">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value={tab} className="mt-6">
            {filtered.length === 0 ? (
              <Card className="p-12 text-center rounded-3xl bg-white/60 border-slate-200">
                <FileText className="h-10 w-10 mx-auto text-slate-300 mb-3" />
                <p className="font-medium text-slate-900">No materials yet</p>
                <p className="text-sm text-slate-500 mt-1">
                  Attach your first note, video, or link to this class.
                </p>
              </Card>
            ) : (
              <div className="space-y-3">
                {filtered.map((r) => (
                  <ResourcePreviewCard
                    key={r.id}
                    resource={r}
                    role="tutor"
                    actions={
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="rounded-full h-8 w-8 text-slate-500"
                          onClick={async () => {
                            const ok = await openClassResource(r);
                            if (!ok) toast.error("Could not open this file");
                          }}
                          aria-label={`Open ${r.title}`}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="rounded-full h-8 w-8 text-slate-500"
                          onClick={() => {
                            setEditing(r);
                            setFormOpen(true);
                          }}
                          aria-label={`Edit ${r.title}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => togglePublish(r)}
                          className="rounded-full h-8 px-3"
                        >
                          {r.status === "published" ? (
                            <>
                              <EyeOff className="h-3.5 w-3.5 mr-1" /> Unpublish
                            </>
                          ) : (
                            <>
                              <Eye className="h-3.5 w-3.5 mr-1" /> Publish
                            </>
                          )}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => remove(r)}
                          className="rounded-full text-slate-500 hover:text-red-600"
                          aria-label={`Delete ${r.title}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    }
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      {classInfo && currentTenantId && (
        <ResourceFormModal
          open={formOpen}
          onOpenChange={(v) => {
            setFormOpen(v);
            if (!v) setEditing(null);
          }}
          classInfo={classInfo}
          centerId={currentTenantId}
          uploaderId={user!.id}
          existingCount={resources.length}
          editing={editing}
          onSaved={() => {
            setFormOpen(false);
            setEditing(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function ArrangeList({
  items,
  onReorder,
  onMove,
}: {
  items: Resource[];
  onReorder: (next: Resource[]) => void;
  onMove: (id: string, dir: -1 | 1) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = items.findIndex((r) => r.id === active.id);
    const newIdx = items.findIndex((r) => r.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    onReorder(arrayMove(items, oldIdx, newIdx));
  }

  if (items.length === 0) {
    return (
      <Card className="p-8 text-center rounded-3xl bg-white/60 border-slate-200">
        <p className="text-sm text-slate-500">Nothing to arrange.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Drag to reorder, or use the up/down buttons. Save when you're done — students see this exact order.
      </p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {items.map((r, idx) => (
              <SortableRow
                key={r.id}
                r={r}
                canMoveUp={idx > 0}
                canMoveDown={idx < items.length - 1}
                onUp={() => onMove(r.id, -1)}
                onDown={() => onMove(r.id, 1)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortableRow({
  r,
  canMoveUp,
  canMoveDown,
  onUp,
  onDown,
}: {
  r: Resource;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onUp: () => void;
  onDown: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: r.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 20 : "auto",
  };
  return (
    <div ref={setNodeRef} style={style}>
      <ResourcePreviewCard
        resource={r}
        role="tutor"
        dragHandle={
          <button
            type="button"
            aria-label={`Drag ${r.title}`}
            className="self-start sm:self-center shrink-0 mt-1 sm:mt-0 cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-700 p-1 touch-none"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-5 w-5" />
          </button>
        }
        actions={
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="rounded-full h-8 w-8"
              onClick={onUp}
              disabled={!canMoveUp}
              aria-label={`Move ${r.title} up`}
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="rounded-full h-8 w-8"
              onClick={onDown}
              disabled={!canMoveDown}
              aria-label={`Move ${r.title} down`}
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
          </div>
        }
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Create + Edit form                                                  */
/* ------------------------------------------------------------------ */

function validateFile(file: File, type: ResourceType): string | null {
  if (file.size === 0) return "That file is empty";
  if (type === "note" || type === "worksheet") {
    const isPdf = file.type === "application/pdf" && /\.pdf$/i.test(file.name);
    if (!isPdf) return "Only PDF files are supported for notes and worksheets";
    if (file.size > MAX_PDF_BYTES) return "PDF is too large (max 25 MB)";
  }
  return null;
}

function extractYouTubeEmbed(u: string): string | null {
  const m = u.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/);
  return m ? `https://www.youtube.com/embed/${m[1]}` : null;
}

function ResourceFormModal({
  open,
  onOpenChange,
  classInfo,
  centerId,
  uploaderId,
  onSaved,
  existingCount,
  editing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  classInfo: ClassInfo;
  centerId: string;
  uploaderId: string;
  onSaved: () => void;
  existingCount: number;
  editing: Resource | null;
}) {
  const isEdit = !!editing;
  const draftKey = useMemo(() => {
    const mode = isEdit ? `edit:${editing?.id ?? "unknown"}` : "create";
    return `arasa:resource-draft:${uploaderId}:${centerId}:${classInfo.id}:${mode}`;
  }, [isEdit, editing?.id, uploaderId, centerId, classInfo.id]);

  const [source, setSource] = useState<SourceType>("external_link");
  const [type, setType] = useState<ResourceType>("note");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [savedFileName, setSavedFileName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [restoredFromDraft, setRestoredFromDraft] = useState(false);
  // Guards the very first hydration so the debounced writer doesn't clobber
  // the draft with the modal's initial empty defaults.
  const [hydrated, setHydrated] = useState(false);

  // Reset / prefill whenever the modal opens (or editing target changes).
  useEffect(() => {
    if (!open) {
      setHydrated(false);
      setRestoredFromDraft(false);
      return;
    }

    // Seed from the resource being edited (or blank defaults for create).
    let nextSource: SourceType = "external_link";
    let nextType: ResourceType = "note";
    let nextTitle = "";
    let nextDescription = "";
    let nextUrl = "";
    if (editing) {
      nextSource = (editing.source_type as SourceType) || "external_link";
      nextType = (editing.resource_type as ResourceType) || "note";
      nextTitle = editing.title || "";
      nextDescription = editing.description || "";
      nextUrl = editing.external_url || editing.embed_url || "";
    }

    // Then overlay any locally saved draft (per user + centre + class + mode).
    let restored = false;
    let draftFileName: string | null = null;
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(draftKey);
        if (raw) {
          const draft = JSON.parse(raw) as Partial<{
            source: SourceType;
            type: ResourceType;
            title: string;
            description: string;
            url: string;
            fileName: string;
          }>;
          if (draft.source) nextSource = draft.source;
          if (draft.type) nextType = draft.type;
          if (typeof draft.title === "string") nextTitle = draft.title;
          if (typeof draft.description === "string") nextDescription = draft.description;
          if (typeof draft.url === "string") nextUrl = draft.url;
          if (typeof draft.fileName === "string") draftFileName = draft.fileName;
          restored =
            !!draft.title || !!draft.description || !!draft.url || !!draft.fileName;
        }
      } catch (err) {
        console.warn("[resource-draft] could not restore draft", err);
      }
    }

    setSource(nextSource);
    setType(nextType);
    setTitle(nextTitle);
    setDescription(nextDescription);
    setUrl(nextUrl);
    setFile(null);
    setSavedFileName(draftFileName);
    setRestoredFromDraft(restored);
    setHydrated(true);
  }, [open, editing, draftKey]);

  // Debounced local persistence — never store the file bytes themselves.
  useEffect(() => {
    if (!open || !hydrated) return;
    if (typeof window === "undefined") return;
    const handle = window.setTimeout(() => {
      try {
        const payload = {
          source,
          type,
          title,
          description,
          url,
          fileName: file?.name ?? savedFileName ?? null,
        };
        const hasContent =
          !!title.trim() || !!description.trim() || !!url.trim() || !!payload.fileName;
        if (hasContent) {
          window.localStorage.setItem(draftKey, JSON.stringify(payload));
        } else {
          window.localStorage.removeItem(draftKey);
        }
      } catch (err) {
        console.warn("[resource-draft] could not persist draft", err);
      }
    }, 400);
    return () => window.clearTimeout(handle);
  }, [open, hydrated, source, type, title, description, url, file, savedFileName, draftKey]);

  const clearDraft = () => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(draftKey);
    } catch {
      /* ignore */
    }
    setRestoredFromDraft(false);
    setSavedFileName(null);
  };

  const hasExistingFile = isEdit && !!editing?.file_path;
  const needsUrl = source !== "local_upload";
  const needsFile = source === "local_upload" && !hasExistingFile;
  const showFileReselectHint =
    source === "local_upload" && !file && !hasExistingFile && !!savedFileName;

  async function save(publish: boolean) {
    if (!title.trim()) {
      toast.error("Give the material a title");
      return;
    }
    if (needsUrl && !url.trim()) {
      toast.error(source === "youtube" ? "Paste a YouTube URL" : "Paste a link");
      return;
    }
    if (needsFile && !file) {
      toast.error("Choose a file to upload");
      return;
    }
    if (file) {
      const err = validateFile(file, type);
      if (err) {
        toast.error(err);
        return;
      }
    }

    setSaving(true);

    // Track any newly uploaded object so we can clean up on failure.
    let uploadedBucket: string | null = null;
    let uploadedPath: string | null = null;

    try {
      let file_path: string | null = editing?.file_path ?? null;
      let external_url: string | null = editing?.external_url ?? null;
      let embed_url: string | null = editing?.embed_url ?? null;

      // URL-based sources: replace URL/embed. Local file_path becomes null
      // when moving away from a local upload.
      if (source === "youtube") {
        external_url = url.trim();
        embed_url = extractYouTubeEmbed(url.trim());
      } else if (source === "external_link") {
        external_url = url.trim();
        embed_url = null;
      } else if (source === "local_upload") {
        // Ensure valid file source
        if (!file && !hasExistingFile) {
          toast.error("Choose a file to upload");
          setSaving(false);
          return;
        }
        external_url = null;
        embed_url = null;
      }

      // Upload replacement / initial file
      let replacedOldPath: string | null = null;
      let replacedOldBucket: string | null = null;
      if (source === "local_upload" && file) {
        const bucket = type === "video" ? "course-videos" : "notes";
        const resourceId = editing?.id ?? crypto.randomUUID();
        const safeName = sanitiseFilename(file.name);
        const objectPath = `${centerId}/${classInfo.id}/${resourceId}/${safeName}`;
        const { error: upErr } = await supabase.storage
          .from(bucket)
          .upload(objectPath, file, {
            upsert: false,
            contentType: file.type || undefined,
          });
        if (upErr) {
          if (/row-level security|permission/i.test(upErr.message || "")) {
            toast.error("You aren't assigned to this class. Ask your admin to assign you.");
          } else {
            toast.error(`Upload failed: ${upErr.message}`);
          }
          setSaving(false);
          return;
        }
        uploadedBucket = bucket;
        uploadedPath = objectPath;

        // If we're replacing a previously-uploaded file, remember its path
        // for cleanup after the DB write succeeds.
        if (editing?.file_path) {
          const prev = splitFilePath(editing.file_path);
          if (prev) {
            replacedOldBucket = prev.bucket;
            replacedOldPath = prev.path;
          }
        }
        file_path = `${bucket}/${objectPath}`;
      }

      // Final invariant: type/source combination must have a valid source.
      const hasFile = !!file_path;
      const hasUrl = !!(external_url || embed_url);
      if (!hasFile && !hasUrl) {
        toast.error("A source is required (file or URL)");
        if (uploadedBucket && uploadedPath) {
          await supabase.storage.from(uploadedBucket).remove([uploadedPath]).catch(() => null);
        }
        setSaving(false);
        return;
      }
      if (type === "video" && source === "local_upload" && !hasFile) {
        toast.error("Upload a video file");
        setSaving(false);
        return;
      }

      const now = new Date().toISOString();

      if (isEdit && editing) {
        // Determine status: publish action always publishes; otherwise keep
        // existing status.
        const nextStatus = publish ? "published" : editing.status;
        const nextPublishedAt =
          publish && editing.status !== "published"
            ? now
            : editing.published_at;

        const { error } = await supabase
          .from("class_resources")
          .update({
            title: title.trim(),
            description: description.trim() || null,
            resource_type: type,
            source_type: source,
            file_url: null,
            file_path,
            external_url,
            embed_url,
            status: nextStatus,
            published_at: nextStatus === "published" ? nextPublishedAt ?? now : null,
          })
          .eq("id", editing.id);

        if (error) {
          if (uploadedBucket && uploadedPath) {
            await supabase.storage.from(uploadedBucket).remove([uploadedPath]).catch(() => null);
          }
          throw error;
        }

        // Only after DB success, remove the previous file
        if (replacedOldBucket && replacedOldPath) {
          await supabase.storage
            .from(replacedOldBucket)
            .remove([replacedOldPath])
            .catch(() => null);
        }

        toast.success(publish && editing.status !== "published" ? "Published" : "Changes saved");
        clearDraft();
        onSaved();
        return;
      }

      // Create
      const status = publish ? "published" : "draft";
      const { error } = await supabase.from("class_resources").insert({
        center_id: centerId,
        class_id: classInfo.id,
        subject_id: classInfo.subject_id,
        uploaded_by: uploaderId,
        title: title.trim(),
        description: description.trim() || null,
        resource_type: type,
        source_type: source,
        file_url: null,
        file_path,
        external_url,
        embed_url,
        status,
        published_at: publish ? now : null,
        display_order: existingCount + 1,
      });
      if (error) {
        if (uploadedBucket && uploadedPath) {
          await supabase.storage.from(uploadedBucket).remove([uploadedPath]).catch(() => null);
        }
        throw error;
      }

      toast.success(publish ? "Published to students" : "Saved as draft");
      clearDraft();
      onSaved();
    } catch (err: any) {
      showSupabaseError(err, isEdit ? "Could not save changes" : "Could not attach material");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white/95 backdrop-blur-md border-slate-200 rounded-2xl max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit material" : "Attach material"}</DialogTitle>
        </DialogHeader>

        {restoredFromDraft && (
          <div className="rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2 flex items-center justify-between gap-3">
            <span>Restored your unsaved draft.</span>
            <button
              type="button"
              onClick={() => {
                clearDraft();
                setTitle("");
                setDescription("");
                setUrl("");
                setFile(null);
              }}
              className="underline hover:no-underline"
            >
              Discard draft
            </button>
          </div>
        )}

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Material type</label>
              <Select value={type} onValueChange={(v: any) => setType(v)}>
                <SelectTrigger className="rounded-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="note">Note / PDF</SelectItem>
                  <SelectItem value="video">Replay video</SelectItem>
                  <SelectItem value="worksheet">Worksheet</SelectItem>
                  <SelectItem value="link">External link</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Source</label>
              <Select value={source} onValueChange={(v: any) => setSource(v)}>
                <SelectTrigger className="rounded-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="local_upload">Local upload</SelectItem>
                  <SelectItem value="external_link">External link (URL)</SelectItem>
                  <SelectItem value="youtube">YouTube / Vimeo</SelectItem>
                  <SelectItem value="google_drive" disabled>
                    Google Drive (soon)
                  </SelectItem>
                  <SelectItem value="onedrive" disabled>
                    OneDrive (soon)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-500 mb-1 block">Title</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-full"
              placeholder="e.g. Forces & Motion — chapter notes"
            />
          </div>

          <div>
            <label className="text-xs text-slate-500 mb-1 block">Description (optional)</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="rounded-2xl"
              rows={2}
            />
          </div>

          {source === "local_upload" ? (
            <div>
              <label className="text-xs text-slate-500 mb-1 block">
                {hasExistingFile ? "Replace file (optional)" : "File"}
              </label>
              <div className="border border-dashed border-slate-300 rounded-2xl p-4 flex items-center gap-3 bg-slate-50/50">
                <Upload className="h-5 w-5 text-slate-400" />
                <input
                  type="file"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="text-sm text-slate-700 flex-1"
                />
              </div>
              {hasExistingFile && !file && (
                <p className="text-[11px] text-slate-400 mt-1">
                  Current file will be kept unless you choose a new one.
                </p>
              )}
            </div>
          ) : (
            <div>
              <label className="text-xs text-slate-500 mb-1 block">URL</label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="rounded-full"
                placeholder="https://…"
              />
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            type="button"
            variant="ghost"
            className="rounded-full"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          {isEdit ? (
            <>
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                disabled={saving}
                onClick={() => save(false)}
              >
                {saving ? "Saving…" : "Save changes"}
              </Button>
              {editing?.status !== "published" && (
                <Button
                  type="button"
                  disabled={saving}
                  onClick={() => save(true)}
                  className="rounded-full text-white hover:opacity-90"
                  style={{ backgroundColor: ELECTRIC_BLUE }}
                >
                  {saving ? "Saving…" : "Save and publish"}
                </Button>
              )}
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                disabled={saving}
                onClick={() => save(false)}
              >
                {saving ? "Saving…" : "Save as draft"}
              </Button>
              <Button
                type="button"
                disabled={saving}
                onClick={() => save(true)}
                className="rounded-full text-white hover:opacity-90"
                style={{ backgroundColor: ELECTRIC_BLUE }}
              >
                {saving ? "Publishing…" : "Publish now"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
