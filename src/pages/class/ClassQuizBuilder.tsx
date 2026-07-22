import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Copy,
  HelpCircle,
  Lock,
  Plus,
  Save,
  Send,
  Trash2,
  Loader2,
} from "lucide-react";
import { ClassShell } from "@/components/class/ClassShell";
import { TenantEmptyState } from "@/components/common/TenantGate";
import { useClassContext } from "@/hooks/useClassContext";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  duplicateQuizAsDraft,
  getQuizDefinitionForManager,
  mapQuizError,
  quizManagerKeys,
  RESULT_VISIBILITY_LABEL,
  saveQuizDefinition,
  type QuestionType,
  type QuizDefinitionForManager,
  type ResultVisibility,
} from "@/lib/quizzes";

type Variant = "tutor" | "admin";

interface Props {
  variant: Variant;
}

interface OptionDraft {
  id: string; // local UUID (server-side always reassigned currently)
  option_text: string;
  is_correct: boolean;
}
interface QuestionDraft {
  id: string;
  question: string;
  question_type: QuestionType;
  points: number;
  explanation: string;
  options: OptionDraft[];
}
interface MetaDraft {
  title: string;
  description: string;
  instructions: string;
  available_from: string; // ISO local input value (yyyy-MM-ddTHH:mm) or ""
  due_at: string;
  time_limit_seconds: string; // stringified minutes source
  attempt_limit: string;
  shuffle_questions: boolean;
  shuffle_options: boolean;
  result_visibility: ResultVisibility;
}
interface BuilderState {
  meta: MetaDraft;
  questions: QuestionDraft[];
}

const RESULT_VISIBILITY_HINT: Record<ResultVisibility, string> = {
  never: "Results remain hidden from students.",
  after_submit: "Full result is shown immediately after the student submits.",
  after_due: "Results appear once the due date has passed. Requires a due date.",
  manual: "Results stay hidden until you release them manually.",
};

const emptyMeta = (): MetaDraft => ({
  title: "",
  description: "",
  instructions: "",
  available_from: "",
  due_at: "",
  time_limit_seconds: "",
  attempt_limit: "1",
  shuffle_questions: false,
  shuffle_options: false,
  result_visibility: "after_submit",
});

function rid(prefix = "id"): string {
  return `${prefix}_${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}
function newOption(text = "", correct = false): OptionDraft {
  return { id: rid("opt"), option_text: text, is_correct: correct };
}
function newQuestion(type: QuestionType = "mcq"): QuestionDraft {
  if (type === "true_false") {
    return {
      id: rid("q"),
      question: "",
      question_type: "true_false",
      points: 1,
      explanation: "",
      options: [newOption("True"), newOption("False")],
    };
  }
  return {
    id: rid("q"),
    question: "",
    question_type: "mcq",
    points: 1,
    explanation: "",
    options: [newOption(), newOption()],
  };
}

// Convert ISO timestamp → datetime-local input value in local TZ
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function stateFromDefinition(def: QuizDefinitionForManager): BuilderState {
  return {
    meta: {
      title: def.quiz.title ?? "",
      description: def.quiz.description ?? "",
      instructions: def.quiz.instructions ?? "",
      available_from: toLocalInput(def.quiz.available_from),
      due_at: toLocalInput(def.quiz.due_at),
      time_limit_seconds: def.quiz.time_limit_seconds
        ? String(Math.round(def.quiz.time_limit_seconds / 60))
        : "",
      attempt_limit: String(def.quiz.attempt_limit ?? 1),
      shuffle_questions: !!def.quiz.shuffle_questions,
      shuffle_options: !!def.quiz.shuffle_options,
      result_visibility: def.quiz.result_visibility,
    },
    questions: def.questions.map((q) => ({
      id: q.id,
      question: q.question,
      question_type: q.question_type === "true_false" ? "true_false" : "mcq",
      points: q.points,
      explanation: q.explanation ?? "",
      options: q.options.map((o) => ({
        id: o.id,
        option_text: o.option_text,
        is_correct: o.is_correct,
      })),
    })),
  };
}

function emptyBuilderState(): BuilderState {
  return { meta: emptyMeta(), questions: [] };
}

function validateBuilder(state: BuilderState, forPublish: boolean): string[] {
  const errs: string[] = [];
  const m = state.meta;
  if (!m.title.trim()) errs.push("Add a title.");
  const attemptLimit = parseInt(m.attempt_limit, 10);
  if (!Number.isFinite(attemptLimit) || attemptLimit < 1) errs.push("Attempt limit must be at least 1.");
  const tl = m.time_limit_seconds.trim();
  if (tl && (!/^\d+$/.test(tl) || parseInt(tl, 10) < 0)) errs.push("Time limit must be a whole number of minutes.");
  if (m.available_from && m.due_at) {
    const a = new Date(m.available_from).getTime();
    const d = new Date(m.due_at).getTime();
    if (!isNaN(a) && !isNaN(d) && d < a) errs.push("Due date must be after the available date.");
  }
  if (m.result_visibility === "after_due" && !m.due_at) {
    errs.push("Results after due date requires a due date.");
  }
  if (forPublish) {
    if (state.questions.length === 0) errs.push("Add at least one question before publishing.");
    state.questions.forEach((q, i) => {
      const n = i + 1;
      if (!q.question.trim()) errs.push(`Question ${n} is missing text.`);
      if (!Number.isFinite(q.points) || q.points <= 0) errs.push(`Question ${n} needs points greater than zero.`);
      if (q.question_type === "mcq") {
        if (q.options.length < 2) errs.push(`Question ${n} needs at least 2 options.`);
        if (q.options.some((o) => !o.option_text.trim())) errs.push(`Question ${n} has a blank option.`);
      } else {
        if (q.options.length !== 2) errs.push(`Question ${n} (true/false) needs exactly two options.`);
        const t = q.options.filter((o) => o.option_text.trim().toLowerCase() === "true").length;
        const f = q.options.filter((o) => o.option_text.trim().toLowerCase() === "false").length;
        if (t !== 1 || f !== 1) errs.push(`Question ${n} (true/false) must have one True and one False option.`);
      }
      const correct = q.options.filter((o) => o.is_correct).length;
      if (correct === 0) errs.push(`Question ${n} needs a correct answer.`);
      if (correct > 1) errs.push(`Question ${n} has more than one correct answer.`);
    });
  }
  return errs;
}

function toRpcDefinition(state: BuilderState) {
  const tlMin = state.meta.time_limit_seconds.trim();
  return {
    meta: {
      title: state.meta.title.trim(),
      description: state.meta.description,
      instructions: state.meta.instructions,
      available_from: fromLocalInput(state.meta.available_from),
      due_at: fromLocalInput(state.meta.due_at),
      time_limit_seconds: tlMin && /^\d+$/.test(tlMin) ? parseInt(tlMin, 10) * 60 : null,
      attempt_limit: Math.max(1, parseInt(state.meta.attempt_limit, 10) || 1),
      shuffle_questions: state.meta.shuffle_questions,
      shuffle_options: state.meta.shuffle_options,
      result_visibility: state.meta.result_visibility,
    },
    questions: state.questions.map((q) => ({
      question: q.question,
      question_type: q.question_type,
      points: q.points,
      explanation: q.explanation || null,
      options: q.options.map((o) => ({
        option_text: o.option_text,
        is_correct: o.is_correct,
      })),
    })),
  };
}

export function ClassQuizBuilder({ variant }: Props) {
  const params = useParams<{ classId: string; quizId?: string }>();
  const classId = params.classId!;
  const quizId = params.quizId ?? null;
  const isNew = !quizId;

  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const ctx = useClassContext(classId);
  const qc = useQueryClient();
  const { toast } = useToast();

  const basePath = variant === "admin" ? `/admin/classes/${classId}` : `/tutor/classes/${classId}`;
  const managerPath = `${basePath}/quizzes`;
  const materialsPath = `${basePath}/resources`;
  const canManage = !!ctx.data?.canManage;

  // ── Load definition ───────────────────────────────────────────────
  const defQ = useQuery({
    queryKey: quizManagerKeys.definition(currentTenantId, classId, quizId ?? "new", user?.id),
    enabled: !isNew && !!user && canManage,
    queryFn: () => getQuizDefinitionForManager(quizId!),
    staleTime: 15_000,
  });

  const [state, setState] = useState<BuilderState>(() => emptyBuilderState());
  const [initialized, setInitialized] = useState(isNew);
  const [dirty, setDirty] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const restoredDraftRef = useRef(false);

  const locked = !!defQ.data?.locked;
  const hasAttempts = !!defQ.data?.has_attempts;

  const draftKey = useMemo(() => {
    if (!user?.id || !currentTenantId) return null;
    return `quiz-builder:${user.id}:${currentTenantId}:${classId}:${quizId ?? "new"}:${variant}`;
  }, [user?.id, currentTenantId, classId, quizId, variant]);

  // Init from server data (or new)
  useEffect(() => {
    if (initialized) return;
    if (isNew) {
      setState(emptyBuilderState());
      setInitialized(true);
      return;
    }
    if (defQ.data) {
      setState(stateFromDefinition(defQ.data));
      setInitialized(true);
    }
  }, [defQ.data, initialized, isNew]);

  // Restore local draft after init
  useEffect(() => {
    if (!initialized || restoredDraftRef.current || !draftKey) return;
    restoredDraftRef.current = true;
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (raw) {
        setRestoreOpen(true);
      }
    } catch { /* ignore */ }
  }, [initialized, draftKey]);

  // Persist draft (debounced)
  useEffect(() => {
    if (!draftKey || !initialized || !dirty) return;
    const t = setTimeout(() => {
      try {
        window.localStorage.setItem(draftKey, JSON.stringify(state));
      } catch { /* ignore */ }
    }, 400);
    return () => clearTimeout(t);
  }, [state, dirty, draftKey, initialized]);

  const clearDraft = useCallback(() => {
    if (!draftKey) return;
    try { window.localStorage.removeItem(draftKey); } catch { /* ignore */ }
  }, [draftKey]);

  const restoreDraft = useCallback(() => {
    if (!draftKey) return;
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (raw) {
        const parsed = JSON.parse(raw) as BuilderState;
        setState(parsed);
        setDirty(true);
      }
    } catch { /* ignore */ }
    setRestoreOpen(false);
  }, [draftKey]);

  const discardDraft = useCallback(() => {
    clearDraft();
    setRestoreOpen(false);
  }, [clearDraft]);

  // Mutations
  const saveMut = useMutation({
    mutationFn: async (args: { publish: boolean }) => {
      const errs = validateBuilder(state, args.publish);
      if (errs.length) throw new Error(errs.join("\n"));
      return saveQuizDefinition({
        classId,
        quizId: quizId,
        definition: toRpcDefinition(state) as unknown as Parameters<typeof saveQuizDefinition>[0]["definition"],
        publish: args.publish,
      });
    },
    onSuccess: async (res, args) => {
      qc.invalidateQueries({ queryKey: quizManagerKeys.list(currentTenantId, classId) });
      qc.invalidateQueries({ queryKey: ["class-context", currentTenantId, classId] });
      qc.invalidateQueries({ queryKey: ["tutor-class-home"] });
      clearDraft();
      toast({
        title: args.publish ? "Quiz published" : "Saved",
        description: args.publish ? "Students can now attempt this quiz." : "Your changes are saved.",
      });
      if (isNew) {
        navigate(`${basePath}/quizzes/${res.id}/edit`, { replace: true });
      } else {
        // Force reload of definition to get canonical server state
        qc.invalidateQueries({
          queryKey: quizManagerKeys.definition(currentTenantId, classId, quizId ?? "", user?.id),
        });
        setInitialized(false); // triggers re-init from fresh data
        setDirty(false);
      }
    },
    onError: (err) => {
      toast({
        title: "Couldn't save",
        description: mapQuizError(err, (err as Error)?.message ?? "Please review and try again."),
        variant: "destructive",
      });
    },
  });

  const dupMut = useMutation({
    mutationFn: () => duplicateQuizAsDraft(quizId!),
    onSuccess: (newId) => {
      qc.invalidateQueries({ queryKey: quizManagerKeys.list(currentTenantId, classId) });
      toast({ title: "Duplicated", description: "Opened editable draft copy." });
      navigate(`${basePath}/quizzes/${newId}/edit`);
    },
    onError: (err) =>
      toast({ title: "Duplicate failed", description: mapQuizError(err), variant: "destructive" }),
  });

  // Handlers
  const patchMeta = <K extends keyof MetaDraft>(k: K, v: MetaDraft[K]) => {
    setState((s) => ({ ...s, meta: { ...s.meta, [k]: v } }));
    setDirty(true);
  };
  const patchQuestion = (idx: number, patch: Partial<QuestionDraft>) => {
    setState((s) => {
      const qs = s.questions.slice();
      qs[idx] = { ...qs[idx], ...patch };
      return { ...s, questions: qs };
    });
    setDirty(true);
  };
  const patchOption = (qIdx: number, oIdx: number, patch: Partial<OptionDraft>) => {
    setState((s) => {
      const qs = s.questions.slice();
      const opts = qs[qIdx].options.slice();
      opts[oIdx] = { ...opts[oIdx], ...patch };
      qs[qIdx] = { ...qs[qIdx], options: opts };
      return { ...s, questions: qs };
    });
    setDirty(true);
  };
  const setCorrect = (qIdx: number, oIdx: number) => {
    setState((s) => {
      const qs = s.questions.slice();
      const opts = qs[qIdx].options.map((o, i) => ({ ...o, is_correct: i === oIdx }));
      qs[qIdx] = { ...qs[qIdx], options: opts };
      return { ...s, questions: qs };
    });
    setDirty(true);
  };
  const addOption = (qIdx: number) => {
    setState((s) => {
      const qs = s.questions.slice();
      qs[qIdx] = { ...qs[qIdx], options: [...qs[qIdx].options, newOption()] };
      return { ...s, questions: qs };
    });
    setDirty(true);
  };
  const removeOption = (qIdx: number, oIdx: number) => {
    setState((s) => {
      const qs = s.questions.slice();
      qs[qIdx] = { ...qs[qIdx], options: qs[qIdx].options.filter((_, i) => i !== oIdx) };
      return { ...s, questions: qs };
    });
    setDirty(true);
  };
  const changeQuestionType = (qIdx: number, type: QuestionType) => {
    setState((s) => {
      const qs = s.questions.slice();
      const existing = qs[qIdx];
      qs[qIdx] =
        type === "true_false"
          ? {
              ...existing,
              question_type: "true_false",
              options: [newOption("True"), newOption("False")],
            }
          : {
              ...existing,
              question_type: "mcq",
              options: existing.options.length >= 2 ? existing.options : [newOption(), newOption()],
            };
      return { ...s, questions: qs };
    });
    setDirty(true);
  };
  const addQuestion = (type: QuestionType) => {
    setState((s) => ({ ...s, questions: [...s.questions, newQuestion(type)] }));
    setDirty(true);
  };
  const removeQuestion = (idx: number) => {
    setState((s) => ({ ...s, questions: s.questions.filter((_, i) => i !== idx) }));
    setDirty(true);
  };
  const duplicateQuestion = (idx: number) => {
    setState((s) => {
      const q = s.questions[idx];
      const clone: QuestionDraft = {
        ...q,
        id: rid("q"),
        options: q.options.map((o) => ({ ...o, id: rid("opt") })),
      };
      const qs = s.questions.slice();
      qs.splice(idx + 1, 0, clone);
      return { ...s, questions: qs };
    });
    setDirty(true);
  };
  const moveQuestion = (idx: number, dir: -1 | 1) => {
    setState((s) => {
      const target = idx + dir;
      if (target < 0 || target >= s.questions.length) return s;
      const qs = s.questions.slice();
      const [x] = qs.splice(idx, 1);
      qs.splice(target, 0, x);
      return { ...s, questions: qs };
    });
    setDirty(true);
  };

  const clientErrors = useMemo(() => validateBuilder(state, false), [state]);
  const publishErrors = useMemo(() => validateBuilder(state, true), [state]);

  const cancel = () => {
    if (dirty) setCancelOpen(true);
    else navigate(managerPath);
  };

  const breadcrumbs = [
    { label: variant === "admin" ? "Admin" : "Tutor", to: variant === "admin" ? "/admin" : "/tutor" },
    { label: "Classes", to: variant === "admin" ? "/admin/curriculum" : "/tutor/classes" },
    { label: ctx.data?.klass?.title ?? "Class", to: basePath },
    { label: "Quizzes", to: managerPath },
    { label: isNew ? "New quiz" : "Edit" },
  ];

  const headerRight = (
    <Button variant="outline" onClick={cancel} className="rounded-full">
      <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to quizzes
    </Button>
  );

  if (ctx.data && !canManage) {
    return (
      <ClassShell
        data={ctx.data}
        isLoading={ctx.isLoading}
        role={variant}
        section="quizzes"
        basePath={basePath}
        materialsPath={materialsPath}
        breadcrumbs={breadcrumbs}
      >
        <TenantEmptyState
          title="Not available"
          body="You don't have permission to manage quizzes for this class."
        />
      </ClassShell>
    );
  }

  const loading = ctx.isLoading || (!isNew && defQ.isLoading) || !initialized;

  return (
    <ClassShell
      data={ctx.data}
      isLoading={ctx.isLoading}
      role={variant}
      section="quizzes"
      basePath={basePath}
      materialsPath={materialsPath}
      breadcrumbs={breadcrumbs}
      headerRight={headerRight}
    >
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading builder…
        </div>
      ) : defQ.error ? (
        <div className="bg-white border border-red-200 rounded-3xl p-6 text-sm text-red-600">
          {mapQuizError(defQ.error)}
        </div>
      ) : (
        <div className="space-y-5 pb-32">
          {locked && (
            <div className="bg-amber-50 border border-amber-200 rounded-3xl p-4 flex items-start gap-3">
              <Lock className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
              <div className="text-sm text-amber-900">
                <p className="font-medium">This quiz has student attempts.</p>
                <p className="mt-1">
                  Questions, answers, shuffle, time limit and grading fields are locked to preserve
                  historical results. You can still edit title, description, instructions, availability,
                  due date, result visibility and increase the attempt limit.
                </p>
                <div className="mt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full"
                    onClick={() => dupMut.mutate()}
                    disabled={dupMut.isPending}
                  >
                    <Copy className="w-3.5 h-3.5 mr-1.5" /> Duplicate as new draft
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Metadata card */}
          <section className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] space-y-5">
            <header>
              <h2 className="text-lg font-semibold text-slate-900">Quiz details</h2>
              <p className="text-sm text-slate-500">
                Students see the title, description and instructions when the quiz is published.
              </p>
            </header>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="quiz-title">Title *</Label>
                <Input
                  id="quiz-title"
                  value={state.meta.title}
                  onChange={(e) => patchMeta("title", e.target.value)}
                  placeholder="e.g. Chapter 5 — Quadratic Equations"
                  className="mt-1"
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="quiz-desc">Description</Label>
                <Textarea
                  id="quiz-desc"
                  value={state.meta.description}
                  onChange={(e) => patchMeta("description", e.target.value)}
                  placeholder="Short summary of what this quiz covers."
                  className="mt-1"
                  rows={2}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="quiz-inst">Instructions</Label>
                <Textarea
                  id="quiz-inst"
                  value={state.meta.instructions}
                  onChange={(e) => patchMeta("instructions", e.target.value)}
                  placeholder="What students should know before starting."
                  className="mt-1"
                  rows={3}
                />
              </div>

              <div>
                <Label htmlFor="q-avail">Available from</Label>
                <Input
                  id="q-avail"
                  type="datetime-local"
                  value={state.meta.available_from}
                  onChange={(e) => patchMeta("available_from", e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="q-due">Due at</Label>
                <Input
                  id="q-due"
                  type="datetime-local"
                  value={state.meta.due_at}
                  onChange={(e) => patchMeta("due_at", e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="q-tl">Time limit (minutes)</Label>
                <Input
                  id="q-tl"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={state.meta.time_limit_seconds}
                  onChange={(e) => patchMeta("time_limit_seconds", e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="No time limit"
                  disabled={locked}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="q-al">Attempt limit</Label>
                <Input
                  id="q-al"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={state.meta.attempt_limit}
                  onChange={(e) => patchMeta("attempt_limit", e.target.value.replace(/[^0-9]/g, "") || "1")}
                  className="mt-1"
                />
                {locked && (
                  <p className="text-[11px] text-slate-500 mt-1">Only increases are allowed after attempts.</p>
                )}
              </div>

              <div>
                <Label>Shuffle questions</Label>
                <div className="mt-2 flex items-center gap-2">
                  <Switch
                    checked={state.meta.shuffle_questions}
                    onCheckedChange={(v) => patchMeta("shuffle_questions", v)}
                    disabled={locked}
                  />
                  <span className="text-sm text-slate-600">Randomise order between students</span>
                </div>
              </div>
              <div>
                <Label>Shuffle options</Label>
                <div className="mt-2 flex items-center gap-2">
                  <Switch
                    checked={state.meta.shuffle_options}
                    onCheckedChange={(v) => patchMeta("shuffle_options", v)}
                    disabled={locked}
                  />
                  <span className="text-sm text-slate-600">Randomise answer order</span>
                </div>
              </div>

              <div className="sm:col-span-2">
                <Label htmlFor="q-rv">Result visibility</Label>
                <Select
                  value={state.meta.result_visibility}
                  onValueChange={(v) => patchMeta("result_visibility", v as ResultVisibility)}
                >
                  <SelectTrigger id="q-rv" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(RESULT_VISIBILITY_LABEL) as ResultVisibility[]).map((k) => (
                      <SelectItem key={k} value={k}>
                        {RESULT_VISIBILITY_LABEL[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500 mt-1">
                  {RESULT_VISIBILITY_HINT[state.meta.result_visibility]}
                </p>
              </div>
            </div>
          </section>

          {/* Questions */}
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Questions</h2>
                <p className="text-sm text-slate-500">
                  {state.questions.length} question{state.questions.length === 1 ? "" : "s"} · Total{" "}
                  {state.questions.reduce((s, q) => s + (q.points || 0), 0)} points
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addQuestion("mcq")}
                  disabled={locked}
                  className="rounded-full"
                >
                  <Plus className="w-4 h-4 mr-1" /> MCQ
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addQuestion("true_false")}
                  disabled={locked}
                  className="rounded-full"
                >
                  <Plus className="w-4 h-4 mr-1" /> True / False
                </Button>
              </div>
            </div>

            {state.questions.length === 0 ? (
              <div className="bg-white border border-dashed border-slate-300 rounded-3xl p-8 text-center">
                <HelpCircle className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="font-medium text-slate-800">No questions yet</p>
                <p className="text-sm text-slate-500">
                  Add your first MCQ or true/false question to get started.
                </p>
              </div>
            ) : (
              state.questions.map((q, qIdx) => (
                <article
                  key={q.id}
                  className="bg-white border border-slate-200 rounded-3xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] space-y-4"
                >
                  <header className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="rounded-full">Q{qIdx + 1}</Badge>
                      <Select
                        value={q.question_type}
                        onValueChange={(v) => changeQuestionType(qIdx, v as QuestionType)}
                        disabled={locked}
                      >
                        <SelectTrigger className="w-[140px] h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="mcq">MCQ</SelectItem>
                          <SelectItem value="true_false">True / False</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => moveQuestion(qIdx, -1)}
                        disabled={locked || qIdx === 0}
                        title="Move up"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => moveQuestion(qIdx, 1)}
                        disabled={locked || qIdx === state.questions.length - 1}
                        title="Move down"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => duplicateQuestion(qIdx)}
                        disabled={locked}
                        title="Duplicate"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => removeQuestion(qIdx)}
                        disabled={locked}
                        title="Remove"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </header>

                  <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
                    <div>
                      <Label htmlFor={`${q.id}-prompt`}>Prompt *</Label>
                      <Textarea
                        id={`${q.id}-prompt`}
                        value={q.question}
                        onChange={(e) => patchQuestion(qIdx, { question: e.target.value })}
                        rows={2}
                        placeholder="What is …?"
                        disabled={locked}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor={`${q.id}-pts`}>Points</Label>
                      <Input
                        id={`${q.id}-pts`}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={q.points.toString()}
                        onChange={(e) =>
                          patchQuestion(qIdx, { points: Math.max(0, parseInt(e.target.value || "0", 10) || 0) })
                        }
                        disabled={locked}
                        className="mt-1"
                      />
                    </div>
                  </div>

                  <div>
                    <Label>Options *</Label>
                    <RadioGroup
                      value={q.options.findIndex((o) => o.is_correct).toString()}
                      onValueChange={(v) => setCorrect(qIdx, parseInt(v, 10))}
                      className="mt-2 space-y-2"
                    >
                      {q.options.map((o, oIdx) => (
                        <div
                          key={o.id}
                          className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 bg-slate-50 rounded-2xl p-2.5"
                        >
                          <div className="flex items-center gap-2 shrink-0">
                            <RadioGroupItem
                              value={oIdx.toString()}
                              id={`${q.id}-o${oIdx}`}
                              disabled={locked}
                            />
                            <Label
                              htmlFor={`${q.id}-o${oIdx}`}
                              className="text-xs uppercase tracking-wide text-slate-500 cursor-pointer"
                            >
                              Correct
                            </Label>
                          </div>
                          <Input
                            value={o.option_text}
                            onChange={(e) => patchOption(qIdx, oIdx, { option_text: e.target.value })}
                            placeholder={
                              q.question_type === "true_false"
                                ? oIdx === 0 ? "True" : "False"
                                : `Option ${String.fromCharCode(65 + oIdx)}`
                            }
                            disabled={locked || q.question_type === "true_false"}
                            className="flex-1"
                          />
                          {q.question_type === "mcq" && q.options.length > 2 && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-9 w-9 text-red-600"
                              onClick={() => removeOption(qIdx, oIdx)}
                              disabled={locked}
                              title="Remove option"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </RadioGroup>
                    {q.question_type === "mcq" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full mt-2"
                        onClick={() => addOption(qIdx)}
                        disabled={locked}
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" /> Add option
                      </Button>
                    )}
                  </div>

                  <div>
                    <Label htmlFor={`${q.id}-exp`}>Explanation (optional)</Label>
                    <Textarea
                      id={`${q.id}-exp`}
                      value={q.explanation}
                      onChange={(e) => patchQuestion(qIdx, { explanation: e.target.value })}
                      placeholder="Shown to students with results (per visibility settings)."
                      rows={2}
                      disabled={locked}
                      className="mt-1"
                    />
                  </div>
                </article>
              ))
            )}
          </section>

          {/* Validation summary */}
          {clientErrors.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-3xl p-4 text-sm">
              <p className="font-medium text-slate-800 mb-1">Before saving, check:</p>
              <ul className="list-disc list-inside text-slate-600 space-y-0.5">
                {clientErrors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}
          {publishErrors.length > 0 && publishErrors.length !== clientErrors.length && (
            <div className="bg-amber-50 border border-amber-200 rounded-3xl p-4 text-sm text-amber-900">
              <p className="font-medium mb-1">Publishing requires:</p>
              <ul className="list-disc list-inside space-y-0.5">
                {publishErrors.filter((e) => !clientErrors.includes(e)).map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Sticky action bar */}
      {!loading && (
        <div className="fixed inset-x-0 bottom-0 z-40 bg-white/95 backdrop-blur border-t border-slate-200 px-4 py-3">
          <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-end gap-2">
            <Button variant="ghost" onClick={cancel} className="rounded-full">
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={() => saveMut.mutate({ publish: false })}
              disabled={saveMut.isPending || clientErrors.length > 0}
              className="rounded-full"
            >
              <Save className="w-4 h-4 mr-1.5" />
              {isNew ? "Save draft" : "Save changes"}
            </Button>
            {!locked && (
              <Button
                onClick={() => saveMut.mutate({ publish: true })}
                disabled={saveMut.isPending || publishErrors.length > 0 || hasAttempts}
                className="rounded-full"
              >
                <Send className="w-4 h-4 mr-1.5" />
                Publish now
              </Button>
            )}
          </div>
        </div>
      )}

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved edits. Leaving will keep them locally on this device so you can come back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={() => navigate(managerPath)}>Leave</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={restoreOpen} onOpenChange={setRestoreOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore your unsaved quiz changes?</AlertDialogTitle>
            <AlertDialogDescription>
              We found unsaved edits from an earlier session on this device.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={discardDraft}>Discard draft</AlertDialogCancel>
            <AlertDialogAction onClick={restoreDraft}>Restore</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ClassShell>
  );
}

export default ClassQuizBuilder;
