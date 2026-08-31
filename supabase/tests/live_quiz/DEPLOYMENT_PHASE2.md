# Live multiplayer quiz — Phase 2 deployment runbook

Applies `supabase/migrations/20260831000000_live_quiz_phase2.sql` on top of
`20260830000000_live_quiz_sessions.sql`.

**Nothing here has been run against production.** Everything below was validated
against a local PostgreSQL 16 instance using the fixture in this directory
(152/152 assertions, plus an 11-assertion 30-player simulation) and by applying
the migration three times in a row to prove it is re-runnable. Production
behaviour is confirmed by *you*.

---

## 0. Read this first — the one change that is not additive

Phase 1 was purely additive. **Phase 2 is not.** It changes a grant on a table
the solo quiz also uses:

```sql
REVOKE SELECT ON public.quiz_options FROM authenticated;
GRANT  SELECT (<every column except is_correct>) ON public.quiz_options TO authenticated;
```

### Why

`get_live_quiz_snapshot` carefully returns `is_correct: null` until the host
reveals. That redaction was defeatable from a browser console in one line:

```js
supabase.from('quiz_options').select('question_id,option_text,is_correct')
```

The policy `"quiz_options read for enrolled or staff"` grants every enrolled
student SELECT on those rows, and the session row — which participants must be
able to read for Realtime to work — carries `question_ids` for the whole game.
A player could therefore read every correct answer **before the first question
opened**. This was reproduced against a real Postgres with real RLS: the student
got back all 7 option rows with their `is_correct` values.

RLS is row-level and cannot express "this column, not that one". Column
privileges can.

### Why it is safe

| Consumer | Reads `is_correct`? | Mode | Affected? |
|---|---|---|---|
| `get_quiz_for_attempt` | yes | SECURITY DEFINER | no |
| `submit_quiz_attempt` | yes | SECURITY DEFINER | no |
| `start_quiz_attempt` | yes | SECURITY DEFINER | no |
| `save_quiz_definition` | yes (writes) | SECURITY DEFINER | no |
| `get_quiz_definition_for_manager` | yes | SECURITY DEFINER | no |
| `get_live_quiz_snapshot` | yes | SECURITY DEFINER | no |
| Any frontend code | — | — | **there is none** |

`grep -rn 'from("quiz_options")' src/` returns nothing. SECURITY DEFINER
functions execute as the owner, so a grant made to `authenticated` does not
apply to them. Assertions S1–S3 prove this mechanism directly: a DEFINER
function still reads the key, an INVOKER function no longer can, and INSERT /
UPDATE on the column are untouched so the builder still saves answer keys.

**If you have code outside this repository that reads `quiz_options` directly,
it will break.** Check before applying.

---

## 1. What else the migration does

| Area | Change |
|---|---|
| Roster | `_resync_live_quiz_counts()` recomputes `participant_count` / `answered_count` from the child tables. `leave_live_quiz_session` never decremented, so a lobby over-reported after anyone left. |
| Membership | Participant status gains `'removed'`. `submit_live_quiz_answer` now refuses anyone whose status is not `'joined'`. |
| Host control | New `remove_live_quiz_participant(uuid, uuid)`, authorised by the same `can_manage_class` as every other host action. |
| Snapshot | Adds host-only `question_stats` (per-option counts), host-only roster fields (`score`, `answered`, `last_seen_at`), a completed-session `summary`, and `my_status`. A player's payload is otherwise byte-for-byte unchanged. |
| Lifecycle | `expires_at` (default now + 6h, pushed forward on every host action). `join` and `advance` reject an expired session; `expire_stale_live_quiz_sessions()` cancels them in bulk, freeing their game codes. |
| Transitions | `complete` may no longer be called from the lobby — it used to end a game that never started. |

**Contains no** `DROP TABLE`, `TRUNCATE`, or `DELETE FROM`. Verify:

```bash
grep -nE 'DROP TABLE|TRUNCATE|DELETE FROM' \
  supabase/migrations/20260831000000_live_quiz_phase2.sql
# expected: no output
```

The only `ALTER TABLE` statements add `expires_at` and widen the participant
status CHECK constraint.

---

## 2. Preconditions

1. `20260830000000_live_quiz_sessions.sql` is already applied.
2. `liveQuizMultiplayer` is still `false` for every tenant.
3. You have a backup / point-in-time recovery window.
4. Confirm the column list the migration will grant back is what you expect:

```sql
SELECT string_agg(column_name, ', ' ORDER BY ordinal_position)
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='quiz_options' AND column_name <> 'is_correct';
```

The migration builds this list from the catalogue at run time rather than from a
hard-coded list, and raises if `quiz_options` is missing. An earlier draft
hard-coded the columns; a single unexpected column rolled the whole `DO` block
back and left the answer key readable while only printing a `WARNING`. That is
why the check is now an assertion inside the same transaction:

```sql
IF has_column_privilege('authenticated','public.quiz_options','is_correct','SELECT') THEN
  RAISE EXCEPTION 'quiz_options.is_correct is still selectable by authenticated';
END IF;
```

---

## 3. Apply

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20260831000000_live_quiz_phase2.sql
```

Two `NOTICE`s about `expires_at` and `live_quiz_sessions_expiry_idx` already
existing are expected on a re-run and are harmless.

---

## 4. Verify in production

```sql
-- 4a. The answer key is closed.
SELECT has_column_privilege('authenticated','public.quiz_options','is_correct','SELECT') AS leaked,
       has_column_privilege('authenticated','public.quiz_options','option_text','SELECT') AS text_ok,
       has_column_privilege('authenticated','public.quiz_options','is_correct','INSERT') AS writes_ok;
-- expected: leaked=false, text_ok=true, writes_ok=true

-- 4b. The new surface is granted correctly.
SELECT has_function_privilege('authenticated','public.remove_live_quiz_participant(uuid,uuid)','EXECUTE') AS can_remove,
       has_function_privilege('anon','public.remove_live_quiz_participant(uuid,uuid)','EXECUTE') AS anon_can_remove,
       has_function_privilege('authenticated','public.expire_stale_live_quiz_sessions()','EXECUTE') AS anyone_can_sweep;
-- expected: true, false, false

-- 4c. Counters are consistent for every open session.
SELECT s.id, s.participant_count,
       (SELECT count(*) FROM live_quiz_participants p
         WHERE p.session_id = s.id AND p.status = 'joined') AS actual
  FROM live_quiz_sessions s
 WHERE s.status NOT IN ('completed','cancelled');
-- expected: participant_count = actual on every row

-- 4d. Every session has a deadline.
SELECT count(*) FILTER (WHERE expires_at IS NULL) AS missing_expiry FROM live_quiz_sessions;
-- expected: 0
```

Then run the solo quiz end to end (start → answer → exit → re-enter → resume →
submit → result → explanation flip card) and the quiz builder (edit → save →
publish). Those are the paths the column revoke could plausibly affect.

---

## 5. Optional: schedule the expiry sweep

Not required. `join` and `advance` enforce `expires_at` inline, so an unswept
row is already unplayable; the sweep only frees the six-digit code sooner.

If `pg_cron` is available:

```sql
SELECT cron.schedule('live-quiz-expiry', '17 * * * *',
  $$SELECT public.expire_stale_live_quiz_sessions()$$);
```

Otherwise call it from any scheduled job you already run. It is idempotent and
touches only rows already past their deadline.

---

## 6. Rollback

The Phase 2 functions are all `CREATE OR REPLACE`, so re-applying
`20260830000000_live_quiz_sessions.sql` restores the Phase 1 bodies. To undo the
grant change specifically — **which re-opens the answer-key leak** — run:

```sql
GRANT SELECT ON public.quiz_options TO authenticated;
```

`expires_at` and the `'removed'` status can be left in place; nothing reads them
once the Phase 1 function bodies are back.

---

## 7. What is still not verified

- Nothing in this file has been executed against the production database.
- Supabase Realtime was not exercised: the local Postgres has the publication
  and `REPLICA IDENTITY FULL`, but no Realtime server. Multi-client
  synchronisation, reconnect and dropped-event recovery need a real deployment.
- The 30-player simulation ran in-process against local Postgres, not 30
  browsers over a network.
- `quiz_questions.correct_answer` and `quiz_questions.explanation` remain
  readable by enrolled students. `correct_answer` is NULL for every quiz the
  current builder produces (`save_quiz_definition` writes the key only into
  `quiz_options`), so it is not a live-quiz leak, but the legacy admin CMS still
  populates and displays it. Closing that column needs the admin CMS and
  analytics pages moved off `select("*")` first, and is deliberately out of
  scope here.
