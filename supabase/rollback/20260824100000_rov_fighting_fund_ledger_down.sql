-- ============================================================================
-- DOWN migration for 20260824100000_rov_fighting_fund_ledger.sql
-- Drops the fund tables and enum types. Run the money-math down-migration FIRST
-- (20260824100100_..._down.sql), otherwise the dependent views/triggers block
-- these DROPs.
-- Kept OUTSIDE supabase/migrations/ so `supabase db push` never auto-applies it.
-- Apply manually: psql "$DATABASE_URL" -f supabase/rollback/20260824100000_rov_fighting_fund_ledger_down.sql
-- ============================================================================

BEGIN;

-- Tables (child-before-parent order). RLS policies drop with their tables.
DROP TABLE IF EXISTS ff_expense;
DROP TABLE IF EXISTS ff_recovery;
DROP TABLE IF EXISTS ff_support_payment;
DROP TABLE IF EXISTS ff_contribution;
DROP TABLE IF EXISTS ff_participant;
DROP TABLE IF EXISTS ff_campaign;

DROP TYPE IF EXISTS support_reason;
DROP TYPE IF EXISTS fund_txn_status;

COMMIT;
