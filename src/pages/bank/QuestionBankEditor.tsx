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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/hooks/useAuth";
import {
  CHOICE_TYPES, TEXT_ANSWER_TYPES, bankKeys, getBankQuestion, listQuestionBank,
  mapBankError, saveBankQuestion,
} from "@/lib/questionBank";
import { QUESTION_TYPES } from "@/lib/questionTypes";
import { AnalyticsShell, Skel } from "@/components/quiz/analytics/AnalyticsChrome";
import { BuilderSection } from "@/components/quiz/builder/QuizBuilderChrome";
import { QuestionMediaEditor } from "@/components/quiz/builder/QuestionMediaEditor";
import { sanitizeCrop, type QuestionMediaCrop } from "@/lib/quizMedia";
import { RichTextEditor } from "@/components/richtext/RichTextEditor";
import { RichTextRenderer } from "@/components/richtext/RichTextRenderer";
import type { RichDoc } from "@/lib/richContent";

interface OptionDraft {
  key: string;
  option_text: string;
  /** Canonical rich content; `option_text` stays the plain-text mirror. */
  option_content?: RichDoc | null;
  is_correct: boolean;
}

const LETTERS = "ABCDEFGH";
const rid = () => Math.random().toString(36).slice(2, 10);

/** The canonical six. Every one saves, reloads, publishes, and grades. */
const TYPES = QUESTION_TYPES.map((t) => ({ value: t.value as string, label: t.label }));

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
  const [questionContent, setQuestionContent] = useState<RichDoc | null>(null);
  const [type, setType] = useState<string>("mcq");
  const [points, setPoints] = useState(1);
  const [explanation, setExplanation] = useState("");
  const [explanationContent, setExplanationContent] = useState<RichDoc | null>(null);
  const [media, setMedia] = useState<{
    image_path: string | null;
    image_width: number | null;
    image_height: number | null;
    image_alt: string | null;
    image_crop: QuestionMediaCrop | null;
  }>({ image_path: null, image_width: null, image_height: null, image_alt: "", image_crop: null });
  const [topic, setTopic] = useState("");
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [options, setOptions] = useState<OptionDraft[]>([
    { key: rid(), option_text: "", is_correct: true },
    { key: rid(), option_text: "", is_correct: false },
  ]);
  const [accepted, setAccepted] = useState<string[]>([""]);
  const [matchMode, setMatchMode] = useState<"exact" | "ignore_case">("ignore_case");
  const [numAnswer, setNumAnswer] = useState("");
  const [numTolerance, setNumTolerance] = useState("");
  const [unit, setUnit] = useState("");
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
    setQuestionContent((d.question_content as RichDoc | null) ?? null);
    setType(d.question_type);
    setPoints(d.points);
    setExplanation(d.explanation ?? "");
    setExplanationContent((d.explanation_content as RichDoc | null) ?? null);
    setMedia({
      image_path: d.image_path ?? null,
      image_width: d.image_width ?? null,
      image_height: d.image_height ?? null,
      image_alt: d.image_alt ?? "",
      image_crop: sanitizeCrop(d.image_crop),
    });
    setTopic(d.topic ?? "");
    setCollectionId(d.collection_id);
    setSubjectId(d.subject_id);
    setOptions(
      d.options.length > 0
        ? d.options.map((o) => ({
            key: o.id,
            option_text: o.option_text,
            option_content: (o.option_content as RichDoc | null) ?? null,
            is_correct: o.is_correct,
          }))
        : [{ key: rid(), option_text: "", is_correct: true }],
    );
    setAccepted(d.accepted_answers?.length ? d.accepted_answers : [""]);
    setMatchMode(d.answer_match_mode === "exact" ? "exact" : "ignore_case");
    setNumAnswer(d.numeric_answer === null || d.numeric_answer === undefined ? "" : String(d.numeric_answer));
    setNumTolerance(
      d.numeric_tolerance === null || d.numeric_tolerance === undefined ? "" : String(d.numeric_tolerance));
    setUnit(d.answer_unit ?? "");
    setHydrated(true);
  }, [existing.data, isNew, hydrated]);

  /**
   * True/False has a fixed option set. Switching between single- and
   * multi-answer types keeps the option text but re-normalises correctness, so
   * a question never carries a selection its own type cannot express.
   */
  function changeType(next: string) {
    setType(next);
    if (next === "true_false") { setOptions(TRUE_FALSE_OPTIONS()); return; }
    if (type === "true_false" && next !== "true_false") {
      setOptions([
        { key: rid(), option_text: "", is_correct: true },
        { key: rid(), option_text: "", is_correct: false },
      ]);
      return;
    }
    if (next === "mcq") {
      // Single answer: keep only the first correct option marked.
      setOptions((prev) => {
        const first = prev.findIndex((o) => o.is_correct);
        return prev.map((o, i) => ({ ...o, is_correct: i === (first === -1 ? 0 : first) }));
      });
    }
  }

  const filled = options.filter((o) => o.option_text.trim().length > 0);
  const acceptedFilled = accepted.map((a) => a.trim()).filter(Boolean);
  const isChoice = CHOICE_TYPES.has(type);
  const isTextAnswer = TEXT_ANSWER_TYPES.has(type);

  /**
   * Mirrors what the server will actually do. A choice question with no
   * correct option, or a numeric one with no answer, would mark every attempt
   * wrong — so the form refuses to save it rather than shipping a trap.
   */
  const errors = useMemo(() => {
    const e: string[] = [];
    if (!question.trim()) e.push("Enter the question text.");
    if (isChoice) {
      if (filled.length < 2) e.push("Add at least two answer options.");
      const correct = filled.filter((o) => o.is_correct).length;
      if (correct === 0) {
        e.push(type === "multiple_select"
          ? "Mark at least one option as correct."
          : "Mark one option as the correct answer.");
      }
      if (type === "multiple_select" && correct === filled.length && filled.length > 1) {
        e.push("Marking every option correct makes the question meaningless.");
      }
    }
    if (isTextAnswer && acceptedFilled.length === 0) {
      e.push("Add at least one accepted answer.");
    }
    if (type === "numeric") {
      if (numAnswer.trim() === "") e.push("Enter the correct numeric answer.");
      else if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(numAnswer.trim()))
        e.push("The numeric answer must be a plain number.");
      if (numTolerance.trim() !== "" && !/^\d+(\.\d*)?$/.test(numTolerance.trim()))
        e.push("Tolerance must be zero or a positive number.");
    }
    return e;
  }, [question, filled, type, isChoice, isTextAnswer, acceptedFilled.length, numAnswer, numTolerance]);

  const save = useMutation({
    mutationFn: () =>
      saveBankQuestion({
        id: isNew ? null : questionId,
        question: question.trim(),
        questionContent: questionContent,
        questionType: type,
        points,
        explanation: explanation.trim() || null,
        explanationContent: explanationContent,
        topic: topic.trim() || null,
        collectionId,
        subjectId,
        options: isChoice
          ? filled.map((o) => ({
              option_text: o.option_text.trim(),
              option_content: o.option_content ?? null,
              is_correct: o.is_correct,
            }))
          : [],
        acceptedAnswers: isTextAnswer ? acceptedFilled : null,
        answerMatchMode: matchMode,
        numericAnswer: type === "numeric" && numAnswer.trim() !== "" ? Number(numAnswer) : null,
        numericTolerance:
          type === "numeric" && numTolerance.trim() !== "" ? Number(numTolerance) : null,
        answerUnit: type === "numeric" ? unit.trim() || null : null,
        imagePath: media.image_path,
        imageWidth: media.image_width,
        imageHeight: media.image_height,
        imageAlt: media.image_alt?.trim() || null,
        imageCrop: media.image_crop,
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
              <RichTextEditor
                value={questionContent}
                fallbackText={question}
                ariaLabel="Question text"
                placeholder="What is the unit of force in the SI system?"
                onChange={(doc, plain) => {
                  setQuestionContent(doc);
                  setQuestion(plain.slice(0, 2000));
                }}
              />
              <span className="mt-1 block text-right text-[11.5px] text-slate-400">
                {question.length}/2000
              </span>
            </label>
          </BuilderSection>

          <BuilderSection
            title="Answers"
            description={
              type === "true_false" ? "Mark whether the statement is true or false."
                : type === "multiple_select" ? "Select all correct answers."
                  : type === "numeric" ? "The value a student must reach."
                    : isTextAnswer ? "Any of these counts as correct."
                      : "Mark the one correct answer."
            }
          >
          {isChoice ? (
            <>
            <ul className="space-y-2">
              {options.map((o, i) => (
                <li
                  key={o.key}
                  className={cn(
                    "flex items-start gap-2 rounded-2xl border p-2",
                    o.is_correct ? "border-emerald-200 bg-emerald-50/60" : "border-slate-200 bg-white",
                  )}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setOptions((prev) =>
                        type === "multiple_select"
                          // Multi-answer: toggle this one, leave the rest alone.
                          ? prev.map((x, j) => (j === i ? { ...x, is_correct: !x.is_correct } : x))
                          // Single-answer: exactly one option can be correct.
                          : prev.map((x, j) => ({ ...x, is_correct: j === i })))
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
                  {type === "true_false" ? (
                    <span className="min-w-0 flex-1 px-1 text-[14px] font-semibold text-slate-800">
                      {o.option_text}
                    </span>
                  ) : (
                    <div className="min-w-0 flex-1">
                      <RichTextEditor
                        compact
                        value={o.option_content ?? null}
                        fallbackText={o.option_text}
                        ariaLabel={`Option ${LETTERS[i] ?? i + 1} text`}
                        placeholder={`Option ${LETTERS[i] ?? i + 1}`}
                        onChange={(doc, plain) =>
                          setOptions((prev) =>
                            prev.map((x, j) =>
                              j === i ? { ...x, option_content: doc, option_text: plain } : x))
                        }
                      />
                    </div>
                  )}
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
            </>
          ) : isTextAnswer ? (
            <>
              <ul className="space-y-2">
                {accepted.map((a, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <Input
                      value={a}
                      onChange={(e) =>
                        setAccepted((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))
                      }
                      aria-label={`Accepted answer ${i + 1}`}
                      placeholder={i === 0 ? "Newton" : "Another accepted spelling"}
                      className="h-11 min-w-0 flex-1 rounded-xl border-slate-200 bg-white text-[14px]"
                    />
                    {accepted.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setAccepted((prev) => prev.filter((_, j) => j !== i))}
                        aria-label={`Remove accepted answer ${i + 1}`}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-400 transition active:scale-95"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {accepted.length < 8 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAccepted((p) => [...p, ""])}
                  className="mt-2 min-h-[44px] w-full rounded-2xl border-dashed border-slate-300 text-[13.5px] font-bold text-quiz-accent-strong"
                >
                  <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" /> Add accepted answer
                </Button>
              )}

              {/* One control, two states — never two switches that contradict
                  each other. */}
              <fieldset className="mt-4">
                <legend className="mb-1.5 text-[12.5px] font-semibold text-slate-700">
                  Answer matching
                </legend>
                <div className="flex flex-col gap-2 sm:flex-row">
                  {([
                    ["ignore_case", "Ignore capitalisation", "\u201cnewton\u201d and \u201cNewton\u201d both count."],
                    ["exact", "Exact match", "Capitalisation must match exactly."],
                  ] as const).map(([v, label, hint]) => (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={matchMode === v}
                      onClick={() => setMatchMode(v)}
                      className={cn(
                        "min-h-[56px] flex-1 shrink-0 rounded-2xl border p-3 text-left transition active:scale-[0.99]",
                        matchMode === v
                          ? "border-quiz-accent bg-quiz-tint"
                          : "border-slate-200 bg-white",
                      )}
                    >
                      <span className="block text-[13.5px] font-bold text-slate-900">{label}</span>
                      <span className="mt-0.5 block text-[11.5px] leading-snug text-slate-500">
                        {hint}
                      </span>
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="mt-3 rounded-2xl bg-slate-50 p-3">
                <p className="text-[11.5px] font-bold uppercase tracking-wide text-slate-500">
                  Student preview
                </p>
                <div className="mt-1.5 text-[13.5px] text-slate-700">
                  {question.trim() ? (
                    <RichTextRenderer value={questionContent} fallbackText={question} />
                  ) : type === "fill_blank" ? (
                    "Plants use ______ to absorb light energy."
                  ) : (
                    "Your question appears here."
                  )}
                </div>
                <div className="mt-2 flex min-h-[44px] items-center rounded-xl border border-slate-200 bg-white px-3 text-[13.5px] text-slate-400">
                  Your answer
                </div>
              </div>
            </>
          ) : type === "numeric" ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-[12.5px] font-semibold text-slate-700">
                    Correct answer
                  </span>
                  <Input
                    value={numAnswer}
                    onChange={(e) => setNumAnswer(e.target.value.replace(/[^0-9.+-]/g, "").slice(0, 24))}
                    inputMode="decimal"
                    placeholder="9.8"
                    aria-label="Correct numeric answer"
                    className="h-12 rounded-2xl border-slate-200 bg-white text-[15px] font-bold tabular-nums"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[12.5px] font-semibold text-slate-700">
                    Unit <span className="font-normal text-slate-400">(optional)</span>
                  </span>
                  <Input
                    value={unit}
                    onChange={(e) => setUnit(e.target.value.slice(0, 16))}
                    placeholder="m/s²"
                    aria-label="Answer unit"
                    className="h-12 rounded-2xl border-slate-200 bg-white text-[15px]"
                  />
                </label>
              </div>
              <label className="mt-3 block">
                <span className="mb-1.5 block text-[12.5px] font-semibold text-slate-700">
                  Tolerance <span className="font-normal text-slate-400">(optional)</span>
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-bold text-slate-500">±</span>
                  <Input
                    value={numTolerance}
                    onChange={(e) => setNumTolerance(e.target.value.replace(/[^0-9.]/g, "").slice(0, 16))}
                    inputMode="decimal"
                    placeholder="0.1"
                    aria-label="Numeric tolerance"
                    className="h-12 min-w-0 flex-1 rounded-2xl border-slate-200 bg-white text-[15px] tabular-nums"
                  />
                </div>
                <span className="mt-1 block text-[11.5px] leading-snug text-slate-500">
                  {numTolerance.trim() === ""
                    ? "With no tolerance, only the exact value is accepted."
                    : `Anything from ${
                        numAnswer && numTolerance
                          ? String(Number(numAnswer) - Number(numTolerance))
                          : "…"
                      } to ${
                        numAnswer && numTolerance
                          ? String(Number(numAnswer) + Number(numTolerance))
                          : "…"
                      } is accepted.`}
                </span>
              </label>

              <div className="mt-3 rounded-2xl bg-slate-50 p-3">
                <p className="text-[11.5px] font-bold uppercase tracking-wide text-slate-500">
                  Student preview
                </p>
                <div className="mt-2 flex items-stretch gap-2">
                  <div className="flex min-h-[44px] flex-1 items-center rounded-xl border border-slate-200 bg-white px-3 text-[13.5px] text-slate-400">
                    0.0
                  </div>
                  {unit.trim() && (
                    <span className="flex min-h-[44px] shrink-0 items-center rounded-xl bg-slate-200 px-3 text-[13px] font-bold text-slate-600">
                      {unit.trim()}
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-[11.5px] text-slate-500">
                  The answer and the tolerance are never sent to a student.
                </p>
              </div>
            </>
          ) : null}
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

            <div className="mt-3">
              <QuestionMediaEditor
                centerId={currentTenantId ?? null}
                questionId={questionId ?? "new"}
                locked={false}
                image_path={media.image_path}
                image_width={media.image_width}
                image_height={media.image_height}
                image_alt={media.image_alt}
                image_crop={media.image_crop}
                onChange={(patch) => setMedia((prev) => ({ ...prev, ...patch }))}
              />
            </div>

            <label className="mt-3 block">
              <span className="mb-1.5 block text-[12.5px] font-semibold text-slate-700">
                Explanation <span className="font-normal text-slate-400">(optional)</span>
              </span>
              <RichTextEditor
                value={explanationContent}
                fallbackText={explanation}
                ariaLabel="Explanation"
                placeholder="Shown to students after the answer is revealed."
                onChange={(doc, plain) => {
                  setExplanationContent(doc);
                  setExplanation(plain.slice(0, 500));
                }}
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
