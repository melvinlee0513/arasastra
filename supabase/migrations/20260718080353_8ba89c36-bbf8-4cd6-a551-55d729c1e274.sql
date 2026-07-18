
-- 4 legacy quiz_results predate attempt tracking and have no matching submitted
-- attempt. Delete them so we can enforce NOT NULL on attempt_id and remove the
-- old (quiz_id, user_id) uniqueness that blocks multi-attempt.
DELETE FROM public.quiz_results WHERE attempt_id IS NULL;

ALTER TABLE public.quiz_results ALTER COLUMN attempt_id SET NOT NULL;

ALTER TABLE public.quiz_results DROP CONSTRAINT IF EXISTS quiz_results_quiz_id_user_id_key;
