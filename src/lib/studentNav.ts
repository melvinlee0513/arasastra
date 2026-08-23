/**
 * Central student navigation-chrome resolver.
 *
 * One source of truth for which mobile chrome a student route receives, so no
 * component has to guess with scattered `pathname.includes()` checks.
 *
 *  ROOT       – tab-bar destinations and root-level landing pages.
 *               Chrome: mobile bottom tab bar.
 *  CLASS      – a class hub section (Home / Announcements / Materials /
 *               Quizzes / Flashcards / About / Students).
 *               Chrome: mobile top back bar + compact section launcher, no tab bar.
 *  IMMERSIVE  – a learning activity (quiz attempt, quiz result, flashcard study).
 *               Chrome: minimal top back bar only.
 *  OTHER      – anything else (tutor/admin/guardian/public); untouched.
 */
export type StudentChromeState = "root" | "class" | "immersive" | "other";

/** Root-level student destinations that keep the mobile tab bar visible. */
const ROOT_PATHS = new Set<string>([
  "/",
  "/dashboard",
  "/dashboard/more",
  "/dashboard/classes",
  "/dashboard/profile",
  "/account",
  "/timetable",
  "/inbox",
  "/dashboard/achievements",
  "/dashboard/leaderboard",
  "/dashboard/resources",
  "/support",
  "/privacy",
]);

const CLASS_SECTION_RE =
  /^\/dashboard\/classes\/[^/]+(?:\/(?:materials|announcements|about|quizzes|flashcards|students))?\/?$/;

const IMMERSIVE_RE = [
  /^\/dashboard\/classes\/[^/]+\/quizzes\/[^/]+\/attempt\//,
  /^\/dashboard\/classes\/[^/]+\/quizzes\/[^/]+\/results\//,
  /^\/dashboard\/classes\/[^/]+\/flashcards\/[^/]+\/study\/?$/,
];

function normalise(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}

export function isStudentRootRoute(pathname: string): boolean {
  return ROOT_PATHS.has(normalise(pathname));
}

export function isStudentImmersiveRoute(pathname: string): boolean {
  return IMMERSIVE_RE.some((re) => re.test(pathname));
}

export function isStudentClassRoute(pathname: string): boolean {
  return !isStudentImmersiveRoute(pathname) && CLASS_SECTION_RE.test(pathname);
}

export function getStudentChromeState(pathname: string): StudentChromeState {
  if (isStudentImmersiveRoute(pathname)) return "immersive";
  if (isStudentClassRoute(pathname)) return "class";
  if (isStudentRootRoute(pathname)) return "root";
  return "other";
}

/** The mobile tab bar only ever shows on root-level student pages. */
export function showsMobileTabBar(pathname: string): boolean {
  return getStudentChromeState(pathname) === "root";
}

/**
 * Logical parent route for a student class/immersive path. Used by the mobile
 * back button so a direct-opened URL still returns somewhere sensible instead
 * of relying on browser history.
 */
export function studentParentRoute(pathname: string): string {
  const p = normalise(pathname);
  const classMatch = p.match(/^\/dashboard\/classes\/([^/]+)/);
  if (!classMatch) return "/dashboard";
  const base = `/dashboard/classes/${classMatch[1]}`;
  if (p === base) return "/dashboard/classes";
  if (/\/quizzes\/[^/]+\/(attempt|results)\//.test(p)) return `${base}/quizzes`;
  if (/\/flashcards\/[^/]+\/study$/.test(p)) return `${base}/flashcards`;
  return base;
}

/**
 * Root-level student pages that own their own mobile header.
 *
 * Timetable and Inbox drop the global streak pill + notification bell on mobile:
 * streak already lives on Home and the Inbox *is* the notification destination.
 * Desktop keeps the global chrome untouched.
 */
const MOBILE_BARE_HEADER = new Set<string>(["/timetable", "/inbox"]);

export function hidesMobileTopChrome(pathname: string): boolean {
  return MOBILE_BARE_HEADER.has(normalise(pathname));
}
