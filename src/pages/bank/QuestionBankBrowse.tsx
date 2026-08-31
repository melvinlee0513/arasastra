/**
 * Question browser — the collection page and the "all questions" view.
 *
 * Search, filters and sort are all server-side arguments to
 * `search_question_bank`; none of them is a decorative chip. Search is
 * debounced so typing does not fire a request per keystroke.
 *
 * Multi-select drives a sticky action bar. At 320px the actions stack rather
 * than overflowing.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpDown, Copy, Loader2, MoreVertical, Plus, Search,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectBox } from "@/components/quiz/bank/SelectBox";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { QUIZ_ART } from "@/lib/quizArt";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/hooks/useAuth";
import {
  BANK_SORT_LABEL, bankKeys, duplicateBankQuestions, listQuestionBank,
  mapBankError, searchQuestionBank, typeLabel, usageLabel, type BankSort,
} from "@/lib/questionBank";
import {
  AnalyticsEmpty, AnalyticsError, AnalyticsShell, FilterChips, Skel,
} from "@/components/quiz/analytics/AnalyticsChrome";
import { AddToQuizSheet } from "@/components/quiz/bank/AddToQuizSheet";

const TYPE_FILTERS = [
  { value: "all", label: "All" },
  { value: "mcq", label: "MCQ" },
  { value: "true_false", label: "T/F" },
] as const;

export function QuestionBankBrowse({ variant }: { variant: "tutor" | "admin" }) {
  const { collectionId } = useParams<{ collectionId?: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { currentTenantId } = useTenant();
  const { user } = useAuth();
  const root = variant === "admin" ? "/admin/question-bank" : "/tutor/question-bank";

  const [raw, setRaw] = useState(params.get("q") ?? "");
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [type, setType] = useState<string>("all");
  const [topic, setTopic] = useState<string | null>(null);
  const [sort, setSort] = useState<BankSort>("recent");
  const [selected, setSelected] = useState<string[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Debounce: one request 300ms after typing stops, not one per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(raw), 300);
    return () => clearTimeout(t);
  }, [raw]);

  const args = useMemo(
    () => ({
      search: search || null,
      collectionId: collectionId ?? null,
      questionType: type === "all" ? null : type,
      topic,
      sort,
    }),
    [search, collectionId, type, topic, sort],
  );

  const home = useQuery({
    queryKey: bankKeys.home(currentTenantId),
    enabled: !!user,
    queryFn: listQuestionBank,
    staleTime: 60_000,
  });

  const q = useQuery({
    queryKey: bankKeys.search(currentTenantId, args),
    enabled: !!user,
    queryFn: () => searchQuestionBank(args),
    staleTime: 15_000,
  });

  const collection = home.data?.collections.find((c) => c.id === collectionId);
  const rows = q.data?.questions ?? [];
  const topics = q.data?.topics ?? [];

  const dup = useMutation({
    mutationFn: (ids: string[]) => duplicateBankQuestions(ids),
    onSuccess: (res) => {
      toast.success(`Duplicated ${res.created} question${res.created === 1 ? "" : "s"}.`);
      setSelected([]);
      void qc.invalidateQueries({ queryKey: ["question-bank"] });
    },
    onError: (err) => toast.error(mapBankError(err, "Couldn't duplicate.")),
  });

  const allSelected = rows.length > 0 && selected.length === rows.length;
  function toggleAll() {
    setSelected(allSelected ? [] : rows.map((r) => r.id));
  }
  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  if (q.isError) {
    return (
      <AnalyticsShell title={collection?.name ?? "Questions"} backTo={root}>
        <AnalyticsError message={mapBankError(q.error, "Couldn't load questions.")}
          onRetry={() => void q.refetch()} />
      </AnalyticsShell>
    );
  }

  return (
    <AnalyticsShell
      title={collection?.name ?? "All questions"}
      backTo={root}
      action={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Sort questions"
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition active:scale-95"
            >
              <ArrowUpDown className="h-4 w-4" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {(Object.keys(BANK_SORT_LABEL) as BankSort[]).map((s) => (
              <DropdownMenuItem key={s} onClick={() => setSort(s)}>
                {sort === s ? "✓ " : ""}
                {BANK_SORT_LABEL[s]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      }
    >
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        />
        <Input
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={collection ? "Search in this collection…" : "Search questions…"}
          aria-label="Search questions"
          className="h-12 rounded-2xl border-slate-200 bg-white pl-10 text-[14px]"
        />
      </div>

      {topics.length > 0 && (
        <div className="mt-3">
          <FilterChips<string>
            label="Filter by topic"
            value={topic ?? "all"}
            onChange={(v) => setTopic(v === "all" ? null : v)}
            options={[{ value: "all", label: "All topics" },
              ...topics.map((t) => ({ value: t, label: t }))]}
          />
        </div>
      )}

      <div className="mt-3">
        <FilterChips<string>
          label="Filter by question type"
          value={type}
          onChange={setType}
          options={TYPE_FILTERS.map((t) => ({ value: t.value, label: t.label }))}
        />
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-[13px] font-semibold text-slate-600">
          {q.isLoading ? "Loading…" : `${q.data?.total ?? 0} question${(q.data?.total ?? 0) === 1 ? "" : "s"}`}
        </p>
        {rows.length > 0 && (
          <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-slate-700">
            Select all
            <SelectBox checked={allSelected} onCheckedChange={toggleAll} label="Select all questions" />
          </span>
        )}
      </div>

      {q.isLoading ? (
        <div className="space-y-2">
          <Skel className="h-[86px] rounded-2xl" />
          <Skel className="h-[86px] rounded-2xl" />
          <Skel className="h-[86px] rounded-2xl" />
        </div>
      ) : rows.length === 0 ? (
        <AnalyticsEmpty
          art={QUIZ_ART.owlSad}
          title={search || topic || type !== "all" ? "No matching questions" : "No questions yet"}
          body={
            search || topic || type !== "all"
              ? "Nothing matches these filters. Try clearing them."
              : "Add your first question and it becomes reusable across every quiz you build."
          }
          action={
            search || topic || type !== "all" ? (
              <Button
                variant="outline"
                className="min-h-[44px] rounded-full"
                onClick={() => { setRaw(""); setSearch(""); setTopic(null); setType("all"); }}
              >
                Clear filters
              </Button>
            ) : (
              <Button
                className="min-h-[44px] rounded-full bg-quiz-accent text-white"
                onClick={() => navigate(`${root}/questions/new`)}
              >
                <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" /> Add question
              </Button>
            )
          }
        />
      ) : (
        <ul className={cn("space-y-2", selected.length > 0 && "pb-[120px]")}>
          {rows.map((r) => {
            const isSel = selected.includes(r.id);
            return (
              <li
                key={r.id}
                className={cn(
                  "flex items-start gap-2.5 rounded-2xl border p-3 shadow-[0_8px_30px_rgb(0,0,0,0.04)]",
                  isSel ? "border-quiz-accent bg-quiz-tint" : "border-slate-200/80 bg-white",
                )}
              >
                <SelectBox
                  checked={isSel}
                  onCheckedChange={() => toggle(r.id)}
                  label={`Select: ${r.question.slice(0, 60)}`}
                />
                <button
                  type="button"
                  onClick={() => navigate(`${root}/questions/${r.id}`)}
                  className="min-w-0 flex-1 py-1 text-left"
                >
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-lg bg-quiz-tint px-1.5 py-0.5 text-[11px] font-black text-quiz-accent-strong">
                      {typeLabel(r.question_type)}
                    </span>
                    {r.archived && (
                      <span className="rounded-lg bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500">
                        Archived
                      </span>
                    )}
                  </span>
                  <span className="mt-1 line-clamp-2 block text-[13.5px] font-semibold leading-snug text-slate-900">
                    {r.question}
                  </span>
                  <span className="mt-0.5 block truncate text-[11.5px] text-slate-500">
                    {r.topic ?? "No topic"}
                  </span>
                </button>
                <span className="shrink-0 text-right">
                  <span className="block whitespace-nowrap text-[12.5px] font-bold text-slate-800">
                    {r.points} pt{r.points === 1 ? "" : "s"}
                  </span>
                  <span className="mt-0.5 block whitespace-nowrap text-[11px] text-slate-500">
                    {usageLabel(r.usage_count)}
                  </span>
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Actions for: ${r.question.slice(0, 40)}`}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-400 transition active:scale-95"
                    >
                      <MoreVertical className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => navigate(`${root}/questions/${r.id}`)}>
                      Open
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => dup.mutate([r.id])}>
                      <Copy className="mr-2 h-4 w-4" aria-hidden="true" /> Duplicate
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })}
        </ul>
      )}

      {/* Sticky multi-select bar. Stacks at the narrowest widths so three
          controls never overflow a 320px screen. */}
      {selected.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-3 backdrop-blur">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 min-[380px]:flex-row min-[380px]:items-center">
            <button
              type="button"
              onClick={() => setSelected([])}
              className="flex min-h-[44px] shrink-0 items-center gap-2 rounded-full bg-quiz-tint px-3 text-left"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-quiz-accent text-[12px] font-black text-white">
                {selected.length}
              </span>
              <span className="text-[12.5px] font-semibold leading-tight text-slate-700">
                selected
                <span className="block text-[11px] font-normal text-slate-500">Tap to clear</span>
              </span>
            </button>
            <div className="flex flex-1 gap-2">
              <Button
                variant="outline"
                onClick={() => dup.mutate(selected)}
                disabled={dup.isPending}
                className="min-h-[48px] flex-1 shrink-0 rounded-full border-slate-200 text-[14px] font-bold"
              >
                {dup.isPending
                  ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
                  : <Copy className="mr-1.5 h-4 w-4" aria-hidden="true" />}
                Duplicate
              </Button>
              <Button
                onClick={() => setSheetOpen(true)}
                className="min-h-[48px] flex-1 shrink-0 rounded-full bg-gradient-to-r from-violet-600 to-quiz-accent text-[14.5px] font-extrabold text-white"
              >
                Add to quiz
              </Button>
            </div>
          </div>
        </div>
      )}

      <AddToQuizSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        questionIds={selected}
        variant={variant}
        onAdded={() => {
          setSelected([]);
          void qc.invalidateQueries({ queryKey: ["question-bank"] });
        }}
      />
    </AnalyticsShell>
  );
}

export default QuestionBankBrowse;
