import { Sparkles, Users } from "lucide-react";
import {
  GuestBenefitCard,
  GuestDesktopCTA,
  GuestDesktopHero,
  GuestDesktopSectionHeading,
  GuestDesktopShell,
  GuestServiceRow,
} from "@/components/guest/GuestDesktopChrome";
import { GUEST_ART } from "@/lib/guestIllustrations";

const WHY_JOIN = [
  {
    art: GUEST_ART.scheduleClock,
    title: "Track your schedule",
    description: "Stay on top of your classes and tasks",
  },
  {
    art: GUEST_ART.materials,
    title: "Access learning materials",
    description: "Get resources anytime, anywhere",
  },
  {
    art: GUEST_ART.bell,
    title: "Stay updated",
    description: "Never miss important announcements",
  },
];

/** Desktop guest More — locked student services plus reasons to join. */
export function GuestMoreDesktop() {
  return (
    <GuestDesktopShell>
      <GuestDesktopHero
        title="More"
        subtitle={
          <>
            Everything else in your
            <br />
            learning account
          </>
        }
        art={GUEST_ART.owlBookCloud}
      />

      <section>
        <GuestDesktopSectionHeading
          icon={<Users className="h-[18px] w-[18px]" aria-hidden="true" />}
          title="Student services"
        />
        <div className="space-y-3.5">
          <GuestServiceRow
            art={GUEST_ART.inbox}
            title="Inbox"
            description="View messages from teachers and school"
          />
          <GuestServiceRow
            art={GUEST_ART.timetable}
            title="Timetable"
            description="Check your class schedule and times"
          />
          <GuestServiceRow
            art={GUEST_ART.announcements}
            title="Announcements"
            description="Important updates and school news"
          />
          <GuestServiceRow
            art={GUEST_ART.helpHeadset}
            title="Help & support"
            description="Get help and answers to your questions"
            locked={false}
            to="/support"
          />
        </div>
      </section>

      <section>
        <GuestDesktopSectionHeading
          icon={<Sparkles className="h-[18px] w-[18px]" aria-hidden="true" />}
          title="Why join Aras A+"
        />
        <div className="grid grid-cols-3 gap-5">
          {WHY_JOIN.map((item) => (
            <GuestBenefitCard key={item.title} {...item} />
          ))}
        </div>
      </section>

      <GuestDesktopCTA
        title="Unlock your student tools"
        body="Open the invite link from your centre to create your account and access all features."
        ctaLabel="Create Free Account"
        ctaTo="/invite"
        banner={GUEST_ART.learningJourneyBannerDesktop}
      />
    </GuestDesktopShell>
  );
}

export default GuestMoreDesktop;
