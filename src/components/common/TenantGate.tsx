import { ReactNode } from "react";
import { AlertCircle, Building2, Loader2 } from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";

/**
 * Wrap any tenant-scoped view. Renders safe fallbacks when the user has no
 * center access, when the tenant is still resolving, or when tenant resolution
 * has failed — never leaking raw database errors to the end user.
 */
export function TenantGate({
  children,
  requireCenter = true,
}: {
  children: ReactNode;
  requireCenter?: boolean;
}) {
  const { isLoading, error, currentTenantId, isSuperAdmin } = useTenant();

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3 rounded-3xl bg-white/70 backdrop-blur-xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-8">
          <Loader2 className="h-6 w-6 animate-spin text-[#00D1FF]" />
          <p className="text-sm text-slate-500">Loading your organisation…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return <TenantMessage title="We couldn't load your organisation" body="Please refresh the page. If the issue persists, contact your center administrator." />;
  }

  if (requireCenter && !currentTenantId && !isSuperAdmin) {
    return (
      <TenantMessage
        title="No center access"
        body="Your account isn't linked to a tuition center yet. Please contact your administrator to complete onboarding."
      />
    );
  }

  return <>{children}</>;
}

function TenantMessage({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center p-6">
      <div className="max-w-md w-full rounded-3xl bg-white/80 backdrop-blur-xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#00D1FF]/10 text-[#00D1FF]">
          <Building2 className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <p className="mt-2 text-sm text-slate-500">{body}</p>
      </div>
    </div>
  );
}

export function TenantEmptyState({
  title = "Nothing here yet",
  body = "No data available for this center.",
}: {
  title?: string;
  body?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <AlertCircle className="h-6 w-6" />
      </div>
      <p className="text-sm font-medium text-slate-900">{title}</p>
      <p className="mt-1 text-xs text-slate-500">{body}</p>
    </div>
  );
}

/** Safe error handler: log dev-only details, return a user-safe message. */
export function toSafeMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.error("[TenantSafe]", err);
  }
  return fallback;
}
