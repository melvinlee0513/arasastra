import { useState, useCallback, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Video,
  UploadCloud,
  Link as LinkIcon,
  PlayCircle,
  Trash2,
  ExternalLink,
  Search,
  FileVideo,
  Loader2,
  CheckCircle2,
  Pencil,
  Eye,
  EyeOff,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type SourceType = "upload" | "youtube" | "zoom";

interface VideoResource {
  id: string;
  title: string;
  description: string | null;
  course_module: string | null;
  source_type: SourceType;
  video_url: string;
  youtube_id: string | null;
  thumbnail_url: string | null;
  file_size: number | null;
  duration_seconds: number | null;
  is_published: boolean;
  created_by: string;
  created_at: string;
}

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB
const ACCEPTED_FORMATS = ["video/mp4", "video/webm", "video/quicktime", "video/x-matroska"];

// ---------- helpers ----------
function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1).split("/")[0] || null;
    if (u.hostname.includes("youtube.com")) {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      const parts = u.pathname.split("/").filter(Boolean);
      const idx = parts.findIndex((p) => ["embed", "shorts", "live", "v"].includes(p));
      if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
    }
    return null;
  } catch {
    return null;
  }
}

function isZoomUrl(url: string): boolean {
  try {
    return new URL(url).hostname.includes("zoom.");
  } catch {
    return false;
  }
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(1)} ${units[i]}`;
}

// ---------- Video Player Card ----------
function VideoPlayerCard({
  video,
  onDelete,
  onEdit,
  onTogglePublish,
}: {
  video: VideoResource;
  onDelete: (v: VideoResource) => void;
  onEdit: (v: VideoResource) => void;
  onTogglePublish: (v: VideoResource) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const thumb =
    video.thumbnail_url ||
    (video.youtube_id ? `https://img.youtube.com/vi/${video.youtube_id}/hqdefault.jpg` : null);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className="bg-white rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col"
    >
      <div className="relative aspect-video bg-gradient-to-br from-slate-100 to-slate-200 overflow-hidden">
        {playing && video.source_type === "youtube" && video.youtube_id ? (
          <iframe
            className="w-full h-full"
            src={`https://www.youtube.com/embed/${video.youtube_id}?autoplay=1&rel=0`}
            title={video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : playing && video.source_type === "upload" ? (
          <video src={video.video_url} controls autoPlay className="w-full h-full object-contain bg-black" />
        ) : (
          <>
            {thumb ? (
              <img src={thumb} alt={video.title} className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <FileVideo className="w-12 h-12 text-slate-400" />
              </div>
            )}
            {video.source_type === "zoom" ? (
              <a
                href={video.video_url}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors group"
              >
                <span className="flex items-center gap-2 bg-white/95 backdrop-blur rounded-full px-5 py-2.5 font-semibold text-slate-900 shadow-md group-hover:scale-105 transition-transform">
                  <ExternalLink className="w-4 h-4" />
                  Open in Zoom
                </span>
              </a>
            ) : (
              <button
                onClick={() => setPlaying(true)}
                className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors group"
                aria-label="Play video"
              >
                <PlayCircle className="w-16 h-16 text-white drop-shadow-lg group-hover:scale-110 transition-transform" />
              </button>
            )}
          </>
        )}
        <span className="absolute top-3 left-3 text-xs font-semibold px-3 py-1 rounded-full bg-white/95 backdrop-blur text-slate-700 capitalize shadow-sm">
          {video.source_type}
        </span>
        <span
          className={cn(
            "absolute top-3 right-3 text-xs font-semibold px-3 py-1 rounded-full backdrop-blur shadow-sm flex items-center gap-1.5",
            video.is_published
              ? "bg-emerald-500/95 text-white"
              : "bg-slate-700/90 text-white",
          )}
        >
          {video.is_published ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
          {video.is_published ? "Published" : "Draft"}
        </span>
      </div>

      <div className="p-5 flex-1 flex flex-col gap-2">
        <h3 className="font-semibold text-slate-900 line-clamp-1">{video.title}</h3>
        {video.course_module && (
          <p className="text-xs font-medium text-primary">{video.course_module}</p>
        )}
        {video.description && (
          <p className="text-sm text-slate-600 line-clamp-2">{video.description}</p>
        )}
        <div className="flex items-center justify-between pt-3 mt-auto border-t border-slate-100">
          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
            <Switch
              checked={video.is_published}
              onCheckedChange={() => onTogglePublish(video)}
              aria-label="Toggle published"
            />
            <span className="font-medium">{video.is_published ? "Live" : "Hidden"}</span>
          </label>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onEdit(video)}
              className="text-slate-400 hover:text-primary transition-colors p-1.5 rounded-full hover:bg-primary/10"
              aria-label="Edit video"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={() => onDelete(video)}
              className="text-slate-400 hover:text-destructive transition-colors p-1.5 rounded-full hover:bg-destructive/10"
              aria-label="Delete video"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ---------- Edit Dialog ----------
function VideoEditDialog({
  video,
  onClose,
  onSaved,
}: {
  video: VideoResource | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [courseModule, setCourseModule] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  // sync incoming video into form
  useMemo(() => {
    if (video) {
      setTitle(video.title);
      setCourseModule(video.course_module ?? "");
      setDescription(video.description ?? "");
    }
  }, [video]);

  const handleSave = async () => {
    if (!video) return;
    if (!title.trim()) {
      toast({ title: "Title required", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await (supabase as any)
      .from("video_resources")
      .update({
        title: title.trim(),
        course_module: courseModule.trim() || null,
        description: description.trim() || null,
      })
      .eq("id", video.id);
    setSaving(false);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "✅ Updated", description: "Video metadata saved." });
    onSaved();
    onClose();
  };

  return (
    <Dialog open={!!video} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="rounded-3xl max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-5 h-5 text-primary" />
            Edit Video Details
          </DialogTitle>
          <DialogDescription>Update the title, module, or description.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} />
          </div>
          <div className="space-y-1.5">
            <Label>Course / Module</Label>
            <Input value={courseModule} onChange={(e) => setCourseModule(e.target.value)} maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={500} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="rounded-full" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button className="rounded-full" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Uploader Modal ----------
function VideoUploaderModal({
  open,
  onOpenChange,
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onUploaded: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [courseModule, setCourseModule] = useState("");
  const [description, setDescription] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setTitle("");
    setCourseModule("");
    setDescription("");
    setProgress(0);
    setUploading(false);
  };

  const handleFile = (f: File | null) => {
    if (!f) return;
    if (!ACCEPTED_FORMATS.includes(f.type) && !f.name.match(/\.(mp4|webm|mov|mkv)$/i)) {
      toast({ title: "Unsupported format", description: "Use MP4, WebM, MOV, or MKV.", variant: "destructive" });
      return;
    }
    if (f.size > MAX_FILE_SIZE) {
      toast({ title: "File too large", description: "Maximum size is 500 MB.", variant: "destructive" });
      return;
    }
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
  };

  const handleUpload = async () => {
    if (!file || !user || !title.trim()) {
      toast({ title: "Missing info", description: "Add a title and select a file.", variant: "destructive" });
      return;
    }
    setUploading(true);
    setProgress(5);
    try {
      const ext = file.name.split(".").pop();
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

      // Simulated progress (Supabase JS v2 doesn't expose granular progress without resumable uploads)
      const ticker = setInterval(() => setProgress((p) => Math.min(p + 7, 90)), 400);

      const { error: upErr } = await supabase.storage.from("course-videos").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });
      clearInterval(ticker);
      if (upErr) throw upErr;
      setProgress(95);

      const { data: signed } = await supabase.storage
        .from("course-videos")
        .createSignedUrl(path, 60 * 60 * 24 * 365);

      const { error: insErr } = await (supabase as any).from("video_resources").insert({
        title: title.trim(),
        description: description.trim() || null,
        course_module: courseModule.trim() || null,
        source_type: "upload",
        video_url: signed?.signedUrl || path,
        file_size: file.size,
        created_by: user.id,
      });
      if (insErr) throw insErr;

      setProgress(100);
      toast({ title: "✅ Uploaded", description: "Your video is now in the library." });
      onUploaded();
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!uploading) { onOpenChange(v); if (!v) reset(); } }}>
      <DialogContent className="rounded-3xl max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UploadCloud className="w-5 h-5 text-primary" />
            Upload Video File
          </DialogTitle>
          <DialogDescription>MP4, WebM, MOV or MKV — up to 500 MB.</DialogDescription>
        </DialogHeader>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFile(e.dataTransfer.files?.[0] || null);
          }}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all",
            dragOver ? "border-primary bg-primary/5" : "border-slate-200 hover:border-primary/50 hover:bg-slate-50",
            file && "border-primary/40 bg-primary/5",
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept="video/mp4,video/webm,video/quicktime,video/x-matroska"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] || null)}
          />
          {file ? (
            <div className="flex flex-col items-center gap-2">
              <CheckCircle2 className="w-10 h-10 text-primary" />
              <p className="font-semibold text-slate-900">{file.name}</p>
              <p className="text-xs text-slate-500">{formatBytes(file.size)}</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <UploadCloud className="w-10 h-10 text-slate-400" />
              <p className="font-semibold text-slate-700">Drop your video here, or click to browse</p>
              <p className="text-xs text-slate-500">Max 500 MB · MP4 / WebM / MOV / MKV</p>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Video Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Lecture 3 — Stress & Strain" maxLength={150} />
          </div>
          <div className="space-y-1.5">
            <Label>Associated Course / Module</Label>
            <Input value={courseModule} onChange={(e) => setCourseModule(e.target.value)} placeholder="Mechanics of Materials" maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={500} placeholder="Brief summary…" />
          </div>
        </div>

        {uploading && (
          <div className="space-y-2">
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-slate-500 text-center">Uploading… {progress}%</p>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" className="rounded-full" disabled={uploading} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="rounded-full" onClick={handleUpload} disabled={uploading || !file}>
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
            Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Link Embed Form ----------
function VideoLinkInput({ onCreated }: { onCreated: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [courseModule, setCourseModule] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const detected = useMemo(() => {
    const yt = extractYouTubeId(url);
    if (yt) return { type: "youtube" as const, id: yt };
    if (isZoomUrl(url)) return { type: "zoom" as const, id: null };
    return null;
  }, [url]);

  const handleSubmit = async () => {
    if (!user) return;
    if (!title.trim() || !url.trim()) {
      toast({ title: "Missing info", description: "Title and URL are required.", variant: "destructive" });
      return;
    }
    if (!detected) {
      toast({ title: "Invalid link", description: "Paste a valid YouTube or Zoom URL.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await (supabase as any).from("video_resources").insert({
        title: title.trim(),
        description: description.trim() || null,
        course_module: courseModule.trim() || null,
        source_type: detected.type,
        video_url: url.trim(),
        youtube_id: detected.id,
        thumbnail_url: detected.id ? `https://img.youtube.com/vi/${detected.id}/hqdefault.jpg` : null,
        created_by: user.id,
      });
      if (error) throw error;
      toast({ title: "✅ Resource added", description: "Video is live in your library." });
      setUrl(""); setTitle(""); setCourseModule(""); setDescription("");
      onCreated();
    } catch (e: any) {
      toast({ title: "Failed to add", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 md:p-8 space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
          <LinkIcon className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="font-semibold text-slate-900">Embed a video link</h2>
          <p className="text-sm text-slate-500">Paste a YouTube (public, unlisted, or private with link) or Zoom recording URL.</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Video URL *</Label>
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://youtu.be/… or https://zoom.us/rec/…"
          className="rounded-xl"
        />
        {url && (
          <p className={cn("text-xs font-medium", detected ? "text-emerald-600" : "text-amber-600")}>
            {detected
              ? detected.type === "youtube"
                ? `✓ YouTube video detected — will embed inline (ID: ${detected.id})`
                : "✓ Zoom recording detected — opens securely in a new tab"
              : "⚠ Enter a valid YouTube or Zoom link"}
          </p>
        )}
      </div>

      {detected?.type === "youtube" && (
        <div className="rounded-2xl overflow-hidden border border-slate-200 aspect-video bg-slate-100">
          <iframe
            className="w-full h-full"
            src={`https://www.youtube.com/embed/${detected.id}?rel=0`}
            title="Preview"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Video Title *</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Week 4 Live Session" maxLength={150} className="rounded-xl" />
        </div>
        <div className="space-y-1.5">
          <Label>Course / Module</Label>
          <Input value={courseModule} onChange={(e) => setCourseModule(e.target.value)} placeholder="Calculus 101" maxLength={120} className="rounded-xl" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Description</Label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={500} placeholder="What's covered in this video?" className="rounded-xl" />
      </div>

      <div className="flex justify-end pt-2">
        <Button onClick={handleSubmit} disabled={submitting || !url || !title} className="rounded-full px-8">
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <LinkIcon className="w-4 h-4" />}
          Add to Library
        </Button>
      </div>
    </div>
  );
}

// ---------- Main Page ----------
export function TutorVideos() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState("library");
  const [addMode, setAddMode] = useState<"upload" | "embed">("embed");
  const [uploaderOpen, setUploaderOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [editing, setEditing] = useState<VideoResource | null>(null);
  const [pendingDelete, setPendingDelete] = useState<VideoResource | null>(null);

  const { data: videos, isLoading } = useQuery({
    queryKey: ["video_resources"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("video_resources")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as VideoResource[];
    },
    staleTime: 60_000,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("video_resources").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Removed", description: "Video deleted from library." });
      queryClient.invalidateQueries({ queryKey: ["video_resources"] });
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const publishMutation = useMutation({
    mutationFn: async (v: VideoResource) => {
      const { error } = await (supabase as any)
        .from("video_resources")
        .update({ is_published: !v.is_published })
        .eq("id", v.id);
      if (error) throw error;
      return !v.is_published;
    },
    onSuccess: (nowPublished) => {
      toast({
        title: nowPublished ? "✅ Published" : "Unpublished",
        description: nowPublished ? "Visible to students." : "Hidden from students.",
      });
      queryClient.invalidateQueries({ queryKey: ["video_resources"] });
    },
    onError: (e: any) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["video_resources"] });
  }, [queryClient]);

  const moduleOptions = useMemo(() => {
    const set = new Set<string>();
    (videos || []).forEach((v) => v.course_module && set.add(v.course_module));
    return Array.from(set).sort();
  }, [videos]);

  const filtered = useMemo(() => {
    if (!videos) return [];
    const q = search.trim().toLowerCase();
    return videos.filter((v) => {
      if (sourceFilter !== "all" && v.source_type !== sourceFilter) return false;
      if (moduleFilter !== "all" && v.course_module !== moduleFilter) return false;
      if (statusFilter === "published" && !v.is_published) return false;
      if (statusFilter === "draft" && v.is_published) return false;
      if (!q) return true;
      return (
        v.title.toLowerCase().includes(q) ||
        v.course_module?.toLowerCase().includes(q) ||
        v.description?.toLowerCase().includes(q)
      );
    });
  }, [videos, search, sourceFilter, moduleFilter, statusFilter]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto p-6 md:p-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Video className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Video Library</h1>
              <p className="text-sm text-slate-500">Upload, embed, and manage your course videos.</p>
            </div>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="bg-white border border-slate-200 rounded-full p-1 h-auto shadow-sm">
            <TabsTrigger value="library" className="rounded-full px-5 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">
              <PlayCircle className="w-4 h-4 mr-2" />
              Video Library
            </TabsTrigger>
            <TabsTrigger value="add" className="rounded-full px-5 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">
              <UploadCloud className="w-4 h-4 mr-2" />
              Add New Resource
            </TabsTrigger>
          </TabsList>

          <TabsContent value="library" className="mt-6 space-y-5">
            <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by title, module, or description…"
                  className="pl-11 rounded-full bg-white border-slate-200"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Select value={moduleFilter} onValueChange={setModuleFilter}>
                  <SelectTrigger className="rounded-full bg-white border-slate-200 w-[180px]">
                    <SelectValue placeholder="Course / Module" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All modules</SelectItem>
                    {moduleOptions.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={sourceFilter} onValueChange={setSourceFilter}>
                  <SelectTrigger className="rounded-full bg-white border-slate-200 w-[160px]">
                    <SelectValue placeholder="Source" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sources</SelectItem>
                    <SelectItem value="upload">Uploaded file</SelectItem>
                    <SelectItem value="youtube">YouTube</SelectItem>
                    <SelectItem value="zoom">Zoom</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="rounded-full bg-white border-slate-200 w-[150px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All status</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
                    <Skeleton className="aspect-video w-full" />
                    <div className="p-5 space-y-2">
                      <Skeleton className="h-5 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="bg-slate-50 border border-dashed border-slate-200 rounded-3xl py-16 text-center">
                <FileVideo className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="font-semibold text-slate-700">No videos match your filters</p>
                <p className="text-sm text-slate-500 mb-5">Try clearing filters or add a new video.</p>
                <Button onClick={() => setTab("add")} className="rounded-full">
                  <UploadCloud className="w-4 h-4" />
                  Add a video
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                <AnimatePresence>
                  {filtered.map((v) => (
                    <VideoPlayerCard
                      key={v.id}
                      video={v}
                      onDelete={(vid) => setPendingDelete(vid)}
                      onEdit={(vid) => setEditing(vid)}
                      onTogglePublish={(vid) => publishMutation.mutate(vid)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </TabsContent>


          <TabsContent value="add" className="mt-6 space-y-6">
            <div className="inline-flex bg-white border border-slate-200 rounded-full p-1 shadow-sm">
              <button
                onClick={() => setAddMode("embed")}
                className={cn(
                  "px-5 py-2 rounded-full text-sm font-semibold transition-all flex items-center gap-2",
                  addMode === "embed" ? "bg-primary text-primary-foreground shadow-sm" : "text-slate-600 hover:text-slate-900",
                )}
              >
                <LinkIcon className="w-4 h-4" /> Embed Link
              </button>
              <button
                onClick={() => setAddMode("upload")}
                className={cn(
                  "px-5 py-2 rounded-full text-sm font-semibold transition-all flex items-center gap-2",
                  addMode === "upload" ? "bg-primary text-primary-foreground shadow-sm" : "text-slate-600 hover:text-slate-900",
                )}
              >
                <UploadCloud className="w-4 h-4" /> Upload File
              </button>
            </div>

            {addMode === "embed" ? (
              <VideoLinkInput onCreated={refresh} />
            ) : (
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 max-w-3xl text-center space-y-4">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center">
                  <UploadCloud className="w-7 h-7 text-primary" />
                </div>
                <div>
                  <h2 className="font-semibold text-slate-900 text-lg">Upload a video file</h2>
                  <p className="text-sm text-slate-500">Stored securely in your private Lovable Cloud bucket.</p>
                </div>
                <Button onClick={() => setUploaderOpen(true)} className="rounded-full px-8">
                  <UploadCloud className="w-4 h-4" /> Open Uploader
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <VideoUploaderModal open={uploaderOpen} onOpenChange={setUploaderOpen} onUploaded={refresh} />
      <VideoEditDialog video={editing} onClose={() => setEditing(null)} onSaved={refresh} />
      <AlertDialog open={!!pendingDelete} onOpenChange={(v) => !v && setPendingDelete(null)}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this video?</AlertDialogTitle>
            <AlertDialogDescription>
              "{pendingDelete?.title}" will be permanently removed from the library. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-full bg-destructive hover:bg-destructive/90"
              onClick={() => {
                if (pendingDelete) deleteMutation.mutate(pendingDelete.id);
                setPendingDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default TutorVideos;
