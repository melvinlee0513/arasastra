/**
 * Student Home presentation invariants.
 *
 * Three defects these pin, all measured in Chromium first:
 *  - the hero showed three stat pills, which squeezed their values;
 *  - the pills used `flex-1`, so they rendered as full-width bars rather than
 *    compact chips, which also made the hero container far taller than the
 *    1.5-aspect background artwork and caused object-cover to slice ~54px off
 *    each side, destroying the artwork's baked-in rounded edges;
 *  - each Continue Learning item drew two decorative "backing deck" spans
 *    behind it, so one item looked like a stack of cards.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/components/profile/UserAvatar", () => ({
  UserAvatar: ({ name }: { name: string }) => <div data-testid="avatar">{name}</div>,
}));

import { StudentHomeHero } from "./StudentHomeHero";
import { StudentHomeContinueLearning } from "./StudentHomeContinueLearning";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const profile = {
  full_name: "Melvin Lee",
  display_name: "Melvin Lee",
  avatar_path: null,
  avatar_updated_at: null,
  home_header_color: "red",
} as never;

function hero(over: Partial<{ showRank: boolean; totalXp: number; rank: number | null }> = {}) {
  return wrap(
    <StudentHomeHero
      profile={profile}
      isLoading={false}
      showGamification
      showRank={over.showRank ?? true}
      statsLoading={false}
      totalXp={over.totalXp ?? 85}
      rank={over.rank === undefined ? 1 : over.rank}
      unreadCount={0}
    />,
  );
}

describe("Home hero stat pills", () => {
  it("renders exactly TWO pills — XP and rank, no streak", () => {
    hero();
    const pills = screen.getAllByRole("listitem");
    expect(pills).toHaveLength(2);
    expect(within(pills[0]).getByText("85 XP")).toBeTruthy();
    expect(within(pills[0]).getByText("earned")).toBeTruthy();
    expect(within(pills[1]).getByText("#1")).toBeTruthy();
    expect(within(pills[1]).getByText("this week")).toBeTruthy();
    // The streak lives elsewhere in the LMS; it must not be back on the hero.
    expect(screen.queryByText(/streak/i)).toBeNull();
  });

  it("sizes pills to their content — never full-width bars", () => {
    hero();
    for (const pill of screen.getAllByRole("listitem")) {
      // `flex-1` is what turned these chips into bars spanning the hero.
      expect(pill.className).not.toContain("flex-1");
      expect(pill.className).not.toContain("w-full");
    }
  });

  it("lays the pills out in a wrapping row, not a forced column", () => {
    hero();
    const list = screen.getAllByRole("listitem")[0].parentElement!;
    expect(list.className).toContain("flex-wrap");
    // A forced column made the hero tall enough to wreck the background crop.
    expect(list.className).not.toContain("flex-col");
  });

  it("drops the rank pill when there is no ranking to show", () => {
    hero({ showRank: false, rank: null });
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("85 XP")).toBeTruthy();
  });

  it("shows ordinary XP values in full", () => {
    hero({ totalXp: 12450 });
    expect(screen.getByText("12,450 XP")).toBeTruthy();
  });

  it("keeps the hero background image at the container's own size", () => {
    const { container } = hero();
    const img = container.querySelector("img[aria-hidden='true']")!;
    // Over-scaling to 112% pushed the artwork's rounded corners out of frame.
    expect(img.className).toContain("h-full");
    expect(img.className).toContain("w-full");
    expect(img.className).not.toContain("112%");
  });

  it("keeps the greeting and the inbox control", () => {
    hero();
    expect(screen.getByText(/Welcome back, Melvin/)).toBeTruthy();
    expect(screen.getByLabelText("Inbox")).toBeTruthy();
  });
});

describe("Continue Learning cards", () => {
  const items = [
    {
      item_id: "1",
      category: "quiz",
      class_name: "Physics Form 4 · Mr LKM",
      subject_name: "Physics",
      title: "Copy of Quiz Test",
      class_id: "c1",
      last_opened_at: new Date(Date.now() - 3600e3).toISOString(),
    },
    {
      item_id: "2",
      category: "flashcards",
      class_name: "Physics Form 4 · Mr LKM",
      subject_name: "Physics",
      title: "Chapter 1",
      class_id: "c1",
      last_opened_at: new Date(Date.now() - 7200e3).toISOString(),
    },
  ];

  function carousel(isLoading = false) {
    return wrap(
      <StudentHomeContinueLearning
        items={(isLoading ? [] : items) as never}
        isLoading={isLoading}
        isError={false}
        onRetry={() => {}}
      />,
    );
  }

  it("renders one card surface per item — no decorative stack layers", () => {
    const { container } = carousel();
    // The deck layers were absolute spans with these exact insets.
    expect(container.querySelectorAll("span.absolute.inset-x-3")).toHaveLength(0);
    expect(container.querySelectorAll("span.absolute.inset-x-1\\.5")).toHaveLength(0);
  });

  it("keeps both items and their content", () => {
    carousel();
    expect(screen.getByText("Copy of Quiz Test")).toBeTruthy();
    expect(screen.getByText("Chapter 1")).toBeTruthy();
    expect(screen.getAllByText("Physics Form 4 · Mr LKM")).toHaveLength(2);
    // One navigable card per item, still linking out.
    expect(screen.getAllByRole("link").length).toBeGreaterThanOrEqual(2);
  });

  it("the loading skeleton has no stack layers either", () => {
    const { container } = carousel(true);
    expect(container.querySelectorAll("span.absolute.inset-x-3")).toHaveLength(0);
    expect(container.querySelectorAll("span.absolute.inset-x-1\\.5")).toHaveLength(0);
  });
});
