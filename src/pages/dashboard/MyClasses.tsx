import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, LayoutGrid, RefreshCw, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { fetchTutorsByClass, type TutorIdentity } from "@/lib/classCovers";
import { STUDY_ART } from "@/lib/classIllustrations";
import {
  StudentClassCard,
  StudentClassCardSkeleton,
  type StudentClassCardData,
} from "@/components/dashboard/classes/StudentClassCard";
import { StudyUpNext, pickUpNext } from "@/components/dashboard/classes/StudyUpNext";

/**
 * Student Study / My Classes.
 *
 * Data contract is unchanged: the rendered collection originates from the
 * student's canonical `class_enrollments` rows (status = 'active') and the
 * `classes` rows RLS lets them read, so tenant isolation and enrolment gating
 * remain server-enforced. This pass redesigns only the presentation layer.
 */

type Filter = "all" | "today" | "enrolled";

const FILTERS: { key: Filter; label: string; icon: typeof LayoutGrid }[] = [
  { key: "all", label: "All", icon: LayoutGrid },
  { key: "today", label: "Today", icon: CalendarDays },
  { key: "enrolled", label: "Enrolled", icon: Users },
];

function Art({ src, className }: { src: string; className?: string }) {
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      className={cn("pointer-events-none select-none object-contain", className)}
    />
  );
}

function isToday(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function MyClasses() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<Filter>("all");

  const { data: classes, isLoading, isError, error, refetch, isFetching } = useQuery({
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
      if (classIds.length === 0) return [] as StudentClassCardData[];

      // Step 2 — classes visible under RLS (tenant + enrolment enforced server-side).
      const { data: classRows, error: classErr } = await supabase
        .from("classes")
        .select(
          "id,title,scheduled_at,cohort_label,schedule_label,subject_id,cover_image_path,cover_image_updated_at",
        )
        .in("id", classIds);
      if (classErr) throw classErr;

      // Step 3 — subjects for those classes.
      const subjectIds = Array.from(
        new Set((classRows || []).map((c) => c.subject_id).filter(Boolean) as string[]),
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
        (classRows || []).map((c) => c.id as string),
      );

      return (classRows || []).map<StudentClassCardData>((c) => ({
        id: c.id as string,
        title: c.title as string,
        cohort_label: (c.cohort_label as string | null) ?? null,
        schedule_label: (c.schedule_label as string | null) ?? null,
        scheduled_at: (c.scheduled_at as string | null) ?? null,
        subject_name: c.subject_id ? subjectMap.get(c.subject_id as string) || null : null,
        tutors: (tutorsByClass.get(c.id as string) || []) as TutorIdentity[],
      }));
    },
  });

  const ordered = useMemo(() => {
    const list = [...(classes || [])];
    list.sort((a, b) => {
      const ta = a.scheduled_at ? new Date(a.scheduled_at).getTime() : Number.MAX_SAFE_INTEGER;
      const tb = b.scheduled_at ? new Date(b.scheduled_at).getTime() : Number.MAX_SAFE_INTEGER;
      return ta - tb || a.title.localeCompare(b.title);
    });
    return list;
  }, [classes]);

  const visible = useMemo(
    () => (filter === "today" ? ordered.filter((c) => isToday(c.scheduled_at)) : ordered),
    [ordered, filter],
  );

  const upNext = useMemo(() => pickUpNext(ordered), [ordered]);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[linear-gradient(180deg,#f7faff_0%,#f9fbff_45%,#f6f8fd_100%)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[300px] bg-[radial-gradient(120%_100%_at_50%_0%,rgba(99,102,241,0.10),transparent_70%)]"
      />
      <div
        className="relative mx-auto w-full max-w-3xl px-4 pb-10 md:px-6"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)" }}
      >
        {/* Header */}
        <header className="relative mb-5">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <Art src={STUDY_ART.starYellow} className="absolute right-[22%] top-1 h-6 w-6 opacity-90" />
            <Art src={STUDY_ART.sparklePurple} className="absolute right-[10%] top-2 h-5 w-5 opacity-80" />
            <Art src={STUDY_ART.cloud} className="absolute -right-1 top-8 h-14 w-14 opacity-70" />
          </div>
          <div className="relative flex items-center gap-3.5 pr-24">
            <span className="flex h-[62px] w-[62px] shrink-0 items-center justify-center rounded-full bg-white/85 shadow-[0_8px_22px_rgba(15,23,42,0.08)] ring-1 ring-inset ring-white">
              <img
                src={STUDY_ART.graduationCap}
                alt=""
                aria-hidden="true"
                className="h-10 w-10 object-contain drop-shadow-[0_3px_6px_rgba(15,23,42,0.18)]"
              />
            </span>
            <div className="min-w-0">
              <h1 className="text-[26px] font-bold leading-tight tracking-[-0.02em] text-slate-900 md:text-3xl">
                My Classes
              </h1>
              <p className="mt-0.5 text-[13px] leading-snug text-slate-500 md:text-sm">
                Enrolled cohorts you can access right now.
              </p>
            </div>
          </div>
        </header>

        {/* Filters */}
        <div
          role="group"
          aria-label="Filter classes"
          className="mb-5 flex gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {FILTERS.map(({ key, label, icon: Icon }) => {
            const active = filter === key;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(key)}
                className={cn(
                  "inline-flex min-h-[46px] shrink-0 items-center gap-2 rounded-full px-5 text-[15px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100",
                  active
                    ? "bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--primary))]/85 text-primary-foreground shadow-[0_8px_20px_rgba(37,99,235,0.28)]"
                    : "border border-slate-200 bg-white text-slate-700 shadow-[0_4px_14px_rgba(15,23,42,0.05)]",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
              </button>
            );
          })}
        </div>

        {/* States */}
        {isLoading ? (
          <div className="space-y-4">
            <StudentClassCardSkeleton />
            <StudentClassCardSkeleton />
          </div>
        ) : isError ? (
          <div className="rounded-[26px] border border-slate-200/80 bg-white px-5 py-10 text-center shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
            <Art src={STUDY_ART.error} className="mx-auto mb-4 h-16 w-16" />
            <p className="text-[17px] font-bold text-slate-900">Couldn't load your classes</p>
            <p className="mx-auto mt-1 max-w-sm text-[13px] text-slate-500">
              {(error as Error)?.message || "Please try again in a moment."}
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-full bg-primary px-5 text-[14px] font-semibold text-primary-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2"
            >
              <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} aria-hidden="true" />
              Retry
            </button>
          </div>
        ) : ordered.length === 0 ? (
          <div className="relative overflow-hidden rounded-[26px] border border-dashed border-slate-200 bg-white/85 px-5 py-12 text-center shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
            <Art src={STUDY_ART.cloud} className="absolute left-4 top-4 h-10 w-10 opacity-50" />
            <Art src={STUDY_ART.starYellow} className="absolute right-6 top-6 h-5 w-5 opacity-70" />
            <Art src={STUDY_ART.emptyClasses} className="mx-auto mb-4 h-20 w-20" />
            <p className="text-[18px] font-bold text-slate-900">No classes yet</p>
            <p className="mx-auto mt-1 max-w-sm text-[13px] text-slate-500">
              You don't have any active class enrolments right now. Once an admin enrols you, your
              class will appear here.
            </p>
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-[26px] border border-dashed border-slate-200 bg-white/85 px-5 py-12 text-center">
            <Art src={STUDY_ART.alarmClock} className="mx-auto mb-4 h-16 w-16" />
            <p className="text-[17px] font-bold text-slate-900">Nothing on today</p>
            <p className="mx-auto mt-1 max-w-sm text-[13px] text-slate-500">
              None of your enrolled classes are scheduled for today.
            </p>
          </div>
        ) : (
          <>
            {/* Mobile: horizontal snap carousel. Tablet+: stacked full cards. */}
            <div
              className="-mx-4 flex snap-x snap-mandatory gap-3.5 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-1 sm:gap-5 sm:overflow-visible sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              aria-label="Enrolled classes"
            >
              {visible.map((c) => (
                <div
                  key={c.id}
                  className="w-[88%] max-w-[420px] shrink-0 snap-center sm:w-full sm:max-w-none"
                >
                  <StudentClassCard klass={c} />
                </div>
              ))}
            </div>

            {visible.length > 1 && (
              <p className="mt-2 text-center text-[12px] text-slate-400 sm:hidden">
                Swipe for your other classes
              </p>
            )}

            <StudyUpNext klass={upNext} />
          </>
        )}
      </div>
    </div>
  );
}
