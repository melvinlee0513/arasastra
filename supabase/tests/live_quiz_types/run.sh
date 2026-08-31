#!/usr/bin/env bash
#
# Live multiplayer × expanded question types.
#
# This is the only suite that applies BOTH migration families to one database,
# in production filename order:
#
#   20260830 live quiz sessions
#   20260831 live quiz phase 2 (answer-key revoke, kick, expiry)
#   20260901 quiz analytics
#   20260902 question bank
#   20260903 expanded question types  (_quiz_answer_is_correct)
#   20260904 live quiz × all types    (the one under test)
#   20260905 answer-key least privilege, and solo results carrying them
#
# Running them in order is itself an assertion: 20260904 depends on a function
# 20260903 creates and on a table 20260830 creates, and a deployment that
# applied them in any other order would fail here first.
#
#   ./run.sh
#   PGPORT=54329 ./run.sh
#
# Exits non-zero if any assertion fails.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIG="$HERE/../../migrations"

PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-54329}"
PGUSER="${PGUSER:-postgres}"
DB="${DB:-live_types_qa}"

psql() { command psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" "$@"; }

echo "→ recreating $DB"
psql -q -c "DROP DATABASE IF EXISTS $DB;" -c "CREATE DATABASE $DB;" >/dev/null

echo "→ fixture (shared with quiz_phase345)"
psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$HERE/../quiz_phase345/00_fixture.sql" 2>&1 | grep -vi notice || true
psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$HERE/00_prereq.sql" 2>&1 | grep -viE 'notice|wal_level|HINT' || true

for m in 20260830000000_live_quiz_sessions \
         20260831000000_live_quiz_phase2 \
         20260901000000_quiz_analytics \
         20260902000000_question_bank \
         20260903000000_question_types \
         20260904000000_live_quiz_all_types \
         20260905000000_answer_key_least_privilege \
         20260905000100_quiz_result_answer_keys \
         20260906000000_widen_question_type_constraint \
         20260906000100_feature_flag_enforcement; do
  echo "→ migration $m"
  psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$MIG/$m.sql" 2>&1 | grep -viE 'notice|wal_level|HINT' || true
done

echo "→ seed"
psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$HERE/01_seed.sql" 2>&1 | grep -vi notice || true

echo "→ qa"
for f in "$HERE"/0[2-9]_*.sql; do [ -f "$f" ] && psql -d "$DB" -q -f "$f" >/dev/null; done

echo
psql -d "$DB" -tAF'  ' -c "select case when ok then 'PASS' else 'FAIL' end, label from qa.results order by n;"
echo
psql -d "$DB" -tAc "select count(*) filter (where ok) || '/' || count(*) || ' passed' from qa.results;"

FAILED=$(psql -d "$DB" -tAc "select count(*) from qa.results where not ok;")
if [ "$FAILED" != "0" ]; then
  echo; echo "FAILURES:"
  psql -d "$DB" -tAF' | ' -c "select label, detail from qa.results where not ok order by n;"
  exit 1
fi
