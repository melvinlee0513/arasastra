import { useIsGuestDesktop } from "@/components/guest/GuestDesktopChrome";
import { GuestProfileDesktop } from "@/pages/guest/desktop/GuestProfileDesktop";
import { Link } from "react-router-dom";
import { ChevronRight, Gift, LifeBuoy } from "lucide-react";
import {
  GuestCard,
  GuestFeatureCard,
  GuestMobileHero,
  GuestPage,
  GuestPrimaryButton,
  GuestSectionHeader,
} from "@/components/guest/GuestChrome";
import { GUEST_ART } from "@/lib/guestIllustrations";

const UNLOCKS = [
  {
    art: GUEST_ART.trackProgress,
    title: "Track progress",
    description: "XP, streaks and weekly leaderboards.",
  },
  {
    art: GUEST_ART.saveClasses,
    title: "Save classes",
    description: "Bookmark the classes you study most.",
  },
  {
    art: GUEST_ART.personaliseHome,
    title: "Personalise Home",
    description: "Pick your own Home card colour.",
  },
  {
    art: GUEST_ART.progressTracking,
    title: "Stay on schedule",
    description: "Next-class reminders and timetable sync.",
  },
];

const SUPPORT_ROWS = [
  { art: GUEST_ART.supportChat, title: "Help & support", to: "/support" },
  { art: GUEST_ART.contactPhone, title: "Contact your centre", to: "/support#contact" },
  { art: GUEST_ART.privacyShield, title: "Privacy policy", to: "/support#privacy" },
];

/**
 * Guest mobile Profile page — no personal data exists yet, so the page sells
 * the account and routes visitors to sign-in, invites and support.
 */
function GuestProfileMobile() {
  return (
    <GuestPage>
      <GuestMobileHero
        title="Profile"
        subtitle="Sign in to see your account, XP and personalisation."
        layout="text-only"
      />

      <GuestCard className="overflow-hidden p-4">
        <div className="flex items-center gap-3">
          <img
            src={GUEST_ART.studentHero}
            alt=""
            aria-hidden="true"
            draggable={false}
            loading="lazy"
            className="h-[86px] w-[86px] shrink-0"
          />
          <div className="min-w-0">
            <h2 className="text-[18px] font-extrabold leading-tight text-slate-900">
              A smarter way to learn
            </h2>
            <p className="mt-1 text-[12.5px] leading-snug text-slate-500">
              Your centre creates your account — sign in, or open the invite link they sent you.
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-2.5">
          <GuestPrimaryButton to="/auth" className="w-full">
            Sign in
          </GuestPrimaryButton>
          <Link
            to="/invite"
            className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-full border border-slate-200 bg-white text-[15px] font-semibold text-slate-700 transition-transform active:scale-[0.98] motion-reduce:transition-none"
          >
            I have an invite link
          </Link>
        </div>
      </GuestCard>

      <section>
        <GuestSectionHeader
          icon={<Gift className="h-4 w-4" aria-hidden="true" />}
          title="What you unlock"
        />
        <div className="grid grid-cols-2 gap-3">
          {UNLOCKS.map((item) => (
            <GuestFeatureCard key={item.title} {...item} />
          ))}
        </div>
      </section>

      <section>
        <GuestSectionHeader
          icon={<LifeBuoy className="h-4 w-4" aria-hidden="true" />}
          title="Account & support"
        />
        <GuestCard className="divide-y divide-slate-100 p-1.5">
          {SUPPORT_ROWS.map((row) => (
            <Link
              key={row.title}
              to={row.to}
              className="flex items-center gap-3 rounded-2xl px-2.5 py-3 transition-colors active:bg-slate-50"
            >
              <img
                src={row.art}
                alt=""
                aria-hidden="true"
                draggable={false}
                loading="lazy"
                className="h-9 w-9 shrink-0"
              />
              <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold text-slate-900">
                {row.title}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            </Link>
          ))}
        </GuestCard>
      </section>
    </GuestPage>
  );
}



/**
 * Guest Profile entry — renders the desktop sidebar layout from
 * 1024px up and the mobile guest layout below it.
 */
export function GuestProfile() {
  const isDesktop = useIsGuestDesktop();
  return isDesktop ? <GuestProfileDesktop /> : <GuestProfileMobile />;
}

export default GuestProfile;
