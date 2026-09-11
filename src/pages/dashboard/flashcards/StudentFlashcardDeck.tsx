/**
 * Student deck detail — the calm screen between "My Flashcards" and studying.
 *
 * Read-only: it never starts a study run, so opening a deck to look at it does
 * not change the student's progress. Everything comes from
 * `list_student_flashcard_decks`, which enforces centre, active enrolment,
 * published status and the tenant `flashcards` flag server-side.
 */
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
  FlashcardEmptyState,
  FlashcardScreen,
  StatTile,
} from "@/components/flashcards/FlashcardChrome";
import { FLASHCARD_ART } from "@/lib/flashcardArt";
import {
  flashcardLibraryKeys,
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

              {deck.completed && (
                <p className="relative mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-bold text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Deck completed
                </p>
              )}

              <Button
                asChild
                className="relative mt-5 h-13 w-full rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 py-3.5 text-[15.5px] font-extrabold text-white shadow-[0_16px_32px_-16px_rgba(109,40,217,0.9)] hover:from-violet-700 hover:to-indigo-700"
              >
                <Link to={`/dashboard/flashcards/${deck.id}/study`}>
                  <Play className="mr-1.5 h-4 w-4" />
                  {deck.started ? "Continue studying" : "Start studying"}
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
          </>
        )}
      </div>
    </FlashcardScreen>
  );
}

export default StudentFlashcardDeck;
