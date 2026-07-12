import { useTenant, type TenantFeatureFlags } from "@/contexts/TenantContext";

/** Named flags known to the app. Extend as more surfaces adopt gating. */
export type FeatureFlag = keyof TenantFeatureFlags;

/**
 * useFeatureEnabled - single source of truth for feature-flag gating.
 *
 * A flag is considered enabled when it is `true` in the tenant's
 * feature_flags. Missing values default to `true` (backwards-compatible) except
 * for flags that must be explicitly turned on by an admin (`googleDrive`,
 * `oneDrive`), which stay off by default.
 */
export function useFeatureEnabled(flag: FeatureFlag): boolean {
  const { featureFlags } = useTenant();
  const value = featureFlags?.[flag];
  if (typeof value === "boolean") return value;
  // Sensible defaults for unset flags.
  const defaultOn = new Set<FeatureFlag>([
    "gamification",
    "quizXP",
    "leaderboards",
    "flashcards",
    "videoReplays",
    "progressRings",
    "studentInbox",
    "attendance",
  ]);
  return defaultOn.has(flag);
}
