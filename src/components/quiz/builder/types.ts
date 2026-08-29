/**
 * Canonical draft model for the Tutor/Admin quiz builder.
 *
 * This mirrors ONLY what `save_quiz_definition` actually persists. Nothing here
 * invents backend fields — cover images, tags, subject/grade metadata,
 * difficulty, themes, audio, power-ups and multiplayer settings are deliberately
 * absent because the canonical quiz model does not store them.
 *
 * The `BuilderState` shape is unchanged from the pre-refactor builder so
 * existing `quiz-builder:*` localStorage drafts keep restoring without any
 * migration step.
 */
import type {
  QuestionType,
  QuizDefinitionForManager,
  ResultVisibility,
} from "@/lib/quizzes";

export interface OptionDraft {
  id: string; // local UUID (server always reassigns on save)
  option_text: string;
  is_correct: boolean;
}

export interface QuestionDraft {
  id: string;
  question: string;
  question_type: QuestionType;
  points: number;
  explanation: string;
  options: OptionDraft[];
}

export interface MetaDraft {
  title: string;
  description: string;
  instructions: string;
  available_from: string; // datetime-local value (yyyy-MM-ddTHH:mm) or ""
  due_at: string;
  time_limit_seconds: string; // minutes, as typed
  attempt_limit: string;
  shuffle_questions: boolean;
  shuffle_options: boolean;
  result_visibility: ResultVisibility;
}

export interface BuilderState {
  meta: MetaDraft;
  questions: QuestionDraft[];
}

// ─── Wizard steps ───────────────────────────────────────────────────────────
export const BUILDER_STEPS = ["basic", "questions", "settings", "preview"] as const;
export type BuilderStep = (typeof BUILDER_STEPS)[number];

export const STEP_LABEL: Record<BuilderStep, string> = {
  basic: "Basic Info",
  questions: "Questions",
  settings: "Settings",
  preview: "Preview",
};

export function isBuilderStep(value: string | null | undefined): value is BuilderStep {
  return !!value && (BUILDER_STEPS as readonly string[]).includes(value);
}

// ─── Factories ──────────────────────────────────────────────────────────────
export function rid(prefix = "id"): string {
  return `${prefix}_${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}

export function newOption(text = "", correct = false): OptionDraft {
  return { id: rid("opt"), option_text: text, is_correct: correct };
}

export function newQuestion(type: QuestionType = "mcq"): QuestionDraft {
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

export const emptyMeta = (): MetaDraft => ({
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

export function emptyBuilderState(): BuilderState {
  return { meta: emptyMeta(), questions: [] };
}

// ─── datetime-local ↔ ISO ───────────────────────────────────────────────────
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export function stateFromDefinition(def: QuizDefinitionForManager): BuilderState {
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

// ─── Validation ─────────────────────────────────────────────────────────────
/**
 * A validation problem, addressed to the step (and question) that can fix it,
 * so a failed publish can navigate the tutor straight to the offending field
 * instead of dumping a flat list at the bottom of the page.
 */
export interface BuilderIssue {
  message: string;
  step: BuilderStep;
  /** Index into `state.questions` when the issue belongs to one question. */
  questionIndex?: number;
  /** Coarse field key used to highlight the offending control. */
  field?: "title" | "attempt_limit" | "time_limit" | "schedule" | "result_visibility" | "questions";
}

/**
 * Structured validation. `forPublish` adds the per-question rules the server
 * enforces in `save_quiz_definition`, so the client surfaces them before the
 * round trip rather than after it.
 */
export function validateBuilderIssues(state: BuilderState, forPublish: boolean): BuilderIssue[] {
  const issues: BuilderIssue[] = [];
  const m = state.meta;

  if (!m.title.trim()) {
    issues.push({ message: "Add a title.", step: "basic", field: "title" });
  }

  const attemptLimit = parseInt(m.attempt_limit, 10);
  if (!Number.isFinite(attemptLimit) || attemptLimit < 1) {
    issues.push({
      message: "Attempt limit must be at least 1.",
      step: "settings",
      field: "attempt_limit",
    });
  }

  const tl = m.time_limit_seconds.trim();
  if (tl && (!/^\d+$/.test(tl) || parseInt(tl, 10) < 0)) {
    issues.push({
      message: "Time limit must be a whole number of minutes.",
      step: "settings",
      field: "time_limit",
    });
  }

  if (m.available_from && m.due_at) {
    const a = new Date(m.available_from).getTime();
    const d = new Date(m.due_at).getTime();
    if (!isNaN(a) && !isNaN(d) && d < a) {
      issues.push({
        message: "Due date must be after the available date.",
        step: "settings",
        field: "schedule",
      });
    }
  }

  if (m.result_visibility === "after_due" && !m.due_at) {
    issues.push({
      message: "Results after due date requires a due date.",
      step: "settings",
      field: "result_visibility",
    });
  }

  if (forPublish) {
    if (state.questions.length === 0) {
      issues.push({
        message: "Add at least one question before publishing.",
        step: "questions",
        field: "questions",
      });
    }
    state.questions.forEach((q, i) => {
      const n = i + 1;
      const at = (message: string): BuilderIssue => ({
        message,
        step: "questions",
        questionIndex: i,
      });
      if (!q.question.trim()) issues.push(at(`Question ${n} is missing text.`));
      if (!Number.isFinite(q.points) || q.points <= 0) {
        issues.push(at(`Question ${n} needs points greater than zero.`));
      }
      if (q.question_type === "mcq") {
        if (q.options.length < 2) issues.push(at(`Question ${n} needs at least 2 options.`));
        if (q.options.some((o) => !o.option_text.trim())) {
          issues.push(at(`Question ${n} has a blank option.`));
        }
      } else {
        if (q.options.length !== 2) {
          issues.push(at(`Question ${n} (true/false) needs exactly two options.`));
        }
        const t = q.options.filter((o) => o.option_text.trim().toLowerCase() === "true").length;
        const f = q.options.filter((o) => o.option_text.trim().toLowerCase() === "false").length;
        if (t !== 1 || f !== 1) {
          issues.push(at(`Question ${n} (true/false) must have one True and one False option.`));
        }
      }
      const correct = q.options.filter((o) => o.is_correct).length;
      if (correct === 0) issues.push(at(`Question ${n} needs a correct answer.`));
      if (correct > 1) issues.push(at(`Question ${n} has more than one correct answer.`));
    });
  }

  return issues;
}

/**
 * Message-only view, preserving the original `validateBuilder` contract so the
 * save/publish gating behaves exactly as before the refactor.
 */
export function validateBuilder(state: BuilderState, forPublish: boolean): string[] {
  return validateBuilderIssues(state, forPublish).map((i) => i.message);
}

/** Question indexes with at least one publish-blocking issue. */
export function invalidQuestionIndexes(state: BuilderState): Set<number> {
  const set = new Set<number>();
  for (const issue of validateBuilderIssues(state, true)) {
    if (typeof issue.questionIndex === "number") set.add(issue.questionIndex);
  }
  return set;
}

// ─── RPC payload ────────────────────────────────────────────────────────────
/**
 * Once a quiz has attempts the server freezes questions, shuffle, time limit
 * and schedule. Sending those keys — even unchanged — risks a locked error, so
 * a locked save carries only the fields the server still accepts.
 *
 * Unchanged from the pre-refactor builder: this is load-bearing lifecycle
 * safety, not presentation.
 */
export function toRpcDefinition(state: BuilderState, locked: boolean) {
  const tlMin = state.meta.time_limit_seconds.trim();
  if (locked) {
    return {
      meta: {
        title: state.meta.title.trim(),
        description: state.meta.description,
        instructions: state.meta.instructions,
        attempt_limit: Math.max(1, parseInt(state.meta.attempt_limit, 10) || 1),
        result_visibility: state.meta.result_visibility,
      },
      questions: [],
    };
  }
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

/** Total points across the draft — shown in the header and preview. */
export function totalPoints(state: BuilderState): number {
  return state.questions.reduce((sum, q) => sum + (Number.isFinite(q.points) ? q.points : 0), 0);
}

export const RESULT_VISIBILITY_HINT: Record<ResultVisibility, string> = {
  never: "Results remain hidden from students.",
  after_submit: "Full result is shown immediately after the student submits.",
  after_due: "Results appear once the due date has passed. Requires a due date.",
  manual: "Results stay hidden until you release them manually.",
};

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  mcq: "Multiple Choice",
  true_false: "True / False",
};
