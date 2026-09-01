# Enabling the Phase 1–5 quiz work for a pilot centre

Everything below runs against the production database. Nothing here drops,
truncates, resets or rewrites existing data.

## What the flags are, and where they live

One system, already in the codebase since `20260712150345`. Flags are **centre
scoped**, stored as a jsonb object on the centre's own row:

```
public.tuition_centers.feature_flags  jsonb NOT NULL DEFAULT '{}'
```

They are read in exactly two places, and both default these four to **off**:

| Where | How |
| --- | --- |
| Client | `useFeatureEnabled(flag)` — `src/hooks/useFeature.ts` |
| Database | `public.tenant_feature_enabled(center_id, flag, false)` — `20260803024307` |

There is no global flag table, no environment variable, and no centre id or
slug anywhere in the product code. Enabling a centre is one `UPDATE` against
that centre's row; ending the pilot is the same `UPDATE` with `false`.

## The four flags

| Flag | Gates | Enforced in the database? |
| --- | --- | --- |
| `liveQuizMultiplayer` | Hosting and playing a live game | Yes — `create_live_quiz_session` |
| `quizAnalytics` | All five analytics RPCs | Yes — `_quiz_for_analytics` |
| `questionBank` | The whole bank, RPCs and RLS | Yes — `_my_question_bank_center`, `_can_use_question_bank` |
| `expandedQuestionTypes` | Which types the picker offers | **No** — authoring gate only, see below |

`expandedQuestionTypes` is deliberately not enforced in the database. The
builder rewrites a quiz's questions on every save, so a `CHECK` or trigger on
`question_type` would stop a tutor editing the *title* of a quiz that already
contains a numeric question. It decides what the picker offers; content that
already exists keeps working and keeps grading whatever the flag says.

Turning `liveQuizMultiplayer` off does **not** kill a game already in progress:
creation is what is guarded, so a class mid-quiz finishes and the session ages
out on its own six-hour expiry. Cutting thirty students off mid-question is
worse than one more game running.

## Before enabling: confirm the migrations actually landed

Read-only. Run all of it and read the output before touching any flag.

```sql
-- 1. Every migration this work depends on, newest last.
SELECT version, name
  FROM supabase_migrations.schema_migrations
 WHERE version >= '20260830000000'
 ORDER BY version;
-- Expect, in this order:
--   20260830000000 live_quiz_sessions
--   20260831000000 live_quiz_phase2
--   20260901000000 quiz_analytics
--   20260902000000 question_bank
--   20260903000000 question_types
--   20260904000000 live_quiz_all_types
--   20260905000000 answer_key_least_privilege
--   20260905000100 quiz_result_answer_keys
--   20260906000000 widen_question_type_constraint
--   20260906000100 feature_flag_enforcement

-- 2. The question-type constraint admits what the engine grades.
--    Before 20260906000000 this reads ('mcq','multiple_choice','true_false')
--    and NOT ONE Phase 5 type can be saved.
SELECT pg_get_constraintdef(oid) AS quiz_questions_type_ck
  FROM pg_constraint
 WHERE conname = 'quiz_questions_type_ck'
   AND conrelid = 'public.quiz_questions'::regclass;

-- 3. The answer keys are unreachable directly. Both queries must return zero
--    rows. The second is the one that matters: a COLUMN grant is invisible to
--    has_table_privilege.
SELECT grantee, table_name, privilege_type
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public'
   AND table_name IN ('quiz_questions', 'quiz_options')
   AND grantee IN ('anon', 'authenticated');

SELECT grantee, table_name, column_name, privilege_type
  FROM information_schema.column_privileges
 WHERE table_schema = 'public'
   AND table_name IN ('quiz_questions', 'quiz_options')
   AND grantee IN ('anon', 'authenticated');

-- 4. The RPCs exist, are SECURITY DEFINER, pin their search_path, and are not
--    executable by anon. Any row with ok = false is a blocker.
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS args,
       p.prosecdef                                        AS definer,
       p.proconfig::text LIKE '%search_path%'             AS pinned,
       NOT has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_blocked,
       (p.prosecdef
        AND p.proconfig::text LIKE '%search_path%'
        AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')) AS ok
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN (
     'create_live_quiz_session','join_live_quiz_session','submit_live_quiz_answer',
     'advance_live_quiz_session','get_live_quiz_snapshot','remove_live_quiz_participant',
     'get_quiz_analytics_overview','get_quiz_question_analytics','get_quiz_student_analytics',
     'get_student_quiz_report','get_quiz_question_responses',
     'list_question_bank','search_question_bank','save_question_bank_question',
     'get_question_bank_question','add_question_bank_questions_to_quiz',
     'get_quiz_result','_quiz_answer_is_correct','tenant_feature_enabled')
 ORDER BY p.proname;

-- 5. Exactly one submit_live_quiz_answer. Two means the 4-arg form survived and
--    every call fails as "function is not unique".
SELECT count(*) AS overloads
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'submit_live_quiz_answer';
-- Expect: 1

-- 6. Realtime carries the session table and nothing that holds an answer key.
SELECT tablename FROM pg_publication_tables
 WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
 ORDER BY tablename;
-- Expect live_quiz_sessions present; quiz_questions and quiz_options ABSENT.

-- 7. RLS is on for every table this work added.
SELECT relname, relrowsecurity
  FROM pg_class
 WHERE relnamespace = 'public'::regnamespace
   AND relname IN ('live_quiz_sessions','live_quiz_participants','live_quiz_answers',
                   'question_bank_collections','question_bank_questions','question_bank_options')
 ORDER BY relname;
-- Every row must be true.
```

### The answer-key probe

The single check worth running by hand, because it is the one that would be a
release blocker if it failed. Substitute a real enrolled student's `user_id`
and run it in a transaction that is rolled back:

```sql
BEGIN;
SELECT set_config('request.jwt.claim.sub', '<an enrolled student user_id>', true);
SET LOCAL ROLE authenticated;

-- All four must fail with "permission denied for table ...".
SELECT is_correct        FROM public.quiz_options   LIMIT 1;
SELECT correct_answer    FROM public.quiz_questions LIMIT 1;
SELECT accepted_answers  FROM public.quiz_questions LIMIT 1;
SELECT numeric_answer    FROM public.quiz_questions LIMIT 1;

ROLLBACK;
```

If any of those returns rows, stop: the answer key is readable from a browser
console and no flag should be turned on until it is not.

## The short way

[`ACTIVATE_SRI_SARJANA.sql`](./ACTIVATE_SRI_SARJANA.sql) does everything in this
section in one transaction: it runs every verification below, and enables
`quizAnalytics`, `questionBank` and `expandedQuestionTypes` only if all of them
pass, leaving `liveQuizMultiplayer` explicitly false. If anything fails it names
each problem and rolls back, changing nothing. Set the slug on the marked line
and paste it into the SQL Editor.

The rest of this document is the same work done by hand, for when you want to
see each step.

## Enabling one centre

Find the centre by its slug — never hardcode the id:

```sql
SELECT id, name, slug, feature_flags
  FROM public.tuition_centers
 WHERE slug = '<the pilot centre slug>';
```

Then, features one at a time rather than all four at once, so a problem is
attributable:

```sql
-- Merge, so no existing flag is lost. `||` on jsonb overwrites only the keys
-- named on the right.
UPDATE public.tuition_centers
   SET feature_flags = COALESCE(feature_flags, '{}'::jsonb)
                    || '{"expandedQuestionTypes": true}'::jsonb
 WHERE slug = '<the pilot centre slug>'
RETURNING slug, feature_flags;
```

Suggested order, each left running long enough to see real use:

1. `expandedQuestionTypes` — authoring only, nothing student-facing changes
   until a tutor uses one.
2. `questionBank` — staff-only; students have no policy on it at all.
3. `quizAnalytics` — read-only, staff-only.
4. `liveQuizMultiplayer` — last, because it is the only one that puts a whole
   class on a screen at once.

## Turning it off

Same statement, `false`. Both the client and the RPCs read the same row, so no
deploy is involved and the change takes effect on the next request.

```sql
UPDATE public.tuition_centers
   SET feature_flags = COALESCE(feature_flags, '{}'::jsonb)
                    || '{"liveQuizMultiplayer": false}'::jsonb
 WHERE slug = '<the pilot centre slug>'
RETURNING slug, feature_flags;
```

Nothing is deleted by turning a flag off. Bank questions, analytics history and
finished live sessions all remain; they become unreadable, and readable again
when the flag returns.

## What this document does NOT claim

None of the above has been run against the production database. It was written
from the repository's migrations and proven against a local PostgreSQL 16
carrying the same migrations under the same RLS
(`supabase/tests/live_quiz_types`, `supabase/tests/quiz_phase345`,
`supabase/tests/live_quiz`). Whether production's grants, constraints and
migration history match this repository is exactly what step 1–7 above are for,
and it **requires production verification** — the assumption that they matched
is what made `20260831000000` widen a privilege it meant to narrow.
