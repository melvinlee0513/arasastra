/**
 * Student "My Flashcards" — the cross-class review home.
 *
 * Everything shown here comes from `get_student_flashcard_overview`, which
 * resolves the caller's centre, active enrolments and the tenant `flashcards`
 * flag server-side. Per-card scheduling is per student: no shared mastery.
 */
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Flame, Layers, Sparkles, Target, ChevronRight, AlertTriangle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { useFeatureEnabled } from "@/hooks/useFeature";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { FeatureUnavailable } from "@/pages/FeatureUnavailable";
import { cn } from "@/lib/utils";
import {
  flashcardReviewKeys,
  getStudentFlashcardOverview,
  mapFlashcardError,
  type FlashcardOverviewDeck,
} from "@/lib/flashcards";

export function MyFlashcards() {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const flashcardsOn = useFeatureEnabled("flashcards");

  const overview = useQuery({
    queryKey: flashcardReviewKeys.overview(currentTenantId, user?.id),
    enabled: !!user && flashcardsOn,
    queryFn: getStudentFlashcardOverview,
  });

  if (!flashcardsOn) return <FeatureUnavailable feature="Flashcards" />;

  const data = overview.data;
  const goal = data?.daily_goal ?? 20;
  const done = Math.min(data?.reviewed_today ?? 0, goal);
  const pct = goal > 0 ? Math.round((done / goal) * 100) : 0;
  const newCount = (data?.decks ?? []).reduce((n, d) => n + (d.new_count ?? 0), 0);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-24 pt-4 sm:px-6">
      <header>
        <h1 className="text-[22px] font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          My Flashcards
        </h1>
        <p className="mt-1 text-[13.5px] text-slate-500">
          Short daily reviews keep what you learn from slipping away.
        </p>
      </header>

      {overview.isLoading ? (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-36 rounded-3xl" />
          <Skeleton className="h-24 rounded-3xl" />
          <Skeleton className="h-24 rounded-3xl" />
        </div>
      ) : overview.isError ? (
        <div className="mt-4 flex items-start gap-2.5 rounded-3xl border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
          <div>
            <p className="text-[14px] font-bold text-slate-900">Couldn't load your flashcards</p>
            <p className="mt-0.5 text-[13px] text-slate-600">{mapFlashcardError(overview.error)}</p>
            <Button
              variant="outline"
              className="mt-3 rounded-full"
              onClick={() => void overview.refetch()}
            >
              Try again
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* Today's review hero */}
          <section className="mt-4 rounded-3xl bg-gradient-to-br from-[hsl(214,90%,54%)] to-[hsl(258,80%,60%)] p-5 text-white shadow-[0_18px_40px_-24px_rgba(15,23,42,0.7)]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11.5px] font-black uppercase tracking-wide text-white/75">
                  Today's review
                </p>
                <p className="mt-1 text-[30px] font-black leading-none">
                  {data?.due_count ?? 0}
                  <span className="ml-1.5 text-[14px] font-bold text-white/80">
                    card{(data?.due_count ?? 0) === 1 ? "" : "s"} due
                  </span>
                </p>
                <p className="mt-1 text-[13px] text-white/80">
                  {newCount > 0
                    ? "Plus new cards waiting to be learned."
                    : "Keep your streak alive with a quick session."}
                </p>
              </div>
              <Sparkles className="h-7 w-7 shrink-0 text-white/80" aria-hidden="true" />
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between text-[12px] font-semibold text-white/85">
                <span>Daily goal</span>
                <span className="tabular-nums">
                  {done}/{goal}
                </span>
              </div>
              <Progress value={pct} className="mt-1.5 h-2 bg-white/25" />
            </div>

            <Button
              asChild
              className="mt-4 h-12 w-full rounded-full bg-white text-[15px] font-extrabold text-[hsl(214,90%,44%)] hover:bg-white/90"
            >
              <Link to="/dashboard/flashcards/review">
                {(data?.due_count ?? 0) + newCount > 0
                  ? "Start review"
                  : "Practise anyway"}
              </Link>
            </Button>
          </section>

          {/* Stats */}
          <section className="mt-3 grid grid-cols-3 gap-2.5">
            <Stat icon={<Target className="h-4 w-4" />} label="Learning" value={data?.learning_count ?? 0} />
            <Stat icon={<Layers className="h-4 w-4" />} label="Mastered" value={data?.mastered_count ?? 0} />
            <Stat icon={<Flame className="h-4 w-4" />} label="Streak" value={data?.current_streak ?? 0} />
          </section>

          {/* Decks */}
          <section className="mt-5">
            <h2 className="text-[15px] font-extrabold text-slate-900">Your decks</h2>
            {(data?.decks.length ?? 0) === 0 ? (
              <div className="mt-3 rounded-3xl border border-dashed border-slate-300 bg-white p-6 text-center">
                <Layers className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" />
                <p className="mt-2 text-[14px] font-bold text-slate-900">No flashcards yet</p>
                <p className="mt-1 text-[13px] text-slate-500">
                  When your teacher publishes a deck for one of your classes, it appears here.
                </p>
              </div>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {data!.decks.map((d) => (
                  <li key={d.id}>
                    <DeckRow deck={d} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
        {icon}
      </span>
      <p className="mt-2 text-[19px] font-black leading-none tabular-nums text-slate-900">{value}</p>
      <p className="mt-0.5 text-[11.5px] font-semibold text-slate-500">{label}</p>
    </div>
  );
}

function DeckRow({ deck }: { deck: FlashcardOverviewDeck }) {
  const total = deck.card_count || 0;
  const pct = total > 0 ? Math.round((deck.mastered_count / total) * 100) : 0;
  return (
    <Link
      to={`/dashboard/classes/${deck.class_id}/flashcards`}
      className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-white p-3.5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition active:scale-[0.99]"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[hsl(214,90%,96%)] text-[hsl(214,90%,44%)]">
        <Layers className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14.5px] font-bold text-slate-900">{deck.title}</p>
        <p className="truncate text-[12px] text-slate-500">
          {deck.subject_name ? `${deck.subject_name} · ` : ""}
          {deck.class_title}
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <Progress value={pct} className="h-1.5 flex-1" />
          <span className="shrink-0 text-[11px] font-bold tabular-nums text-slate-500">
            {deck.mastered_count}/{total}
          </span>
        </div>
      </div>
      <span
        className={cn(
          "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-black tabular-nums",
          deck.due_count > 0
            ? "bg-[hsl(214,90%,95%)] text-[hsl(214,90%,42%)]"
            : "bg-slate-100 text-slate-400",
        )}
      >
        {deck.due_count > 0 ? `${deck.due_count} due` : "Up to date"}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden="true" />
    </Link>
  );
}

export default MyFlashcards;
