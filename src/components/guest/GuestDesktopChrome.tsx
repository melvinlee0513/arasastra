import { ReactNode, useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { ChevronRight, Eye, Home, LayoutGrid, Lock, BookOpen, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { GUEST_ART, GUEST_DECOR_IMG_PROPS } from "@/lib/guestIllustrations";
import owlMascot from "@/assets/owl-mascot.png";

/** Desktop guest shell breakpoint — sidebar layout from 1024px up. */
export const GUEST_DESKTOP_BREAKPOINT = 1024;

export function useIsGuestDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${GUEST_DESKTOP_BREAKPOINT}px)`);
    const onChange = () => setIsDesktop(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isDesktop;
}

/* --------------------------------------------------------------- sidebar */

const NAV = [
  { to: "/", label: "Home", icon: Home },
  { to: "/more", label: "More", icon: LayoutGrid },
  { to: "/study", label: "Study", icon: BookOpen },
  { to: "/profile", label: "Profile", icon: User },
];

/** Light guest sidebar — brand mark plus the four public destinations. */
export function GuestDesktopSidebar() {
  return (
    <aside className="fixed inset-y-4 left-4 z-40 flex w-[232px] flex-col overflow-hidden rounded-[28px] border border-white/80 bg-white/85 shadow-[0_16px_40px_rgba(15,23,42,0.07)] backdrop-blur-xl">
      <div className="flex items-center gap-2.5 px-4 pb-5 pt-5">
        <img
          src={owlMascot}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="h-11 w-11 object-contain"
        />
        <div className="min-w-0">
          <p className="text-[19px] font-extrabold leading-tight text-slate-900">Aras A+</p>
          <p className="text-[12px] font-medium text-primary/80">Learning Platform</p>
        </div>
      </div>

      <nav aria-label="Guest navigation" className="flex flex-col gap-1.5 px-3">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end
            className={({ isActive }) =>
              cn(
                "flex min-h-[48px] items-center gap-3 rounded-2xl px-3.5 text-[15.5px] transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                isActive
                  ? "bg-primary/10 font-bold text-primary"
                  : "font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700",
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icon
                  className="h-[21px] w-[21px] shrink-0"
                  strokeWidth={isActive ? 2.4 : 2}
                  aria-hidden="true"
                />
                <span className="truncate">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="relative mt-auto h-40">
        <img
          src={GUEST_ART.orb}
          className="pointer-events-none absolute left-6 top-2 w-8 opacity-80"
          {...GUEST_DECOR_IMG_PROPS}
        />
        <img
          src={GUEST_ART.cloudCluster}
          className="pointer-events-none absolute -left-3 bottom-2 w-40 opacity-95"
          {...GUEST_DECOR_IMG_PROPS}
        />
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ shell */

export function GuestDesktopShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-[hsl(213_100%_97%)]">
      <GuestDesktopSidebar />
      <main className="ml-[264px] px-6 py-4 xl:px-8">
        <div className="mx-auto w-full max-w-[1240px] space-y-6">{children}</div>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------- hero */

interface GuestDesktopHeroProps {
  title: string;
  subtitle: ReactNode;
  art?: string;
  action?: ReactNode;
  /** Title-only hero (Profile) skips the illustration column. */
  compact?: boolean;
}

export function GuestDesktopHero({
  title,
  subtitle,
  art,
  action,
  compact = false,
}: GuestDesktopHeroProps) {
  return (
    <section className="relative isolate overflow-hidden rounded-[32px] border border-white/80 bg-gradient-to-r from-[hsl(213_100%_95%)] via-[hsl(212_100%_97%)] to-white shadow-[0_14px_40px_rgba(15,23,42,0.06)]">
      {/* Ambient art — clouds, orbs and stars only. */}
      <img
        src={GUEST_ART.cloudCluster}
        className="pointer-events-none absolute -right-4 top-1 w-48 opacity-95"
        {...GUEST_DECOR_IMG_PROPS}
      />
      <img
        src={GUEST_ART.orb}
        className="pointer-events-none absolute bottom-5 right-[10%] w-10 opacity-75"
        {...GUEST_DECOR_IMG_PROPS}
      />
      <img
        src={GUEST_ART.star}
        className="pointer-events-none absolute right-[24%] top-7 w-8 opacity-90"
        {...GUEST_DECOR_IMG_PROPS}
      />

      <div
        className={cn(
          "relative flex items-center gap-7 px-9",
          compact ? "min-h-[150px] py-7" : "min-h-[176px] py-6",
        )}
      >
        {!compact && art && (
          <img
            src={art}
            alt=""
            aria-hidden="true"
            draggable={false}
            className="h-[136px] w-[164px] shrink-0 object-contain drop-shadow-[0_14px_24px_rgba(15,23,42,0.14)]"
          />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-[40px] font-extrabold leading-[1.05] tracking-tight text-slate-900">
            {title}
          </h1>
          <p className="mt-1.5 max-w-[30ch] text-[17px] leading-snug text-slate-500">{subtitle}</p>
        </div>
        {action && <div className="relative shrink-0 pr-4">{action}</div>}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- buttons */

export function GuestGoldButton({
  to,
  children,
  size = "md",
  className,
}: {
  to: string;
  children: ReactNode;
  size?: "md" | "lg";
  className?: string;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full",
        "bg-gradient-to-b from-[hsl(45_98%_63%)] to-[hsl(38_95%_54%)] font-bold text-[hsl(28_62%_18%)]",
        "shadow-[0_12px_26px_rgba(217,145,20,0.34)] transition-transform hover:-translate-y-0.5 active:translate-y-0",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(38_95%_44%)] focus-visible:ring-offset-2",
        "motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        size === "lg" ? "min-h-[58px] px-8 text-[19px]" : "min-h-[48px] px-6 text-[16px]",
        className,
      )}
    >
      {children}
      <ChevronRight className="h-5 w-5" aria-hidden="true" />
    </Link>
  );
}

export function GuestBlueButton({
  to,
  children,
  size = "md",
  icon,
  className,
}: {
  to: string;
  children: ReactNode;
  size?: "md" | "lg";
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full bg-primary font-bold text-primary-foreground",
        "shadow-[0_12px_26px_rgba(37,99,235,0.28)] transition-transform hover:-translate-y-0.5 active:translate-y-0",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        "motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        size === "lg" ? "min-h-[56px] px-8 text-[18px]" : "min-h-[48px] px-6 text-[16px]",
        className,
      )}
    >
      {icon}
      {children}
      {!icon && <ChevronRight className="h-5 w-5" aria-hidden="true" />}
    </Link>
  );
}

/* -------------------------------------------------------- section heading */

export function GuestDesktopSectionHeading({
  icon,
  title,
  actionLabel,
  actionTo,
}: {
  icon: ReactNode;
  title: string;
  actionLabel?: string;
  actionTo?: string;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-4 px-1">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[0_8px_16px_rgba(37,99,235,0.26)]">
          {icon}
        </span>
        <h2 className="text-[20px] font-bold text-slate-900">{title}</h2>
      </div>
      {actionLabel && actionTo && (
        <Link
          to={actionTo}
          className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[14.5px] font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          {actionLabel}
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ cards */

export function GuestSurface({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-white/90 bg-white/85 shadow-[0_10px_30px_rgba(15,23,42,0.05)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Full-width service row (More page). */
export function GuestServiceRow({
  art,
  title,
  description,
  locked = true,
  to = "/auth",
  actionLabel,
}: {
  art: string;
  title: string;
  description: string;
  locked?: boolean;
  to?: string;
  actionLabel?: string;
}) {
  const label = actionLabel ?? (locked ? "Sign in to access" : "Preview only");
  return (
    <Link
      to={to}
      className="group flex min-h-[104px] items-center gap-6 rounded-3xl border border-white/90 bg-white/85 px-6 shadow-[0_10px_30px_rgba(15,23,42,0.05)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <img
        src={art}
        alt=""
        aria-hidden="true"
        draggable={false}
        loading="lazy"
        className="h-[68px] w-[68px] shrink-0 object-contain"
      />
      <div className="min-w-0 flex-1">
        <p className="text-[19px] font-bold text-slate-900">{title}</p>
        <p className="mt-0.5 text-[14.5px] text-slate-500">{description}</p>
        <p className="mt-1 flex items-center gap-1.5 text-[14px] font-semibold text-primary">
          {locked ? (
            <Lock className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Eye className="h-4 w-4" aria-hidden="true" />
          )}
          {label}
        </p>
      </div>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        {locked ? (
          <Lock className="h-[18px] w-[18px]" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        )}
      </span>
    </Link>
  );
}

/** Illustrated benefit card (Why join / What you unlock / Learning Tools). */
export function GuestBenefitCard({
  art,
  title,
  description,
  orientation = "horizontal",
  footer,
}: {
  art: string;
  title: string;
  description: string;
  orientation?: "horizontal" | "vertical";
  footer?: ReactNode;
}) {
  return (
    <GuestSurface className="flex h-full flex-col p-5">
      <div
        className={cn(
          "flex flex-1 gap-4",
          orientation === "horizontal" ? "items-center" : "flex-col items-center text-center",
        )}
      >
        <img
          src={art}
          alt=""
          aria-hidden="true"
          draggable={false}
          loading="lazy"
          className={cn(
            "shrink-0 object-contain",
            orientation === "horizontal" ? "h-[66px] w-[66px]" : "h-[76px] w-[76px]",
          )}
        />
        <div className="min-w-0">
          <p className="text-[16.5px] font-bold leading-tight text-slate-900">{title}</p>
          <p className="mt-1 text-[13.5px] leading-snug text-slate-500">{description}</p>
        </div>
      </div>
      {footer && <div className="mt-3 flex justify-end">{footer}</div>}
    </GuestSurface>
  );
}

/* -------------------------------------------------------------- CTA banner */

export function GuestDesktopCTA({
  title,
  body,
  ctaLabel,
  ctaTo,
  banner,
}: {
  title: string;
  body: ReactNode;
  ctaLabel: string;
  ctaTo: string;
  /** Wide desktop banner artwork — rendered at its natural aspect ratio. */
  banner?: string;
}) {
  return (
    <section className="relative isolate overflow-hidden rounded-[28px] bg-[hsl(222_50%_12%)] shadow-[0_18px_44px_rgba(15,23,42,0.3)]">
      {banner ? (
        <img
          src={banner}
          className="pointer-events-none block h-auto w-full select-none"
          {...GUEST_DECOR_IMG_PROPS}
        />
      ) : null}
      <div
        className={cn(
          "flex items-center gap-8 px-[7%]",
          banner ? "absolute inset-0" : "relative py-8",
        )}
      >
        <div className="min-w-0 flex-1">
          <h2 className="text-[26px] font-extrabold leading-tight text-white drop-shadow-[0_2px_10px_rgba(2,6,23,0.55)]">
            {title}
          </h2>
          <p className="mt-1.5 max-w-[52ch] text-[15px] leading-snug text-white/80 drop-shadow-[0_2px_8px_rgba(2,6,23,0.5)]">
            {body}
          </p>
        </div>
        <GuestGoldButton to={ctaTo} size="lg" className="shrink-0">
          {ctaLabel}
        </GuestGoldButton>
      </div>
    </section>
  );
}
