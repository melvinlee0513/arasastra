import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Save,
  RotateCcw,
  Copy,
  ShieldAlert,
  Monitor,
  Tablet as TabletIcon,
  Smartphone,
  Info,
  Check,
  CircleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ARASA_DEFAULT_THEME,
  MOCK_TENANT,
  RESERVED_SLUGS,
  validateSlug,
  type MockTenantConfig,
  type MockFeatureFlags,
  type MockThemeConfig,
  type TenantStatus,
} from "./mockTenantConfig";

/* ------------------------------------------------------------------ */
/*  Utilities                                                          */
/* ------------------------------------------------------------------ */

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function tenantsEqual(a: MockTenantConfig, b: MockTenantConfig): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function withFallback(value: string, fallback: string) {
  return value.trim() ? value : fallback;
}

const STATUS_BADGE: Record<TenantStatus, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-emerald-100 text-emerald-800" },
  pending: { label: "Pending", className: "bg-amber-100 text-amber-800" },
  suspended: { label: "Suspended", className: "bg-rose-100 text-rose-800" },
  archived: { label: "Archived", className: "bg-slate-200 text-slate-700" },
};

/* ------------------------------------------------------------------ */
/*  Feature registry                                                   */
/* ------------------------------------------------------------------ */

interface FeatureDef {
  key: keyof MockFeatureFlags;
  name: string;
  description: string;
  planned?: string;
  requires?: keyof MockFeatureFlags;
  note?: string;
}

const FEATURE_GROUPS: Array<{ title: string; items: FeatureDef[] }> = [
  {
    title: "Learning",
    items: [
      { key: "flashcards", name: "Flashcards", description: "Swipeable study decks." },
      { key: "videoReplays", name: "Video Replays", description: "Recorded class playback." },
      { key: "progressRings", name: "Progress Rings", description: "Per-subject completion rings." },
      { key: "studentInbox", name: "Student Inbox", description: "In-app announcements & DMs." },
      { key: "attendance", name: "Attendance", description: "Live class attendance tracking." },
    ],
  },
  {
    title: "Gamification",
    items: [
      { key: "gamification", name: "Gamification", description: "Master switch for XP-based rewards." },
      { key: "quizXP", name: "Quiz XP", description: "Award XP on quiz completion.", requires: "gamification" },
      { key: "leaderboards", name: "Leaderboards", description: "Tenant leaderboard visibility.", requires: "gamification" },
      { key: "streaks", name: "Streaks", description: "Daily activity streaks.", requires: "gamification" },
      { key: "levels", name: "Levels", description: "Student level progression.", requires: "gamification" },
    ],
  },
  {
    title: "Integrations",
    items: [
      { key: "googleDrive", name: "Google Drive", description: "Attach Drive files to classes.", note: "Requires OAuth credentials" },
      { key: "oneDrive", name: "Microsoft OneDrive", description: "Attach OneDrive files to classes.", note: "Requires OAuth credentials" },
      { key: "videoEmbeds", name: "YouTube / Vimeo embeds", description: "Allow external video embeds." },
    ],
  },
  {
    title: "Administrative",
    items: [
      { key: "centreAnalytics", name: "Centre Analytics", description: "Admin analytics dashboards." },
      { key: "tutorAnalytics", name: "Tutor Analytics", description: "Per-tutor performance views." },
      { key: "bulkEnrollment", name: "Bulk Enrollment", description: "Enrollment Matrix bulk tools." },
      { key: "quizBuilder", name: "Quiz Builder", description: "Tutor quiz authoring." },
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

export default function TenantConfigurationPreview() {
  const { centerId } = useParams();
  const { toast } = useToast();

  const [original, setOriginal] = useState<MockTenantConfig>(() => deepClone(MOCK_TENANT));
  const [draft, setDraft] = useState<MockTenantConfig>(() => deepClone(MOCK_TENANT));
  const [confirmReset, setConfirmReset] = useState(false);
  const [danger, setDanger] = useState<null | "suspend" | "disable-domain" | "archive">(null);
  const [dangerConfirmName, setDangerConfirmName] = useState("");

  const dirty = !tenantsEqual(original, draft);

  const patch = (partial: Partial<MockTenantConfig>) =>
    setDraft((d) => ({ ...d, ...partial }));
  const patchTheme = (partial: Partial<MockThemeConfig>) =>
    setDraft((d) => ({ ...d, theme: { ...d.theme, ...partial } }));
  const patchDomain = (partial: Partial<MockTenantConfig["domain"]>) =>
    setDraft((d) => ({ ...d, domain: { ...d.domain, ...partial } }));
  const patchFeature = (key: keyof MockFeatureFlags, val: boolean) =>
    setDraft((d) => {
      const next: MockFeatureFlags = { ...d.features, [key]: val };
      // Dependency cascade: gamification off => quizXP/leaderboards/streaks/levels off
      if (key === "gamification" && !val) {
        next.quizXP = false;
        next.leaderboards = false;
        next.streaks = false;
        next.levels = false;
      }
      return { ...d, features: next };
    });

  const slugError = validateSlug(draft.domain.subdomainSlug);
  const slugPreviewHost = slugError
    ? draft.domain.canonicalHost
    : `${draft.domain.subdomainSlug}.arasaplus.info`;

  const handleSave = () => {
    if (slugError) {
      toast({
        title: "Fix domain slug before saving",
        description: slugError,
        variant: "destructive",
      });
      return;
    }
    const saved = { ...draft, domain: { ...draft.domain, canonicalHost: slugPreviewHost } };
    setOriginal(deepClone(saved));
    setDraft(deepClone(saved));
    toast({ title: "Tenant configuration saved in preview mode." });
  };

  const handleReset = () => {
    setDraft(deepClone(original));
    setConfirmReset(false);
    toast({ title: "Reverted unsaved changes." });
  };

  const runDangerAction = () => {
    if (!danger) return;
    if (dangerConfirmName.trim() !== draft.name) {
      toast({
        title: "Tenant name did not match",
        description: "Type the tenant name exactly to confirm.",
        variant: "destructive",
      });
      return;
    }
    if (danger === "suspend") {
      patch({ status: "suspended" });
      toast({ title: "Tenant marked as suspended (preview)." });
    } else if (danger === "disable-domain") {
      patchDomain({ status: "disabled" });
      toast({ title: "Tenant domain disabled (preview)." });
    } else if (danger === "archive") {
      patch({ status: "archived" });
      toast({ title: "Tenant archived (preview)." });
    }
    setDanger(null);
    setDangerConfirmName("");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-sky-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-6">
        {/* Header */}
        <Header
          tenant={draft}
          dirty={dirty}
          slugError={!!slugError}
          onSave={handleSave}
          onReset={() => setConfirmReset(true)}
        />

        {/* Preview-mode notice */}
        <div
          role="status"
          aria-live="polite"
          className="rounded-2xl border border-sky-200 bg-sky-50/70 px-4 py-3 text-sm text-sky-900 flex items-start gap-2"
        >
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Superadmin preview — this page uses isolated mock data for tenant{" "}
            <span className="font-mono">{centerId ?? draft.id}</span>. No writes reach Supabase.
          </span>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="w-full flex flex-wrap justify-start gap-1 bg-white/70 backdrop-blur rounded-2xl p-1 h-auto">
            <TabsTrigger value="overview" className="rounded-xl">Overview</TabsTrigger>
            <TabsTrigger value="branding" className="rounded-xl">Branding</TabsTrigger>
            <TabsTrigger value="features" className="rounded-xl">Features</TabsTrigger>
            <TabsTrigger value="domain" className="rounded-xl">Domain</TabsTrigger>
            <TabsTrigger value="preview" className="rounded-xl">Preview</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6">
            <OverviewSection tenant={draft} patch={patch} />
          </TabsContent>
          <TabsContent value="branding" className="mt-6">
            <BrandingSection tenant={draft} patchTheme={patchTheme} />
          </TabsContent>
          <TabsContent value="features" className="mt-6">
            <FeaturesSection features={draft.features} onToggle={patchFeature} />
          </TabsContent>
          <TabsContent value="domain" className="mt-6">
            <DomainSection
              domain={draft.domain}
              patchDomain={patchDomain}
              slugError={slugError}
              previewHost={slugPreviewHost}
            />
          </TabsContent>
          <TabsContent value="preview" className="mt-6">
            <TenantPreviewSection tenant={draft} />
          </TabsContent>
        </Tabs>

        <DangerZone
          onSuspend={() => setDanger("suspend")}
          onDisableDomain={() => setDanger("disable-domain")}
          onArchive={() => setDanger("archive")}
        />
      </div>

      {/* Reset confirmation */}
      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              This will revert every change made in this preview session back to the last
              saved state.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset}>Discard changes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Danger action confirmation */}
      <AlertDialog
        open={danger !== null}
        onOpenChange={(o) => { if (!o) { setDanger(null); setDangerConfirmName(""); } }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {danger === "suspend" && "Suspend tenant?"}
              {danger === "disable-domain" && "Disable tenant domain?"}
              {danger === "archive" && "Archive tenant?"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                {danger === "suspend" && (
                  <p>Blocks tenant users from accessing the LMS. All tenant data is preserved.</p>
                )}
                {danger === "disable-domain" && (
                  <p>Prevents the tenant hostname from resolving. Tenant records stay intact.</p>
                )}
                {danger === "archive" && (
                  <p>Marks the tenant inactive. Historical data is preserved for reporting.</p>
                )}
                <div className="space-y-1">
                  <Label htmlFor="danger-confirm">
                    Type <span className="font-mono">{draft.name}</span> to confirm
                  </Label>
                  <Input
                    id="danger-confirm"
                    value={dangerConfirmName}
                    onChange={(e) => setDangerConfirmName(e.target.value)}
                    className="rounded-xl"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); runDangerAction(); }}
              className="bg-rose-600 hover:bg-rose-700"
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Header                                                             */
/* ------------------------------------------------------------------ */

function Header({
  tenant,
  dirty,
  slugError,
  onSave,
  onReset,
}: {
  tenant: MockTenantConfig;
  dirty: boolean;
  slugError: boolean;
  onSave: () => void;
  onReset: () => void;
}) {
  const badge = STATUS_BADGE[tenant.status];
  return (
    <Card className="rounded-3xl p-5 sm:p-6 bg-white/80 backdrop-blur border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-2">
          <Link
            to="/superadmin/tenants"
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to tenants
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 truncate">
              {tenant.name}
            </h1>
            <Badge className={`${badge.className} rounded-full`}>{badge.label}</Badge>
            {dirty && (
              <Badge
                className="rounded-full bg-amber-100 text-amber-800"
                aria-live="polite"
              >
                Unsaved changes
              </Badge>
            )}
          </div>
          <p className="text-sm text-slate-500 font-mono break-all">
            https://{tenant.domain.canonicalHost}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button
            variant="outline"
            onClick={onReset}
            disabled={!dirty}
            className="rounded-full"
          >
            <RotateCcw className="w-4 h-4 mr-1.5" /> Reset
          </Button>
          <Button
            onClick={onSave}
            disabled={!dirty || slugError}
            className="rounded-full bg-[color:var(--brand-primary,#0052FF)] hover:opacity-90 text-white"
          >
            <Save className="w-4 h-4 mr-1.5" /> Save changes
          </Button>
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Overview                                                           */
/* ------------------------------------------------------------------ */

function OverviewSection({
  tenant,
  patch,
}: {
  tenant: MockTenantConfig;
  patch: (p: Partial<MockTenantConfig>) => void;
}) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <Card className="rounded-3xl p-5 sm:p-6 xl:col-span-2 space-y-4 bg-white/80 backdrop-blur border-white/60">
        <h2 className="text-lg font-semibold text-slate-900">Identity</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Tenant name">
            <Input
              value={tenant.name}
              onChange={(e) => patch({ name: e.target.value })}
              className="rounded-xl"
            />
          </Field>
          <Field label="Display name">
            <Input
              value={tenant.displayName}
              onChange={(e) => patch({ displayName: e.target.value })}
              className="rounded-xl"
            />
          </Field>
          <Field label="Internal tenant code">
            <Input
              value={tenant.internalCode}
              onChange={(e) => patch({ internalCode: e.target.value })}
              className="rounded-xl font-mono"
            />
          </Field>
          <Field label="Subscription tier">
            <Input
              value={tenant.subscriptionTier}
              onChange={(e) => patch({ subscriptionTier: e.target.value })}
              className="rounded-xl"
            />
          </Field>
          <Field label="Contact email">
            <Input
              type="email"
              value={tenant.contactEmail}
              onChange={(e) => patch({ contactEmail: e.target.value })}
              className="rounded-xl"
            />
          </Field>
          <Field label="Contact phone">
            <Input
              value={tenant.contactPhone}
              onChange={(e) => patch({ contactPhone: e.target.value })}
              className="rounded-xl"
            />
          </Field>
          <Field label="Tenant status">
            <Select
              value={tenant.status}
              onValueChange={(v) => patch({ status: v as TenantStatus })}
            >
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Onboarding status">
            <Select
              value={tenant.onboardingStatus}
              onValueChange={(v) =>
                patch({ onboardingStatus: v as MockTenantConfig["onboardingStatus"] })
              }
            >
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="not-started">Not started</SelectItem>
                <SelectItem value="in-progress">In progress</SelectItem>
                <SelectItem value="complete">Complete</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="Notes for Futron Digital operators">
          <Textarea
            value={tenant.operatorNotes}
            onChange={(e) => patch({ operatorNotes: e.target.value })}
            className="rounded-xl min-h-[100px]"
          />
        </Field>
      </Card>

      <Card className="rounded-3xl p-5 sm:p-6 bg-white/80 backdrop-blur border-white/60 space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Tenant summary</h2>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Students" value={tenant.metrics.activeStudents} />
          <Stat label="Tutors" value={tenant.metrics.tutors} />
          <Stat label="Classes" value={tenant.metrics.classes} />
        </div>
        <dl className="text-sm space-y-2 pt-2 border-t border-slate-100">
          <SummaryRow label="Created" value={tenant.createdAt} />
          <SummaryRow label="Last activity" value={tenant.lastActivityAt} />
          <SummaryRow label="Domain status" value={tenant.domain.status} />
        </dl>
        <p className="text-xs text-slate-400">Metrics are mock data for preview.</p>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const id = `f-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm text-slate-700">{label}</Label>
      <div id={id}>{children}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-slate-50 border border-slate-100 p-3 text-center">
      <div className="text-xl font-bold text-slate-900">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-900 capitalize">{value}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Branding                                                           */
/* ------------------------------------------------------------------ */

function BrandingSection({
  tenant,
  patchTheme,
}: {
  tenant: MockTenantConfig;
  patchTheme: (p: Partial<MockThemeConfig>) => void;
}) {
  const t = tenant.theme;
  const resolved = {
    primary: withFallback(t.primary, ARASA_DEFAULT_THEME.primary),
    primaryHover: withFallback(t.primaryHover, ARASA_DEFAULT_THEME.primaryHover),
    primaryForeground: withFallback(t.primaryForeground, ARASA_DEFAULT_THEME.primaryForeground),
    accent: withFallback(t.accent, ARASA_DEFAULT_THEME.accent),
    midnight: withFallback(t.midnight, ARASA_DEFAULT_THEME.midnight),
    surface: withFallback(t.surface, ARASA_DEFAULT_THEME.surface),
  };
  const previewStyle = {
    ["--brand-primary" as any]: resolved.primary,
    ["--brand-primary-hover" as any]: resolved.primaryHover,
    ["--brand-primary-foreground" as any]: resolved.primaryForeground,
    ["--brand-accent" as any]: resolved.accent,
    ["--brand-midnight" as any]: resolved.midnight,
    ["--brand-surface" as any]: resolved.surface,
  };

  const colorFields: Array<{ key: keyof MockThemeConfig; label: string }> = [
    { key: "primary", label: "Primary" },
    { key: "primaryHover", label: "Primary hover" },
    { key: "primaryForeground", label: "Primary foreground" },
    { key: "accent", label: "Accent" },
    { key: "midnight", label: "Midnight / text" },
    { key: "surface", label: "Surface" },
  ];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <Card className="rounded-3xl p-5 sm:p-6 bg-white/80 backdrop-blur border-white/60 space-y-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Branding</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => patchTheme(ARASA_DEFAULT_THEME)}
            className="rounded-full text-xs"
          >
            Reset to Aras A+ defaults
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Logo (upload placeholder)">
            <div className="rounded-xl border-2 border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">
              Drop or select a logo file. Preview only — no upload wired.
            </div>
          </Field>
          <Field label="Favicon (upload placeholder)">
            <div className="rounded-xl border-2 border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">
              Drop or select a 32×32 favicon. Preview only.
            </div>
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {colorFields.map((f) => (
            <ColorField
              key={f.key}
              label={f.label}
              value={(t as any)[f.key] as string}
              fallback={(ARASA_DEFAULT_THEME as any)[f.key] as string}
              onChange={(val) => patchTheme({ [f.key]: val } as Partial<MockThemeConfig>)}
            />
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
          <Field label="Login page title">
            <Input
              value={t.loginHeroTitle}
              onChange={(e) => patchTheme({ loginHeroTitle: e.target.value })}
              className="rounded-xl"
            />
          </Field>
          <Field label="Login page subtitle">
            <Input
              value={t.loginSubtitle}
              onChange={(e) => patchTheme({ loginSubtitle: e.target.value })}
              className="rounded-xl"
            />
          </Field>
          <Field label="Dashboard title">
            <Input
              value={t.dashboardTitle}
              onChange={(e) => patchTheme({ dashboardTitle: e.target.value })}
              className="rounded-xl"
            />
          </Field>
          <Field label="Dashboard welcome text">
            <Input
              value={t.dashboardWelcome}
              onChange={(e) => patchTheme({ dashboardWelcome: e.target.value })}
              className="rounded-xl"
            />
          </Field>
          <Field label="Support contact text">
            <Input
              value={t.supportContact}
              onChange={(e) => patchTheme({ supportContact: e.target.value })}
              className="rounded-xl md:col-span-2"
            />
          </Field>
        </div>
      </Card>

      {/* Live preview */}
      <Card
        className="rounded-3xl p-5 sm:p-6 bg-white/80 backdrop-blur border-white/60 space-y-4"
        style={previewStyle}
      >
        <h2 className="text-lg font-semibold text-slate-900">Live preview</h2>

        {/* Auth mini */}
        <div
          className="rounded-2xl p-4 border border-slate-100"
          style={{ background: resolved.surface }}
        >
          <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">Auth page</div>
          <div className="text-lg font-semibold" style={{ color: resolved.midnight }}>
            {withFallback(t.loginHeroTitle, ARASA_DEFAULT_THEME.loginHeroTitle)}
          </div>
          <div className="text-sm text-slate-500 mb-3">
            {withFallback(t.loginSubtitle, ARASA_DEFAULT_THEME.loginSubtitle)}
          </div>
          <button
            className="rounded-full px-4 py-2 text-sm font-medium"
            style={{
              background: resolved.primary,
              color: resolved.primaryForeground,
            }}
          >
            Sign in
          </button>
        </div>

        {/* Sidebar + dashboard mini */}
        <div className="rounded-2xl border border-slate-100 overflow-hidden">
          <div className="flex">
            <div
              className="w-32 shrink-0 p-3 space-y-2 text-xs"
              style={{ background: resolved.midnight, color: "#fff" }}
            >
              <div className="font-semibold truncate">{tenant.displayName}</div>
              <div
                className="rounded-lg px-2 py-1"
                style={{ background: resolved.primary, color: resolved.primaryForeground }}
              >
                Dashboard
              </div>
              <div className="rounded-lg px-2 py-1 opacity-70">Classes</div>
              <div className="rounded-lg px-2 py-1 opacity-70">Timetable</div>
            </div>
            <div className="flex-1 p-4" style={{ background: resolved.surface }}>
              <div className="text-xs uppercase tracking-wide text-slate-400">
                Dashboard
              </div>
              <div className="text-base font-semibold" style={{ color: resolved.midnight }}>
                {withFallback(t.dashboardTitle, ARASA_DEFAULT_THEME.dashboardTitle)}
              </div>
              <div className="text-xs text-slate-500 mb-3">
                {withFallback(t.dashboardWelcome, ARASA_DEFAULT_THEME.dashboardWelcome)}
              </div>
              <div
                className="rounded-xl p-3 text-xs"
                style={{ background: resolved.accent + "22", color: resolved.midnight }}
              >
                Accent card sample
              </div>
            </div>
          </div>
        </div>
        <p className="text-[11px] text-slate-400">
          Empty branding fields fall back to Aras A+ defaults automatically.
        </p>
      </Card>
    </div>
  );
}

function ColorField({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string;
  value: string;
  fallback: string;
  onChange: (v: string) => void;
}) {
  const resolved = value.trim() || fallback;
  return (
    <div className="space-y-1.5">
      <Label className="text-sm text-slate-700">{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={resolved}
          onChange={(e) => onChange(e.target.value)}
          className="w-11 h-11 rounded-xl border border-slate-200 bg-transparent cursor-pointer"
          aria-label={`${label} colour`}
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={fallback}
          className="rounded-xl font-mono text-sm"
        />
      </div>
      {!value.trim() && (
        <p className="text-[11px] text-slate-400">Falls back to {fallback}</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Features                                                           */
/* ------------------------------------------------------------------ */

function FeaturesSection({
  features,
  onToggle,
}: {
  features: MockFeatureFlags;
  onToggle: (k: keyof MockFeatureFlags, v: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      {FEATURE_GROUPS.map((group) => (
        <Card
          key={group.title}
          className="rounded-3xl p-5 sm:p-6 bg-white/80 backdrop-blur border-white/60"
        >
          <h2 className="text-lg font-semibold text-slate-900 mb-4">{group.title}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {group.items.map((f) => {
              const parentOff = f.requires ? !features[f.requires] : false;
              const enabled = features[f.key];
              const switchId = `feat-${f.key}`;
              return (
                <div
                  key={f.key}
                  className={`rounded-2xl border p-4 flex items-start gap-3 ${
                    parentOff ? "border-slate-100 bg-slate-50/60 opacity-60" : "border-slate-100 bg-white"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Label htmlFor={switchId} className="font-medium text-slate-900">
                        {f.name}
                      </Label>
                      <Badge variant="secondary" className="rounded-full text-[10px] px-2">
                        Included in plan
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{f.description}</p>
                    {f.requires && parentOff && (
                      <p className="mt-1.5 text-xs text-amber-700 flex items-center gap-1">
                        <CircleAlert className="w-3 h-3" /> Requires {f.requires} to be enabled.
                      </p>
                    )}
                    {f.note && (
                      <p className="mt-1.5 text-xs text-sky-700 flex items-center gap-1">
                        <Info className="w-3 h-3" /> {f.note}
                      </p>
                    )}
                  </div>
                  <Switch
                    id={switchId}
                    checked={enabled}
                    disabled={parentOff}
                    onCheckedChange={(v) => onToggle(f.key, v)}
                    aria-label={`Toggle ${f.name}`}
                  />
                </div>
              );
            })}
          </div>
        </Card>
      ))}
      <p className="text-xs text-slate-500 px-1">
        UI-only preview — backend feature enforcement is unchanged.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Domain                                                             */
/* ------------------------------------------------------------------ */

function DomainSection({
  domain,
  patchDomain,
  slugError,
  previewHost,
}: {
  domain: MockTenantConfig["domain"];
  patchDomain: (p: Partial<MockTenantConfig["domain"]>) => void;
  slugError: string | null;
  previewHost: string;
}) {
  const { toast } = useToast();
  const copy = () => {
    navigator.clipboard.writeText(`https://${previewHost}`);
    toast({ title: "URL copied to clipboard" });
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <Card className="rounded-3xl p-5 sm:p-6 bg-white/80 backdrop-blur border-white/60 space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Domain</h2>
        <Field label="Subdomain slug">
          <Input
            value={domain.subdomainSlug}
            onChange={(e) => patchDomain({ subdomainSlug: e.target.value })}
            placeholder="e.g. srisarjana"
            className="rounded-xl font-mono"
            aria-invalid={!!slugError}
            aria-describedby="slug-help"
          />
        </Field>
        <div id="slug-help" className="text-xs space-y-1">
          {slugError ? (
            <p className="text-rose-600 flex items-center gap-1">
              <CircleAlert className="w-3 h-3" /> {slugError}
            </p>
          ) : (
            <p className="text-emerald-700 flex items-center gap-1">
              <Check className="w-3 h-3" /> Valid slug
            </p>
          )}
          <p className="text-slate-500">
            Lowercase letters, numbers, and hyphens. No spaces or full URLs. Reserved:{" "}
            <span className="font-mono">{RESERVED_SLUGS.join(", ")}</span>
          </p>
        </div>

        <div className="rounded-2xl bg-slate-50 border border-slate-100 p-3 flex items-center gap-2">
          <code className="text-sm text-slate-800 truncate flex-1">
            https://{previewHost}
          </code>
          <Button size="sm" variant="outline" onClick={copy} className="rounded-full">
            <Copy className="w-3.5 h-3.5 mr-1" /> Copy
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Domain status">
            <Select
              value={domain.status}
              onValueChange={(v) =>
                patchDomain({ status: v as MockTenantConfig["domain"]["status"] })
              }
            >
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="flex items-end">
            <Button variant="outline" className="rounded-full w-full" disabled>
              Verify domain (placeholder)
            </Button>
          </div>
        </div>

        <div className="rounded-2xl bg-amber-50 border border-amber-100 p-3 text-xs text-amber-900 flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
          Only superadmins may change tenant domain settings.
        </div>
      </Card>

      <Card className="rounded-3xl p-5 sm:p-6 bg-white/80 backdrop-blur border-white/60 space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Domain health</h2>
        <HealthRow label="Canonical host" value={domain.canonicalHost} mono />
        <HealthRow label="SSL" value={domain.sslStatus} />
        <HealthRow label="DNS" value={domain.dnsStatus} />
        <HealthRow label="Last verified" value={domain.lastVerifiedAt} />
        <p className="text-[11px] text-slate-400 pt-2 border-t border-slate-100">
          Unique-domain check runs on save — placeholder in preview.
        </p>
      </Card>
    </div>
  );
}

function HealthRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between items-center gap-3 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={`text-slate-900 capitalize ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tenant Preview simulation                                          */
/* ------------------------------------------------------------------ */

function TenantPreviewSection({ tenant }: { tenant: MockTenantConfig }) {
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [mode, setMode] = useState<"login" | "student" | "sidebar">("student");

  const t = tenant.theme;
  const resolved = {
    primary: withFallback(t.primary, ARASA_DEFAULT_THEME.primary),
    primaryForeground: withFallback(t.primaryForeground, ARASA_DEFAULT_THEME.primaryForeground),
    accent: withFallback(t.accent, ARASA_DEFAULT_THEME.accent),
    midnight: withFallback(t.midnight, ARASA_DEFAULT_THEME.midnight),
    surface: withFallback(t.surface, ARASA_DEFAULT_THEME.surface),
  };

  const frameWidth = useMemo(
    () => (device === "mobile" ? 375 : device === "tablet" ? 768 : 1024),
    [device],
  );

  const f = tenant.features;
  const navItems = [
    { key: "dashboard", label: "Dashboard", show: true },
    { key: "classes", label: "My Classes", show: true },
    { key: "replays", label: "Replays", show: f.videoReplays },
    { key: "flashcards", label: "Flashcards", show: f.flashcards },
    { key: "inbox", label: "Inbox", show: f.studentInbox },
    { key: "leaderboard", label: "Leaderboard", show: f.gamification && f.leaderboards },
  ].filter((n) => n.show);

  return (
    <Card className="rounded-3xl p-5 sm:p-6 bg-white/80 backdrop-blur border-white/60 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Tenant preview</h2>
        <div className="flex flex-wrap gap-2">
          <ModeButton current={mode} value="login" onClick={() => setMode("login")}>Login</ModeButton>
          <ModeButton current={mode} value="student" onClick={() => setMode("student")}>Student</ModeButton>
          <ModeButton current={mode} value="sidebar" onClick={() => setMode("sidebar")}>Admin sidebar</ModeButton>
          <div className="w-px bg-slate-200 mx-1" />
          <DeviceButton current={device} value="desktop" onClick={() => setDevice("desktop")}>
            <Monitor className="w-4 h-4" />
          </DeviceButton>
          <DeviceButton current={device} value="tablet" onClick={() => setDevice("tablet")}>
            <TabletIcon className="w-4 h-4" />
          </DeviceButton>
          <DeviceButton current={device} value="mobile" onClick={() => setDevice("mobile")}>
            <Smartphone className="w-4 h-4" />
          </DeviceButton>
        </div>
      </div>

      <div className="overflow-auto rounded-2xl border border-slate-100 bg-slate-50 p-4">
        <div
          className="mx-auto bg-white rounded-2xl shadow-sm overflow-hidden transition-all"
          style={{ maxWidth: frameWidth, width: "100%" }}
        >
          {mode === "login" && (
            <div
              className="p-6 space-y-3"
              style={{ background: resolved.surface }}
            >
              <div className="text-xs uppercase tracking-wide text-slate-400">
                {tenant.domain.canonicalHost}
              </div>
              <h3 className="text-xl font-bold" style={{ color: resolved.midnight }}>
                {withFallback(t.loginHeroTitle, ARASA_DEFAULT_THEME.loginHeroTitle)}
              </h3>
              <p className="text-sm text-slate-500">
                {withFallback(t.loginSubtitle, ARASA_DEFAULT_THEME.loginSubtitle)}
              </p>
              <div className="space-y-2 pt-2">
                <div className="h-10 rounded-full bg-slate-100" />
                <div className="h-10 rounded-full bg-slate-100" />
                <button
                  className="h-10 rounded-full w-full text-sm font-medium"
                  style={{ background: resolved.primary, color: resolved.primaryForeground }}
                >
                  Sign in
                </button>
              </div>
            </div>
          )}

          {mode === "student" && (
            <div className="flex" style={{ minHeight: 320 }}>
              {device !== "mobile" && (
                <StudentNav
                  items={navItems}
                  primary={resolved.primary}
                  midnight={resolved.midnight}
                  primaryFg={resolved.primaryForeground}
                  displayName={tenant.displayName}
                />
              )}
              <div className="flex-1 p-4 space-y-3" style={{ background: resolved.surface }}>
                <div className="text-xs uppercase tracking-wide text-slate-400">Dashboard</div>
                <h3 className="text-lg font-bold" style={{ color: resolved.midnight }}>
                  {withFallback(t.dashboardTitle, ARASA_DEFAULT_THEME.dashboardTitle)}
                </h3>
                <p className="text-sm text-slate-500">
                  {withFallback(t.dashboardWelcome, ARASA_DEFAULT_THEME.dashboardWelcome)}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {f.gamification && f.levels && (
                    <MiniCard label="Level" value="Lv 7" tone={resolved.accent} />
                  )}
                  {f.gamification && f.streaks && (
                    <MiniCard label="Streak" value="12d" tone={resolved.primary} />
                  )}
                  {f.progressRings && (
                    <MiniCard label="Progress" value="68%" tone={resolved.primary} />
                  )}
                  {f.videoReplays && (
                    <MiniCard label="Replays" value="3 new" tone={resolved.accent} />
                  )}
                  {!f.gamification && !f.progressRings && !f.videoReplays && (
                    <div className="col-span-2 text-xs text-slate-500 rounded-xl p-3 bg-slate-50">
                      No gamification, progress rings, or replays enabled.
                    </div>
                  )}
                </div>
                {device === "mobile" && (
                  <div className="rounded-full bg-slate-100 p-1 flex justify-around text-[10px] text-slate-600 mt-2">
                    {navItems.slice(0, 4).map((n) => (
                      <span key={n.key} className="px-2 py-1">{n.label}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {mode === "sidebar" && (
            <div className="flex" style={{ minHeight: 320 }}>
              <div
                className="w-40 shrink-0 p-3 space-y-2 text-xs"
                style={{ background: resolved.midnight, color: "#fff" }}
              >
                <div className="font-semibold truncate">{tenant.displayName}</div>
                <div className="opacity-60 uppercase text-[10px] mt-3">Admin</div>
                {["Overview", "Users", "Curriculum", "Schedule", "Payments"].map((l, i) => (
                  <div
                    key={l}
                    className="rounded-lg px-2 py-1.5"
                    style={
                      i === 0
                        ? { background: resolved.primary, color: resolved.primaryForeground }
                        : { opacity: 0.75 }
                    }
                  >
                    {l}
                  </div>
                ))}
                {f.centreAnalytics && (
                  <div className="rounded-lg px-2 py-1.5 opacity-75">Analytics</div>
                )}
              </div>
              <div className="flex-1 p-4" style={{ background: resolved.surface }}>
                <div className="text-xs uppercase tracking-wide text-slate-400">Admin</div>
                <h3 className="text-lg font-bold" style={{ color: resolved.midnight }}>
                  {tenant.displayName} control panel
                </h3>
                <p className="text-sm text-slate-500">
                  Preview of admin sidebar identity using current branding.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
      <p className="text-[11px] text-slate-400">
        Simulation only — production layouts are unaffected.
      </p>
    </Card>
  );
}

function StudentNav({
  items,
  primary,
  primaryFg,
  midnight,
  displayName,
}: {
  items: Array<{ key: string; label: string }>;
  primary: string;
  primaryFg: string;
  midnight: string;
  displayName: string;
}) {
  return (
    <div
      className="w-40 shrink-0 p-3 space-y-2 text-xs"
      style={{ background: midnight, color: "#fff" }}
    >
      <div className="font-semibold truncate">{displayName}</div>
      {items.map((n, i) => (
        <div
          key={n.key}
          className="rounded-lg px-2 py-1.5"
          style={i === 0 ? { background: primary, color: primaryFg } : { opacity: 0.75 }}
        >
          {n.label}
        </div>
      ))}
    </div>
  );
}

function MiniCard({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div
      className="rounded-xl p-3 text-xs"
      style={{ background: tone + "18", color: "#0F172A" }}
    >
      <div className="text-[10px] uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

function ModeButton({
  current,
  value,
  onClick,
  children,
}: {
  current: string;
  value: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`text-xs px-3 py-1.5 rounded-full border transition ${
        active
          ? "bg-slate-900 text-white border-slate-900"
          : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
      }`}
    >
      {children}
    </button>
  );
}

function DeviceButton({
  current,
  value,
  onClick,
  children,
}: {
  current: string;
  value: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={`Preview at ${value}`}
      className={`p-2 rounded-full border ${
        active
          ? "bg-slate-900 text-white border-slate-900"
          : "bg-white text-slate-700 border-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Danger zone                                                        */
/* ------------------------------------------------------------------ */

function DangerZone({
  onSuspend,
  onDisableDomain,
  onArchive,
}: {
  onSuspend: () => void;
  onDisableDomain: () => void;
  onArchive: () => void;
}) {
  return (
    <Card className="rounded-3xl p-5 sm:p-6 border-rose-100 bg-rose-50/40 space-y-4">
      <div className="flex items-center gap-2">
        <ShieldAlert className="w-4 h-4 text-rose-700" />
        <h2 className="text-lg font-semibold text-rose-900">Danger zone</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <DangerCard
          title="Suspend tenant"
          description="Blocks tenant users from accessing the LMS. Data is preserved."
          onClick={onSuspend}
        />
        <DangerCard
          title="Disable domain"
          description="Prevents the tenant hostname from resolving. Records preserved."
          onClick={onDisableDomain}
        />
        <DangerCard
          title="Archive tenant"
          description="Marks the tenant inactive. Historical data preserved."
          onClick={onArchive}
        />
      </div>
      <p className="text-xs text-rose-800/80">
        Preview only — no destructive mutation runs. Permanent deletion is intentionally
        excluded here.
      </p>
    </Card>
  );
}

function DangerCard({
  title,
  description,
  onClick,
}: {
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <div className="rounded-2xl bg-white border border-rose-100 p-4 space-y-2">
      <div className="font-medium text-rose-900">{title}</div>
      <p className="text-xs text-slate-600">{description}</p>
      <Button
        variant="outline"
        size="sm"
        onClick={onClick}
        className="rounded-full border-rose-200 text-rose-700 hover:bg-rose-50"
      >
        {title}
      </Button>
    </div>
  );
}
