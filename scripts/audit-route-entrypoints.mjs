#!/usr/bin/env node
/**
 * A route nobody can navigate to is not shipped.
 *
 * The Question Bank routed twelve pages, live hosting three and the student
 * join screen one, and nothing in the app linked to any of them. Enabling their
 * feature flags would have changed nothing a user could see. This is the check
 * that would have caught it.
 *
 * For every route declared in App.tsx, it asks: does anything OUTSIDE App.tsx
 * reference a path that would land there? A route with no such reference is
 * reachable only by typing a URL.
 *
 *   node scripts/audit-route-entrypoints.mjs
 *
 * Exits non-zero if a route on the watch list has no entry point.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const APP = "src/App.tsx";
if (!existsSync(APP)) {
  console.error(`${APP} not found — run from the repository root.`);
  process.exit(2);
}

/**
 * Routes this gate is responsible for. Deliberately a list rather than "every
 * route": plenty of routes are legitimately reached only by redirect (/, 404,
 * auth callbacks), and failing on those would train people to ignore this.
 */
const WATCHED = [
  { label: "Question Bank (tutor)", match: "/tutor/question-bank" },
  { label: "Question Bank (admin)", match: "/admin/question-bank" },
  { label: "Host live quiz (tutor)", match: "/live/new", scope: "tutor" },
  { label: "Host live quiz (admin)", match: "/live/new", scope: "admin" },
  { label: "Join live quiz (student)", match: "/dashboard/quiz/join" },
  { label: "Quiz analytics", match: "/analytics" },
  { label: "Quiz builder", match: "/quizzes/new" },
  { label: "Quiz results (manager)", match: "/results" },
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === "node_modules") continue;
      walk(p, out);
    } else if (/\.(tsx|ts)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

const files = walk("src").filter((f) => f !== APP);
const app = readFileSync(APP, "utf8");

// Routes actually declared, so the gate fails loudly if a route is REMOVED
// rather than silently passing because nothing links to a page that is gone.
const declared = [...app.matchAll(/path="([^"]+)"/g)].map((m) => m[1]);

let failed = 0;
console.log("route entry-point audit\n");

for (const { label, match } of WATCHED) {
  const isDeclared = declared.some((p) => p.includes(match));
  if (!isDeclared) {
    console.log(`FAIL  ${label} — no route declares "${match}" any more`);
    failed++;
    continue;
  }

  // Any reference to the path outside App.tsx: a <Link to>, a navigate(), a
  // computed root constant, or a RELATIVE link carrying the last two segments.
  //
  // Matching only the final segment is far too loose — an earlier version of
  // this credited `/tutor/question-bank/questions/new` as an entry point to
  // `/live/new`, because both end in "new". Two segments is the minimum that
  // distinguishes them.
  const segs = match.split("/").filter(Boolean);
  const tail = segs.slice(-2).join("/");
  const hits = [];
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    for (const [i, line] of src.split("\n").entries()) {
      const mentionsPath =
        line.includes(match) ||
        new RegExp(`["'\`][^"'\`]*${tail.replace(/[/]/g, "\\/")}(["'\`/?]|\\$\\{)`).test(line);
      if (!mentionsPath) continue;
      // Require the reference to be a navigation, not an import or query key.
      if (!/\bto=|\bto:|navigate\(|href=|const\s+\w*root/i.test(line)) continue;
      hits.push(`${f}:${i + 1}`);
    }
  }

  if (hits.length === 0) {
    console.log(`FAIL  ${label} — declared, but nothing navigates to it`);
    failed++;
  } else {
    console.log(`PASS  ${label} — ${hits.length} entry point(s), e.g. ${hits[0]}`);
  }
}

console.log();
console.log(failed === 0 ? "route entry-point audit: PASS" : `route entry-point audit: ${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
