import { Link } from "react-router-dom";
import {
  FileText,
  Video,
  Link2,
  HelpCircle,
  Layers,
  ArrowRight,
  BookOpen,
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
} from "./StudentHomeShared";
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

/** Soft-3D stacked study-card art on the card's right edge. */
function StudyCardArt() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute right-3 top-1/2 block h-[86px] w-[96px] -translate-y-[62%]"
    >
      <span className="absolute right-6 top-2 block h-[58px] w-[74px] rotate-[-8deg] rounded-[12px] border border-slate-200/80 bg-white shadow-[0_6px_14px_rgba(15,23,42,0.08)]" />
      <span className="absolute right-2 top-5 block h-[58px] w-[74px] rotate-[6deg] rounded-[12px] border border-home-learning-accent/20 bg-gradient-to-br from-white to-home-learning shadow-[0_8px_18px_rgba(37,74,168,0.14)]">
        <span className="absolute left-3 top-4 block h-[3px] w-10 rounded-full bg-home-learning-accent/25" />
        <span className="absolute left-3 top-8 block h-[3px] w-7 rounded-full bg-home-learning-accent/20" />
      </span>
    </span>
  );
}

/**
 * Continue Learning — a tactile, layered learning deck. Two subtle backing cards
 * sit behind the primary activity; extra recent items swipe horizontally.
 * Access history only, never a progress or completion claim.
 */
export function StudentHomeContinueLearning({ items, isLoading, isError, onRetry }: Props) {
  const visible = items.slice(0, 3);

  return (
    <HomeSection
      header={
        <HomeSectionHeader
          title="Continue Learning"
          icon={BookOpen}
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
          title="Nothing recent yet"
          description="Open a class and your recent learning appears here."
          action={{ label: "Go to Study", to: "/dashboard/classes" }}
          accentClassName="bg-home-learning text-home-learning-accent"
        />
      ) : (
        <div
          className={cn(
            "flex gap-3 pb-1",
            visible.length > 1 &&
              "-mx-4 snap-x snap-mandatory overflow-x-auto px-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          )}
        >
          {visible.map((item) => {
            const Icon = itemIcon(item);
            return (
              <div
                key={`${item.category}-${item.item_id}`}
                className={cn(
                  "relative shrink-0 snap-start pb-3 pr-3",
                  visible.length > 1 ? "w-[88%]" : "w-full",
                )}
              >
                {/* Backing deck layers — restrained offsets, decorative only. */}
                <span
                  aria-hidden="true"
                  className="absolute inset-x-3 bottom-0 top-6 rounded-[24px] border border-home-learning-accent/15 bg-home-learning/70"
                />
                <span
                  aria-hidden="true"
                  className="absolute inset-x-1.5 bottom-1.5 top-3 rounded-[24px] border border-slate-200/70 bg-white/80"
                />

                <Link
                  to={continueRoute(item)}
                  className={cn(
                    HOME_CARD,
                    "group relative flex flex-col overflow-hidden p-4 transition-transform duration-200 active:scale-[0.985] motion-reduce:transition-none",
                  )}
                >
                  <StudyCardArt />

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

                  <h3 className="relative mt-4 max-w-[62%] text-[18px] font-bold tracking-[-0.01em] text-slate-900 line-clamp-2">
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
      )}
    </HomeSection>
  );
}

function DeckSkeleton() {
  return (
    <div className="relative pb-3 pr-3" aria-hidden="true">
      <span className="absolute inset-x-3 bottom-0 top-6 rounded-[24px] border border-home-learning-accent/15 bg-home-learning/70" />
      <span className="absolute inset-x-1.5 bottom-1.5 top-3 rounded-[24px] border border-slate-200/70 bg-white/80" />
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
