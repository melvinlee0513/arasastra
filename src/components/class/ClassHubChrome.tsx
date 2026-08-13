import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { DECOR_ART } from "@/lib/classIllustrations";

/**
 * Shared soft-3D chrome primitives for the Class Hub.
 *
 * Presentation only — no data access, no role logic. Keeps the tutor, admin and
 * student class surfaces on one visual language.
 */

interface IllustrationProps {
  src: string;
  /** Empty alt + aria-hidden when the artwork is purely decorative. */
  alt?: string;
  className?: string;
  /** Eager decode for above-the-fold artwork (hero, active nav tile). */
  priority?: boolean;
}

export function Illustration({ src, alt, className, priority }: IllustrationProps) {
  const decorative = !alt;
  return (
    <img
      src={src}
      alt={alt ?? ""}
      aria-hidden={decorative || undefined}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      draggable={false}
      className={cn("select-none object-contain", className)}
    />
  );
}

/** Absolutely-positioned decorative accent. Never interactive. */
export function Decor({
  art,
  className,
}: {
  art: keyof typeof DECOR_ART;
  className?: string;
}) {
  return (
    <Illustration
      src={DECOR_ART[art]}
      className={cn("pointer-events-none absolute object-contain", className)}
    />
  );
}

/** The canonical Class Hub content surface: soft white card, deep soft shadow. */
export function ClassHubPanel({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white",
        "shadow-[0_8px_30px_rgb(0,0,0,0.04)]",
        className,
      )}
    >
      {children}
    </section>
  );
}

/**
 * Illustrated empty / unavailable state. `art` is a full illustration URL from
 * `@/lib/classIllustrations`.
 */
export function ClassHubEmptyState({
  art,
  title,
  description,
  action,
  className,
}: {
  art: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <ClassHubPanel className={cn("px-6 py-9 sm:py-12 text-center", className)}>
      {/* Decor stays in the corners, well clear of the text column. */}
      <Decor art="cloud" className="left-2 top-3 w-12 opacity-40" />
      <Decor art="orbs" className="right-2 top-2 w-11 opacity-25" />
      <div className="relative mx-auto mb-4 flex h-24 w-24 items-center justify-center">
        <span
          aria-hidden
          className="absolute inset-0 rounded-full bg-hub-tint"
        />
        <span
          aria-hidden
          className="absolute inset-[10px] rounded-full bg-hub-tint-strong"
        />
        <Illustration src={art} className="relative h-16 w-16 drop-shadow-[0_8px_16px_rgba(15,23,42,0.14)]" />
      </div>
      <h2 className="relative text-[17px] font-bold text-slate-900">{title}</h2>
      {description && (
        <p className="relative mx-auto mt-1.5 max-w-[17rem] sm:max-w-sm text-[13.5px] leading-relaxed text-slate-500">
          {description}
        </p>
      )}
      {action && <div className="relative mt-5 flex justify-center">{action}</div>}
    </ClassHubPanel>
  );
}

