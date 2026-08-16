import { useIsGuestDesktop } from "@/components/guest/GuestDesktopChrome";
import { GuestMoreDesktop } from "@/pages/guest/desktop/GuestMoreDesktop";
import { LayoutGrid, HeartHandshake } from "lucide-react";
import {
  GuestCTA,
  GuestFeatureCard,
  GuestLockedServiceRow,
  GuestMobileHero,
  GuestPage,
  GuestSectionHeader,
} from "@/components/guest/GuestChrome";
import { GUEST_ART } from "@/lib/guestIllustrations";

const WHY_JOIN = [
  {
    art: GUEST_ART.scheduleClock,
    title: "Never miss a class",
    description: "Your weekly timetable and next-class reminders in one place.",
  },
  {
    art: GUEST_ART.materials,
    title: "All your materials",
    description: "Notes, worksheets and replays organised class by class.",
  },
  {
    art: GUEST_ART.bell,
    title: "Instant updates",
    description: "Announcements from your tutors land straight in your inbox.",
  },
  {
    art: GUEST_ART.unlocked,
    title: "Earn as you learn",
    description: "XP, streaks and leaderboards keep revision fun.",
  },
];

/**
 * Guest mobile "More" hub — the same student services shown as clearly locked
 * previews, plus the reasons to join and a sign-in call to action.
 */
function GuestMoreMobile() {
  return (
    <GuestPage>
      <GuestMobileHero
        title="More"
        subtitle="Student tools you unlock once you sign in."
        art={GUEST_ART.owlBookCloud}
      />

      <section>
        <GuestSectionHeader
          icon={<LayoutGrid className="h-4 w-4" aria-hidden="true" />}
          title="Student services"
        />
        <div className="space-y-2.5">
          <GuestLockedServiceRow
            art={GUEST_ART.inbox}
            title="Inbox"
            description="Messages and reminders from your centre"
          />
          <GuestLockedServiceRow
            art={GUEST_ART.timetable}
            title="Timetable"
            description="Your weekly class schedule"
          />
          <GuestLockedServiceRow
            art={GUEST_ART.announcements}
            title="Announcements"
            description="Class news from your tutors"
          />
          <GuestLockedServiceRow
            art={GUEST_ART.helpHeadset}
            title="Help & support"
            description="Contact your centre or read the basics"
            locked={false}
            to="/support"
            actionLabel="Open"
          />
        </div>
      </section>

      <section>
        <GuestSectionHeader
          icon={<HeartHandshake className="h-4 w-4" aria-hidden="true" />}
          title="Why join Aras A+"
        />
        <div className="grid grid-cols-2 gap-3">
          {WHY_JOIN.map((item) => (
            <GuestFeatureCard key={item.title} {...item} />
          ))}
        </div>
      </section>

      <GuestCTA
        title="Unlock your student tools"
        body="Sign in to open your inbox, timetable and class announcements."
        ctaLabel="Sign in"
        banner={GUEST_ART.learningJourneyBanner}
      />
    </GuestPage>
  );
}



/**
 * Guest More entry — renders the desktop sidebar layout from
 * 1024px up and the mobile guest layout below it.
 */
export function GuestMore() {
  const isDesktop = useIsGuestDesktop();
  return isDesktop ? <GuestMoreDesktop /> : <GuestMoreMobile />;
}

export default GuestMore;
