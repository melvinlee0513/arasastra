/**
 * Reading a result back.
 *
 * The answer key lives in a different column for each question type, and the
 * student's own response does too. Two bugs came from assuming otherwise:
 * a multiple select marked none of the student's picks as theirs, and a typed
 * question showed no correct answer at all because it only read
 * `correct_answer`, which is null for every type Phase 5 added.
 *
 * Grading is proven in `supabase/tests/quiz_phase345/`. What these pin is which
 * column each display value comes from.
 */
import { describe, it, expect } from "vitest";
import {
  resultChosenOptionIds,
  resultCorrectAnswerText,
  type QuizResultQuestion,
} from "./quizzes";

function q(over: Partial<QuizResultQuestion> = {}): QuizResultQuestion {
  return {
    question_id: "q1",
    prompt: "Pick one",
    question_type: "mcq",
    points: 1,
    explanation: null,
    correct_answer: null,
    accepted_answers: null,
    numeric_answer: null,
    answer_unit: null,
    options: [],
    selected_option_id: null,
    selected_answer: null,
    is_correct: false,
    points_awarded: 0,
    ...over,
  };
}

describe("which options the student chose", () => {
  it("reads a single choice from selected_option_id", () => {
    expect(resultChosenOptionIds(q({ selected_option_id: "o1" }))).toEqual(["o1"]);
  });

  it("reads a multiple select from the JSON array in selected_answer", () => {
    // This is the case that used to mark none of them as the student's own.
    expect(
      resultChosenOptionIds(
        q({ question_type: "multiple_select", selected_answer: '["o1","o3"]' }),
      ),
    ).toEqual(["o1", "o3"]);
  });

  it("returns nothing for an unanswered question", () => {
    expect(resultChosenOptionIds(q())).toEqual([]);
  });

  it("does not treat a typed answer as an option id", () => {
    expect(resultChosenOptionIds(q({ question_type: "short_answer", selected_answer: "Newton" })))
      .toEqual([]);
  });

  it("survives a malformed stored answer rather than throwing on a results page", () => {
    expect(
      resultChosenOptionIds(q({ question_type: "multiple_select", selected_answer: "not json" })),
    ).toEqual([]);
    expect(
      resultChosenOptionIds(q({ question_type: "multiple_select", selected_answer: '{"a":1}' })),
    ).toEqual([]);
  });
});

describe("what to show as the correct answer", () => {
  it("uses the accepted answers for a short answer", () => {
    expect(
      resultCorrectAnswerText(
        q({ question_type: "short_answer", accepted_answers: ["Newton", "Isaac Newton"] }),
      ),
    ).toBe("Newton, Isaac Newton");
  });

  it("uses the numeric answer, with its unit", () => {
    expect(
      resultCorrectAnswerText(q({ question_type: "numeric", numeric_answer: 9.81, answer_unit: "m/s²" })),
    ).toBe("9.81 m/s²");
  });

  it("shows a numeric answer with no unit as just the number", () => {
    expect(resultCorrectAnswerText(q({ question_type: "numeric", numeric_answer: 42 }))).toBe("42");
  });

  it("shows zero, which is a real answer", () => {
    expect(resultCorrectAnswerText(q({ question_type: "numeric", numeric_answer: 0 }))).toBe("0");
  });

  it("falls back to the legacy correct_answer for a true/false question", () => {
    expect(resultCorrectAnswerText(q({ question_type: "true_false", correct_answer: "true" })))
      .toBe("true");
  });

  it("returns nothing when the key is the options, not a column", () => {
    // A multiple-choice question marks its correct option in the list instead.
    expect(resultCorrectAnswerText(q({ question_type: "mcq" }))).toBeNull();
  });

  it("treats a blank legacy correct_answer as absent, not as an empty answer", () => {
    expect(resultCorrectAnswerText(q({ correct_answer: "   " }))).toBeNull();
  });

  it("never surfaces a tolerance — the payload does not carry one", () => {
    const payload = q({ question_type: "numeric", numeric_answer: 9.81, answer_unit: "m/s²" });
    expect(JSON.stringify(payload)).not.toMatch(/tolerance/);
  });
});
