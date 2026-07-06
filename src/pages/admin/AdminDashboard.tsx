import { useEffect, useState } from "react";
import {
  Users,
  BookOpen,
  Video,
  TrendingUp,
  UserPlus,
  Building2,
  Calendar,
  Sparkles,
  Activity,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { InviteUserModal } from "@/components/admin/InviteUserModal";
import { TenantSwitcher } from "@/components/tenant/TenantSwitcher";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface CenterStats {
  centerId: string;
  centerName: string;
  users: number;
  classes: number;
  videos: number;
  enrollments: number;
}

interface ActivityRow {
  id: string;
  action: string;
  table_name: string;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function countScoped(
  table: "profiles" | "classes" | "video_resources",
  centerId: string | null,
): Promise<number> {
  const base = supabase.from(table as any).select("id", { count: "exact", head: true });
  const q = centerId ? base.eq("center_id", centerId) : base;
  const { count } = await q;
  return count ?? 0;
}

async function countEnrollments(centerId: string | null): Promise<number> {
  if (!centerId) {
    const { count } = await supabase
      .from("enrollments")
      .select("id", { count: "exact", head: true });
    return count ?? 0;
  }
  // Scope enrollments via their class' center_id.
  const { data: cls } = await supabase
    .from("classes")
    .select("id")
    .eq("center_id", centerId);
  const ids = (cls ?? []).map((c) => c.id);
  if (ids.length === 0) return 0;
  const { count } = await supabase
    .from("enrollments")
    .select("id", { count: "exact", head: true })
    .in("class_id", ids);
  return count ?? 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard
// ─────────────────────────────────────────────────────────────────────────────

export function AdminDashboard() {
  const { profile } = useAuth();
  const { isSuperAdmin, availableCenters, center } = useTenant();
  const [inviteOpen, setInviteOpen] = useState(false);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl md:text-3xl font-bold text-foreground truncate">
              {isSuperAdmin ? "Super Admin" : "Admin"} Dashboard
            </h1>
            <Badge
              variant="secondary"
              className="rounded-full text-xs gap-1"
            >
              {isSuperAdmin ? (
                <>
                  <ShieldCheck className="w-3 h-3" /> Cross-tenant
                </>
              ) : (
                <>
                  <Building2 className="w-3 h-3" />{" "}
                  {center?.name ?? "Your centre"}
                </>
              )}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            {isSuperAdmin
              ? `Welcome back, ${profile?.full_name?.split(" ")[0] ?? "Super Admin"} — you are viewing all tenants.`
              : `Welcome back, ${profile?.full_name?.split(" ")[0] ?? "Admin"} — this is your centre overview.`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isSuperAdmin && <TenantSwitcher />}
          <Button
            onClick={() => setInviteOpen(true)}
            className="rounded-full bg-[#0052FF] hover:bg-[#0047DB] text-white h-11 px-5 shadow-[0_8px_30px_rgb(0,82,255,0.25)]"
          >
            <UserPlus className="w-4 h-4 mr-2" /> Invite user
          </Button>
        </div>
      </div>

      <InviteUserModal open={inviteOpen} onClose={() => setInviteOpen(false)} />

      {isSuperAdmin ? (
        <SuperAdminView centers={availableCenters} />
      ) : (
        <CenterAdminView centerId={center?.id ?? null} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Center Admin view
// ─────────────────────────────────────────────────────────────────────────────

function CenterAdminView({ centerId }: { centerId: string | null }) {
  const [stats, setStats] = useState<CenterStats | null>(null);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const [users, classes, videos, enrollments, activityRes] =
          await Promise.all([
            countScoped("profiles", centerId),
            countScoped("classes", centerId),
            countScoped("video_resources", centerId),
            countEnrollments(centerId),
            supabase
              .from("audit_logs")
              .select("id, action, table_name, created_at")
              .order("created_at", { ascending: false })
              .limit(6),
          ]);

        if (cancelled) return;
        setStats({
          centerId: centerId ?? "unknown",
          centerName: "Your centre",
          users,
          classes,
          videos,
          enrollments,
        });
        setActivity((activityRes.data ?? []) as ActivityRow[]);
      } catch (e) {
        console.error("CenterAdminView load failed:", e);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [centerId]);

  if (!centerId) {
    return (
      <Card className="p-8 text-center bg-card border-border rounded-3xl">
        <Building2 className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
        <h3 className="font-semibold text-foreground mb-1">
          No centre assigned
        </h3>
        <p className="text-sm text-muted-foreground">
          Ask a super admin to link your account to a centre.
        </p>
      </Card>
    );
  }

  return (
    <>
      <StatGrid
        loading={isLoading}
        items={[
          { label: "Users", value: stats?.users ?? 0, icon: Users },
          { label: "Classes", value: stats?.classes ?? 0, icon: Video },
          { label: "Videos", value: stats?.videos ?? 0, icon: BookOpen },
          {
            label: "Enrollments",
            value: stats?.enrollments ?? 0,
            icon: TrendingUp,
          },
        ]}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-5 bg-card border-border rounded-3xl">
          <h2 className="text-lg font-semibold text-foreground mb-4">
            Quick actions
          </h2>
          <div className="space-y-2">
            <QuickAction to="/admin/users" icon={Users} label="Manage users" />
            <QuickAction
              to="/admin/schedule"
              icon={Calendar}
              label="Schedule classes"
            />
            <QuickAction to="/admin/videos" icon={Video} label="Video CMS" />
            <QuickAction
              to="/admin/notes"
              icon={BookOpen}
              label="Notes library"
            />
            <QuickAction
              to="/admin/analytics"
              icon={TrendingUp}
              label="Analytics"
            />
          </div>
        </Card>

        <RecentActivityCard rows={activity} loading={isLoading} />
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Super Admin view
// ─────────────────────────────────────────────────────────────────────────────

function SuperAdminView({
  centers,
}: {
  centers: { id: string; name: string; logoUrl: string | null }[];
}) {
  const [health, setHealth] = useState<CenterStats[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const perCenter = await Promise.all(
          centers.map(async (c) => {
            const [users, classes, videos, enrollments] = await Promise.all([
              countScoped("profiles", c.id),
              countScoped("classes", c.id),
              countScoped("video_resources", c.id),
              countEnrollments(c.id),
            ]);
            return {
              centerId: c.id,
              centerName: c.name,
              users,
              classes,
              videos,
              enrollments,
            } as CenterStats;
          }),
        );
        const activityRes = await supabase
          .from("audit_logs")
          .select("id, action, table_name, created_at")
          .order("created_at", { ascending: false })
          .limit(8);
        if (cancelled) return;
        setHealth(perCenter);
        setActivity((activityRes.data ?? []) as ActivityRow[]);
      } catch (e) {
        console.error("SuperAdminView load failed:", e);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [centers]);

  const totals = health.reduce(
    (acc, c) => ({
      users: acc.users + c.users,
      classes: acc.classes + c.classes,
      videos: acc.videos + c.videos,
      enrollments: acc.enrollments + c.enrollments,
    }),
    { users: 0, classes: 0, videos: 0, enrollments: 0 },
  );

  return (
    <>
      <StatGrid
        loading={isLoading}
        items={[
          { label: "Centres", value: centers.length, icon: Building2 },
          { label: "Users", value: totals.users, icon: Users },
          { label: "Classes", value: totals.classes, icon: Video },
          {
            label: "Enrollments",
            value: totals.enrollments,
            icon: TrendingUp,
          },
        ]}
      />

      {/* Tenant health cards */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            Tenant health
          </h2>
          <span className="text-xs text-muted-foreground">
            {centers.length} centre{centers.length === 1 ? "" : "s"}
          </span>
        </div>
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton className="h-32 rounded-3xl" />
            <Skeleton className="h-32 rounded-3xl" />
          </div>
        ) : centers.length === 0 ? (
          <Card className="p-8 text-center bg-card border-border rounded-3xl">
            <Sparkles className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
            <h3 className="font-semibold text-foreground mb-1">
              No tenants yet
            </h3>
            <p className="text-sm text-muted-foreground">
              Create your first tuition centre from the switcher above.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {health.map((c) => (
              <Card
                key={c.centerId}
                className="p-5 bg-card border-border rounded-3xl hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-shadow"
              >
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-foreground truncate">
                      {c.centerName}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Tenant ID: {c.centerId.slice(0, 8)}…
                    </p>
                  </div>
                  <Badge
                    variant="secondary"
                    className="rounded-full text-[10px] gap-1"
                  >
                    <Activity className="w-3 h-3" />
                    {c.users + c.classes + c.enrollments > 0
                      ? "Active"
                      : "Idle"}
                  </Badge>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <MiniStat label="Users" value={c.users} />
                  <MiniStat label="Classes" value={c.classes} />
                  <MiniStat label="Videos" value={c.videos} />
                  <MiniStat label="Enrols" value={c.enrollments} />
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-5 bg-card border-border rounded-3xl">
          <h2 className="text-lg font-semibold text-foreground mb-4">
            Configure tenants
          </h2>
          <div className="space-y-2">
            <QuickAction to="/admin/users" icon={Users} label="Manage users" />
            <QuickAction
              to="/admin/content"
              icon={BookOpen}
              label="Content CMS"
            />
            <QuickAction
              to="/admin/schedule"
              icon={Calendar}
              label="Schedule"
            />
            <QuickAction
              to="/admin/analytics"
              icon={TrendingUp}
              label="Cross-tenant analytics"
            />
            <QuickAction
              to="/admin/settings"
              icon={ShieldCheck}
              label="Platform settings"
            />
          </div>
        </Card>

        <RecentActivityCard rows={activity} loading={isLoading} />
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared UI
// ─────────────────────────────────────────────────────────────────────────────

function StatGrid({
  items,
  loading,
}: {
  items: { label: string; value: number; icon: any }[];
  loading: boolean;
}) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {items.map((it) => (
        <Card
          key={it.label}
          className="p-4 md:p-5 bg-card border-border rounded-3xl"
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-accent/10 flex items-center justify-center shrink-0">
              <it.icon className="w-5 h-5 text-accent" />
            </div>
            <div className="min-w-0">
              {loading ? (
                <Skeleton className="h-7 w-14" />
              ) : (
                <p className="text-xl md:text-2xl font-bold text-foreground">
                  {it.value.toLocaleString()}
                </p>
              )}
              <p className="text-xs md:text-sm text-muted-foreground truncate">
                {it.label}
              </p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-secondary/60 py-2">
      <p className="text-sm font-bold text-foreground">
        {value.toLocaleString()}
      </p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

function QuickAction({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: any;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 p-3 rounded-2xl bg-muted hover:bg-accent/10 transition-colors text-foreground group"
    >
      <div className="w-9 h-9 rounded-xl bg-card border border-border flex items-center justify-center">
        <Icon className="w-4 h-4 text-accent" />
      </div>
      <span className="font-medium text-sm flex-1">{label}</span>
      <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
    </Link>
  );
}

function RecentActivityCard({
  rows,
  loading,
}: {
  rows: ActivityRow[];
  loading: boolean;
}) {
  return (
    <Card className="p-5 bg-card border-border rounded-3xl">
      <h2 className="text-lg font-semibold text-foreground mb-4">
        Recent activity
      </h2>
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-8 rounded-xl" />
          <Skeleton className="h-8 rounded-xl" />
          <Skeleton className="h-8 rounded-xl" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No activity recorded yet. Actions across the platform will appear
          here.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-3 text-sm p-2 rounded-xl hover:bg-muted/60 transition-colors"
            >
              <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                <Activity className="w-4 h-4 text-accent" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground truncate capitalize">
                  {r.action.toLowerCase()} · {r.table_name.replace(/_/g, " ")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(r.created_at), {
                    addSuffix: true,
                  })}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
