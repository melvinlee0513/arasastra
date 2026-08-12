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
    <ClassHubPanel className={cn("px-6 py-10 sm:py-14 text-center", className)}>
      <Decor art="cloud" className="-left-6 top-4 w-24 opacity-50" />
      <Decor art="orbs" className="-right-8 bottom-0 w-28 opacity-40" />
      <div className="relative mx-auto mb-5 flex h-28 w-28 items-center justify-center">
        <span
          aria-hidden
          className="absolute inset-0 rounded-full bg-primary/10 blur-[2px]"
        />
        <span
          aria-hidden
          className="absolute inset-3 rounded-full bg-white/70"
        />
        <Illustration src={art} className="relative h-20 w-20 drop-shadow-[0_10px_18px_rgba(15,23,42,0.16)]" />
      </div>
      <h2 className="relative text-[17px] font-bold text-slate-900">{title}</h2>
      {description && (
        <p className="relative mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-slate-500">
          {description}
        </p>
      )}
      {action && <div className="relative mt-5 flex justify-center">{action}</div>}
    </ClassHubPanel>
  );
}
