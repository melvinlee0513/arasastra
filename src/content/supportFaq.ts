/**
 * Help & Support content: quick-help topics, contact categories and FAQ copy.
 *
 * Single source of truth — the Support page renders from this module so copy
 * changes never require touching JSX.
 */

/** Canonical Contact Support categories. Values are stored on the ticket. */
export const SUPPORT_CATEGORIES = [
  "Account / Login",
  "Password",
  "Classes / Enrolment",
  "Learning Materials",
  "Timetable",
  "Technical Issue",
  "Privacy / Data",
  "Other",
] as const;

export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

export function isSupportCategory(value: string): value is SupportCategory {
  return (SUPPORT_CATEGORIES as readonly string[]).includes(value);
}

/** Attachment rules shared by the client form and the server function. */
export const SUPPORT_ATTACHMENT = {
  maxBytes: 10 * 1024 * 1024,
  mimeTypes: ["image/png", "image/jpeg", "image/webp", "application/pdf"] as const,
  accept: ".png,.jpg,.jpeg,.webp,.pdf",
  humanRule: "PNG, JPEG, WebP or PDF under 10 MB",
};

export interface QuickHelpTopic {
  id: string;
  title: string;
  description: string;
  /** Category pre-selected in the Contact Support form. */
  category: SupportCategory;
  /** FAQ tag used to filter the FAQ list. */
  tag: string;
  /** Registry key in HELP_SUPPORT_ART. */
  art: "login" | "password" | "classes" | "materials" | "timetable" | "technical";
}

export const QUICK_HELP_TOPICS: QuickHelpTopic[] = [
  {
    id: "login-account",
    title: "Login & Account",
    description: "Issues with login or account access",
    category: "Account / Login",
    tag: "login",
    art: "login",
  },
  {
    id: "password-reset",
    title: "Password Reset",
    description: "Reset or update your password",
    category: "Password",
    tag: "password",
    art: "password",
  },
  {
    id: "classes-enrolment",
    title: "Classes & Enrolment",
    description: "Class access and enrolment help",
    category: "Classes / Enrolment",
    tag: "classes",
    art: "classes",
  },
  {
    id: "learning-materials",
    title: "Learning Materials",
    description: "Access notes, videos and resources",
    category: "Learning Materials",
    tag: "materials",
    art: "materials",
  },
  {
    id: "timetable",
    title: "Timetable",
    description: "View or manage your schedule",
    category: "Timetable",
    tag: "timetable",
    art: "timetable",
  },
  {
    id: "technical-issues",
    title: "Technical Issues",
    description: "Report bugs or technical problems",
    category: "Technical Issue",
    tag: "technical",
    art: "technical",
  },
];

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  /** Matches QuickHelpTopic.tag so quick help can filter the FAQ. */
  tag: string;
  keywords?: string[];
}

export const SUPPORT_FAQ: FaqItem[] = [
  {
    id: "reset-password",
    question: "How do I reset my password?",
    answer:
      "On the sign-in page, choose “Forgot password”. We email you a secure reset link — open it and set a new password. The link works once and expires, so request a fresh one if it has been sitting in your inbox.",
    tag: "password",
    keywords: ["forgot", "password", "reset", "sign in"],
  },
  {
    id: "cannot-see-class",
    question: "Why can't I see my class?",
    answer:
      "Classes appear once your tuition centre enrols you. If a class is missing, your centre may not have added you yet, or the class may not be published. Ask your centre to check your enrolment, then reload Study.",
    tag: "classes",
    keywords: ["class", "missing", "enrolment", "enrol", "study"],
  },
  {
    id: "access-materials",
    question: "How do I access my class materials?",
    answer:
      "Open Study, choose your class, then open Materials. Notes, replays, worksheets, links and flashcards are grouped there. Only published materials for classes you are enrolled in are visible.",
    tag: "materials",
    keywords: ["notes", "replay", "video", "worksheet", "materials"],
  },
  {
    id: "profile-picture",
    question: "How do I change my profile picture?",
    answer:
      "Go to Profile, tap Edit profile, then choose a new picture. You can also update your display name and About me there. Your picture is private to your centre.",
    tag: "login",
    keywords: ["avatar", "picture", "photo", "profile", "display name"],
  },
  {
    id: "timetable-empty",
    question: "Why is my timetable empty?",
    answer:
      "Your timetable is built from the classes you are enrolled in and their schedules. If it is empty, you may have no upcoming sessions yet, or your centre has not scheduled the next session.",
    tag: "timetable",
    keywords: ["timetable", "schedule", "empty", "next class"],
  },
  {
    id: "login-email-not-recognised",
    question: "My email isn't recognised when I sign in",
    answer:
      "Accounts are created by your tuition centre, so sign in with the exact email your centre used for your invitation. If it still fails, ask your centre to confirm the email on your account.",
    tag: "login",
    keywords: ["email", "invite", "invitation", "account", "login"],
  },
  {
    id: "enrolment-request",
    question: "How do I join another class?",
    answer:
      "Enrolment is managed by your tuition centre. Ask your centre to add you to the class — it appears in Study as soon as they do.",
    tag: "classes",
    keywords: ["join", "add class", "enrolment"],
  },
  {
    id: "technical-blank-screen",
    question: "The app looks broken or a page won't load",
    answer:
      "Reload the page first. If the problem continues, close and reopen the app, then check your connection. If it persists, send us a support request with a screenshot and the page you were on.",
    tag: "technical",
    keywords: ["bug", "broken", "blank", "error", "slow", "crash"],
  },
];

/** Case-insensitive local search across FAQ questions, answers and keywords. */
export function searchFaq(items: FaqItem[], query: string): FaqItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) =>
    [item.question, item.answer, item.tag, ...(item.keywords ?? [])]
      .join(" ")
      .toLowerCase()
      .includes(q),
  );
}

/** Case-insensitive local search across quick-help topics. */
export function searchQuickHelp(topics: QuickHelpTopic[], query: string): QuickHelpTopic[] {
  const q = query.trim().toLowerCase();
  if (!q) return topics;
  return topics.filter((t) =>
    `${t.title} ${t.description} ${t.category} ${t.tag}`.toLowerCase().includes(q),
  );
}
