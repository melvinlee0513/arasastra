-- Aras A+ B2b regression matrix — quiz definition, lifecycle and manager access.
-- Authored 2026-08-01. NOT auto-executed by CI and NOT executed by the agent.
-- Every case below is marked [W] (written, not executed) unless a later run
-- upgrades it. Run manually against a disposable branch DB, inside a
-- transaction you roll back. Do NOT run against Sri Sarjana production.
--
-- Legend:
--   [E] executed against a live DB with a real authenticated role
--   [W] written, not executed
--   [S] schema/definition verified only (NOT a runtime pass)
--
-- Impersonation helper used below (PostgREST-equivalent):
--   SET LOCAL ROLE authenticated;
--   SET LOCAL request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}';
--
-- Fixture (build in scratch DB, single transaction, ROLLBACK at end):
--   C1 = QA tenant, C2 = foreign tenant
--   CLS1 = class in C1 ; CLS2 = class in C2
--   ADMIN1 (admin, C1, NOT in class_tutors)
--   TUT_A  (tutor, C1, assigned to CLS1 via class_tutors)
--   TUT_U  (tutor, C1, NOT assigned to CLS1)
--   STU_E  (student, C1, active class_enrollments row for CLS1)
--   STU_N  (student, C1, no enrollment)
--   ADMIN2 (admin, C2)
--   STU_F  (student, C2, enrolled in CLS2)

BEGIN;

-- =====================================================================
-- 1. MANAGER ACCESS CONTROL
-- =====================================================================

-- 1.1 [W] Assigned tutor can list class quizzes
--   as TUT_A: SELECT * FROM public.list_class_quizzes_for_manager(CLS1);
--   EXPECT rows returned, no exception.

-- 1.2 [W] Unassigned same-centre tutor denied
--   as TUT_U: SELECT * FROM public.list_class_quizzes_for_manager(CLS1);
--   EXPECT ERROR 42501.

-- 1.3 [W] Same-centre admin can manage without tutor assignment
--   as ADMIN1: list_class_quizzes_for_manager(CLS1) -> rows, no error.
--   as ADMIN1: save_quiz_definition(CLS1, <valid draft>) -> quiz id returned.

-- 1.4 [W] Foreign-tenant admin denied
--   as ADMIN2: list_class_quizzes_for_manager(CLS1) -> ERROR 42501.
--   as ADMIN2: get_quiz_definition_for_manager(<C1 quiz>) -> ERROR 42501
--              (message 'access_denied', no title/question text in payload).

-- 1.5 [W] Student denied manager RPCs
--   as STU_E: list_class_quizzes_for_manager(CLS1)        -> ERROR 42501
--   as STU_E: get_quiz_definition_for_manager(<C1 quiz>)  -> ERROR 42501
--   as STU_E: get_quiz_results_for_manager(<C1 quiz>)     -> ERROR 42501
--   as STU_E: get_quiz_attempt_for_manager(<attempt>)     -> ERROR 42501

-- 1.6 [E] Anonymous denied every manager RPC
--   Executed 2026-08-01 via PostgREST with the anon publishable key using the
--   exact deployed signatures. Result: 401 / 42501
--   'permission denied for function ...' for list_class_quizzes_for_manager,
--   get_quiz_results_for_manager, get_quiz_attempt_for_manager,
--   save_quiz_definition, set_quiz_status, release_quiz_results,
--   hide_quiz_results, duplicate_quiz_as_draft, delete_quiz_safe.
--   get_quiz_definition_for_manager returned 42501 'not_authenticated'
--   (anon EXECUTE has since been revoked).

-- 1.7 [E] Anonymous raw table reads denied
--   quizzes / quiz_questions / quiz_options -> 42501.
--   quiz_results / student_quiz_answers previously returned 200 [] because anon
--   held table grants (0 rows: policies are authenticated-only). Grants revoked
--   2026-08-01; re-run must now return 42501 'permission denied for table ...'.
--   RE-RUN REQUIRED [W].

-- =====================================================================
-- 2. QUIZ BUILDER VALIDATION (save_quiz_definition)
-- =====================================================================
-- Signature: save_quiz_definition(_class_id uuid, _definition jsonb,
--            _quiz_id uuid DEFAULT NULL, _publish boolean DEFAULT false,
--            _expected_version integer DEFAULT NULL)

-- 2.1 [W] Incomplete draft saves
--   _publish=false with a blank-option question -> succeeds, status='draft'.

-- 2.2 [W] Valid MCQ publishes
--   4 options, exactly one is_correct -> succeeds, status='published',
--   published_at NOT NULL, total_points = sum(points).

-- 2.3 [W] Valid true/false publishes
--   question_type='true_false', 2 options, one correct -> succeeds.

-- 2.4 [W] Zero correct answers rejected on publish -> ERROR 22023.
-- 2.5 [W] Multiple correct answers rejected on publish -> ERROR 22023.
-- 2.6 [W] Blank / whitespace-only option text rejected on publish -> ERROR 22023.
-- 2.7 [W] Question with fewer than 2 options rejected on publish -> ERROR 22023.
-- 2.8 [W] Unsupported question_type (e.g. 'essay') rejected -> ERROR 22023.
-- 2.9 [W] Publish with zero questions rejected -> ERROR 22023.
-- 2.10 [W] due_at <= available_from rejected -> ERROR 22023.
-- 2.11 [W] time_limit_seconds <= 0 rejected -> ERROR 22023.
-- 2.12 [W] result_visibility='after_due' with due_at NULL rejected on publish
--          -> ERROR 22023 (quizzes_visibility_guard trigger).
-- 2.13 [W] Negative or zero points rejected -> ERROR 22023.
-- 2.14 [W] attempt_limit < 1 rejected -> ERROR 22023.

-- =====================================================================
-- 3. OPTIMISTIC CONCURRENCY + POST-ATTEMPT LOCKS
-- =====================================================================

-- 3.1 [W] Stale _expected_version rejected
--   Read definition_version = v. Save once (version -> v+1).
--   Save again with _expected_version = v -> ERROR 40001-class conflict
--   ('definition_version_conflict'). No partial question mutation persists.

-- 3.2 [W] Matching _expected_version succeeds and increments the version.

-- 3.3 [W] Grading-sensitive edits rejected once attempts exist
--   With >=1 quiz_attempts row for the quiz, attempt to change:
--     question text set, option set, is_correct flags, points,
--     add question, delete question
--   EXPECT ERROR 42501/22023 'locked'. Verify quiz_questions / quiz_options
--   rows are byte-identical afterwards.

-- 3.4 [W] Schedule edits rejected once attempts exist
--   Change available_from / due_at / time_limit_seconds -> ERROR.

-- 3.5 [W] Permitted metadata edits still succeed once attempts exist
--   title, description, instructions, result_visibility -> succeed.

-- =====================================================================
-- 4. LIFECYCLE (set_quiz_status / duplicate / delete)
-- =====================================================================

-- 4.1 [W] set_quiz_status(quiz,'published') by assigned tutor -> ok.
-- 4.2 [W] set_quiz_status by unassigned tutor -> ERROR 42501.
-- 4.3 [W] set_quiz_status(quiz,'bogus') -> ERROR 22023.
-- 4.4 [W] Archived quiz is not startable
--         as STU_E: start_quiz_attempt(archived) -> ERROR (not available).
-- 4.5 [W] Draft quiz invisible to student
--         list_student_class_quizzes(CLS1) excludes draft ids.
-- 4.6 [W] Archiving with an in-progress attempt does not delete the attempt;
--         the student can still submit or is finalised, never orphaned.
-- 4.7 [W] duplicate_quiz_as_draft returns a NEW quiz id with
--         status='draft', published_at NULL, definition_version reset,
--         zero attempts, zero results, questions+options deep-copied,
--         center_id = source center_id.
-- 4.8 [W] duplicate_quiz_as_draft by foreign admin -> ERROR 42501.
-- 4.9 [W] delete_quiz_safe on a quiz WITH attempts -> refuses
--         (returns {deleted:false,...} or ERROR); quiz row still present.
-- 4.10 [W] delete_quiz_safe on a quiz with NO attempts -> removes quiz,
--          questions and options; no orphan rows remain.
-- 4.11 [W] delete_quiz_safe by student -> ERROR 42501.

-- =====================================================================
-- 5. TENANT SCOPING OF WRITES
-- =====================================================================

-- 5.1 [W] save_quiz_definition(CLS2, ...) as ADMIN1 -> ERROR 42501.
-- 5.2 [W] Every quizzes/quiz_questions/quiz_options row created through the
--         RPC carries center_id = the class's center_id:
--   SELECT count(*) FROM public.quiz_questions qq
--     JOIN public.quizzes q ON q.id=qq.quiz_id
--    WHERE qq.center_id IS DISTINCT FROM q.center_id;  -- EXPECT 0
--   SELECT count(*) FROM public.quiz_options qo
--     JOIN public.quiz_questions qq ON qq.id=qo.question_id
--    WHERE qo.center_id IS DISTINCT FROM qq.center_id; -- EXPECT 0

ROLLBACK;
-- End of B2b matrix.
