/**
 * Mock tenant configuration for the superadmin Tenant Configuration preview.
 * Isolated static JSON — never used by production routes.
 */

export type TenantStatus = "active" | "pending" | "suspended" | "archived";
export type DomainStatus = "pending" | "active" | "disabled";

export interface MockThemeConfig {
  logoUrl: string;
  faviconUrl: string;
  primary: string;
  primaryHover: string;
  primaryForeground: string;
  accent: string;
  midnight: string;
  surface: string;
  loginHeroTitle: string;
  loginSubtitle: string;
  dashboardTitle: string;
  dashboardWelcome: string;
  supportContact: string;
}

export interface MockFeatureFlags {
  flashcards: boolean;
  videoReplays: boolean;
  progressRings: boolean;
  studentInbox: boolean;
  attendance: boolean;
  gamification: boolean;
  quizXP: boolean;
  leaderboards: boolean;
  streaks: boolean;
  levels: boolean;
  googleDrive: boolean;
  oneDrive: boolean;
  videoEmbeds: boolean;
  centreAnalytics: boolean;
  tutorAnalytics: boolean;
  bulkEnrollment: boolean;
  quizBuilder: boolean;
}

export interface MockTenantConfig {
  id: string;
  name: string;
  displayName: string;
  internalCode: string;
  contactEmail: string;
  contactPhone: string;
  status: TenantStatus;
  subscriptionTier: string;
  onboardingStatus: "not-started" | "in-progress" | "complete";
  operatorNotes: string;
  createdAt: string;
  lastActivityAt: string;
  metrics: {
    activeStudents: number;
    tutors: number;
    classes: number;
  };
  domain: {
    subdomainSlug: string;
    canonicalHost: string;
    status: DomainStatus;
    sslStatus: "issued" | "pending" | "failed";
    dnsStatus: "connected" | "pending" | "misconfigured";
    lastVerifiedAt: string;
  };
  theme: MockThemeConfig;
  features: MockFeatureFlags;
}

export const ARASA_DEFAULT_THEME: MockThemeConfig = {
  logoUrl: "",
  faviconUrl: "",
  primary: "#0052FF",
  primaryHover: "#0040cc",
  primaryForeground: "#FFFFFF",
  accent: "#00D1FF",
  midnight: "#0F172A",
  surface: "#FFFFFF",
  loginHeroTitle: "Welcome back",
  loginSubtitle: "Sign in to continue",
  dashboardTitle: "Your Learning Hub",
  dashboardWelcome: "Ready to keep the streak alive?",
  supportContact: "support@arasaplus.info",
};

export const MOCK_TENANT: MockTenantConfig = {
  id: "sri-sarjana",
  name: "Sri Sarjana Tuition Centre",
  displayName: "Sri Sarjana",
  internalCode: "SRI-SARJANA-01",
  contactEmail: "admin@srisarjana.example",
  contactPhone: "+60 12-345 6789",
  status: "active",
  subscriptionTier: "Growth",
  onboardingStatus: "complete",
  operatorNotes:
    "Priority partner. Uses gamification heavily; keep leaderboards enabled.",
  createdAt: "2025-08-14",
  lastActivityAt: "2026-07-11",
  metrics: { activeStudents: 214, tutors: 12, classes: 34 },
  domain: {
    subdomainSlug: "srisarjana",
    canonicalHost: "srisarjana.arasaplus.info",
    status: "active",
    sslStatus: "issued",
    dnsStatus: "connected",
    lastVerifiedAt: "2026-07-10",
  },
  theme: {
    logoUrl: "",
    faviconUrl: "",
    primary: "#1E3A8A",
    primaryHover: "#1e40af",
    primaryForeground: "#FFFFFF",
    accent: "#F59E0B",
    midnight: "#0F172A",
    surface: "#FFFFFF",
    loginHeroTitle: "Welcome to Sri Sarjana",
    loginSubtitle: "Sign in to your learning workspace",
    dashboardTitle: "Sri Sarjana Learning Hub",
    dashboardWelcome: "Let's make today count.",
    supportContact: "help@srisarjana.example",
  },
  features: {
    flashcards: true,
    videoReplays: true,
    progressRings: true,
    studentInbox: true,
    attendance: true,
    gamification: true,
    quizXP: true,
    leaderboards: true,
    streaks: true,
    levels: true,
    googleDrive: false,
    oneDrive: false,
    videoEmbeds: true,
    centreAnalytics: true,
    tutorAnalytics: true,
    bulkEnrollment: true,
    quizBuilder: true,
  },
};

export const RESERVED_SLUGS = [
  "www",
  "admin",
  "api",
  "auth",
  "dashboard",
  "support",
  "superadmin",
  "arasaplus",
];

export function validateSlug(slug: string): string | null {
  if (!slug) return "Subdomain is required";
  if (slug !== slug.toLowerCase()) return "Must be lowercase";
  if (/\s/.test(slug)) return "No spaces allowed";
  if (/^https?:\/\//.test(slug) || slug.includes("/"))
    return "Enter only the slug, not a full URL";
  if (!/^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])?$/.test(slug))
    return "Letters, numbers, and hyphens only (no leading/trailing hyphen)";
  if (RESERVED_SLUGS.includes(slug)) return "This slug is reserved";
  return null;
}
