import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  addDays,
  differenceInMinutes,
  format,
  isSameDay,
  isToday,
  isTomorrow,
} from "date-fns";
import { AlertCircle, CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DecorArt,
  ServiceArtBubble,
} from "@/components/dashboard/services/StudentServiceChrome";
import { DECOR_ART, TIMETABLE_ART } from "@/lib/studentIllustrations";
import { subjectArt } from "@/lib/classIllustrations";
import {
  SUBJECT_ACCENT_BG,
  SUBJECT_ACCENT_TEXT,
  SUBJECT_SURFACE,
  subjectTone,
  useStudentTimetable,
  weekStartOf,
  type TimetableEntry,
} from "@/lib/studentTimetable";

type ViewMode = "day" | "upcoming";

const HOUR_PX = 64;
const DAY_LETTERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function classRoute(entry: TimetableEntry) {
  return `/dashboard/classes/${entry.class_id}`;
}

function timeRange(entry: TimetableEntry) {
  return `${format(new Date(entry.starts_at), "h:mm a")} – ${format(new Date(entry.ends_at), "h:mm a")}`;
}

/* ------------------------------------------------------------------ blocks */

function SubjectLabel({ entry }: { entry: TimetableEntry }) {
  const tone = subjectTone(entry.subject_name, entry.subject_id);
  if (!entry.subject_name) return null;
  return (
    <p
      className={cn(
        "text-[10px] font-bold uppercase tracking-[0.08em]",
        SUBJECT_ACCENT_TEXT[tone],
      )}
    >
      {entry.subject_name}
    </p>
  );
}

function ClassBlock({
  entry,
  isNext,
  style,
}: {
  entry: TimetableEntry;
  isNext?: boolean;
  style?: React.CSSProperties;
}) {
  const tone = subjectTone(entry.subject_name, entry.subject_id);
  return (
    <Link
      to={classRoute(entry)}
      style={style}
      className={cn(
        "group flex flex-col justify-center gap-0.5 rounded-[18px] px-3 py-2.5",
        "transition-transform duration-150 active:scale-[0.985] motion-reduce:transition-none",
        SUBJECT_SURFACE[tone],
      )}
    >
      <div className="flex items-center gap-2">
        <SubjectLabel entry={entry} />
        {isNext && (
          <span
            className={cn(
              "rounded-full px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-wide text-white",
              SUBJECT_ACCENT_BG[tone],
            )}
          >
            Next
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-slate-900">{entry.title}</p>
          <p className="truncate text-[12px] text-slate-600">{timeRange(entry)}</p>
          {entry.tutor_name && (
            <p className="truncate text-[11px] text-slate-500">{entry.tutor_name}</p>
          )}
        </div>
        <ChevronRight
          className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-active:translate-x-0.5 motion-reduce:transition-none"
          aria-hidden="true"
        />
      </div>
    </Link>
  );
}

function CompactRow({ entry }: { entry: TimetableEntry }) {
  const tone = subjectTone(entry.subject_name, entry.subject_id);
  return (
    <Link
      to={classRoute(entry)}
      className="group flex items-center gap-3 rounded-[18px] bg-white px-3 py-3 shadow-[0_4px_18px_rgb(0,0,0,0.04)] transition-transform duration-150 active:scale-[0.985] motion-reduce:transition-none"
    >
      <span className={cn("h-9 w-1.5 shrink-0 rounded-full", SUBJECT_ACCENT_BG[tone])} />
      <div className="w-[70px] shrink-0">
        <p className="text-[13px] font-bold text-slate-900">
          {format(new Date(entry.starts_at), "h:mm a")}
        </p>
        <p className="text-[11px] text-slate-500">
          {format(new Date(entry.ends_at), "h:mm a")}
        </p>
      </div>
      <div className="min-w-0 flex-1">
        <SubjectLabel entry={entry} />
        <p className="truncate text-[14px] font-semibold text-slate-900">{entry.title}</p>
        {entry.tutor_name && (
          <p className="truncate text-[11px] text-slate-500">{entry.tutor_name}</p>
        )}
      </div>
      <ChevronRight
        className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-active:translate-x-0.5 motion-reduce:transition-none"
        aria-hidden="true"
      />
    </Link>
  );
}

/* ---------------------------------------------------------------- timeline */

function DayTimeline({
  entries,
  showNow,
  nextClassId,
}: {
  entries: TimetableEntry[];
  showNow: boolean;
  nextClassId: string | null;
}) {
  const now = new Date();
  const bounds = useMemo(() => {
    const starts = entries.map((e) => new Date(e.starts_at));
    const ends = entries.map((e) => new Date(e.ends_at));
    let first = Math.min(...starts.map((d) => d.getHours()));
    let last = Math.max(...ends.map((d) => d.getHours() + (d.getMinutes() > 0 ? 1 : 0)));
    if (showNow) {
      first = Math.min(first, now.getHours());
      last = Math.max(last, now.getHours() + 1);
    }
    return { first, last: Math.max(last, first + 1) };
  }, [entries, showNow, now]);

  const hours = Array.from({ length: bounds.last - bounds.first + 1 }, (_, i) => bounds.first + i);
  const originMinutes = bounds.first * 60;
  const height = (bounds.last - bounds.first) * HOUR_PX + 24;

  const offsetOf = (iso: string) => {
    const d = new Date(iso);
    return ((d.getHours() * 60 + d.getMinutes() - originMinutes) / 60) * HOUR_PX;
  };

  const nowOffset = ((now.getHours() * 60 + now.getMinutes() - originMinutes) / 60) * HOUR_PX;

  return (
    <div className="relative flex" style={{ minHeight: height }}>
      {/* time gutter */}
      <div className="w-[54px] shrink-0">
        {hours.map((h) => (
          <div key={h} className="relative" style={{ height: HOUR_PX }}>
            <span className="absolute -top-1.5 text-[11px] font-medium text-slate-400">
              {format(new Date(2020, 0, 1, h), "h a")}
            </span>
          </div>
        ))}
      </div>

      {/* guides + blocks */}
      <div className="relative flex-1" style={{ height }}>
        {hours.map((h, i) => (
          <div
            key={h}
            className="absolute left-0 right-0 border-t border-slate-100"
            style={{ top: i * HOUR_PX }}
          />
        ))}

        {entries.map((entry) => {
          const top = offsetOf(entry.starts_at);
          const blockHeight = Math.max(
            72,
            (differenceInMinutes(new Date(entry.ends_at), new Date(entry.starts_at)) / 60) * HOUR_PX,
          );
          return (
            <ClassBlock
              key={`${entry.class_id}-${entry.starts_at}`}
              entry={entry}
              isNext={entry.class_id === nextClassId}
              style={{
                position: "absolute",
                top,
                left: 8,
                right: 0,
                minHeight: blockHeight,
              }}
            />
          );
        })}

        {showNow && nowOffset >= -8 && nowOffset <= height && (
          <div
            className="pointer-events-none absolute left-0 right-0 flex items-center gap-1"
            style={{ top: nowOffset }}
            aria-hidden="true"
          >
            <span className="h-2 w-2 rounded-full bg-primary" />
            <span className="h-[1.5px] flex-1 bg-primary/50" />
            <span className="rounded-full bg-primary px-1.5 py-[1px] text-[9px] font-bold uppercase text-primary-foreground">
              Now
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ empty states */

/** Large illustrated empty state used when a day (or the feed) has no classes. */
function EmptyDayCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="relative flex flex-col items-center overflow-hidden rounded-[28px] border border-slate-200/70 bg-[linear-gradient(170deg,#ffffff_0%,#f6f9ff_100%)] px-5 py-8 text-center shadow-[0_8px_26px_rgba(15,23,42,0.06)]">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <DecorArt src={DECOR_ART.cloudSoft} className="absolute left-4 top-6 h-10 w-10 opacity-40" />
        <DecorArt src={DECOR_ART.cloud} className="absolute right-5 top-10 h-9 w-9 opacity-35" />
        <DecorArt src={DECOR_ART.paperPlane} className="absolute right-8 top-2 h-8 w-8 opacity-60" />
        <DecorArt src={DECOR_ART.star} className="absolute left-10 top-2 h-5 w-5 opacity-50" />
        <DecorArt src={DECOR_ART.orb} className="absolute -bottom-8 -left-6 h-24 w-24 opacity-[0.12]" />
      </div>
      <div className="relative flex items-end gap-2">
        <img
          src={TIMETABLE_ART.empty}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          width={96}
          height={96}
          className="h-[88px] w-[88px] object-contain drop-shadow-[0_8px_14px_rgba(15,23,42,0.16)]"
        />
        <img
          src={TIMETABLE_ART.clock}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          width={48}
          height={48}
          className="mb-1 h-11 w-11 object-contain drop-shadow-[0_6px_10px_rgba(15,23,42,0.14)]"
        />
      </div>
      <p className="relative mt-3 text-[16px] font-bold tracking-[-0.01em] text-slate-900">{title}</p>
      <p className="relative mt-0.5 text-[13px] text-slate-500">{description}</p>
    </div>
  );
}

/** Compact "next class" footer card shown beneath an empty day. */
function NextClassCard({ entry }: { entry: TimetableEntry }) {
  const start = new Date(entry.starts_at);
  return (
    <Link
      to={classRoute(entry)}
      className={cn(
        "flex items-center gap-3 rounded-[24px] border border-slate-200/70 bg-white p-3.5",
        "shadow-[0_6px_22px_rgba(15,23,42,0.06)]",
        "transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.985] motion-reduce:transition-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
      )}
      aria-label={`Next class — ${entry.title}, ${format(start, "EEEE h:mm a")}`}
    >
      <ServiceArtBubble
        src={subjectArt(entry.subject_name)}
        size="lg"
        className="bg-slate-50"
      />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
          Next class
        </p>
        <p className="truncate text-[15px] font-bold tracking-[-0.01em] text-slate-900">
          {entry.title}
        </p>
        {entry.tutor_name && (
          <p className="truncate text-[12px] text-slate-500">{entry.tutor_name}</p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
        <CalendarDays className="h-4 w-4 text-slate-300" aria-hidden="true" />
        <p className="text-[12.5px] font-semibold text-slate-700">{format(start, "EEEE")}</p>
        <p className="text-[12px] text-slate-500">{format(start, "h:mm a")}</p>
      </div>
    </Link>
  );
}

/* --------------------------------------------------------------- skeletons */

function TimetableSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="h-11 rounded-full bg-slate-100" />
      <div className="h-20 rounded-[22px] bg-slate-100" />
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-3">
            <div className="h-4 w-10 rounded bg-slate-100" />
            <div className="h-[76px] flex-1 rounded-[18px] bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- page */

export function MobileTimetable() {
  const [view, setView] = useState<ViewMode>("day");
  const [weekStart, setWeekStart] = useState(() => weekStartOf(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => new Date());

  const { week, upcoming, nextClass, isLoading, isError, refetch, isFetching } =
    useStudentTimetable(weekStart);

  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const dayEntries = useMemo(
    () =>
      week
        .filter((e) => isSameDay(new Date(e.starts_at), selectedDate))
        .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()),
    [week, selectedDate],
  );

  const shiftWeek = (direction: number) => {
    const next = addDays(weekStart, direction * 7);
    setWeekStart(next);
    setSelectedDate((prev) => {
      const offset = weekDates.findIndex((d) => isSameDay(d, prev));
      return addDays(next, offset === -1 ? 0 : offset);
    });
  };

  const groupedUpcoming = useMemo(() => {
    const groups: Array<{ key: string; label: string; items: TimetableEntry[] }> = [];
    upcoming.forEach((entry) => {
      const date = new Date(entry.starts_at);
      const key = format(date, "yyyy-MM-dd");
      const label = isToday(date)
        ? "Today"
        : isTomorrow(date)
          ? "Tomorrow"
          : format(date, "EEEE · MMM d").toUpperCase();
      const existing = groups.find((g) => g.key === key);
      if (existing) existing.items.push(entry);
      else groups.push({ key, label, items: [entry] });
    });
    return groups;
  }, [upcoming]);

  const selectedIsToday = isToday(selectedDate);
  const dayHeading = selectedIsToday
    ? "Today's classes"
    : `${format(selectedDate, "EEEE")}'s classes`;
  const countLabel =
    dayEntries.length === 0
      ? "No classes"
      : dayEntries.length === 1
        ? "1 class"
        : `${dayEntries.length} classes`;

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[linear-gradient(180deg,#f7faff_0%,#f9fbff_45%,#f6f8fd_100%)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[300px] bg-[radial-gradient(120%_100%_at_50%_0%,rgba(99,102,241,0.10),transparent_70%)]"
      />
      <div
        className="relative mx-auto w-full max-w-3xl px-4 pb-8 md:max-w-5xl md:px-8 md:pb-12"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)" }}
      >
      {/* Header */}
      <div className="relative mb-4 flex items-center justify-between gap-3">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <DecorArt src={DECOR_ART.star} className="absolute left-[104px] -top-1 h-5 w-5 opacity-50" />
          <DecorArt src={DECOR_ART.cloudSoft} className="absolute left-[132px] top-6 h-6 w-6 opacity-35" />
        </div>
        <h1 className="relative text-[26px] font-bold tracking-[-0.02em] text-slate-900">Timetable</h1>
        <div className="relative inline-flex rounded-full border border-slate-200/70 bg-white/80 p-1 shadow-[0_4px_16px_rgba(15,23,42,0.05)] backdrop-blur-sm">
          {(["day", "upcoming"] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setView(mode)}
              aria-pressed={view === mode}
              className={cn(
                "h-9 rounded-full px-3.5 text-[13px] font-semibold transition-all duration-200 ease-out active:scale-[0.97] motion-reduce:transition-none",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                view === mode
                  ? "bg-[linear-gradient(135deg,#4f7dfb_0%,#7c5cf5_100%)] text-white shadow-[0_4px_14px_rgba(79,125,251,0.35)]"
                  : "text-slate-500 hover:text-slate-700",
              )}
            >
              {mode === "day" ? "By day" : "Upcoming"}
            </button>
          ))}
        </div>
      </div>


      {isLoading ? (
        <TimetableSkeleton />
      ) : isError ? (
        <div className="rounded-[22px] bg-slate-50 p-4 text-center">
          <AlertCircle className="mx-auto mb-2 h-6 w-6 text-destructive" aria-hidden="true" />
          <p className="text-[14px] font-semibold text-slate-900">
            Couldn't load your timetable.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="mt-3 h-9 rounded-full"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            Retry
          </Button>
        </div>
      ) : view === "day" ? (
        <>
          {/* Unified week calendar */}
          <section className="mb-5 rounded-[26px] border border-slate-200/70 bg-white p-3.5 shadow-[0_8px_26px_rgba(15,23,42,0.06)]">
            <div className="mb-2.5 flex items-center justify-between">
              <button
                type="button"
                aria-label="Previous week"
                onClick={() => shiftWeek(-1)}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-50 text-slate-500 transition-transform duration-150 active:scale-95 active:bg-slate-100 motion-reduce:transition-none"
              >
                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              </button>
              <p className="text-[14.5px] font-bold tracking-[-0.01em] text-slate-900">
                {format(weekDates[0], "MMM d")} – {format(weekDates[6], "MMM d, yyyy")}
              </p>
              <button
                type="button"
                aria-label="Next week"
                onClick={() => shiftWeek(1)}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-50 text-slate-500 transition-transform duration-150 active:scale-95 active:bg-slate-100 motion-reduce:transition-none"
              >
                <ChevronRight className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-0.5">
              {weekDates.map((date, i) => {
                const selected = isSameDay(date, selectedDate);
                const today = isToday(date);
                const hasClasses = week.some((e) => isSameDay(new Date(e.starts_at), date));
                return (
                  <button
                    key={date.toISOString()}
                    type="button"
                    onClick={() => setSelectedDate(date)}
                    aria-current={selected ? "date" : undefined}
                    aria-label={`${format(date, "EEEE d MMMM")}${today ? " (today)" : ""}${
                      hasClasses ? " — has classes" : ""
                    }`}
                    className="flex flex-col items-center gap-1 rounded-2xl py-1 transition-transform duration-150 active:scale-95 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <span
                      className={cn(
                        "text-[10px] font-semibold uppercase tracking-wide",
                        selected ? "text-primary" : today ? "text-slate-600" : "text-slate-400",
                      )}
                    >
                      {DAY_LETTERS[i]}
                    </span>
                    <span
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-full text-[15px] font-bold transition-all duration-200 motion-reduce:transition-none",
                        selected
                          ? "-translate-y-[1px] bg-[linear-gradient(135deg,#4f7dfb_0%,#7c5cf5_100%)] text-white shadow-[0_6px_16px_rgba(79,125,251,0.40)]"
                          : today
                            ? "bg-slate-100 text-slate-900 ring-1 ring-inset ring-slate-300"
                            : "text-slate-700",
                      )}
                    >
                      {date.getDate()}
                    </span>
                    <span className="flex h-1.5 items-center gap-0.5">
                      {hasClasses && (
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            selected ? "bg-primary" : "bg-violet-400",
                          )}
                        />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Day heading */}
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-[17.5px] font-bold tracking-[-0.01em] text-slate-900">{dayHeading}</h2>
            <span className="text-[12px] font-semibold text-slate-500">{countLabel}</span>
          </div>

          {dayEntries.length > 0 ? (
            <DayTimeline
              entries={dayEntries}
              showNow={selectedIsToday}
              nextClassId={selectedIsToday ? (nextClass?.class_id ?? null) : null}
            />
          ) : (
            <div className="space-y-4">
              <EmptyDayCard
                title={selectedIsToday ? "No classes today" : "No classes this day"}
                description="Your schedule is clear."
              />

              {nextClass && (
                <section>
                  <h3 className="mb-2 px-0.5 text-[12px] font-bold uppercase tracking-wide text-slate-400">
                    Next class
                  </h3>
                  <NextClassCard entry={nextClass} />
                </section>
              )}
            </div>
          )}
        </>
      ) : groupedUpcoming.length === 0 ? (
        <EmptyDayCard
          title="No upcoming classes"
          description="New classes appear here once scheduled."
        />
      ) : (
        <div className="space-y-5">
          {groupedUpcoming.map((group) => (
            <section key={group.key}>
              <h2 className="mb-2 px-0.5 text-[12px] font-bold uppercase tracking-wide text-slate-400">
                {group.label}
              </h2>
              <div className="space-y-2.5">
                {group.items.map((entry) => (
                  <CompactRow key={`${entry.class_id}-${entry.starts_at}`} entry={entry} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
