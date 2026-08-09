import { Link } from "react-router-dom";
import { Megaphone, AlertCircle, ChevronRight } from "lucide-react";
import { formatRelative } from "@/lib/quizzes";
import {
  announcementPriority,
  announcementRoute,
  type HomeAnnouncement,
} from "@/lib/studentHome";
import { HomeModule } from "./StudentHomeShared";
import { HomeErrorState } from "./StudentHomeShared";
import { cn } from "@/lib/utils";

interface Props {
  items: HomeAnnouncement[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  viewAllTo?: string;
}

/** Pale-cream module with white announcement cards, aggregated across classes. */
export function StudentHomeAnnouncements({
  items,
  isLoading,
  isError,
  onRetry,
  viewAllTo,
}: Props) {
  return (
    <HomeModule
      tone="updates"
      title="Important Updates"
      icon={Megaphone}
      action={
        viewAllTo && items.length > 0 ? { label: "View all", to: viewAllTo } : undefined
      }
    >
      {isLoading ? (
        <div className="space-y-2.5" aria-hidden="true">
          {[0, 1].map((i) => (
            <div key={i} className="h-[104px] rounded-[20px] bg-white/70 animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <HomeErrorState message="Couldn’t load updates." onRetry={onRetry} />
      ) : items.length === 0 ? (
        <div className="rounded-[20px] bg-white/90 px-4 py-4">
          <p className="text-[13px] text-slate-500">No new announcements.</p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {items.slice(0, 3).map((a) => {
            const priority = announcementPriority(a);
            return (
              <li key={a.id}>
                <Link
                  to={announcementRoute(a)}
                  className={cn(
                    "block min-h-[44px] rounded-[20px] bg-white p-4 transition-transform",
                    "shadow-[0_1px_6px_rgba(15,23,42,0.04)] active:scale-[0.99] active:bg-slate-50",
                    priority === "important" &&
                      "border-l-[3px] border-l-home-updates-accent pl-[13px]",
                  )}
                >
                  <div className="flex items-center gap-2">
                    {priority === "important" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-home-updates px-2.5 py-1 text-[11px] font-semibold text-home-updates-accent">
                        <AlertCircle className="h-3 w-3" aria-hidden="true" />
                        Important
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                        <Megaphone className="h-3 w-3" aria-hidden="true" />
                        Update
                      </span>
                    )}
                    <span className="min-w-0 truncate text-[12px] text-slate-500">
                      {a.class_name ?? a.subject_name ?? "Class"}
                    </span>
                  </div>

                  <h3 className="mt-2 text-[16px] font-semibold text-slate-900 line-clamp-2">
                    {a.title}
                  </h3>
                  {a.preview && (
                    <p className="mt-1 text-[14px] text-slate-600 line-clamp-2">{a.preview}</p>
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
    </HomeModule>
  );
}

export function ViewAllChevron() {
  return <ChevronRight className="w-4 h-4" aria-hidden="true" />;
}
