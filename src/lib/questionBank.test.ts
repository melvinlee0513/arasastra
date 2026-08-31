/**
 * Question Bank client contract.
 *
 * The snapshot rule — adding to a quiz COPIES, so editing the bank never
 * rewrites a quiz a class already sat — is enforced and proven in the database
 * (`supabase/tests/quiz_phase345/03_qa_bank.sql`, block I). What this file pins
 * is the client half: that the browser never sends a centre id, that every
 * filter genuinely reaches the server, and that error text never leaks whether
 * an id belongs to another centre.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  calls: [] as { name: string; args: Record<string, unknown> }[],
  result: { data: {} as unknown, error: null as unknown },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (name: string, args: Record<string, unknown>) => {
      h.calls.push({ name, args });
      return Promise.resolve(h.result);
    },
  },
}));

import {
  addBankQuestionsToQuiz, archiveBankQuestion, duplicateBankQuestions,
  listQuestionBank, mapBankError, saveBankQuestion, searchQuestionBank,
  typeLabel, usageLabel,
} from "./questionBank";

const last = () => h.calls[h.calls.length - 1];

beforeEach(() => {
  h.calls = [];
  h.result = { data: {}, error: null };
});

describe("the client never asserts its own scope", () => {
  it("sends no centre id when listing the bank", async () => {
    await listQuestionBank();
    expect(last().name).toBe("list_question_bank");
    expect(last().args).toEqual({});
  });

  it("sends no centre id when searching", async () => {
    await searchQuestionBank({ search: "force" });
    expect(JSON.stringify(last().args)).not.toMatch(/center|centre|role|tutor|admin/i);
  });

  it("sends no centre id when saving", async () => {
    await saveBankQuestion({
      question: "x", questionType: "mcq", points: 1, options: [],
    });
    expect(JSON.stringify(last().args)).not.toMatch(/center|centre/i);
  });
});

describe("filters actually reach the server", () => {
  it("passes every filter through, not just the search term", async () => {
    await searchQuestionBank({
      search: "  force  ", collectionId: "col-1", subjectId: "s1",
      questionType: "true_false", topic: "Forces", sort: "most_used",
      includeArchived: true, limit: 25, offset: 25,
    });
    expect(last().args).toEqual({
      _search: "force", // trimmed
      _collection_id: "col-1",
      _subject_id: "s1",
      _question_type: "true_false",
      _topic: "Forces",
      _sort: "most_used",
      _include_archived: true,
      _limit: 25,
      _offset: 25,
    });
  });

  it("turns a blank search into null rather than an empty-string filter", async () => {
    await searchQuestionBank({ search: "   " });
    expect((last().args as { _search: unknown })._search).toBeNull();
  });

  it("defaults to the un-archived, recently-updated view", async () => {
    await searchQuestionBank();
    expect(last().args).toMatchObject({
      _sort: "recent", _include_archived: false, _search: null,
    });
  });
});

describe("add to quiz", () => {
  it("sends the quiz id and every selected question id", async () => {
    h.result = { data: { added: 2, skipped: 0, quiz_id: "z1" }, error: null };
    await addBankQuestionsToQuiz({ quizId: "z1", questionIds: ["a", "b"] });
    expect(last().name).toBe("add_question_bank_questions_to_quiz");
    expect(last().args).toEqual({ _quiz_id: "z1", _question_ids: ["a", "b"] });
  });

  it("surfaces skipped separately, so a repeat tap can be reported honestly", async () => {
    h.result = { data: { added: 0, skipped: 2, quiz_id: "z1" }, error: null };
    const res = await addBankQuestionsToQuiz({ quizId: "z1", questionIds: ["a", "b"] });
    expect(res).toEqual({ added: 0, skipped: 2, quiz_id: "z1" });
  });

  it("propagates a refusal instead of pretending the add worked", async () => {
    h.result = { data: null, error: { message: "access_denied" } };
    await expect(
      addBankQuestionsToQuiz({ quizId: "z1", questionIds: ["a"] }),
    ).rejects.toBeTruthy();
  });
});

describe("save payload", () => {
  it("sends a null id for a new question and the id for an edit", async () => {
    await saveBankQuestion({
      question: "Q", questionType: "mcq", points: 2,
      options: [{ option_text: "A", is_correct: true }],
    });
    expect((last().args as { _question_id: unknown })._question_id).toBeNull();

    await saveBankQuestion({
      id: "qb-1", question: "Q", questionType: "mcq", points: 2,
      options: [{ option_text: "A", is_correct: true }],
    });
    expect((last().args as { _question_id: unknown })._question_id).toBe("qb-1");
  });

  it("normalises absent optional fields to null, never to empty strings", async () => {
    await saveBankQuestion({
      question: "Q", questionType: "mcq", points: 1, options: [],
    });
    const a = last().args as Record<string, unknown>;
    expect(a._explanation).toBeNull();
    expect(a._topic).toBeNull();
    expect(a._collection_id).toBeNull();
    expect(a._subject_id).toBeNull();
  });
});

describe("archive and duplicate", () => {
  it("archive defaults to archiving and can restore", async () => {
    await archiveBankQuestion("qb-1");
    expect(last().args).toEqual({ _question_id: "qb-1", _archived: true });
    await archiveBankQuestion("qb-1", false);
    expect(last().args).toEqual({ _question_id: "qb-1", _archived: false });
  });

  it("duplicate sends the whole selection in one call, not one per question", async () => {
    h.result = { data: { created: 3, ids: [] }, error: null };
    await duplicateBankQuestions(["a", "b", "c"]);
    expect(h.calls).toHaveLength(1);
    expect(last().args).toEqual({ _question_ids: ["a", "b", "c"] });
  });
});

describe("mapBankError", () => {
  it("gives the same message for a missing and a foreign-centre question", () => {
    // The server raises question_not_found for both, so the id space cannot be
    // probed; the client must not undo that by guessing a different message.
    expect(mapBankError({ message: "question_not_found" })).toBe(
      "That question is no longer available.",
    );
  });

  it("explains a caller with no bank at all", () => {
    expect(mapBankError({ message: "no_question_bank_access" })).toMatch(/don't have access/i);
  });

  it("never leaks a raw Postgres message", () => {
    const msg = mapBankError({
      message: 'insert or update on table "question_bank_options" violates foreign key',
    });
    expect(msg).toBe("Something went wrong.");
    expect(msg).not.toMatch(/table|violates|foreign key/i);
  });
});

describe("labels", () => {
  it("says 'Not used yet' rather than 'Used 0 times'", () => {
    expect(usageLabel(0)).toBe("Not used yet");
    expect(usageLabel(1)).toBe("Used 1 time");
    expect(usageLabel(5)).toBe("Used 5 times");
  });

  it("shortens known types and passes anything else through", () => {
    expect(typeLabel("mcq")).toBe("MCQ");
    expect(typeLabel("true_false")).toBe("T/F");
    expect(typeLabel("something_new")).toBe("something_new");
  });
});
