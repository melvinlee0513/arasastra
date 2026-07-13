import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronRight, Home, GraduationCap, Video, FileText, HelpCircle,
  Users, Sparkles, Plus, Layers, ClipboardList, Clock, BookOpen, Calendar,
  PenSquare, CheckCircle2, ExternalLink,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { useFeatureEnabled } from "@/hooks/useFeature";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toSafeMessage } from "@/components/common/TenantGate";

type ClassRow = {
  id: string;
  title: string;
  description: string | null;
  scheduled_at: string;
  schedule_label: string | null;
  status: string;
  center_id: string | null;
  subject: { name: string } | null;
};

type ResourceRow = {
  id: string;
  title: string;
  resource_type: string;
  status: string;
  published_at: string | null;
  created_at: string;
};

type QuizRow = { id: string; title: string; status: string; total_points: number };

export function TutorClassRoom() {
  const { classId } = useParams<{ classId: string }>();
  const { user, isAdmin } = useAuth();
  const { currentTenantId, isLoading: tenantLoading } = useTenant();
  const flashcardsOn = useFeatureEnabled("flashcards");

  const q = useQuery({
    queryKey: ["tutor-classroom", currentTenantId, classId, user?.id],
    enabled: !!classId && !!user && !tenantLoading,
    queryFn: async () => {
      const { data: klass, error: kerr } = await supabase
        .from("classes")
        .select("id,title,description,scheduled_at,schedule_label,status,center_id,subject:subjects(name)")
        .eq("id", classId!)
        .maybeSingle<ClassRow>();
      if (kerr) throw kerr;
      if (!klass) return null;

      const sameTenant = !currentTenantId || !klass.center_id || klass.center_id === currentTenantId;

      // Assignment check (via class_tutors); admins skip this
      const { data: assignment } = await supabase
        .from("class_tutors")
        .select("id")
        .eq("class_id", klass.id)
        .eq("tutor_user_id", user!.id)
        .maybeSingle();
      const assigned = isAdmin || !!assignment;

      const [{ count: studentCount }, { data: resources }, { data: quizzes }] = await Promise.all([
        supabase
          .from("class_enrollments")
          .select("id", { count: "exact", head: true })
          .eq("class_id", klass.id)
          .eq("status", "active"),
        supabase
          .from("class_resources")
          .select("id,title,resource_type,status,published_at,created_at")
          .eq("class_id", klass.id)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("quizzes")
          .select("id,title,status,total_points")
          .eq("class_id", klass.id)
          .order("created_at", { ascending: false }),
      ]);

      return {
        klass,
        sameTenant,
        assigned,
        studentCount: studentCount ?? 0,
        resources: (resources || []) as ResourceRow[],
        quizzes: (quizzes || []) as QuizRow[],
      };
    },
  });

  if (tenantLoading || q.isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-5 md:p-8 space-y-6">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-40 rounded-3xl" />
        <Skeleton className="h-64 rounded-3xl" />
      </div>
    );
  }

  if (q.isError) {
    return (
      <FullScreenMessage
        title="Couldn't load this class"
        body={toSafeMessage(q.error, "Please try again in a moment.")}
        cta={{ label: "Back to Classes", to: "/tutor/classes" }}
      />
    );
  }

  const data = q.data;
  if (!data?.klass || !data.sameTenant) {
    return (
      <FullScreenMessage
        title="Class not found"
        body="This class isn't available for your organisation."
        cta={{ label: "Back to Classes", to: "/tutor/classes" }}
      />
    );
  }
  if (!data.assigned) {
    return (
      <FullScreenMessage
        title="You're not assigned to this class"
        body="Only assigned tutors and centre admins can manage this classroom. If this is a mistake, ask your admin to add you in the tutor assignments."
        cta={{ label: "Back to Classes", to: "/tutor/classes" }}
      />
    );
  }

  const k = data.klass;
  const recent = data.resources.slice(0, 8);
  const drafts = data.resources.filter((r) => r.status === "draft").length;
  const published = data.resources.filter((r) => r.status === "published").length;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Breadcrumbs */}
        <nav className="flex flex-wrap items-center gap-1.5 text-sm text-slate-500">
          <Link to="/tutor" className="inline-flex items-center gap-1 hover:text-primary">
            <Home className="w-3.5 h-3.5" /> Tutor
          </Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <Link to="/tutor/classes" className="hover:text-primary">My Classes</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-slate-900 font-medium truncate max-w-[60vw]">{k.title}</span>
        </nav>

        {/* Header */}
        <header className="bg-white rounded-3xl border border-slate-200 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-5 sm:p-8">
          <div className="flex flex-col md:flex-row md:items-start gap-5">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
              <GraduationCap className="w-7 h-7 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">{k.title}</h1>
              <div className="flex flex-wrap gap-2 mt-3">
                {k.subject?.name && (
                  <Badge className="rounded-full bg-primary/10 text-primary hover:bg-primary/15">
                    <BookOpen className="w-3 h-3 mr-1" /> {k.subject.name}
                  </Badge>
                )}
                {k.schedule_label && (
                  <Badge variant="outline" className="rounded-full">
                    <Clock className="w-3 h-3 mr-1" /> {k.schedule_label}
                  </Badge>
                )}
                <Badge variant="outline" className="rounded-full">
                  <Users className="w-3 h-3 mr-1" /> {data.studentCount} students
                </Badge>
                {k.scheduled_at && (
                  <Badge variant="secondary" className="rounded-full">
                    <Calendar className="w-3 h-3 mr-1" />
                    Next: {new Date(k.scheduled_at).toLocaleString()}
                  </Badge>
                )}
              </div>
              {k.description && <p className="text-sm text-slate-600 mt-4">{k.description}</p>}
            </div>
          </div>

          {/* Quick actions */}
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            <Button asChild className="rounded-full h-11 justify-center">
              <Link to={`/tutor/classes/${k.id}/resources`}>
                <Plus className="w-4 h-4 mr-2" /> Add Material
              </Link>
            </Button>
            <Button asChild variant="outline" className="rounded-full h-11 justify-center">
              <Link to={`/tutor/classes/${k.id}/resources`}>
                <FileText className="w-4 h-4 mr-2" /> Manage Resources
              </Link>
            </Button>
            <Button variant="outline" className="rounded-full h-11 justify-center" disabled>
              <HelpCircle className="w-4 h-4 mr-2" /> Create Quiz
            </Button>
            {flashcardsOn && (
              <Button variant="outline" className="rounded-full h-11 justify-center" disabled>
                <Layers className="w-4 h-4 mr-2" /> Flashcards
              </Button>
            )}
          </div>
        </header>

        {/* Tabs */}
        <Tabs defaultValue="overview" className="w-full">
          <div className="overflow-x-auto -mx-1 px-1">
            <TabsList className="bg-white border border-slate-200 rounded-full p-1 h-auto shadow-sm flex-nowrap w-max">
              <Tab value="overview" icon={<Sparkles className="w-4 h-4 mr-1.5" />} label="Overview" />
              <Tab value="resources" icon={<FileText className="w-4 h-4 mr-1.5" />} label={`Resources (${data.resources.length})`} />
              <Tab value="assessments" icon={<HelpCircle className="w-4 h-4 mr-1.5" />} label={`Assessments (${data.quizzes.length})`} />
            </TabsList>
          </div>

          <TabsContent value="overview" className="mt-5 space-y-5">
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
              <StatCard label="Students" value={data.studentCount} sub="active enrolments" />
              <StatCard label="Published" value={published} sub="resources" />
              <StatCard label="Drafts" value={drafts} sub="not yet visible" tone={drafts > 0 ? "warn" : "default"} />
              <StatCard label="Quizzes" value={data.quizzes.length} sub="total in class" />
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-900">Recent Content</h3>
                <Button asChild variant="ghost" size="sm" className="text-primary">
                  <Link to={`/tutor/classes/${k.id}/resources`}>Manage <ExternalLink className="w-3.5 h-3.5 ml-1" /></Link>
                </Button>
              </div>
              {recent.length === 0 ? (
                <EmptyRow label="No resources yet. Add your first material to get started." />
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
                      <StatusBadge status={item.status} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </TabsContent>

          <TabsContent value="resources" className="mt-5">
            <ContentList
              rows={data.resources.map((r) => ({ id: r.id, title: r.title, meta: r.resource_type, status: r.status }))}
              emptyIcon={<FileText />} emptyLabel="No resources yet"
              manageTo={`/tutor/classes/${k.id}/resources`}
            />
          </TabsContent>

          <TabsContent value="assessments" className="mt-5">
            <ContentList
              rows={data.quizzes.map((qz) => ({ id: qz.id, title: qz.title, meta: `${qz.total_points} pts`, status: qz.status }))}
              emptyIcon={<HelpCircle />} emptyLabel="No assessments yet"
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Tab({ value, icon, label }: { value: string; icon: React.ReactNode; label: string }) {
  return (
    <TabsTrigger
      value={value}
      className="rounded-full px-3.5 py-2 text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap"
    >
      {icon} {label}
    </TabsTrigger>
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

function StatusBadge({ status }: { status: string }) {
  if (status === "published") {
    return <Badge className="rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-100"><CheckCircle2 className="w-3 h-3 mr-1" /> Published</Badge>;
  }
  return <Badge variant="outline" className="rounded-full"><PenSquare className="w-3 h-3 mr-1" /> Draft</Badge>;
}

function ContentList({
  rows, emptyIcon, emptyLabel, manageTo,
}: { rows: { id: string; title: string; meta: string; status: string }[]; emptyIcon: React.ReactNode; emptyLabel: string; manageTo?: string }) {
  if (rows.length === 0) {
    return (
      <div className="bg-white/80 backdrop-blur-md border border-dashed border-slate-200 rounded-3xl py-14 text-center">
        <div className="w-12 h-12 rounded-2xl bg-slate-100 mx-auto flex items-center justify-center text-slate-400">{emptyIcon}</div>
        <p className="mt-3 font-semibold text-slate-700">{emptyLabel}</p>
        {manageTo && (
          <Button asChild size="sm" className="rounded-full mt-4">
            <Link to={manageTo}><Plus className="w-4 h-4 mr-2" /> Add Material</Link>
          </Button>
        )}
      </div>
    );
  }
  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <ul className="divide-y divide-slate-100">
        {rows.map((r) => (
          <li key={r.id} className="px-5 py-4 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-slate-900 text-sm truncate">{r.title}</p>
              <p className="text-xs text-slate-500 capitalize">{r.meta}</p>
            </div>
            <StatusBadge status={r.status} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmptyRow({ label }: { label: string }) {
  return <p className="text-sm text-slate-500 text-center py-6">{label}</p>;
}

function FullScreenMessage({
  title, body, cta,
}: { title: string; body: string; cta: { label: string; to: string } }) {
  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-3xl mx-auto bg-white rounded-3xl border border-slate-200 p-10 text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        <h2 className="text-xl font-bold text-slate-900">{title}</h2>
        <p className="text-slate-500 mt-2">{body}</p>
        <Link to={cta.to} className="text-primary font-semibold mt-4 inline-block">
          ← {cta.label}
        </Link>
      </div>
    </div>
  );
}
