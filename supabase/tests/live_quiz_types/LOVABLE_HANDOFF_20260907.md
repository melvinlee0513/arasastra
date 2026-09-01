# Lovable handoff — Question Bank centre resolution

**Apply to the EXISTING Aras LMS Lovable Cloud production database.** Do not
create a new project, do not reset, do not restore from a template.

## 1. Migration

```
supabase/migrations/20260907000000_question_bank_center_resolution.sql
```

One migration. It replaces the body of a single function. No table, column,
policy, grant, index or row is added, dropped or modified.

## 2. Purpose

`_my_question_bank_center()` opens with

```sql
SELECT r.center_id FROM public.user_roles r
 WHERE r.user_id = auth.uid() AND r.role IN ('admin','superadmin')
   AND r.center_id IS NOT NULL
```

and **`public.user_roles` has no `center_id` column.** Production's user_roles
is `(id, user_id, role, created_at)` — confirmed from
`src/integrations/supabase/types.ts`, which is generated from the live database.

That is the first statement in the body, so plpgsql cannot plan it and raises
`column r.center_id does not exist` on **every** call. All thirteen Question
Bank RPCs resolve their centre through this function, so the feature is not
degraded for admins — it is completely inert for every role, tutors included.

The fix routes centre resolution through `public.get_user_center()`
(`20260706172344`), which reads `profiles.center_id` and is the resolver the
rest of this app already uses. `_admin_can_manage_center` reads the same column.
Tutors keep their `class_tutors` fallback. Authorisation is unchanged and still
lives in `_can_use_question_bank`, which never referenced `user_roles`.

**`user_roles` is deliberately NOT given a `center_id` column.** That would
create a second, competing source of tenant membership alongside
`profiles.center_id`.

## 3. BEFORE — read-only

```sql
-- (a) Confirm the column really is absent. Expect ZERO rows.
SELECT column_name FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'user_roles'
   AND column_name = 'center_id';

-- (b) Confirm the function is still the broken one. Expect true, true.
SELECT p.prosrc LIKE '%user_roles%'      AS reads_user_roles_broken,
       p.prosrc NOT LIKE '%get_user_center%' AS missing_canonical_resolver
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = '_my_question_bank_center';

-- (c) Confirm the column the fix depends on EXISTS. Expect one row.
SELECT column_name FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'profiles'
   AND column_name = 'center_id';

-- (d) The canonical resolver must exist. Expect one row.
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'get_user_center';

-- (e) Row counts, to compare afterwards. Nothing here should change.
SELECT (SELECT count(*) FROM public.quizzes)                  AS quizzes,
       (SELECT count(*) FROM public.quiz_questions)           AS questions,
       (SELECT count(*) FROM public.quiz_options)             AS options,
       (SELECT count(*) FROM public.quiz_attempts)            AS attempts,
       (SELECT count(*) FROM public.quiz_results)             AS results,
       (SELECT count(*) FROM public.student_quiz_answers)     AS answers,
       (SELECT count(*) FROM public.question_bank_questions)  AS bank_questions;
```

If (c) or (d) returns nothing, **stop and report back** — the fix assumes both,
and applying it without them would replace one broken resolver with another.

## 4. Apply

Apply `20260907000000_question_bank_center_resolution.sql` as a normal
migration. It ends with a `DO` block that re-reads its own work and raises if
the replacement did not take, so a silent no-op fails loudly rather than
looking like success.

## 5. AFTER — read-only

```sql
-- (a) The function no longer touches user_roles, and does use the canonical
--     resolver. Expect: false, true, false.
SELECT p.prosrc LIKE '%user_roles%'          AS still_reads_user_roles,
       p.prosrc LIKE '%get_user_center%'     AS uses_canonical_resolver,
       has_function_privilege('authenticated',
         'public._my_question_bank_center()', 'EXECUTE') AS authenticated_can_call
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = '_my_question_bank_center';

-- (b) Posture preserved. Expect definer = true, pinned = true.
SELECT p.prosecdef AS definer, p.proconfig::text LIKE '%search_path%' AS pinned
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = '_my_question_bank_center';

-- (c) Re-run (e) from section 3. Every count must be IDENTICAL.
```

### End-to-end check as a real user

Substitute a real centre admin's `user_id` for that centre, and run inside a
transaction that is rolled back:

```sql
BEGIN;
SELECT set_config('request.jwt.claim.sub', '<a centre admin user_id>', true);
-- Expect the admin's own centre uuid, not an error.
SELECT public._my_question_bank_center();
ROLLBACK;
```

Before the migration this raises `column r.center_id does not exist`. After it,
it returns a uuid — or `feature_disabled: questionBank` if that centre's flag is
still off, which is also correct and is the next step, not a failure.

## 6. Rollback

Nothing to roll back at the data level: no data is touched.

- **Preferred:** turn the flag off. `questionBank = false` on the centre's
  `feature_flags` removes all access immediately, with no deploy. See
  `ACTIVATE_SRI_SARJANA.sql` and `PILOT_ENABLEMENT.md`.
- **Function-level:** re-applying the previous definition restores the broken
  behaviour, which is not a useful rollback target. If the new resolver is
  wrong for a case not covered here, turn the flag off and report the case
  rather than reverting to a function that cannot run.

## 7. Then

Once this migration is applied and section 5 passes, run
`ACTIVATE_SRI_SARJANA.sql`. It verifies this fix among its checks and refuses
to enable anything if the old resolver is still in place.

---

### Not verified from this environment

This migration has **not** been run against the Lovable Cloud production
database. It was proven against a local PostgreSQL 16 carrying every Phase 1–5
migration, with a fixture corrected to match production's actual schema:
`user_roles` without `center_id`, `profiles.center_id` present,
`tuition_centers.subdomain_slug` rather than `slug`, and the production bodies
of `get_user_center` and `_admin_can_manage_center`. With that fixture the old
function reproduces the production error, and the new one passes a thirteen-case
role matrix (`Z1`–`Z13` in `supabase/tests/quiz_phase345/03_qa_bank.sql`).

Whether production's `get_user_center` and `profiles.center_id` match what this
repository's migrations describe is what section 3 (c) and (d) exist to confirm
before anything is applied.
