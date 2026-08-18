import { useIsGuestDesktop } from "@/components/guest/GuestDesktopChrome";
import { GuestHomeDesktop } from "@/pages/guest/desktop/GuestHomeDesktop";
import { Link } from "react-router-dom";
import { ChevronRight, Lock, Sparkles, BookOpen } from "lucide-react";
import {
  GuestAccentButton,
  GuestCTA,
  GuestCard,
  GuestMobileHero,
  GuestPage,
  GuestSectionHeader,
} from "@/components/guest/GuestChrome";
import { GUEST_ART, guestSubjectArt } from "@/lib/guestIllustrations";
import { usePublicSubjects, uniqueSubjectFamilies } from "@/lib/guestPublicContent";
import { Skeleton } from "@/components/ui/skeleton";

const PROGRESS_PREVIEWS = [
  {
    art: GUEST_ART.progressClock,
    title: "Study streaks",
    body: "Build a daily habit and keep your streak alive.",
  },
  {
    art: GUEST_ART.progressGrowth,
    title: "XP & levels",
    body: "Earn XP from quizzes, cards and replays.",
  },
  {
    art: GUEST_ART.progressPlay,
    title: "Replays",
    body: "Rewatch every lesson your tutor publishes.",
  },
];

/**
 * Guest mobile Home — mascot hero, locked learning-progress previews, the
 * centre's real public subject list, and a sign-in call to action.
 */
function GuestHomeMobile() {
  const subjects = usePublicSubjects();
  // Exactly four entries, one per subject family (no Form-level duplicates).
  const list = uniqueSubjectFamilies(subjects.data, 4);


  return (
    <GuestPage>
      <GuestMobileHero
        title="Aras A+"
        subtitle="Premium tuition, quizzes and replays — all in one learning app."
        art={GUEST_ART.owlCloud}
        action={<GuestAccentButton to="/auth">Start Learning</GuestAccentButton>}
      />

      <section>
        <GuestSectionHeader
          icon={<Sparkles className="h-4 w-4" aria-hidden="true" />}
          title="Learning Progress"
        />
        <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {PROGRESS_PREVIEWS.map((item) => (
            <GuestCard
              key={item.title}
              className="w-[164px] shrink-0 snap-start p-3.5"
            >
              <img
                src={item.art}
                alt=""
                aria-hidden="true"
                draggable={false}
                loading="lazy"
                className="h-12 w-12"
              />
              <p className="mt-2 text-[14px] font-bold leading-tight text-slate-900">{item.title}</p>
              <p className="mt-1 text-[11.5px] leading-snug text-slate-500">{item.body}</p>
              <p className="mt-2 flex items-center gap-1.5 text-[11.5px] font-semibold text-primary">
                <Lock className="h-3 w-3" aria-hidden="true" />
                Sign in to track
              </p>
            </GuestCard>
          ))}
        </div>
      </section>

      <section>
        <GuestSectionHeader
          icon={<BookOpen className="h-4 w-4" aria-hidden="true" />}
          title="Our Subjects"
          actionLabel="Preview"
          actionTo="/study"
        />
        {subjects.isLoading ? (
          <div className="space-y-2.5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[76px] rounded-3xl" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <GuestCard className="p-4">
            <p className="text-[13px] text-slate-500">
              Subject listings aren’t published yet. Sign in to see the classes you’re enrolled in.
            </p>
          </GuestCard>
        ) : (
          <div className="space-y-2.5">
            {list.map((subject) => (
              <Link
                key={subject.id}
                to="/auth"
                className="flex items-center gap-3 rounded-3xl border border-slate-200/70 bg-white/90 p-3 shadow-[0_8px_26px_rgba(15,23,42,0.05)] transition-transform active:scale-[0.99] motion-reduce:transition-none"
              >
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[hsl(214_100%_96%)]">
                  <img
                    src={guestSubjectArt(subject.name)}
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                    loading="lazy"
                    className="h-10 w-10"
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15.5px] font-bold text-slate-900">
                    {subject.name}
                  </span>
                  <span className="mt-0.5 block truncate text-[12.5px] text-slate-500">
                    {subject.description ?? "Sign in to view classes and materials"}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
              </Link>
            ))}
          </div>
        )}
      </section>

      <GuestCTA
        title="Learn from the best tutors"
        body="Sign in with your Aras A+ account to join your classes, quizzes and replays."
        ctaLabel="Sign in"
        banner={GUEST_CTA_MOBILE.home}
      />
    </GuestPage>
  );
}



/**
 * Guest Home entry — renders the desktop sidebar layout from
 * 1024px up and the mobile guest layout below it.
 */
export function GuestHome() {
  const isDesktop = useIsGuestDesktop();
  return isDesktop ? <GuestHomeDesktop /> : <GuestHomeMobile />;
}

export default GuestHome;
