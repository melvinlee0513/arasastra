import { Link } from "react-router-dom";
import { Bell } from "lucide-react";
import { UserAvatar } from "@/components/profile/UserAvatar";
import {
  firstNameFrom,
  heroBackgroundFor,
  type StudentProfileRecord,
} from "@/lib/studentProfile";
import { HOME_ART } from "./StudentHomeShared";
import { cn } from "@/lib/utils";

interface StudentHomeHeroProps {
  profile: StudentProfileRecord | null | undefined;
  isLoading: boolean;
  showGamification: boolean;
  showRank: boolean;
  statsLoading: boolean;
  streak: number;
  totalXp: number;
  rank: number | null;
  /** Unread inbox count from the canonical inbox reader. */
  unreadCount?: number;
}

interface Stat {
  /** Soft-3D artwork from the shared illustration library. */
  art: string;
  value: string;
  caption: string;
  iconClass: string;
  captionClass: string;
  srLabel: string;
}

/**
 * Mobile Home hero — an open, playful top section: avatar + greeting on the
 * left, notification bell top-right, floating spark accents, and three compact
 * soft stat widgets below. No heavy saturated banner block.
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
  unreadCount = 0,
}: StudentHomeHeroProps) {
  const stats: Stat[] = [];
  if (showGamification) {
    stats.push({
      art: HOME_ART.flame,
      value: `${streak} day${streak === 1 ? "" : "s"}`,
      caption: "streak",
      iconClass: "bg-home-updates text-home-updates-accent",
      captionClass: "text-home-updates-accent",
      srLabel: `${streak} day${streak === 1 ? "" : "s"} learning streak`,
    });
    stats.push({
      art: HOME_ART.bolt,
      value: `${totalXp.toLocaleString("en-US")} XP`,
      caption: "earned",
      iconClass: "bg-home-learning text-home-learning-accent",
      captionClass: "text-home-learning-accent",
      srLabel: `${totalXp.toLocaleString("en-US")} XP earned`,
    });
    if (showRank && rank !== null) {
      stats.push({
        art: HOME_ART.trophy,
        value: `#${rank}`,
        caption: "this week",
        iconClass: "bg-medal-gold-soft text-medal-gold",
        captionClass: "text-medal-gold",
        srLabel: `Rank number ${rank} this week`,
      });
    }
  }

  return (
    <section className="relative isolate">
      {/* Illustrated hero background — decorative layer behind all content.
          The rounded mask lives on this single wrapper (nothing above it clips),
          so all four corners stay fully rounded on every breakpoint. While the
          profile preference is still resolving we show a neutral surface
          instead of the red fallback, so no colour flash occurs. */}
      <div
        style={{ borderRadius: "28px" }}
        className={cn(
          "relative isolate overflow-hidden px-5 pb-5 pt-5 [border-radius:28px] sm:px-6 sm:pb-6 md:px-7 md:pb-6 md:pt-6 md:[border-radius:32px]",
          isLoading && "bg-[linear-gradient(135deg,#f4f7fc_0%,#eef2f9_100%)]",
        )}
      >
        {!isLoading && (
          <img
            src={heroBackgroundFor(profile?.home_header_color)}
            alt=""
            aria-hidden="true"
            draggable={false}
            fetchPriority="high"
            decoding="async"
            className="pointer-events-none absolute left-1/2 top-1/2 h-[112%] w-[112%] -translate-x-1/2 -translate-y-1/2 select-none object-cover object-center"
          />
        )}

      <div className="relative z-10 flex items-start gap-3">


        {isLoading ? (
          <div
            aria-hidden="true"
            className="h-[62px] w-[62px] shrink-0 animate-pulse rounded-full bg-slate-200/70 md:h-[74px] md:w-[74px]"
          />
        ) : (
          <Link to="/dashboard/profile" aria-label="Open your profile" className="shrink-0">
            <UserAvatar
              path={profile?.avatar_path ?? null}
              name={profile?.display_name || profile?.full_name || "Student"}
              refreshKey={profile?.avatar_updated_at}
              className="h-[62px] w-[62px] md:h-[74px] md:w-[74px] ring-2 ring-white shadow-[0_6px_18px_rgba(15,23,42,0.12)]"
              fallbackClassName="bg-primary/10 text-primary text-lg font-bold"
            />
          </Link>
        )}

        <div className="min-w-0 flex-1 pt-1">
          {isLoading ? (
            <div aria-hidden="true" className="space-y-2">
              <div className="h-5 w-4/5 animate-pulse rounded-full bg-slate-200/70" />
              <div className="h-3.5 w-3/5 animate-pulse rounded-full bg-slate-200/60" />
            </div>
          ) : (
            <>
              <h1 className="text-[21px] font-bold leading-tight tracking-[-0.02em] text-slate-900 md:text-[30px]">
                Welcome back, {firstNameFrom(profile)} 👋
              </h1>
              <p className="mt-0.5 text-[13.5px] text-slate-500 md:text-[15px]">
                Ready to learn something new today?
              </p>
            </>
          )}
        </div>

        <Link
          to="/inbox"
          aria-label={
            unreadCount > 0 ? `Inbox, ${unreadCount} unread` : "Inbox"
          }
          className="relative mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-slate-600 shadow-[0_4px_14px_rgba(15,23,42,0.10)] transition-transform active:scale-95 motion-reduce:transition-none"
        >
          <Bell className="h-5 w-5" aria-hidden="true" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-[19px] min-w-[19px] items-center justify-center rounded-full bg-home-ranking-accent px-1 text-[10.5px] font-bold text-white ring-2 ring-slate-50">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Link>
      </div>

      {showGamification && (
        statsLoading ? (
          <div className="relative z-10 mt-4 flex gap-2.5 md:mt-5 md:max-w-[560px]" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-[62px] flex-1 animate-pulse rounded-[20px] border border-slate-200/70 bg-white"
              />
            ))}
          </div>
        ) : stats.length > 0 ? (
          <ul className="relative z-10 mt-4 flex gap-2.5 md:mt-5 md:max-w-[560px]">
            {stats.map((s) => (
              <li
                key={s.caption + s.value}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-[20px] border border-white bg-white px-3 py-2 shadow-[0_8px_22px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,0.9)]"
              >
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-[13px]",
                    s.iconClass,
                  )}
                >
                  <img
                    src={s.art}
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    decoding="async"
                    className="h-[26px] w-[26px] object-contain drop-shadow-[0_2px_4px_rgba(15,23,42,0.16)]"
                  />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-bold leading-tight text-slate-900">
                    {s.value}
                  </span>
                  <span
                    className={cn("block truncate text-[11.5px] font-semibold", s.captionClass)}
                  >
                    {s.caption}
                  </span>
                  <span className="sr-only">{s.srLabel}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : null
      )}
      </div>
    </section>

  );
}

export default StudentHomeHero;
