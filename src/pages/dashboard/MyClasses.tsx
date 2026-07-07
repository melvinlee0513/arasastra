import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { GraduationCap, ArrowRight, Calendar, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

interface EnrolledClass {
  id: string;
  title: string;
  cohort_label: string | null;
  scheduled_at: string;
  subject_name: string | null;
  standard_name: string | null;
  tutor_name: string | null;
}

// Deterministic soft-gradient banner per class — no external stock imagery.
const BANNER_GRADIENTS = [
  "from-sky-100 via-white to-cyan-100",
  "from-indigo-100 via-white to-sky-100",
  "from-emerald-100 via-white to-teal-100",
  "from-amber-100 via-white to-rose-100",
  "from-violet-100 via-white to-fuchsia-100",
  "from-slate-100 via-white to-sky-50",
];
function bannerFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return BANNER_GRADIENTS[h % BANNER_GRADIENTS.length];
}


export function MyClasses() {
  const { user } = useAuth();

  const { data: classes, isLoading } = useQuery({
    queryKey: ["student-enrolled-classes", user?.id],
    enabled: !!user,
    queryFn: async () => {
      // Canonical read: class_enrollments (student_user_id = auth uid, status='active').
      const { data: rows, error } = await (supabase as any)
        .from("class_enrollments")
        .select(
          "class_id, status, classes:classes!class_enrollments_class_id_fkey(id,title,scheduled_at,cohort_label,subject_id,standard_id,tutor_id)",
        )
        .eq("student_user_id", user!.id)
        .eq("status", "active");

      if (error) throw error;

      const list = (rows || [])
        .map((r: any) => r.classes)
        .filter(Boolean) as any[];

      if (list.length === 0) return [] as EnrolledClass[];

      const [subjects, standards, tutors] = await Promise.all([
        (supabase as any).from("subjects").select("id,name"),
        (supabase as any).from("standards").select("id,name"),
        (supabase as any).from("tutors").select("id,name"),
      ]);

      const subj = new Map((subjects.data || []).map((s: any) => [s.id, s.name]));
      const std = new Map((standards.data || []).map((s: any) => [s.id, s.name]));
      const tut = new Map((tutors.data || []).map((t: any) => [t.id, t.name]));

      return list.map<EnrolledClass>((c) => ({
        id: c.id,
        title: c.title,
        cohort_label: c.cohort_label,
        scheduled_at: c.scheduled_at,
        subject_name: (subj.get(c.subject_id) as string) || null,
        standard_name: (std.get(c.standard_id) as string) || null,
        tutor_name: (tut.get(c.tutor_id) as string) || null,
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
              <Skeleton key={i} className="h-56 rounded-3xl" />
            ))}
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
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {classes.map((c) => (
              <Link
                key={c.id}
                to={`/dashboard/classes/${c.id}`}
                className="group bg-white rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col"
              >
                <div
                  className={`relative aspect-video overflow-hidden bg-gradient-to-br ${bannerFor(c.id)}`}
                >
                  <div className="absolute inset-0 flex items-center justify-center">
                    <GraduationCap className="w-14 h-14 text-slate-400/50" strokeWidth={1.25} />
                  </div>
                  <div className="absolute bottom-3 left-3 right-3 flex flex-wrap gap-1.5">
                    {c.subject_name && (
                      <Badge className="rounded-full bg-white/95 text-slate-900 hover:bg-white shadow-sm">
                        {c.subject_name}
                      </Badge>
                    )}
                    {c.standard_name && (
                      <Badge className="rounded-full bg-primary/95 text-primary-foreground hover:bg-primary">
                        {c.standard_name}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="p-5 flex-1 flex flex-col gap-2">
                  <h3 className="font-semibold text-slate-900 line-clamp-1">{c.title}</h3>
                  {c.cohort_label && (
                    <p className="text-xs text-slate-500 line-clamp-1">{c.cohort_label}</p>
                  )}
                  <div className="text-xs text-slate-500 flex items-center gap-3 mt-1">
                    <span className="inline-flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" /> {c.tutor_name || "Tutor"}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(c.scheduled_at).toLocaleDateString()}
                    </span>
                  </div>
                  <span className="mt-3 text-sm font-semibold text-primary inline-flex items-center gap-1 group-hover:gap-2 transition-all">
                    Open class room <ArrowRight className="w-4 h-4" />
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
