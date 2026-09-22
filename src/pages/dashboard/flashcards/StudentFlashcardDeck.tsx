/**
 * Student deck detail — the calm screen between "My Flashcards" and studying.
 *
 * Read-only: it never starts a study run, so opening a deck to look at it does
 * not change the student's progress. Everything comes from
 * `list_student_flashcard_decks`, which enforces centre, active enrolment,
 * published status and the tenant `flashcards` flag server-side.
 */
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, CheckCircle2, Layers, Play } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { useFeatureEnabled } from "@/hooks/useFeature";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { FeatureUnavailable } from "@/pages/FeatureUnavailable";
import { FlashcardMedia } from "@/components/flashcards/FlashcardMedia";
import {
  DeckTile,
  FilterChips,
  FlashcardEmptyState,
  FlashcardScreen,
  StatTile,
} from "@/components/flashcards/FlashcardChrome";
import {
  FlashcardDueSummary,
  FlashcardMasteryBadge,
  FlashcardMasterySummary,
} from "@/components/flashcards/FlashcardReview";
import { FLASHCARD_ART } from "@/lib/flashcardArt";
import {
  flashcardLibraryKeys,
  flashcardReviewKeys,
  formatFlashcardRelative,
  getStudentFlashcardDeckReview,
  listStudentFlashcardDecks,
  mapFlashcardError,
} from "@/lib/flashcards";

export function StudentFlashcardDeck() {
  const { deckId } = useParams<{ deckId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const flashcardsOn = useFeatureEnabled("flashcards");

  const decksQ = useQuery({
    queryKey: flashcardLibraryKeys.student(currentTenantId, user?.id),
    enabled: !!user && flashcardsOn,
    queryFn: listStudentFlashcardDecks,
    staleTime: 15_000,
  });

  if (!flashcardsOn) return <FeatureUnavailable feature="Flashcards" />;

  const deck = (decksQ.data ?? []).find((d) => d.id === deckId) ?? null;
  const total = deck?.card_count ?? 0;
  const done = Math.min(deck?.completed_card_count ?? 0, total);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <FlashcardScreen>
      <div className="mx-auto w-full max-w-2xl px-4 pb-28 pt-4 sm:px-6">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 rounded-full text-slate-600"
          onClick={() => navigate("/dashboard/flashcards")}
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" /> My Flashcards
        </Button>

        {decksQ.isLoading ? (
          <div className="mt-4 space-y-3">
            <Skeleton className="h-48 rounded-[28px]" />
            <Skeleton className="h-24 rounded-3xl" />
          </div>
        ) : decksQ.isError ? (
          <div className="mt-4 flex items-start gap-2.5 rounded-[28px] border border-amber-200 bg-amber-50 p-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
            <div>
              <p className="text-[14px] font-bold text-slate-900">Couldn't load this deck</p>
              <p className="mt-0.5 text-[13px] text-slate-600">{mapFlashcardError(decksQ.error)}</p>
              <Button variant="outline" className="mt-3 rounded-full" onClick={() => void decksQ.refetch()}>
                Try again
              </Button>
            </div>
          </div>
        ) : !deck ? (
          <div className="mt-4">
            <FlashcardEmptyState
              art={FLASHCARD_ART.empty}
              title="Deck unavailable"
              description="This deck is no longer published for your classes."
              action={
                <Button asChild className="rounded-full">
                  <Link to="/dashboard/flashcards">Back to My Flashcards</Link>
                </Button>
              }
            />
          </div>
        ) : (
          <>
            <section className="relative mt-3 overflow-hidden rounded-[28px] border border-white/70 bg-gradient-to-br from-white via-violet-50 to-violet-100 p-5 shadow-[0_22px_45px_-28px_rgba(76,29,149,0.55)]">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-violet-300/25 blur-2xl"
              />
              {deck.cover_path && (
                <FlashcardMedia
                  media={{ image_path: deck.cover_path, image_alt: `${deck.title} cover` }}
                  className="relative mb-4"
                  enableLightbox={false}
                />
              )}
              <div className="relative flex items-start gap-3">
                <DeckTile className="h-14 w-14" />
                <div className="min-w-0 flex-1">
                  <h1 className="text-[22px] font-black leading-tight tracking-tight text-slate-900">
                    {deck.title}
                  </h1>
                  <p className="mt-1 text-[12.5px] font-semibold text-slate-500">
                    {deck.subject_name ? `${deck.subject_name} · ` : ""}
                    {deck.class_title ?? "Your class"}
                    {deck.form_level ? ` · ${deck.form_level}` : ""}
                  </p>
                </div>
              </div>

              {deck.description && (
                <p className="relative mt-3 text-[14px] leading-relaxed text-slate-600">{deck.description}</p>
              )}

              <p className="relative mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/85 px-3 py-1 text-[12px] font-bold text-violet-700">
                <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                {total} card{total === 1 ? "" : "s"}
              </p>

              {(deck.show_progress ?? true) && total > 0 && (
                <div className="relative mt-4">
                  <div className="flex items-center justify-between text-[12px] font-bold text-slate-600">
                    <span>Your progress</span>
                    <span className="tabular-nums">
                      {done}/{total}
                    </span>
                  </div>
                  <Progress value={pct} className="mt-1.5 h-2.5" aria-label={`${pct}% complete`} />
                </div>
              )}

              <div className="relative mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                {(deck.completed || deck.run_completed_at) && (
                  <p className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-emerald-600">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Deck completed
                  </p>
                )}
                {deck.last_studied_at && (
                  <p className="text-[12.5px] font-semibold text-slate-500">
                    Last studied {formatFlashcardRelative(deck.last_studied_at)}
                  </p>
                )}
              </div>

              <Button
                asChild
                className="relative mt-5 h-13 w-full rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 py-3.5 text-[15.5px] font-extrabold text-white shadow-[0_16px_32px_-16px_rgba(109,40,217,0.9)] hover:from-violet-700 hover:to-indigo-700"
              >
                <Link to={`/dashboard/flashcards/${deck.id}/study`}>
                  <Play className="mr-1.5 h-4 w-4" />
                  {deck.run_completed_at
                    ? "Study again"
                    : deck.started
                      ? "Continue studying"
                      : "Start studying"}
                </Link>
              </Button>
            </section>

            {(deck.show_progress ?? true) && total > 0 && (
              <section className="mt-3 grid grid-cols-3 gap-2.5">
                <StatTile art={FLASHCARD_ART.deck} label="Cards" value={total} />
                <StatTile art={FLASHCARD_ART.star} label="Got it" value={done} />
                <StatTile art={FLASHCARD_ART.target} label="Left" value={Math.max(total - done, 0)} />
              </section>
            )}

            <DeckReviewPanel deckId={deck.id} />
          </>
        )}
      </div>
    </FlashcardScreen>
  );
}

/**
 * Per-student spaced-repetition state for this deck, with lightweight filters
 * over the cards the server queued for review. Counts come from
 * `get_student_flashcard_deck_review` — never computed in the browser.
 */
function DeckReviewPanel({ deckId }: { deckId: string }) {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<"all" | "due" | "learning" | "mastered">("all");

  const q = useQuery({
    queryKey: flashcardReviewKeys.deck(currentTenantId, user?.id, deckId),
    enabled: !!user && !!deckId,
    queryFn: () => getStudentFlashcardDeckReview(deckId, 60),
  });

  if (q.isLoading) return <Skeleton className="mt-3 h-40 rounded-[28px]" />;
  if (q.isError || !q.data) return null;

  const d = q.data;
  const now = Date.now();
  const cards = (d.cards ?? []).filter((c) => {
    if (filter === "due") return !c.due_at || new Date(c.due_at).getTime() <= now;
    if (filter === "learning") return c.mastery === "learning" || c.mastery === "review";
    if (filter === "mastered") return c.mastery === "mastered";
    return true;
  });

  return (
    <section className="mt-3 space-y-3">
      <FlashcardDueSummary
        dueCount={d.due_count}
        newCount={d.new_count}
        nextDueAt={d.next_due_at}
        goal={d.daily_goal}
        onStart={() => navigate(`/dashboard/flashcards/review?deck=${deckId}`)}
      />

      <FlashcardMasterySummary
        mastered={d.mastered_count}
        learning={d.learning_count}
        newCount={d.new_count}
        due={d.due_count}
      />

      {(d.cards ?? []).length > 0 && (
        <>
          <FilterChips
            ariaLabel="Filter cards in this deck"
            active={filter}
            onSelect={(k) => setFilter(k as typeof filter)}
            options={[
              { key: "all", label: "All", count: d.cards.length },
              { key: "due", label: "Due", count: d.due_count },
              { key: "learning", label: "Learning", count: d.learning_count },
              { key: "mastered", label: "Mastered", count: d.mastered_count },
            ]}
          />
          <ul className="space-y-2">
            {cards.map((c) => (
              <li
                key={c.card_id}
                className="flex items-center gap-2.5 rounded-2xl border border-violet-100 bg-white p-3 shadow-[0_10px_28px_-22px_rgba(76,29,149,0.45)]"
              >
                <p className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-slate-800">
                  {c.front_text || "Card"}
                </p>
                <FlashcardMasteryBadge mastery={c.mastery} />
              </li>
            ))}
            {cards.length === 0 && (
              <li className="rounded-2xl border border-violet-100 bg-white p-4 text-center text-[13px] text-slate-500">
                Nothing in this group yet.
              </li>
            )}
          </ul>
        </>
      )}
    </section>
  );
}

export default StudentFlashcardDeck;
