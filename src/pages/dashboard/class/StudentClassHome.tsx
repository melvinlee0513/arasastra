import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Video, FileText, ClipboardList, ExternalLink, HelpCircle, Layers,
  ArrowRight, Info, Calendar, User, BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useClassContext } from "@/hooks/useClassContext";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { toSafeMessage } from "@/components/common/TenantGate";
import { ClassShell } from "@/components/class/ClassShell";
import { ResourcePreviewCard } from "@/components/resources/ResourcePreviewCard";
import { hasValidSource, openClassResource } from "@/lib/classResources";
import { useLatestClassAnnouncement } from "@/hooks/useClassAnnouncements";
import { Megaphone, Pin } from "lucide-react";
import { toast } from "sonner";

type ResourceRow = {
  id: string;
  title: string;
  description: string | null;
  resource_type: string;
  source_type: string;
  file_url: string | null;
  file_path: string | null;
  external_url: string | null;
  embed_url: string | null;
  thumbnail_path: string | null;
  published_at: string | null;
};

export function StudentClassHome() {
  const { classId } = useParams<{ classId: string }>();
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const ctx = useClassContext(classId);

  const resourcesQ = useQuery({
    queryKey: ["class-home-recent", currentTenantId, classId, user?.id],
    enabled: !!classId && !!user && !!ctx.data?.canView,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("class_resources")
        .select("id,title,description,resource_type,source_type,file_url,file_path,external_url,embed_url,thumbnail_path,published_at")
        .eq("class_id", classId!)
        .eq("status", "published")
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });
      if (error) throw error;
      return (data || []).filter(hasValidSource) as ResourceRow[];
    },
  });

  const aboutQ = useQuery({
    queryKey: ["class-about", classId],
    enabled: !!classId && !!ctx.data?.canView,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("class_about")
        .select("overview,preparation_requirements")
        .eq("class_id", classId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const latestAnnQ = useLatestClassAnnouncement(classId, !!ctx.data?.canView);

  const counts = useMemo(() => {
    const r = resourcesQ.data || [];
    return {
      replays: r.filter((x) => x.resource_type === "video" || x.resource_type === "replay").length,
      notes: r.filter((x) => x.resource_type === "note").length,
      worksheets: r.filter((x) => x.resource_type === "worksheet").length,
      links: r.filter((x) => x.resource_type === "link").length,
      total: r.length,
    };
  }, [resourcesQ.data]);

  const basePath = `/dashboard/classes/${classId}`;
  const materialsPath = `${basePath}/materials`;

  const shell = (children: React.ReactNode) => (
    <ClassShell
      data={ctx.data}
      isLoading={ctx.isLoading}
      role="student"
      section="home"
      basePath={basePath}
      materialsPath={materialsPath}
      breadcrumbs={[
        { label: "Dashboard", to: "/dashboard" },
        { label: "My Classes", to: "/dashboard/classes" },
        { label: ctx.data?.klass?.title || "Class" },
      ]}
    >
      {children}
    </ClassShell>
  );

  if (ctx.isError) {
    return shell(<AccessCard title="Couldn't load this class" body={toSafeMessage(ctx.error, "Please try again in a moment.")} />);
  }
  if (!ctx.isLoading && (!ctx.data?.klass || !ctx.data.sameTenant)) {
    return shell(<AccessCard title="Class not found" body="This class isn't available for your organisation." />);
  }
  if (!ctx.isLoading && ctx.data && !ctx.data.canView) {
    return shell(<AccessCard title="Access restricted" body="You're not enrolled in this class. If this is a mistake, please contact your center administrator." />);
  }

  const recent = (resourcesQ.data || []).slice(0, 4);

  return shell(
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-5">
        {latestAnnQ.data && (
          <section className={`rounded-3xl border p-5 sm:p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ${latestAnnQ.data.is_pinned ? "bg-amber-50 border-amber-200" : "bg-white border-slate-200"}`}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                <Megaphone className="w-4 h-4 text-primary" /> Latest announcement
              </h2>
              <Button asChild variant="ghost" size="sm" className="text-primary">
                <Link to={`${basePath}/announcements`}>View all <ArrowRight className="w-3.5 h-3.5 ml-1" /></Link>
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {latestAnnQ.data.is_pinned && (
                <Badge className="rounded-full bg-amber-100 text-amber-800 hover:bg-amber-100">
                  <Pin className="w-3 h-3 mr-1" /> Pinned
                </Badge>
              )}
              <h3 className="font-semibold text-slate-900 break-words">{latestAnnQ.data.title}</h3>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {new Date(latestAnnQ.data.published_at || latestAnnQ.data.created_at).toLocaleString()}
              {latestAnnQ.data.edited_at && " · edited"}
            </p>
            {latestAnnQ.data.body && (
              <p className="text-sm text-slate-700 whitespace-pre-wrap mt-3 line-clamp-4">{latestAnnQ.data.body}</p>
            )}
          </section>
        )}
        <section className="bg-white rounded-3xl border border-slate-200 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900">Recent materials</h2>
            <Button asChild variant="ghost" size="sm" className="text-primary">
              <Link to={materialsPath}>View all <ArrowRight className="w-3.5 h-3.5 ml-1" /></Link>
            </Button>
          </div>
          {resourcesQ.isLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : recent.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 mx-auto flex items-center justify-center text-slate-400">
                <FileText />
              </div>
              <p className="mt-3 font-medium text-slate-700">No materials yet</p>
              <p className="text-sm text-slate-500">Check back once your tutor publishes new material.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {recent.map((r) => (
                <ResourcePreviewCard
                  key={r.id}
                  resource={r}
                  role="student"
                  actions={
                    <Button
                      size="sm"
                      variant="ghost"
                      className="rounded-full h-9 px-3 text-primary min-h-[44px] sm:min-h-0"
                      onClick={async () => {
                        const ok = await openClassResource(r);
                        if (!ok) toast.error("This file isn't available right now.");
                      }}
                    >
                      <ExternalLink className="w-3.5 h-3.5 mr-1" /> Open
                    </Button>
                  }
                />
              ))}
            </div>
          )}
        </section>

        {(aboutQ.data?.overview || aboutQ.data?.preparation_requirements) && (
          <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                <Info className="w-4 h-4 text-primary" /> About this class
              </h2>
              <Button asChild variant="ghost" size="sm" className="text-primary">
                <Link to={`${basePath}/about`}>Read more <ArrowRight className="w-3.5 h-3.5 ml-1" /></Link>
              </Button>
            </div>
            {aboutQ.data?.overview && (
              <p className="text-sm text-slate-600 whitespace-pre-wrap line-clamp-4">{aboutQ.data.overview}</p>
            )}
            {aboutQ.data?.preparation_requirements && (
              <div className="mt-4 p-3 rounded-2xl bg-amber-50 border border-amber-100">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 mb-1">Prepare for class</p>
                <p className="text-sm text-amber-900 whitespace-pre-wrap line-clamp-3">{aboutQ.data.preparation_requirements}</p>
              </div>
            )}
          </section>
        )}
      </div>

      <aside className="space-y-5">
        <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
          <h3 className="font-semibold text-slate-900 mb-3">At a glance</h3>
          <ul className="space-y-2 text-sm">
            <Stat icon={<Video className="w-4 h-4" />} label="Replays" value={counts.replays} />
            <Stat icon={<FileText className="w-4 h-4" />} label="Notes" value={counts.notes} />
            <Stat icon={<ClipboardList className="w-4 h-4" />} label="Worksheets" value={counts.worksheets} />
            <Stat icon={<ExternalLink className="w-4 h-4" />} label="Links" value={counts.links} />
          </ul>
          <Button asChild className="rounded-full w-full mt-4">
            <Link to={materialsPath}><Layers className="w-4 h-4 mr-2" /> Browse materials</Link>
          </Button>
        </section>

        {ctx.data?.klass?.scheduled_at && (
          <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
            <h3 className="font-semibold text-slate-900 mb-2 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" /> Next class
            </h3>
            <p className="text-sm text-slate-600">
              {new Date(ctx.data.klass.scheduled_at).toLocaleString()}
            </p>
            {ctx.data.klass.schedule_label && (
              <p className="text-xs text-slate-500 mt-1">{ctx.data.klass.schedule_label}</p>
            )}
          </section>
        )}

        {ctx.data && ctx.data.tutors.length > 0 && (
          <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
            <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <User className="w-4 h-4 text-primary" /> Tutor{ctx.data.tutors.length > 1 ? "s" : ""}
            </h3>
            <ul className="space-y-2">
              {ctx.data.tutors.map((t) => (
                <li key={t.id} className="text-sm text-slate-700 flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-semibold">
                    {(t.full_name || "?").charAt(0).toUpperCase()}
                  </div>
                  {t.full_name || "Assigned tutor"}
                </li>
              ))}
            </ul>
          </section>
        )}

        {ctx.data?.klass?.subject?.name && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
            <p className="text-xs uppercase tracking-wide font-semibold text-slate-500">Subject</p>
            <p className="text-sm mt-1 text-slate-900 inline-flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-primary" /> {ctx.data.klass.subject.name}
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <li className="flex items-center justify-between py-1.5">
      <span className="inline-flex items-center gap-2 text-slate-600">
        <span className="text-primary">{icon}</span>
        {label}
      </span>
      <Badge variant="outline" className="rounded-full">{value}</Badge>
    </li>
  );
}

function AccessCard({ title, body }: { title: string; body: string }) {
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

export default StudentClassHome;
