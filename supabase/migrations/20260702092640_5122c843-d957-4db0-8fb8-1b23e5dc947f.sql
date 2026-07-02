
DROP POLICY IF EXISTS "Anyone can view notes" ON public.notes;
DROP POLICY IF EXISTS "Anyone can view quizzes" ON public.quizzes;
DROP POLICY IF EXISTS "Anyone can view flashcard decks" ON public.flashcard_decks;

CREATE POLICY "Authenticated can view notes"
  ON public.notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can view quizzes"
  ON public.quizzes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can view flashcard decks"
  ON public.flashcard_decks FOR SELECT TO authenticated USING (true);
