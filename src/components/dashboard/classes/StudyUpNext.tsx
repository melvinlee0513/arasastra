import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { STUDY_ART } from "@/lib/classIllustrations";
import type { StudentClassCardData } from "./StudentClassCard";

/**
 * "Up next" panel — derived only from the student's real active enrolments and
 * their real future `scheduled_at` values. No fabricated sessions, no
 * hardcoded countdowns.
 */

function Art({ src, className }: { src: string; className?: string }) {
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      className={cn("pointer-events-none select-none object-contain", className)}
    />
  );
}

const WHEN_FMT = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  hour: "numeric",
  minute: "2-digit",
});

/** Nearest future scheduled class among the supplied enrolled classes. */
export function pickUpNext(classes: StudentClassCardData[]): StudentClassCardData | null {
  const now = Date.now();
  return (
    classes
      .filter((c) => {
        if (!c.scheduled_at) return false;
        const t = new Date(c.scheduled_at).getTime();
        return !Number.isNaN(t) && t >= now;
      })
      .sort(
        (a, b) =>
          new Date(a.scheduled_at!).getTime() - new Date(b.scheduled_at!).getTime(),
      )[0] ?? null
  );
}

function countdown(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "Starting now";
  const mins = Math.floor(diff / 60_000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins % 60}m`;
  return `${mins}m`;
}

export function StudyUpNext({ klass }: { klass: StudentClassCardData | null }) {
  return (
    <section
      aria-label="Up next"
      className="relative mt-5 overflow-hidden rounded-[26px] border border-violet-200/60 bg-gradient-to-br from-violet-50 via-white to-indigo-50 p-4 shadow-[0_8px_26px_rgba(15,23,42,0.06)]"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <Art src={STUDY_ART.paperPlane} className="absolute right-3 top-3 h-8 w-8 opacity-80" />
        <Art src={STUDY_ART.starYellow} className="absolute left-[30%] top-2 h-4 w-4 opacity-70" />
        <Art src={STUDY_ART.sparklePurple} className="absolute bottom-3 right-[32%] h-4 w-4 opacity-60" />
      </div>

      <div className="relative flex items-center gap-3.5">
        <Art
          src={STUDY_ART.alarmClock}
          className="h-16 w-16 shrink-0 drop-shadow-[0_6px_14px_rgba(15,23,42,0.18)] sm:h-[74px] sm:w-[74px]"
        />
        <div className="min-w-0 flex-1">
          <span className="inline-flex rounded-full bg-violet-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-violet-700">
            Up next
          </span>
          {klass && klass.scheduled_at ? (
            <>
              <h3 className="mt-1.5 truncate text-[16px] font-bold leading-snug text-slate-900">
                {klass.title}
              </h3>
              <p className="text-[13px] font-semibold text-violet-600">
                {WHEN_FMT.format(new Date(klass.scheduled_at))}
              </p>
              <Link
                to={`/dashboard/classes/${klass.id}`}
                className="mt-2 inline-flex min-h-[36px] items-center rounded-full bg-white px-3 text-[12px] font-semibold text-primary shadow-sm ring-1 ring-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              >
                Open class
              </Link>
            </>
          ) : (
            <>
              <h3 className="mt-1.5 text-[16px] font-bold leading-snug text-slate-900">
                Nothing scheduled yet
              </h3>
              <p className="text-[13px] text-slate-500">
                Your next session will appear here once it's scheduled.
              </p>
            </>
          )}
        </div>

        {klass && klass.scheduled_at && (
          <div className="shrink-0 rounded-full border border-dashed border-violet-300 px-3 py-2 text-center">
            <p className="text-[10px] font-medium text-slate-500">Starts in</p>
            <p className="text-[16px] font-bold leading-tight text-violet-700">
              {countdown(klass.scheduled_at)}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
