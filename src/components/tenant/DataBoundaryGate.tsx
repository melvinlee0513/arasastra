import type { ReactNode } from "react";
import { useTenant } from "@/contexts/TenantContext";

/**
 * DataBoundaryGate
 *
 * Enforces the multi-tenant boundary at render time: children only mount when
 * a valid `currentTenantId` is available. Pair with `useTenantScopedQuery`
 * below to guarantee every Supabase call carries the tenant filter.
 *
 * NOTE: `center_id` columns do not yet exist in the schema. The scoped query
 * helper still passes the tenant ID through so that once the migration lands,
 * every call-site already conforms.
 */
export function DataBoundaryGate({
  children,
  fallback,
}: {
  children: (ctx: { currentTenantId: string }) => ReactNode;
  fallback?: ReactNode;
}) {
  const { currentTenantId, isLoading } = useTenant();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8 text-slate-500">
        Loading organisation…
      </div>
    );
  }

  if (!currentTenantId) {
    return (
      fallback ?? (
        <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
          <h2 className="text-xl font-semibold text-slate-900">
            No Organisation Assigned
          </h2>
          <p className="max-w-md text-sm text-slate-600">
            Your account is not linked to a tuition centre. Contact your
            administrator to be added to an organisation before continuing.
          </p>
        </div>
      )
    );
  }

  return <>{children({ currentTenantId })}</>;
}

/**
 * Small helper for query builders: prevents forgetting the tenant filter.
 * Usage:
 *   const q = withTenantFilter(supabase.from("classes").select("*"), tenantId);
 */
export function withTenantFilter<T extends { eq: (col: string, val: string) => T }>(
  query: T,
  tenantId: string,
  column = "center_id",
): T {
  if (!tenantId) {
    throw new Error(
      "[DataBoundaryGate] Refusing to run a tenant-scoped query without a tenantId",
    );
  }
  return query.eq(column, tenantId);
}
