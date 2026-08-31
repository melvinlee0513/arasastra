/**
 * Student performance list (tutor / admin, light mode).
 *
 * One mobile card per student, never a squeezed desktop table. Ranking,
 * accuracy and the weak-question count all arrive pre-computed from
 * `get_quiz_student_analytics` — a single request for the whole cohort rather
 * than one per student.
 *
 * Search and the filter chips narrow an already-loaded list, so typing does not
 * fire a request per keystroke.
 */
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, ChevronRight, Clock, Download, FileText, Loader2, Search, Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { QUIZ_ART } from "@/lib/quizArt";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/hooks/useAuth";
import {
  analyticsKeys, csvFilename, downloadCsv, formatSeconds, getQuizStudentAnalytics,
  mapAnalyticsError, studentsToCsv,
} from "@/lib/quizAnalytics";
import {
  AccuracyBar, AnalyticsEmpty, AnalyticsError, AnalyticsShell, QuizContextCard, Skel,
  FilterChips,
} from "@/components/quiz/analytics/AnalyticsChrome";

type Filter = "all" | "attention" | "top";

export function QuizStudentAnalytics({ variant }: { variant: "tutor" | "admin" }) {
  const { classId, quizId } = useParams<{ classId: string; quizId: string }>();
  const navigate = useNavigate();
  const { currentTenantId } = useTenant();
  const { user } = useAuth();
  const base = variant === "admin" ? `/admin/classes/${classId}` : `/tutor/classes/${classId}`;

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [exporting, setExporting] = useState(false);

  const q = useQuery({
    queryKey: analyticsKeys.students(currentTenantId, quizId ?? ""),
    enabled: !!quizId && !!user,
    queryFn: () => getQuizStudentAnalytics(quizId!),
    staleTime: 30_000,
  });

  const rows = useMemo(() => {
    const list = q.data?.students ?? [];
    const term = search.trim().toLowerCase();
    return list.filter((s) => {
      if (term && !s.display_name.toLowerCase().includes(term)) return false;
      // "Needs attention" is the server's own difficulty band, not a second
      // threshold invented here.
      if (filter === "attention") return s.band === "difficult" || s.weak_questions > 0;
      if (filter === "top") return s.band === "strong";
      return true;
    });
  }, [q.data, search, filter]);

  async function onExport() {
    if (!q.data) return;
    setExporting(true);
    try {
      downloadCsv(csvFilename(q.data.quiz_title), studentsToCsv(q.data));
      toast.success(`Exported ${q.data.students.length} students.`);
    } catch {
      toast.error("Couldn't export results.");
    } finally {
      setExporting(false);
    }
  }

  if (q.isError) {
    return (
      <AnalyticsShell title="Students" backTo={`${base}/quizzes/${quizId}/analytics`}>
        <AnalyticsError message={mapAnalyticsError(q.error)} onRetry={() => void q.refetch()} />
      </AnalyticsShell>
    );
  }

  return (
    <AnalyticsShell title="Students" backTo={`${base}/quizzes/${quizId}/analytics`}>
      {q.isLoading || !q.data ? (
        <div className="space-y-3">
          <Skel className="h-[104px] rounded-3xl" />
          <Skel className="h-[48px] rounded-2xl" />
          <Skel className="h-[112px] rounded-3xl" />
          <Skel className="h-[112px] rounded-3xl" />
        </div>
      ) : (
        <>
          <QuizContextCard
            title={q.data.quiz_title}
            subtitle={`${q.data.students.length} student${q.data.students.length === 1 ? "" : "s"} · ${q.data.question_count} questions`}
            art={QUIZ_ART.owlGamingCompact}
            action={
              <Button
                onClick={onExport}
                disabled={exporting || q.data.students.length === 0}
                variant="outline"
                className="min-h-[44px] rounded-full border-slate-200 bg-white px-4 text-[13.5px] font-bold text-slate-700"
              >
                {exporting
                  ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
                  : <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />}
                Export CSV
              </Button>
            }
          />

          <div className="relative mt-4">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search students…"
              aria-label="Search students by name"
              className="h-12 rounded-2xl border-slate-200 bg-white pl-10 text-[14px]"
            />
          </div>

          <div className="mt-3">
            <FilterChips<Filter>
              label="Filter students"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All" },
                { value: "attention", label: "Needs attention", icon: <AlertTriangle className="h-4 w-4" aria-hidden="true" /> },
                { value: "top", label: "Top", icon: <Star className="h-4 w-4" aria-hidden="true" /> },
              ]}
            />
          </div>

          {q.data.students.length === 0 ? (
            <div className="mt-4">
              <AnalyticsEmpty
                art={QUIZ_ART.hourglass}
                title="No completed attempts"
                body="Nobody has finished this quiz yet. Results appear here as students submit."
              />
            </div>
          ) : rows.length === 0 ? (
            <div className="mt-4">
              <AnalyticsEmpty
                art={QUIZ_ART.owlSad}
                title="No matching students"
                body={search ? `Nothing matches “${search}”.` : "No students fall into this filter."}
                action={
                  <Button
                    variant="outline"
                    className="min-h-[44px] rounded-full"
                    onClick={() => { setSearch(""); setFilter("all"); }}
                  >
                    Clear filters
                  </Button>
                }
              />
            </div>
          ) : (
            <ul className="mt-4 space-y-2.5">
              {rows.map((s) => {
                const attention = s.band === "difficult";
                return (
                  <li key={s.user_id}>
                    <button
                      type="button"
                      onClick={() =>
                        navigate(`${base}/quizzes/${quizId}/analytics/students/${s.user_id}`)
                      }
                      className={cn(
                        "w-full rounded-3xl border p-3.5 text-left shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition active:scale-[0.99]",
                        attention ? "border-amber-200 bg-amber-50/60" : "border-slate-200/80 bg-white",
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-[14px] font-bold text-slate-600">
                          {s.avatar_url
                            ? <img src={s.avatar_url} alt="" className="h-full w-full object-cover" />
                            : s.display_name.slice(0, 1).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-extrabold text-slate-900">
                            {s.display_name}
                          </span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px]">
                            <span
                              className={cn(
                                "font-bold",
                                attention ? "text-amber-700"
                                  : s.band === "strong" ? "text-emerald-600" : "text-slate-600",
                              )}
                            >
                              {s.accuracy_pct}% accuracy
                            </span>
                            <span className="font-semibold text-slate-500">#{s.rank}</span>
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block text-[17px] font-extrabold leading-none tabular-nums text-slate-900">
                            {s.score}
                            <span className="text-[13px] font-bold text-slate-400"> / {s.total_questions}</span>
                          </span>
                        </span>
                        {attention && (
                          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" aria-label="Needs attention" />
                        )}
                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                      </div>

                      <AccuracyBar
                        className="mt-2.5"
                        pct={s.accuracy_pct}
                        tone={attention ? "warn" : s.band === "strong" ? "good" : "accent"}
                      />

                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          {formatSeconds(s.avg_seconds_per_question)} avg
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          {s.weak_questions === 0
                            ? "0 weak questions"
                            : `${s.weak_questions} weak question${s.weak_questions === 1 ? "" : "s"}`}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </AnalyticsShell>
  );
}

export default QuizStudentAnalytics;
