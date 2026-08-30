/**
 * Folder covers must render at every nesting level.
 *
 * `compact` is a VIEW-DEPTH flag — both the tutor and student materials pages
 * pass `compact={!!currentFolderId}`, so it is true for every folder rendered
 * while browsing inside a parent. The card used to gate the cover image on
 * `!compact`, which is why a cover uploaded to a subfolder saved correctly,
 * was returned by the tree RPC, had its signed URL fetched — and was then
 * never painted.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({
  signedFor: [] as (string | null)[],
}));

vi.mock("@/lib/classCovers", () => ({
  getClassCoverSignedUrl: (path: string | null) => {
    h.signedFor.push(path);
    return Promise.resolve(path ? `https://signed.example/${path}` : null);
  },
  fallbackGradient: () => "from-slate-100 to-slate-200",
  CLASS_COVER_BUCKET: "class-covers",
  invalidateClassCoverCache: () => {},
}));

import { FolderCard } from "./ContentFolderNav";
import type { ContentFolder } from "@/lib/contentFolders";

function folder(over: Partial<ContentFolder> = {}): ContentFolder {
  return {
    id: "folder-1",
    parent_id: null,
    name: "2021",
    description: null,
    cover_image_path: null,
    display_order: 0,
    resource_count: 2,
    quiz_count: 0,
    deck_count: 0,
    subfolder_count: 0,
    ...over,
  };
}

const COVER = "centre-1/class-1/folders/folder-1/abc.webp";

function renderCard(f: ContentFolder, compact: boolean) {
  return render(
    <FolderCard folder={f} classId="class-1" centerId="centre-1" compact={compact} onOpen={() => {}} />,
  );
}

beforeEach(() => {
  h.signedFor = [];
});

describe("folder cover rendering", () => {
  it("CASE B — root folder with a cover renders the image", async () => {
    renderCard(folder({ cover_image_path: COVER }), false);
    const img = await screen.findByAltText("2021 cover");
    expect(img.getAttribute("src")).toBe(`https://signed.example/${COVER}`);
  });

  it("CASE D — a folder with a cover renders the image while browsing inside a parent", async () => {
    // compact === true is the subfolder case that was silently dropping covers.
    renderCard(folder({ cover_image_path: COVER }), true);
    const img = await screen.findByAltText("2021 cover");
    expect(img.getAttribute("src")).toBe(`https://signed.example/${COVER}`);
  });

  it("CASE E — a second-level nested folder renders its cover too", async () => {
    const nested = folder({
      id: "folder-2",
      name: "Trial Set A",
      parent_id: "folder-1",
      cover_image_path: "centre-1/class-1/folders/folder-2/def.webp",
    });
    renderCard(nested, true);
    expect(await screen.findByAltText("Trial Set A cover")).toBeTruthy();
  });

  it("CASE A — root folder without a cover keeps the default treatment", async () => {
    renderCard(folder(), false);
    await waitFor(() => expect(screen.queryByAltText("2021 cover")).toBeNull());
    // No pointless signed-URL request for a folder that has no cover.
    expect(h.signedFor).toHaveLength(0);
  });

  it("CASE C — subfolder without a cover keeps the default treatment", async () => {
    renderCard(folder(), true);
    await waitFor(() => expect(screen.queryByAltText("2021 cover")).toBeNull());
    expect(h.signedFor).toHaveLength(0);
  });

  it("CASE F — replacing the cover swaps to the new signed object", async () => {
    const { rerender } = renderCard(folder({ cover_image_path: COVER }), true);
    expect((await screen.findByAltText("2021 cover")).getAttribute("src")).toContain("abc.webp");

    const replaced = "centre-1/class-1/folders/folder-1/xyz.webp";
    rerender(
      <FolderCard
        folder={folder({ cover_image_path: replaced })}
        classId="class-1"
        centerId="centre-1"
        compact
        onOpen={() => {}}
      />,
    );
    await waitFor(() =>
      expect(screen.getByAltText("2021 cover").getAttribute("src")).toContain("xyz.webp"),
    );
  });

  it("signs the exact path stored on that folder, not a parent's", async () => {
    renderCard(folder({ id: "folder-9", cover_image_path: COVER }), true);
    await screen.findByAltText("2021 cover");
    expect(h.signedFor).toEqual([COVER]);
  });

it("frames a covered folder as a square, so a 600x600 cover is never cropped", async () => {
    // The upload crops to 600x600. A 16/9 frame showed only ~56% of that
    // artwork and cut the bottom off, which is where these covers put their
    // subject. Cover + square frame + square source = zero crop.
    const { container } = renderCard(folder({ cover_image_path: COVER }), true);
    await screen.findByAltText("2021 cover");
    const frame = container.querySelector("div.relative.w-full");
    expect(frame?.className).toContain("aspect-square");
    expect(frame?.className).not.toContain("aspect-[16/9]");
  });

  it("keeps the slim strip for an uncovered folder inside a parent", async () => {
    const { container } = renderCard(folder(), true);
    const frame = container.querySelector("div.relative.w-full");
    expect(frame?.className).toContain("aspect-[16/7]");
  });

  it("uses object-cover so a 600x600 cover is cropped, never stretched", async () => {
    renderCard(folder({ cover_image_path: COVER }), true);
    const img = await screen.findByAltText("2021 cover");
    expect(img.className).toContain("object-cover");
  });
});
