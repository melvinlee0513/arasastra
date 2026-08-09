import { Link } from "react-router-dom";
import { Megaphone, AlertCircle, Info } from "lucide-react";
import { formatRelative } from "@/lib/quizzes";
import {
  announcementPriority,
  announcementRoute,
  type HomeAnnouncement,
} from "@/lib/studentHome";
import { HomeSection, HomeSectionHeader, HomeErrorState, HomeEmptyState } from "./StudentHomeShared";
import { cn } from "@/lib/utils";

interface Props {
  items: HomeAnnouncement[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  viewAllTo?: string;
}

/**
 * Important Updates — a horizontal, snapping announcement carousel. The first
 * card takes ~86% of the content width so the next one peeks into view.
 */
export function StudentHomeAnnouncements({
  items,
  isLoading,
  isError,
  onRetry,
  viewAllTo,
}: Props) {
  const visible = items.slice(0, 5);

  return (
    <HomeSection
      header={
        <HomeSectionHeader
          title="Important Updates"
          icon={Megaphone}
          accentClassName="bg-home-updates text-home-updates-accent"
          action={viewAllTo && items.length > 0 ? { label: "View all", to: viewAllTo } : undefined}
        />
      }
    >
      {isLoading ? (
        <div className="-mx-4 flex gap-3 overflow-hidden px-4" aria-hidden="true">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-[150px] w-[86%] shrink-0 rounded-[22px] border border-slate-200/80 bg-white"
            >
              <div className="space-y-2.5 p-4">
                <div className="h-5 w-24 rounded-full bg-slate-100" />
                <div className="h-4 w-3/4 rounded-full bg-slate-100" />
                <div className="h-3.5 w-full rounded-full bg-slate-100" />
                <div className="h-3.5 w-2/3 rounded-full bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <HomeErrorState message="Couldn’t load updates." onRetry={onRetry} />
      ) : visible.length === 0 ? (
        <HomeEmptyState icon={Megaphone} title="No new updates." />
      ) : (
        <div
          className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="list"
          aria-label="Important updates"
        >
          {visible.map((a) => {
            const priority = announcementPriority(a);
            return (
              <div
                key={a.id}
                role="listitem"
                className={cn(
                  "shrink-0 snap-start",
                  visible.length > 1 ? "w-[86%]" : "w-full",
                )}
              >
                <Link
                  to={announcementRoute(a)}
                  className={cn(
                    "flex h-full flex-col rounded-[22px] border border-slate-200/80 bg-white p-4 transition-transform",
                    "shadow-[0_2px_10px_rgba(15,23,42,0.05)] active:scale-[0.99] active:bg-slate-50",
                    priority === "important"
                      ? "border-l-[3px] border-l-home-updates-accent pl-[15px]"
                      : "border-l-[3px] border-l-slate-200 pl-[15px]",
                  )}
                >
                  <div className="flex items-center gap-2">
                    {priority === "important" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-home-updates px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-home-updates-accent">
                        <AlertCircle className="h-3 w-3" aria-hidden="true" />
                        Important
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        <Info className="h-3 w-3" aria-hidden="true" />
                        Update
                      </span>
                    )}
                    <span className="min-w-0 truncate text-[12px] text-slate-500">
                      {a.class_name ?? a.subject_name ?? "Class"}
                    </span>
                  </div>

                  <h3 className="mt-2.5 text-[16px] font-bold text-slate-900 line-clamp-2">
                    {a.title}
                  </h3>
                  {a.preview && (
                    <p className="mt-1 text-[14px] text-slate-600 line-clamp-2">{a.preview}</p>
                  )}
                  <p className="mt-auto pt-2.5 text-[12px] text-slate-400">
                    {[a.author_name, formatRelative(a.at)].filter(Boolean).join(" · ")}
                  </p>
                </Link>
              </div>
            );
          })}
        </div>
      )}

      {/* Tiny pagination hint, only when more than one update exists. */}
      {!isLoading && !isError && visible.length > 1 && (
        <div className="flex justify-center gap-1.5" aria-hidden="true">
          {visible.map((a, i) => (
            <span
              key={a.id}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === 0 ? "w-4 bg-home-updates-accent" : "w-1.5 bg-slate-200",
              )}
            />
          ))}
        </div>
      )}
    </HomeSection>
  );
}
