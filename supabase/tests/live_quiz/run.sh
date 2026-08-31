#!/usr/bin/env bash
#
# Live multiplayer quiz — backend QA against a throwaway Postgres.
#
# Exercises the real migration under real RLS with real cross-tenant users:
# session lifecycle, answer redaction, server-side scoring, idempotency,
# reconnect, completion, and every cross-tenant / direct-RPC abuse case.
#
# These tests do NOT need Supabase. `00_fixture.sql` stands up just enough of
# the canonical schema (auth.uid(), tuition_centers, classes, quizzes,
# can_manage_class, is_enrolled_in_class, the supabase_realtime publication)
# for the migration to run.
#
#   ./run.sh                      # uses a local cluster on $PGPORT
#   PGPORT=54329 ./run.sh
#
# Exits non-zero if any assertion fails.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATION="$HERE/../../migrations/20260830000000_live_quiz_sessions.sql"
MIGRATION2="$HERE/../../migrations/20260831000000_live_quiz_phase2.sql"
# 20260905 undoes the column-level grant 20260831 made and returns both
# answer-key tables to no privilege at all. Applying it here is what makes the
# S-block assertions describe production rather than the harness.
MIGRATION3="$HERE/../../migrations/20260905000000_answer_key_least_privilege.sql"

PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-54329}"
PGUSER="${PGUSER:-postgres}"
DB="${DB:-live_quiz_qa}"

psql() { command psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" "$@"; }

echo "→ recreating $DB"
psql -q -c "DROP DATABASE IF EXISTS $DB;" -c "CREATE DATABASE $DB;" >/dev/null

echo "→ fixture"
psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$HERE/00_fixture.sql" 2>&1 | grep -viE 'wal_level|HINT' || true

echo "→ migration"
psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$MIGRATION" 2>&1 | grep -vi notice || true

echo "→ migration (phase 2)"
psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$MIGRATION2" 2>&1 | grep -vi notice || true

echo "→ migration (answer-key least privilege)"
psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$MIGRATION3" 2>&1 | grep -vi notice || true

echo "→ seed"
psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$HERE/01_seed.sql" 2>&1 | grep -vi notice || true

echo "→ qa"
psql -d "$DB" -q -f "$HERE/02_qa.sql" >/dev/null
psql -d "$DB" -q -f "$HERE/03_qa2.sql" >/dev/null
psql -d "$DB" -q -f "$HERE/04_qa_phase2.sql" >/dev/null

# The 30-player simulation is opt-in: it is the slow one, and it seeds 30 extra
# users into the database it runs against.
if [ "${LOAD:-0}" = "1" ]; then
  echo "→ 30-player load"
  psql -d "$DB" -q -f "$HERE/05_load_30.sql" >/dev/null
fi

echo
psql -d "$DB" -tAF'  ' -c \
  "select case when ok then 'PASS' else 'FAIL' end, label from qa.results order by n;"
echo
psql -d "$DB" -tAc \
  "select count(*) filter (where ok) || '/' || count(*) || ' passed' from qa.results;"

if [ "${LOAD:-0}" = "1" ]; then
  echo
  psql -d "$DB" -tAF'  ' -c \
    "select case when ok then 'PASS' else 'FAIL' end, label, detail from qa.load_results order by n;"
fi

FAILED=$(psql -d "$DB" -tAc "select count(*) from qa.results where not ok;")
if [ "$FAILED" != "0" ]; then
  echo
  echo "FAILURES:"
  psql -d "$DB" -tAF' | ' -c "select label, detail from qa.results where not ok order by n;"
  exit 1
fi
