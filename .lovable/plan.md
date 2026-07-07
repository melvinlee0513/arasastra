# Aras A+ — Next Architecture Layer

This request spans ~4 major subsystems + polish. Delivering it as one drop would produce a huge unreviewable change and likely break in-flight flows. I'll ship it in **4 sequenced phases**, each independently testable. Confirm the order (or reprioritize) before I start Phase 1.

---

## Phase 1 — Administrative Backbone

**Schema (migration):**
- `subjects`: confirm `center_id`, add `status (active|archived)`, `archived_at`.
- `classes`: ensure `center_id`, `subject_id`, `class_name`, `cohort_name`, `academic_year`, `schedule_label`, `status`, `created_by`.
- New `class_tutors (center_id, class_id, tutor_user_id, assigned_by, assigned_at)` with `unique(center_id, class_id, tutor_user_id)`. Migrate existing `classes.tutor_id` data over.
- New `class_enrollments (center_id, class_id, student_user_id, enrolled_by, enrolled_at, status)` with `unique(center_id, student_user_id, class_id)` (partial where status='active'). Migrate existing `enrollments` data; keep old table until Phase 2 read paths cut over.
- RLS: admin scoped to `get_user_center()`; tutor read-only on own rows; students read-only on own enrollments. `service_role` grants.

**Edge Function:** `admin-invite-user` (already exists for students) extended to invite **tutors** — creates auth user with role=tutor, forces `center_id`, blocks role escalation.

**UI:**
- `/admin/curriculum` — Subjects CRUD (archive, not delete).
- `/admin/classes` — Class instance CRUD + "Assign Tutors" drawer (multi-select via `class_tutors`).
- `/admin/users` — new "Invite Tutor" action; extend Enrollment Matrix to bulk-enroll into one class (multi-select students, filters by form/status/search).

## Phase 2 — Tutor Content Pipeline

**Schema:**
- `class_resources (center_id, class_id, subject_id, uploaded_by, title, description, resource_type, source_type, file_url, file_path, external_url, embed_url, status, created_at, published_at)`.
- `quizzes` extend: `total_points`, `status`, `published_at`, `subject_id`.
- `quiz_questions` extend: `question_type`, `points`, `order_index`.
- New `quiz_options (center_id, question_id, option_text, is_correct, order_index)` — replaces the current JSON `options` array.
- `student_quiz_attempts` + `student_quiz_answers` (auto-grading records).
- RLS: only tutors in `class_tutors` for the class (or center admin) can write; students read only when enrolled + `status='published'`.

**Edge Functions:**
- `google-drive-oauth` + `onedrive-oauth` — token exchange stays server-side; tokens stored in a `tutor_connected_accounts` table encrypted at rest, never exposed to frontend. Uses Lovable connectors (`google_drive`, `microsoft_onedrive`) where possible.

**UI:**
- `/tutor/classes/:classId/resources` — unified hub (tabs: Notes, Videos, Worksheets, Quizzes, Flashcards, Links).
- Attach Material modal: Local Upload / Google Drive picker / OneDrive picker / External URL / YouTube-Vimeo.
- `/tutor/settings/connections` — Connect/Disconnect Drive & OneDrive.
- Quiz Builder v2: dnd-kit reorder, MC + True/False, point values, publish/draft.
- Quiz Play auto-grades on submit; results land in analytics.

## Phase 3 — Gamified Student Experience

**Schema:**
- `student_streaks (center_id, student_user_id, current_streak, longest_streak, last_activity_date)`.
- `student_xp_events (center_id, student_user_id, event_type, xp_amount, source_id, source_type)`.
- `student_progress` view/table: `total_xp`, `current_level` (derived).
- Postgres function `record_learning_activity(event_type, source_id, source_type)` — updates streak + inserts XP atomically.

**UI:**
- Streak flame in top bar (already partially present) — wire to real `student_streaks`.
- XP bar + level chip on `/dashboard`.
- Circular progress rings component (SVG, animated) for Subject/Class/Quiz/Video/Flashcard mastery.
- Flashcard play: XP burst animation on "Got It", streak counter, review pile, completion summary (extend current `FlashcardSwipeEngine`).
- "Next recommended action" card driven by lowest-mastery subject.

## Phase 4 — Polish

- Global Supabase error mapper (`src/lib/supabaseErrors.ts`) — maps `23505`, `23503`, `42501`, RLS, auth errors to friendly toast copy; single `showSupabaseError(err)` helper used everywhere.
- Sweep all `catch` blocks in admin/tutor/student mutation paths to use it.
- Mobile audit pass on the listed routes: hamburger sidebar, table→card collapse, modal viewport fit, flashcard touch targets, enrollment matrix mobile layout.

---

## Technical Notes

- All new tables get `center_id NOT NULL` + `GRANT SELECT/INSERT/UPDATE/DELETE ON ... TO authenticated; GRANT ALL TO service_role;` + `ENABLE RLS` + policies using `same_center_as_current_user()` / `has_role()` / `class_tutors` join for tutor writes.
- No service role key on frontend — Drive/OneDrive OAuth stays in edge functions.
- Existing `enrollments` table stays until all reads migrate to `class_enrollments`, then dropped in a follow-up migration.
- Use existing `tutor_assignments` only if you want to keep subject/standard-level assignment; otherwise `class_tutors` supersedes it. Confirm which to keep.

---

## Questions before I start

1. **Phase order** — start with Phase 1 (backbone) as listed, or a different order?
2. **`tutor_assignments` vs `class_tutors`** — keep both (subject-level + class-level) or replace `tutor_assignments` with `class_tutors`?
3. **Drive/OneDrive** — OK to use the existing Lovable connectors (workspace-scoped OAuth), or do you need per-tutor OAuth (each tutor connects their own account, requiring us to register Google/Microsoft OAuth apps and store per-user tokens)?
4. **Scope per turn** — should I ship one phase per message, or split further (e.g. Phase 1 migration first, then Phase 1 UI)?

Reply with answers (or "go, defaults") and I'll start Phase 1.
