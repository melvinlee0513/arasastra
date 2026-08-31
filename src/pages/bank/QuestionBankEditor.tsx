/**
 * Question Bank editor (tutor / admin, light mode).
 *
 * Creates and edits a bank question. Saving here NEVER touches a quiz: quizzes
 * hold their own copy, taken at the moment the question was added.
 *
 * Validation mirrors what the server enforces rather than being decorative —
 * the RPC rejects an empty question, and a choice question with no correct
 * option would grade every attempt wrong, so the form refuses to save one.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/hooks/useAuth";
import {
  bankKeys, getBankQuestion, listQuestionBank, mapBankError, saveBankQuestion,
} from "@/lib/questionBank";
import { AnalyticsShell, Skel } from "@/components/quiz/analytics/AnalyticsChrome";
import { BuilderSection } from "@/components/quiz/builder/QuizBuilderChrome";

interface OptionDraft {
  key: string;
  option_text: string;
  is_correct: boolean;
}

const LETTERS = "ABCDEFGH";
const rid = () => Math.random().toString(36).slice(2, 10);

/** Types this editor can save today. Phase 5 widens this list. */
const TYPES = [
  { value: "mcq", label: "Multiple choice" },
  { value: "true_false", label: "True / False" },
] as const;

const TRUE_FALSE_OPTIONS = (): OptionDraft[] => [
  { key: rid(), option_text: "True", is_correct: true },
  { key: rid(), option_text: "False", is_correct: false },
];

export function QuestionBankEditor({ variant }: { variant: "tutor" | "admin" }) {
  const { questionId } = useParams<{ questionId?: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { currentTenantId } = useTenant();
  const { user } = useAuth();
  const root = variant === "admin" ? "/admin/question-bank" : "/tutor/question-bank";
  const isNew = !questionId || questionId === "new";

  const [question, setQuestion] = useState("");
  const [type, setType] = useState<string>("mcq");
  const [points, setPoints] = useState(1);
  const [explanation, setExplanation] = useState("");
  const [topic, setTopic] = useState("");
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [options, setOptions] = useState<OptionDraft[]>([
    { key: rid(), option_text: "", is_correct: true },
    { key: rid(), option_text: "", is_correct: false },
  ]);
  const [hydrated, setHydrated] = useState(false);

  const home = useQuery({
    queryKey: bankKeys.home(currentTenantId),
    enabled: !!user,
    queryFn: listQuestionBank,
    staleTime: 60_000,
  });

  const existing = useQuery({
    queryKey: bankKeys.question(currentTenantId, questionId ?? ""),
    enabled: !isNew && !!user,
    queryFn: () => getBankQuestion(questionId!),
  });

  // Hydrate once. Re-running on every refetch would discard typing in progress.
  useEffect(() => {
    if (isNew || hydrated || !existing.data) return;
    const d = existing.data;
    setQuestion(d.question);
    setType(d.question_type);
    setPoints(d.points);
    setExplanation(d.explanation ?? "");
    setTopic(d.topic ?? "");
    setCollectionId(d.collection_id);
    setSubjectId(d.subject_id);
    setOptions(
      d.options.length > 0
        ? d.options.map((o) => ({ key: o.id, option_text: o.option_text, is_correct: o.is_correct }))
        : [{ key: rid(), option_text: "", is_correct: true }],
    );
    setHydrated(true);
  }, [existing.data, isNew, hydrated]);

  /** True/False has a fixed option set; switching to it replaces the drafts. */
  function changeType(next: string) {
    setType(next);
    if (next === "true_false") setOptions(TRUE_FALSE_OPTIONS());
  }

  const filled = options.filter((o) => o.option_text.trim().length > 0);
  const errors = useMemo(() => {
    const e: string[] = [];
    if (!question.trim()) e.push("Enter the question text.");
    if (filled.length < 2) e.push("Add at least two answer options.");
    if (!filled.some((o) => o.is_correct)) e.push("Mark one option as the correct answer.");
    return e;
  }, [question, filled]);

  const save = useMutation({
    mutationFn: () =>
      saveBankQuestion({
        id: isNew ? null : questionId,
        question: question.trim(),
        questionType: type,
        points,
        explanation: explanation.trim() || null,
        topic: topic.trim() || null,
        collectionId,
        subjectId,
        options: filled.map((o) => ({ option_text: o.option_text.trim(), is_correct: o.is_correct })),
      }),
    onSuccess: (res) => {
      toast.success(isNew ? "Question added." : "Question saved.");
      void qc.invalidateQueries({ queryKey: ["question-bank"] });
      navigate(`${root}/questions/${res.id}`, { replace: true });
    },
    onError: (err) => toast.error(mapBankError(err, "Couldn't save the question.")),
  });

  const loading = !isNew && existing.isLoading;

  return (
    <AnalyticsShell
      title={isNew ? "New question" : "Edit question"}
      backTo={isNew ? `${root}/questions` : `${root}/questions/${questionId}`}
    >
      {loading ? (
        <div className="space-y-3">
          <Skel className="h-[160px] rounded-3xl" />
          <Skel className="h-[240px] rounded-3xl" />
        </div>
      ) : (
        <div className="space-y-4 pb-[calc(env(safe-area-inset-bottom)+96px)]">
          <BuilderSection title="Question" description="What students will be asked.">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-[12.5px] font-semibold text-slate-700">
                  Question type
                </span>
                <Select value={type} onValueChange={changeType}>
                  <SelectTrigger className="h-12 rounded-2xl border-slate-200 bg-white text-[14px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[12.5px] font-semibold text-slate-700">Points</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Fewer points"
                    onClick={() => setPoints((p) => Math.max(0, p - 1))}
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-[18px] font-bold active:scale-95"
                  >
                    −
                  </button>
                  <span className="flex h-12 flex-1 items-center justify-center rounded-2xl border border-slate-200 bg-white text-[15px] font-bold tabular-nums">
                    {points}
                  </span>
                  <button
                    type="button"
                    aria-label="More points"
                    onClick={() => setPoints((p) => Math.min(1000, p + 1))}
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-[18px] font-bold active:scale-95"
                  >
                    +
                  </button>
                </div>
              </label>
            </div>

            <label className="mt-3 block">
              <span className="mb-1.5 block text-[12.5px] font-semibold text-slate-700">
                Question text
              </span>
              <Textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value.slice(0, 2000))}
                rows={3}
                placeholder="What is the unit of force in the SI system?"
                className="rounded-2xl border-slate-200 bg-white text-[14px]"
              />
              <span className="mt-1 block text-right text-[11.5px] text-slate-400">
                {question.length}/2000
              </span>
            </label>
          </BuilderSection>

          <BuilderSection
            title="Answers"
            description={type === "true_false"
              ? "Mark whether the statement is true or false."
              : "Mark the one correct answer."}
          >
            <ul className="space-y-2">
              {options.map((o, i) => (
                <li
                  key={o.key}
                  className={cn(
                    "flex items-center gap-2 rounded-2xl border p-2",
                    o.is_correct ? "border-emerald-200 bg-emerald-50/60" : "border-slate-200 bg-white",
                  )}
                >
                  <button
                    type="button"
                    onClick={() =>
                      // Single-answer semantics for both current types.
                      setOptions((prev) => prev.map((x, j) => ({ ...x, is_correct: j === i })))
                    }
                    aria-label={`Mark option ${LETTERS[i] ?? i + 1} as correct`}
                    aria-pressed={o.is_correct}
                    className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[13px] font-black transition active:scale-95",
                      o.is_correct ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-600",
                    )}
                  >
                    {o.is_correct ? <Check className="h-4 w-4" aria-hidden="true" /> : (LETTERS[i] ?? i + 1)}
                  </button>
                  <Input
                    value={o.option_text}
                    onChange={(e) =>
                      setOptions((prev) =>
                        prev.map((x, j) => (j === i ? { ...x, option_text: e.target.value } : x)))
                    }
                    disabled={type === "true_false"}
                    aria-label={`Option ${LETTERS[i] ?? i + 1} text`}
                    placeholder={`Option ${LETTERS[i] ?? i + 1}`}
                    className="h-11 min-w-0 flex-1 rounded-xl border-slate-200 bg-white text-[14px] disabled:opacity-70"
                  />
                  {type !== "true_false" && options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))}
                      aria-label={`Remove option ${LETTERS[i] ?? i + 1}`}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-400 transition active:scale-95"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                </li>
              ))}
            </ul>

            {type !== "true_false" && options.length < 8 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setOptions((p) => [...p, { key: rid(), option_text: "", is_correct: false }])}
                className="mt-2 min-h-[44px] w-full rounded-2xl border-dashed border-slate-300 text-[13.5px] font-bold text-quiz-accent-strong"
              >
                <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" /> Add option
              </Button>
            )}
          </BuilderSection>

          <BuilderSection title="Organise" description="Optional. Makes it findable later.">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-[12.5px] font-semibold text-slate-700">
                  Collection
                </span>
                <Select
                  value={collectionId ?? "none"}
                  onValueChange={(v) => setCollectionId(v === "none" ? null : v)}
                >
                  <SelectTrigger className="h-12 rounded-2xl border-slate-200 bg-white text-[14px]">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No collection</SelectItem>
                    {(home.data?.collections ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[12.5px] font-semibold text-slate-700">Subject</span>
                <Select
                  value={subjectId ?? "none"}
                  onValueChange={(v) => setSubjectId(v === "none" ? null : v)}
                >
                  <SelectTrigger className="h-12 rounded-2xl border-slate-200 bg-white text-[14px]">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No subject</SelectItem>
                    {(home.data?.subjects ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            </div>

            <label className="mt-3 block">
              <span className="mb-1.5 block text-[12.5px] font-semibold text-slate-700">
                Topic or chapter
              </span>
              <Input
                value={topic}
                onChange={(e) => setTopic(e.target.value.slice(0, 80))}
                placeholder="Measurement"
                className="h-12 rounded-2xl border-slate-200 bg-white text-[14px]"
              />
            </label>

            <label className="mt-3 block">
              <span className="mb-1.5 block text-[12.5px] font-semibold text-slate-700">
                Explanation <span className="font-normal text-slate-400">(optional)</span>
              </span>
              <Textarea
                value={explanation}
                onChange={(e) => setExplanation(e.target.value.slice(0, 500))}
                rows={3}
                placeholder="Shown to students after the answer is revealed."
                className="rounded-2xl border-slate-200 bg-white text-[14px]"
              />
              <span className="mt-1 block text-right text-[11.5px] text-slate-400">
                {explanation.length}/500
              </span>
            </label>
          </BuilderSection>

          {errors.length > 0 && (
            <div className="flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
              <ul className="min-w-0 space-y-0.5 text-[12.5px] text-amber-900">
                {errors.map((e) => <li key={e}>{e}</li>)}
              </ul>
            </div>
          )}

          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-3 backdrop-blur">
            <div className="mx-auto w-full max-w-3xl">
              <Button
                onClick={() => save.mutate()}
                disabled={errors.length > 0 || save.isPending}
                className="min-h-[52px] w-full rounded-full bg-gradient-to-r from-violet-600 to-quiz-accent text-[15.5px] font-extrabold text-white"
              >
                {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                Save question
              </Button>
            </div>
          </div>
        </div>
      )}
    </AnalyticsShell>
  );
}

export default QuestionBankEditor;
