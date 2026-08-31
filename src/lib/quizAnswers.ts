/**
 * Shared answer-value helpers.
 *
 * A single choice and a typed response are strings; a multiple-select answer is
 * the list of chosen option ids. Correctness is never decided here — the server
 * grades every shape in `_quiz_answer_is_correct`.
 */
export type AnswerValue = string | string[];

/**
 * True when a value counts as an answer for the navigator and the submit sheet.
 *
 * An empty array and a whitespace-only string are NOT answers: treating them as
 * answered would tell a student they had finished a question they had not.
 */
export function hasAnswer(v: AnswerValue | undefined | null): boolean {
  if (v === undefined || v === null) return false;
  if (Array.isArray(v)) return v.length > 0;
  return v.trim().length > 0;
}
