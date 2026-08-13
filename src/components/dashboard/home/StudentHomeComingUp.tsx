import { Link } from "react-router-dom";
import { format, isToday, isTomorrow, isThisWeek, differenceInMinutes } from "date-fns";
import {
  CalendarCheck,
  CalendarClock,
  HelpCircle,
  GraduationCap,
  ArrowRight,
  BookOpen,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { subjectArt } from "@/lib/classIllustrations";
import { upcomingKindLabel, upcomingRoute, type HomeUpcomingItem } from "@/lib/studentHome";
import {
  HomeSection,
  HomeSectionHeader,
  HomeErrorState,
  HomeEmptyState,
  HOME_CARD,
  HOME_ART,
  HomeDecorArt,
} from "./StudentHomeShared";
import { cn } from "@/lib/utils";

interface Props {
  items: HomeUpcomingItem[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (isToday(d)) return "Today";
  if (isTomorrow(d)) return "Tomorrow";
  if (isThisWeek(d, { weekStartsOn: 1 })) return format(d, "EEEE");
  return format(d, "EEE d MMM");
}

function itemIcon(kind: HomeUpcomingItem["kind"]): LucideIcon {
  if (kind === "class") return BookOpen;
  if (kind === "quiz_due") return HelpCircle;
  return CalendarClock;
}

/**
 * Coming Up — a premium timeline schedule module grouped by day, mirroring the
 * mobile Timetable language. Every entry comes from the canonical
 * enrolment-scoped timetable feed; nothing is simulated.
 */
export function StudentHomeComingUp({ items, isLoading, isError, onRetry }: Props) {
  const visible = items.slice(0, 5);

  // "Next up" only when the real schedule says a class starts within the hour.
  const next = visible[0];
  const minutesToNext = next ? differenceInMinutes(new Date(next.at), new Date()) : null;
  const showNextUp =
    !!next &&
    next.kind === "class" &&
    minutesToNext != null &&
    minutesToNext >= 0 &&
    minutesToNext <= 60;

  const groups = visible.reduce<{ label: string; items: HomeUpcomingItem[] }[]>((acc, item) => {
    const label = dayLabel(item.at);
    const last = acc[acc.length - 1];
    if (last && last.label === label) last.items.push(item);
    else acc.push({ label, items: [item] });
    return acc;
  }, []);

  return (
    <HomeSection
      header={
        <HomeSectionHeader
          title="Coming Up"
          icon={CalendarCheck}
          art={HOME_ART.calendar}
          accentClassName="bg-home-schedule text-home-schedule-accent"
          action={{ label: "Calendar", to: "/timetable" }}
          actionClassName="text-home-schedule-accent"
        />
      }
    >
      {isLoading ? (
        <TimelineSkeleton />
      ) : isError ? (
        <HomeErrorState message="Couldn’t load your schedule." onRetry={onRetry} />
      ) : visible.length === 0 ? (
        <HomeEmptyState
          icon={CalendarCheck}
          art={HOME_ART.calendar}
          title="You’re all caught up 🎉"
          description="Nothing scheduled for the next few days."
          action={{ label: "View full schedule", to: "/timetable" }}
          accentClassName="bg-home-schedule text-home-schedule-accent"
        />
      ) : (
        <div className="space-y-3">
          {showNextUp && next && (
            <Link
              to={upcomingRoute(next)}
              className="flex items-center gap-3 rounded-[22px] border border-home-schedule-accent/20 bg-home-schedule px-4 py-3 transition-transform active:scale-[0.99] motion-reduce:transition-none"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-wide text-home-schedule-accent">
                  Next up
                </p>
                <p className="truncate text-[15.5px] font-bold text-slate-900">{next.title}</p>
                <p className="text-[12.5px] text-slate-600">
                  {minutesToNext === 0 ? "Starting now" : `Starts in ${minutesToNext} min`}
                </p>
              </div>
              <ArrowRight
                className="h-4 w-4 shrink-0 text-home-schedule-accent"
                aria-hidden="true"
              />
            </Link>
          )}

          <div className={cn(HOME_CARD, "px-4 pb-3 pt-4")}>
            {groups.map((group) => (
              <div key={group.label} className="mb-1">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-home-schedule-accent">
                  {group.label}
                </p>
                <ul>
                  {group.items.map((item, i) => {
                    const Icon = itemIcon(item.kind);
                    const at = new Date(item.at);
                    const isLast = i === group.items.length - 1;
                    return (
                      <li key={`${item.kind}-${item.item_id}-${item.at}`}>
                        <Link
                          to={upcomingRoute(item)}
                          className="flex min-h-[56px] items-stretch gap-3 rounded-[16px] transition-colors active:bg-slate-50"
                        >
                          <span className="w-[58px] shrink-0 pt-0.5 text-right text-[12.5px] font-bold tabular-nums text-home-schedule-accent">
                            {format(at, "h:mm a")}
                          </span>
                          {/* Timeline rail: node + connector. */}
                          <span
                            className="relative flex w-3 shrink-0 flex-col items-center"
                            aria-hidden="true"
                          >
                            <span className="mt-[6px] h-2.5 w-2.5 shrink-0 rounded-full border-2 border-white bg-home-schedule-accent shadow-[0_0_0_2px_hsl(var(--home-schedule))]" />
                            {!isLast && (
                              <span className="mt-1 w-[2px] flex-1 rounded-full bg-home-schedule" />
                            )}
                          </span>
                          <span className="min-w-0 flex-1 pb-4">
                            <span className="block truncate text-[15px] font-bold text-slate-900">
                              {item.title}
                            </span>
                            <span className="mt-0.5 block truncate text-[12.5px] text-slate-500">
                              {item.class_name ?? item.subject_name
                                ? `${item.class_name ?? item.subject_name} · ${upcomingKindLabel(item.kind)}`
                                : upcomingKindLabel(item.kind)}
                            </span>
                          </span>
                          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-home-schedule shadow-[0_2px_10px_rgba(15,23,42,0.06)]">
                            <HomeDecorArt
                              src={
                                item.kind === "quiz_due"
                                  ? HOME_ART.quiz
                                  : subjectArt(item.class_name ?? item.subject_name)
                              }
                              className="h-[26px] w-[26px] drop-shadow-[0_2px_4px_rgba(15,23,42,0.16)]"
                            />
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}

            <div className="border-t border-slate-100 pt-1">
              <Link
                to="/timetable"
                className="inline-flex min-h-[44px] items-center gap-1 text-[13.5px] font-bold text-home-schedule-accent active:opacity-70"
              >
                View full schedule
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </HomeSection>
  );
}

function TimelineSkeleton() {
  return (
    <div className={cn(HOME_CARD, "space-y-3 px-4 py-4")} aria-hidden="true">
      <div className="h-3 w-16 animate-pulse rounded-full bg-slate-100" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-start gap-3">
          <div className="h-3.5 w-[52px] animate-pulse rounded-full bg-slate-100" />
          <div className="mt-[3px] h-2.5 w-2.5 rounded-full bg-slate-200" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 w-2/3 animate-pulse rounded-full bg-slate-100" />
            <div className="h-3 w-1/3 animate-pulse rounded-full bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}
