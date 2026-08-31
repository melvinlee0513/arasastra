#!/usr/bin/env node
/**
 * Audit the BUILT service worker.
 *
 * The rules in vite.config.ts are the intent; this reads what actually landed
 * in dist/sw.js, because a workbox config that silently fails to apply looks
 * identical from the config file.
 *
 * What it is guarding against:
 *   - any authenticated Supabase response reaching Cache Storage, where the key
 *     is the URL alone and a cached identity response can outlive the session
 *     that fetched it;
 *   - anything user-specific in the precache manifest, which every visitor
 *     downloads.
 *
 * Run after `vite build`:  node scripts/audit-service-worker.mjs
 * Exits non-zero on any failure.
 */
import { readFileSync, existsSync } from "node:fs";

const SW = "dist/sw.js";

if (!existsSync(SW)) {
  console.error(`${SW} not found — run \`npx vite build\` first.`);
  process.exit(2);
}

const sw = readFileSync(SW, "utf8");
let failed = 0;

const check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS  " : "FAIL  "}${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
};

// ── Runtime caching ────────────────────────────────────────────────────────
check("a rule matches the Supabase host", sw.includes("supabase.co"));
check("NetworkOnly is used", sw.includes("NetworkOnly"));
check(
  "the retired supabase-api-cache is gone",
  !sw.includes("supabase-api-cache"),
  "it held /rest/v1 responses keyed by URL alone",
);
check("navigations are NetworkFirst, not CacheFirst", sw.includes("html-navigations"));
check("hashed assets have their own cache", sw.includes("static-assets"));
check("outdated precaches are cleaned up", sw.includes("cleanupOutdatedCaches"));

// ── Precache manifest ──────────────────────────────────────────────────────
const urls = [...sw.matchAll(/url:"([^"]+)"/g)].map((m) => m[1]);
check("the precache manifest is non-empty", urls.length > 0, `${urls.length} entries`);

// A path segment, not a substring: `AuthPage-abc.js` is a build artefact,
// `/auth/v1/token` is an API call, and only the second one matters.
const API_PATH = /(^|\/)(rest|auth|storage|realtime|functions)\/v\d/i;
const apiish = urls.filter((u) => API_PATH.test(u));
check("no API path is precached", apiish.length === 0, apiish.slice(0, 5).join(", "));

const withQuery = urls.filter((u) => u.includes("?") || u.includes("token") || u.includes("jwt"));
check(
  "nothing precached carries a query string or a token",
  withQuery.length === 0,
  withQuery.slice(0, 5).join(", "),
);

const STATIC = /\.(js|css|html|png|jpe?g|svg|webp|ico|woff2?|webmanifest|json|txt)$/i;
const odd = urls.filter((u) => !STATIC.test(u));
check("every precached entry is a static build artefact", odd.length === 0, odd.slice(0, 5).join(", "));

const html = urls.filter((u) => u.endsWith(".html"));
check(
  "only the SPA shell is precached as HTML",
  html.length === 1 && html[0] === "index.html",
  html.join(", "),
);

// ── The pairing that needs the client-side recovery ────────────────────────
// skipWaiting + clientsClaim means a new worker takes over tabs that are
// already open, without reloading them. That is fine ONLY because
// src/lib/lazyWithRetry.ts turns the resulting chunk 404 into a one-shot
// reload; without it those tabs go blank on their next route change.
const aggressive = sw.includes("skipWaiting") && sw.includes("clientsClaim");
if (aggressive) {
  const hasRecovery = existsSync("src/lib/lazyWithRetry.ts");
  check(
    "skipWaiting+clientsClaim is paired with chunk-load recovery",
    hasRecovery,
    "src/lib/lazyWithRetry.ts",
  );
  const app = existsSync("src/App.tsx") ? readFileSync("src/App.tsx", "utf8") : "";
  // Match the import statements, not a mention. An earlier version of this
  // check tested `app.includes("lazyWithRetry")` and was satisfied by the
  // comment that explains why the import is there.
  const importsRetry =
    /import\s*\{[^}]*\blazyWithRetry\b[^}]*\}\s*from\s*["']@\/lib\/lazyWithRetry["']/.test(app);
  const importsReactLazy = /import\s*\{[^}]*\blazy\b[^}]*\}\s*from\s*["']react["']/.test(app);
  check(
    "routes use the retrying lazy, not React.lazy directly",
    importsRetry && !importsReactLazy,
    importsReactLazy ? "App.tsx still imports lazy from react" : "",
  );
  check(
    "the route tree has an error boundary",
    /<AppErrorBoundary>/.test(app) &&
      /import\s*\{[^}]*\bAppErrorBoundary\b[^}]*\}\s*from/.test(app),
  );
}

console.log();
console.log(failed === 0 ? "service worker audit: PASS" : `service worker audit: ${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
