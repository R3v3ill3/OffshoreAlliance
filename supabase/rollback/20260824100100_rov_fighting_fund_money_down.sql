-- ============================================================================
-- DOWN migration for 20260824100100_rov_fighting_fund_money.sql
-- Reverses the money-math layer only (leaves the tables from migration 1).
-- Kept OUTSIDE supabase/migrations/ so `supabase db push` never auto-applies it.
-- Apply manually: psql "$DATABASE_URL" -f supabase/rollback/20260824100100_rov_fighting_fund_money_down.sql
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS fn_surplus_distribution(BIGINT, BIGINT);

DROP VIEW IF EXISTS v_fund_report;
DROP VIEW IF EXISTS v_fund_balance;
DROP VIEW IF EXISTS v_member_contribution_total;

DROP TRIGGER IF EXISTS ff_recovery_cap_guard        ON ff_recovery;
DROP TRIGGER IF EXISTS ff_expense_reversal_guard    ON ff_expense;
DROP TRIGGER IF EXISTS ff_recovery_reversal_guard   ON ff_recovery;
DROP TRIGGER IF EXISTS ff_support_payment_reversal_guard ON ff_support_payment;
DROP TRIGGER IF EXISTS ff_contribution_reversal_guard   ON ff_contribution;

DROP FUNCTION IF EXISTS fn_ff_recovery_cap();
DROP FUNCTION IF EXISTS fn_ff_reversal_guard();

COMMIT;
