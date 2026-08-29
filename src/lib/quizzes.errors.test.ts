/**
 * Every error the quiz RPCs raise must reach the user as something actionable.
 *
 * The strings below are copied verbatim from the RAISE EXCEPTION statements in
 * `supabase/migrations/20260718082042_*.sql` and
 * `supabase/migrations/20260723143055_*.sql`. Two conventions coexist there —
 * snake_case tokens in the newer definition RPCs, prose in the older student
 * attempt RPCs — and both have to map.
 */
import { describe, it, expect } from "vitest";
import { mapQuizError } from "./quizzes";

const FALLBACK = "Something went wrong. Please try again.";

/** Shaped like a postgrest error. */
const e = (message: string) => ({ message });

describe("mapQuizError — student attempt RPCs (prose form)", () => {
  const cases: [string, RegExp][] = [
    ["quiz not yet available", /isn't available yet/i],
    ["quiz due date passed", /past its due date/i],
    ["attempt limit reached", /used all your attempts/i],
    ["not enrolled in class", /aren't enrolled/i],
    ["quiz unavailable", /no longer available/i],
    ["attempt not found", /couldn't find that attempt/i],
    ["not authenticated", /sign in again/i],
    ["not authorised", /don't have permission/i],
  ];

  it.each(cases)("maps %j to a specific message", (raised, expected) => {
    const out = mapQuizError(e(raised));
    expect(out).not.toBe(FALLBACK);
    expect(out).toMatch(expected);
  });
});

describe("mapQuizError — definition RPCs (snake_case form)", () => {
  const cases: [string, RegExp][] = [
    ["not_authenticated", /sign in again/i],
    ["access_denied", /don't have permission/i],
    ["not_enrolled", /aren't enrolled/i],
    ["quiz_not_found", /no longer available/i],
    ["class_not_found", /no longer available/i],
    ["quiz_class_mismatch", /different class/i],
    ["cannot_publish_after_attempts", /can't publish/i],
    ["quiz_no_longer_accessible", /no longer available/i],
    ["attempt_not_editable", /no longer be edited/i],
    ["attempt_deadline_passed", /deadline .* has passed/i],
    [
      "quiz_definition_conflict: this quiz was updated by another manager (v4 vs v3)",
      /updated by another manager/i,
    ],
    [
      "progress_revision_conflict: server rev 5 vs client rev 4",
      /updated in another tab/i,
    ],
    [
      "quiz_schedule_locked_after_attempts: available_from cannot change",
      /schedule is locked/i,
    ],
    [
      "quiz_locked_after_attempts: attempt_limit cannot be reduced",
      /attempt_limit cannot be reduced/i,
    ],
    [
      "publish_validation_failed: Question 2 needs exactly one correct answer",
      /Question 2 needs exactly one correct answer/,
    ],
    ["result_visibility=after_due requires a due_at", /Set a due date/i],
  ];

  it.each(cases)("maps %j to a specific message", (raised, expected) => {
    const out = mapQuizError(e(raised));
    expect(out).not.toBe(FALLBACK);
    expect(out).toMatch(expected);
  });
});

describe("mapQuizError — edges", () => {
  it("keeps the caller's fallback for a genuinely unknown error", () => {
    expect(mapQuizError(e("some unrelated postgres failure"), "custom")).toBe("custom");
  });

  it("returns the fallback for an error with no message", () => {
    expect(mapQuizError({})).toBe(FALLBACK);
    expect(mapQuizError(null)).toBe(FALLBACK);
  });

  it("distinguishes 'not open yet' from 'no longer available'", () => {
    // These two are opposite ends of the availability window; collapsing them
    // would tell an early student the quiz is gone.
    expect(mapQuizError(e("quiz not yet available"))).not.toBe(
      mapQuizError(e("quiz unavailable")),
    );
  });
});
