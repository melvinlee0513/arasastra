import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { GraduationCap, ArrowRight, Calendar, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ClassCover } from "@/components/class/ClassCover";
import { fetchTutorsByClass, tutorLabel, type TutorIdentity } from "@/lib/classCovers";

interface EnrolledClass {
  id: string;
  title: string;
  cohort_label: string | null;
  scheduled_at: string;
  subject_name: string | null;
  cover_image_path: string | null;
  cover_image_updated_at: string | null;
  tutors: TutorIdentity[];
}

export function MyClasses() {
  const { user } = useAuth();

  const { data: classes, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["student-enrolled-classes", user?.id],
    enabled: !!user,
    queryFn: async () => {
      // Step 1 — canonical enrolments for this student.
      const { data: enrolments, error: enrErr } = await supabase
        .from("class_enrollments")
        .select("class_id")
        .eq("student_user_id", user!.id)
        .eq("status", "active");
      if (enrErr) throw enrErr;

      const classIds = (enrolments || []).map((r) => r.class_id).filter(Boolean);
      if (classIds.length === 0) return [] as EnrolledClass[];

      // Step 2 — classes visible under RLS (tenant + enrolment enforced server-side).
      const { data: classRows, error: classErr } = await supabase
        .from("classes")
        .select("id,title,scheduled_at,cohort_label,subject_id,cover_image_path,cover_image_updated_at")
        .in("id", classIds);
      if (classErr) throw classErr;

      // Step 3 — subjects for those classes.
      const subjectIds = Array.from(
        new Set((classRows || []).map((c: any) => c.subject_id).filter(Boolean)),
      );
      const subjectMap = new Map<string, string>();
      if (subjectIds.length) {
        const { data: subs, error: subErr } = await supabase
          .from("subjects")
          .select("id,name")
          .in("id", subjectIds);
        if (subErr) throw subErr;
        for (const s of subs || []) subjectMap.set(s.id as string, s.name as string);
      }

      // Step 4 — canonical tutor identity (class_tutors → profiles via safe RPC).
      const tutorsByClass = await fetchTutorsByClass(
        (classRows || []).map((c: any) => c.id as string),
      );

      return (classRows || []).map<EnrolledClass>((c: any) => ({
        id: c.id,
        title: c.title,
        cohort_label: c.cohort_label,
        scheduled_at: c.scheduled_at,
        subject_name: c.subject_id ? subjectMap.get(c.subject_id) || null : null,
        cover_image_path: c.cover_image_path ?? null,
        cover_image_updated_at: c.cover_image_updated_at ?? null,
        tutors: tutorsByClass.get(c.id) || [],
      }));
    },
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto p-5 md:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
            <GraduationCap className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900">My Classes</h1>
            <p className="text-sm text-slate-500">Enrolled cohorts you can access right now.</p>
          </div>
        </div>

        {isLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-72 rounded-3xl" />
            ))}
          </div>
        ) : isError ? (
          <div className="bg-white border border-slate-200 rounded-3xl py-16 text-center">
            <p className="font-semibold text-slate-800">Couldn't load your classes</p>
            <p className="text-sm text-slate-500 mt-1">
              {(error as Error)?.message || "Please try again in a moment."}
            </p>
            <button
              onClick={() => refetch()}
              className="mt-4 text-sm font-semibold text-primary hover:underline"
            >
              Retry
            </button>
          </div>
        ) : !classes || classes.length === 0 ? (
          <div className="bg-white/80 backdrop-blur-md border border-dashed border-slate-200 rounded-3xl py-16 text-center">
            <GraduationCap className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="font-semibold text-slate-700">You're not enrolled in any classes yet</p>
            <p className="text-sm text-slate-500">
              Once an admin enrolls you in a class instance, it will appear here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {classes.map((c) => (
              <Link
                key={c.id}
                to={`/dashboard/classes/${c.id}`}
                className="group bg-white rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col"
              >
                <ClassCover
                  classId={c.id}
                  coverPath={c.cover_image_path}
                  version={c.cover_image_updated_at}
                  overlay={
                    c.subject_name ? (
                      <div className="absolute bottom-3 left-3 right-3 flex flex-wrap gap-1.5">
                        <Badge className="rounded-full bg-white/95 text-slate-900 hover:bg-white shadow-sm">
                          {c.subject_name}
                        </Badge>
                      </div>
                    ) : undefined
                  }
                />

                <div className="p-5 flex-1 flex flex-col gap-2">
                  <h3 className="font-semibold text-slate-900 line-clamp-2 leading-snug">{c.title}</h3>
                  {c.cohort_label && (
                    <p className="text-xs text-slate-500 line-clamp-1">{c.cohort_label}</p>
                  )}
                  <p className="text-xs text-slate-600 inline-flex items-start gap-1.5 line-clamp-2">
                    <User className="w-3.5 h-3.5 mt-[1px] shrink-0 text-slate-400" />
                    <span className="line-clamp-2">{tutorLabel(c.tutors)}</span>
                  </p>
                  <div className="text-xs text-slate-500 flex items-center gap-3 mt-auto pt-1">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {c.scheduled_at ? new Date(c.scheduled_at).toLocaleDateString() : "Scheduled soon"}
                    </span>
                  </div>

                  <span className="mt-2 text-sm font-semibold text-primary inline-flex items-center gap-1 group-hover:gap-2 transition-all">
                    Open class <ArrowRight className="w-4 h-4" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
