import { Link } from "react-router-dom";
import { Briefcase, ChevronRight, Eye, GraduationCap } from "lucide-react";
import {
  GuestBlueButton,
  GuestDesktopCTA,
  GuestDesktopHero,
  GuestDesktopSectionHeading,
  GuestDesktopShell,
  GuestSurface,
} from "@/components/guest/GuestDesktopChrome";
import { GUEST_ART, guestSubjectArt, guestSubjectPreview } from "@/lib/guestIllustrations";
import { usePublicSubjects, usePublicTutors, tutorNameForSubject } from "@/lib/guestPublicContent";
import { Skeleton } from "@/components/ui/skeleton";

const TOOLS = [
  {
    art: GUEST_ART.flashcards,
    title: "Flashcards",
    description: "Review key concepts with interactive flashcards",
  },
  {
    art: GUEST_ART.quizzes,
    title: "Quizzes",
    description: "Test your knowledge with fun practice quizzes",
  },
  {
    art: GUEST_ART.notes,
    title: "Notes",
    description: "Organise and review important lesson notes",
  },
];

/** Desktop guest Study — public class previews and the learning toolset. */
export function GuestStudyDesktop() {
  const subjects = usePublicSubjects();
  const tutors = usePublicTutors();
  // Exactly three previews on desktop, de-duplicated by subject name.
  const previews = (() => {
    const seen = new Set<string>();
    const unique = (subjects.data ?? []).filter((subject) => {
      const key = (subject.name ?? "").trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return unique.slice(0, 3);
  })();

  return (
    <GuestDesktopShell>
      <GuestDesktopHero
        title="Study"
        subtitle="Preview classes and learning tools"
        art={GUEST_ART.graduationCapClouds}
      />

      <GuestSurface className="flex items-center gap-5 px-6 py-5">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[hsl(213_100%_96%)]">
          <img
            src={GUEST_ART.locked}
            alt=""
            aria-hidden="true"
            draggable={false}
            className="h-10 w-10 object-contain"
          />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[19px] font-bold text-slate-900">
            Sign in to view your enrolled classes
          </p>
          <p className="mt-0.5 text-[14.5px] text-slate-500">
            Classes, materials and progress stay private to enrolled students.
          </p>
        </div>
        <GuestBlueButton to="/auth" className="shrink-0">
          Sign in
        </GuestBlueButton>
      </GuestSurface>

      <section>
        <GuestDesktopSectionHeading
          icon={<GraduationCap className="h-[18px] w-[18px]" aria-hidden="true" />}
          title="Class Preview"
          actionLabel="View all"
          actionTo="/auth"
        />
        {subjects.isLoading ? (
          <div className="grid grid-cols-3 gap-5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[320px] rounded-3xl" />
            ))}
          </div>
        ) : previews.length === 0 ? (
          <GuestSurface className="p-6">
            <p className="text-[15px] text-slate-500">
              No public class previews are published yet.
            </p>
          </GuestSurface>
        ) : (
          <div className="grid grid-cols-3 gap-5">
            {previews.map((subject) => (
              <GuestSurface key={subject.id} className="overflow-hidden">
                <div className="relative flex h-[186px] items-center justify-center overflow-hidden bg-[hsl(213_100%_96%)]">
                  <img
                    src={guestPreviewArt(subject.name).art}
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                    loading="lazy"
                    className="h-[90%] w-[90%] object-contain"
                  />
                </div>
                <div className="relative">
                  {null}
                  <span className="absolute left-3.5 top-3.5 inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-[12px] font-bold text-primary-foreground shadow-[0_8px_18px_rgba(37,99,235,0.3)]">
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                    Preview
                  </span>
                </div>
                <div className="flex items-start gap-3 p-5">
                  <img
                    src={guestSubjectArt(subject.name)}
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                    loading="lazy"
                    className="h-11 w-11 shrink-0 object-contain"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[18px] font-bold text-slate-900">{subject.name}</p>
                    <p className="text-[13.5px] font-semibold text-primary">
                      {tutorNameForSubject(tutors.data, subject.name)}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[13.5px] text-slate-500">
                      {subject.description ?? "Sign in to view classes and materials"}
                    </p>
                  </div>
                  <Link
                    to="/auth"
                    className="ml-auto inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border border-slate-200 px-4 text-[14px] font-semibold text-primary transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  >
                    <Eye className="h-4 w-4" aria-hidden="true" />
                    Preview
                  </Link>
                </div>
              </GuestSurface>
            ))}
          </div>
        )}
      </section>

      <section>
        <GuestDesktopSectionHeading
          icon={<Briefcase className="h-[18px] w-[18px]" aria-hidden="true" />}
          title="Learning Tools"
        />
        <div className="grid grid-cols-3 gap-5">
          {TOOLS.map((tool) => (
            <GuestSurface key={tool.title} className="flex h-full flex-col p-5">
              <div className="flex flex-1 items-center gap-4">
                <img
                  src={tool.art}
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                  loading="lazy"
                  className="h-[74px] w-[74px] shrink-0 object-contain"
                />
                <div className="min-w-0">
                  <p className="text-[17px] font-bold leading-tight text-slate-900">{tool.title}</p>
                  <p className="mt-1 text-[13.5px] leading-snug text-slate-500">
                    {tool.description}
                  </p>
                </div>
              </div>
              <Link
                to="/auth"
                className="mt-3 inline-flex min-h-[44px] items-center justify-end gap-1.5 self-end rounded-full px-3 text-[14px] font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                Preview
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </GuestSurface>
          ))}
        </div>
      </section>

      <GuestDesktopCTA
        title="Ready to start your learning journey?"
        body="Create your account with the invite link from your centre, or sign in to access your classes and track your progress."
        ctaLabel="Create Account"
        ctaTo="/invite"
        banner={GUEST_ART.learningJourneyBannerDesktop}
      />
    </GuestDesktopShell>
  );
}

export default GuestStudyDesktop;
