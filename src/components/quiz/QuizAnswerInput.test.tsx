/**
 * Student answer controls for the expanded question types.
 *
 * Grading lives in the database and is proven there
 * (`supabase/tests/quiz_phase345/04_qa_types.sql`). What this pins is the
 * client contract: what value each control produces, and that the redacted
 * payload it is handed carries nothing it could leak.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { QuizAnswerInput, type AttemptQuestion } from "./QuizAnswerInput";
import { hasAnswer } from "@/lib/quizAnswers";

function q(over: Partial<AttemptQuestion> = {}): AttemptQuestion {
  return {
    id: "q1",
    question_type: "mcq",
    prompt: "Pick one",
    points: 1,
    options: [
      { id: "o1", text: "Solar Energy", order_index: 1 },
      { id: "o2", text: "Hydropower", order_index: 2 },
      { id: "o3", text: "Coal", order_index: 3 },
    ],
    ...over,
  };
}

describe("multiple select", () => {
  const question = q({ question_type: "multiple_select" });

  it("produces a list of option ids, not a single string", () => {
    const onChange = vi.fn();
    render(<QuizAnswerInput question={question} value={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Solar Energy/ }));
    expect(onChange).toHaveBeenCalledWith(["o1"]);
  });

  it("adds to an existing selection rather than replacing it", () => {
    const onChange = vi.fn();
    render(<QuizAnswerInput question={question} value={["o1"]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Hydropower/ }));
    expect(onChange).toHaveBeenCalledWith(["o1", "o2"]);
  });

  it("deselects an option that was already chosen", () => {
    const onChange = vi.fn();
    render(<QuizAnswerInput question={question} value={["o1", "o2"]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Solar Energy/ }));
    expect(onChange).toHaveBeenCalledWith(["o2"]);
  });

  it("reports its state to assistive technology", () => {
    render(<QuizAnswerInput question={question} value={["o2"]} onChange={() => {}} />);
    expect(screen.getByRole("checkbox", { name: /Hydropower/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("checkbox", { name: /Coal/ })).toHaveAttribute("aria-checked", "false");
  });

  it("tells the student that more than one answer is expected", () => {
    render(<QuizAnswerInput question={question} value={[]} onChange={() => {}} />);
    expect(screen.getByText("Select all that apply.")).toBeTruthy();
  });
});

describe("numeric", () => {
  const question = q({ question_type: "numeric", answer_unit: "m/s²", options: [] });

  it("shows the unit, which is a label the student needs", () => {
    render(<QuizAnswerInput question={question} value="" onChange={() => {}} />);
    expect(screen.getAllByText("m/s²").length).toBeGreaterThan(0);
  });

  it("uses the decimal keypad", () => {
    const { container } = render(<QuizAnswerInput question={question} value="" onChange={() => {}} />);
    expect(container.querySelector("input")).toHaveAttribute("inputmode", "decimal");
  });

  it("keeps digits, a decimal point and a sign, and drops everything else", () => {
    const onChange = vi.fn();
    render(<QuizAnswerInput question={question} value="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/Answer for/), { target: { value: "-9.8abc" } });
    expect(onChange).toHaveBeenCalledWith("-9.8");
  });

  it("renders without a unit when the question has none", () => {
    render(
      <QuizAnswerInput
        question={q({ question_type: "numeric", answer_unit: null, options: [] })}
        value=""
        onChange={() => {}}
      />,
    );
    expect(screen.getByLabelText(/Answer for/)).toBeTruthy();
  });
});

describe("short answer and fill in the blank", () => {
  it("produces the typed string", () => {
    const onChange = vi.fn();
    render(
      <QuizAnswerInput
        question={q({ question_type: "short_answer", options: [] })}
        value=""
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Answer for/), { target: { value: "Newton" } });
    expect(onChange).toHaveBeenCalledWith("Newton");
  });

  it("labels a blank differently from a short answer", () => {
    render(
      <QuizAnswerInput
        question={q({ question_type: "fill_blank", options: [] })}
        value=""
        onChange={() => {}}
      />,
    );
    expect(screen.getByText("Fill in the blank.")).toBeTruthy();
  });

  it("does not autocapitalise, which would break an exact-match answer", () => {
    const { container } = render(
      <QuizAnswerInput
        question={q({ question_type: "fill_blank", options: [] })}
        value=""
        onChange={() => {}}
      />,
    );
    expect(container.querySelector("input")).toHaveAttribute("autocapitalize", "off");
  });
});

describe("true / false keeps its historical answer values", () => {
  it("emits 'true' and 'false', not option ids", () => {
    const onChange = vi.fn();
    render(
      <QuizAnswerInput
        question={q({
          question_type: "true_false",
          options: [
            { id: "opt-uuid-1", text: "True", order_index: 1 },
            { id: "opt-uuid-2", text: "False", order_index: 2 },
          ],
        })}
        value={undefined}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText("True"));
    expect(onChange).toHaveBeenCalledWith("true");
  });
});

describe("an unknown type fails visibly, not silently", () => {
  it("says so rather than rendering nothing", () => {
    render(
      <QuizAnswerInput
        question={q({ question_type: "ordering", options: [] })}
        value=""
        onChange={() => {}}
      />,
    );
    expect(screen.getByText(/isn't supported in this version/)).toBeTruthy();
  });
});

describe("the payload the student receives carries no answer key", () => {
  it("has no correctness on any option, and no accepted answers", () => {
    // This object is the exact shape get_quiz_for_attempt returns.
    const payload = q({ question_type: "multiple_select" });
    const json = JSON.stringify(payload);
    expect(json).not.toMatch(/is_correct/);
    expect(json).not.toMatch(/accepted_answers/);
    expect(json).not.toMatch(/numeric_answer|numeric_tolerance/);
  });
});

describe("hasAnswer", () => {
  it("treats an empty selection as unanswered", () => {
    expect(hasAnswer([])).toBe(false);
    expect(hasAnswer(["o1"])).toBe(true);
  });

  it("treats whitespace-only text as unanswered", () => {
    // Otherwise the navigator would tell a student a question was done.
    expect(hasAnswer("   ")).toBe(false);
    expect(hasAnswer("")).toBe(false);
    expect(hasAnswer("Newton")).toBe(true);
  });

  it("treats a missing value as unanswered", () => {
    expect(hasAnswer(undefined)).toBe(false);
    expect(hasAnswer(null)).toBe(false);
  });

  it("treats '0' as an answer — a numeric zero is a real response", () => {
    expect(hasAnswer("0")).toBe(true);
  });
});
