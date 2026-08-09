import { Link } from "react-router-dom";
import { Megaphone, AlertCircle, ChevronRight } from "lucide-react";
import { formatRelative } from "@/lib/quizzes";
import {
  announcementPriority,
  announcementRoute,
  type HomeAnnouncement,
} from "@/lib/studentHome";
import { SectionHeader, HomeErrorState } from "./StudentHomeShared";
import { cn } from "@/lib/utils";

interface Props {
  items: HomeAnnouncement[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  viewAllTo?: string;
}

/** Compact stacked announcement feed aggregated across enrolled classes. */
export function StudentHomeAnnouncements({
  items,
  isLoading,
  isError,
  onRetry,
  viewAllTo,
}: Props) {
  return (
    <section className="space-y-3">
      <SectionHeader
        title="Important Updates"
        action={
          viewAllTo && items.length > 0
            ? { label: "View all", to: viewAllTo }
            : undefined
        }
      />

      {isLoading ? (
        <div className="space-y-2.5" aria-hidden="true">
          {[0, 1].map((i) => (
            <div key={i} className="h-[104px] rounded-2xl bg-slate-200/70 animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <HomeErrorState message="Couldn’t load updates." onRetry={onRetry} />
      ) : items.length === 0 ? (
        <p className="px-1 py-4 text-[13px] text-slate-500">No new announcements.</p>
      ) : (
        <ul className="space-y-2.5">
          {items.map((a) => {
            const priority = announcementPriority(a);
            return (
              <li key={a.id}>
                <Link
                  to={announcementRoute(a)}
                  className={cn(
                    "block rounded-2xl border bg-white p-4 pl-[14px] min-h-[44px]",
                    "shadow-[0_2px_12px_rgba(15,23,42,0.04)] transition-transform",
                    "active:scale-[0.99] active:bg-slate-50",
                    priority === "important"
                      ? "border-amber-200 border-l-[3px] border-l-amber-400"
                      : "border-slate-200",
                  )}
                >
                  <div className="flex items-center gap-2">
                    {priority === "important" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                        <AlertCircle className="w-3 h-3" aria-hidden="true" />
                        Important
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                        <Megaphone className="w-3 h-3" aria-hidden="true" />
                        Update
                      </span>
                    )}
                    <span className="text-[12px] text-slate-500 truncate">
                      {a.class_name ?? a.subject_name ?? "Class"}
                    </span>
                  </div>

                  <h3 className="mt-1.5 text-[15px] font-semibold text-slate-900 line-clamp-2">
                    {a.title}
                  </h3>
                  {a.preview && (
                    <p className="mt-1 text-[13px] text-slate-600 line-clamp-2">{a.preview}</p>
                  )}
                  <p className="mt-2 text-[12px] text-slate-400">
                    {[a.author_name, formatRelative(a.at)].filter(Boolean).join(" · ")}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function ViewAllChevron() {
  return <ChevronRight className="w-4 h-4" aria-hidden="true" />;
}
