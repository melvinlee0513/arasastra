# Enabling `liveQuizMultiplayer` — after Realtime QA, not before

Deliberately separate from `ACTIVATE_SRI_SARJANA.sql`. The other three features
are read-mostly and single-user; this one puts a whole class on one screen at
once and depends on a Realtime channel that nothing in this repository can
exercise. Bundling it into the first activation would mean a bad Realtime day
takes the Question Bank down with it.

**Do not run the SQL at the bottom until every gate below has passed against
production, with real accounts on real devices.**

## Preconditions

`ACTIVATE_SRI_SARJANA.sql` has been run and `quizAnalytics`, `questionBank` and
`expandedQuestionTypes` have been in use for long enough to be trusted.

## Backend gate — read-only

```sql
-- 1. Exactly ONE submit_live_quiz_answer. Two means the 4-argument form
--    survived and EVERY answer fails as "function is not unique".
SELECT pg_get_function_identity_arguments(p.oid) AS args
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'submit_live_quiz_answer';
-- Expect one row: uuid, integer, uuid, text, jsonb

-- 2. Realtime publishes the session row and NOTHING holding an answer key.
SELECT tablename FROM pg_publication_tables
 WHERE pubname = 'supabase_realtime' AND schemaname = 'public' ORDER BY tablename;
-- live_quiz_sessions PRESENT.
-- live_quiz_answers, quiz_questions, quiz_options ABSENT.

-- 3. REPLICA IDENTITY FULL, or the UPDATE payload cannot carry the filter.
SELECT relreplident FROM pg_class
 WHERE relnamespace = 'public'::regnamespace AND relname = 'live_quiz_sessions';
-- Expect 'f'

-- 4. RLS on all three live tables.
SELECT relname, relrowsecurity FROM pg_class
 WHERE relnamespace = 'public'::regnamespace
   AND relname IN ('live_quiz_sessions','live_quiz_participants','live_quiz_answers');
-- All true.

-- 5. anon can reach none of it.
SELECT p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('create_live_quiz_session','join_live_quiz_session',
                     'submit_live_quiz_answer','advance_live_quiz_session',
                     'get_live_quiz_snapshot','remove_live_quiz_participant');
-- anon_can false on every row.
```

## Live gate — a real session, real devices

One tutor account and **three independent student accounts**, on three separate
devices or browser profiles. Not three tabs of one login: a single session
cannot show a rejoin race or a per-participant score bug.

| # | Check | Pass means |
| --- | --- | --- |
| 1 | Tutor creates a session from Quiz Manager → **Host live quiz** | Lobby appears with a six-digit code |
| 2 | Three students join with the code | All three appear in the roster **without a manual refresh** |
| 3 | Tutor starts | All three land on question 1 within a second or two |
| 4 | Each student answers | The answered count climbs on the host screen as they do |
| 5 | Tutor locks, then reveals | Correctness appears **only now**, on every device |
| 6 | Response distribution | Counts match what the three actually chose |
| 7 | A student hard-refreshes mid-question | Returns to the same question, answer intact, not re-askable |
| 8 | A student kills the connection, restores it | Rejoins the same participant row; score unchanged |
| 9 | Tutor advances through every question | No student is left behind on a stale question |
| 10 | Tutor finishes | Leaderboard and completion persist after a refresh |
| 11 | All six question types play | mcq, true/false, multiple select, short answer, numeric, fill blank |
| 12 | Tutor removes a player mid-game | That player is told, and cannot answer or rejoin |

## Security gate — must all FAIL to act

| # | Attempt | Required outcome |
| --- | --- | --- |
| 1 | Student calls `advance_live_quiz_session` from the console | `access_denied` |
| 2 | Student calls `create_live_quiz_session` | `access_denied` |
| 3 | Student calls `remove_live_quiz_participant` | `access_denied` |
| 4 | A tutor from another centre calls `get_live_quiz_snapshot` on this session | `session_not_found` |
| 5 | A student of another centre joins with the code | `session_not_found` |
| 6 | Student submits an answer for another participant | Not possible — the RPC takes no participant id |
| 7 | Student re-submits the same question | `duplicate`, score unchanged |
| 8 | Answer-key probe, mid-question (below) | All four denied |

```sql
BEGIN;
SELECT set_config('request.jwt.claim.sub', '<a student in the live game>', true);
SET LOCAL ROLE authenticated;
SELECT is_correct       FROM public.quiz_options   LIMIT 1;  -- must deny
SELECT correct_answer   FROM public.quiz_questions LIMIT 1;  -- must deny
SELECT accepted_answers FROM public.quiz_questions LIMIT 1;  -- must deny
SELECT numeric_answer   FROM public.quiz_questions LIMIT 1;  -- must deny
ROLLBACK;
```

### Answer secrecy, in the browser

With DevTools open on a **student** device, mid-question and **before** the
tutor reveals, inspect the `get_live_quiz_snapshot` response. It must contain
none of: a non-null `is_correct` on any option, `accepted_answers`,
`numeric_answer`, `numeric_tolerance`, `explanation`, `question_stats`, or the
`game_code`.

This is the one check worth doing by eye rather than by query: it is what a
curious student would actually do.

## Enable

Only when every gate above has passed.

```sql
UPDATE public.tuition_centers
   SET feature_flags = COALESCE(feature_flags, '{}'::jsonb)
                    || '{"liveQuizMultiplayer": true}'::jsonb
 WHERE subdomain_slug = '<the pilot centre subdomain_slug>'
RETURNING subdomain_slug, feature_flags;
```

The column is `subdomain_slug`. Production's `tuition_centers` has no `slug`.

## Turning it off

```sql
UPDATE public.tuition_centers
   SET feature_flags = COALESCE(feature_flags, '{}'::jsonb)
                    || '{"liveQuizMultiplayer": false}'::jsonb
 WHERE subdomain_slug = '<the pilot centre subdomain_slug>'
RETURNING subdomain_slug, feature_flags;
```

A game **already in progress is not killed**: only session *creation* is
guarded, so a class mid-quiz finishes and the session ages out on its own
six-hour expiry. Cutting thirty students off mid-question is worse than letting
one more game finish. New games stop immediately, and both entry points — the
tutor's **Host live quiz** button and the student's **Join a live quiz** button
— disappear on the next request.

---

### What this repository has and has not proven

Proven, against a local PostgreSQL 16 carrying every Phase 1–5 migration under
real RLS with two centres: the state machine, per-type grading for all six
types, answer redaction before reveal, host-only distribution, kick, expiry,
idempotent submission, cross-tenant denial, and a 30-player simulation (600
submissions → 300 rows, 0 duplicates).

**Not proven, and not provable here:** anything involving the Realtime channel.
There is no Supabase Realtime in this environment, so roster updates, question
transitions, reconnect and the refresh cases in the live gate above have only
ever been exercised through the snapshot RPC, never over a websocket. That is
the entire reason this flag is held back while the other three go on.
