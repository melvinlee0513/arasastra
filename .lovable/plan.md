# Retire the legacy quiz surfaces that still query quiz questions directly

## What is happening

Quiz questions are deliberately locked down at the database level: no direct table access for signed-in users, because the question rows contain the correct answers. All supported quiz screens (per-class quiz manager, builder, student quiz hub, attempt, results, analytics) already go through secure server functions and work correctly.

Four older screens were never migrated and still read/write the question table directly, so they now fail with a permission error:

- Admin CMS "Quiz Manager" tab (create/edit quizzes and questions in the old format)
- Legacy quiz analytics page at `/admin/quiz-analytics` and `/tutor/quiz-analytics`
- An unused student quiz list page (not linked anywhere)
- An unused tutor quiz builder page (not linked anywhere)

Re-opening table access to fix them would undo the earlier security fix and let students read correct answers before submitting. So the fix is to retire these legacy screens instead.

## Plan

1. Delete the two unreachable legacy files and their unused imports: the old student quiz list and the old tutor quiz builder.
2. Remove the Quiz Manager tab from the admin CMS. Quiz creation and editing stays in the canonical per-class quiz manager (Classes > class > Quizzes).
3. Remove the two legacy quiz-analytics routes and page. Canonical per-quiz analytics (already working, class-scoped) remains at the class quiz analytics route; add a short pointer in the admin/tutor navigation so the entry point is not lost.
4. Clean up navigation/sidebar links pointing at the removed routes so no dead links remain.
5. Verify: typecheck, build, and a signed-in walkthrough of the canonical quiz manager, student quiz flow, and class quiz analytics to confirm no permission errors remain.

## Not included

- No database changes: table permissions stay as they are (locked down).
- No changes to the canonical quiz engine, RLS, or existing quiz data.
