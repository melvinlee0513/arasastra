import { Star, Lock, Sparkles } from "lucide-react";
import { useGamification } from "@/hooks/useGamification";
import { cn } from "@/lib/utils";
import {
  DecorArt,
  ServiceArtBubble,
  ServiceFooterDecor,
  ServiceHeader,
  ServicePage,
  ServiceReveal,
  ServiceSectionHeading,
} from "@/components/dashboard/services/StudentServiceChrome";
import { ACHIEVEMENT_ART, DECOR_ART } from "@/lib/studentIllustrations";

interface MilestoneBadge {
  id: string;
  label: string;
  art: string;
  earned: boolean;
  /** Progress hint shown on locked badges, derived from real state. */
  hint: string;
}

/**
 * Student achievements.
 *
 * Milestone badges are derived entirely from the student's real gamification
 * state (XP total, level, streaks). No subject-completion or certificate
 * catalogue exists in production, so none is rendered here.
 */
export function Achievements() {
  const { totalXp, level, currentStreak, longestStreak, isLoading, enabled } = useGamification();

  const bestStreak = Math.max(currentStreak, longestStreak);

  const badges: MilestoneBadge[] = [
    {
      id: "first-xp",
      label: "First Steps",
      art: ACHIEVEMENT_ART.firstStep,
      earned: totalXp > 0,
      hint: "Earn your first XP",
    },
    {
      id: "streak-3",
      label: "3-Day Streak",
      art: ACHIEVEMENT_ART.streak,
      earned: bestStreak >= 3,
      hint: `${bestStreak}/3 day streak`,
    },
    {
      id: "streak-7",
      label: "7-Day Streak",
      art: ACHIEVEMENT_ART.streakLong,
      earned: bestStreak >= 7,
      hint: `${bestStreak}/7 day streak`,
    },
    {
      id: "xp-1000",
      label: "1,000 XP",
      art: ACHIEVEMENT_ART.xp,
      earned: totalXp >= 1000,
      hint: `${totalXp.toLocaleString()}/1,000 XP`,
    },
    {
      id: "level-3",
      label: "Level 3",
      art: ACHIEVEMENT_ART.level,
      earned: level >= 3,
      hint: `Level ${level} of 3`,
    },
    {
      id: "xp-5000",
      label: "5,000 XP",
      art: ACHIEVEMENT_ART.certificate,
      earned: totalXp >= 5000,
      hint: `${totalXp.toLocaleString()}/5,000 XP`,
    },
  ];

  const earnedCount = badges.filter((b) => b.earned).length;

  return (
    <ServicePage>
      <ServiceReveal>
        <ServiceHeader
          art={ACHIEVEMENT_ART.trophy}
          title="Achievements"
          subtitle="Track your progress and earn badges"
          bubbleClassName="bg-amber-50"
        />
      </ServiceReveal>

      <section>
        <ServiceSectionHeading
          title="Milestone badges"
          icon={
            <span
              aria-hidden="true"
              className="flex h-7 w-7 items-center justify-center rounded-[10px] bg-amber-100"
            >
              <Star className="h-4 w-4 text-amber-600" />
            </span>
          }
          action={
            !isLoading && enabled ? (
              <span className="shrink-0 pb-1 text-[12px] font-semibold text-slate-500">
                {earnedCount} of {badges.length} earned
              </span>
            ) : undefined
          }
        />

        {!enabled ? (
          <p className="rounded-[24px] border border-slate-200/70 bg-white px-4 py-6 text-center text-[13px] text-slate-500">
            Badges aren't enabled for your centre yet.
          </p>
        ) : isLoading ? (
          <div className="grid grid-cols-2 gap-3.5" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-[168px] animate-pulse rounded-[26px] bg-white/70" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3">
            {badges.map((badge, i) => (
              <ServiceReveal key={badge.id} delay={i * 40}>
                <BadgeCard badge={badge} />
              </ServiceReveal>
            ))}
          </div>
        )}
      </section>

      <ServiceFooterDecor />
    </ServicePage>
  );
}

function BadgeCard({ badge }: { badge: MilestoneBadge }) {
  const { earned } = badge;

  return (
    <div
      className={cn(
        "relative flex flex-col items-center overflow-hidden rounded-[26px] border px-3 pb-3.5 pt-4 text-center",
        "transition-transform duration-200 ease-out active:scale-[0.975] motion-reduce:transition-none",
        earned
          ? "border-amber-200/90 bg-[linear-gradient(170deg,#fffdf5_0%,#fff5e2_100%)] shadow-[0_8px_26px_rgba(245,158,11,0.16)]"
          : "border-slate-200/70 bg-[linear-gradient(170deg,#fbfcfe_0%,#f4f5fa_100%)] shadow-[0_4px_16px_rgba(15,23,42,0.04)]",
      )}
    >
      {earned && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <span className="absolute left-1/2 top-0 h-20 w-32 -translate-x-1/2 rounded-full bg-amber-200/40 blur-2xl" />
          <DecorArt src={DECOR_ART.star} className="absolute right-2.5 top-2.5 h-4 w-4 opacity-70" />
          <DecorArt src={DECOR_ART.sparkleStar} className="absolute left-2 top-8 h-3.5 w-3.5 opacity-45" />
        </div>
      )}

      <ServiceArtBubble
        src={earned ? badge.art : ACHIEVEMENT_ART.locked}
        size="xl"
        className={cn(
          "relative",
          earned ? "bg-white/80 ring-1 ring-inset ring-amber-100" : "bg-white/70 grayscale-[0.35] opacity-80",
        )}
      />

      <p
        className={cn(
          "relative mt-2.5 text-[13.5px] font-bold leading-tight tracking-[-0.01em]",
          earned ? "text-slate-900" : "text-slate-600",
        )}
      >
        {badge.label}
      </p>

      <span
        className={cn(
          "relative mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wide",
          earned ? "bg-amber-500/15 text-amber-700" : "bg-slate-200/70 text-slate-500",
        )}
      >
        {earned ? (
          <>
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            Earned
          </>
        ) : (
          <>
            <Lock className="h-3 w-3" aria-hidden="true" />
            Locked
          </>
        )}
      </span>

      {!earned && (
        <p className="relative mt-1.5 text-[11px] font-medium text-slate-400">{badge.hint}</p>
      )}
    </div>
  );
}

export default Achievements;
