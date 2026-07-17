import { Link, useParams } from "react-router-dom";
import { Megaphone, Pin, AlertCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useClassContext } from "@/hooks/useClassContext";
import { useClassAnnouncements, type Announcement } from "@/hooks/useClassAnnouncements";
import { toSafeMessage } from "@/components/common/TenantGate";
import { ClassShell } from "@/components/class/ClassShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function StudentClassAnnouncements() {
  const { classId } = useParams<{ classId: string }>();
  const { user } = useAuth();
  const ctx = useClassContext(classId);
  const canView = !!ctx.data?.canView;
  const q = useClassAnnouncements(classId, canView);

  const basePath = `/dashboard/classes/${classId}`;
  const materialsPath = `${basePath}/materials`;

  const shell = (children: React.ReactNode) => (
    <ClassShell
      data={ctx.data}
      isLoading={ctx.isLoading}
      role="student"
      section="announcements"
      basePath={basePath}
      materialsPath={materialsPath}
      breadcrumbs={[
        { label: "Dashboard", to: "/dashboard" },
        { label: "My Classes", to: "/dashboard/classes" },
        { label: ctx.data?.klass?.title || "Class", to: basePath },
        { label: "Announcements" },
      ]}
    >
      {children}
    </ClassShell>
  );

  if (ctx.isError) return shell(<Msg title="Couldn't load this class" body={toSafeMessage(ctx.error, "Please try again.")} />);
  if (!ctx.isLoading && (!ctx.data?.klass || !ctx.data.sameTenant)) return shell(<Msg title="Class not found" body="This class isn't available for your organisation." />);
  if (!ctx.isLoading && ctx.data && !ctx.data.canView) return shell(<Msg title="Access restricted" body="You're not enrolled in this class." />);

  if (q.isLoading || !user) {
    return shell(<p className="text-sm text-slate-500">Loading announcements…</p>);
  }
  if (q.isError) {
    return shell(
      <div className="bg-white rounded-3xl border border-red-200 p-6 shadow-sm">
        <p className="font-semibold text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> Couldn't load announcements
        </p>
        <p className="text-sm text-slate-600 mt-1">{toSafeMessage(q.error, "Please try again in a moment.")}</p>
        <Button variant="outline" className="mt-3 rounded-full" onClick={() => q.refetch()}>Retry</Button>
      </div>
    );
  }
  const items = q.data || [];
  if (items.length === 0) {
    return shell(
      <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center shadow-sm">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 mx-auto flex items-center justify-center text-primary">
          <Megaphone />
        </div>
        <h3 className="mt-3 font-semibold text-slate-900">No announcements yet</h3>
        <p className="text-sm text-slate-500 mt-1">You'll see class updates from your tutor here.</p>
      </div>
    );
  }

  return shell(
    <ul className="space-y-3">
      {items.map((a) => <AnnouncementCard key={a.id} a={a} />)}
    </ul>
  );
}

function AnnouncementCard({ a }: { a: Announcement }) {
  return (
    <li className={`bg-white rounded-3xl border p-5 sm:p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ${a.is_pinned ? "border-amber-200" : "border-slate-200"}`}>
      <div className="flex flex-wrap items-center gap-2">
        {a.is_pinned && (
          <Badge className="rounded-full bg-amber-100 text-amber-800 hover:bg-amber-100">
            <Pin className="w-3 h-3 mr-1" /> Pinned
          </Badge>
        )}
        <h3 className="font-semibold text-slate-900 text-lg break-words">{a.title}</h3>
      </div>
      <p className="text-xs text-slate-500 mt-1">
        {a.published_at ? new Date(a.published_at).toLocaleString() : new Date(a.created_at).toLocaleString()}
        {a.edited_at && " · edited"}
      </p>
      {a.body && (
        <p className="text-sm text-slate-700 whitespace-pre-wrap mt-3">{a.body}</p>
      )}
    </li>
  );
}

function Msg({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center shadow-sm">
      <h2 className="text-xl font-bold text-slate-900">{title}</h2>
      <p className="text-slate-500 mt-2">{body}</p>
      <Link to="/dashboard/classes" className="text-primary font-semibold mt-4 inline-block">
        ← Back to My Classes
      </Link>
    </div>
  );
}

export default StudentClassAnnouncements;
