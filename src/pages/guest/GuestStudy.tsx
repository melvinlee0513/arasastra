import { Link } from "react-router-dom";
import { Eye, GraduationCap, Lock, Wrench } from "lucide-react";
import {
  GuestCTA,
  GuestCard,
  GuestMobileHero,
  GuestPage,
  GuestSectionHeader,
} from "@/components/guest/GuestChrome";
import { GUEST_ART, guestSubjectArt, guestSubjectPreview } from "@/lib/guestIllustrations";
import { usePublicSubjects } from "@/lib/guestPublicContent";
import { Skeleton } from "@/components/ui/skeleton";

const LEARNING_TOOLS = [
  { art: GUEST_ART.quizzes, title: "Quizzes", body: "Timed practice with instant scoring." },
  { art: GUEST_ART.flashcards, title: "Flashcards", body: "Swipe-through revision decks." },
  { art: GUEST_ART.notes, title: "Notes", body: "Tutor-published notes and worksheets." },
  { art: GUEST_ART.progressPlay, title: "Replays", body: "Catch up on any lesson you missed." },
];

/**
 * Guest mobile Study page — no enrolment data is fetched. Visitors see the
 * centre's public subject catalogue as previews plus the learning toolset.
 */
export function GuestStudy() {
  const subjects = usePublicSubjects();
  const previews = (subjects.data ?? []).slice(0, 6);

  return (
    <GuestPage>
      <GuestMobileHero
        title="Study"
        subtitle="Preview what learning looks like inside Aras A+."
        art={GUEST_ART.graduationCapClouds}
      />

      <Link
        to="/auth"
        className="flex items-center gap-3 rounded-3xl border border-primary/20 bg-primary/[0.07] p-3.5 transition-transform active:scale-[0.99] motion-reduce:transition-none"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm">
          <img
            src={GUEST_ART.locked}
            alt=""
            aria-hidden="true"
            draggable={false}
            loading="lazy"
            className="h-7 w-7"
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px] font-bold text-slate-900">
            Sign in to view your enrolled classes
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-primary">
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            Classes are private to enrolled students
          </span>
        </span>
      </Link>

      <section>
        <GuestSectionHeader
          icon={<GraduationCap className="h-4 w-4" aria-hidden="true" />}
          title="Class previews"
        />
        {subjects.isLoading ? (
          <div className="-mx-4 flex gap-3 px-4">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-[196px] w-[228px] shrink-0 rounded-3xl" />
            ))}
          </div>
        ) : previews.length === 0 ? (
          <GuestCard className="p-4">
            <p className="text-[13px] text-slate-500">
              No public class previews are published yet.
            </p>
          </GuestCard>
        ) : (
          <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {previews.map((subject) => (
              <GuestCard
                key={subject.id}
                className="w-[228px] shrink-0 snap-start overflow-hidden"
              >
                <div className="relative flex h-[124px] items-center justify-center bg-[hsl(214_100%_96%)]">
                  <img
                    src={guestSubjectPreview(subject.name)}
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                  <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-1 text-[10.5px] font-bold text-slate-700 backdrop-blur">
                    <Eye className="h-3 w-3" aria-hidden="true" />
                    Class preview
                  </span>
                </div>
                <div className="flex items-center gap-2.5 p-3">
                  <img
                    src={guestSubjectArt(subject.name)}
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                    loading="lazy"
                    className="h-8 w-8 shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-[14.5px] font-bold text-slate-900">{subject.name}</p>
                    <p className="text-[11.5px] text-slate-500">Sign in to join</p>
                  </div>
                </div>
              </GuestCard>
            ))}
          </div>
        )}
      </section>

      <section>
        <GuestSectionHeader
          icon={<Wrench className="h-4 w-4" aria-hidden="true" />}
          title="Learning tools"
        />
        <div className="grid grid-cols-2 gap-3">
          {LEARNING_TOOLS.map((tool) => (
            <GuestCard key={tool.title} className="p-3.5">
              <img
                src={tool.art}
                alt=""
                aria-hidden="true"
                draggable={false}
                loading="lazy"
                className="h-12 w-12"
              />
              <p className="mt-2 text-[14px] font-bold leading-tight text-slate-900">{tool.title}</p>
              <p className="mt-1 text-[11.5px] leading-snug text-slate-500">{tool.body}</p>
              <p className="mt-2 flex items-center gap-1.5 text-[11.5px] font-semibold text-primary">
                <Lock className="h-3 w-3" aria-hidden="true" />
                Preview only
              </p>
            </GuestCard>
          ))}
        </div>
      </section>

      <GuestCTA
        title="Ready to start your learning journey?"
        body="Sign in with the account your centre created for you."
        ctaLabel="Sign in"
        banner={GUEST_ART.learningJourneyBanner}
      />
    </GuestPage>
  );
}

export default GuestStudy;
