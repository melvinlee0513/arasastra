import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Video, FileText, ClipboardList, Plus, Layers, PencilLine,
  Users, CheckCircle2, ArrowRight, Megaphone, Pin,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toSafeMessage } from "@/components/common/TenantGate";
import { ClassShell } from "@/components/class/ClassShell";
import { useClassContext } from "@/hooks/useClassContext";
import { useLatestClassAnnouncement } from "@/hooks/useClassAnnouncements";

type ResourceRow = {
  id: string; title: string; resource_type: string; status: string;
  published_at: string | null; created_at: string;
};
type QuizRow = { id: string; title: string; status: string; total_points: number };

export function TutorClassHome() {
  const { classId } = useParams<{ classId: string }>();
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const ctx = useClassContext(classId);
  const latestAnnQ = useLatestClassAnnouncement(classId, !!ctx.data?.canManage);


  const data = useQuery({
    queryKey: ["tutor-class-home", currentTenantId, classId, user?.id],
    enabled: !!classId && !!user && !!ctx.data?.canManage,
    queryFn: async () => {
      const [{ count: studentCount }, { data: resources }, { data: quizzes }] = await Promise.all([
        supabase
          .from("class_enrollments")
          .select("id", { count: "exact", head: true })
          .eq("class_id", classId!)
          .eq("status", "active"),
        supabase
          .from("class_resources")
          .select("id,title,resource_type,status,published_at,created_at")
          .eq("class_id", classId!)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("quizzes")
          .select("id,title,status,total_points")
          .eq("class_id", classId!)
          .order("created_at", { ascending: false }),
      ]);
      return {
        studentCount: studentCount ?? 0,
        resources: (resources || []) as ResourceRow[],
        quizzes: (quizzes || []) as QuizRow[],
      };
    },
  });

  const basePath = `/tutor/classes/${classId}`;
  const materialsPath = `${basePath}/resources`;

  const shell = (children: React.ReactNode) => (
    <ClassShell
      data={ctx.data}
      isLoading={ctx.isLoading}
      role="tutor"
      section="home"
      basePath={basePath}
      materialsPath={materialsPath}
      breadcrumbs={[
        { label: "Tutor", to: "/tutor" },
        { label: "My Classes", to: "/tutor/classes" },
        { label: ctx.data?.klass?.title || "Class" },
      ]}
    >
      {children}
    </ClassShell>
  );

  if (ctx.isError) return shell(<Msg title="Couldn't load this class" body={toSafeMessage(ctx.error, "Please try again.")} />);
  if (!ctx.isLoading && (!ctx.data?.klass || !ctx.data.sameTenant)) return shell(<Msg title="Class not found" body="This class isn't available for your organisation." />);
  if (!ctx.isLoading && ctx.data && !ctx.data.canManage) return shell(<Msg title="You're not assigned to this class" body="Only assigned tutors and centre admins can manage this classroom." />);

  const d = data.data;
  const drafts = d ? d.resources.filter((r) => r.status === "draft").length : 0;
  const published = d ? d.resources.filter((r) => r.status === "published").length : 0;
  const recent = d ? d.resources.slice(0, 6) : [];

  return shell(
    <div className="space-y-5">
      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3">
        <Button asChild className="rounded-full h-11 justify-center">
          <Link to={materialsPath}><Plus className="w-4 h-4 mr-2" /> Add Material</Link>
        </Button>
        <Button asChild variant="outline" className="rounded-full h-11 justify-center">
          <Link to={materialsPath}><Layers className="w-4 h-4 mr-2" /> Arrange</Link>
        </Button>
        <Button asChild variant="outline" className="rounded-full h-11 justify-center">
          <Link to={`${basePath}/about`}><PencilLine className="w-4 h-4 mr-2" /> Edit About</Link>
        </Button>
        <Button asChild variant="outline" className="rounded-full h-11 justify-center">
          <Link to={`${basePath}/announcements`}><Megaphone className="w-4 h-4 mr-2" /> Announcements</Link>
        </Button>
        <Button asChild variant="outline" className="rounded-full h-11 justify-center">
          <Link to={`${basePath}/students`}><Users className="w-4 h-4 mr-2" /> View students</Link>
        </Button>
      </div>


      {/* Latest announcement */}
      {latestAnnQ.data && (
        <section className={`rounded-3xl border p-5 sm:p-6 shadow-sm ${latestAnnQ.data.is_pinned ? "bg-amber-50 border-amber-200" : "bg-white border-slate-200"}`}>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-primary" /> Latest announcement
            </h3>
            <Button asChild variant="ghost" size="sm" className="text-primary">
              <Link to={`${basePath}/announcements`}>Manage <ArrowRight className="w-3.5 h-3.5 ml-1" /></Link>
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {latestAnnQ.data.is_pinned && (
              <Badge className="rounded-full bg-amber-100 text-amber-800 hover:bg-amber-100">
                <Pin className="w-3 h-3 mr-1" /> Pinned
              </Badge>
            )}
            <p className="font-semibold text-slate-900 break-words">{latestAnnQ.data.title}</p>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {new Date(latestAnnQ.data.published_at || latestAnnQ.data.created_at).toLocaleString()}
            {latestAnnQ.data.edited_at && " · edited"}
          </p>
          {latestAnnQ.data.body && (
            <p className="text-sm text-slate-700 whitespace-pre-wrap mt-3 line-clamp-3">{latestAnnQ.data.body}</p>
          )}
        </section>
      )}


      {/* Stats */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard label="Students" value={d?.studentCount ?? "—"} sub="active enrolments" />
        <StatCard label="Published" value={published} sub="resources" />
        <StatCard label="Drafts" value={drafts} sub="not yet visible" tone={drafts > 0 ? "warn" : "default"} />
        <StatCard label="Quizzes" value={d?.quizzes.length ?? "—"} sub="total in class" />
      </div>

      {/* Recent content */}
      <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-900">Recent content</h3>
          <Button asChild variant="ghost" size="sm" className="text-primary">
            <Link to={materialsPath}>Manage <ArrowRight className="w-3.5 h-3.5 ml-1" /></Link>
          </Button>
        </div>
        {data.isLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : recent.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-6">No resources yet. Add your first material to get started.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {recent.map((item) => (
              <li key={item.id} className="py-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">
                  {item.resource_type === "video" || item.resource_type === "replay" ? <Video className="w-4 h-4" /> :
                   item.resource_type === "worksheet" ? <ClipboardList className="w-4 h-4" /> :
                   <FileText className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 text-sm truncate">{item.title}</p>
                  <p className="text-xs text-slate-500 capitalize">{item.resource_type}</p>
                </div>
                {item.status === "published"
                  ? <Badge className="rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-100"><CheckCircle2 className="w-3 h-3 mr-1" /> Published</Badge>
                  : <Badge variant="outline" className="rounded-full"><PencilLine className="w-3 h-3 mr-1" /> Draft</Badge>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Roster peek */}
      <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" /> Students
          </h3>
          <Button asChild variant="ghost" size="sm" className="text-primary">
            <Link to="/tutor/students">Open roster <ExternalLink className="w-3.5 h-3.5 ml-1" /></Link>
          </Button>
        </div>
        <p className="text-sm text-slate-500 mt-2">
          {d?.studentCount ?? 0} active enrolments in this class.
        </p>
      </section>
    </div>
  );
}

function StatCard({
  label, value, sub, tone = "default",
}: { label: string; value: string | number; sub?: string; tone?: "default" | "warn" }) {
  return (
    <div className={`rounded-3xl border p-4 sm:p-5 shadow-sm ${tone === "warn" ? "bg-amber-50 border-amber-200" : "bg-white border-slate-200"}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-2xl font-bold text-slate-900 mt-2">{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  );
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

export default TutorClassHome;
