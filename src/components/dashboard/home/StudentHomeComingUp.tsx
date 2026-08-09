import { Link } from "react-router-dom";
import { format, isToday, isTomorrow, isThisWeek } from "date-fns";
import { CalendarClock, HelpCircle, GraduationCap } from "lucide-react";
import { upcomingKindLabel, upcomingRoute, type HomeUpcomingItem } from "@/lib/studentHome";
import { SectionHeader, HomeErrorState } from "./StudentHomeShared";

interface Props {
  items: HomeUpcomingItem[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

function dayGroupLabel(iso: string): string {
  const d = new Date(iso);
  if (isToday(d)) return "TODAY";
  if (isTomorrow(d)) return "TOMORROW";
  if (isThisWeek(d, { weekStartsOn: 1 })) return format(d, "EEEE").toUpperCase();
  return format(d, "EEE d MMM").toUpperCase();
}

function itemIcon(kind: HomeUpcomingItem["kind"]) {
  if (kind === "class") return GraduationCap;
  if (kind === "quiz_due") return HelpCircle;
  return CalendarClock;
}

/** Lightweight chronological academic agenda. */
export function StudentHomeComingUp({ items, isLoading, isError, onRetry }: Props) {
  const groups: { label: string; items: HomeUpcomingItem[] }[] = [];
  for (const item of items) {
    const label = dayGroupLabel(item.at);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }

  return (
    <section className="space-y-3">
      <SectionHeader title="Coming Up" />

      {isLoading ? (
        <div className="space-y-2" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[62px] rounded-xl bg-slate-200/70 animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <HomeErrorState message="Couldn’t load your schedule." onRetry={onRetry} />
      ) : items.length === 0 ? (
        <div className="px-1 py-3">
          <p className="text-[14px] font-medium text-slate-900">You’re all caught up 🎉</p>
          <p className="text-[13px] text-slate-500">Nothing scheduled for the next few days.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.label} className="space-y-2">
              <p className="px-1 text-[11px] font-semibold tracking-wide text-slate-400">
                {group.label}
              </p>
              <ul className="space-y-2">
                {group.items.map((item) => {
                  const Icon = itemIcon(item.kind);
                  return (
                    <li key={`${item.kind}-${item.item_id}-${item.at}`}>
                      <Link
                        to={upcomingRoute(item)}
                        className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 min-h-[44px] transition-colors active:bg-slate-50"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100">
                          <Icon className="w-[18px] h-[18px] text-slate-600" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[14px] font-semibold text-slate-900 line-clamp-2">
                            {item.title}
                          </span>
                          <span className="block text-[12px] text-slate-500 truncate">
                            {upcomingKindLabel(item.kind)}
                            {item.class_name ? ` · ${item.class_name}` : ""}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block text-[13px] font-semibold text-slate-900">
                            {format(new Date(item.at), "h:mm a")}
                          </span>
                          <span className="block text-[11px] text-slate-400">
                            {format(new Date(item.at), "d MMM")}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
