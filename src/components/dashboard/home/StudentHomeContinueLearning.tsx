import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  FileText,
  Video,
  Link2,
  HelpCircle,
  Layers,
  ArrowRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { formatRelative } from "@/lib/quizzes";
import { continueKindLabel, continueRoute, type HomeContinueItem } from "@/lib/studentHome";
import {
  HomeSection,
  HomeSectionHeader,
  HomeErrorState,
  HomeEmptyState,
  HOME_CARD,
  HOME_ART,
  HomeDecorArt,
} from "./StudentHomeShared";
import { useStudentAccent } from "@/lib/studentProfile";
import { cn } from "@/lib/utils";

interface Props {
  items: HomeContinueItem[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

function itemIcon(item: HomeContinueItem): LucideIcon {
  if (item.category === "quiz") return HelpCircle;
  if (item.category === "flashcards") return Layers;
  const kind = (item.kind ?? "").toLowerCase();
  if (kind === "video" || kind === "replay") return Video;
  if (kind === "link") return Link2;
  return FileText;
}

/** Contextual soft-3D artwork for a recent-learning item. */
function itemArt(item: HomeContinueItem): string {
  if (item.category === "quiz") return HOME_ART.quiz;
  if (item.category === "flashcards") return HOME_ART.flashcards;
  const kind = (item.kind ?? "").toLowerCase();
  if (kind === "video" || kind === "replay") return HOME_ART.replay;
  if (kind === "link") return HOME_ART.link;
  return HOME_ART.notebook;
}

/** Soft-3D flashcard artwork on the card's right edge. */
function StudyCardArt({ src }: { src: string }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute right-1 top-1/2 block h-[100px] w-[112px] -translate-y-[58%]"
    >
      <HomeDecorArt
        src={src}
        className="absolute inset-0 h-full w-full drop-shadow-[0_10px_20px_rgba(37,74,168,0.18)]"
      />
    </span>
  );
}

/**
 * Continue Learning — one flat card per recent activity; extra items swipe
 * horizontally. Each card used to sit on two decorative "backing deck" layers
 * that implied a stack of items where there was only one, so they were dropped.
 * Access history only, never a progress or completion claim.
 */
export function StudentHomeContinueLearning({ items, isLoading, isError, onRetry }: Props) {
  const visible = items.slice(0, 3);
  const trackRef = useRef<HTMLDivElement>(null);
  const accent = useStudentAccent();
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);
  /** True only when the track can actually scroll (more cards than fit). */
  const [scrollable, setScrollable] = useState(false);

  const sync = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setScrollable(max > 8);
    setAtStart(el.scrollLeft <= 8);
    setAtEnd(el.scrollLeft >= max - 8);
  }, []);

  useEffect(() => {
    sync();
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    for (const child of Array.from(el.children)) ro.observe(child);
    return () => ro.disconnect();
  }, [sync, visible.length]);

  /** Advance approximately one card per activation. */
  const step = useCallback((dir: -1 | 1) => {
    const el = trackRef.current;
    if (!el) return;
    const first = el.firstElementChild as HTMLElement | null;
    const gap = 12;
    const amount = first ? first.offsetWidth + gap : el.clientWidth * 0.8;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: dir * amount, behavior: reduce ? "auto" : "smooth" });
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        step(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        step(-1);
      }
    },
    [step],
  );

  /** Soft circular control, desktop/tablet only — mobile keeps pure swiping. */
  const arrowClass =
    "absolute top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border bg-white/95 shadow-[0_10px_26px_rgba(15,23,42,0.14)] backdrop-blur transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-95 disabled:cursor-default disabled:opacity-35 disabled:shadow-none motion-reduce:transition-none motion-reduce:active:scale-100 md:inline-flex";

  return (
    <HomeSection
      header={
        <HomeSectionHeader
          title="Continue Learning"
          icon={BookOpen}
          art={HOME_ART.books}
          accentClassName="bg-home-learning text-home-learning-accent"
          action={items.length > 0 ? { label: "View all", to: "/dashboard/classes" } : undefined}
          actionClassName="text-home-learning-accent"
        />
      }
    >
      {isLoading ? (
        <DeckSkeleton />
      ) : isError ? (
        <HomeErrorState message="Couldn’t load your recent learning." onRetry={onRetry} />
      ) : visible.length === 0 ? (
        <HomeEmptyState
          icon={BookOpen}
          art={HOME_ART.books}
          title="Nothing recent yet"
          description="Open a class and your recent learning appears here."
          action={{ label: "Go to Study", to: "/dashboard/classes" }}
          accentClassName="bg-home-learning text-home-learning-accent"
        />
      ) : (
        <div className="relative" style={accent.vars}>
          {scrollable && (
            <>
              <button
                type="button"
                aria-label="Previous learning item"
                onClick={() => step(-1)}
                disabled={atStart}
                style={{
                  color: "var(--student-accent)",
                  borderColor: "var(--student-accent-border)",
                }}
                className={cn(arrowClass, "left-0 md:-left-2 lg:-left-4")}
              >
                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Next learning item"
                onClick={() => step(1)}
                disabled={atEnd}
                style={{
                  color: "var(--student-accent)",
                  borderColor: "var(--student-accent-border)",
                }}
                className={cn(arrowClass, "right-0 md:-right-2 lg:-right-4")}
              >
                <ChevronRight className="h-5 w-5" aria-hidden="true" />
              </button>
            </>
          )}

        <div
          ref={trackRef}
          onScroll={sync}
          onKeyDown={onKeyDown}
          role="group"
          aria-label="Continue learning items"
          tabIndex={visible.length > 1 ? 0 : -1}
          className={cn(
            "flex gap-3 pb-1 focus-visible:outline-none",
            visible.length > 1 &&
              "-mx-4 snap-x snap-mandatory flex-nowrap overflow-x-auto overscroll-x-contain px-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:px-0",
          )}
        >
          {visible.map((item) => {
            const Icon = itemIcon(item);
            return (
              <div
                key={`${item.category}-${item.item_id}`}
                className={cn(
                  "relative shrink-0 grow-0 snap-start pb-3 pr-3",
                  visible.length > 1
                    ? "w-[88%] md:w-[calc((100%-0.75rem)/2)]"
                    : "w-full",
                )}
              >
                {/* One item, one card surface. The decorative "backing deck"
                    layers that used to sit behind each card are gone: they read
                    as clutter in a horizontal carousel, not as depth. */}
                <Link
                  to={continueRoute(item)}
                  className={cn(
                    HOME_CARD,
                    "group relative flex flex-col overflow-hidden p-4 transition-transform duration-200 active:scale-[0.985] motion-reduce:transition-none",
                  )}
                >
                  <StudyCardArt src={itemArt(item)} />

                  <div className="relative flex items-center gap-2.5">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] bg-home-learning shadow-[0_2px_8px_rgba(37,74,168,0.10)]">
                      <Icon className="h-5 w-5 text-home-learning-accent" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-bold text-slate-900">
                        {item.class_name ?? item.subject_name ?? "Class"}
                      </span>
                      <span className="block text-[12.5px] font-semibold text-home-learning-accent">
                        {continueKindLabel(item)}
                      </span>
                    </span>
                  </div>

                  <h3 className="relative mt-4 max-w-[58%] text-[18px] font-bold tracking-[-0.01em] text-slate-900 line-clamp-2">
                    {item.title}
                  </h3>
                  <p className="relative mt-1 text-[12.5px] text-slate-500">
                    Last opened {formatRelative(item.at)}
                  </p>

                  <span className="relative mt-4 flex min-h-[48px] items-center justify-between rounded-[18px] bg-home-learning px-4 text-[14.5px] font-bold text-home-learning-accent">
                    {item.in_progress ? "Resume" : "Continue"}
                    <ArrowRight
                      className="h-4 w-4 transition-transform group-active:translate-x-1 motion-reduce:transition-none"
                      aria-hidden="true"
                    />
                  </span>
                </Link>
              </div>
            );
          })}
        </div>
        </div>
      )}
    </HomeSection>
  );
}

function DeckSkeleton() {
  return (
    <div className="relative pb-3 pr-3" aria-hidden="true">
      {/* Matches the real card: a single surface, no backing deck. */}
      <div className={cn(HOME_CARD, "relative space-y-3 p-4")}>
        <div className="flex items-center gap-2.5">
          <div className="h-11 w-11 animate-pulse rounded-[16px] bg-slate-100" />
          <div className="space-y-1.5">
            <div className="h-3.5 w-28 animate-pulse rounded-full bg-slate-100" />
            <div className="h-3 w-16 animate-pulse rounded-full bg-slate-100" />
          </div>
        </div>
        <div className="h-4 w-2/3 animate-pulse rounded-full bg-slate-100" />
        <div className="h-12 animate-pulse rounded-[18px] bg-slate-100" />
      </div>
    </div>
  );
}
