# Live multiplayer quiz — deployment runbook

Applies `supabase/migrations/20260830000000_live_quiz_sessions.sql` to the real
Aras A+ project.

**Nothing here has been run against production.** Everything below was validated
against a local PostgreSQL 16 instance using the fixture in this directory
(93/93 assertions) and by applying the migration three times in a row to prove it
is re-runnable. Production behaviour is confirmed by *you*, in step 4.

---

## 0. What this migration does and does not do

**Adds** three tables (`live_quiz_sessions`, `live_quiz_participants`,
`live_quiz_answers`), one enum (`live_quiz_status`), seven RPCs plus three
internal functions, two RLS policies, and one table to the `supabase_realtime`
publication.

**Does not touch** any existing table, column, policy, grant, function or row.
It contains no `DROP TABLE`, no `TRUNCATE`, no `ALTER` of an existing table, and
no change to `save_quiz_progress`, `save_flashcard_progress`, tenant bootstrap,
or any existing RLS. Verify for yourself before applying:

```bash
grep -nE 'DROP TABLE|TRUNCATE|DELETE FROM|ALTER TABLE public\.(quiz|classes|profiles|tuition)' \
  supabase/migrations/20260830000000_live_quiz_sessions.sql
# expected: no output
```

**Blast radius if it fails:** the transaction rolls back and nothing exists. The
app is unaffected because `liveQuizMultiplayer` is `false`, so no user-facing
route reaches this schema.

---

## 1. Preconditions

| Requirement | Why | How to check |
|---|---|---|
| `tuition_centers`, `classes`, `quizzes`, `quiz_questions`, `quiz_options`, `profiles` exist | the migration has FKs to them | `\dt public.*` |
| `can_manage_class(uuid)` and `is_enrolled_in_class(uuid)` exist | both RLS and every RPC call them | see query in §2 |
| `supabase_realtime` publication exists | the migration does `ALTER PUBLICATION … ADD TABLE` | `select 1 from pg_publication where pubname='supabase_realtime'` |
| `authenticated` and `anon` roles exist | grants target them | Supabase default |
| No existing `live_quiz_*` object | this is a first install | `select count(*) from pg_tables where tablename like 'live_quiz%'` → 0 |

Run all preconditions at once:

```sql
select
  (select count(*) from pg_tables where schemaname='public'
     and tablename in ('tuition_centers','classes','quizzes','quiz_questions','quiz_options','profiles')) as base_tables_found_expect_6,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname in ('can_manage_class','is_enrolled_in_class')) as helpers_found_expect_2,
  (select count(*) from pg_publication where pubname='supabase_realtime') as publication_expect_1,
  (select count(*) from pg_tables where schemaname='public' and tablename like 'live_quiz%') as existing_live_tables_expect_0;
```

> **Note on the migrations folder.** `tuition_centers` is referenced by this
> repository's migrations but never created by them — the table predates this
> migration history. That means `supabase db reset` against an empty database
> will fail on unrelated grounds. It does **not** affect applying this migration
> to the real project, where the table exists.

---

## 2. Apply

Take a snapshot first. Supabase keeps daily backups on paid plans; for a
point-in-time marker, use the dashboard's **Database → Backups → Create backup**
before proceeding.

### Preferred: Supabase CLI

```bash
supabase link --project-ref lbrmsxoxzjhswmnexizc
supabase db push --dry-run    # confirm ONLY 20260830000000 is pending
supabase db push
```

`--dry-run` is the important step: if it lists any migration other than
`20260830000000_live_quiz_sessions.sql`, stop and find out why.

### Alternative: SQL editor

Paste the migration file whole into the Supabase SQL editor and run it once. It
is written to be re-runnable, so a partial failure can be corrected and re-run
without cleanup.

---

## 3. Verify (read-only, ~1 second)

```bash
psql "$DATABASE_URL" -f supabase/tests/live_quiz/verify_deployment.sql
```

All 21 rows must read `PASS`. Checks 18 and 20 confirm the solo quiz system is
untouched; checks 8, 9, 13 and 14 are the ones most likely to catch a partial
apply. **Check 9 is the one that broke during development** — without EXECUTE on
the two RLS helper functions, the policy raises instead of returning false and
no session is readable at all.

If anything reads `FAIL`, do not proceed and do not enable the flag.

---

## 4. Real-browser QA

The migration being correct is not the same as the feature working. Follow
`QA_CHECKLIST.md` in this directory using the superadmin harness at
`/dev/live-quiz`, which drives the real RPCs and real Realtime and is
independent of the feature flag.

---

## 5. Rollback

The migration is additive, so rollback is a clean drop. **Only run this if no
live session has been played that you care about** — it deletes session history.

```sql
BEGIN;

-- 1. Stop publishing to realtime first, so no subscriber sees a vanishing table.
ALTER PUBLICATION supabase_realtime DROP TABLE public.live_quiz_sessions;

-- 2. Functions.
DROP FUNCTION IF EXISTS public.create_live_quiz_session(uuid, integer, boolean, integer, boolean);
DROP FUNCTION IF EXISTS public.join_live_quiz_session(text);
DROP FUNCTION IF EXISTS public.get_live_quiz_snapshot(uuid);
DROP FUNCTION IF EXISTS public.advance_live_quiz_session(uuid, text, integer);
DROP FUNCTION IF EXISTS public.submit_live_quiz_answer(uuid, integer, uuid, text);
DROP FUNCTION IF EXISTS public.leave_live_quiz_session(uuid);
DROP FUNCTION IF EXISTS public.find_my_live_quiz_session();
DROP FUNCTION IF EXISTS public._live_quiz_points(integer, timestamptz, timestamptz, timestamptz);

-- 3. Tables (children first; CASCADE would also work).
DROP TABLE IF EXISTS public.live_quiz_answers;
DROP TABLE IF EXISTS public.live_quiz_participants;
DROP TABLE IF EXISTS public.live_quiz_sessions;

-- 4. The RLS helpers, only after the policies that used them are gone with the tables.
DROP FUNCTION IF EXISTS public._is_live_quiz_participant(uuid);
DROP FUNCTION IF EXISTS public._can_host_live_quiz(uuid);

-- 5. The enum, last — the tables depended on it.
DROP TYPE IF EXISTS public.live_quiz_status;

-- Inspect, then COMMIT or ROLLBACK.
COMMIT;
```

Confirm the removal touched nothing else:

```sql
select
  (select count(*) from pg_tables where schemaname='public' and tablename like 'live_quiz%') as live_tables_expect_0,
  (select count(*) from pg_tables where schemaname='public'
     and tablename in ('quizzes','quiz_questions','quiz_options','quiz_attempts','quiz_results')) as solo_tables_expect_5,
  (select count(*) from public.quiz_attempts) as attempts_unchanged;
```

**Softer rollback.** If the schema is fine but the feature misbehaves, you do not
need to drop anything: set `liveQuizMultiplayer` to `false` in the tenant's
feature flags. Every user-facing route is gated on it, so the feature disappears
while the data stays for diagnosis. Prefer this. The harness at `/dev/live-quiz`
stays available to superadmins either way.

**Mid-game rollback.** Cancel live sessions cleanly first rather than dropping
tables underneath connected players:

```sql
update public.live_quiz_sessions
   set status='cancelled', completed_at=now(), state_revision=state_revision+1
 where status not in ('completed','cancelled');
```
