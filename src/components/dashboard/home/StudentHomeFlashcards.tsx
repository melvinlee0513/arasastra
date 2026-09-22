/**
 * Home entry point into flashcard review. Shows only when the tenant has the
 * `flashcards` feature on and the student actually has cards tracked or due —
 * counts come straight from `get_student_flashcard_overview`.
 */
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { useFeatureEnabled } from "@/hooks/useFeature";
import { FlashcardDueSummary } from "@/components/flashcards/FlashcardReview";
import { flashcardReviewKeys, getStudentFlashcardOverview } from "@/lib/flashcards";

export function StudentHomeFlashcards() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const flashcardsOn = useFeatureEnabled("flashcards");

  const q = useQuery({
    queryKey: flashcardReviewKeys.overview(currentTenantId, user?.id),
    enabled: !!user && flashcardsOn,
    queryFn: getStudentFlashcardOverview,
    staleTime: 30_000,
  });

  const data = q.data;
  if (!flashcardsOn || !data || (data.decks?.length ?? 0) === 0) return null;

  return (
    <section aria-label="Flashcard review">
      <h2 className="mb-2.5 text-[15.5px] font-extrabold text-slate-900">Flashcard Review</h2>
      <FlashcardDueSummary
        dueCount={data.due_count ?? 0}
        nextDueAt={data.next_due_at ?? null}
        goalDone={data.reviewed_today ?? 0}
        goal={data.daily_goal ?? 20}
        startLabel="Review Now"
        onStart={() => navigate("/dashboard/flashcards/review")}
      />
    </section>
  );
}

export default StudentHomeFlashcards;
