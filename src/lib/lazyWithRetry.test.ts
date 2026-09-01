/**
 * Surviving a deploy with a tab already open.
 *
 * The service worker uses skipWaiting + clientsClaim, so a new worker takes
 * control of open tabs without reloading them. The old page keeps running old
 * JavaScript and the next unvisited route asks for a hashed chunk the deploy
 * replaced. With 85 lazy routes and no error boundary, that rejection used to
 * unmount the whole tree — a blank page for someone who did nothing but leave a
 * tab open.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isChunkLoadError, clearChunkRetryMarker } from "./lazyWithRetry";

describe("recognising a stale chunk", () => {
  it("matches what each engine actually reports", () => {
    // Chrome / Vite
    expect(
      isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: /assets/x-a1b2.js")),
    ).toBe(true);
    // Firefox
    expect(
      isChunkLoadError(new TypeError("error loading dynamically imported module")),
    ).toBe(true);
    // Safari
    expect(isChunkLoadError(new TypeError("Importing a module script failed."))).toBe(true);
    // webpack-style, and what some CDNs surface when index.html is returned
    // for a missing .js
    expect(isChunkLoadError(Object.assign(new Error("boom"), { name: "ChunkLoadError" }))).toBe(true);
    expect(
      isChunkLoadError(
        new TypeError("Expected a JavaScript module script but 'text/html' is not a valid JavaScript MIME type."),
      ),
    ).toBe(true);
  });

  it("does NOT match an ordinary error thrown by the module itself", () => {
    // Reloading on these would be an infinite loop on a genuinely broken page.
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined"))).toBe(false);
    expect(isChunkLoadError(new Error("supabase: not authenticated"))).toBe(false);
    expect(isChunkLoadError(new RangeError("Maximum call stack size exceeded"))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
    expect(isChunkLoadError("a string")).toBe(false);
  });
});

describe("the retry marker", () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => sessionStorage.clear());

  it("is cleared once the app has mounted, so the next deploy gets its own retry", () => {
    sessionStorage.setItem("aras:chunk-reload", "123");
    clearChunkRetryMarker();
    expect(sessionStorage.getItem("aras:chunk-reload")).toBeNull();
  });

  it("survives storage being unavailable rather than throwing at boot", () => {
    const spy = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    expect(() => clearChunkRetryMarker()).not.toThrow();
    spy.mockRestore();
  });
});
