/**
 * Student "My Flashcards" — the cross-class review home.
 *
 * Everything shown here comes from `get_student_flashcard_overview`, which
 * resolves the caller's centre, active enrolments and the tenant `flashcards`
 * flag server-side. Per-card scheduling is per student: no shared mastery.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronRight, Play, Search } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { useFeatureEnabled } from "@/hooks/useFeature";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { FeatureUnavailable } from "@/pages/FeatureUnavailable";
import { cn } from "@/lib/utils";
import { FLASHCARD_ART } from "@/lib/flashcardArt";
import {
  DeckTile,
  FilterChips,
  FlashcardEmptyState,
  FlashcardHero,
  FlashcardScreen,
  HeroStat,
  StatTile,
} from "@/components/flashcards/FlashcardChrome";
import {
  flashcardReviewKeys,
  getStudentFlashcardOverview,
  mapFlashcardError,
  type FlashcardOverviewDeck,
} from "@/lib/flashcards";

type DeckFilter = "all" | "due" | "mastered";

export function MyFlashcards() {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const flashcardsOn = useFeatureEnabled("flashcards");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<DeckFilter>("all");

  const overview = useQuery({
    queryKey: flashcardReviewKeys.overview(currentTenantId, user?.id),
    enabled: !!user && flashcardsOn,
    queryFn: getStudentFlashcardOverview,
  });

  const data = overview.data;
  const allDecks = data?.decks ?? [];

  const decks = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allDecks.filter((d) => {
      const mastered = d.card_count > 0 && d.mastered_count >= d.card_count;
      if (filter === "due" && d.due_count <= 0) return false;
      if (filter === "mastered" && !mastered) return false;
      if (!term) return true;
      return (
        d.title.toLowerCase().includes(term) ||
        (d.subject_name ?? "").toLowerCase().includes(term) ||
        (d.class_title ?? "").toLowerCase().includes(term)
      );
    });
  }, [allDecks, filter, search]);

  if (!flashcardsOn) return <FeatureUnavailable feature="Flashcards" />;

  const goal = data?.daily_goal ?? 20;
  const done = Math.min(data?.reviewed_today ?? 0, goal);
  const pct = goal > 0 ? Math.round((done / goal) * 100) : 0;
  const newCount = allDecks.reduce((n, d) => n + (d.new_count ?? 0), 0);
  const dueCount = data?.due_count ?? 0;
  const masteredDecks = allDecks.filter((d) => d.card_count > 0 && d.mastered_count >= d.card_count).length;
  const dueDecks = allDecks.filter((d) => d.due_count > 0).length;

  return (
    <FlashcardScreen>
      <div className="mx-auto w-full max-w-4xl px-4 pb-28 pt-4 sm:px-6">
        {overview.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-44 rounded-[28px]" />
            <Skeleton className="h-24 rounded-3xl" />
            <Skeleton className="h-24 rounded-3xl" />
          </div>
        ) : overview.isError ? (
          <div className="flex items-start gap-2.5 rounded-[28px] border border-amber-200 bg-amber-50 p-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
            <div>
              <p className="text-[14px] font-bold text-slate-900">Couldn't load your flashcards</p>
              <p className="mt-0.5 text-[13px] text-slate-600">{mapFlashcardError(overview.error)}</p>
              <Button variant="outline" className="mt-3 rounded-full" onClick={() => void overview.refetch()}>
                Try again
              </Button>
            </div>
          </div>
        ) : (
          <>
            <FlashcardHero
              eyebrow="My flashcards"
              title={
                dueCount > 0
                  ? `${dueCount} card${dueCount === 1 ? "" : "s"} ready for you`
                  : "You're all caught up"
              }
              subtitle={
                dueCount + newCount > 0
                  ? "A few minutes today keeps what you learn from slipping away."
                  : "Practise any deck to keep your memory sharp."
              }
              art={FLASHCARD_ART.studentHero}
            >
              <div className="grid grid-cols-3 gap-2">
                <HeroStat label="Learning" value={data?.learning_count ?? 0} />
                <HeroStat label="Mastered" value={data?.mastered_count ?? 0} />
                <HeroStat label="Streak" value={data?.current_streak ?? 0} />
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between text-[12px] font-bold text-white/85">
                  <span>Daily goal</span>
                  <span className="tabular-nums">
                    {done}/{goal}
                  </span>
                </div>
                <Progress value={pct} className="mt-1.5 h-2 bg-white/25" aria-label={`${pct}% of today's goal`} />
              </div>

              <Button
                asChild
                className="mt-4 h-12 w-full rounded-full bg-white text-[15px] font-extrabold text-violet-700 shadow-[0_14px_28px_-16px_rgba(15,23,42,0.7)] hover:bg-white/90"
              >
                <Link to="/dashboard/flashcards/review">
                  <Play className="mr-1.5 h-4 w-4" />
                  {dueCount + newCount > 0 ? "Start review" : "Practise anyway"}
                </Link>
              </Button>
            </FlashcardHero>

            <section className="mt-3 grid grid-cols-3 gap-2.5">
              <StatTile art={FLASHCARD_ART.deck} label="Decks" value={allDecks.length} />
              <StatTile art={FLASHCARD_ART.target} label="Decks due" value={dueDecks} />
              <StatTile art={FLASHCARD_ART.star} label="Decks done" value={masteredDecks} />
            </section>

            {allDecks.length > 0 && (
              <div className="mt-5 space-y-2.5">
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search your decks…"
                    aria-label="Search your flashcard decks"
                    className="min-h-[46px] rounded-full border-violet-100 bg-white pl-10 text-[14.5px] shadow-[0_10px_26px_-20px_rgba(76,29,149,0.5)]"
                  />
                </div>
                <FilterChips
                  ariaLabel="Filter your decks"
                  active={filter}
                  onSelect={(k) => setFilter(k as DeckFilter)}
                  options={[
                    { key: "all", label: "All", count: allDecks.length },
                    { key: "due", label: "Due", count: dueDecks },
                    { key: "mastered", label: "Mastered", count: masteredDecks },
                  ]}
                />
              </div>
            )}

            <section className="mt-4">
              <h2 className="text-[15.5px] font-extrabold text-slate-900">Your decks</h2>
              {allDecks.length === 0 ? (
                <div className="mt-3">
                  <FlashcardEmptyState
                    art={FLASHCARD_ART.empty}
                    title="No flashcards yet"
                    description="When your teacher publishes a deck for one of your classes, it will appear here."
                  />
                </div>
              ) : decks.length === 0 ? (
                <div className="mt-3">
                  <FlashcardEmptyState
                    art={FLASHCARD_ART.empty}
                    title="Nothing matches that"
                    description="Try a different word, or switch back to All."
                    action={
                      <Button
                        variant="outline"
                        className="rounded-full"
                        onClick={() => {
                          setSearch("");
                          setFilter("all");
                        }}
                      >
                        Clear filters
                      </Button>
                    }
                  />
                </div>
              ) : (
                <ul className="mt-3 space-y-2.5">
                  {decks.map((d) => (
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
    </FlashcardScreen>
  );
}

function DeckRow({ deck }: { deck: FlashcardOverviewDeck }) {
  const total = deck.card_count || 0;
  const pct = total > 0 ? Math.round((deck.mastered_count / total) * 100) : 0;
  return (
    <Link
      to={`/dashboard/flashcards/${deck.id}`}
      className="flex items-center gap-3 rounded-[24px] border border-violet-100 bg-white p-3.5 shadow-[0_14px_34px_-24px_rgba(76,29,149,0.5)] transition hover:border-violet-200 hover:shadow-[0_18px_38px_-22px_rgba(76,29,149,0.55)] active:scale-[0.99]"
    >
      <DeckTile />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14.5px] font-extrabold text-slate-900">{deck.title}</p>
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
          "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black tabular-nums",
          deck.due_count > 0 ? "bg-violet-100 text-violet-700" : "bg-emerald-50 text-emerald-600",
        )}
      >
        {deck.due_count > 0 ? `${deck.due_count} due` : "Up to date"}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden="true" />
    </Link>
  );
}

export default MyFlashcards;
