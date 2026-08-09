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
import { HomeModule, HomeErrorState } from "./StudentHomeShared";

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
 * Pale-blue action module for recently accessed learning content. Access
 * history only — never a progress or completion claim.
 */
export function StudentHomeContinueLearning({ items, isLoading, isError, onRetry }: Props) {
  return (
    <HomeModule tone="learning" title="Continue Learning" icon={BookOpen}>
      {isLoading ? (
        <div className="space-y-2.5" aria-hidden="true">
          {[0, 1].map((i) => (
            <div key={i} className="h-[132px] rounded-[20px] bg-white/70 animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <HomeErrorState message="Couldn’t load your recent learning." onRetry={onRetry} />
      ) : items.length === 0 ? (
        <div className="rounded-[20px] bg-white/90 px-4 py-4">
          <p className="text-[14px] text-slate-600">
            Start exploring your classes and your recent learning will appear here.
          </p>
          <Link
            to="/dashboard/classes"
            className="mt-1 inline-flex min-h-[44px] items-center gap-1.5 text-[13px] font-semibold text-home-learning-accent active:opacity-70"
          >
            <BookOpen className="h-4 w-4" aria-hidden="true" />
            Go to Study
          </Link>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {items.slice(0, 3).map((item) => {
            const Icon = itemIcon(item);
            return (
              <li key={`${item.category}-${item.item_id}`}>
                <Link
                  to={continueRoute(item)}
                  className="group flex flex-col rounded-[20px] bg-white p-4 shadow-[0_1px_6px_rgba(15,23,42,0.04)] transition-transform active:scale-[0.99] active:bg-slate-50"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-home-learning">
                      <Icon
                        className="h-[18px] w-[18px] text-home-learning-accent"
                        aria-hidden="true"
                      />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium text-slate-700">
                        {item.class_name ?? item.subject_name ?? "Class"}
                      </span>
                      <span className="block text-[12px] text-slate-400">
                        {continueKindLabel(item)}
                      </span>
                    </span>
                  </div>

                  <h3 className="mt-3 text-[16px] font-semibold text-slate-900 line-clamp-2">
                    {item.title}
                  </h3>
                  <p className="mt-1 text-[12px] text-slate-500">
                    Last opened {formatRelative(item.at)}
                  </p>

                  <span className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-home-learning-accent">
                    {item.in_progress ? "Resume" : "Continue"}
                    <ArrowRight
                      className="h-3.5 w-3.5 transition-transform group-active:translate-x-0.5 motion-reduce:transition-none"
                      aria-hidden="true"
                    />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </HomeModule>
  );
}
