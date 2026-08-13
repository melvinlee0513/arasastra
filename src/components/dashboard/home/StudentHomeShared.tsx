import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, RotateCcw } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Student mobile Home primitives.
 *
 * The Home page is a playful-premium "daily learning feed": a soft off-white
 * page, white/pastel cards with large radii and low-contrast depth, and one
 * consistent section header. Each section's content adopts the visual structure
 * of the information it carries (carousel, deck, timeline, podium).
 */

/** Soft rounded icon bubble used by every section header and card. */
export function IconBubble({
  icon: Icon,
  className,
  size = "md",
}: {
  icon: LucideIcon;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const dims =
    size === "lg" ? "h-11 w-11 rounded-[16px]" : size === "sm" ? "h-8 w-8 rounded-[11px]" : "h-9 w-9 rounded-[14px]";
  const icon = size === "lg" ? "h-5 w-5" : size === "sm" ? "h-4 w-4" : "h-[18px] w-[18px]";
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center shadow-[0_2px_8px_rgba(15,23,42,0.06)]",
        dims,
        className,
      )}
    >
      <Icon className={icon} aria-hidden="true" />
    </span>
  );
}

/**
 * Soft-3D artwork bubble. Renders a WebP illustration from the shared library
 * inside the same rounded bubble geometry as {@link IconBubble}, so headers and
 * cards can upgrade from flat icons to illustrations without layout drift.
 */
export function ArtBubble({
  src,
  alt = "",
  className,
  size = "md",
}: {
  src: string;
  alt?: string;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const dims =
    size === "xl"
      ? "h-14 w-14 rounded-[20px]"
      : size === "lg"
        ? "h-11 w-11 rounded-[16px]"
        : size === "sm"
          ? "h-8 w-8 rounded-[11px]"
          : "h-9 w-9 rounded-[14px]";
  const art =
    size === "xl" ? "h-10 w-10" : size === "lg" ? "h-8 w-8" : size === "sm" ? "h-[22px] w-[22px]" : "h-6 w-6";
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center shadow-[0_2px_10px_rgba(15,23,42,0.07)]",
        dims,
        className,
      )}
    >
      <img
        src={src}
        alt={alt}
        aria-hidden={alt ? undefined : "true"}
        loading="lazy"
        decoding="async"
        className={cn("object-contain drop-shadow-[0_2px_4px_rgba(15,23,42,0.14)]", art)}
      />
    </span>
  );
}

/** Free-standing decorative illustration (no bubble). Always aria-hidden. */
export function HomeDecorArt({
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

interface HomeSectionHeaderProps {
  title: string;
  icon: LucideIcon;
  /** Optional soft-3D illustration replacing the flat icon inside the bubble. */
  art?: string;
  /** Icon bubble + accent colour classes, e.g. "bg-home-updates text-home-updates-accent". */
  accentClassName?: string;
  action?: { label: string; to: string };
  /** Accent colour class for the action link, e.g. "text-home-ranking-accent". */
  actionClassName?: string;
  /** Small caption rendered under the title (e.g. "This week"). */
  caption?: string;
}

/** Unified section header: icon bubble, title, optional caption and action. */
export function HomeSectionHeader({
  title,
  icon,
  art,
  accentClassName = "bg-primary/10 text-primary",
  action,
  actionClassName,
  caption,
}: HomeSectionHeaderProps) {
  return (
    <div className="flex items-center gap-2.5 px-0.5">
      {art ? (
        <ArtBubble src={art} className={cn("bg-white", accentClassName)} />
      ) : (
        <IconBubble icon={icon} className={cn("bg-white", accentClassName)} />
      )}
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-[18px] font-bold leading-tight tracking-[-0.01em] text-slate-900">
          {title}
        </h2>
        {caption && (
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            {caption}
          </p>
        )}
      </div>
      {action && (
        <Link
          to={action.to}
          className={cn(
            "-my-2 inline-flex min-h-[44px] items-center gap-0.5 whitespace-nowrap px-1 text-[13px] font-semibold active:opacity-70",
            actionClassName ?? "text-slate-500",
          )}
        >
          {action.label}
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

/** Section wrapper: header + content, no pastel container. */
export function HomeSection({
  header,
  children,
  className,
}: {
  header: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-3", className)}>
      {header}
      {children}
    </section>
  );
}

/** Shared soft-card surface used by every Home module. */
export const HOME_CARD =
  "rounded-[24px] border border-slate-200/70 bg-white shadow-[0_6px_22px_rgba(15,23,42,0.06)]";

/**
 * Compact but polished empty state — keeps the module's visual footprint so the
 * page composition never collapses when data is absent.
 */
export function HomeEmptyState({
  icon,
  art,
  title,
  description,
  action,
  accentClassName = "bg-slate-100 text-slate-400",
}: {
  icon: LucideIcon;
  /** Optional soft-3D illustration shown instead of the flat icon. */
  art?: string;
  title: string;
  description?: string;
  action?: { label: string; to: string };
  accentClassName?: string;
}) {
  return (
    <div className={cn(HOME_CARD, "relative flex flex-col items-center gap-2 overflow-hidden px-4 py-7 text-center")}>
      {art ? (
        <ArtBubble src={art} size="xl" className={cn("relative", accentClassName)} />
      ) : (
        <IconBubble icon={icon} size="lg" className={accentClassName} />
      )}
      <p className="mt-0.5 text-[15px] font-bold text-slate-900">{title}</p>
      {description && <p className="max-w-[260px] text-[13px] text-slate-500">{description}</p>}
      {action && (
        <Link
          to={action.to}
          className="mt-0.5 inline-flex min-h-[44px] items-center gap-1 text-[13px] font-semibold text-primary active:opacity-70"
        >
          {action.label}
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

/** Compact, safe error state — never a fabricated empty state. */
export function HomeErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className={cn(HOME_CARD, "flex items-center justify-between gap-3 px-4 py-3")}>
      <p className="text-[13px] text-slate-600">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-slate-100 px-3 py-2 text-[13px] font-medium text-slate-900 active:bg-slate-200"
      >
        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
        Retry
      </button>
    </div>
  );
}

/** Small floating decorative accents (sparks/dots) used around the hero. */
export function HomeSparkAccents({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn("pointer-events-none absolute", className)}>
      <svg width="26" height="26" viewBox="0 0 26 26" fill="none" className="text-primary">
        <path
          d="M13 1.5l2.1 6.4a3 3 0 001.9 1.9l6.5 2.2-6.5 2.2a3 3 0 00-1.9 1.9L13 22.5l-2.1-6.4a3 3 0 00-1.9-1.9L2.5 12l6.5-2.2a3 3 0 001.9-1.9L13 1.5z"
          fill="currentColor"
        />
      </svg>
      <span className="absolute -right-3 top-6 block h-1.5 w-1.5 rounded-full bg-primary/50" />
      <span className="absolute -left-3 top-9 block h-1 w-1 rounded-full bg-home-ranking-accent/50" />
    </span>
  );
}

/**
 * Soft-3D artwork used by the Home feed, mapped onto the shared illustration
 * library. Keeps every Home module pulling from one verified asset map.
 */
export const HOME_ART = {
  megaphone: "/assets/illustrations/ui/glossy_3d_megaphone_icon.webp",
  bell: "/assets/illustrations/decorative/glossy_golden_notification_bell.webp",
  notebook: "/assets/illustrations/ui/glossy_pastel_notebook_stack_icon.webp",
  books: "/assets/illustrations/learning/glossy_pastel_stack_of_books.webp",
  flashcards: "/assets/illustrations/learning/learning-flashcards.webp",
  calendar: "/assets/illustrations/learning/glossy_pastel_calendar_with_checkmark.webp",
  trophy: "/assets/illustrations/decorative/glossy_golden_star_trophy_icon.webp",
  flame: "/assets/illustrations/gamification/glossy_3d_flame_icon.webp",
  bolt: "/assets/illustrations/gamification/lightning-bolt.webp",
  goldBolt: "/assets/illustrations/gamification/glossy_golden_lightning_bolt.webp",
  star: "/assets/illustrations/ui/sparkle-yellow.webp",
  orbs: "/assets/illustrations/decorative/orbs-blue-purple.webp",
  achievementStar: "/assets/illustrations/gamification/achievement-star.webp",
  quiz: "/assets/illustrations/ui/glossy_3d_quiz_card_icon.webp",
  replay: "/assets/illustrations/ui/glossy_purple_replay_camera_icon.webp",
  worksheet: "/assets/illustrations/ui/glossy_3d_clipboard_and_pencil_worksheet.webp",
  link: "/assets/illustrations/learning/global-learning.webp",
  cap: "/assets/illustrations/ui/glossy_blue_graduation_cap_with_gold_tassel.webp",
} as const;

/**
 * Page-level decorative layer: a few very soft floating accents behind the feed.
 * Purely presentational, never interactive, and low enough in contrast that it
 * cannot compete with content.
 */
export function HomePageDecor() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <HomeDecorArt src={HOME_ART.orbs} className="absolute -right-8 top-[430px] h-28 w-28 opacity-[0.16]" />
      <HomeDecorArt src={HOME_ART.star} className="absolute left-[-14px] top-[720px] h-12 w-12 opacity-[0.18]" />
      <HomeDecorArt
        src={HOME_ART.achievementStar}
        className="absolute right-6 top-[1080px] h-14 w-14 opacity-[0.14]"
      />
      <span className="absolute left-10 top-[240px] block h-2 w-2 rounded-full bg-primary/25" />
      <span className="absolute right-14 top-[620px] block h-1.5 w-1.5 rounded-full bg-home-schedule-accent/30" />
      <span className="absolute left-6 top-[980px] block h-2.5 w-2.5 rounded-full bg-home-updates-accent/20" />
    </div>
  );
}
