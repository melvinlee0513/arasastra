/**
 * The boundary is what stands between a thrown render and a blank page. Before
 * it existed there was no error boundary anywhere in the app.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AppErrorBoundary } from "./AppErrorBoundary";

function Boom({ message, name }: { message: string; name?: string }): never {
  const e = new Error(message);
  if (name) e.name = name;
  throw e;
}

let consoleSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  // React logs the caught error itself; the boundary logs it too. Neither is
  // interesting here and both make the run unreadable.
  consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => consoleSpy.mockRestore());

describe("what the user sees", () => {
  it("renders its children when nothing throws", () => {
    render(
      <AppErrorBoundary>
        <p>the app</p>
      </AppErrorBoundary>,
    );
    expect(screen.getByText("the app")).toBeTruthy();
  });

  it("says a new version is ready when a chunk failed", () => {
    render(
      <AppErrorBoundary>
        <Boom message="Failed to fetch dynamically imported module: /assets/x-a1b2.js" />
      </AppErrorBoundary>,
    );
    expect(screen.getByText("A new version is ready")).toBeTruthy();
    expect(screen.getByText(/nothing you saved is lost/)).toBeTruthy();
    // A hashed filename means nothing to a student; it is not shown for this case.
    expect(screen.queryByText(/assets\/x-a1b2/)).toBeNull();
  });

  it("says something went wrong for any other error, and shows it", () => {
    render(
      <AppErrorBoundary>
        <Boom message="Cannot read properties of undefined" />
      </AppErrorBoundary>,
    );
    expect(screen.getByText("Something went wrong")).toBeTruthy();
    // Support needs something to read back.
    expect(screen.getByText("Cannot read properties of undefined")).toBeTruthy();
  });

  it("offers a reload that meets the 44px tap-target floor", () => {
    render(
      <AppErrorBoundary>
        <Boom message="Failed to fetch dynamically imported module" />
      </AppErrorBoundary>,
    );
    const btn = screen.getByRole("button", { name: "Reload" });
    expect(btn.className).toMatch(/min-h-\[48px\]/);
  });

  it("wipes Cache Storage before reloading, so the stale shell goes too", async () => {
    const del = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("caches", { keys: vi.fn().mockResolvedValue(["html-navigations"]), delete: del });
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, reload },
      writable: true,
    });

    render(
      <AppErrorBoundary>
        <Boom message="Failed to fetch dynamically imported module" />
      </AppErrorBoundary>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    await vi.waitFor(() => expect(reload).toHaveBeenCalled());
    expect(del).toHaveBeenCalledWith("html-navigations");
    vi.unstubAllGlobals();
  });
});
