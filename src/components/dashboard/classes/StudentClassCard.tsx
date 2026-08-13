import { useNavigate } from "react-router-dom";
import { ArrowRight, BadgeCheck, Calendar, CalendarDays, ChevronRight, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { subjectArtSet, STUDY_ART } from "@/lib/classIllustrations";
import { type TutorIdentity } from "@/lib/classCovers";
import { bestDisplayName } from "@/lib/profile";
import { UserAvatar } from "@/components/profile/UserAvatar";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Premium student class card for the Study / My Classes page.
 *
 * Purely presentational: every value is supplied by the caller from the
 * student's real, RLS-authorised enrolments. One reusable component covers all
 * subject variants — the artwork family is resolved from the real subject name.
 */

export interface StudentClassCardData {
  id: string;
  title: string;
  subject_name: string | null;
  cohort_label: string | null;
  schedule_label: string | null;
  scheduled_at: string | null;
  tutors: TutorIdentity[];
}

/** Decorative-only illustration. */
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

const DATE_FMT = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const NEXT_FMT = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
});

/** Human "next class" line from real schedule data, with an honest fallback. */
export function nextClassLabel(c: StudentClassCardData): string {
  if (c.scheduled_at) {
    const d = new Date(c.scheduled_at);
    if (!Number.isNaN(d.getTime()) && d.getTime() >= Date.now()) return NEXT_FMT.format(d);
  }
  if (c.schedule_label?.trim()) return c.schedule_label.trim();
  return "Not scheduled";
}

function dateLabel(c: StudentClassCardData): string {
  if (!c.scheduled_at) return "Not scheduled";
  const d = new Date(c.scheduled_at);
  return Number.isNaN(d.getTime()) ? "Not scheduled" : DATE_FMT.format(d);
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-primary/8 text-primary ring-1 ring-inset ring-primary/10"
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium leading-tight text-slate-400">{label}</p>
        <p className="truncate text-[14px] font-semibold leading-snug text-slate-900">{value}</p>
      </div>
    </div>
  );
}

export function StudentClassCard({ klass }: { klass: StudentClassCardData }) {
  const navigate = useNavigate();
  const art = subjectArtSet(klass.subject_name, klass.title);
  const tutor = klass.tutors[0];
  const tutorName = tutor ? bestDisplayName(tutor) : null;
  const extraTutors = Math.max(0, klass.tutors.length - 1);
  const href = `/dashboard/classes/${klass.id}`;

  return (
    <article className="relative overflow-hidden rounded-[30px] border border-slate-200/80 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.08)]">
      <div className="flex flex-col sm:flex-row">
        {/* Visual region — layered subject artwork */}
        <div
          className={cn(
            "relative shrink-0 overflow-hidden bg-gradient-to-br",
            art.tint,
            "h-[168px] sm:h-auto sm:w-[38%] sm:min-h-[300px]",
          )}
        >
          <div aria-hidden="true" className="absolute inset-0">
            <Art src={art.hero} className="absolute bottom-3 left-4 h-[84px] w-[84px] drop-shadow-[0_8px_16px_rgba(15,23,42,0.18)] sm:h-[104px] sm:w-[104px]" />
            <Art src={art.support} className="absolute right-3 top-6 h-[62px] w-[62px] opacity-95 drop-shadow-[0_6px_14px_rgba(15,23,42,0.16)] sm:h-[76px] sm:w-[76px]" />
            <Art src={art.accent} className="absolute bottom-6 right-5 h-[46px] w-[46px] opacity-90 drop-shadow-[0_4px_10px_rgba(15,23,42,0.14)] sm:h-[56px] sm:w-[56px]" />
            <Art src={STUDY_ART.starYellow} className="absolute left-6 top-4 h-5 w-5 opacity-80" />
            <Art src={STUDY_ART.sparklePurple} className="absolute right-10 bottom-3 h-4 w-4 opacity-70" />
          </div>
        </div>

        {/* Information region */}
        <div className="relative min-w-0 flex-1 p-4 sm:p-5">
          <div className="flex items-start gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/15 bg-primary/8 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-primary">
              <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Enrolled
            </span>
            <span
              aria-hidden="true"
              className="ml-auto flex h-9 w-9 items-center justify-center rounded-[12px] border border-slate-200 bg-white"
            >
              <Art src={STUDY_ART.bookmark} className="h-4 w-4 opacity-70" />
            </span>
          </div>

          <h3 className="mt-3 text-[21px] font-bold leading-tight tracking-[-0.02em] text-slate-900 sm:text-[24px]">
            {klass.title}
          </h3>
          {(klass.subject_name || klass.cohort_label) && (
            <p className="mt-1 text-[15px] font-semibold leading-snug text-primary">
              {[klass.subject_name, klass.cohort_label].filter(Boolean).join(" · ")}
            </p>
          )}

          <div className="my-4 h-px bg-slate-100" />

          <div className="space-y-3">
            <DetailRow
              icon={<CalendarDays className="h-4 w-4" />}
              label="Next class"
              value={nextClassLabel(klass)}
            />
            <DetailRow
              icon={<User className="h-4 w-4" />}
              label={extraTutors > 0 ? "Tutors" : "Tutor"}
              value={
                tutorName
                  ? extraTutors > 0
                    ? `${tutorName} +${extraTutors}`
                    : tutorName
                  : "To be confirmed"
              }
            />
            <DetailRow
              icon={<Calendar className="h-4 w-4" />}
              label="Date"
              value={dateLabel(klass)}
            />
          </div>

          <div className="mt-5 flex flex-col gap-3">
            {tutorName && (
              <button
                type="button"
                onClick={() => navigate(`${href}/about`)}
                aria-label={`View class details and tutor profile for ${klass.title}`}
                className="flex min-h-[56px] items-center gap-3 rounded-[20px] border border-slate-200 bg-white px-3 text-left shadow-[0_4px_16px_rgba(15,23,42,0.06)] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100"
              >
                <UserAvatar
                  path={tutor?.avatar_path ?? null}
                  name={tutorName}
                  className="h-9 w-9"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold text-slate-900">
                    {tutorName}
                  </span>
                  <span className="block text-[12px] font-medium text-primary">View profile</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden="true" />
              </button>
            )}

            <button
              type="button"
              onClick={() => navigate(href)}
              className="group flex min-h-[58px] w-full items-center justify-center gap-3 rounded-full bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--primary))]/85 px-5 text-[16px] font-bold text-primary-foreground shadow-[0_10px_24px_rgba(37,99,235,0.32)] transition-all hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 active:scale-[0.98] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100"
            >
              Open class
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/95">
                <ArrowRight className="h-4 w-4 text-primary" aria-hidden="true" />
              </span>
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

/** Soft skeleton mirroring the real card structure (no fake values). */
export function StudentClassCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-[30px] border border-slate-200/80 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.06)]">
      <div className="flex flex-col sm:flex-row">
        <Skeleton className="h-[168px] rounded-none sm:h-auto sm:min-h-[300px] sm:w-[38%]" />
        <div className="flex-1 space-y-3 p-4 sm:p-5">
          <Skeleton className="h-7 w-28 rounded-full" />
          <Skeleton className="h-6 w-3/4 rounded-lg" />
          <Skeleton className="h-4 w-1/2 rounded-lg" />
          <div className="space-y-3 pt-3">
            <Skeleton className="h-9 w-full rounded-xl" />
            <Skeleton className="h-9 w-full rounded-xl" />
            <Skeleton className="h-9 w-full rounded-xl" />
          </div>
          <Skeleton className="h-[58px] w-full rounded-full" />
        </div>
      </div>
    </div>
  );
}
