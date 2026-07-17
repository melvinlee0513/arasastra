import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Megaphone, Plus, Pin, PinOff, Pencil, Trash2, CheckCircle2, Clock, Archive,
  Send, CalendarClock, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { useClassContext } from "@/hooks/useClassContext";
import {
  useClassAnnouncements,
  type Announcement,
  type AnnouncementStatus,
} from "@/hooks/useClassAnnouncements";
import { toSafeMessage } from "@/components/common/TenantGate";
import { ClassShell } from "@/components/class/ClassShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type EditorState = {
  open: boolean;
  editing: Announcement | null;
  title: string;
  body: string;
  isPinned: boolean;
  publishAt: string;
  expiresAt: string;
};

const emptyEditor: EditorState = {
  open: false,
  editing: null,
  title: "",
  body: "",
  isPinned: false,
  publishAt: "",
  expiresAt: "",
};

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export function TutorClassAnnouncements() {
  const { classId } = useParams<{ classId: string }>();
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const ctx = useClassContext(classId);
  const qc = useQueryClient();

  const canManage = !!ctx.data?.canManage;
  const q = useClassAnnouncements(classId, canManage);
  const [editor, setEditor] = useState<EditorState>(emptyEditor);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["class-announcements", currentTenantId, classId] });
    qc.invalidateQueries({ queryKey: ["class-announcement-latest", currentTenantId, classId] });
  };

  const saveMut = useMutation({
    mutationFn: async (args: { intent: "draft" | "publish" | "schedule"; }) => {
      if (!classId || !user) throw new Error("Not ready");
      const title = editor.title.trim();
      const body = editor.body.trim();
      if (!title) throw new Error("Please enter a title.");
      if (title.length > 200) throw new Error("Title must be 200 characters or fewer.");
      if (body.length > 10000) throw new Error("Body must be 10,000 characters or fewer.");

      let status: AnnouncementStatus = "draft";
      let publish_at: string | null = null;
      if (args.intent === "publish") {
        status = "published";
      } else if (args.intent === "schedule") {
        publish_at = fromLocalInput(editor.publishAt);
        if (!publish_at) throw new Error("Please choose a valid scheduled date/time.");
        if (new Date(publish_at).getTime() <= Date.now()) {
          throw new Error("Scheduled time must be in the future.");
        }
        status = "scheduled";
      }
      const expires_at = fromLocalInput(editor.expiresAt);
      if (expires_at && publish_at && new Date(expires_at) <= new Date(publish_at)) {
        throw new Error("Expiry must be after the scheduled publish time.");
      }

      if (editor.editing) {
        const patch: Partial<Announcement> = {
          title, body,
          is_pinned: editor.isPinned,
          publish_at,
          expires_at,
        };
        // Only change status if user asked for a different intent than draft
        // (avoids demoting an already-published post when they just save edits).
        if (args.intent !== "draft") patch.status = status;
        else if (editor.editing.status === "draft") patch.status = "draft";

        const { error } = await supabase
          .from("class_announcements")
          .update(patch)
          .eq("id", editor.editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("class_announcements")
          .insert({
            class_id: classId,
            center_id: ctx.data!.klass!.center_id!, // trigger will re-affirm
            author_user_id: user.id,
            title, body,
            status,
            is_pinned: editor.isPinned,
            publish_at,
            expires_at,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Announcement saved");
      setEditor(emptyEditor);
      invalidate();
    },
    onError: (e: unknown) => {
      toast.error(toSafeMessage(e, "Couldn't save the announcement."));
    },
  });

  const quickMut = useMutation({
    mutationFn: async (args: { id: string; patch: Partial<Announcement> }) => {
      const { error } = await supabase
        .from("class_announcements")
        .update(args.patch)
        .eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: (e) => toast.error(toSafeMessage(e, "Update failed.")),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("class_announcements").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Deleted");
      setDeleteId(null);
      invalidate();
    },
    onError: (e) => toast.error(toSafeMessage(e, "Couldn't delete.")),
  });

  const items = useMemo(() => q.data || [], [q.data]);

  const basePath = `/tutor/classes/${classId}`;
  const materialsPath = `${basePath}/resources`;

  const shell = (children: React.ReactNode) => (
    <ClassShell
      data={ctx.data}
      isLoading={ctx.isLoading}
      role="tutor"
      section="announcements"
      basePath={basePath}
      materialsPath={materialsPath}
      breadcrumbs={[
        { label: "Tutor", to: "/tutor" },
        { label: "My Classes", to: "/tutor/classes" },
        { label: ctx.data?.klass?.title || "Class", to: basePath },
        { label: "Announcements" },
      ]}
      headerRight={
        canManage ? (
          <Button
            className="rounded-full"
            onClick={() => setEditor({ ...emptyEditor, open: true })}
          >
            <Plus className="w-4 h-4 mr-2" /> New announcement
          </Button>
        ) : undefined
      }
    >
      {children}
    </ClassShell>
  );

  if (ctx.isError) return shell(<Msg title="Couldn't load this class" body={toSafeMessage(ctx.error, "Please try again.")} />);
  if (!ctx.isLoading && (!ctx.data?.klass || !ctx.data.sameTenant)) return shell(<Msg title="Class not found" body="This class isn't available for your organisation." />);
  if (!ctx.isLoading && ctx.data && !ctx.data.canManage) return shell(<Msg title="You're not assigned to this class" body="Only assigned tutors and centre admins can post announcements." />);

  return shell(
    <div className="space-y-4">
      {q.isLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : q.isError ? (
        <div className="bg-white rounded-3xl border border-red-200 p-6 shadow-sm">
          <p className="font-semibold text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> Couldn't load announcements
          </p>
          <p className="text-sm text-slate-600 mt-1">{toSafeMessage(q.error, "Please try again.")}</p>
          <Button variant="outline" className="mt-3 rounded-full" onClick={() => q.refetch()}>Retry</Button>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 mx-auto flex items-center justify-center text-primary">
            <Megaphone />
          </div>
          <h3 className="mt-3 font-semibold text-slate-900">No announcements yet</h3>
          <p className="text-sm text-slate-500 mt-1">Post an update, reminder or resource pointer for your students.</p>
          <Button className="mt-4 rounded-full" onClick={() => setEditor({ ...emptyEditor, open: true })}>
            <Plus className="w-4 h-4 mr-2" /> New announcement
          </Button>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((a) => (
            <li key={a.id} className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-slate-900 break-words">{a.title}</h3>
                    {a.is_pinned && (
                      <Badge className="rounded-full bg-amber-100 text-amber-800 hover:bg-amber-100">
                        <Pin className="w-3 h-3 mr-1" /> Pinned
                      </Badge>
                    )}
                    <StatusBadge a={a} />
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {a.published_at ? `Published ${new Date(a.published_at).toLocaleString()}` :
                      a.publish_at ? `Scheduled for ${new Date(a.publish_at).toLocaleString()}` :
                      `Created ${new Date(a.created_at).toLocaleString()}`}
                    {a.expires_at && ` · Expires ${new Date(a.expires_at).toLocaleString()}`}
                    {a.edited_at && ` · edited`}
                  </p>
                  {a.body && (
                    <p className="text-sm text-slate-700 whitespace-pre-wrap mt-3 line-clamp-4">{a.body}</p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-4">
                <Button size="sm" variant="outline" className="rounded-full"
                  onClick={() => setEditor({
                    open: true,
                    editing: a,
                    title: a.title,
                    body: a.body,
                    isPinned: a.is_pinned,
                    publishAt: toLocalInput(a.publish_at),
                    expiresAt: toLocalInput(a.expires_at),
                  })}
                >
                  <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
                </Button>
                {a.status !== "published" && (
                  <Button size="sm" variant="outline" className="rounded-full"
                    onClick={() => quickMut.mutate({ id: a.id, patch: { status: "published", publish_at: null } })}
                  >
                    <Send className="w-3.5 h-3.5 mr-1" /> Publish now
                  </Button>
                )}
                {a.status === "published" && (
                  <Button size="sm" variant="outline" className="rounded-full"
                    onClick={() => quickMut.mutate({ id: a.id, patch: { status: "archived" } })}
                  >
                    <Archive className="w-3.5 h-3.5 mr-1" /> Unpublish
                  </Button>
                )}
                <Button size="sm" variant="outline" className="rounded-full"
                  onClick={() => quickMut.mutate({ id: a.id, patch: { is_pinned: !a.is_pinned } })}
                >
                  {a.is_pinned
                    ? <><PinOff className="w-3.5 h-3.5 mr-1" /> Unpin</>
                    : <><Pin className="w-3.5 h-3.5 mr-1" /> Pin</>}
                </Button>
                <Button size="sm" variant="ghost" className="rounded-full text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={() => setDeleteId(a.id)}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Editor */}
      <Dialog open={editor.open} onOpenChange={(v) => !v && setEditor(emptyEditor)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editor.editing ? "Edit announcement" : "New announcement"}</DialogTitle>
            <DialogDescription>Plain text with line breaks. No HTML.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="ann-title">Title</Label>
              <Input
                id="ann-title"
                value={editor.title}
                maxLength={200}
                onChange={(e) => setEditor((s) => ({ ...s, title: e.target.value }))}
                placeholder="e.g. Homework due Sunday"
              />
            </div>
            <div>
              <Label htmlFor="ann-body">Body</Label>
              <Textarea
                id="ann-body"
                value={editor.body}
                maxLength={10000}
                onChange={(e) => setEditor((s) => ({ ...s, body: e.target.value }))}
                placeholder="What do students need to know?"
                rows={6}
              />
              <p className="text-xs text-slate-500 mt-1">{editor.body.length} / 10000</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="ann-publish">Schedule (optional)</Label>
                <Input
                  id="ann-publish"
                  type="datetime-local"
                  value={editor.publishAt}
                  onChange={(e) => setEditor((s) => ({ ...s, publishAt: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="ann-expiry">Expires (optional)</Label>
                <Input
                  id="ann-expiry"
                  type="datetime-local"
                  value={editor.expiresAt}
                  onChange={(e) => setEditor((s) => ({ ...s, expiresAt: e.target.value }))}
                />
              </div>
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={editor.isPinned}
                onChange={(e) => setEditor((s) => ({ ...s, isPinned: e.target.checked }))}
              />
              Pin to top
            </label>
          </div>
          <DialogFooter className="flex-wrap gap-2">
            <Button variant="ghost" onClick={() => setEditor(emptyEditor)} disabled={saveMut.isPending}>Cancel</Button>
            <Button variant="outline" onClick={() => saveMut.mutate({ intent: "draft" })} disabled={saveMut.isPending}>
              Save draft
            </Button>
            <Button variant="outline" onClick={() => saveMut.mutate({ intent: "schedule" })} disabled={saveMut.isPending || !editor.publishAt}>
              <CalendarClock className="w-4 h-4 mr-1" /> Schedule
            </Button>
            <Button onClick={() => saveMut.mutate({ intent: "publish" })} disabled={saveMut.isPending}>
              <Send className="w-4 h-4 mr-1" /> Publish now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this announcement?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Students will immediately lose access.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMut.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMut.mutate(deleteId)}
              disabled={deleteMut.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatusBadge({ a }: { a: Announcement }) {
  const now = Date.now();
  const expired = a.expires_at && new Date(a.expires_at).getTime() <= now;
  if (a.status === "draft") {
    return <Badge variant="outline" className="rounded-full"><Pencil className="w-3 h-3 mr-1" /> Draft</Badge>;
  }
  if (a.status === "archived") {
    return <Badge variant="outline" className="rounded-full"><Archive className="w-3 h-3 mr-1" /> Archived</Badge>;
  }
  if (a.status === "scheduled") {
    return <Badge className="rounded-full bg-blue-100 text-blue-700 hover:bg-blue-100"><Clock className="w-3 h-3 mr-1" /> Scheduled</Badge>;
  }
  if (expired) {
    return <Badge variant="outline" className="rounded-full text-slate-500"><Clock className="w-3 h-3 mr-1" /> Expired</Badge>;
  }
  return <Badge className="rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-100"><CheckCircle2 className="w-3 h-3 mr-1" /> Published</Badge>;
}

function Msg({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center shadow-sm">
      <h2 className="text-xl font-bold text-slate-900">{title}</h2>
      <p className="text-slate-500 mt-2">{body}</p>
      <Link to="/tutor/classes" className="text-primary font-semibold mt-4 inline-block">← Back to Classes</Link>
    </div>
  );
}

export default TutorClassAnnouncements;
