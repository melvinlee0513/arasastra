import type { ReactNode } from "react";
import { useFeatureEnabled, type FeatureFlag } from "@/hooks/useFeature";
import { FeatureUnavailable } from "@/pages/FeatureUnavailable";

interface FeatureRouteProps {
  flag: FeatureFlag;
  children: ReactNode;
  /** Optional label surfaced on the fallback screen. */
  label?: string;
}

/**
 * Route-level gate. Renders children only when the tenant has this feature
 * enabled; otherwise shows the friendly FeatureUnavailable page. Because the
 * gate is client-side only, any flag that also represents a commercial
 * entitlement MUST also be enforced server-side (RLS / RPC).
 */
export function FeatureRoute({ flag, children, label }: FeatureRouteProps) {
  const enabled = useFeatureEnabled(flag);
  if (!enabled) return <FeatureUnavailable feature={label ?? String(flag)} />;
  return <>{children}</>;
}
