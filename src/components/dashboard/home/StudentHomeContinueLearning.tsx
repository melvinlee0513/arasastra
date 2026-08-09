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
import { formatRelative } from "@/lib/quizzes";
import { continueKindLabel, continueRoute, type HomeContinueItem } from "@/lib/studentHome";
import { HomeSection, HomeSectionHeader, HomeErrorState, HomeEmptyState } from "./StudentHomeShared";
import { cn } from "@/lib/utils";

interface Props {
  items: HomeContinueItem[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

function itemIcon(item: HomeContinueItem) {
  if (item.category === "quiz") return HelpCircle;
  if (item.category === "flashcards") return Layers;
  const kind = (item.kind ?? "").toLowerCase();
  if (kind === "video" || kind === "replay") return Video;
  if (kind === "link") return Link2;
  return FileText;
}

/**
 * Continue Learning — a tactile stacked learning deck. Two subtle backing cards
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
          title="Nothing recent yet."
          description="Open a class and your recent learning appears here."
          action={{ label: "Go to Study", to: "/dashboard/classes" }}
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
                  "relative shrink-0 snap-start pb-2.5 pr-2.5",
                  visible.length > 1 ? "w-[88%]" : "w-full",
                )}
              >
                {/* Backing deck layers — restrained offsets, decorative only. */}
                <span
                  aria-hidden="true"
                  className="absolute inset-x-2.5 bottom-0 top-5 rounded-[22px] border border-slate-200/70 bg-white/60"
                />
                <span
                  aria-hidden="true"
                  className="absolute inset-x-1.5 bottom-1.5 top-3 rounded-[22px] border border-slate-200/80 bg-white/80"
                />

                <Link
                  to={continueRoute(item)}
                  className="group relative flex flex-col rounded-[22px] border border-slate-200/80 bg-white p-4 shadow-[0_4px_16px_rgba(15,23,42,0.06)] transition-transform duration-200 active:scale-[0.985] motion-reduce:transition-none"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-home-learning">
                      <Icon
                        className="h-[18px] w-[18px] text-home-learning-accent"
                        aria-hidden="true"
                      />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold text-slate-700">
                        {item.class_name ?? item.subject_name ?? "Class"}
                      </span>
                      <span className="block text-[12px] font-medium text-home-learning-accent">
                        {continueKindLabel(item)}
                      </span>
                    </span>
                  </div>

                  <h3 className="mt-3 text-[16.5px] font-bold text-slate-900 line-clamp-2">
                    {item.title}
                  </h3>
                  <p className="mt-1 text-[12px] text-slate-500">
                    Last opened {formatRelative(item.at)}
                  </p>

                  <span className="mt-3 flex min-h-[44px] items-center justify-between rounded-[16px] bg-home-learning px-3.5 text-[14px] font-semibold text-home-learning-accent">
                    {item.in_progress ? "Resume" : "Continue"}
                    <ArrowRight
                      className="h-4 w-4 transition-transform group-active:translate-x-0.5 motion-reduce:transition-none"
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
    <div className="relative pb-2.5 pr-2.5" aria-hidden="true">
      <span className="absolute inset-x-2.5 bottom-0 top-5 rounded-[22px] border border-slate-200/70 bg-white/60" />
      <span className="absolute inset-x-1.5 bottom-1.5 top-3 rounded-[22px] border border-slate-200/80 bg-white/80" />
      <div className="relative space-y-3 rounded-[22px] border border-slate-200/80 bg-white p-4">
        <div className="flex items-center gap-2.5">
          <div className="h-10 w-10 rounded-[14px] bg-slate-100" />
          <div className="space-y-1.5">
            <div className="h-3.5 w-28 rounded-full bg-slate-100" />
            <div className="h-3 w-16 rounded-full bg-slate-100" />
          </div>
        </div>
        <div className="h-4 w-2/3 rounded-full bg-slate-100" />
        <div className="h-11 rounded-[16px] bg-slate-100" />
      </div>
    </div>
  );
}
