import { Link } from "react-router-dom";
import { ChevronRight, Headphones, LogIn, Unlock, UserPlus } from "lucide-react";
import {
  GuestBenefitCard,
  GuestBlueButton,
  GuestDesktopHero,
  GuestDesktopSectionHeading,
  GuestDesktopShell,
  GuestGoldButton,
  GuestSurface,
} from "@/components/guest/GuestDesktopChrome";
import { GUEST_ART } from "@/lib/guestIllustrations";

const PILLS = [
  { art: GUEST_ART.trackProgress, label: "Track progress" },
  { art: GUEST_ART.saveClasses, label: "Save classes" },
  { art: GUEST_ART.personaliseHome, label: "Personalise home" },
];

const UNLOCKS = [
  {
    art: GUEST_ART.progressTracking,
    title: "Progress tracking",
    description: "See how you’re improving",
  },
  {
    art: GUEST_ART.classBookmark,
    title: "Class bookmarks",
    description: "Save and revisit your classes",
  },
  {
    art: GUEST_ART.timetable,
    title: "Timetable sync",
    description: "Keep your study on track",
  },
  {
    art: GUEST_ART.personalisation,
    title: "Personalisation",
    description: "A home that fits your learning",
  },
];

const SUPPORT_ROWS = [
  {
    art: GUEST_ART.supportChat,
    title: "Help & support",
    description: "Find answers to common questions",
    to: "/support",
  },
  {
    art: GUEST_ART.contactPhone,
    title: "Contact centre",
    description: "Get in touch with your tuition centre",
    to: "/support",
  },
  {
    art: GUEST_ART.privacyShield,
    title: "Privacy policy",
    description: "Learn how we protect your data",
    to: "/privacy",
  },
];

/** Desktop guest Profile — sign-in pitch, unlock grid, support links. */
export function GuestProfileDesktop() {
  return (
    <GuestDesktopShell>
      <GuestDesktopHero
        title="Profile"
        subtitle={
          <>
            Sign in to manage your
            <br />
            learning account
          </>
        }
        compact
      />

      <GuestSurface className="p-7">
        <div className="flex items-center gap-8">
          <div className="relative shrink-0">
            <span className="flex h-[188px] w-[188px] items-center justify-center rounded-full bg-[hsl(213_100%_96%)]">
              <img
                src={GUEST_ART.studentHero}
                alt=""
                aria-hidden="true"
                draggable={false}
                className="h-[168px] w-[168px] object-contain"
              />
            </span>
            <img
              src={GUEST_ART.star}
              alt=""
              aria-hidden="true"
              draggable={false}
              className="pointer-events-none absolute -left-1 top-2 h-12 w-12"
            />
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="text-[30px] font-extrabold leading-tight text-slate-900">
              A smarter way to learn
            </h2>
            <p className="mt-2 max-w-[46ch] text-[16px] leading-snug text-slate-500">
              Sign in to sync your progress, save your classes and personalise your learning
              experience.
            </p>

            <ul className="mt-4 flex flex-wrap gap-3">
              {PILLS.map((pill) => (
                <li
                  key={pill.label}
                  className="flex items-center gap-2 rounded-full border border-white bg-white/90 px-4 py-2 shadow-[0_6px_18px_rgba(15,23,42,0.05)]"
                >
                  <img
                    src={pill.art}
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                    loading="lazy"
                    className="h-7 w-7 object-contain"
                  />
                  <span className="text-[14.5px] font-semibold text-slate-700">{pill.label}</span>
                </li>
              ))}
            </ul>

            <div className="mt-5 flex flex-wrap gap-4">
              <GuestBlueButton
                to="/auth"
                size="lg"
                className="min-w-[280px]"
                icon={<LogIn className="h-5 w-5" aria-hidden="true" />}
              >
                Sign in
              </GuestBlueButton>
              <GuestGoldButton to="/invite" size="lg" className="min-w-[280px]">
                <UserPlus className="h-5 w-5" aria-hidden="true" />
                Create account
              </GuestGoldButton>
            </div>
          </div>
        </div>
      </GuestSurface>

      <section>
        <GuestDesktopSectionHeading
          icon={<Unlock className="h-[18px] w-[18px]" aria-hidden="true" />}
          title="What you unlock"
        />
        <div className="grid grid-cols-4 gap-5">
          {UNLOCKS.map((item) => (
            <GuestBenefitCard key={item.title} {...item} orientation="vertical" />
          ))}
        </div>
      </section>

      <section>
        <GuestDesktopSectionHeading
          icon={<Headphones className="h-[18px] w-[18px]" aria-hidden="true" />}
          title="Account & support"
        />
        <GuestSurface className="divide-y divide-slate-100 px-2 py-1">
          {SUPPORT_ROWS.map((row) => (
            <Link
              key={row.title}
              to={row.to}
              className="flex min-h-[72px] items-center gap-4 rounded-2xl px-4 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <img
                src={row.art}
                alt=""
                aria-hidden="true"
                draggable={false}
                loading="lazy"
                className="h-11 w-11 shrink-0 object-contain"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[16.5px] font-bold text-slate-900">{row.title}</span>
                <span className="block text-[13.5px] text-slate-500">{row.description}</span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
            </Link>
          ))}
        </GuestSurface>
      </section>
    </GuestDesktopShell>
  );
}

export default GuestProfileDesktop;
