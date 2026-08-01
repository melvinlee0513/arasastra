-- Aras A+ B3 regression matrix — student attempts, results visibility,
-- attempt history and manager aggregates (covers B3a, B3b, B3c).
-- Authored 2026-08-01. NOT auto-executed by CI and NOT executed by the agent.
-- Every case is [W] (written, not executed) unless explicitly marked otherwise.
-- Run manually against a disposable branch DB inside a transaction, ROLLBACK.
-- Do NOT run against Sri Sarjana production records.
--
-- Legend: [E] executed with a real authenticated role  [W] written, not executed
--         [S] definition-verified only (NOT a runtime pass)
--
-- Fixture: same as tests/rls/rls_quiz_engine_b2b.sql, plus published quizzes:
--   Q_OK  mcq+tf, result_visibility='after_submit', attempt_limit=1
--   Q_MA  attempt_limit=2, result_visibility='after_submit'
--   Q_TL  time_limit_seconds=5, attempt_limit=2
--   Q_DUE due_at = now() + interval '3 seconds'
--   Q_NV  result_visibility='never'
--   Q_AD  result_visibility='after_due', due_at = now() + interval '1 hour'
--   Q_MN  result_visibility='manual'

BEGIN;

-- =====================================================================
-- 1. STUDENT LIST + ACCESS
-- =====================================================================

-- 1.1 [W] Enrolled student sees published quizzes only
--   as STU_E: SELECT id FROM public.list_student_class_quizzes(CLS1);
--   EXPECT published ids only; no draft, no archived.

-- 1.2 [W] Payload contains no answer key
--   The returned columns must NOT include is_correct, correct_answer,
--   option ids flagged correct, or explanation. Column list is fixed by the
--   RPC signature — assert with:
--     SELECT * FROM public.list_student_class_quizzes(CLS1) LIMIT 0;
--   and diff against the approved column set.

-- 1.3 [W] Unenrolled same-centre student denied
--   as STU_N: list_student_class_quizzes(CLS1) -> ERROR 42501 or zero rows,
--   AND start_quiz_attempt(Q_OK) -> ERROR 42501.

-- 1.4 [W] Foreign-tenant student denied
--   as STU_F: list_student_class_quizzes(CLS1) -> ERROR 42501 / zero rows.

-- 1.5 [E] Anonymous denied all student RPCs
--   Executed 2026-08-01 over PostgREST with the anon key and the exact deployed
--   signatures. All returned 401 / 42501 'permission denied for function ...':
--     list_student_class_quizzes(_class_id uuid)
--     list_my_quiz_attempts(_quiz_id uuid)
--     start_quiz_attempt(_quiz_id uuid)
--     get_quiz_for_attempt(_attempt_id uuid)
--     save_quiz_progress(_attempt_id uuid,_answers jsonb,_expected_revision int)
--     submit_quiz_attempt(_attempt_id uuid,_answers jsonb)
--     get_quiz_result(_attempt_id uuid)
--   record_learning_activity(text,int,uuid,text) returned 400 / P0001
--   'not authenticated' (anon EXECUTE has since been revoked; re-run expected
--   to return 42501). RE-RUN REQUIRED [W].

-- =====================================================================
-- 2. ATTEMPT START RULES
-- =====================================================================

-- 2.1 [W] Upcoming quiz cannot start
--   available_from > now() -> start_quiz_attempt -> ERROR 22023 'not yet available'.

-- 2.2 [W] Past-due quiz cannot start
--   For Q_DUE after due_at -> ERROR 22023 'quiz due date passed'.

-- 2.3 [W] Attempt limit enforced
--   Q_OK (limit 1): submit attempt 1, then start_quiz_attempt -> ERROR
--   'attempt limit reached'.

-- 2.4 [W] Concurrent double-start yields exactly one active attempt
--   Two sessions call start_quiz_attempt(Q_MA) simultaneously.
--   EXPECT: SELECT count(*) FROM public.quiz_attempts
--            WHERE quiz_id=Q_MA AND user_id=STU_E AND status='in_progress' = 1
--   guaranteed by the quiz_attempts_one_active partial unique index.

-- 2.5 [W] Active attempt resumes rather than creating a new row
--   start_quiz_attempt on an existing in-progress attempt returns the SAME id.

-- 2.6 [W] Another student's attempt is not readable
--   as STU_N (or a second enrolled student): get_quiz_for_attempt(STU_E attempt)
--   -> ERROR 42501; get_quiz_result(STU_E attempt) -> ERROR 42501.

-- =====================================================================
-- 3. PROGRESS SAVING
-- =====================================================================

-- 3.1 [W] Foreign question id rejected
--   save_quiz_progress(att, '{"<qid from another quiz>":"x"}', rev)
--   -> ERROR 22023 'question ... not in quiz'.

-- 3.2 [W] Mismatched option id rejected -> ERROR 22023 'option ... not in question'.

-- 3.3 [W] Malformed payload rejected
--   _answers = '"a string"'::jsonb and '[1,2]'::jsonb -> ERROR 22023.

-- 3.4 [W] Stale revision rejected
--   Save once (revision r -> r+1), then save with _expected_revision = r
--   -> ERROR 40001-class 'revision_conflict'. Verify saved_answers unchanged.

-- 3.5 [W] Matching revision succeeds and increments progress_revision by 1.

-- 3.6 [W] Submitted attempt cannot be edited -> ERROR 42501 'attempt not editable'.

-- 3.7 [W] Expired attempt cannot be edited -> ERROR 22023 'attempt deadline passed'.

-- 3.8 [W] Enrolment removed mid-attempt
--   DELETE the active class_enrollments row, then save_quiz_progress
--   -> controlled ERROR 42501 (never a raw constraint error).

-- =====================================================================
-- 4. SUBMISSION AND GRADING
-- =====================================================================

-- 4.1 [W] Normal submission grades correctly
--   Answer 2 of 3 correct with equal points -> quiz_results.total_points and
--   percentage match the authoritative option set; one student_quiz_answers row
--   per question with correct is_correct flags.

-- 4.2 [W] Expiry grades persisted answers only
--   Q_TL: save {Q1:A}, wait past deadline, submit_quiz_attempt(att,'{"Q1":"B"}')
--   -> stored selected_option_id = A; submission_reason='time_expired'.

-- 4.3 [W] Due-date expiry sets submission_reason='due_expired'.

-- 4.4 [W] Duplicate submission creates no duplicate result
--   Call submit_quiz_attempt twice -> exactly one quiz_results row
--   (quiz_results_attempt_uidx).

-- 4.5 [W] Duplicate submission creates no duplicate XP
--   SELECT count(*) FROM public.student_xp_events
--    WHERE student_user_id=STU_E AND source_id=Q_OK AND source_type='quiz'
--      AND event_type='quiz_completed';   -- EXPECT 1

-- 4.6 [W] Retake awards no additional quiz XP (Q_MA, two submitted attempts)
--   -> same count = 1 (student_xp_events_quiz_once).

-- 4.7 [W] Duplicate expiry finalisation is idempotent
--   Call get_quiz_for_attempt twice on an expired attempt and
--   start_quiz_attempt once -> one result row, one XP row.

-- 4.8 [W] Quiz unpublished mid-attempt
--   set_quiz_status(Q_OK,'archived') during an active attempt, then submit
--   -> controlled outcome (either graded or a clean 42501), never a raw error,
--   and never a half-written result with no answers.

-- =====================================================================
-- 5. RESULT VISIBILITY (get_quiz_result)
-- =====================================================================

-- 5.1 [W] never -> {status:'hidden', visibility:'never'};
--          payload contains NO score, percentage, questions, answers,
--          correct_answer or explanation keys.
-- 5.2 [W] after_submit -> {status:'ok'} immediately after submit, with
--          per-question review and score matching quiz_results.
-- 5.3 [W] after_due before due_at -> hidden.
-- 5.4 [W] after_due after due_at -> ok.
-- 5.5 [W] manual before release -> hidden.
-- 5.6 [W] manual after release_quiz_results -> ok.
-- 5.7 [W] hide_quiz_results after release -> hidden again, and the hidden
--          payload again contains no score and no answers.
-- 5.8 [W] Every status branch returns quiz_id and class_id so the client can
--          validate the route without leaking titles.
-- 5.9 [W] Student cannot call release_quiz_results / hide_quiz_results -> 42501.
-- 5.10 [W] Unassigned tutor cannot release/hide -> 42501.
-- 5.11 [W] Foreign admin cannot release/hide -> 42501.
-- 5.12 [W] Raw table reads denied to students:
--   as STU_E: SELECT * FROM public.quiz_results;         -- EXPECT 0 rows
--   as STU_E: SELECT * FROM public.student_quiz_answers; -- EXPECT 0 rows
--   (policies are manager-only; students must go through get_quiz_result.)

-- =====================================================================
-- 6. ATTEMPT HISTORY (list_my_quiz_attempts)
-- =====================================================================

-- 6.1 [W] Returns only the caller's attempts
--   as STU_E for a quiz also attempted by another student -> no foreign rows.
-- 6.2 [W] attempts_used / remaining match quiz_attempts for the caller.
-- 6.3 [W] Distinct attempt ids for each retake; submission_reason preserved
--         ('submitted' / 'time_expired' / 'due_expired').
-- 6.4 [W] No score exposed for a quiz whose results are hidden.
-- 6.5 [W] Unknown / foreign quiz id -> ERROR 42501 or zero rows, never a leak.

-- =====================================================================
-- 7. MANAGER AGGREGATES (get_quiz_results_for_manager /
--    get_quiz_attempt_for_manager)
-- =====================================================================

-- 7.1 [S] Averaging rule verified in the deployed definition on 2026-08-01:
--   avg_percentage uses DISTINCT ON (qa.user_id) ordered so that only each
--   student's LATEST submitted attempt contributes. Runtime confirmation with
--   two attempts of differing scores is still REQUIRED [W].

-- 7.2 [W] Summary distinguishes enrolled students, students_started,
--   students_submitted, submitted attempts and completion_pct.
--   Assert students_submitted <= students_started <= enrolled_students and
--   submitted_attempts >= students_submitted when retakes exist.

-- 7.3 [W] Tenant scoping: as ADMIN2 -> 42501 for a C1 quiz; the error payload
--   contains no class title, quiz title or student names.

-- 7.4 [W] Deleted student profile fallback
--   Remove the profiles row for a student with a submitted attempt.
--   EXPECT the attempt still appears with the 'Removed student' fallback
--   (LEFT JOIN), not a vanished row.

-- 7.5 [W] get_quiz_attempt_for_manager is tenant-scoped and denied to the
--   student who owns the attempt (students use get_quiz_result instead).

-- 7.6 [W] Access revoked while a manager page is open
--   Remove the class_tutors row for TUT_A, then re-call the manager RPCs
--   -> 42501 with no cached data returned by the backend.

ROLLBACK;
-- End of B3 matrix.
