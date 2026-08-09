import { Link } from "react-router-dom";
import { format, isToday, isTomorrow, isThisWeek } from "date-fns";
import { CalendarCheck, CalendarClock, HelpCircle, GraduationCap } from "lucide-react";
import { upcomingKindLabel, upcomingRoute, type HomeUpcomingItem } from "@/lib/studentHome";
import { HomeModule, HomeErrorState } from "./StudentHomeShared";

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

function itemIcon(kind: HomeUpcomingItem["kind"]) {
  if (kind === "class") return GraduationCap;
  if (kind === "quiz_due") return HelpCircle;
  return CalendarClock;
}

/** Pale-lavender academic agenda: compact rows, compact empty state. */
export function StudentHomeComingUp({ items, isLoading, isError, onRetry }: Props) {
  return (
    <HomeModule
      tone="schedule"
      title="Coming Up"
      icon={CalendarCheck}
      action={{ label: "Calendar", to: "/timetable" }}
    >
      {isLoading ? (
        <div className="space-y-2" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[58px] rounded-[20px] bg-white/70 animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <HomeErrorState message="Couldn’t load your schedule." onRetry={onRetry} />
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-[20px] bg-white/90 px-4 py-7 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-home-schedule">
            <CalendarCheck
              className="h-5 w-5 text-home-schedule-accent"
              aria-hidden="true"
            />
          </span>
          <p className="text-[15px] font-semibold text-slate-900">You’re all caught up 🎉</p>
          <p className="text-[13px] text-slate-500">Nothing scheduled for the next few days.</p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-[20px] bg-white">
          {items.slice(0, 5).map((item) => {
            const Icon = itemIcon(item.kind);
            const at = new Date(item.at);
            return (
              <li key={`${item.kind}-${item.item_id}-${item.at}`}>
                <Link
                  to={upcomingRoute(item)}
                  className="flex min-h-[44px] items-center gap-3 px-3 py-3 active:bg-slate-50"
                >
                  <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-2xl bg-home-schedule leading-none">
                    <span className="text-[10px] font-semibold uppercase text-home-schedule-accent">
                      {format(at, "MMM")}
                    </span>
                    <span className="text-[15px] font-bold text-slate-900">
                      {format(at, "d")}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-slate-900">
                      {item.title}
                    </span>
                    <span className="flex items-center gap-1 text-[12px] text-slate-500">
                      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
                      <span className="truncate">
                        {dayLabel(item.at)} · {format(at, "h:mm a")} ·{" "}
                        {upcomingKindLabel(item.kind)}
                      </span>
                    </span>
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
