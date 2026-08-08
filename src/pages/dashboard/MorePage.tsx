import { Link } from "react-router-dom";
import { Calendar, Inbox, Trophy, BarChart3, LayoutGrid } from "lucide-react";
import { useFeatureEnabled } from "@/hooks/useFeature";
import { cn } from "@/lib/utils";

interface ServiceTile {
  to: string;
  label: string;
  hint?: string;
  icon: typeof Calendar;
  enabled: boolean;
}

/**
 * Student "More" hub — grouped services as a compact mobile icon grid.
 * Reuses existing routes only; nothing new is fetched here.
 */
export function MorePage() {
  const inboxOn = useFeatureEnabled("studentInbox");
  const gamificationOn = useFeatureEnabled("gamification");
  const leaderboardsOn = useFeatureEnabled("leaderboards");

  const studentServices: ServiceTile[] = [
    { to: "/timetable", label: "Timetable", hint: "Weekly schedule", icon: Calendar, enabled: true },
    { to: "/inbox", label: "Inbox", hint: "Messages", icon: Inbox, enabled: inboxOn },
    {
      to: "/dashboard/achievements",
      label: "Achievements",
      hint: "XP & badges",
      icon: Trophy,
      enabled: gamificationOn,
    },
    {
      to: "/dashboard/leaderboard",
      label: "Leaderboard",
      hint: "Class ranking",
      icon: BarChart3,
      enabled: gamificationOn && leaderboardsOn,
    },
  ];

  const visible = studentServices.filter((s) => s.enabled);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto px-4 py-5 md:px-8 md:py-8 space-y-6">
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
      </div>
    </div>
  );
}

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
