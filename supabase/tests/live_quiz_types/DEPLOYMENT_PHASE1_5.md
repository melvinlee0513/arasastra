# Deploying Quiz Phases 1–5

Ten migrations, in this order. Every one is additive: no table is dropped, no
row is deleted, no policy is removed, and no existing quiz, attempt, result or
session is modified.

```
20260830000000_live_quiz_sessions.sql          live multiplayer tables + RPCs
20260831000000_live_quiz_phase2.sql            kick, expiry, roster correctness
20260901000000_quiz_analytics.sql              five analytics RPCs
20260902000000_question_bank.sql               bank tables, RLS, nine RPCs
20260903000000_question_types.sql              four new types + _quiz_answer_is_correct
20260904000000_live_quiz_all_types.sql         live plays every type
20260905000000_answer_key_least_privilege.sql  revoke both answer-key tables
20260905000100_quiz_result_answer_keys.sql     solo results carry the new keys
20260906000000_widen_question_type_constraint  the CHECK that blocked Phase 5
20260906000100_feature_flag_enforcement.sql    flags gate the RPCs, not just routes
```

The order is not cosmetic. `20260904` calls a function `20260903` creates and
writes to a table `20260830` creates; `20260906000000` must land before anyone
saves a Phase 5 question, because until it does the schema rejects all four
types. `supabase/tests/live_quiz_types/run.sh` applies all ten to one database
in exactly this order, which is how the ordering is checked at all.

## Two things that will bite if they are skipped

**`20260906000000` is a release blocker, not a nicety.** `20260718074806` put
`CHECK (question_type IN ('mcq','multiple_choice','true_false'))` on
`quiz_questions` and nothing ever widened it. Without this migration the
builder cannot save a `multiple_select`, `short_answer`, `numeric` or
`fill_blank` question at all, and copying one out of the bank fails with a
constraint violation naming a different table.

**`20260905000000` narrows privileges.** `20260831000000` granted
`authenticated` column-level `SELECT` on `quiz_options` on the mistaken premise
that it already held the table grant; `20260813072502` had revoked everything
three weeks earlier. If you deploy `20260831000000` without `20260905000000`,
`authenticated` ends up able to read every `quiz_options` column except
`is_correct` — a privilege it has not had since August.

## Before

```sql
-- The three worst-case states, each of which changes what you do next.
-- 1. Has the old constraint already been widened by someone else?
SELECT pg_get_constraintdef(oid)
  FROM pg_constraint
 WHERE conname = 'quiz_questions_type_ck'
   AND conrelid = 'public.quiz_questions'::regclass;

-- 2. Does authenticated currently hold anything on the answer-key tables?
SELECT grantee, table_name, privilege_type
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public'
   AND table_name IN ('quiz_questions','quiz_options')
   AND grantee IN ('anon','authenticated')
UNION ALL
SELECT grantee, table_name, privilege_type
  FROM information_schema.column_privileges
 WHERE table_schema = 'public'
   AND table_name IN ('quiz_questions','quiz_options')
   AND grantee IN ('anon','authenticated');

-- 3. Is there content that would violate the new bank constraint?
--    20260906000000 refuses to run and names the offenders rather than failing
--    with "constraint violated" and nothing to act on. Check first anyway.
SELECT DISTINCT question_type
  FROM public.question_bank_questions
 WHERE question_type NOT IN ('mcq','multiple_choice','true_false',
                             'multiple_select','short_answer','numeric','fill_blank');
-- Expect zero rows. (If question_bank_questions does not exist yet, that is
-- correct — 20260902000000 has not run.)
```

## After — read-only verification

Every query below is a `SELECT`. Run all of them; the expected result is stated
against each. Anything that disagrees is a blocker, and the corresponding
feature flag should stay off until it does not.

The same queries, the flag semantics, and the enablement `UPDATE` are in
[`PILOT_ENABLEMENT.md`](./PILOT_ENABLEMENT.md); this file is the deploy, that
one is the rollout.

```sql
-- ── 1. All ten migrations recorded, in order ──────────────────────────────
SELECT version, name FROM supabase_migrations.schema_migrations
 WHERE version >= '20260830000000' ORDER BY version;

-- ── 2. Tables exist and RLS is on ─────────────────────────────────────────
SELECT relname, relrowsecurity, relforcerowsecurity
  FROM pg_class
 WHERE relnamespace = 'public'::regnamespace
   AND relname IN ('live_quiz_sessions','live_quiz_participants','live_quiz_answers',
                   'question_bank_collections','question_bank_questions',
                   'question_bank_options')
 ORDER BY relname;
-- Expect six rows, relrowsecurity true on every one.

-- ── 3. Columns Phase 5 added, on both question tables ─────────────────────
SELECT table_name, column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name IN ('quiz_questions','question_bank_questions')
   AND column_name IN ('accepted_answers','answer_match_mode','numeric_answer',
                       'numeric_tolerance','answer_unit')
 ORDER BY table_name, column_name;
-- Expect ten rows (five columns x two tables).

-- ── 4. The type constraint admits what the engine grades ──────────────────
SELECT conrelid::regclass AS tbl, pg_get_constraintdef(oid) AS def
  FROM pg_constraint
 WHERE conname IN ('quiz_questions_type_ck','qb_questions_type_ck')
 ORDER BY 1;
-- Both definitions must list all seven types. If quiz_questions_type_ck still
-- reads ('mcq','multiple_choice','true_false'), 20260906000000 did not run and
-- NOT ONE Phase 5 question can be saved.

-- ── 5. Answer keys are unreachable directly ───────────────────────────────
-- Both must return zero rows. The second matters most: a COLUMN grant is
-- invisible to has_table_privilege, which is how the last widening went
-- unnoticed for a week.
SELECT grantee, table_name, privilege_type
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public'
   AND table_name IN ('quiz_questions','quiz_options')
   AND grantee IN ('anon','authenticated');

SELECT grantee, table_name, column_name, privilege_type
  FROM information_schema.column_privileges
 WHERE table_schema = 'public'
   AND table_name IN ('quiz_questions','quiz_options')
   AND grantee IN ('anon','authenticated');

-- ── 6. RPC surface: definer, pinned search_path, anon blocked ─────────────
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS args,
       p.prosecdef                                          AS definer,
       p.proconfig::text LIKE '%search_path%'               AS pinned,
       NOT has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_blocked,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_can
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN (
     'create_live_quiz_session','join_live_quiz_session','submit_live_quiz_answer',
     'advance_live_quiz_session','get_live_quiz_snapshot','remove_live_quiz_participant',
     'leave_live_quiz_session','find_my_live_quiz_session',
     'get_quiz_analytics_overview','get_quiz_question_analytics','get_quiz_student_analytics',
     'get_student_quiz_report','get_quiz_question_responses',
     'list_question_bank','search_question_bank','save_question_bank_question',
     'get_question_bank_question','add_question_bank_questions_to_quiz',
     'get_quiz_result','get_quiz_for_attempt','tenant_feature_enabled')
 ORDER BY p.proname;
-- All four columns must be true on every row. Every function listed here is a
-- public entry point the client calls; the internal helpers are checked
-- separately in step 8, where the expectation is the opposite.

-- ── 7. Exactly one submit_live_quiz_answer ────────────────────────────────
SELECT pg_get_function_identity_arguments(p.oid) AS args
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'submit_live_quiz_answer';
-- Expect ONE row: uuid, integer, uuid, text, jsonb.
-- Two rows means the 4-argument form survived and every call from the client
-- fails as "function is not unique".

-- ── 8. Internal helpers are not callable from the API ─────────────────────
SELECT p.proname,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_can
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('_quiz_answer_is_correct','_grade_and_finalize_attempt',
                     '_quiz_for_analytics','_resync_live_quiz_counts',
                     '_live_quiz_points','expire_stale_live_quiz_sessions')
 ORDER BY p.proname;
-- auth_can must be false on every row.

-- ── 9. Realtime publishes the session row and nothing with an answer key ──
SELECT tablename FROM pg_publication_tables
 WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
 ORDER BY tablename;
-- live_quiz_sessions PRESENT.
-- quiz_questions, quiz_options, question_bank_questions, question_bank_options,
-- live_quiz_answers ABSENT.

-- ── 10. Replica identity, so an UPDATE carries enough for the filter ──────
SELECT relname, relreplident
  FROM pg_class
 WHERE relnamespace = 'public'::regnamespace
   AND relname = 'live_quiz_sessions';
-- Expect 'f' (FULL).

-- ── 11. Indexes the analytics RPCs depend on ──────────────────────────────
SELECT indexname FROM pg_indexes
 WHERE schemaname = 'public'
   AND tablename IN ('student_quiz_answers','quiz_results','quiz_attempts',
                     'question_bank_questions','live_quiz_answers')
 ORDER BY tablename, indexname;

-- ── 12. Nothing was destroyed ─────────────────────────────────────────────
-- Run the same counts before and after; they must be identical or larger.
SELECT
  (SELECT count(*) FROM public.quizzes)              AS quizzes,
  (SELECT count(*) FROM public.quiz_questions)       AS questions,
  (SELECT count(*) FROM public.quiz_options)         AS options,
  (SELECT count(*) FROM public.quiz_attempts)        AS attempts,
  (SELECT count(*) FROM public.quiz_results)         AS results,
  (SELECT count(*) FROM public.student_quiz_answers) AS answers;
```

### The answer-key probe

The one check to run by hand, because it is the one whose failure is a release
blocker. Substitute a real enrolled student's `user_id`.

```sql
BEGIN;
SELECT set_config('request.jwt.claim.sub', '<an enrolled student user_id>', true);
SET LOCAL ROLE authenticated;

SELECT is_correct       FROM public.quiz_options   LIMIT 1;  -- must deny
SELECT correct_answer   FROM public.quiz_questions LIMIT 1;  -- must deny
SELECT accepted_answers FROM public.quiz_questions LIMIT 1;  -- must deny
SELECT numeric_answer   FROM public.quiz_questions LIMIT 1;  -- must deny

ROLLBACK;
```

All four must fail with `permission denied for table ...`. If any returns rows,
stop and turn every flag off: the answer key is readable from a browser
console.

## Rollback

No migration here drops or rewrites data, so rollback is a privilege and
behaviour question rather than a data one.

| Symptom | Action |
| --- | --- |
| Anything wrong with a feature | Turn its flag off — see `PILOT_ENABLEMENT.md`. No deploy, effective on the next request. |
| Live multiplayer misbehaving | `liveQuizMultiplayer = false`. Games in progress finish; no new ones start. |
| Analytics wrong | `quizAnalytics = false`. Read-only feature, nothing to unwind. |
| Bank wrong | `questionBank = false`. Rows stay; they become unreadable. |
| New types wrong | `expandedQuestionTypes = false` stops NEW ones being authored. Questions already saved keep grading — do not drop the widened constraint to "undo" this, it would strand that content. |

Reverting a migration is not the first move and mostly not needed. If
`20260904000000` must genuinely be undone, note that it dropped the
4-argument `submit_live_quiz_answer`; restoring the earlier state means
re-creating that signature, not simply re-running an older file.

## What has and has not been verified

Verified, against a local PostgreSQL 16 carrying all ten migrations under the
same RLS with two centres:

```
supabase/tests/live_quiz/run.sh         156/156
supabase/tests/quiz_phase345/run.sh     206/206
supabase/tests/live_quiz_types/run.sh    88/88   (all ten, in this order)
npx vitest run                          270/270
npm run audit:sw                         14/14
```

Every read-only query in this document was run against that database and
returns the values it says to expect.

**Not verified: production.** Supabase MCP lists no project for this
application from this environment and both `arasaplus.info` and
`srisarjana.arasaplus.info` are unreachable from it, so nothing here has been
run against the live database. In particular these remain assumptions until
step 1–12 above are run there:

- that production's migration history matches this repository;
- that `quiz_questions_type_ck` still carries the old three-value list;
- that `authenticated` holds no grant on either answer-key table;
- that PostgREST resolves a legacy four-key `submit_live_quiz_answer` body
  against the five-parameter function using the default — the SQL-level
  four-argument call is proven (`H3`, `H4`), the PostgREST resolution is not,
  because there is no PostgREST in this environment.

This requires production verification. The assumption that the live database
matched this repository is exactly what made `20260831000000` widen a privilege
it meant to narrow.
