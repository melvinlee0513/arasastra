import { Link } from "react-router-dom";
import { CalendarDays, Inbox, Trophy, BarChart3, LayoutGrid } from "lucide-react";
import { format, isToday, isTomorrow } from "date-fns";
import { useFeatureEnabled } from "@/hooks/useFeature";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNextClass, useUnreadInboxCount } from "@/lib/studentMore";
import { useStudentLeaderboard } from "@/lib/studentHome";
import { MoreServiceCard } from "@/components/dashboard/more/MoreServiceCard";
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
 * Mobile: a compact 2×2 Bento grid of contextual service cards, each showing a
 * single real, tenant-scoped status line (or a graceful CTA when preview data
 * is unavailable). Desktop keeps the existing compact icon grid untouched.
 */
export function MorePage() {
  const isMobile = useIsMobile();
  const inboxOn = useFeatureEnabled("studentInbox");
  const gamificationOn = useFeatureEnabled("gamification");
  const leaderboardsOn = useFeatureEnabled("leaderboards");

  const achievementsOn = gamificationOn;
  const leaderboardOn = gamificationOn && leaderboardsOn;

  const studentServices: ServiceTile[] = [
    { to: "/timetable", label: "Timetable", hint: "Weekly schedule", icon: CalendarDays, enabled: true },
    { to: "/inbox", label: "Inbox", hint: "Messages", icon: Inbox, enabled: inboxOn },
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
  ];

  const visible = studentServices.filter((s) => s.enabled);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto px-4 py-5 md:px-8 md:py-8 space-y-5 md:space-y-6">
        <header className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center">
            <LayoutGrid className="w-5 h-5 text-primary" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[22px] md:text-3xl font-bold text-slate-900 leading-tight">More</h1>
            <p className="text-[13px] md:text-sm text-slate-500">
              Everything else in your learning account.
            </p>
          </div>
        </header>

        {isMobile ? (
          <section className="space-y-3 pb-2">
            <h2 className="px-0.5 text-[18px] font-semibold text-slate-900">Student services</h2>
            {visible.length === 0 ? (
              <p className="px-1 py-6 text-sm text-slate-500">
                No extra services are enabled for your centre yet.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <TimetableCard />
                {inboxOn && <InboxCard />}
                {achievementsOn && <AchievementsCard />}
                {leaderboardOn && <LeaderboardCard />}
              </div>
            )}
          </section>
        ) : (
          <Section title="Student services">
            {visible.length === 0 ? (
              <p className="text-sm text-slate-500 px-1 py-6">
                No extra services are enabled for your centre yet.
              </p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {visible.map((s) => (
                  <Tile key={s.to} tile={s} />
                ))}
              </div>
            )}
          </Section>
        )}
      </div>
    </div>
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
      icon={CalendarDays}
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
      icon={Inbox}
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
      icon={Trophy}
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
      icon={BarChart3}
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
      <h2 className="text-[15px] md:text-lg font-semibold text-slate-900 px-1">{title}</h2>
      <div className="bg-white rounded-3xl border border-slate-200 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-3 sm:p-4">
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
        "flex flex-col items-center justify-start gap-2 rounded-2xl px-2 py-3 min-h-[92px]",
        "text-center active:bg-slate-100 hover:bg-slate-50 transition-colors",
      )}
    >
      <span className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="w-[22px] h-[22px] text-primary" aria-hidden="true" />
      </span>
      <span className="text-[13px] font-medium text-slate-900 leading-tight break-words">
        {tile.label}
      </span>
      {tile.hint && (
        <span className="text-[11px] text-slate-500 leading-tight hidden sm:block">{tile.hint}</span>
      )}
    </Link>
  );
}

export default MorePage;
