import { GuestCard, GuestMobileHero, GuestPage, GuestPrimaryButton } from "@/components/guest/GuestChrome";
import { GUEST_ART } from "@/lib/guestIllustrations";

/**
 * Public help page for signed-out visitors. Contains no centre-specific or
 * personal data — students with an account get support inside the app.
 */
export function GuestSupport() {
  return (
    <GuestPage>
      <GuestMobileHero
        title="Help & support"
        subtitle="Answers for getting into your Aras A+ account."
        art={GUEST_ART.helpHeadset}
      />

      <GuestCard className="space-y-4 p-4">
        <div>
          <h2 className="text-[15.5px] font-bold text-slate-900">How do I get an account?</h2>
          <p className="mt-1 text-[13px] leading-snug text-slate-600">
            Accounts are created by your tuition centre. Once they add you, you receive an invite
            link by email — open it to set up your sign-in.
          </p>
        </div>
        <div id="contact" className="scroll-mt-24">
          <h2 className="text-[15.5px] font-bold text-slate-900">Contact your centre</h2>
          <p className="mt-1 text-[13px] leading-snug text-slate-600">
            For enrolment, fees or class changes, message the tuition centre you registered with —
            they manage classes and access directly.
          </p>
        </div>
        <div id="privacy" className="scroll-mt-24">
          <h2 className="text-[15.5px] font-bold text-slate-900">Privacy</h2>
          <p className="mt-1 text-[13px] leading-snug text-slate-600">
            Class materials, progress and messages are private to enrolled students and their
            centre. Nothing personal is shown on these public pages.
          </p>
        </div>
        <GuestPrimaryButton to="/auth" className="w-full">
          Sign in
        </GuestPrimaryButton>
      </GuestCard>
    </GuestPage>
  );
}

export default GuestSupport;
