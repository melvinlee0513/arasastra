import { useNavigate } from "react-router-dom";
import { ArrowRight, BadgeCheck, Bookmark, CalendarDays, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { classTileArt, STUDY_ART } from "@/lib/classIllustrations";
import { type TutorIdentity } from "@/lib/classCovers";
import { bestDisplayName } from "@/lib/profile";
import { UserAvatar } from "@/components/profile/UserAvatar";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Premium student class card for the Study / My Classes page.
 *
 * Purely presentational: every value is supplied by the caller from the
 * student's real, RLS-authorised enrolments. The cover uses ONE composite
 * subject WebP — the artwork is never recomposed from micro-assets.
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

export interface StudentClassCardProps {
  klass: StudentClassCardData;
  bookmarked?: boolean;
  onToggleBookmark?: (klass: StudentClassCardData, bookmarked: boolean) => void;
  /** Student's personalisation accent (hex). Applied to small accents only. */
  accentColor?: string;
}

export function StudentClassCard({
  klass,
  bookmarked = false,
  onToggleBookmark,
  accentColor,
}: StudentClassCardProps) {
  const navigate = useNavigate();
  const art = classTileArt(klass.subject_name, klass.title);
  const tutor = klass.tutors[0];
  const tutorName = tutor ? bestDisplayName(tutor) : null;
  const extraTutors = Math.max(0, klass.tutors.length - 1);
  const href = `/dashboard/classes/${klass.id}`;
  const subtitle = [klass.subject_name, klass.schedule_label?.trim() || klass.cohort_label]
    .filter(Boolean)
    .join(" • ");

  return (
    <article className="relative flex h-full flex-col overflow-hidden rounded-[30px] border border-sky-100 bg-white shadow-[0_10px_30px_rgba(37,99,235,0.08),0_2px_8px_rgba(15,23,42,0.04)]">
      {/* Cover — one composite subject scene on a very light pastel surface */}
      <div className={cn("relative aspect-[16/11] w-full bg-gradient-to-b", art.tint)}>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_60%_at_50%_20%,rgba(255,255,255,0.85),transparent_70%)]"
        />
        {art.src ? (
          <img
            src={art.src}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            className="absolute inset-x-0 bottom-0 mx-auto h-[94%] w-[94%] select-none object-contain object-bottom drop-shadow-[0_10px_18px_rgba(15,23,42,0.10)]"
          />
        ) : (
          <img
            src={STUDY_ART.emptyClasses}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            className="absolute inset-x-0 bottom-4 mx-auto h-[62%] w-[62%] select-none object-contain object-bottom"
          />
        )}

        {onToggleBookmark && (
          <button
            type="button"
            onClick={() => onToggleBookmark(klass, bookmarked)}
            aria-pressed={bookmarked}
            aria-label={
              bookmarked
                ? `Remove bookmark from ${klass.title}`
                : `Bookmark ${klass.title}`
            }
            className={cn(
              "absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-[16px] border bg-white/95 backdrop-blur transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100",
              bookmarked
                ? "border-amber-200 shadow-[0_6px_18px_rgba(250,204,21,0.35)]"
                : "border-slate-200 shadow-[0_4px_14px_rgba(15,23,42,0.08)]",
            )}
          >
            {bookmarked ? (
              <img
                src={STUDY_ART.bookmarkActive}
                alt=""
                aria-hidden="true"
                decoding="async"
                className="h-6 w-6 select-none object-contain"
              />
            ) : (
              <Bookmark className="h-5 w-5 text-slate-500" aria-hidden="true" />
            )}
          </button>
        )}
      </div>

      {/* Information region */}
      <div className="relative flex min-w-0 flex-1 flex-col p-4 sm:p-5">
        <span
          className="inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em]"
          style={
            accentColor
              ? { color: accentColor, backgroundColor: `${accentColor}14` }
              : undefined
          }
        >
          <BadgeCheck
            className={cn("h-4 w-4", !accentColor && "text-primary")}
            aria-hidden="true"
          />
          <span className={cn(!accentColor && "text-primary")}>Enrolled</span>
        </span>

        <h3 className="mt-3 text-[21px] font-bold leading-tight tracking-[-0.02em] text-slate-900 sm:text-[23px]">
          {klass.title}
        </h3>
        {subtitle && (
          <p className="mt-1 break-words text-[14px] font-semibold leading-snug text-slate-500">
            {subtitle}
          </p>
        )}

        <div className="my-4 h-px bg-slate-100" />

        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-primary/8 text-primary ring-1 ring-inset ring-primary/10"
          >
            <CalendarDays className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-medium leading-tight text-slate-400">Next class</p>
            <p className="truncate text-[14px] font-semibold leading-snug text-slate-900">
              {nextClassLabel(klass)}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          {tutorName && (
            <button
              type="button"
              onClick={() => navigate(`${href}/about`)}
              aria-label={`View tutor profile for ${klass.title}`}
              className="flex min-h-[56px] items-center gap-3 rounded-[20px] border border-slate-100 bg-white px-3 text-left shadow-[0_4px_16px_rgba(15,23,42,0.06)] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              <UserAvatar
                path={tutor?.avatar_path ?? null}
                name={tutorName}
                className="h-9 w-9"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold text-slate-900">
                  {extraTutors > 0 ? `${tutorName} +${extraTutors}` : tutorName}
                </span>
                <span className="block text-[12px] font-medium text-primary">View profile</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden="true" />
            </button>
          )}

          <button
            type="button"
            onClick={() => navigate(href)}
            className="mt-auto flex min-h-[58px] w-full items-center justify-center gap-3 rounded-full bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--primary))]/85 px-5 text-[16px] font-bold text-primary-foreground shadow-[0_10px_24px_rgba(37,99,235,0.32)] transition-all hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 active:scale-[0.98] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100"
          >
            Open class
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/95">
              <ArrowRight className="h-4 w-4 text-primary" aria-hidden="true" />
            </span>
          </button>
        </div>
      </div>
    </article>
  );
}

/** Soft skeleton mirroring the real card structure (no fake values). */
export function StudentClassCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-[30px] border border-sky-100 bg-white shadow-[0_10px_30px_rgba(37,99,235,0.06)]">
      <Skeleton className="aspect-[16/11] w-full rounded-none" />
      <div className="space-y-3 p-4 sm:p-5">
        <Skeleton className="h-7 w-28 rounded-full" />
        <Skeleton className="h-6 w-3/4 rounded-lg" />
        <Skeleton className="h-4 w-1/2 rounded-lg" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-[58px] w-full rounded-full" />
      </div>
    </div>
  );
}
