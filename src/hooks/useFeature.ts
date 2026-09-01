import { useTenant, type TenantFeatureFlags } from "@/contexts/TenantContext";

/** Named flags known to the app. Extend as more surfaces adopt gating. */
export type FeatureFlag = keyof TenantFeatureFlags;

/**
 * useFeatureEnabled - single source of truth for feature-flag gating.
 *
 * A flag is considered enabled when it is `true` in the tenant's
 * feature_flags. Missing values default to `true` (backwards-compatible) except
 * for flags that must be explicitly turned on by an admin (`googleDrive`,
 * `oneDrive`) or that gate the Phase 1-5 quiz work (`liveQuizMultiplayer`,
 * `quizAnalytics`, `questionBank`, `expandedQuestionTypes`), which stay off by
 * default.
 *
 * The off-by-default here is mirrored server-side: `tenant_feature_enabled` is
 * called with `_default => false` for the same three backend-enforced flags, so
 * an unset flag is off in both places and neither can drift ahead of the other.
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
