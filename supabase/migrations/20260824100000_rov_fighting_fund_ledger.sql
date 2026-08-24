-- ============================================================================
-- ROV Industry Fighting Fund — ledger structure & FK wiring
-- Migration 1 of 2 (structure). Money math (views / triggers / surplus
-- function) is in the paired migration 20260824100100_rov_fighting_fund_money.
-- ============================================================================
-- Strategy references: s3 (contributions), s4 (support), s9 (qualifying period /
-- foundation), s13-15 (recovery + undertaking), s17 (surplus), s18 (reporting),
-- s19 (expenses).
--
-- Design principles enforced here:
--   * All money is BIGINT cents. No floats / numeric-money anywhere. The only
--     NUMERIC column is `week_fraction`, which is descriptive metadata, never a
--     money value (the money is always the explicit BIGINT `amount_cents`).
--   * FK identity columns that point at the EXISTING Offshore Alliance tables are
--     plain INT, because workers.worker_id and employers.employer_id are SERIAL
--     (INT). The fund's own PKs are BIGINT identity.
--   * Append-only. Nothing is hard-deleted; a correction is a new row whose
--     `reverses_id` points at the row it backs out. A reversal row carries a
--     POSITIVE amount and status 'cleared'; every money total nets it out as
--     (sum of originals) - (sum of reversals). RLS grants no DELETE to anyone.
--   * Real FK wiring: member_id -> workers(worker_id), employer_id ->
--     employers(employer_id). (The draft used unwired BIGINT placeholders.)
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Enum types
-- ----------------------------------------------------------------------------
-- NB: 'reversed' is deliberately NOT a status. A reversal is identified
-- structurally by `reverses_id IS NOT NULL`, and it is itself a 'cleared' row.
-- This keeps a single, unambiguous netting rule shared by every view.
CREATE TYPE fund_txn_status AS ENUM (
    'pending',   -- expected but not yet confirmed (e.g. direct debit scheduled)
    'cleared',   -- money confirmed received / paid
    'failed'     -- attempt failed (card decline, DD reject); never counts
);

CREATE TYPE support_reason AS ENUM (
    'demobilised',
    'stood_down',
    'not_remobilised',
    'lost_rostered_work',
    'other_attributable'
);

-- ----------------------------------------------------------------------------
-- Campaign (s11, s16) — everything is scoped to one campaign.
-- ----------------------------------------------------------------------------
CREATE TABLE ff_campaign (
    campaign_id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name                       TEXT   NOT NULL,
    started_on                 DATE   NOT NULL,
    concluded_on               DATE,                         -- NULL until s16 finalisation
    opening_balance_cents      BIGINT NOT NULL DEFAULT 0 CHECK (opening_balance_cents >= 0),
    weekly_contribution_cents  BIGINT NOT NULL DEFAULT 5000  CHECK (weekly_contribution_cents > 0),   -- $50.00 (s3)
    recommended_support_cents  BIGINT          CHECK (recommended_support_cents IS NULL OR recommended_support_cents >= 0), -- the "$X per week" (s4)
    qualifying_weeks           INT    NOT NULL DEFAULT 0 CHECK (qualifying_weeks >= 0),  -- s9 qualifying period
    notes                      TEXT,
    created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ff_campaign_dates_ck CHECK (concluded_on IS NULL OR concluded_on >= started_on)
);

-- ----------------------------------------------------------------------------
-- Participant (s8, s9) — a member's enrolment in the fund for a campaign.
-- A member is not automatically a contributor; they opt in.
-- ----------------------------------------------------------------------------
CREATE TABLE ff_participant (
    participant_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    campaign_id      BIGINT NOT NULL REFERENCES ff_campaign(campaign_id),
    member_id        INT    NOT NULL REFERENCES workers(worker_id),     -- FK WIRING (was placeholder)
    employer_id      INT             REFERENCES employers(employer_id), -- FK WIRING; employer at enrolment (s2)
    joined_on        DATE   NOT NULL,
    foundation       BOOLEAN NOT NULL DEFAULT FALSE,        -- s9 foundation participant => immediate eligibility
    repayment_undertaking_signed_on DATE,                  -- s14; NULL = not signed
    left_on          DATE,                                  -- stopped contributing (still owed surplus on what they paid)
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (campaign_id, member_id),
    CONSTRAINT ff_participant_left_ck CHECK (left_on IS NULL OR left_on >= joined_on)
);
CREATE INDEX ff_participant_campaign_ix ON ff_participant(campaign_id);
CREATE INDEX ff_participant_member_ix   ON ff_participant(member_id);

-- ----------------------------------------------------------------------------
-- 1. CONTRIBUTIONS (money IN) — s3. One row per member per week.
--    A failed/pending week is still a row. Only 'cleared' rows count toward the
--    surplus entitlement (see money migration). A reversal is a new row with
--    reverses_id set and a positive amount; totals subtract it.
-- ----------------------------------------------------------------------------
CREATE TABLE ff_contribution (
    contribution_id  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    participant_id   BIGINT NOT NULL REFERENCES ff_participant(participant_id),
    week_starting    DATE   NOT NULL,                       -- ISO week anchor (Monday)
    amount_cents     BIGINT NOT NULL CHECK (amount_cents > 0),
    status           fund_txn_status NOT NULL DEFAULT 'pending',
    external_ref     TEXT,
    reverses_id      BIGINT REFERENCES ff_contribution(contribution_id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    cleared_at       TIMESTAMPTZ,
    CONSTRAINT ff_contribution_no_self_reverse_ck CHECK (reverses_id IS NULL OR reverses_id <> contribution_id)
);
CREATE INDEX ff_contribution_participant_ix ON ff_contribution(participant_id);
CREATE INDEX ff_contribution_status_ix      ON ff_contribution(status);
CREATE INDEX ff_contribution_reverses_ix    ON ff_contribution(reverses_id);
-- NB: no hard UNIQUE(participant_id, week_starting). The draft's
-- UNIQUE(participant_id, week_starting, reverses_id) does not constrain
-- originals at all (NULLs are distinct), and a strict unique would forbid the
-- legitimate append-only pattern "reverse the wrong row, then post a corrected
-- one" for the same week. Duplicate-week detection is a committee/app control.

-- ----------------------------------------------------------------------------
-- 2. SUPPORT PAYMENTS (money OUT) — s4, s5, s7. Paid to an eligible member for
--    verified loss. Partial weeks via week_fraction (metadata) but the money is
--    always the explicit amount_cents.
-- ----------------------------------------------------------------------------
CREATE TABLE ff_support_payment (
    payment_id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    participant_id   BIGINT NOT NULL REFERENCES ff_participant(participant_id),
    week_starting    DATE   NOT NULL,
    week_fraction    NUMERIC(4,3) NOT NULL DEFAULT 1.000     -- 1.000 = full week; 0.400 = pro-rata (s4)
                        CHECK (week_fraction > 0 AND week_fraction <= 1),
    amount_cents     BIGINT NOT NULL CHECK (amount_cents > 0),
    reason           support_reason NOT NULL,
    status           fund_txn_status NOT NULL DEFAULT 'pending',
    approved_by      TEXT,                                   -- s7 authorisation
    second_approver  TEXT,                                   -- s7: no unilateral authority
    reverses_id      BIGINT REFERENCES ff_support_payment(payment_id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    paid_at          TIMESTAMPTZ,
    notes            TEXT,
    CONSTRAINT ff_support_payment_no_self_reverse_ck CHECK (reverses_id IS NULL OR reverses_id <> payment_id)
);
CREATE INDEX ff_support_payment_participant_ix ON ff_support_payment(participant_id);
CREATE INDEX ff_support_payment_reverses_ix    ON ff_support_payment(reverses_id);

-- ----------------------------------------------------------------------------
-- 3. RECOVERIES (money BACK IN) — s13, s14, s15. A later settlement/backpay
--    repays the fund, capped at the lesser of support received for that loss or
--    the amount recovered (s13). Posted against the specific support payment it
--    repays. The cap is enforced by trigger in the money migration.
-- ----------------------------------------------------------------------------
CREATE TABLE ff_recovery (
    recovery_id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    payment_id       BIGINT NOT NULL REFERENCES ff_support_payment(payment_id),
    amount_cents     BIGINT NOT NULL CHECK (amount_cents > 0),
    status           fund_txn_status NOT NULL DEFAULT 'pending',
    external_ref     TEXT,                                   -- settlement reference
    reverses_id      BIGINT REFERENCES ff_recovery(recovery_id),  -- append-only correction of a recovery
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    cleared_at       TIMESTAMPTZ,
    notes            TEXT,
    CONSTRAINT ff_recovery_no_self_reverse_ck CHECK (reverses_id IS NULL OR reverses_id <> recovery_id)
);
CREATE INDEX ff_recovery_payment_ix  ON ff_recovery(payment_id);
CREATE INDEX ff_recovery_reverses_ix ON ff_recovery(reverses_id);

-- ----------------------------------------------------------------------------
-- Expenses (s19) — admin / banking / legal, so the fund balance is honest.
-- Reversible (append-only) like the ledgers.
-- ----------------------------------------------------------------------------
CREATE TABLE ff_expense (
    expense_id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    campaign_id      BIGINT NOT NULL REFERENCES ff_campaign(campaign_id),
    amount_cents     BIGINT NOT NULL CHECK (amount_cents > 0),
    category         TEXT   NOT NULL CHECK (category IN ('banking','legal','accounting','admin','other')),
    incurred_on      DATE   NOT NULL,
    authorised_by    TEXT,
    reverses_id      BIGINT REFERENCES ff_expense(expense_id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    notes            TEXT,
    CONSTRAINT ff_expense_no_self_reverse_ck CHECK (reverses_id IS NULL OR reverses_id <> expense_id)
);
CREATE INDEX ff_expense_campaign_ix ON ff_expense(campaign_id);
CREATE INDEX ff_expense_reverses_ix ON ff_expense(reverses_id);

-- ----------------------------------------------------------------------------
-- Row Level Security — consistent with the rest of the schema (0002), tightened
-- for money data:
--   * RLS enabled on every fund table.
--   * SELECT limited to admin/user roles (s18 keeps recipient identity
--     confidential; not world-readable to every authenticated user).
--   * INSERT/UPDATE limited to admin/user (corrections happen via UPDATE of
--     status and via reversal INSERTs).
--   * NO DELETE policy on any table => deletes are denied for all API roles,
--     enforcing append-only at the security layer. (The service role bypasses
--     RLS for server-side administration.)
-- get_user_role() is defined in 0002_rls_policies.sql.
-- ----------------------------------------------------------------------------
ALTER TABLE ff_campaign        ENABLE ROW LEVEL SECURITY;
ALTER TABLE ff_participant     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ff_contribution    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ff_support_payment ENABLE ROW LEVEL SECURITY;
ALTER TABLE ff_recovery        ENABLE ROW LEVEL SECURITY;
ALTER TABLE ff_expense         ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'ff_campaign','ff_participant','ff_contribution',
        'ff_support_payment','ff_recovery','ff_expense'
    ] LOOP
        EXECUTE format(
            'CREATE POLICY "Admin/User can read %1$s" ON %1$s FOR SELECT TO authenticated USING (get_user_role() IN (''admin'',''user''))', t);
        EXECUTE format(
            'CREATE POLICY "Admin/User can insert %1$s" ON %1$s FOR INSERT TO authenticated WITH CHECK (get_user_role() IN (''admin'',''user''))', t);
        EXECUTE format(
            'CREATE POLICY "Admin/User can update %1$s" ON %1$s FOR UPDATE TO authenticated USING (get_user_role() IN (''admin'',''user'')) WITH CHECK (get_user_role() IN (''admin'',''user''))', t);
        -- Intentionally no DELETE policy: append-only.
    END LOOP;
END $$;

COMMIT;
