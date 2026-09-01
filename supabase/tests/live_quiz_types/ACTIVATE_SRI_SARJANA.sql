-- ═══════════════════════════════════════════════════════════════════════════
-- Sri Sarjana activation — verify, then enable, in one transaction.
--
-- Written because this environment cannot reach the production database: the
-- Supabase MCP is authenticated to a different account (it answers "You do not
-- have permission" for this project ref) and the network gateway answers 403 to
-- CONNECT for the Supabase host and both production domains. So this is the
-- thing a person with SQL Editor access runs instead.
--
-- HOW TO USE
--   1. Set v_slug below, on the line marked  <<< SET THE CENTRE SLUG HERE.
--   2. Paste the whole file into the Supabase SQL Editor and run it.
--   3. Read the messages. It either enables and prints the resulting flags, or
--      it raises with the reason and enables NOTHING.
--
-- No psql backslash commands are used, because the Supabase SQL Editor cannot
-- run them — and psql does not interpolate :'vars' inside a dollar-quoted
-- block anyway, which is how the first draft of this file failed.
--
-- It is safe to run repeatedly. It reads catalogue metadata and writes exactly
-- one row: this centre's feature_flags. It does not reset anything, does not
-- touch RLS, does not modify a quiz, attempt, result or session, and rolls
-- itself back entirely if any check fails.
--
-- It enables THREE flags, in the order requested:
--     quizAnalytics, questionBank, expandedQuestionTypes
-- and explicitly leaves liveQuizMultiplayer FALSE pending Realtime QA.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  v_slug     text := 'srisarjana';   -- <<< SET THE CENTRE SLUG HERE
  v_centre   uuid;
  v_name     text;
  v_before   jsonb;
  v_after    jsonb;
  v_def      text;
  v_bad      text;
  v_n        int;
  v_problems text[] := ARRAY[]::text[];
  t          text;
BEGIN
  -- ── The centre, by slug. Never a hardcoded id. ──────────────────────────
  SELECT id, name, COALESCE(feature_flags, '{}'::jsonb)
    INTO v_centre, v_name, v_before
    FROM public.tuition_centers
   WHERE slug = v_slug;

  IF v_centre IS NULL THEN
    RAISE EXCEPTION 'No tuition_centers row with slug %. Run: SELECT slug FROM public.tuition_centers ORDER BY slug;', v_slug;
  END IF;

  RAISE NOTICE '── Centre ────────────────────────────────────────────';
  RAISE NOTICE '  % (%)', v_name, v_slug;
  RAISE NOTICE '  flags BEFORE: %', v_before;
  RAISE NOTICE '';
  RAISE NOTICE '── Verification ──────────────────────────────────────';

  -- ── 1. Every migration the three features depend on ─────────────────────
  FOREACH t IN ARRAY ARRAY['20260901000000','20260902000000','20260903000000',
                           '20260905000000','20260905000100',
                           '20260906000000','20260906000100'] LOOP
    IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations
                    WHERE version = t) THEN
      v_problems := v_problems || ('migration ' || t || ' has not been applied');
    END IF;
  END LOOP;

  -- ── 2. The CHECK that blocked every Phase 5 type ────────────────────────
  SELECT pg_get_constraintdef(oid) INTO v_def
    FROM pg_constraint
   WHERE conname = 'quiz_questions_type_ck'
     AND conrelid = 'public.quiz_questions'::regclass;

  IF v_def IS NULL THEN
    v_problems := v_problems || 'quiz_questions_type_ck is missing entirely';
  ELSE
    FOREACH t IN ARRAY ARRAY['multiple_select','short_answer','numeric','fill_blank'] LOOP
      IF position(t in v_def) = 0 THEN
        v_problems := v_problems
          || ('quiz_questions_type_ck still rejects ' || t
              || ' — 20260906000000 has not taken effect');
      END IF;
    END LOOP;
  END IF;

  -- ── 3. Answer keys unreachable directly, table AND column ───────────────
  SELECT string_agg(DISTINCT grantee || ' -> ' || table_name, ', ')
    INTO v_bad
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public'
     AND table_name IN ('quiz_questions','quiz_options')
     AND grantee IN ('anon','authenticated');
  IF v_bad IS NOT NULL THEN
    v_problems := v_problems || ('table grants survive on the answer-key tables: ' || v_bad);
  END IF;

  SELECT string_agg(DISTINCT grantee || ' -> ' || table_name || '.' || column_name, ', ')
    INTO v_bad
    FROM information_schema.column_privileges
   WHERE table_schema = 'public'
     AND table_name IN ('quiz_questions','quiz_options')
     AND grantee IN ('anon','authenticated');
  IF v_bad IS NOT NULL THEN
    v_problems := v_problems || ('column grants survive on the answer-key tables: ' || v_bad);
  END IF;

  -- ── 4. The RPCs each feature needs, with the right posture ──────────────
  FOREACH t IN ARRAY ARRAY[
    'tenant_feature_enabled',
    'get_quiz_analytics_overview','get_quiz_question_analytics',
    'get_quiz_student_analytics','get_student_quiz_report','get_quiz_question_responses',
    'list_question_bank','search_question_bank','save_question_bank_question',
    'get_question_bank_question','add_question_bank_questions_to_quiz',
    '_quiz_answer_is_correct','get_quiz_result','get_quiz_for_attempt'] LOOP
    SELECT count(*) INTO v_n
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = t;
    IF v_n = 0 THEN
      v_problems := v_problems || ('RPC missing: ' || t);
    END IF;
  END LOOP;

  SELECT string_agg(p.proname, ', ') INTO v_bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('get_quiz_analytics_overview','get_quiz_question_analytics',
                       'get_quiz_student_analytics','get_student_quiz_report',
                       'get_quiz_question_responses','list_question_bank',
                       'search_question_bank','save_question_bank_question',
                       'get_question_bank_question','add_question_bank_questions_to_quiz',
                       'get_quiz_result','get_quiz_for_attempt')
     AND NOT (p.prosecdef
              AND p.proconfig::text LIKE '%search_path%'
              AND NOT has_function_privilege('anon', p.oid, 'EXECUTE'));
  IF v_bad IS NOT NULL THEN
    v_problems := v_problems
      || ('these RPCs are not definer / pinned / anon-blocked: ' || v_bad);
  END IF;

  -- ── 5. Question Bank tables exist with RLS on ───────────────────────────
  FOREACH t IN ARRAY ARRAY['question_bank_collections','question_bank_questions',
                           'question_bank_options'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class
                    WHERE relnamespace = 'public'::regnamespace
                      AND relname = t AND relrowsecurity) THEN
      v_problems := v_problems || ('missing, or RLS is OFF on, public.' || t);
    END IF;
  END LOOP;

  -- ── 6. The Phase 5 columns, on both question tables ─────────────────────
  SELECT count(*) INTO v_n
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name IN ('quiz_questions','question_bank_questions')
     AND column_name IN ('accepted_answers','answer_match_mode','numeric_answer',
                         'numeric_tolerance','answer_unit');
  IF v_n <> 10 THEN
    v_problems := v_problems
      || ('expected 10 Phase 5 columns across the two question tables, found ' || v_n);
  END IF;

  -- ── 7. Exactly one submit_live_quiz_answer ──────────────────────────────
  -- Not needed for the three features being enabled, but two overloads make
  -- every live call fail as "function is not unique", so it is worth knowing
  -- before liveQuizMultiplayer is ever turned on.
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'submit_live_quiz_answer';
  IF v_n > 1 THEN
    RAISE WARNING 'submit_live_quiz_answer has % overloads — the 4-arg form survived. '
                  'Not blocking (liveQuizMultiplayer stays off), but fix before enabling it.', v_n;
  END IF;

  -- ── Verdict ─────────────────────────────────────────────────────────────
  IF array_length(v_problems, 1) IS NOT NULL THEN
    RAISE NOTICE '';
    FOREACH t IN ARRAY v_problems LOOP
      RAISE NOTICE '  FAIL  %', t;
    END LOOP;
    RAISE EXCEPTION
      'Verification failed with % problem(s). NOTHING was enabled and this '
      'transaction is rolled back. Fix the above, then re-run.',
      array_length(v_problems, 1);
  END IF;

  RAISE NOTICE '  PASS  all migrations applied';
  RAISE NOTICE '  PASS  quiz_questions_type_ck admits every Phase 5 type';
  RAISE NOTICE '  PASS  answer keys unreachable directly (table and column)';
  RAISE NOTICE '  PASS  every required RPC present, definer, pinned, anon-blocked';
  RAISE NOTICE '  PASS  question bank tables present with RLS on';
  RAISE NOTICE '  PASS  Phase 5 columns present on both question tables';
  RAISE NOTICE '';

  -- ── Enable ──────────────────────────────────────────────────────────────
  -- `||` merges, so no unrelated flag on this centre is lost. liveQuizMultiplayer
  -- is set explicitly false rather than left unset: unset already reads as off,
  -- but writing it makes the pilot's intent legible to the next person.
  UPDATE public.tuition_centers
     SET feature_flags = COALESCE(feature_flags, '{}'::jsonb)
                      || jsonb_build_object(
                           'quizAnalytics',         true,
                           'questionBank',          true,
                           'expandedQuestionTypes', true,
                           'liveQuizMultiplayer',   false)
   WHERE id = v_centre
  RETURNING feature_flags INTO v_after;

  RAISE NOTICE '── Enabled ───────────────────────────────────────────';
  RAISE NOTICE '  flags AFTER: %', v_after;
  RAISE NOTICE '';
  RAISE NOTICE '  quizAnalytics         ON';
  RAISE NOTICE '  questionBank          ON';
  RAISE NOTICE '  expandedQuestionTypes ON';
  RAISE NOTICE '  liveQuizMultiplayer   OFF  (pending production Realtime QA)';

  CREATE TEMP TABLE activation_result (centre_id uuid) ON COMMIT DROP;
  INSERT INTO activation_result VALUES (v_centre);
END $$;

-- Read the result back as a row, so it lands in the SQL Editor's result grid
-- and can be pasted into a report. Joined through the temp table rather than
-- repeating the slug literal, which would be a second place to forget to edit.
SELECT c.slug, c.name, c.feature_flags
  FROM public.tuition_centers c
  JOIN activation_result r ON r.centre_id = c.id;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- If you would rather enable one feature at a time, testing between each,
-- run these instead of the block above. Each is independent and idempotent.
--
--   UPDATE public.tuition_centers
--      SET feature_flags = COALESCE(feature_flags,'{}'::jsonb)
--                       || '{"quizAnalytics": true}'::jsonb
--    WHERE slug = 'srisarjana' RETURNING slug, feature_flags;
--
--   UPDATE public.tuition_centers
--      SET feature_flags = COALESCE(feature_flags,'{}'::jsonb)
--                       || '{"questionBank": true}'::jsonb
--    WHERE slug = 'srisarjana' RETURNING slug, feature_flags;
--
--   UPDATE public.tuition_centers
--      SET feature_flags = COALESCE(feature_flags,'{}'::jsonb)
--                       || '{"expandedQuestionTypes": true}'::jsonb
--    WHERE slug = 'srisarjana' RETURNING slug, feature_flags;
--
-- To turn any of them back off, the same statement with false. No deploy is
-- involved; the client and the RPCs read the same row on the next request.
-- ═══════════════════════════════════════════════════════════════════════════
