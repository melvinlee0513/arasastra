import { Link } from "react-router-dom";
import { FileText, Video, Link2, HelpCircle, Layers, ArrowRight, BookOpen } from "lucide-react";
import { formatRelative } from "@/lib/quizzes";
import {
  continueKindLabel,
  continueRoute,
  type HomeContinueItem,
} from "@/lib/studentHome";
import { SectionHeader, HomeErrorState } from "./StudentHomeShared";

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
 * Recently accessed learning content. Access history only — never a progress
 * or completion claim.
 */
export function StudentHomeContinueLearning({ items, isLoading, isError, onRetry }: Props) {
  return (
    <section className="space-y-3">
      <SectionHeader title="Continue Learning" />

      {isLoading ? (
        <div className="flex gap-3 overflow-hidden" aria-hidden="true">
          {[0, 1].map((i) => (
            <div key={i} className="h-[132px] w-[82%] shrink-0 rounded-2xl bg-slate-200/70 animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <HomeErrorState message="Couldn’t load your recent learning." onRetry={onRetry} />
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-4">
          <p className="text-[13px] text-slate-500">
            Start exploring your classes and your recent learning will appear here.
          </p>
          <Link
            to="/dashboard/classes"
            className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-primary min-h-[44px] active:opacity-70"
          >
            <BookOpen className="w-4 h-4" aria-hidden="true" />
            Go to Study
          </Link>
        </div>
      ) : (
        <ul
          data-scroll-reset
          className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {items.slice(0, 3).map((item) => {
            const Icon = itemIcon(item);
            return (
              <li
                key={`${item.category}-${item.item_id}`}
                className="w-[82%] max-w-[320px] shrink-0 snap-start sm:w-[60%]"
              >
                <Link
                  to={continueRoute(item)}
                  className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_2px_12px_rgba(15,23,42,0.05)] transition-transform active:scale-[0.99] active:bg-slate-50"
                >
                  <div className="flex items-center gap-2">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                      <Icon className="w-[18px] h-[18px] text-primary" aria-hidden="true" />
                    </span>
                    <span className="text-[12px] text-slate-500 truncate">
                      {item.class_name ?? item.subject_name ?? "Class"}
                    </span>
                  </div>

                  <h3 className="mt-2.5 text-[15px] font-semibold text-slate-900 line-clamp-2">
                    {item.title}
                  </h3>
                  <p className="mt-1 text-[12px] text-slate-500">
                    {continueKindLabel(item)} · {formatRelative(item.at)}
                  </p>

                  <span className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-primary">
                    {item.in_progress ? "Resume" : "Continue"}
                    <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
