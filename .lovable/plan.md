# Flashcards 2.0 core + shared editor completion

## One conflict to settle first

The brief says "do not build spaced repetition". That part already exists from the previous sprint: daily review queue, Again/Hard/Good/Easy rating, card mastery and review-based rewards are live at "My Flashcards" and "Today's Review".

I will **keep** it and build the new core experience alongside it, rather than delete working paid-for work. The new deck-by-deck study flow becomes the main path; Today's Review stays as a second entry point on the same page. Say the word if you'd rather hide the review flow entirely.

## Already done (no work needed)

- Formatted text + equations in quiz questions, answer choices, explanations, and the Question Bank, including student gameplay and results.
- Flashcard front/back already store formatted content with equations.

## What gets built

### 1. Cards get pictures
New optional image on the front and on the back of a card: upload, preview, replace, remove, simple crop. Stored privately per centre, shown through short-lived secure links, same as quiz question images. Small additive database change plus a private storage area.

### 2. Tutor / admin flashcard library
A single library page listing every deck the tutor or admin can manage across their classes: hero with deck and card counts, search, and Draft / Published filters. Deck cards show cover, title, subject, form, card count, status, Edit and Preview. Sticky "Create Deck" button on mobile.

### 3. Deck builder and card editor
Deck builder header shows deck identity, status and card count; card list supports search, reorder, edit, duplicate and delete with a front-content preview and picture indicator. Card editor edits Front and Back with the existing formatted-text-and-maths editor plus one picture each, and tags for organisation.

### 4. Deck settings
Draft / Published, class assignment, cover image upload/replace/remove, show-progress and award-XP toggles, and real stats only (total cards, students who opened it, total reviews).

### 5. Student side
- **My Flashcards**: hero, search, All / In Progress / Completed filters, deck cards with real progress and Start / Continue Studying.
- **Deck detail**: title, subject, card count, progress, Start or Continue Study.
- **Study session**: "Lavender Stars" themed card — light lavender gradient, soft sparkles, rounded, soft shadow — with a 3D flip (about 400ms, fades instead when the device asks for reduced motion), Previous / Flip / Next, card counter and progress bar, then a completion screen with cards reviewed and XP earned, plus Study Again and Back to Flashcards.

### 6. Navigation
Flashcards entry points in the tutor and admin workspaces and in student navigation, all hidden when the flashcards feature is switched off for a centre.

## Technical notes

- Additive migration only: `front_image_path`/`back_image_path` (+ width/height/alt/crop) and `tags` on `flashcards`, cover image on `flashcard_decks`, plus a simple `flashcard_deck_sessions`-style progress record (reuse existing `flashcard_deck_progress` where it fits). New private bucket `flashcard-media` with tenant + enrolment scoped read policies.
- New RPCs: centre-wide manager deck list, deck detail for student, session position save. Existing `save_flashcard_deck`, `set_flashcard_deck_status`, `get_flashcard_deck_for_study`, `record_flashcard_deck_completion` are reused.
- Routes: `/tutor/flashcards`, `/tutor/flashcards/:deckId`, `/tutor/flashcards/:deckId/cards/:cardId`, `/tutor/flashcards/:deckId/settings` (+ `/admin/...` equivalents); `/dashboard/flashcards/:deckId` and `/dashboard/flashcards/:deckId/study`.
- Shared `RichTextRenderer` used everywhere; no second editor, no second renderer.
- RLS stays on; centre scoping and enrolment checks enforced server-side. Deck lists load summaries only; cards load when a deck opens.

## Not built (per the brief)

Excel/CSV import, AI generation from notes or PDFs, audio/video cards, deck sharing or marketplace, flashcard multiplayer, new quiz game modes.
