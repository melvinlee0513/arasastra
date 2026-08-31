#!/usr/bin/env bash
# Phase 3-5 quiz backend QA against a throwaway Postgres.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIG="$HERE/../../migrations"
PGHOST="${PGHOST:-127.0.0.1}"; PGPORT="${PGPORT:-54329}"
PGUSER="${PGUSER:-postgres}"; DB="${DB:-quiz345_qa}"
psql() { command psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" "$@"; }

echo "→ recreating $DB"
psql -q -c "DROP DATABASE IF EXISTS $DB;" -c "CREATE DATABASE $DB;" >/dev/null
echo "→ fixture"
psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$HERE/00_fixture.sql" 2>&1 | grep -vi notice || true
for m in 20260901000000_quiz_analytics 20260902000000_question_bank 20260903000000_question_types; do
  if [ -f "$MIG/$m.sql" ]; then
    echo "→ migration $m"
    psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$MIG/$m.sql" 2>&1 | grep -vi notice || true
  fi
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
