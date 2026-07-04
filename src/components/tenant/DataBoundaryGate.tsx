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
 * withTenantFilter — the single helper for enforcing multi-tenant scope.
 *
 * SELECT / UPDATE / DELETE builders (they expose `.eq`):
 *   const q = withTenantFilter(supabase.from("classes").select("*"), tenantId);
 *   await withTenantFilter(supabase.from("classes").update({...}), tenantId);
 *
 * INSERT payloads (plain object or array of objects):
 *   const row  = withTenantFilter({ title: "..." }, tenantId);
 *   const rows = withTenantFilter([{ title: "a" }, { title: "b" }], tenantId);
 *   await supabase.from("classes").insert(row);
 *
 * The same call-site pattern therefore covers both reads and writes, so no
 * additional helper is required.
 */
type EqBuilder = { eq: (col: string, val: string) => EqBuilder };

export function withTenantFilter<T extends EqBuilder>(
  target: T,
  tenantId: string | null | undefined,
  column?: string,
): T;
export function withTenantFilter<T extends Record<string, unknown>>(
  target: T,
  tenantId: string | null | undefined,
  column?: string,
): T & Record<string, string>;
export function withTenantFilter<T extends Record<string, unknown>>(
  target: T[],
  tenantId: string | null | undefined,
  column?: string,
): Array<T & Record<string, string>>;
export function withTenantFilter(
  target: unknown,
  tenantId: string | null | undefined,
  column = "center_id",
): unknown {
  if (!tenantId) {
    throw new Error(
      "[withTenantFilter] Refusing to run a tenant-scoped operation without a tenantId",
    );
  }

  // Query builder path (SELECT / UPDATE / DELETE): has an `.eq` method.
  if (
    target &&
    typeof target === "object" &&
    typeof (target as EqBuilder).eq === "function"
  ) {
    return (target as EqBuilder).eq(column, tenantId);
  }

  // INSERT payload — array of rows.
  if (Array.isArray(target)) {
    return target.map((row) => ({ ...row, [column]: tenantId }));
  }

  // INSERT / UPDATE payload — single row object.
  if (target && typeof target === "object") {
    return { ...(target as Record<string, unknown>), [column]: tenantId };
  }

  throw new Error(
    "[withTenantFilter] Unsupported target — expected a Supabase query builder or a payload object/array",
  );
}
