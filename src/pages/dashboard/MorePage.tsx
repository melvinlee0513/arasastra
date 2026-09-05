import { Link } from "react-router-dom";
import { CalendarDays, Inbox, Trophy, BarChart3, LifeBuoy, ShieldCheck, Layers } from "lucide-react";
import { format, isToday, isTomorrow } from "date-fns";
import { useFeatureEnabled } from "@/hooks/useFeature";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNextClass, useUnreadInboxCount } from "@/lib/studentMore";
import { useStudentLeaderboard } from "@/lib/studentHome";
import { MoreServiceCard } from "@/components/dashboard/more/MoreServiceCard";
import {
  ServiceFooterDecor,
  ServiceHeader,
  ServicePage,
  ServiceReveal,
  ServiceSectionHeading,
} from "@/components/dashboard/services/StudentServiceChrome";
import { STUDENT_SERVICE_ART } from "@/lib/studentIllustrations";
import { cn } from "@/lib/utils";

interface ServiceTile {
  to: string;
  label: string;
  hint?: string;
  icon: typeof CalendarDays;
  enabled: boolean;
}

/**
 * Student "More" hub.
 *
 * Mobile: a 2-column grid of large illustrated service cards, each showing a
 * single real, tenant-scoped status line (or a graceful CTA when preview data
 * is unavailable). Desktop keeps the compact icon grid.
 */
export function MorePage() {
  const isMobile = useIsMobile();
  const inboxOn = useFeatureEnabled("studentInbox");
  const gamificationOn = useFeatureEnabled("gamification");
  const leaderboardsOn = useFeatureEnabled("leaderboards");
  const flashcardsOn = useFeatureEnabled("flashcards");

  const achievementsOn = gamificationOn;
  const leaderboardOn = gamificationOn && leaderboardsOn;

  const studentServices: ServiceTile[] = [
    { to: "/timetable", label: "Timetable", hint: "Weekly schedule", icon: CalendarDays, enabled: true },
    { to: "/inbox", label: "Inbox", hint: "Messages", icon: Inbox, enabled: inboxOn },
    {
      to: "/dashboard/flashcards",
      label: "My Flashcards",
      hint: "Daily review",
      icon: Layers,
      enabled: flashcardsOn,
    },
    {
      to: "/dashboard/achievements",
      label: "Achievements",
      hint: "XP & badges",
      icon: Trophy,
      enabled: achievementsOn,
    },
    {
      to: "/dashboard/leaderboard",
      label: "Leaderboard",
      hint: "Class ranking",
      icon: BarChart3,
      enabled: leaderboardOn,
    },
    { to: "/support", label: "Help & Support", hint: "FAQs & contact", icon: LifeBuoy, enabled: true },
    { to: "/privacy", label: "Privacy Policy", hint: "Your data", icon: ShieldCheck, enabled: true },
  ];

  const visible = studentServices.filter((s) => s.enabled);

  return (
    <ServicePage maxWidth="max-w-3xl md:max-w-5xl">
      <ServiceReveal>
        <ServiceHeader
          art={STUDENT_SERVICE_ART.hub}
          title="More"
          subtitle="Everything else in your learning account."
        />
      </ServiceReveal>

      <section className="pb-2">
        <ServiceSectionHeading title="Student services" />
        {visible.length === 0 ? (
          <p className="px-1 py-6 text-sm text-slate-500">
            No extra services are enabled for your centre yet.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3.5 md:grid-cols-4 md:gap-5">
            <ServiceReveal delay={40}>
              <TimetableCard />
            </ServiceReveal>
            {inboxOn && (
              <ServiceReveal delay={80}>
                <InboxCard />
              </ServiceReveal>
            )}
            {achievementsOn && (
              <ServiceReveal delay={120}>
                <AchievementsCard />
              </ServiceReveal>
            )}
            {leaderboardOn && (
              <ServiceReveal delay={160}>
                <LeaderboardCard />
              </ServiceReveal>
            )}
            <ServiceReveal delay={200}>
              <MoreServiceCard
                to="/support"
                title="Help & Support"
                art={STUDENT_SERVICE_ART.support}
                tone="inbox"
                contextValue="FAQs & contact us"
                accessibleContext="Help and support: FAQs and contact us"
              />
            </ServiceReveal>
            <ServiceReveal delay={240}>
              <MoreServiceCard
                to="/privacy"
                title="Privacy Policy"
                art={STUDENT_SERVICE_ART.privacy}
                tone="timetable"
                contextValue="How we use your data"
                accessibleContext="Privacy policy: how we use your data"
              />
            </ServiceReveal>
          </div>
        )}
        <ServiceFooterDecor />
      </section>

    </ServicePage>
  );
}

/* ---------------------------------------------------------------- mobile cards */

function TimetableCard() {
  const { next, isLoading, isError } = useNextClass();

  let contextLabel: string | undefined;
  let contextValue: string | undefined;

  if (isError) {
    contextValue = "View schedule";
  } else if (!next) {
    contextValue = "No class coming up";
  } else {
    const at = new Date(next.at);
    const day = isToday(at) ? "Today" : isTomorrow(at) ? "Tomorrow" : format(at, "EEE");
    const name = next.subject_name ?? next.class_name ?? next.title;
    contextLabel = "Next class";
    contextValue = `${name} · ${day} ${format(at, "h:mm a")}`;
  }

  return (
    <MoreServiceCard
      to="/timetable"
      title="Timetable"
      art={STUDENT_SERVICE_ART.timetable}
      tone="timetable"
      loading={isLoading}
      contextLabel={contextLabel}
      contextValue={contextValue}
      accessibleContext={contextValue}
    />
  );
}

function InboxCard() {
  const { data: unread, isLoading, isError } = useUnreadInboxCount();

  const contextValue = isError
    ? "Open inbox"
    : (unread ?? 0) > 0
      ? `${unread} unread`
      : "No unread messages";

  return (
    <MoreServiceCard
      to="/inbox"
      title="Inbox"
      art={STUDENT_SERVICE_ART.inbox}
      tone="inbox"
      loading={isLoading}
      contextValue={contextValue}
      badgeCount={isError ? undefined : unread}
      accessibleContext={
        !isError && (unread ?? 0) > 0 ? `${unread} unread messages` : contextValue
      }
    />
  );
}

function AchievementsCard() {
  // No production achievement-record source exists yet, so the card shows a
  // plain CTA rather than an invented unlocked count.
  return (
    <MoreServiceCard
      to="/dashboard/achievements"
      title="Achievements"
      art={STUDENT_SERVICE_ART.achievements}
      tone="achievements"
      contextValue="View achievements"
      accessibleContext="View achievements"
    />
  );
}

function LeaderboardCard() {
  const { data, isLoading, isError } = useStudentLeaderboard("week", true);
  const me = data?.me ?? null;

  let contextValue: string;
  if (isError) contextValue = "View ranking";
  else if (me && me.position > 0) {
    contextValue = `#${me.position} this week · ${me.xp.toLocaleString()} XP`;
  } else if (me && me.xp > 0) {
    contextValue = `${me.xp.toLocaleString()} XP this week`;
  } else {
    contextValue = "No ranking yet";
  }

  return (
    <MoreServiceCard
      to="/dashboard/leaderboard"
      title="Leaderboard"
      art={STUDENT_SERVICE_ART.leaderboard}
      tone="leaderboard"
      loading={isLoading}
      contextValue={contextValue}
      accessibleContext={contextValue}
    />
  );
}

/* --------------------------------------------------------------- desktop tiles */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="px-1 text-[15px] font-semibold text-slate-900 md:text-lg">{title}</h2>
      <div className="rounded-3xl border border-slate-200 bg-white p-3 shadow-[0_8px_30px_rgb(0,0,0,0.04)] sm:p-4">
        {children}
      </div>
    </section>
  );
}

function Tile({ tile }: { tile: ServiceTile }) {
  const Icon = tile.icon;
  return (
    <Link
      to={tile.to}
      className={cn(
        "flex min-h-[92px] flex-col items-center justify-start gap-2 rounded-2xl px-2 py-3",
        "text-center transition-colors hover:bg-slate-50 active:bg-slate-100",
      )}
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
        <Icon className="h-[22px] w-[22px] text-primary" aria-hidden="true" />
      </span>
      <span className="break-words text-[13px] font-medium leading-tight text-slate-900">
        {tile.label}
      </span>
      {tile.hint && (
        <span className="hidden text-[11px] leading-tight text-slate-500 sm:block">{tile.hint}</span>
      )}
    </Link>
  );
}

export default MorePage;
