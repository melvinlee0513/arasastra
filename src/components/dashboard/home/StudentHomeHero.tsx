import { Flame, Zap, Trophy } from "lucide-react";
import { UserAvatar } from "@/components/profile/UserAvatar";
import {
  firstNameFrom,
  greetingFor,
  heroPresetFor,
  type StudentProfileRecord,
} from "@/lib/studentProfile";

interface StudentHomeHeroProps {
  profile: StudentProfileRecord | null | undefined;
  isLoading: boolean;
  showGamification: boolean;
  showRank: boolean;
  statsLoading: boolean;
  streak: number;
  totalXp: number;
  rank: number | null;
}

interface Stat {
  icon: typeof Flame;
  short: string;
  full: string;
}

/**
 * Mobile Home hero — one personalised coloured card holding the student's
 * avatar, a time-aware greeting from their display name and their gamification
 * stats. Colour is a per-student preference (profiles.home_header_color); it is
 * personalisation only and never touches tenant branding.
 */
export function StudentHomeHero({
  profile,
  isLoading,
  showGamification,
  showRank,
  statsLoading,
  streak,
  totalXp,
  rank,
}: StudentHomeHeroProps) {
  const preset = heroPresetFor(profile?.home_header_color);

  const stats: Stat[] = [];
  if (showGamification) {
    stats.push({
      icon: Flame,
      short: `${streak} day${streak === 1 ? "" : "s"}`,
      full: `${streak} day${streak === 1 ? "" : "s"} streak`,
    });
    stats.push({
      icon: Zap,
      short: `${totalXp.toLocaleString()} XP`,
      full: `${totalXp.toLocaleString()} XP earned`,
    });
    if (showRank && rank !== null) {
      stats.push({ icon: Trophy, short: `#${rank}`, full: `Rank #${rank} this week` });
    }
  }

  return (
    <section
      style={{ backgroundColor: preset.background }}
      className="rounded-[26px] px-[18px] py-[18px] text-white shadow-[0_10px_30px_rgba(15,23,42,0.16)]"
    >
      {isLoading ? (
        <div aria-hidden="true" className="space-y-4">
          <div className="h-[52px] w-[52px] rounded-full bg-white/20 animate-pulse" />
          <div className="space-y-2">
            <div className="h-6 w-3/5 rounded-lg bg-white/20 animate-pulse" />
            <div className="h-4 w-2/5 rounded bg-white/15 animate-pulse" />
          </div>
          <div className="flex gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-9 flex-1 rounded-full bg-white/15 animate-pulse" />
            ))}
          </div>
        </div>
      ) : (
        <>
          <UserAvatar
            path={profile?.avatar_path ?? null}
            name={profile?.display_name || profile?.full_name || "Student"}
            refreshKey={profile?.avatar_updated_at}
            className="w-[52px] h-[52px] ring-2 ring-white/60"
            fallbackClassName="bg-white/15 text-white text-base font-semibold"
          />

          <div className="mt-3 space-y-1">
            <h1 className="text-[21px] font-bold leading-tight">
              {greetingFor()}, {firstNameFrom(profile)} 👋
            </h1>
            <p className="text-[13.5px] text-white/75">Ready to learn something new today?</p>
          </div>

          {showGamification && (
            statsLoading ? (
              <div className="mt-5 flex gap-2" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-9 flex-1 rounded-full bg-white/15 animate-pulse" />
                ))}
              </div>
            ) : (
              <ul className="mt-5 flex flex-wrap gap-2">
                {stats.map((s) => (
                  <li
                    key={s.full}
                    className="flex min-w-0 items-center gap-1.5 rounded-full border border-white/20 bg-white/12 px-3 py-2"
                  >
                    <s.icon className="w-4 h-4 shrink-0 text-white/90" aria-hidden="true" />
                    <span className="text-[12.5px] font-semibold whitespace-nowrap">
                      <span aria-hidden="true">{s.short}</span>
                      <span className="sr-only">{s.full}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )
          )}
        </>
      )}
    </section>
  );
}

export default StudentHomeHero;
