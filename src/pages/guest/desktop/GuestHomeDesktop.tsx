import { Link } from "react-router-dom";
import { BarChart3, ChevronRight, TrendingUp } from "lucide-react";
import {
  GuestDesktopCTA,
  GuestDesktopHero,
  GuestDesktopSectionHeading,
  GuestDesktopShell,
  GuestGoldButton,
  GuestSurface,
} from "@/components/guest/GuestDesktopChrome";
import { GUEST_ART, guestSubjectArt } from "@/lib/guestIllustrations";
import { usePublicSubjects, usePublicTutors, tutorNameForSubject } from "@/lib/guestPublicContent";
import { Skeleton } from "@/components/ui/skeleton";

const PROGRESS_CARDS = [
  { art: GUEST_ART.progressClock, label: "Study time" },
  { art: GUEST_ART.progressGrowth, label: "XP earned" },
  { art: GUEST_ART.progressPlay, label: "Replays watched" },
];

/** Desktop guest Home — hero, locked progress row, public subjects, CTA. */
export function GuestHomeDesktop() {
  const subjects = usePublicSubjects();
  const tutors = usePublicTutors();
  const list = (subjects.data ?? []).slice(0, 4);

  return (
    <GuestDesktopShell>
      <GuestDesktopHero
        title="Aras A+"
        subtitle={
          <>
            Your path to
            <br />
            academic excellence
          </>
        }
        art={GUEST_ART.owlCloud}
        action={
          <GuestGoldButton to="/auth" size="lg">
            Start Learning
          </GuestGoldButton>
        }
      />

      <section>
        <GuestDesktopSectionHeading
          icon={<TrendingUp className="h-[18px] w-[18px]" aria-hidden="true" />}
          title="Learning Progress"
        />
        <div className="grid grid-cols-3 gap-5">
          {PROGRESS_CARDS.map((card) => (
            <GuestSurface
              key={card.label}
              className="flex min-h-[152px] flex-col items-center justify-center gap-2 p-6"
            >
              <span className="flex h-[74px] w-[74px] items-center justify-center rounded-full bg-[hsl(213_100%_96%)]">
                <img
                  src={card.art}
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                  loading="lazy"
                  className="h-12 w-12 object-contain"
                />
              </span>
              <p className="text-[22px] font-extrabold leading-none text-slate-400">—</p>
              <p className="text-[14.5px] font-medium text-slate-500">
                <span className="sr-only">{card.label}: </span>Sign in to track
              </p>
            </GuestSurface>
          ))}
        </div>
      </section>

      <section>
        <GuestDesktopSectionHeading
          icon={<BarChart3 className="h-[18px] w-[18px]" aria-hidden="true" />}
          title="Our Subjects"
          actionLabel="View all"
          actionTo="/study"
        />
        {subjects.isLoading ? (
          <div className="space-y-3.5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[96px] rounded-3xl" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <GuestSurface className="p-6">
            <p className="text-[15px] text-slate-500">
              Subject listings aren’t published yet. Sign in to see the classes you’re enrolled in.
            </p>
          </GuestSurface>
        ) : (
          <div className="space-y-3.5">
            {list.map((subject) => (
              <Link
                key={subject.id}
                to="/auth"
                className="group flex min-h-[96px] items-center gap-6 rounded-3xl border border-white/90 bg-white/85 px-6 shadow-[0_10px_30px_rgba(15,23,42,0.05)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              >
                <span className="flex h-[68px] w-[68px] shrink-0 items-center justify-center rounded-2xl bg-[hsl(213_100%_96%)]">
                  <img
                    src={guestSubjectArt(subject.name)}
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                    loading="lazy"
                    className="h-12 w-12 object-contain"
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[19px] font-bold text-slate-900">{subject.name}</span>
                  <span className="mt-0.5 block text-[14px] font-semibold text-primary">
                    {tutorNameForSubject(tutors.data, subject.name)}
                  </span>
                  <span className="mt-0.5 block truncate text-[14px] text-slate-500">
                    {subject.description ?? "Sign in to view classes and materials"}
                  </span>
                </span>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                  <ChevronRight className="h-5 w-5" aria-hidden="true" />
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <GuestDesktopCTA
        title="Learn from the best tutors"
        body={
          <>
            Join students excelling with Aras A+ — sign in or open the invite link your centre sent
            you.
          </>
        }
        ctaLabel="Create Free Account"
        ctaTo="/invite"
        banner={GUEST_ART.bestTutorsBannerDesktop}
      />
    </GuestDesktopShell>
  );
}

export default GuestHomeDesktop;
