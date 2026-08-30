# Live multiplayer — real-browser QA checklist

Run **after** the migration is applied and `verify_deployment.sql` reads 21×PASS.
Everything here uses the superadmin harness at **`/dev/live-quiz`**, which calls
the real RPCs and the real Realtime subscription. It is not gated on
`liveQuizMultiplayer`, so this whole checklist runs before the flag is enabled.

## Setup

| Window | Account | Notes |
|---|---|---|
| **T** — tutor | superadmin, or a tutor assigned to the QA class | normal window |
| **S1** | a student enrolled in the QA class | incognito window 1 |
| **S2** | a second enrolled student | incognito window 2 |
| **S3** | a third enrolled student | incognito window 3 |
| **F** — foreign | a user from a **different centre** | incognito window 4, used only in §9 |

Use a QA class with a **published** quiz of at least 3 questions, mixing
multiple-choice and true/false. Separate incognito windows matter: separate tabs
in one profile share a session and will not prove independent participants.

Keep the browser console and Network tab open in **S1** throughout.

---

## 1. Create session — T

- [ ] Open `/dev/live-quiz`. A non-superadmin must be redirected; confirm once.
- [ ] Paste the QA class id. Published quizzes appear.
- [ ] Select the quiz → **create session**.
- [ ] Log shows `created session <uuid> · code <6 digits>`.
- [ ] Diagnostics: `status = lobby`, `question index = -1 of N`, `state revision = 0`, `realtime = connected`.
- [ ] **Game code is exactly 6 digits.**

## 2. Join — S1, S2, S3

- [ ] Each student opens `/dev/live-quiz`, enters the code, **join**.
- [ ] Each log line shows a *distinct* participant id.
- [ ] Diagnostics on each student: `is host = false`, and **`game code` reads "hidden from players"**.
- [ ] **S1 presses join a second time** → log says `(rejoined)` and the participant id is *identical*. Roster does not grow.
- [ ] Wrong code (e.g. `000000`) → "That game code isn't valid."

## 3. Lobby realtime — T

- [ ] Without refreshing, **T**'s roster grows to 3 as each student joins.
- [ ] `participants / answered` reads `3 / 0`.
- [ ] Note the elapsed time between a student joining and T updating. More than ~2s consistently is worth investigating.

## 4. Start — T

- [ ] Press **start**.
- [ ] All three students move to the question **without refreshing**.
- [ ] Every window shows the same `question index` and the same `state revision`.
- [ ] **Press start again** → "That action isn't available right now." (invalid transition), and the index does *not* advance.

## 5. Answer secrecy — S1 (the P0 check)

While the question is open, in **S1**:

- [ ] Harness reads **`is_correct on options: all null (redacted)`**.
- [ ] Question panel reads **`explanation withheld`**.
- [ ] In the Network tab, open the `get_live_quiz_snapshot` response. Search the raw JSON for `"is_correct":true` → **must not appear**. Search for the explanation text → **must not appear**.
- [ ] In the console: `await window.supabase?.from('live_quiz_answers').select('*')` — if `window.supabase` is not exposed, instead confirm from `verify_deployment.sql` check 13 that `answers=false`. Either way the answers table must be unreadable.

## 6. Answering — S1, S2, S3

- [ ] S1 answers **correctly**, S2 **incorrectly**, S3 **correctly**.
- [ ] T's `answered` count climbs 1 → 2 → 3 without refreshing.
- [ ] **S1 taps the same option again** → log reads `answer was a DUPLICATE (no score)`.
- [ ] S1's score in the leaderboard is unchanged by that second tap.
- [ ] Correctness is **still hidden** for everyone — the question is open, not revealed.

## 7. Reveal, scoring, leaderboard — T then all

- [ ] T presses **reveal**.
- [ ] Students now see `✓` on the correct option and the explanation appears.
- [ ] S1: `is_correct=true`, `points` between the question's base points and 1.5× base.
- [ ] S2: `is_correct=false`, `points=0`.
- [ ] T presses **leaderboard**. Ordering is by score descending in every window, and each student sees themself marked `← you`.
- [ ] The same ordering appears identically in all four windows.

## 8. Advance, refresh, reconnect

- [ ] T presses **next**. All students move to question 2 together; `answered` resets to 0.
- [ ] **S2 answers question 2, then presses F5.** After reload: same participant id, score preserved, `my answer: answered=true`, and the answer buttons are not offered again.
- [ ] **T presses F5.** Press **recover my session** → returns the same session id with `is_host=true`; the game continues; **no second session is created** (check the log).
- [ ] **S3: DevTools → Network → Offline.** `realtime` goes to `reconnecting` or `disconnected`. Set back to **Online** → returns to `connected` and the snapshot catches up to the current question **without a manual refresh**.
- [ ] After reconnecting, S3's score is unchanged and no duplicate participant appears in T's roster.
- [ ] **Double-tap next quickly on T.** Only one advance lands; the second reports a conflict. The index moves by exactly 1.

## 9. Cross-tenant rejection — F

With the foreign-centre account in window **F**:

- [ ] `/dev/live-quiz` → enter the live game code → **join** must fail with "That game code isn't valid." (*not* "already started", "full", or any message that would confirm the code exists).
- [ ] Paste the session id into the URL as `?session=<uuid>` → diagnostics must show a snapshot error, and no roster, leaderboard or question may render.
- [ ] Confirm the failure message is **identical** to the one for a made-up code.

## 10. Completion

- [ ] T advances through the remaining questions to the end.
- [ ] Final **next** puts every window into `completed`.
- [ ] The final leaderboard is identical in all four windows.
- [ ] A student attempting to answer now fails ("That question is closed").
- [ ] T pressing **start** or **next** now fails ("That game has already finished").
- [ ] Re-joining with the finished code fails with the generic invalid-code message.

## 11. No regression to the solo quiz system

- [ ] Open an ordinary (non-live) quiz as a student, answer a question, exit, re-enter → answers still restore and it resumes at the first unanswered question.
- [ ] Open the tutor quiz builder, edit and save a quiz → saves normally.
- [ ] Load `arasaplus.info` and the tenant subdomain → both bootstrap normally.

---

## Recording the run

For each section note **PASS / FAIL / SKIPPED** and, for any failure, the exact
message and the `state revision` shown at the time. Section 5 and section 9 are
release-blocking: a failure in either means the feature must not be enabled.
