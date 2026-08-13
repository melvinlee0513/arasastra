import { Link } from "react-router-dom";
import { Megaphone, AlertCircle, Info } from "lucide-react";
import { formatRelative } from "@/lib/quizzes";
import {
  announcementPriority,
  announcementRoute,
  type HomeAnnouncement,
} from "@/lib/studentHome";
import {
  HomeSection,
  HomeSectionHeader,
  HomeErrorState,
  HomeEmptyState,
  HOME_CARD,
  HOME_ART,
  HomeDecorArt,
} from "./StudentHomeShared";
import { UserAvatar } from "@/components/profile/UserAvatar";
import { cn } from "@/lib/utils";

interface Props {
  items: HomeAnnouncement[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  viewAllTo?: string;
}

/**
 * Soft-3D notice artwork: the shared library's pinned note sheet with the golden
 * notification bell layered on top, matching the reference composition.
 */
function NoticeArt({ tone }: { tone: "important" | "normal" }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute right-0 top-7 h-[112px] w-[118px]"
    >
      <HomeDecorArt
        src={HOME_ART.notebook}
        className="absolute right-4 top-4 h-[76px] w-[76px] rotate-[6deg] drop-shadow-[0_8px_16px_rgba(15,23,42,0.14)]"
      />
      <HomeDecorArt
        src={tone === "important" ? HOME_ART.bell : HOME_ART.link}
        className="absolute right-[52px] top-0 h-[54px] w-[54px] drop-shadow-[0_8px_16px_rgba(217,119,6,0.24)]"
      />
    </span>
  );
}

/**
 * Important Updates — a large, editorial, horizontally snapping carousel. The
 * first card takes ~86% of the content width so the next one peeks into view.
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
          art={HOME_ART.megaphone}
          accentClassName="bg-home-updates text-home-updates-accent"
          action={viewAllTo && items.length > 0 ? { label: "View all", to: viewAllTo } : undefined}
        />
      }
    >
      {isLoading ? (
        <div className="-mx-4 flex gap-3 overflow-hidden px-4" aria-hidden="true">
          {[0, 1].map((i) => (
            <div key={i} className={cn(HOME_CARD, "h-[176px] w-[86%] shrink-0")}>
              <div className="space-y-2.5 p-4">
                <div className="h-5 w-24 animate-pulse rounded-full bg-slate-100" />
                <div className="h-4 w-3/4 animate-pulse rounded-full bg-slate-100" />
                <div className="h-3.5 w-full animate-pulse rounded-full bg-slate-100" />
                <div className="h-3.5 w-2/3 animate-pulse rounded-full bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <HomeErrorState message="Couldn’t load updates." onRetry={onRetry} />
      ) : visible.length === 0 ? (
        <HomeEmptyState
          icon={Megaphone}
          art={HOME_ART.megaphone}
          title="No new updates"
          description="Announcements from your classes will appear here."
          accentClassName="bg-home-updates text-home-updates-accent"
        />
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
                className={cn("shrink-0 snap-start", visible.length > 1 ? "w-[86%]" : "w-full")}
              >
                <Link
                  to={announcementRoute(a)}
                  className={cn(
                    HOME_CARD,
                    "relative flex h-full flex-col overflow-hidden p-4 pl-[17px] transition-transform duration-200 active:scale-[0.985] motion-reduce:transition-none",
                  )}
                >
                  {/* Coloured accent strip */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute inset-y-3 left-0 w-[5px] rounded-r-full",
                      priority === "important"
                        ? "bg-home-updates-accent"
                        : "bg-home-learning-accent/60",
                    )}
                  />
                  <NoticeArt tone={priority} />

                  <div className="relative flex items-center gap-2">
                    {priority === "important" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-home-updates px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-home-updates-accent">
                        <AlertCircle className="h-3 w-3" aria-hidden="true" />
                        Important
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-home-learning px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-home-learning-accent">
                        <Info className="h-3 w-3" aria-hidden="true" />
                        Info
                      </span>
                    )}
                    <span className="min-w-0 truncate text-[12px] font-medium text-slate-500">
                      {a.class_name ?? a.subject_name ?? "Class"}
                    </span>
                  </div>

                  <h3 className="relative mt-3 max-w-[60%] text-[17px] font-bold leading-snug tracking-[-0.01em] text-slate-900 line-clamp-2">
                    {a.title}
                  </h3>
                  {a.preview && (
                    <p className="relative mt-1.5 max-w-[60%] text-[13.5px] leading-relaxed text-slate-600 line-clamp-2">
                      {a.preview}
                    </p>
                  )}

                  <div className="relative mt-auto flex items-center gap-2 pt-3.5">
                    <UserAvatar
                      path={null}
                      name={a.author_name ?? "Tutor"}
                      className="h-7 w-7 shrink-0"
                      fallbackClassName="text-[10px] bg-slate-100 text-slate-600"
                    />
                    <p className="min-w-0 truncate text-[12px] text-slate-500">
                      {[a.author_name, formatRelative(a.at)].filter(Boolean).join(" · ")}
                    </p>
                  </div>
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
                i === 0 ? "w-4 bg-primary" : "w-1.5 bg-slate-200",
              )}
            />
          ))}
        </div>
      )}
    </HomeSection>
  );
}
