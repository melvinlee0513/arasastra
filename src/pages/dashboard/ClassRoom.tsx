import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  Home,
  GraduationCap,
  Video,
  FileText,
  HelpCircle,
  PlayCircle,
  ExternalLink,
  Download,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export function ClassRoom() {
  const { classId } = useParams<{ classId: string }>();
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["classroom", classId, user?.id],
    enabled: !!classId && !!user,
    queryFn: async () => {
      // 1. Verify enrollment
      const { data: enrol } = await (supabase as any)
        .from("enrollments")
        .select("id")
        .eq("student_id", user!.id)
        .eq("class_id", classId)
        .maybeSingle();

      // 2. Pull class meta + materials in parallel
      const [classRes, videosRes, notesRes, quizzesRes] = await Promise.all([
        (supabase as any)
          .from("classes")
          .select("id,title,description,scheduled_at,cohort_label,subject_id,standard_id,tutor_id")
          .eq("id", classId)
          .maybeSingle(),
        (supabase as any)
          .from("video_resources")
          .select("*")
          .eq("class_id", classId)
          .eq("is_published", true)
          .order("created_at", { ascending: false }),
        (supabase as any)
          .from("notes")
          .select("id,title,description,file_url,file_name,file_size,created_at")
          .eq("class_id", classId)
          .order("created_at", { ascending: false }),
        (supabase as any)
          .from("quizzes")
          .select("id,title,created_at")
          .eq("class_id", classId)
          .order("created_at", { ascending: false }),
      ]);

      let subject_name: string | null = null;
      let standard_name: string | null = null;
      let tutor_name: string | null = null;
      if (classRes.data) {
        const [sub, std, tut] = await Promise.all([
          classRes.data.subject_id
            ? (supabase as any).from("subjects").select("name").eq("id", classRes.data.subject_id).maybeSingle()
            : Promise.resolve({ data: null }),
          classRes.data.standard_id
            ? (supabase as any).from("standards").select("name").eq("id", classRes.data.standard_id).maybeSingle()
            : Promise.resolve({ data: null }),
          classRes.data.tutor_id
            ? (supabase as any).from("tutors").select("name").eq("id", classRes.data.tutor_id).maybeSingle()
            : Promise.resolve({ data: null }),
        ]);
        subject_name = sub.data?.name || null;
        standard_name = std.data?.name || null;
        tutor_name = tut.data?.name || null;
      }

      return {
        enrolled: !!enrol,
        klass: classRes.data,
        subject_name,
        standard_name,
        tutor_name,
        videos: videosRes.data || [],
        notes: notesRes.data || [],
        quizzes: quizzesRes.data || [],
      };
    },
  });

  const tabCounts = useMemo(
    () => ({
      videos: data?.videos.length ?? 0,
      notes: data?.notes.length ?? 0,
      quizzes: data?.quizzes.length ?? 0,
    }),
    [data],
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-5 md:p-8 space-y-6">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-40 rounded-3xl" />
        <Skeleton className="h-64 rounded-3xl" />
      </div>
    );
  }

  if (!data?.klass) {
    return (
      <div className="min-h-screen bg-slate-50 p-8">
        <div className="max-w-3xl mx-auto bg-white rounded-3xl border border-slate-200 p-10 text-center">
          <h2 className="text-xl font-bold text-slate-900">Class not found</h2>
          <p className="text-slate-500 mt-2">This class instance no longer exists.</p>
          <Link to="/dashboard/classes" className="text-primary font-semibold mt-4 inline-block">
            ← Back to My Classes
          </Link>
        </div>
      </div>
    );
  }

  if (!data.enrolled) {
    return (
      <div className="min-h-screen bg-slate-50 p-8">
        <div className="max-w-3xl mx-auto bg-white rounded-3xl border border-slate-200 p-10 text-center">
          <h2 className="text-xl font-bold text-slate-900">Access restricted</h2>
          <p className="text-slate-500 mt-2">
            You are not enrolled in this class. Contact your administrator if you believe this is a
            mistake.
          </p>
          <Link to="/dashboard/classes" className="text-primary font-semibold mt-4 inline-block">
            ← Back to My Classes
          </Link>
        </div>
      </div>
    );
  }

  const klass = data.klass;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto p-5 md:p-8 space-y-6">
        {/* Breadcrumbs */}
        <nav className="flex flex-wrap items-center gap-1.5 text-sm text-slate-500">
          <Link to="/dashboard" className="inline-flex items-center gap-1 hover:text-primary">
            <Home className="w-3.5 h-3.5" /> Dashboard
          </Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <Link to="/dashboard/classes" className="hover:text-primary">
            Enrolled Classes
          </Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-slate-900 font-medium truncate max-w-[60vw]">{klass.title}</span>
        </nav>

        {/* Header card */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 md:p-8">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
              <GraduationCap className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl md:text-3xl font-bold text-slate-900">{klass.title}</h1>
              {klass.cohort_label && (
                <p className="text-sm text-slate-500 mt-1">{klass.cohort_label}</p>
              )}
              <div className="flex flex-wrap gap-2 mt-3">
                {data.subject_name && (
                  <Badge className="rounded-full bg-primary/10 text-primary hover:bg-primary/15">
                    {data.subject_name}
                  </Badge>
                )}
                {data.standard_name && (
                  <Badge variant="secondary" className="rounded-full">
                    {data.standard_name}
                  </Badge>
                )}
                {data.tutor_name && (
                  <Badge variant="outline" className="rounded-full">
                    {data.tutor_name}
                  </Badge>
                )}
              </div>
              {klass.description && (
                <p className="text-sm text-slate-600 mt-4">{klass.description}</p>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="videos" className="w-full">
          <TabsList className="bg-white border border-slate-200 rounded-full p-1 h-auto shadow-sm flex-wrap">
            <TabsTrigger value="videos" className="rounded-full px-4 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Video className="w-4 h-4 mr-2" />
              Recordings <span className="ml-1.5 text-xs opacity-70">({tabCounts.videos})</span>
            </TabsTrigger>
            <TabsTrigger value="notes" className="rounded-full px-4 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <FileText className="w-4 h-4 mr-2" />
              Documents <span className="ml-1.5 text-xs opacity-70">({tabCounts.notes})</span>
            </TabsTrigger>
            <TabsTrigger value="quizzes" className="rounded-full px-4 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <HelpCircle className="w-4 h-4 mr-2" />
              Quizzes <span className="ml-1.5 text-xs opacity-70">({tabCounts.quizzes})</span>
            </TabsTrigger>
          </TabsList>

          {/* Videos */}
          <TabsContent value="videos" className="mt-5">
            {data.videos.length === 0 ? (
              <EmptyState icon={<Video />} label="No recordings yet" />
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {data.videos.map((v: any) => (
                  <div key={v.id} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="aspect-video bg-slate-100">
                      {v.source_type === "youtube" && v.youtube_id ? (
                        <iframe
                          className="w-full h-full"
                          src={`https://www.youtube.com/embed/${v.youtube_id}?rel=0`}
                          title={v.title}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        />
                      ) : v.source_type === "upload" ? (
                        <video src={v.video_url} controls className="w-full h-full object-contain bg-black" />
                      ) : (
                        <a
                          href={v.video_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full h-full flex items-center justify-center bg-slate-900 text-white font-semibold gap-2"
                        >
                          <ExternalLink className="w-4 h-4" /> Open in Zoom
                        </a>
                      )}
                    </div>
                    <div className="p-4">
                      <h3 className="font-semibold text-slate-900 line-clamp-1">{v.title}</h3>
                      {v.description && (
                        <p className="text-xs text-slate-500 line-clamp-2 mt-1">{v.description}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Notes / PDFs */}
          <TabsContent value="notes" className="mt-5">
            {data.notes.length === 0 ? (
              <EmptyState icon={<FileText />} label="No documents yet" />
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                {data.notes.map((n: any) => (
                  <a
                    key={n.id}
                    href={n.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md p-5 flex items-start gap-4 group"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                      <FileText className="w-6 h-6 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-slate-900 truncate">{n.title}</h3>
                      <p className="text-xs text-slate-500 truncate">{n.file_name}</p>
                      {n.description && (
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">{n.description}</p>
                      )}
                    </div>
                    <Download className="w-4 h-4 text-slate-400 group-hover:text-primary mt-1" />
                  </a>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Quizzes */}
          <TabsContent value="quizzes" className="mt-5">
            {data.quizzes.length === 0 ? (
              <EmptyState icon={<HelpCircle />} label="No quizzes yet" />
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                {data.quizzes.map((q: any) => (
                  <Link
                    key={q.id}
                    to={`/quiz/${q.id}/lobby`}
                    className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md p-5 flex items-center gap-4 group"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                      <PlayCircle className="w-6 h-6 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-slate-900">{q.title}</h3>
                      <p className="text-xs text-slate-500">
                        Added {new Date(q.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-primary" />
                  </Link>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
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
      <p className="text-sm text-slate-500">Check back once your tutor adds new material.</p>
    </div>
  );
}
