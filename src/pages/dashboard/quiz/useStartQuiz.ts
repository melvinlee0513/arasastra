import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { mapQuizError, quizStudentKeys, startQuizAttempt } from "@/lib/quizzes";
import { studentQuizKeys, type StudentQuizFeedRow } from "@/lib/studentQuizzes";
import { showSupabaseError } from "@/lib/supabaseErrors";

/**
 * Shared "start / resume attempt" action for the Quiz Hub and Quiz Library.
 * Attempt creation stays server-authoritative (`start_quiz_attempt`), which
 * enforces enrolment, publication, availability window and attempt limits.
 */
export function useStartQuiz() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { currentTenantId } = useTenant();

  const mutation = useMutation({
    mutationFn: (row: StudentQuizFeedRow) => startQuizAttempt(row.id),
    onSuccess: (attemptId, row) => {
      qc.invalidateQueries({ queryKey: studentQuizKeys.feed(currentTenantId, user?.id) });
      qc.invalidateQueries({
        queryKey: quizStudentKeys.list(currentTenantId, row.class_id, user?.id),
      });
      navigate(`/dashboard/classes/${row.class_id}/quizzes/${row.id}/attempt/${attemptId}`);
    },
    onError: (err) => {
      const msg = mapQuizError(err);
      if (msg === "Something went wrong. Please try again.") showSupabaseError(err);
      else toast.error(msg);
    },
  });

  return {
    start: (row: StudentQuizFeedRow) => mutation.mutate(row),
    isStarting: mutation.isPending,
    startingId: mutation.isPending ? mutation.variables?.id ?? null : null,
  };
}
