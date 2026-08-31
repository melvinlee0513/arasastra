/**
 * Analytics client contract.
 *
 * The RPC bodies are proven against a real Postgres in
 * `supabase/tests/quiz_phase345`. What this file pins is the half that lives in
 * the browser: what goes on the wire, what the CSV writer produces, and the
 * formatting rules that decide whether a tutor sees a real figure or a dash.
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
  csvFilename, formatPct, formatSeconds, getQuizAnalyticsOverview,
  getQuizQuestionResponses, getStudentQuizReport, mapAnalyticsError,
  studentsToCsv, type QuizStudentAnalytics,
} from "./quizAnalytics";

const last = () => h.calls[h.calls.length - 1];

/** Minimal RFC 4180 reader, so the escaping assertion checks real parsing. */
function parseCsvRow(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

beforeEach(() => {
  h.calls = [];
  h.result = { data: {}, error: null };
});

describe("analytics RPC calls", () => {
  it("sends only the quiz id — never a centre or a role claim", async () => {
    await getQuizAnalyticsOverview("quiz-1");
    expect(last().name).toBe("get_quiz_analytics_overview");
    expect(last().args).toEqual({ _quiz_id: "quiz-1" });
    expect(JSON.stringify(last().args)).not.toMatch(/center|centre|role|tutor|admin/i);
  });

  it("passes both ids for a per-student report", async () => {
    await getStudentQuizReport("quiz-1", "user-9");
    expect(last().args).toEqual({ _quiz_id: "quiz-1", _user_id: "user-9" });
  });

  it("passes both ids for per-question responses", async () => {
    await getQuizQuestionResponses("quiz-1", "q-3");
    expect(last().args).toEqual({ _quiz_id: "quiz-1", _question_id: "q-3" });
  });

  it("propagates a refusal rather than returning empty analytics", async () => {
    h.result = { data: null, error: { message: "access_denied" } };
    await expect(getQuizAnalyticsOverview("quiz-1")).rejects.toBeTruthy();
  });
});

describe("mapAnalyticsError", () => {
  it("explains a permission refusal", () => {
    expect(mapAnalyticsError({ message: "access_denied" })).toMatch(/don't have access/i);
  });
  it("explains a student with no result", () => {
    expect(mapAnalyticsError({ message: "no_result_for_student" })).toMatch(/hasn't completed/i);
  });
  it("never leaks a raw Postgres message", () => {
    const msg = mapAnalyticsError({
      message: 'relation "quiz_results" does not exist at character 42',
    });
    expect(msg).toBe("Couldn't load analytics.");
    expect(msg).not.toMatch(/relation|character/i);
  });
});

describe("formatting", () => {
  it("shows a dash rather than 0 when a figure is not derivable", () => {
    // avg_seconds_per_question is null when no attempt has usable timestamps.
    expect(formatSeconds(null)).toBe("—");
    expect(formatSeconds(undefined)).toBe("—");
    expect(formatPct(null)).toBe("—");
  });

  it("keeps one decimal for sub-minute averages", () => {
    expect(formatSeconds(8.4)).toBe("8.4 sec");
    expect(formatSeconds(6)).toBe("6 sec");
  });

  it("switches to minutes past 60 seconds", () => {
    expect(formatSeconds(60)).toBe("1 min");
    expect(formatSeconds(95)).toBe("1m 35s");
  });

  it("never renders NaN or Infinity as a number", () => {
    expect(formatSeconds(Number.NaN)).toBe("—");
    expect(formatSeconds(Number.POSITIVE_INFINITY)).toBe("—");
  });
});

describe("CSV export", () => {
  const data: QuizStudentAnalytics = {
    quiz_id: "q1",
    quiz_title: "Photosynthesis Quiz — Form 4",
    question_count: 20,
    students: [
      {
        user_id: "u1", result_id: "r1", display_name: "Aisyah Ahmad", avatar_url: null,
        score: 18, total_questions: 20, total_points: 1800, accuracy_pct: 90, rank: 1,
        avg_seconds_per_question: 6.3, weak_questions: 0,
        completed_at: "2026-09-01T10:00:00.000Z", band: "strong",
      },
      {
        // The name that breaks a naive writer.
        user_id: "u2", result_id: "r2", display_name: 'Lim, Wei "Sam"', avatar_url: null,
        score: 11, total_questions: 20, total_points: 1100, accuracy_pct: 55, rank: 2,
        avg_seconds_per_question: null, weak_questions: 3,
        completed_at: null, band: "moderate",
      },
    ],
  };

  it("writes a header and one row per student", () => {
    const lines = studentsToCsv(data).split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("Student,Score,Out of,Accuracy %,Rank");
  });

  it("quotes and escapes a name containing a comma and quotes", () => {
    const lines = studentsToCsv(data).split("\r\n");
    // RFC 4180: wrap in quotes, double the inner quotes.
    expect(lines[2]).toContain('"Lim, Wei ""Sam"""');
    // The row must still have exactly 8 fields, not be shifted by the comma.
    expect(parseCsvRow(lines[2])).toHaveLength(8);
    expect(parseCsvRow(lines[2])[0]).toBe('Lim, Wei "Sam"');
  });

  it("writes an empty cell, not 'null', for a missing figure", () => {
    const lines = studentsToCsv(data).split("\r\n");
    expect(lines[2]).not.toMatch(/null|undefined|NaN/);
  });

  it("starts with a BOM so Excel reads accented names correctly", () => {
    expect(studentsToCsv(data).charCodeAt(0)).toBe(0xfeff);
  });

  it("slugifies the quiz title into a safe filename", () => {
    expect(csvFilename("Photosynthesis Quiz — Form 4")).toBe(
      "photosynthesis-quiz-form-4-students.csv",
    );
    expect(csvFilename("///")).toBe("quiz-students.csv");
  });
});
