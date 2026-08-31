/**
 * The expandedQuestionTypes flag gates AUTHORING and nothing else.
 *
 * There is no server-side guard on question_type, deliberately: the builder
 * rewrites a quiz's questions on every save, so a database-level gate would
 * stop a tutor editing the title of a quiz that already contains a numeric
 * question. What the flag does is decide which types are offered.
 */
import { describe, it, expect } from "vitest";
import { QUESTION_TYPES, questionTypesFor } from "./questionTypes";

const values = (on: boolean) => questionTypesFor(on).map((t) => t.value);

describe("which question types a tutor is offered", () => {
  it("offers everything the engine grades when the flag is on", () => {
    expect(values(true)).toEqual(QUESTION_TYPES.map((t) => t.value));
    expect(values(true)).toHaveLength(6);
  });

  it("offers only the classic two when the flag is off", () => {
    expect(values(false).sort()).toEqual(["mcq", "true_false"]);
  });

  it("hides exactly the four Phase 5 types, not an arbitrary subset", () => {
    const hidden = values(true).filter((v) => !values(false).includes(v));
    expect(hidden.sort()).toEqual(["fill_blank", "multiple_select", "numeric", "short_answer"]);
  });

  it("never returns a type with no grading branch", () => {
    // The database CHECK carries the same list (quiz_questions_type_ck), and
    // supabase/tests/quiz_phase345 asserts the two agree.
    const gradeable = new Set([
      "mcq", "multiple_choice", "true_false",
      "multiple_select", "short_answer", "numeric", "fill_blank",
    ]);
    for (const v of values(true)) expect(gradeable.has(v)).toBe(true);
  });

  it("does not mutate the canonical list when filtering", () => {
    questionTypesFor(false);
    expect(QUESTION_TYPES).toHaveLength(6);
  });
});
