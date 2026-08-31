/**
 * Host control surfaces — response distribution and participant management.
 *
 * Two properties matter more than the layout:
 *
 *  - the distribution must not mark the correct option before the host has
 *    revealed it, even though the host's payload legitimately carries
 *    `is_correct` (a tutor often shares this screen with the room);
 *  - the roster must never claim a player is "online". The app has no presence
 *    channel, so it reports only what the server can prove: joined / left /
 *    removed, and a last-seen timestamp that moves solely on server-observed
 *    activity.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";

import { LiveQuizResponseBars } from "./LiveQuizResponseBars";
import { LiveQuizPlayerList } from "./LiveQuizPlayerList";
import type { LiveQuizPlayer, LiveQuizQuestionStats } from "@/lib/liveQuiz";

const stats: LiveQuizQuestionStats = {
  question_index: 0,
  answered: 25,
  options: [
    { option_id: "o1", text: "Chlorophyll", is_correct: true, count: 18 },
    { option_id: "o2", text: "Carotene", is_correct: false, count: 4 },
    { option_id: "o3", text: "Hemoglobin", is_correct: false, count: 2 },
    { option_id: "o4", text: "Melanin", is_correct: false, count: 1 },
  ],
};

describe("LiveQuizResponseBars", () => {
  it("shows counts and percentages of the answers given", () => {
    render(<LiveQuizResponseBars stats={stats} revealed />);
    expect(screen.getByText("25 answered")).toBeTruthy();
    // 18/25 = 72%, 4/25 = 16%, 2/25 = 8%, 1/25 = 4%
    for (const pct of ["72%", "16%", "8%", "4%"]) {
      expect(screen.getByText(pct)).toBeTruthy();
    }
  });

  it("does NOT mark the correct option before the reveal", () => {
    const { container } = render(<LiveQuizResponseBars stats={stats} revealed={false} />);
    // The correct-answer treatment is the only thing that uses quiz-correct.
    expect(container.querySelectorAll(".bg-quiz-correct")).toHaveLength(0);
    expect(container.querySelectorAll(".text-emerald-200")).toHaveLength(0);
    // The options themselves are still listed — the host needs to see them.
    expect(screen.getByText("Chlorophyll")).toBeTruthy();
  });

  it("marks the correct option once revealed", () => {
    const { container } = render(<LiveQuizResponseBars stats={stats} revealed />);
    expect(container.querySelectorAll(".bg-quiz-correct").length).toBeGreaterThan(0);
  });

  it("survives a question nobody has answered without dividing by zero", () => {
    const empty: LiveQuizQuestionStats = {
      ...stats,
      answered: 0,
      options: stats.options.map((o) => ({ ...o, count: 0 })),
    };
    render(<LiveQuizResponseBars stats={empty} revealed={false} />);
    expect(screen.getByText("0 answered")).toBeTruthy();
    expect(screen.getAllByText("0%")).toHaveLength(4);
  });

  it("describes each bar for screen readers", () => {
    render(<LiveQuizResponseBars stats={stats} revealed />);
    expect(
      screen.getByLabelText("Chlorophyll: 18 of 25 answers, 72 percent"),
    ).toBeTruthy();
  });
});

const players: LiveQuizPlayer[] = [
  {
    participant_id: "p1",
    display_name: "Aisyah",
    avatar_url: null,
    status: "joined",
    score: 4250,
    correct_count: 8,
    answered: true,
    last_seen_at: new Date(Date.now() - 120_000).toISOString(),
  },
  {
    participant_id: "p2",
    display_name: "Marcus",
    avatar_url: null,
    status: "joined",
    score: 3980,
    correct_count: 7,
    answered: false,
    last_seen_at: new Date(Date.now() - 600_000).toISOString(),
  },
  {
    participant_id: "p3",
    display_name: "Daniel",
    avatar_url: null,
    status: "left",
    score: 1200,
    correct_count: 2,
    answered: false,
    last_seen_at: new Date(Date.now() - 3_600_000).toISOString(),
  },
];

describe("LiveQuizPlayerList", () => {
  it("never claims a player is online — only what the server can prove", () => {
    const { container } = render(<LiveQuizPlayerList players={players} showAnswered />);
    expect(container.textContent).not.toMatch(/online/i);
    expect(container.textContent).not.toMatch(/connected/i);
    expect(screen.getAllByText("Joined")).toHaveLength(2);
    expect(screen.getByText("Left")).toBeTruthy();
    expect(screen.getAllByText(/^seen /).length).toBe(3);
  });

  it("counts only the players still in the game", () => {
    render(<LiveQuizPlayerList players={players} showAnswered />);
    expect(screen.getByText("2 in the game")).toBeTruthy();
  });

  it("marks who has answered the current question", () => {
    render(<LiveQuizPlayerList players={players} showAnswered />);
    expect(screen.getByLabelText("Answered")).toBeTruthy();
    expect(screen.getByLabelText("Not answered yet")).toBeTruthy();
  });

  it("hides the answered column when no question is open", () => {
    render(<LiveQuizPlayerList players={players} showAnswered={false} />);
    expect(screen.queryByLabelText("Answered")).toBeNull();
    expect(screen.queryByLabelText("Not answered yet")).toBeNull();
  });

  it("offers removal only for players still in the game", () => {
    render(<LiveQuizPlayerList players={players} showAnswered onRemove={() => {}} />);
    expect(screen.getByLabelText("Remove Aisyah from the game")).toBeTruthy();
    expect(screen.getByLabelText("Remove Marcus from the game")).toBeTruthy();
    // Daniel already left; there is nothing to remove.
    expect(screen.queryByLabelText("Remove Daniel from the game")).toBeNull();
  });

  it("requires confirmation before removing, and passes the participant id", () => {
    const onRemove = vi.fn();
    render(<LiveQuizPlayerList players={players} showAnswered onRemove={onRemove} />);

    fireEvent.click(screen.getByLabelText("Remove Aisyah from the game"));
    expect(onRemove).not.toHaveBeenCalled();

    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText(/Remove Aisyah\?/)).toBeTruthy();
    fireEvent.click(within(dialog).getByText("Remove player"));
    expect(onRemove).toHaveBeenCalledWith("p1");
  });

  it("cancelling the confirmation removes nobody", () => {
    const onRemove = vi.fn();
    render(<LiveQuizPlayerList players={players} showAnswered onRemove={onRemove} />);
    fireEvent.click(screen.getByLabelText("Remove Marcus from the game"));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByText("Keep them in"));
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("shows no remove control at all when the caller cannot remove", () => {
    render(<LiveQuizPlayerList players={players} showAnswered />);
    expect(screen.queryByLabelText(/^Remove /)).toBeNull();
  });

  it("renders a player payload that carries no host-only fields", () => {
    // This is what a STUDENT's snapshot looks like: four fields, no score.
    const lean: LiveQuizPlayer[] = [
      { participant_id: "p1", display_name: "Aisyah", avatar_url: null, status: "joined" },
    ];
    const { container } = render(<LiveQuizPlayerList players={lean} showAnswered />);
    expect(screen.getByText("Aisyah")).toBeTruthy();
    expect(container.textContent).not.toMatch(/seen /);
    expect(screen.queryByLabelText("Answered")).toBeNull();
  });

  it("shows a removed player as removed, not as still playing", () => {
    const removed: LiveQuizPlayer[] = [
      { ...players[0], status: "removed" },
    ];
    render(<LiveQuizPlayerList players={removed} showAnswered onRemove={() => {}} />);
    expect(screen.getByText("Removed")).toBeTruthy();
    expect(screen.getByText("0 in the game")).toBeTruthy();
    expect(screen.queryByLabelText("Remove Aisyah from the game")).toBeNull();
  });
});
