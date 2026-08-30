-- ═══════════════════════════════════════════════════════════════════════════
-- POST-DEPLOYMENT VERIFICATION — live multiplayer quiz
--
-- READ ONLY. Creates nothing, changes nothing, locks nothing. Safe to run on
-- production immediately after applying
-- 20260830000000_live_quiz_sessions.sql.
--
--   psql "$DATABASE_URL" -f verify_deployment.sql
--
-- Every row should report PASS. Any FAIL means do not enable the feature.
--
-- NOTE: checks 18 and 20 assert that the canonical solo-quiz tables and RPCs
-- are still present. They pass on the real project. They FAIL if you point
-- this script at the local test fixture in this directory, because that
-- fixture deliberately builds only the few tables the migration references.
-- ═══════════════════════════════════════════════════════════════════════════
\pset pager off
\pset format aligned

WITH checks AS (

-- ── 1. Tables exist ────────────────────────────────────────────────────────
SELECT 1 AS n, 'tables: all three live_quiz tables exist' AS check_name,
  (SELECT count(*) FROM pg_tables
    WHERE schemaname='public'
      AND tablename IN ('live_quiz_sessions','live_quiz_participants','live_quiz_answers')) = 3 AS ok,
  (SELECT string_agg(tablename, ', ' ORDER BY tablename) FROM pg_tables
    WHERE schemaname='public' AND tablename LIKE 'live_quiz%') AS detail

-- ── 2. RLS enabled on every one ────────────────────────────────────────────
UNION ALL SELECT 2, 'rls: enabled on every live_quiz table',
  NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
               WHERE n.nspname='public' AND c.relname LIKE 'live_quiz%'
                 AND c.relkind='r' AND NOT c.relrowsecurity),
  coalesce((SELECT string_agg(c.relname||'='||c.relrowsecurity::text, ', ')
              FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname LIKE 'live_quiz%' AND c.relkind='r'), '-')

-- ── 3. Expected policies present ───────────────────────────────────────────
UNION ALL SELECT 3, 'policies: SELECT policy on sessions + participants',
  (SELECT count(*) FROM pg_policies
    WHERE schemaname='public'
      AND tablename IN ('live_quiz_sessions','live_quiz_participants')
      AND cmd='SELECT') = 2,
  coalesce((SELECT string_agg(tablename||': '||policyname, ' | ' ORDER BY tablename)
              FROM pg_policies WHERE schemaname='public' AND tablename LIKE 'live_quiz%'), '-')

-- ── 4. live_quiz_answers deliberately has NO policy (deny-all) ─────────────
UNION ALL SELECT 4, 'policies: live_quiz_answers has NO policy (answers unreadable)',
  (SELECT count(*) FROM pg_policies
    WHERE schemaname='public' AND tablename='live_quiz_answers') = 0,
  (SELECT count(*)::text||' policies' FROM pg_policies
    WHERE schemaname='public' AND tablename='live_quiz_answers')

-- ── 5. All seven RPCs + two helpers + scoring function exist ───────────────
UNION ALL SELECT 5, 'functions: all live-quiz functions exist',
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN (
      'create_live_quiz_session','join_live_quiz_session','get_live_quiz_snapshot',
      'advance_live_quiz_session','submit_live_quiz_answer','leave_live_quiz_session',
      'find_my_live_quiz_session','_live_quiz_points','_is_live_quiz_participant',
      '_can_host_live_quiz')) = 10,
  coalesce((SELECT string_agg(p.proname, ', ' ORDER BY p.proname)
              FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public' AND p.proname LIKE '%live_quiz%'), '-')

-- ── 6. Every SECURITY DEFINER function pins search_path ────────────────────
UNION ALL SELECT 6, 'security: every SECURITY DEFINER function pins search_path',
  NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname LIKE '%live_quiz%' AND p.prosecdef
       AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,'{}')) c
                        WHERE c LIKE 'search_path=%')),
  coalesce((SELECT string_agg(p.proname, ', ')
              FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public' AND p.proname LIKE '%live_quiz%' AND p.prosecdef
               AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,'{}')) c
                                WHERE c LIKE 'search_path=%')), 'all pinned')

-- ── 7. Function ownership is uniform (definer runs as the owner) ───────────
UNION ALL SELECT 7, 'security: all live-quiz functions share one owner',
  (SELECT count(DISTINCT p.proowner) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname LIKE '%live_quiz%') = 1,
  coalesce((SELECT string_agg(DISTINCT pg_get_userbyid(p.proowner), ', ')
              FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public' AND p.proname LIKE '%live_quiz%'), '-')

-- ── 8. authenticated holds EXECUTE on the 7 RPCs + the 2 RLS helpers ───────
--     The two helpers matter: an RLS policy is evaluated as the querying role,
--     so without EXECUTE the policy errors instead of returning false and no
--     session row is readable at all.
UNION ALL SELECT 8, 'grants: authenticated can EXECUTE the 7 RPCs',
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.proname IN ('create_live_quiz_session','join_live_quiz_session',
        'get_live_quiz_snapshot','advance_live_quiz_session','submit_live_quiz_answer',
        'leave_live_quiz_session','find_my_live_quiz_session')
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')) = 7,
  (SELECT count(*)::text||'/7' FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.proname IN ('create_live_quiz_session','join_live_quiz_session',
        'get_live_quiz_snapshot','advance_live_quiz_session','submit_live_quiz_answer',
        'leave_live_quiz_session','find_my_live_quiz_session')
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE'))

UNION ALL SELECT 9, 'grants: authenticated can EXECUTE both RLS helpers (else realtime breaks)',
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('_is_live_quiz_participant','_can_host_live_quiz')
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')) = 2,
  (SELECT count(*)::text||'/2' FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('_is_live_quiz_participant','_can_host_live_quiz')
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE'))

-- ── 10. anon holds EXECUTE on nothing ──────────────────────────────────────
UNION ALL SELECT 10, 'grants: anon has EXECUTE on NO live-quiz function',
  NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
               WHERE n.nspname='public' AND p.proname LIKE '%live_quiz%'
                 AND has_function_privilege('anon', p.oid, 'EXECUTE')),
  coalesce((SELECT string_agg(p.proname, ', ') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public' AND p.proname LIKE '%live_quiz%'
               AND has_function_privilege('anon', p.oid, 'EXECUTE')), 'none')

-- ── 11. anon can read nothing ──────────────────────────────────────────────
UNION ALL SELECT 11, 'grants: anon has NO table privilege on live-quiz tables',
  NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
               WHERE n.nspname='public' AND c.relname LIKE 'live_quiz%' AND c.relkind='r'
                 AND (has_table_privilege('anon', c.oid, 'SELECT')
                   OR has_table_privilege('anon', c.oid, 'INSERT')
                   OR has_table_privilege('anon', c.oid, 'UPDATE')
                   OR has_table_privilege('anon', c.oid, 'DELETE'))),
  coalesce((SELECT string_agg(c.relname, ', ') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname LIKE 'live_quiz%' AND c.relkind='r'
               AND has_table_privilege('anon', c.oid, 'SELECT')), 'none')

-- ── 12. authenticated has NO write grant anywhere ──────────────────────────
UNION ALL SELECT 12, 'grants: authenticated has NO INSERT/UPDATE/DELETE on live-quiz tables',
  NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
               WHERE n.nspname='public' AND c.relname LIKE 'live_quiz%' AND c.relkind='r'
                 AND (has_table_privilege('authenticated', c.oid, 'INSERT')
                   OR has_table_privilege('authenticated', c.oid, 'UPDATE')
                   OR has_table_privilege('authenticated', c.oid, 'DELETE'))),
  coalesce((SELECT string_agg(c.relname, ', ') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname LIKE 'live_quiz%' AND c.relkind='r'
               AND has_table_privilege('authenticated', c.oid, 'INSERT')), 'none')

-- ── 13. authenticated CAN read sessions + participants (realtime needs it) ─
UNION ALL SELECT 13, 'grants: authenticated has SELECT on sessions + participants only',
  has_table_privilege('authenticated','public.live_quiz_sessions','SELECT')
  AND has_table_privilege('authenticated','public.live_quiz_participants','SELECT')
  AND NOT has_table_privilege('authenticated','public.live_quiz_answers','SELECT'),
  'sessions='||has_table_privilege('authenticated','public.live_quiz_sessions','SELECT')::text
  ||' participants='||has_table_privilege('authenticated','public.live_quiz_participants','SELECT')::text
  ||' answers='||has_table_privilege('authenticated','public.live_quiz_answers','SELECT')::text

-- ── 14. Realtime publishes ONLY live_quiz_sessions of the three ────────────
UNION ALL SELECT 14, 'realtime: only live_quiz_sessions is published',
  EXISTS (SELECT 1 FROM pg_publication_tables
           WHERE pubname='supabase_realtime' AND schemaname='public'
             AND tablename='live_quiz_sessions')
  AND NOT EXISTS (SELECT 1 FROM pg_publication_tables
           WHERE pubname='supabase_realtime' AND schemaname='public'
             AND tablename IN ('live_quiz_answers','live_quiz_participants')),
  coalesce((SELECT string_agg(tablename, ', ' ORDER BY tablename) FROM pg_publication_tables
             WHERE pubname='supabase_realtime' AND schemaname='public'
               AND tablename LIKE 'live_quiz%'), 'none')

-- ── 15. Idempotency guard: the answer uniqueness index exists ──────────────
UNION ALL SELECT 15, 'constraints: one-answer-per-participant-per-question unique index',
  EXISTS (SELECT 1 FROM pg_constraint
           WHERE conname='live_quiz_answers_once_uq' AND contype='u'),
  coalesce((SELECT string_agg(conname, ', ') FROM pg_constraint c
             JOIN pg_class t ON t.oid=c.conrelid
            WHERE t.relname LIKE 'live_quiz%' AND c.contype='u'), 'none')

-- ── 16. Game-code partial unique index exists ──────────────────────────────
UNION ALL SELECT 16, 'constraints: active game_code partial unique index',
  EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
           AND indexname='live_quiz_sessions_active_code_uq'),
  coalesce((SELECT string_agg(indexname, ', ') FROM pg_indexes
             WHERE schemaname='public' AND tablename='live_quiz_sessions'), 'none')

-- ── 17. Enum has exactly the seven expected states ─────────────────────────
UNION ALL SELECT 17, 'enum: live_quiz_status has the 7 expected values',
  (SELECT count(*) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
    WHERE t.typname='live_quiz_status') = 7,
  coalesce((SELECT string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder)
              FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
             WHERE t.typname='live_quiz_status'), 'missing')

-- ── 18. The canonical quiz tables are untouched ────────────────────────────
--     The migration is additive; it must not have altered the solo quiz system.
UNION ALL SELECT 18, 'untouched [prod-only]: canonical quiz tables still present',
  (SELECT count(*) FROM pg_tables WHERE schemaname='public'
    AND tablename IN ('quizzes','quiz_questions','quiz_options','quiz_attempts','quiz_results')) = 5,
  (SELECT string_agg(tablename, ', ' ORDER BY tablename) FROM pg_tables
    WHERE schemaname='public'
      AND tablename IN ('quizzes','quiz_questions','quiz_options','quiz_attempts','quiz_results'))

UNION ALL SELECT 19, 'untouched: no live_quiz FK points INTO the solo attempt tables',
  NOT EXISTS (
    SELECT 1 FROM pg_constraint c
      JOIN pg_class src ON src.oid=c.conrelid
      JOIN pg_class tgt ON tgt.oid=c.confrelid
     WHERE c.contype='f' AND src.relname LIKE 'live_quiz%'
       AND tgt.relname IN ('quiz_attempts','quiz_results','student_quiz_answers')),
  coalesce((SELECT string_agg(src.relname||' -> '||tgt.relname, ', ') FROM pg_constraint c
              JOIN pg_class src ON src.oid=c.conrelid
              JOIN pg_class tgt ON tgt.oid=c.confrelid
             WHERE c.contype='f' AND src.relname LIKE 'live_quiz%'
               AND tgt.relname IN ('quiz_attempts','quiz_results','student_quiz_answers')),
           'none')

UNION ALL SELECT 20, 'untouched [prod-only]: solo quiz RPCs still present',
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN (
      'save_quiz_definition','get_quiz_definition_for_manager','save_quiz_progress',
      'submit_quiz_attempt','start_quiz_attempt','get_quiz_for_attempt')) >= 6,
  (SELECT count(*)::text||' found' FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN (
      'save_quiz_definition','get_quiz_definition_for_manager','save_quiz_progress',
      'submit_quiz_attempt','start_quiz_attempt','get_quiz_for_attempt'))

-- ── 21. Fresh install should hold no session rows ──────────────────────────
UNION ALL SELECT 21, 'state: no live sessions exist yet (expected on first deploy)',
  (SELECT count(*) FROM public.live_quiz_sessions) = 0,
  (SELECT count(*)::text||' sessions, '
        ||(SELECT count(*) FROM public.live_quiz_participants)::text||' participants, '
        ||(SELECT count(*) FROM public.live_quiz_answers)::text||' answers'
     FROM public.live_quiz_sessions)
)
SELECT n,
       CASE WHEN ok THEN 'PASS' ELSE '*** FAIL ***' END AS result,
       check_name,
       detail
  FROM checks
 ORDER BY n;

-- Single-line summary.
\echo ''
\echo 'If every row above says PASS, the schema is deployed correctly.'
\echo 'Check 21 is informational: it only reads 0 on a first deployment.'
