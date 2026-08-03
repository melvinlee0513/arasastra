REVOKE ALL ON FUNCTION public.flashcards_enforce_center() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.flashcard_decks_validate() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.flashcards_enforce_center() TO service_role;
GRANT EXECUTE ON FUNCTION public.flashcard_decks_validate() TO service_role;