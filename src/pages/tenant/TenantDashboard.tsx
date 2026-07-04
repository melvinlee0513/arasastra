import { useQuery } from "@tanstack/react-query";
import { Activity, BookOpen, FileClock } from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import { DataBoundaryGate } from "@/components/tenant/DataBoundaryGate";
import { TenantSwitcher } from "@/components/tenant/TenantSwitcher";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

function MetricCard({
  label,
  value,
  Icon,
  hint,
}: {
  label: string;
  value: string | number;
  Icon: typeof Activity;
  hint?: string;
}) {
  return (
    <Card className="rounded-2xl border-slate-200 bg-white shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 p-6 pb-2">
        <CardTitle className="text-sm font-medium text-slate-600">{label}</CardTitle>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0052FF]/10">
          <Icon className="h-5 w-5 text-[#0052FF]" />
        </div>
      </CardHeader>
      <CardContent className="p-6 pt-2">
        <div className="text-3xl font-semibold text-[#0F172A]">{value}</div>
        {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function TenantMetrics({ tenantId }: { tenantId: string }) {
  // NOTE: once `center_id` lands, wrap each query with `withTenantFilter(..., tenantId)`.
  void tenantId;

  const { data: enrollments } = useQuery({
    queryKey: ["tenant", tenantId, "active-enrollments"],
    queryFn: async () => {
      const { count } = await supabase
        .from("enrollments")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true);
      return count ?? 0;
    },
  });

  const { data: pendingMaterials } = useQuery({
    queryKey: ["tenant", tenantId, "pending-materials"],
    queryFn: async () => {
      const { count } = await supabase
        .from("video_resources")
        .select("id", { count: "exact", head: true })
        .eq("is_published", false);
      return count ?? 0;
    },
  });

  const { data: recentActivity } = useQuery({
    queryKey: ["tenant", tenantId, "recent-activity"],
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from("analytics_events")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since);
      return count ?? 0;
    },
  });

  return (
    <div className="grid gap-6 md:grid-cols-3">
      <MetricCard
        label="Active Enrollments"
        value={enrollments ?? "—"}
        Icon={BookOpen}
        hint="Students with an active class link"
      />
      <MetricCard
        label="Pending Materials"
        value={pendingMaterials ?? "—"}
        Icon={FileClock}
        hint="Uploads awaiting publish"
      />
      <MetricCard
        label="Recent Activity"
        value={recentActivity ?? "—"}
        Icon={Activity}
        hint="Events in the last 7 days"
      />
    </div>
  );
}

export function TenantDashboard() {
  const { center } = useTenant();
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white/80 p-6 backdrop-blur-md md:p-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            {center && (
              <img
                src={center.logoUrl}
                alt={`${center.name} logo`}
                className="h-12 w-12 rounded-2xl object-cover shadow-sm"
              />
            )}
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Tuition Centre
              </p>
              <h1 className="text-2xl font-semibold text-[#0F172A]">
                {center?.name ?? "—"}
              </h1>
            </div>
          </div>
          <TenantSwitcher />
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-8 p-6 md:p-8">
        <section>
          <h2 className="text-lg font-medium text-[#0F172A]">
            Welcome back{user?.email ? `, ${user.email.split("@")[0]}` : ""}.
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Here is what is happening at {center?.name ?? "your centre"} today.
          </p>
        </section>

        <DataBoundaryGate>
          {({ currentTenantId }) => <TenantMetrics tenantId={currentTenantId} />}
        </DataBoundaryGate>
      </main>
    </div>
  );
}

export default TenantDashboard;
