import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { DECOR_ART } from "@/lib/studentIllustrations";

/**
 * Shared presentation primitives for the student service pages
 * (More, Inbox, Achievements, Timetable). Purely visual — no data logic.
 */

/** Free-standing decorative illustration. Never interactive, never announced. */
export function DecorArt({
  src,
  className,
  style,
}: {
  src: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      style={style}
      className={cn("pointer-events-none select-none object-contain", className)}
    />
  );
}

/**
 * Soft-3D artwork inside a rounded tinted bubble — the shared header/card mark
 * across the student service pages.
 */
export function ServiceArtBubble({
  src,
  className,
  size = "md",
  eager,
}: {
  src: string;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  eager?: boolean;
}) {
  const dims =
    size === "xl"
      ? "h-[58px] w-[58px] rounded-[22px] md:h-16 md:w-16"
      : size === "lg"
        ? "h-14 w-14 rounded-[20px]"
        : size === "sm"
          ? "h-9 w-9 rounded-[13px]"
          : "h-11 w-11 rounded-[16px]";
  const art =
    size === "xl"
      ? "h-[46px] w-[46px]"
      : size === "lg"
        ? "h-[38px] w-[38px]"
        : size === "sm"
          ? "h-[24px] w-[24px]"
          : "h-[30px] w-[30px]";
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center shadow-[0_3px_12px_rgba(15,23,42,0.07)]",
        dims,
        className,
      )}
    >
      <img
        src={src}
        alt=""
        aria-hidden="true"
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        className={cn("object-contain drop-shadow-[0_2px_4px_rgba(15,23,42,0.16)]", art)}
      />
    </span>
  );
}

/** Page canvas: soft blue-white gradient with a restrained pastel glow. */
export function ServicePage({
  children,
  className,
  maxWidth = "max-w-3xl",
}: {
  children: ReactNode;
  className?: string;
  maxWidth?: string;
}) {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[linear-gradient(180deg,#f7faff_0%,#f9fbff_45%,#f6f8fd_100%)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[320px] bg-[radial-gradient(120%_100%_at_50%_0%,rgba(99,102,241,0.10),transparent_70%)]"
      />
      <div
        className={cn("relative mx-auto w-full px-4 pb-8 md:px-6", maxWidth, className)}
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)" }}
      >
        {children}
      </div>
    </div>
  );
}

/** Large illustrated page header with soft decorative accents. */
export function ServiceHeader({
  art,
  title,
  subtitle,
  bubbleClassName,
  trailing,
}: {
  art: string;
  title: string;
  subtitle?: ReactNode;
  bubbleClassName?: string;
  trailing?: ReactNode;
}) {
  return (
    <header className="relative mb-5 overflow-hidden rounded-[26px] border border-white/70 bg-white/80 px-4 py-4 shadow-[0_8px_28px_rgba(15,23,42,0.06)] backdrop-blur-sm">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <DecorArt src={DECOR_ART.orb} className="absolute -right-6 -top-8 h-24 w-24 opacity-[0.16]" />
        <DecorArt src={DECOR_ART.star} className="absolute right-16 top-2 h-6 w-6 opacity-40" />
        <DecorArt src={DECOR_ART.sparkleStar} className="absolute bottom-1 right-2 h-8 w-8 opacity-25" />
      </div>
      <div className="relative flex items-center gap-3.5">
        <ServiceArtBubble
          src={art}
          size="lg"
          eager
          className={cn("bg-primary/5 ring-1 ring-inset ring-white", bubbleClassName)}
        />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[24px] font-bold leading-tight tracking-[-0.02em] text-slate-900 md:text-3xl">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-0.5 text-[13px] leading-snug text-slate-500 md:text-sm">{subtitle}</p>
          )}
        </div>
        {trailing}
      </div>
    </header>
  );
}

/** Section heading with a soft decorative squiggle underline. */
export function ServiceSectionHeading({
  title,
  icon,
  action,
}: {
  title: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3 px-0.5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="truncate text-[18px] font-bold tracking-[-0.01em] text-slate-900">{title}</h2>
        </div>
        <svg
          aria-hidden="true"
          width="86"
          height="7"
          viewBox="0 0 86 7"
          fill="none"
          className="mt-1 text-primary/35"
        >
          <path
            d="M1 4.2c8-3.6 16-3.6 24 0s16 3.6 24 0 16-3.6 24 0"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>
      </div>
      {action}
    </div>
  );
}

/** Shared card surface for the service pages. */
export const SERVICE_CARD =
  "rounded-[24px] border border-slate-200/70 bg-white shadow-[0_6px_22px_rgba(15,23,42,0.06)]";

/** Entrance animation utility — respects prefers-reduced-motion via Tailwind. */
export function ServiceReveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <div
      className={cn("animate-fade-in motion-reduce:animate-none", className)}
      style={{ animationDelay: `${delay}ms`, animationFillMode: "backwards" }}
    >
      {children}
    </div>
  );
}

/** Decorative cloud + paper-plane footer composition. */
export function ServiceFooterDecor() {
  return (
    <div aria-hidden="true" className="relative mt-8 h-24 overflow-hidden">
      <DecorArt src={DECOR_ART.cloud} className="absolute left-2 bottom-2 h-12 w-12 opacity-40" />
      <DecorArt src={DECOR_ART.cloudSoft} className="absolute right-4 bottom-6 h-10 w-10 opacity-30" />
      <svg
        className="absolute inset-x-8 bottom-8 h-10 w-[calc(100%-4rem)] text-primary/30"
        viewBox="0 0 200 40"
        fill="none"
        preserveAspectRatio="none"
      >
        <path
          d="M2 34C40 34 60 6 108 6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="3 7"
        />
      </svg>
      <DecorArt src={DECOR_ART.paperPlane} className="absolute right-[26%] top-2 h-10 w-10 opacity-80" />
      <DecorArt src={DECOR_ART.star} className="absolute left-[36%] top-1 h-4 w-4 opacity-50" />
    </div>
  );
}
