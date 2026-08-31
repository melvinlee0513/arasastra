/**
 * Question Bank home (tutor / admin, light mode).
 *
 * Build once, reuse anywhere. Collections, subjects and counts are all real:
 * subjects come from the centre's canonical curriculum data, and "Used N times"
 * is counted from the quiz questions that were copied out of the bank rather
 * than from a stored tally someone has to remember to increment.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, FolderOpen, Layers, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { QUIZ_ART } from "@/lib/quizArt";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/hooks/useAuth";
import {
  bankKeys, listQuestionBank, mapBankError, typeLabel, usageLabel,
} from "@/lib/questionBank";
import {
  AnalyticsEmpty, AnalyticsError, AnalyticsShell, SectionHeader, Skel,
} from "@/components/quiz/analytics/AnalyticsChrome";
import { BuilderArt } from "@/components/quiz/builder/QuizBuilderChrome";

export function QuestionBankHome({ variant }: { variant: "tutor" | "admin" }) {
  const navigate = useNavigate();
  const { currentTenantId } = useTenant();
  const { user } = useAuth();
  const root = variant === "admin" ? "/admin/question-bank" : "/tutor/question-bank";
  const [search, setSearch] = useState("");

  const q = useQuery({
    queryKey: bankKeys.home(currentTenantId),
    enabled: !!user,
    queryFn: listQuestionBank,
    staleTime: 30_000,
  });

  function submitSearch() {
    const term = search.trim();
    navigate(term ? `${root}/questions?q=${encodeURIComponent(term)}` : `${root}/questions`);
  }

  if (q.isError) {
    return (
      <AnalyticsShell title="Question Bank" backTo={variant === "admin" ? "/admin" : "/tutor"}>
        <AnalyticsError message={mapBankError(q.error, "Couldn't load the question bank.")}
          onRetry={() => void q.refetch()} />
      </AnalyticsShell>
    );
  }

  const d = q.data;

  return (
    <AnalyticsShell title="Question Bank" backTo={variant === "admin" ? "/admin" : "/tutor"}>
      <p className="-mt-1 mb-4 text-[13.5px] text-slate-500">Build once. Reuse anywhere.</p>

      {q.isLoading || !d ? (
        <div className="space-y-3">
          <Skel className="h-[132px] rounded-3xl" />
          <Skel className="h-[48px] rounded-2xl" />
          <Skel className="h-[120px] rounded-3xl" />
          <Skel className="h-[180px] rounded-3xl" />
        </div>
      ) : (
        <>
          <div className="rounded-3xl border border-quiz-accent/20 bg-quiz-tint p-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-extrabold text-slate-900">Your question library</p>
                {/* A 2-column grid rather than flex-wrap: min-widths plus the
                    owl pushed these onto separate rows at every phone width,
                    when the reference has them side by side. */}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-2xl border border-white bg-white px-2.5 py-2.5">
                    <span className="flex items-center gap-1 text-[11.5px] font-semibold text-slate-500">
                      <Layers className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span className="truncate">Questions</span>
                    </span>
                    <p className="mt-0.5 text-[20px] font-extrabold leading-none text-slate-900">
                      {d.question_count}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white bg-white px-2.5 py-2.5">
                    <span className="flex items-center gap-1 text-[11.5px] font-semibold text-slate-500">
                      <FolderOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span className="truncate">Collections</span>
                    </span>
                    <p className="mt-0.5 text-[20px] font-extrabold leading-none text-slate-900">
                      {d.collection_count}
                    </p>
                  </div>
                </div>
              </div>
              <BuilderArt src={QUIZ_ART.owlGamingCompact} className="h-[76px] w-[76px] shrink-0" />
            </div>
          </div>

          <form
            className="relative mt-4"
            onSubmit={(e) => { e.preventDefault(); submitSearch(); }}
            role="search"
          >
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search questions…"
              aria-label="Search all questions"
              className="h-12 rounded-2xl border-slate-200 bg-white pl-10 text-[14px]"
            />
          </form>

          <SectionHeader title="Collections" to={`${root}/questions`} actionLabel="Browse all" />
          {d.collections.length === 0 ? (
            <AnalyticsEmpty
              art={QUIZ_ART.hourglass}
              title="No collections yet"
              body="Collections group questions by subject or chapter so they're easy to find later."
            />
          ) : (
            // Horizontal rail: the reference layout, and it keeps long
            // collection names from squeezing at 320px.
            <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:-mx-6 sm:px-6">
              {d.collections.map((c) => (
                <li key={c.id} className="w-[168px] shrink-0 snap-start">
                  <button
                    type="button"
                    onClick={() => navigate(`${root}/collections/${c.id}`)}
                    className="h-full w-full rounded-3xl border border-slate-200/80 bg-white p-3.5 text-left shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition active:scale-[0.98]"
                  >
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-quiz-tint text-quiz-accent-strong">
                      <Layers className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="mt-2.5 block truncate text-[14.5px] font-extrabold text-slate-900">
                      {c.name}
                    </span>
                    <span className="mt-0.5 block truncate text-[12px] text-slate-500">
                      {c.subject_name ?? "No subject"}
                    </span>
                    <span className="mt-1.5 block text-[12px] font-semibold text-quiz-accent-strong">
                      {c.question_count} question{c.question_count === 1 ? "" : "s"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <SectionHeader title="Recent questions" to={`${root}/questions`} />
          {d.recent.length === 0 ? (
            <AnalyticsEmpty
              art={QUIZ_ART.owlSad}
              title="No questions yet"
              body="Add your first question and it becomes reusable across every quiz you build."
            />
          ) : (
            <ul className="space-y-2">
              {d.recent.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`${root}/questions/${r.id}`)}
                    className="flex w-full items-start gap-2.5 rounded-2xl border border-slate-200/80 bg-white p-3 text-left shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition active:scale-[0.99]"
                  >
                    <span className="mt-0.5 flex h-6 shrink-0 items-center rounded-lg bg-quiz-tint px-2 text-[11px] font-black text-quiz-accent-strong">
                      {typeLabel(r.question_type)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-[13.5px] font-semibold leading-snug text-slate-900">
                        {r.question}
                      </span>
                      <span className="mt-0.5 block truncate text-[11.5px] text-slate-500">
                        {[r.subject_name, r.topic].filter(Boolean).join(" · ") || "No topic"}
                      </span>
                    </span>
                    <span className="shrink-0 whitespace-nowrap text-right text-[11.5px] font-semibold text-slate-500">
                      {usageLabel(r.usage_count)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="sticky bottom-0 z-30 -mx-4 mt-6 border-t border-slate-200/70 bg-[hsl(250_40%_98%)]/95 px-4 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-3 backdrop-blur sm:-mx-6 sm:px-6">
            <Button
              onClick={() => navigate(`${root}/questions/new`)}
              className="min-h-[52px] w-full rounded-full bg-gradient-to-r from-violet-600 to-quiz-accent text-[15.5px] font-extrabold text-white"
            >
              <Plus className="mr-1.5 h-5 w-5" aria-hidden="true" /> Add question
            </Button>
          </div>
        </>
      )}
    </AnalyticsShell>
  );
}

export default QuestionBankHome;
