import { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { ChevronRight, Eye, Home, LayoutGrid, Lock, BookOpen, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { GUEST_ART, GUEST_DECOR_IMG_PROPS, type GuestCtaBanner } from "@/lib/guestIllustrations";

/* ------------------------------------------------------------------ page */

/**
 * Guest page shell — pale-blue canvas, mobile-first vertical rhythm and
 * bottom-nav clearance. Rendered only for signed-out visitors.
 */
export function GuestPage({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-[hsl(214_100%_97%)]">
      <div className="mx-auto w-full max-w-[440px] space-y-7 px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(112px+env(safe-area-inset-bottom))]">
        {children}
      </div>
      <GuestBottomNav />
    </div>
  );
}

/* ------------------------------------------------------------------ hero */

interface GuestMobileHeroProps {
  title: string;
  subtitle: string;
  art?: string;
  artAlt?: string;
  /** Optional yellow CTA rendered under the subtitle. */
  action?: ReactNode;
  /** Title-only hero (Profile) drops the illustration column. */
  layout?: "with-art" | "text-only";
}

export function GuestMobileHero({
  title,
  subtitle,
  art,
  artAlt = "",
  action,
  layout = "with-art",
}: GuestMobileHeroProps) {
  return (
    <section className="relative isolate overflow-hidden [border-radius:28px] border border-white/80 bg-gradient-to-br from-[hsl(214_100%_96%)] via-[hsl(213_100%_98%)] to-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
      <img
        src={GUEST_ART.cloudCluster}
        className="pointer-events-none absolute -right-6 -top-3 w-28 opacity-90"
        {...GUEST_DECOR_IMG_PROPS}
      />
      <img
        src={GUEST_ART.star}
        className="pointer-events-none absolute right-24 top-6 w-6 opacity-90"
        {...GUEST_DECOR_IMG_PROPS}
      />
      <img
        src={GUEST_ART.orb}
        className="pointer-events-none absolute bottom-3 right-6 w-10 opacity-80"
        {...GUEST_DECOR_IMG_PROPS}
      />

      <div className={cn("relative flex items-center gap-3", layout === "text-only" && "min-h-[120px]")}>
        {layout === "with-art" && art && (
          <img
            src={art}
            alt={artAlt}
            aria-hidden={artAlt ? undefined : true}
            draggable={false}
            className="w-[104px] shrink-0 drop-shadow-[0_10px_18px_rgba(15,23,42,0.12)]"
          />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-[30px] font-extrabold leading-tight tracking-tight text-slate-900">
            {title}
          </h1>
          <p className="mt-1 text-[14px] leading-snug text-slate-500">{subtitle}</p>
          {action && <div className="mt-3">{action}</div>}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- buttons */

export function GuestPrimaryButton({
  to,
  children,
  className,
}: {
  to: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "inline-flex min-h-[46px] items-center justify-center gap-2 rounded-full bg-primary px-5",
        "text-[15px] font-semibold text-primary-foreground",
        "shadow-[0_8px_20px_rgba(37,99,235,0.28)] transition-transform active:scale-[0.97] motion-reduce:transition-none",
        className,
      )}
    >
      {children}
      <ChevronRight className="h-4 w-4" aria-hidden="true" />
    </Link>
  );
}

export function GuestAccentButton({
  to,
  children,
  className,
}: {
  to: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "inline-flex min-h-[46px] items-center justify-center gap-2 rounded-full px-5",
        "bg-gradient-to-b from-[hsl(45_98%_62%)] to-[hsl(38_95%_53%)] text-[15px] font-bold text-[hsl(28_60%_18%)]",
        "shadow-[0_8px_20px_rgba(217,145,20,0.32)] transition-transform active:scale-[0.97] motion-reduce:transition-none",
        className,
      )}
    >
      {children}
      <ChevronRight className="h-4 w-4" aria-hidden="true" />
    </Link>
  );
}

/* ---------------------------------------------------------- section header */

export function GuestSectionHeader({
  icon,
  title,
  actionLabel,
  actionTo,
}: {
  icon?: ReactNode;
  title: string;
  actionLabel?: string;
  actionTo?: string;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3 px-0.5">
      <div className="flex min-w-0 items-center gap-2">
        {icon && (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[0_6px_14px_rgba(37,99,235,0.28)]">
            {icon}
          </span>
        )}
        <h2 className="truncate text-[17px] font-bold text-slate-900">{title}</h2>
      </div>
      {actionLabel && actionTo && (
        <Link
          to={actionTo}
          className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-primary"
        >
          {actionLabel}
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ cards */

export function GuestCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-slate-200/70 bg-white/90 shadow-[0_8px_26px_rgba(15,23,42,0.05)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Compact illustrated feature card (Why join / What you unlock). */
export function GuestFeatureCard({
  art,
  title,
  description,
  className,
}: {
  art: string;
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <GuestCard className={cn("flex flex-col items-start gap-2 p-3.5", className)}>
      <img src={art} alt="" aria-hidden="true" draggable={false} loading="lazy" className="h-12 w-12" />
      <p className="text-[13px] font-bold leading-tight text-slate-900">{title}</p>
      <p className="text-[11.5px] leading-snug text-slate-500">{description}</p>
    </GuestCard>
  );
}

/** Locked (or preview-only) service row used on the guest More page. */
export function GuestLockedServiceRow({
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
      className="block rounded-3xl border border-slate-200/70 bg-white/90 p-3.5 shadow-[0_8px_26px_rgba(15,23,42,0.05)] transition-transform active:scale-[0.99] motion-reduce:transition-none"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[hsl(214_100%_96%)]">
          <img src={art} alt="" aria-hidden="true" draggable={false} loading="lazy" className="h-10 w-10" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-bold leading-tight text-slate-900">{title}</p>
          <p className="mt-0.5 truncate text-[12.5px] text-slate-500">{description}</p>
          <p className="mt-1 flex items-center gap-1.5 text-[12.5px] font-semibold text-primary">
            {locked ? (
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {label}
          </p>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
          {locked ? (
            <Lock className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          )}
        </span>
      </div>
    </Link>
  );
}

/* -------------------------------------------------------------------- CTA */

/**
 * Mobile guest CTA — the WebP asset *is* the banner. The wrapper adopts the
 * asset's natural aspect ratio and stays transparent, so there is no second
 * navy card, no stretching and no letterboxing. HTML text and the pill button
 * are layered inside the artwork-free zone declared by the asset config.
 */
export function GuestCTA({
  title,
  body,
  ctaLabel,
  ctaTo = "/auth",
  banner,
}: {
  title: string;
  body: string;
  ctaLabel: string;
  ctaTo?: string;
  banner: GuestCtaBanner;
}) {
  return (
    <Link
      to={ctaTo}
      className="relative block w-full overflow-hidden bg-transparent transition-transform active:scale-[0.99] motion-reduce:transition-none"
      style={{ aspectRatio: `${banner.ratio}` }}
    >
      <img
        src={banner.url}
        className="absolute inset-0 h-full w-full select-none object-contain"
        {...GUEST_DECOR_IMG_PROPS}
        loading="lazy"
      />
      <div
        className="absolute inset-0 flex flex-col justify-center gap-[2px] py-1.5"
        style={{ paddingLeft: banner.insetLeft, paddingRight: banner.insetRight }}
      >
        <p className="text-[11px] font-extrabold leading-[1.1] text-white">{title}</p>
        <p className="line-clamp-1 text-[9px] leading-[1.2] text-white/85">{body}</p>
        <span className="mt-[2px] inline-flex w-fit items-center gap-1 rounded-full bg-[hsl(43_96%_56%)] px-2.5 py-[4px] text-[9.5px] font-bold text-[hsl(222_47%_13%)] shadow-[0_4px_12px_rgba(15,23,42,0.28)]">
          {ctaLabel}
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
        </span>
      </div>

    </Link>
  );
}



/* ------------------------------------------------------------ bottom nav */

const GUEST_TABS = [
  { to: "/", label: "Home", icon: Home },
  { to: "/more", label: "More", icon: LayoutGrid },
  { to: "/study", label: "Study", icon: BookOpen },
  { to: "/profile", label: "Profile", icon: User },
];

/**
 * Guest bottom navigation — the same four destinations as the student tab bar,
 * pointing at the public guest routes.
 */
export function GuestBottomNav() {
  return (
    <nav
      aria-label="Guest navigation"
      className={cn(
        "fixed z-[60] left-3 right-3 mx-auto w-auto max-w-[420px]",
        "bottom-[calc(0.625rem+env(safe-area-inset-bottom))]",
        "h-[68px] rounded-full border border-white/80 bg-white/92 backdrop-blur-xl",
        "shadow-[0_10px_30px_rgba(15,23,42,0.14),inset_0_1px_0_rgba(255,255,255,0.9)]",
      )}
    >
      <div className="flex h-full items-stretch px-1.5">
        {GUEST_TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end
            className={({ isActive }) =>
              cn(
                "relative flex flex-1 basis-0 flex-col items-center justify-center gap-[3px]",
                "min-h-[44px] min-w-0 rounded-full transition-all duration-200 active:scale-95 motion-reduce:transition-none",
                isActive ? "text-primary" : "text-slate-500",
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-[6px] inset-x-1 rounded-[22px] bg-primary/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]"
                  />
                )}
                <tab.icon
                  className={cn("relative", isActive ? "h-[23px] w-[23px]" : "h-[21px] w-[21px]")}
                  strokeWidth={isActive ? 2.4 : 2}
                  aria-hidden="true"
                />
                <span className={cn("relative text-[11px] leading-none", isActive ? "font-bold" : "font-medium")}>
                  {tab.label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
