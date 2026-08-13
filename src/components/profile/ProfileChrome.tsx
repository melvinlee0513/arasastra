import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PROFILE_ART } from "@/lib/studentIllustrations";

/**
 * Presentation primitives for the student Profile page.
 *
 * Purely visual — no data, auth or personalisation logic lives here. Shares the
 * soft-3D "premium playful" language used by the Class Hub and the other
 * student service pages.
 */

/** Free-standing decorative illustration. Never interactive, never announced. */
export function ProfileDecor({
  src,
  className,
}: {
  src: string;
  className?: string;
}) {
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      className={cn("pointer-events-none select-none object-contain", className)}
    />
  );
}

/** Soft-3D artwork inside a rounded tinted bubble (section/row marks). */
export function ProfileArtBubble({
  src,
  size = "md",
  className,
}: {
  src: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const box =
    size === "lg" ? "h-12 w-12 rounded-[18px]" : size === "sm" ? "h-9 w-9 rounded-[13px]" : "h-11 w-11 rounded-2xl";
  const art = size === "lg" ? "h-8 w-8" : size === "sm" ? "h-[22px] w-[22px]" : "h-7 w-7";
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center bg-primary/5 ring-1 ring-inset ring-white shadow-[0_3px_12px_rgba(15,23,42,0.07)]",
        box,
        className,
      )}
    >
      <img
        src={src}
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
        className={cn("object-contain drop-shadow-[0_2px_4px_rgba(15,23,42,0.16)]", art)}
      />
    </span>
  );
}

/** Pale cool-blue page canvas with restrained pastel glow. */
export function ProfilePage({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-[linear-gradient(180deg,#f5f8ff_0%,#f9fbff_45%,#f4f7fd_100%)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[340px] bg-[radial-gradient(120%_100%_at_50%_0%,rgba(99,102,241,0.10),transparent_70%)]"
      />
      <div className="relative mx-auto w-full max-w-xl px-4 pb-10 sm:px-5 md:max-w-2xl md:px-6">{children}</div>
    </div>
  );
}

/** Expressive page header with an intentional floating decor composition. */
export function ProfileHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header
      className="relative"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 22px)" }}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <ProfileDecor src={PROFILE_ART.orb} className="absolute left-0 top-3 h-2.5 w-2.5 opacity-80" />
        <ProfileDecor src={PROFILE_ART.starYellow} className="absolute right-[22%] top-2 h-9 w-9 sm:h-11 sm:w-11" />
        <ProfileDecor src={PROFILE_ART.orb} className="absolute right-[34%] top-14 h-4 w-4 opacity-90" />
        <ProfileDecor src={PROFILE_ART.sparklePurple} className="absolute right-[15%] top-14 h-6 w-6" />
        <ProfileDecor src={PROFILE_ART.cloudSoftBlue} className="absolute -right-2 top-6 h-14 w-20 opacity-90 sm:h-16 sm:w-24" />
      </div>
      <div className="relative pb-5">
        <h1 className="text-[34px] font-extrabold leading-[1.05] tracking-[-0.035em] text-[#0F172A] sm:text-[38px]">
          {title}
        </h1>
        <p className="mt-1 text-[14.5px] leading-snug text-slate-500">{subtitle}</p>
      </div>
    </header>
  );
}

/** Shared major card surface. */
export const PROFILE_CARD =
  "rounded-[28px] border border-sky-100/90 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.06)]";

/** Section card with an illustrated heading. */
export function ProfileSectionCard({
  art,
  title,
  accentArt,
  children,
  showSparkle,
}: {
  art: string;
  title: string;
  accentArt?: string;
  showSparkle?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={cn("relative overflow-hidden p-3.5 sm:p-4", PROFILE_CARD)}>
      <div className="relative mb-3 flex items-center gap-3 px-0.5 pt-1">
        <ProfileArtBubble src={art} size="lg" className="bg-white shadow-[0_4px_14px_rgba(15,23,42,0.08)]" />
        <h2 className="flex min-w-0 items-center gap-1.5 text-[19px] font-bold tracking-[-0.02em] text-[#0F172A]">
          <span className="truncate">{title}</span>
          {showSparkle && (
            <ProfileDecor src={PROFILE_ART.sparklePurple} className="h-4 w-4 shrink-0 opacity-90" />
          )}
        </h2>
        {accentArt && (
          <ProfileDecor
            src={accentArt}
            className="pointer-events-none absolute -right-1 -top-1 h-14 w-14 opacity-95 sm:h-16 sm:w-16"
          />
        )}
      </div>
      {children}
    </section>
  );
}

/** Rounded metadata chip with a soft-3D icon. */
export function ProfileMetaChip({
  art,
  children,
  tone = "blue",
}: {
  art: string;
  children: ReactNode;
  tone?: "blue" | "lavender";
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-[13.5px] font-semibold",
        tone === "blue"
          ? "border-sky-100 bg-sky-50/80 text-sky-700"
          : "border-violet-100 bg-violet-50/80 text-violet-700",
      )}
    >
      <img
        src={art}
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
        className="pointer-events-none h-[18px] w-[18px] shrink-0 object-contain"
      />
      <span className="truncate">{children}</span>
    </span>
  );
}

/** Full-row account action with a 3D badge, generous height and chevron. */
export function AccountActionRow({
  art,
  label,
  onClick,
  destructive,
  trailing,
}: {
  art: string;
  label: string;
  onClick: () => void;
  destructive?: boolean;
  trailing: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full min-h-[60px] items-center gap-3 rounded-2xl px-2.5 py-3 text-left transition-transform duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        "active:scale-[0.985] motion-reduce:transition-none motion-reduce:active:scale-100",
        destructive ? "active:bg-destructive/5" : "active:bg-sky-50/70",
      )}
    >
      <ProfileArtBubble
        src={art}
        className={destructive ? "bg-red-50" : "bg-sky-50"}
      />
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-[15.5px] font-semibold",
          destructive ? "text-destructive" : "text-[#0F172A]",
        )}
      >
        {label}
      </span>
      {trailing}
    </button>
  );
}

/** Subtle, low-priority footer decor + version line. */
export function ProfileFooterDecor({ version }: { version: string }) {
  return (
    <div className="relative mt-7 pb-2">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <ProfileDecor src={PROFILE_ART.orb} className="absolute -left-2 bottom-0 h-9 w-9 opacity-80" />
        <ProfileDecor src={PROFILE_ART.sparklePurple} className="absolute -right-1 bottom-1 h-9 w-9 opacity-85" />
      </div>
      <p className="relative text-center text-[12.5px] text-slate-400">{version}</p>
    </div>
  );
}
