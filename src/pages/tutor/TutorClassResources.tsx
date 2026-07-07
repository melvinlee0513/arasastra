import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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

import {
  ArrowLeft,
  Plus,
  FileText,
  Video,
  Link as LinkIcon,
  Trash2,
  Eye,
  EyeOff,
  Upload,
} from "lucide-react";

const ELECTRIC_BLUE = "#0052FF";

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
  const [addOpen, setAddOpen] = useState(false);
  const [tab, setTab] = useState<string>("all");

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

    // Access check: admin in same center, or assigned tutor
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
        "id, title, description, resource_type, source_type, file_url, file_path, external_url, embed_url, status, created_at, published_at",
      )
      .eq("class_id", classId)
      .order("created_at", { ascending: false });
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
    const { error } = await supabase.from("class_resources").delete().eq("id", r.id);
    if (error) {
      toast.error("Could not delete");
      return;
    }
    toast.success("Deleted");
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
      <div className="flex items-start justify-between gap-4">
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
        <Button
          onClick={() => setAddOpen(true)}
          className="rounded-full text-white shadow-sm hover:opacity-90"
          style={{ backgroundColor: ELECTRIC_BLUE }}
        >
          <Plus className="h-4 w-4 mr-1" /> Attach material
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="rounded-full bg-slate-100/70 p-1">
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
                <ResourceRow
                  key={r.id}
                  r={r}
                  onToggle={() => togglePublish(r)}
                  onRemove={() => remove(r)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {classInfo && currentTenantId && (
        <AttachMaterialModal
          open={addOpen}
          onOpenChange={setAddOpen}
          classInfo={classInfo}
          centerId={currentTenantId}
          uploaderId={user!.id}
          onCreated={() => {
            setAddOpen(false);
            void load();
          }}
        />
      )}
    </div>
  );
}

function ResourceRow({
  r,
  onToggle,
  onRemove,
}: {
  r: Resource;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const Icon =
    r.resource_type === "video"
      ? Video
      : r.resource_type === "link"
        ? LinkIcon
        : FileText;
  const url = r.external_url || r.file_url || r.embed_url || "#";
  return (
    <Card className="p-4 rounded-2xl bg-white/70 border-slate-200 flex items-center gap-4">
      <div
        className="h-10 w-10 rounded-xl flex items-center justify-center"
        style={{ backgroundColor: `${ELECTRIC_BLUE}12`, color: ELECTRIC_BLUE }}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold text-slate-900 truncate hover:underline"
          >
            {r.title}
          </a>
          <Badge
            variant="outline"
            className="rounded-full text-[10px] px-2 py-0 border-slate-200 text-slate-500 capitalize"
          >
            {r.resource_type}
          </Badge>
          {r.status === "published" ? (
            <Badge
              className="rounded-full text-[10px] px-2 py-0 border-0"
              style={{ backgroundColor: `${ELECTRIC_BLUE}15`, color: ELECTRIC_BLUE }}
            >
              Published
            </Badge>
          ) : (
            <Badge variant="secondary" className="rounded-full text-[10px] px-2 py-0">
              Draft
            </Badge>
          )}
        </div>
        {r.description && (
          <p className="text-xs text-slate-500 mt-1 line-clamp-2">{r.description}</p>
        )}
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={onToggle}
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
        onClick={onRemove}
        className="rounded-full text-slate-500 hover:text-red-600"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </Card>
  );
}

function AttachMaterialModal({
  open,
  onOpenChange,
  classInfo,
  centerId,
  uploaderId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  classInfo: ClassInfo;
  centerId: string;
  uploaderId: string;
  onCreated: () => void;
}) {
  const [source, setSource] = useState<
    "local_upload" | "external_link" | "youtube" | "google_drive" | "onedrive"
  >("external_link");
  const [type, setType] = useState<"note" | "video" | "worksheet" | "link">("note");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [publishNow, setPublishNow] = useState(true);
  const [saving, setSaving] = useState(false);

  function reset() {
    setSource("external_link");
    setType("note");
    setTitle("");
    setDescription("");
    setUrl("");
    setFile(null);
    setPublishNow(true);
  }

  async function submit() {
    if (!title.trim()) {
      toast.error("Give the material a title");
      return;
    }
    setSaving(true);
    try {
      let file_path: string | null = null;
      let file_url: string | null = null;
      let external_url: string | null = null;
      let embed_url: string | null = null;

      if (source === "local_upload") {
        if (!file) {
          toast.error("Choose a file to upload");
          setSaving(false);
          return;
        }
        const ext = file.name.split(".").pop();
        const bucket = type === "video" ? "course-videos" : "notes";
        const path = `${centerId}/${classInfo.id}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from(bucket)
          .upload(path, file, { upsert: false });
        if (upErr) throw upErr;
        file_path = `${bucket}/${path}`;
        const { data: signed } = await supabase.storage
          .from(bucket)
          .createSignedUrl(path, 60 * 60 * 24 * 365);
        file_url = signed?.signedUrl ?? null;
      } else if (source === "youtube") {
        if (!url.trim()) {
          toast.error("Paste a YouTube URL");
          setSaving(false);
          return;
        }
        external_url = url.trim();
        // Try to derive embed URL
        const m = url.match(/(?:youtu\.be\/|v=)([\w-]{11})/);
        if (m) embed_url = `https://www.youtube.com/embed/${m[1]}`;
      } else {
        if (!url.trim()) {
          toast.error("Paste a link");
          setSaving(false);
          return;
        }
        external_url = url.trim();
      }

      const { error } = await supabase.from("class_resources").insert({
        center_id: centerId,
        class_id: classInfo.id,
        subject_id: classInfo.subject_id,
        uploaded_by: uploaderId,
        title: title.trim(),
        description: description.trim() || null,
        resource_type: type,
        source_type: source,
        file_url,
        file_path,
        external_url,
        embed_url,
        status: publishNow ? "published" : "draft",
        published_at: publishNow ? new Date().toISOString() : null,
      });
      if (error) throw error;

      toast.success("Material attached");
      reset();
      onCreated();
    } catch (err: any) {
      toast.error(err?.message ?? "Could not attach material");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white/95 backdrop-blur-md border-slate-200 rounded-2xl max-w-lg">
        <DialogHeader>
          <DialogTitle>Attach material</DialogTitle>
        </DialogHeader>

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
              <label className="text-xs text-slate-500 mb-1 block">File</label>
              <div className="border border-dashed border-slate-300 rounded-2xl p-4 flex items-center gap-3 bg-slate-50/50">
                <Upload className="h-5 w-5 text-slate-400" />
                <input
                  type="file"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="text-sm text-slate-700 flex-1"
                />
              </div>
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

          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={publishNow}
              onChange={(e) => setPublishNow(e.target.checked)}
              className="rounded"
            />
            Publish to enrolled students immediately
          </label>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={saving}
            onClick={submit}
            className="rounded-full text-white hover:opacity-90"
            style={{ backgroundColor: ELECTRIC_BLUE }}
          >
            {saving ? "Attaching…" : "Attach"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
