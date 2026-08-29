import { describe, it, expect } from "vitest";
import {
  emptyBuilderState,
  invalidQuestionIndexes,
  isBuilderStep,
  newQuestion,
  stateFromDefinition,
  toLocalInput,
  toRpcDefinition,
  totalPoints,
  validateBuilder,
  validateBuilderIssues,
  type BuilderState,
} from "./types";
import type { QuizDefinitionForManager } from "@/lib/quizzes";

function draft(overrides: Partial<BuilderState> = {}): BuilderState {
  const base = emptyBuilderState();
  return {
    meta: { ...base.meta, title: "Photosynthesis", ...(overrides.meta ?? {}) },
    questions: overrides.questions ?? [],
  };
}

function mcq(correctIndex = 0, text = "What is the main pigment?") {
  const q = newQuestion("mcq");
  q.question = text;
  q.points = 2;
  q.options[0].option_text = "Chlorophyll";
  q.options[1].option_text = "Carotene";
  q.options.forEach((o, i) => (o.is_correct = i === correctIndex));
  return q;
}

function trueFalse(correctIndex = 0) {
  const q = newQuestion("true_false");
  q.question = "Plants need light.";
  q.options.forEach((o, i) => (o.is_correct = i === correctIndex));
  return q;
}

describe("wizard steps", () => {
  it("accepts only canonical step ids", () => {
    expect(isBuilderStep("basic")).toBe(true);
    expect(isBuilderStep("questions")).toBe(true);
    expect(isBuilderStep("settings")).toBe(true);
    expect(isBuilderStep("preview")).toBe(true);
    expect(isBuilderStep("nope")).toBe(false);
    expect(isBuilderStep(null)).toBe(false);
  });
});

describe("validation", () => {
  it("requires a title", () => {
    const issues = validateBuilderIssues(draft({ meta: { title: "  " } as never }), false);
    expect(issues.some((i) => i.field === "title" && i.step === "basic")).toBe(true);
  });

  it("routes settings problems to the settings step", () => {
    const s = draft({ meta: { attempt_limit: "0" } as never });
    const issue = validateBuilderIssues(s, false).find((i) => i.field === "attempt_limit");
    expect(issue?.step).toBe("settings");
  });

  it("flags after_due without a due date", () => {
    const s = draft({ meta: { result_visibility: "after_due", due_at: "" } as never });
    const issue = validateBuilderIssues(s, false).find((i) => i.field === "result_visibility");
    expect(issue?.step).toBe("settings");
  });

  it("rejects a due date before the available date", () => {
    const s = draft({
      meta: { available_from: "2026-05-02T10:00", due_at: "2026-05-01T10:00" } as never,
    });
    expect(validateBuilderIssues(s, false).some((i) => i.field === "schedule")).toBe(true);
  });

  it("does not apply per-question rules when not publishing", () => {
    const s = draft({ questions: [newQuestion("mcq")] }); // blank + no correct answer
    expect(validateBuilder(s, false)).toEqual([]);
    expect(validateBuilder(s, true).length).toBeGreaterThan(0);
  });

  it("requires at least one question to publish", () => {
    const issue = validateBuilderIssues(draft(), true).find((i) => i.field === "questions");
    expect(issue?.step).toBe("questions");
  });

  it("requires exactly one correct answer per question", () => {
    const noneCorrect = mcq(-1);
    expect(validateBuilder(draft({ questions: [noneCorrect] }), true)).toContain(
      "Question 1 needs a correct answer.",
    );

    const twoCorrect = mcq(0);
    twoCorrect.options.forEach((o) => (o.is_correct = true));
    expect(validateBuilder(draft({ questions: [twoCorrect] }), true)).toContain(
      "Question 1 has more than one correct answer.",
    );
  });

  it("accepts a valid mcq + true/false quiz", () => {
    const s = draft({ questions: [mcq(0), trueFalse(1)] });
    expect(validateBuilder(s, true)).toEqual([]);
  });

  it("addresses question issues to their index so the UI can navigate", () => {
    const s = draft({ questions: [mcq(0), mcq(-1)] });
    expect(invalidQuestionIndexes(s)).toEqual(new Set([1]));
  });
});

describe("toRpcDefinition — lifecycle safety", () => {
  const full = draft({
    meta: {
      title: " Trimmed ",
      description: "d",
      instructions: "i",
      available_from: "2026-05-01T10:00",
      due_at: "2026-05-02T10:00",
      time_limit_seconds: "20",
      attempt_limit: "3",
      shuffle_questions: true,
      shuffle_options: true,
      result_visibility: "manual",
    } as never,
    questions: [mcq(0)],
  });

  it("sends the full payload when unlocked", () => {
    const payload = toRpcDefinition(full, false) as never as {
      meta: Record<string, unknown>;
      questions: unknown[];
    };
    expect(payload.meta.title).toBe("Trimmed");
    // minutes → seconds
    expect(payload.meta.time_limit_seconds).toBe(1200);
    expect(payload.meta.attempt_limit).toBe(3);
    expect(payload.meta.shuffle_questions).toBe(true);
    expect(payload.questions).toHaveLength(1);
  });

  it("omits every frozen field when the quiz is locked", () => {
    const payload = toRpcDefinition(full, true) as never as {
      meta: Record<string, unknown>;
      questions: unknown[];
    };
    // Questions and answers must never be resent after attempts exist.
    expect(payload.questions).toEqual([]);
    for (const frozen of [
      "available_from",
      "due_at",
      "time_limit_seconds",
      "shuffle_questions",
      "shuffle_options",
    ]) {
      expect(payload.meta).not.toHaveProperty(frozen);
    }
    // Still-editable metadata survives.
    expect(payload.meta.title).toBe("Trimmed");
    expect(payload.meta.result_visibility).toBe("manual");
    expect(payload.meta.attempt_limit).toBe(3);
  });

  it("normalises an empty time limit to null rather than 0", () => {
    const s = draft({ meta: { time_limit_seconds: "" } as never });
    const payload = toRpcDefinition(s, false) as never as { meta: Record<string, unknown> };
    expect(payload.meta.time_limit_seconds).toBeNull();
  });

  it("floors the attempt limit at 1", () => {
    const s = draft({ meta: { attempt_limit: "0" } as never });
    const payload = toRpcDefinition(s, false) as never as { meta: Record<string, unknown> };
    expect(payload.meta.attempt_limit).toBe(1);
  });

  it("sends null explanation rather than an empty string", () => {
    const q = mcq(0);
    q.explanation = "";
    const payload = toRpcDefinition(draft({ questions: [q] }), false) as never as {
      questions: Array<{ explanation: unknown }>;
    };
    expect(payload.questions[0].explanation).toBeNull();
  });
});

describe("stateFromDefinition", () => {
  it("round-trips a server definition into editable draft state", () => {
    const def = {
      quiz: {
        id: "q1",
        class_id: "c1",
        center_id: "ct1",
        title: "Bio",
        description: null,
        instructions: null,
        status: "published",
        available_from: null,
        due_at: null,
        time_limit_seconds: 1800,
        attempt_limit: 2,
        shuffle_questions: true,
        shuffle_options: false,
        result_visibility: "after_submit",
        results_released_at: null,
        published_at: null,
        total_points: 2,
        updated_at: "",
        definition_version: 7,
      },
      questions: [
        {
          id: "qq1",
          question: "Q",
          question_type: "mcq",
          points: 2,
          explanation: null,
          order_index: 0,
          options: [
            { id: "o1", option_text: "A", is_correct: true, order_index: 0 },
            { id: "o2", option_text: "B", is_correct: false, order_index: 1 },
          ],
        },
      ],
      locked: false,
      has_attempts: false,
      has_results: false,
    } as unknown as QuizDefinitionForManager;

    const s = stateFromDefinition(def);
    // seconds → minutes for the input
    expect(s.meta.time_limit_seconds).toBe("30");
    expect(s.meta.attempt_limit).toBe("2");
    expect(s.meta.shuffle_questions).toBe(true);
    expect(s.questions[0].explanation).toBe("");
    expect(s.questions[0].options[0].is_correct).toBe(true);
    // A round trip through the RPC shape preserves the time limit.
    const payload = toRpcDefinition(s, false) as never as { meta: Record<string, unknown> };
    expect(payload.meta.time_limit_seconds).toBe(1800);
  });

  it("normalises a legacy multiple_choice type to mcq", () => {
    const def = {
      quiz: { title: "x", attempt_limit: 1, result_visibility: "after_submit" },
      questions: [
        { id: "a", question: "q", question_type: "multiple_choice", points: 1, options: [] },
      ],
    } as unknown as QuizDefinitionForManager;
    expect(stateFromDefinition(def).questions[0].question_type).toBe("mcq");
  });
});

describe("helpers", () => {
  it("sums draft points", () => {
    expect(totalPoints(draft({ questions: [mcq(0), trueFalse(0)] }))).toBe(3); // 2 + 1
  });

  it("returns an empty datetime-local value for null/invalid input", () => {
    expect(toLocalInput(null)).toBe("");
    expect(toLocalInput("not-a-date")).toBe("");
  });

  it("builds true/false questions with exactly True and False", () => {
    const q = newQuestion("true_false");
    expect(q.options.map((o) => o.option_text)).toEqual(["True", "False"]);
  });
});
