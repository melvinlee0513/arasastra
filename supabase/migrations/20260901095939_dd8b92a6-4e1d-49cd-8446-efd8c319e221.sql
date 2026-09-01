-- ═══════════════════════════════════════════════════════════════════════════
-- Post-deployment privilege verification found two gaps that REVOKE ... FROM
-- PUBLIC does not close, because `anon` holds EXECUTE explicitly (schema-level
-- default privileges grant it at CREATE time, and a revoke from PUBLIC leaves
-- the explicit grant in place).
--
--   1. anon could execute protected quiz / live-quiz / analytics / bank RPCs.
--      Every one of them raises 'not_authenticated' immediately, so this was
--      not a data leak — but an unauthenticated caller must not reach them at
--      all, and DEPLOYMENT_PHASE1_5.md step 6 asserts exactly that.
--   2. Internal helpers were callable by `authenticated`. They are called by
--      SECURITY DEFINER functions as the owner, so nothing legitimate needs the
--      grant (step 8 asserts auth_can = false on each).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Public entry points: authenticated only ───────────────────────────────
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.create_live_quiz_session(uuid, integer, boolean, integer, boolean)',
    'public.join_live_quiz_session(text)',
    'public.submit_live_quiz_answer(uuid, integer, uuid, text, jsonb)',
    'public.advance_live_quiz_session(uuid, text, integer)',
    'public.get_live_quiz_snapshot(uuid)',
    'public.remove_live_quiz_participant(uuid, uuid)',
    'public.leave_live_quiz_session(uuid)',
    'public.find_my_live_quiz_session()',
    'public.get_quiz_analytics_overview(uuid)',
    'public.get_quiz_question_analytics(uuid)',
    'public.get_quiz_student_analytics(uuid)',
    'public.get_student_quiz_report(uuid, uuid)',
    'public.get_quiz_question_responses(uuid, uuid)',
    'public.list_question_bank()',
    'public.search_question_bank(text, uuid, uuid, text, text, text, boolean, integer, integer)',
    'public.get_question_bank_question(uuid)',
    'public.save_question_bank_question(uuid, text, text, integer, text, text, uuid, uuid, jsonb, text[], text, numeric, numeric, text)',
    'public.duplicate_question_bank_questions(uuid[])',
    'public.archive_question_bank_question(uuid, boolean)',
    'public.save_question_bank_collection(uuid, text, text, uuid)',
    'public.add_question_bank_questions_to_quiz(uuid, uuid[])',
    'public.list_quizzes_for_question_bank()',
    'public.get_quiz_result(uuid)',
    'public.get_quiz_for_attempt(uuid)',
    -- RLS policies call this as the invoking role, so authenticated keeps it.
    'public._can_use_question_bank(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
  END LOOP;
END $$;

-- ─── Internal helpers: no client role at all ───────────────────────────────
-- Each is invoked from inside a SECURITY DEFINER function, which runs as the
-- owner and therefore does not consult these grants.
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public._quiz_answer_is_correct(uuid, jsonb)',
    'public._grade_and_finalize_attempt(uuid, boolean, jsonb, text)',
    'public._quiz_for_analytics(uuid)',
    'public._resync_live_quiz_counts(uuid)',
    'public._live_quiz_points(integer, timestamptz, timestamptz, timestamptz)',
    'public._my_question_bank_center()',
    'public.expire_stale_live_quiz_sessions()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
  END LOOP;
END $$;

-- _live_quiz_points is a pure arithmetic helper and was the one function here
-- without a pinned search_path.
ALTER FUNCTION public._live_quiz_points(integer, timestamptz, timestamptz, timestamptz)
  SET search_path = public, pg_temp;

-- Prove both gaps are closed in the same transaction that closed them.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('create_live_quiz_session','join_live_quiz_session',
             'submit_live_quiz_answer','advance_live_quiz_session',
             'get_live_quiz_snapshot','remove_live_quiz_participant',
             'leave_live_quiz_session','find_my_live_quiz_session',
             'get_quiz_analytics_overview','get_quiz_question_analytics',
             'get_quiz_student_analytics','get_student_quiz_report',
             'get_quiz_question_responses','list_question_bank',
             'search_question_bank','save_question_bank_question',
             'get_question_bank_question','add_question_bank_questions_to_quiz',
             'duplicate_question_bank_questions','archive_question_bank_question',
             'save_question_bank_collection','list_quizzes_for_question_bank',
             'get_quiz_result','get_quiz_for_attempt')
  LOOP
    IF has_function_privilege('anon', r.oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'anon can still execute %', r.proname;
    END IF;
  END LOOP;

  FOR r IN
    SELECT p.oid, p.proname
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('_quiz_answer_is_correct','_grade_and_finalize_attempt',
             '_quiz_for_analytics','_resync_live_quiz_counts','_live_quiz_points',
             '_my_question_bank_center','expire_stale_live_quiz_sessions')
  LOOP
    IF has_function_privilege('authenticated', r.oid, 'EXECUTE')
       OR has_function_privilege('anon', r.oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'internal helper % is still exposed', r.proname;
    END IF;
  END LOOP;
END $$;