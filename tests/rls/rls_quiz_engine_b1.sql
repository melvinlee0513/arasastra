-- Aras A+ B1 Quiz Engine regression matrix.
-- Written 2026-07-18. NOT auto-executed by CI. Run manually against a
-- disposable branch DB. Each block is idempotent-ish; wrap in a savepoint
-- if you want to re-run against the same fixture.
--
-- Fixture assumptions (create in a scratch DB):
--   * one tenuion_centers row with feature_flags '{"gamification":true,"quizXP":true}'
--   * one class + admin + assigned tutor + unassigned tutor + enrolled student
--     + foreign-tenant admin + non-enrolled student
--   * one published mcq quiz "Q_AS"  result_visibility='after_submit'
--   * one published mcq quiz "Q_ND"  result_visibility='never'
--   * one published mcq quiz "Q_AD"  result_visibility='after_due', due_at=now()+1h
--   * one published mcq quiz "Q_MN"  result_visibility='manual'
--   * one short-timed quiz "Q_TL"    time_limit_seconds=5
--   * one due-soon quiz    "Q_DUE"   due_at=now()+3s
--
-- Legend:
--   [E] executed manually against staging  [W] written, not executed
--   [S] schema-verified only

-- 1  [W] Expired attempt finalises through get_quiz_for_attempt
--     Start Q_TL as student, wait > 5s, call get_quiz_for_attempt(attempt_id).
--     EXPECT attempt.status='submitted', submission_reason='time_expired',
--            exactly one quiz_results row with attempt_id.

-- 2  [W] Expired attempt finalises through start_quiz_attempt (before due)
--     Start Q_TL, wait 6s, call start_quiz_attempt(Q_TL).
--     EXPECT: previous attempt -> submitted/time_expired, new attempt returned
--             (attempt_limit permitting) OR error 'attempt limit reached'.

-- 3  [W] Expiry uses saved_answers, never late client answers
--     Start Q_TL, save {Q1:A} via save_quiz_progress, wait > deadline,
--     call submit_quiz_attempt(attempt, {Q1:B}).
--     EXPECT student_quiz_answers.selected_option_id = A (saved), reason=time_expired.

-- 4  [W] Finalised expired attempt no longer blocks new attempt
--     After test 2, quiz_attempts_one_active partial unique must permit new insert.

-- 5  [W] No new attempt after due_at
--     For Q_DUE, wait until now() > due_at, call start_quiz_attempt.
--     EXPECT ERROR 'quiz due date passed'.

-- 6  [S] Duplicate result prevented
--     SELECT indexname FROM pg_indexes WHERE indexname='quiz_results_attempt_uidx'; -- exists.
--     Concurrent submit_quiz_attempt calls: ON CONFLICT(attempt_id) branch keeps 1 row.

-- 7  [S] Duplicate quiz XP prevented
--     SELECT indexname FROM pg_indexes WHERE indexname='student_xp_events_quiz_once';
--     -- unique (student_user_id, source_id) WHERE event_type='quiz_completed' AND source_type='quiz'.

-- 8  [W] Retake awards zero additional quiz XP
--     Student attempts Q_AS twice (attempt_limit=2). First submit awards XP;
--     second submit: SELECT count(*) FROM student_xp_events
--       WHERE student_user_id=S AND source_id=Q_AS AND source_type='quiz'
--       AND event_type='quiz_completed' = 1.

-- 9  [W] never returns hidden
--     After submitting Q_ND: get_quiz_result(attempt) ->
--       {status:'hidden', visibility:'never'}, no score/questions.

-- 10 [W] after_submit returns full result
--     get_quiz_result on submitted Q_AS -> status:'ok', questions[] populated.

-- 11 [W] after_due hidden before due date
--     Immediately after submitting Q_AD (due_at > now()): status:'hidden'.

-- 12 [W] after_due returns full after due date
--     UPDATE quizzes SET due_at = now()-'1s' WHERE id=Q_AD; then get_quiz_result
--     -> status:'ok'.

-- 13 [W] after_due without due_at cannot publish
--     BEGIN;
--       UPDATE quizzes SET result_visibility='after_due', due_at=NULL, status='published'
--       WHERE id=Q_AS;
--     -- EXPECT: ERROR from quizzes_visibility_guard trigger, sqlstate 22023.
--     ROLLBACK;

-- 14 [W] manual hidden before release
--     Submit Q_MN. get_quiz_result -> status:'hidden'.

-- 15 [W] manual visible after release
--     As assigned tutor: SELECT public.release_quiz_results(Q_MN);
--     As student: get_quiz_result -> status:'ok'.

-- 16 [W] hide_quiz_results makes manual results hidden again
--     As tutor: SELECT public.hide_quiz_results(Q_MN);
--     As student: get_quiz_result -> status:'hidden'.

-- 17 [W] Student cannot release results
--     SET request.jwt.claim.sub = '<student_uid>';
--     SELECT public.release_quiz_results(Q_MN); -- EXPECT 42501 not authorised.

-- 18 [W] Unassigned tutor cannot release results
--     Impersonate tutor not in class_tutors for Q_MN.class_id.
--     release_quiz_results -> 42501.

-- 19 [W] Foreign admin (other tenant) cannot release results
--     Impersonate admin whose profiles.center_id <> quizzes.center_id.
--     release_quiz_results -> 42501.

-- 20 [W] Foreign question IDs rejected by save_quiz_progress
--     Start attempt of Q_AS. Call save_quiz_progress with {qid_from_other_quiz: 'x'}.
--     EXPECT ERROR '22023 question ... not in quiz'.

-- 21 [W] Mismatched option IDs rejected by save_quiz_progress
--     Call save_quiz_progress with a valid question but an option from another question.
--     EXPECT ERROR '22023 option ... not in question ...'.

-- 22 [W] Submitted attempt cannot be edited
--     Submit Q_AS, then call save_quiz_progress(same attempt, {...}).
--     EXPECT ERROR '42501 attempt not editable'.

-- 23 [W] Expired attempt cannot be edited
--     Start Q_TL, wait past deadline (but do NOT let get_quiz_for_attempt finalise it),
--     call save_quiz_progress -> ERROR '22023 attempt deadline passed'.
--     (After finalisation via get_quiz_for_attempt, code path 22 applies instead.)

-- End of matrix.
