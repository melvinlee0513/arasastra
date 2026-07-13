import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronRight, Home, GraduationCap, Video, FileText, HelpCircle,
  PlayCircle, Download, ClipboardList, Calendar, Clock, User, BookOpen,
  ExternalLink, Layers,
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
  duration_minutes: number | null;
  cohort_label: string | null;
  schedule_label: string | null;
  status: string;
  center_id: string | null;
  subject: { name: string } | null;
};

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
  published_at: string | null;
};

type QuizRow = { id: string; title: string; description: string | null; total_points: number };

function hasValidSource(r: ResourceRow) {
  return Boolean(r.embed_url || r.external_url || r.file_url || r.file_path);
}
function resourceHref(r: ResourceRow) {
  return r.embed_url || r.external_url || r.file_url || null;
}

export function ClassRoom() {
  const { classId } = useParams<{ classId: string }>();
  const { user } = useAuth();
  const { currentTenantId, isLoading: tenantLoading } = useTenant();
  const replaysOn = useFeatureEnabled("videoReplays");
  const flashcardsOn = useFeatureEnabled("flashcards");

  const q = useQuery({
    queryKey: ["classroom", currentTenantId, classId, user?.id],
    enabled: !!classId && !!user && !tenantLoading,
    queryFn: async () => {
      // Class row (RLS ensures caller can see it)
      const { data: klass, error: kerr } = await supabase
        .from("classes")
        .select("id,title,description,scheduled_at,duration_minutes,cohort_label,schedule_label,status,center_id,subject:subjects(name)")
        .eq("id", classId!)
        .maybeSingle<ClassRow>();
      if (kerr) throw kerr;
      if (!klass) return { klass: null, enrolled: false, sameTenant: false, tutors: [], resources: [] as ResourceRow[], quizzes: [] as QuizRow[] };

      const sameTenant = !currentTenantId || !klass.center_id || klass.center_id === currentTenantId;

      // Enrollment check (canonical)
      const { data: enrol } = await supabase
        .from("class_enrollments")
        .select("id")
        .eq("class_id", klass.id)
        .eq("student_user_id", user!.id)
        .eq("status", "active")
        .maybeSingle();

      // Tutor names via class_tutors -> profiles
      const { data: ct } = await supabase
        .from("class_tutors")
        .select("tutor_user_id")
        .eq("class_id", klass.id);
      const tutorIds = (ct || []).map((r: any) => r.tutor_user_id).filter(Boolean);
      let tutors: { id: string; full_name: string | null }[] = [];
      if (tutorIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id,full_name")
          .in("user_id", tutorIds);
        tutors = (profs || []).map((p: any) => ({ id: p.user_id, full_name: p.full_name }));
      }

      // Published class resources (RLS filters by enrollment)
      const { data: resources } = await supabase
        .from("class_resources")
        .select("id,title,description,resource_type,source_type,file_url,file_path,external_url,embed_url,published_at")
        .eq("class_id", klass.id)
        .eq("status", "published")
        .order("published_at", { ascending: false });

      // Published quizzes
      const { data: quizzes } = await supabase
        .from("quizzes")
        .select("id,title,description,total_points")
        .eq("class_id", klass.id)
        .eq("status", "published")
        .order("published_at", { ascending: false });

      return {
        klass,
        enrolled: !!enrol,
        sameTenant,
        tutors,
        resources: (resources || []).filter(hasValidSource) as ResourceRow[],
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
        cta={{ label: "Back to My Classes", to: "/dashboard/classes" }}
      />
    );
  }

  const data = q.data!;
  if (!data.klass || !data.sameTenant) {
    return (
      <FullScreenMessage
        title="Class not found"
        body="This class isn't available for your organisation."
        cta={{ label: "Back to My Classes", to: "/dashboard/classes" }}
      />
    );
  }
  if (!data.enrolled) {
    return (
      <FullScreenMessage
        title="Access restricted"
        body="You're not enrolled in this class. If this is a mistake, please contact your center administrator."
        cta={{ label: "Back to My Classes", to: "/dashboard/classes" }}
      />
    );
  }

  const k = data.klass;
  const replays = data.resources.filter((r) => r.resource_type === "video" || r.resource_type === "replay");
  const notes = data.resources.filter((r) => r.resource_type === "note");
  const worksheets = data.resources.filter((r) => r.resource_type === "worksheet");
  const links = data.resources.filter((r) => r.resource_type === "link");
  const tutorLabel =
    data.tutors.map((t) => t.full_name).filter(Boolean).join(", ") || null;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Breadcrumbs */}
        <nav className="flex flex-wrap items-center gap-1.5 text-sm text-slate-500">
          <Link to="/dashboard" className="inline-flex items-center gap-1 hover:text-primary">
            <Home className="w-3.5 h-3.5" /> Dashboard
          </Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <Link to="/dashboard/classes" className="hover:text-primary">My Classes</Link>
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
              {k.cohort_label && <p className="text-sm text-slate-500 mt-1">{k.cohort_label}</p>}
              <div className="flex flex-wrap gap-2 mt-3">
                {k.subject?.name && (
                  <Badge className="rounded-full bg-primary/10 text-primary hover:bg-primary/15">
                    <BookOpen className="w-3 h-3 mr-1" /> {k.subject.name}
                  </Badge>
                )}
                {tutorLabel && (
                  <Badge variant="outline" className="rounded-full">
                    <User className="w-3 h-3 mr-1" /> {tutorLabel}
                  </Badge>
                )}
                {k.schedule_label && (
                  <Badge variant="outline" className="rounded-full">
                    <Clock className="w-3 h-3 mr-1" /> {k.schedule_label}
                  </Badge>
                )}
                {k.scheduled_at && (
                  <Badge variant="secondary" className="rounded-full">
                    <Calendar className="w-3 h-3 mr-1" />
                    Next: {new Date(k.scheduled_at).toLocaleString()}
                  </Badge>
                )}
              </div>
              {k.description && (
                <p className="text-sm text-slate-600 mt-4 leading-relaxed">{k.description}</p>
              )}
            </div>
          </div>
        </header>

        {/* Tabs */}
        <Tabs defaultValue={replaysOn ? "replays" : "notes"} className="w-full">
          <div className="overflow-x-auto -mx-1 px-1">
            <TabsList className="bg-white border border-slate-200 rounded-full p-1 h-auto shadow-sm flex-nowrap w-max">
              {replaysOn && (
                <Tab value="replays" icon={<Video className="w-4 h-4 mr-1.5" />} label={`Replays (${replays.length})`} />
              )}
              <Tab value="notes" icon={<FileText className="w-4 h-4 mr-1.5" />} label={`Notes (${notes.length})`} />
              <Tab value="worksheets" icon={<ClipboardList className="w-4 h-4 mr-1.5" />} label={`Worksheets (${worksheets.length})`} />
              <Tab value="quizzes" icon={<HelpCircle className="w-4 h-4 mr-1.5" />} label={`Quizzes (${data.quizzes.length})`} />
              {links.length > 0 && (
                <Tab value="links" icon={<ExternalLink className="w-4 h-4 mr-1.5" />} label={`Links (${links.length})`} />
              )}
              {flashcardsOn && (
                <Tab value="flashcards" icon={<Layers className="w-4 h-4 mr-1.5" />} label="Flashcards" />
              )}
            </TabsList>
          </div>

          {replaysOn && (
            <TabsContent value="replays" className="mt-5">
              {replays.length === 0 ? (
                <EmptyState icon={<Video />} label="No replays yet" />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {replays.map((r) => {
                    const href = resourceHref(r);
                    return (
                      <div key={r.id} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="aspect-video bg-slate-900">
                          {r.embed_url ? (
                            <iframe
                              className="w-full h-full"
                              src={r.embed_url}
                              title={r.title}
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                            />
                          ) : r.source_type === "upload" && href ? (
                            <video src={href} controls className="w-full h-full object-contain bg-black" />
                          ) : href ? (
                            <a href={href} target="_blank" rel="noreferrer" className="w-full h-full flex items-center justify-center text-white/80 gap-2">
                              <PlayCircle className="w-8 h-8" /> Open video
                            </a>
                          ) : null}
                        </div>
                        <div className="p-4">
                          <h4 className="font-semibold text-slate-900 line-clamp-1">{r.title}</h4>
                          {r.description && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{r.description}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          )}

          <TabsContent value="notes" className="mt-5">
            <FileList items={notes} emptyIcon={<FileText />} emptyLabel="No notes yet" />
          </TabsContent>

          <TabsContent value="worksheets" className="mt-5">
            <FileList items={worksheets} emptyIcon={<ClipboardList />} emptyLabel="No worksheets yet" />
          </TabsContent>

          <TabsContent value="quizzes" className="mt-5">
            {data.quizzes.length === 0 ? (
              <EmptyState icon={<HelpCircle />} label="No quizzes yet" />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {data.quizzes.map((quiz) => (
                  <Link
                    key={quiz.id}
                    to={`/quiz/${quiz.id}/lobby`}
                    className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md p-5 flex items-center gap-4 group"
                  >
                    <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center">
                      <PlayCircle className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-slate-900 truncate">{quiz.title}</h4>
                      {quiz.description && <p className="text-xs text-slate-500 line-clamp-1">{quiz.description}</p>}
                    </div>
                    <Button size="sm" className="rounded-full">Start</Button>
                  </Link>
                ))}
              </div>
            )}
          </TabsContent>

          {links.length > 0 && (
            <TabsContent value="links" className="mt-5">
              <FileList items={links} emptyIcon={<ExternalLink />} emptyLabel="No links yet" />
            </TabsContent>
          )}

          {flashcardsOn && (
            <TabsContent value="flashcards" className="mt-5">
              <EmptyState icon={<Layers />} label="Flashcard decks coming soon" />
            </TabsContent>
          )}
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

function FileList({
  items, emptyIcon, emptyLabel,
}: { items: ResourceRow[]; emptyIcon: React.ReactNode; emptyLabel: string }) {
  if (items.length === 0) return <EmptyState icon={emptyIcon} label={emptyLabel} />;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {items.map((n) => {
        const href = resourceHref(n);
        return (
          <a
            key={n.id}
            href={href || "#"}
            target="_blank"
            rel="noreferrer"
            className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md p-5 flex items-start gap-4 group"
          >
            <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-slate-900 truncate">{n.title}</h4>
              {n.description && <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">{n.description}</p>}
            </div>
            <Download className="w-4 h-4 text-slate-400 group-hover:text-primary mt-1" />
          </a>
        );
      })}
    </div>
  );
}

function EmptyState({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="bg-white/80 backdrop-blur-md border border-dashed border-slate-200 rounded-3xl py-14 text-center">
      <div className="w-12 h-12 rounded-2xl bg-slate-100 mx-auto flex items-center justify-center text-slate-400">
        {icon}
      </div>
      <p className="mt-3 font-semibold text-slate-700">{label}</p>
      <p className="text-sm text-slate-500">Check back once your tutor publishes new material.</p>
    </div>
  );
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
