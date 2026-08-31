/**
 * A `React.lazy` that survives a deploy.
 *
 * The failure this exists for: the service worker is configured with
 * `skipWaiting` and `clientsClaim` (vite.config.ts), so a new worker takes
 * control of tabs that are ALREADY OPEN, without those tabs reloading. The old
 * page keeps running old JavaScript, and the moment it navigates to a route it
 * has not loaded yet it asks for a hashed chunk that the deploy replaced.
 * `cleanupOutdatedCaches` has removed it from Cache Storage and the file is
 * gone from the server, so the dynamic import rejects.
 *
 * React.lazy propagates that rejection, and with no error boundary in the tree
 * React unmounts everything: a blank white page, for a tutor or student who did
 * nothing but leave a tab open across a release.
 *
 * The recovery is a one-shot reload. A stale document cannot repair itself, and
 * a reload fetches the current index.html and the chunk names that go with it.
 * The attempt is recorded in sessionStorage so a chunk that is genuinely
 * missing — a broken build, an offline device — fails visibly on the second try
 * instead of reloading forever.
 */
import { lazy, type ComponentType } from "react";

const RETRY_KEY = "aras:chunk-reload";

/**
 * A failed dynamic import, as each engine reports it. Deliberately narrow: a
 * TypeError from the component's own module-level code would otherwise be
 * mistaken for a stale chunk and reload the page in a loop.
 */
export function isChunkLoadError(err: unknown): boolean {
  const name = (err as { name?: string })?.name ?? "";
  const message = (err as { message?: string })?.message ?? "";
  if (name === "ChunkLoadError") return true;
  return (
    /Failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message) ||
    /'text\/html' is not a valid JavaScript MIME type/i.test(message)
  );
}

function alreadyRetried(): boolean {
  try {
    return sessionStorage.getItem(RETRY_KEY) !== null;
  } catch {
    // Private mode, or storage disabled. Treat as "already tried" rather than
    // risking a reload loop we cannot detect.
    return true;
  }
}

function markRetried(): void {
  try {
    sessionStorage.setItem(RETRY_KEY, String(Date.now()));
  } catch {
    /* best effort */
  }
}

/** Called once the app has rendered, so the next deploy gets its own retry. */
export function clearChunkRetryMarker(): void {
  try {
    sessionStorage.removeItem(RETRY_KEY);
  } catch {
    /* best effort */
  }
}

async function purgeCaches(): Promise<void> {
  try {
    if (typeof caches === "undefined") return;
    const keys = await caches.keys();
    await Promise.allSettled(keys.map((k) => caches.delete(k)));
  } catch {
    /* best effort — never block the reload on cleanup */
  }
}

/**
 * Drop-in for `lazy(() => import(...))`.
 *
 * On a chunk-load failure it wipes Cache Storage — the stale `index.html` in
 * `html-navigations` is as much the problem as the missing chunk — and reloads
 * once. The returned promise never resolves in that path; the page is going
 * away.
 */
export function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (err) {
      if (!isChunkLoadError(err) || alreadyRetried()) throw err;
      markRetried();
      await purgeCaches();
      window.location.reload();
      // Park forever: the reload is in flight and rendering anything here
      // would flash a fallback the user never needs to see.
      return await new Promise<{ default: T }>(() => {});
    }
  });
}
