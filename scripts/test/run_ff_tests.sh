#!/usr/bin/env bash
# ============================================================================
# Run the ROV Fighting Fund migrations + test suite against a THROWAWAY database.
# Never point this at a real/production database. It DROPs and recreates the DB.
#
# Usage:
#   scripts/test/run_ff_tests.sh                # uses a local scratch DB
#   PGDATABASE=ff_scratch scripts/test/run_ff_tests.sh
# ============================================================================
set -euo pipefail

DB="${FF_SCRATCH_DB:-ff_scratch}"
PSQL_SUPER=(psql -v ON_ERROR_STOP=1 -X -q)

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIG="$ROOT/supabase/migrations"

echo ">> Recreating throwaway database: $DB"
"${PSQL_SUPER[@]}" -d postgres -c "DROP DATABASE IF EXISTS $DB;"
"${PSQL_SUPER[@]}" -d postgres -c "CREATE DATABASE $DB;"

echo ">> Applying prerequisites (scratch stand-ins for workers/employers/get_user_role)"
"${PSQL_SUPER[@]}" -d "$DB" -f "$ROOT/scripts/test/ff_prereqs.sql"

echo ">> Applying migration 1 (ledger structure + FK wiring)"
"${PSQL_SUPER[@]}" -d "$DB" -f "$MIG/20260824100000_rov_fighting_fund_ledger.sql"

echo ">> Applying migration 2 (money math)"
"${PSQL_SUPER[@]}" -d "$DB" -f "$MIG/20260824100100_rov_fighting_fund_money.sql"

echo ">> Running test suite"
"${PSQL_SUPER[@]}" -d "$DB" -f "$ROOT/supabase/tests/rov_fighting_fund_test.sql"

echo ">> Verifying down-migrations round-trip (money down, then ledger down)"
"${PSQL_SUPER[@]}" -d "$DB" -f "$ROOT/supabase/rollback/20260824100100_rov_fighting_fund_money_down.sql"
"${PSQL_SUPER[@]}" -d "$DB" -f "$ROOT/supabase/rollback/20260824100000_rov_fighting_fund_ledger_down.sql"
REMAIN=$("${PSQL_SUPER[@]}" -d "$DB" -tAc \
  "SELECT count(*) FROM information_schema.tables WHERE table_name LIKE 'ff\_%';")
if [ "$REMAIN" != "0" ]; then
  echo "!! Down-migration left $REMAIN ff_ tables behind"; exit 1
fi
echo ">> Down-migrations clean (no ff_ tables remain)"
echo "OK"
