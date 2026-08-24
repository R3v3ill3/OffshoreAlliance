-- ============================================================================
-- ROV Industry Fighting Fund — money math
-- Migration 2 of 2. Depends on 20260824100000_rov_fighting_fund_ledger.sql.
--
-- This migration is deliberately kept separate so the apportionment logic
-- (surplus split, recovery cap, balance netting) can be reviewed in isolation.
-- ============================================================================
-- Shared netting rule (used identically everywhere):
--     effective total = SUM(amount_cents) FILTER (active, original)
--                     - SUM(amount_cents) FILTER (active, reversal)
-- where "original" = reverses_id IS NULL, "reversal" = reverses_id IS NOT NULL,
-- and "active" = status IN ('pending','cleared') for money that is confirmed
-- (balance/surplus use 'cleared' only; the recovery cap uses pending+cleared so
-- it cannot be gamed by stacking pending rows — see fn_ff_recovery_cap).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Reversal integrity guard (generic, shared by all four append-only tables).
-- Ensures a reversal row:
--   * targets an existing ORIGINAL row (you cannot reverse a reversal),
--   * belongs to the same owner (participant / payment / campaign), and
--   * does not, cumulatively, reverse MORE than the original amount.
-- Args: (pk_column, owner_column, has_status '1'/'0').
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_ff_reversal_guard() RETURNS trigger AS $$
DECLARE
    v_pk_col     TEXT := TG_ARGV[0];
    v_owner_col  TEXT := TG_ARGV[1];
    v_has_status BOOLEAN := TG_ARGV[2] = '1';
    v_orig_owner TEXT;
    v_orig_rev   BIGINT;
    v_orig_amt   BIGINT;
    v_new_owner  TEXT;
    v_new_pk     BIGINT;
    v_prior      BIGINT;
    v_new_amt    BIGINT;
BEGIN
    IF NEW.reverses_id IS NULL THEN
        RETURN NEW;
    END IF;

    EXECUTE format('SELECT %I::text, reverses_id, amount_cents FROM %I WHERE %I = $1',
                   v_owner_col, TG_TABLE_NAME, v_pk_col)
        INTO v_orig_owner, v_orig_rev, v_orig_amt
        USING NEW.reverses_id;

    IF v_orig_amt IS NULL THEN
        RAISE EXCEPTION '% reversal target % does not exist', TG_TABLE_NAME, NEW.reverses_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_orig_rev IS NOT NULL THEN
        RAISE EXCEPTION '% row % is itself a reversal and cannot be reversed', TG_TABLE_NAME, NEW.reverses_id
            USING ERRCODE = 'check_violation';
    END IF;

    v_new_owner := to_jsonb(NEW) ->> v_owner_col;
    IF v_new_owner IS DISTINCT FROM v_orig_owner THEN
        RAISE EXCEPTION '% reversal must belong to the same %s (got %, original %)',
            TG_TABLE_NAME, v_owner_col, v_new_owner, v_orig_owner
            USING ERRCODE = 'check_violation';
    END IF;

    v_new_pk := (to_jsonb(NEW) ->> v_pk_col)::bigint;

    IF v_has_status THEN
        EXECUTE format('SELECT COALESCE(SUM(amount_cents),0) FROM %I WHERE reverses_id = $1 '
                       'AND status IN (''pending'',''cleared'') AND %I <> $2',
                       TG_TABLE_NAME, v_pk_col)
            INTO v_prior USING NEW.reverses_id, COALESCE(v_new_pk, -1);
    ELSE
        EXECUTE format('SELECT COALESCE(SUM(amount_cents),0) FROM %I WHERE reverses_id = $1 AND %I <> $2',
                       TG_TABLE_NAME, v_pk_col)
            INTO v_prior USING NEW.reverses_id, COALESCE(v_new_pk, -1);
    END IF;

    v_new_amt := NEW.amount_cents;
    IF v_has_status AND (to_jsonb(NEW) ->> 'status') NOT IN ('pending','cleared') THEN
        v_new_amt := 0;
    END IF;

    IF v_prior + v_new_amt > v_orig_amt THEN
        RAISE EXCEPTION 'reversal(s) of % row % total % which exceeds the original amount %',
            TG_TABLE_NAME, NEW.reverses_id, v_prior + v_new_amt, v_orig_amt
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ff_contribution_reversal_guard
    BEFORE INSERT OR UPDATE ON ff_contribution
    FOR EACH ROW EXECUTE FUNCTION fn_ff_reversal_guard('contribution_id','participant_id','1');
CREATE TRIGGER ff_support_payment_reversal_guard
    BEFORE INSERT OR UPDATE ON ff_support_payment
    FOR EACH ROW EXECUTE FUNCTION fn_ff_reversal_guard('payment_id','participant_id','1');
CREATE TRIGGER ff_recovery_reversal_guard
    BEFORE INSERT OR UPDATE ON ff_recovery
    FOR EACH ROW EXECUTE FUNCTION fn_ff_reversal_guard('recovery_id','payment_id','1');
CREATE TRIGGER ff_expense_reversal_guard
    BEFORE INSERT OR UPDATE ON ff_expense
    FOR EACH ROW EXECUTE FUNCTION fn_ff_reversal_guard('expense_id','campaign_id','0');

-- ----------------------------------------------------------------------------
-- Recovery cap (s13) — the load-bearing money rule for double-recovery.
-- A recovery (and the cumulative recoveries) posted against a support payment
-- must never exceed the support actually provided for that loss: the lesser of
-- support received or amount recovered. We enforce the "support received" cap
-- here; "amount recovered" is the amount the caller records on the recovery.
--
-- Counts pending+cleared active recoveries (originals minus recovery-reversals)
-- so the cap cannot be bypassed by inserting many 'pending' rows and clearing
-- them later. Cap = original payment amount net of any payment reversals.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_ff_recovery_cap() RETURNS trigger AS $$
DECLARE
    v_pay_amt     BIGINT;
    v_pay_rev     BIGINT;
    v_net_support BIGINT;
    v_booked      BIGINT;
    v_new         BIGINT;
BEGIN
    -- Reversal rows only reduce the booked total; they are bounded by the
    -- reversal guard, so they never breach the cap.
    IF NEW.reverses_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    SELECT amount_cents, reverses_id INTO v_pay_amt, v_pay_rev
      FROM ff_support_payment WHERE payment_id = NEW.payment_id;

    IF v_pay_amt IS NULL THEN
        RAISE EXCEPTION 'support payment % not found', NEW.payment_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_pay_rev IS NOT NULL THEN
        RAISE EXCEPTION 'recovery must reference an original support payment, not reversal row %', NEW.payment_id
            USING ERRCODE = 'check_violation';
    END IF;

    v_net_support := v_pay_amt - COALESCE((
        SELECT SUM(amount_cents) FROM ff_support_payment
         WHERE reverses_id = NEW.payment_id AND status IN ('pending','cleared')), 0);

    v_booked := COALESCE((
        SELECT SUM(CASE WHEN reverses_id IS NULL THEN amount_cents ELSE -amount_cents END)
          FROM ff_recovery
         WHERE payment_id = NEW.payment_id
           AND status IN ('pending','cleared')
           AND recovery_id <> NEW.recovery_id), 0);

    v_new := CASE WHEN NEW.status IN ('pending','cleared') THEN NEW.amount_cents ELSE 0 END;

    IF v_booked + v_new > v_net_support THEN
        RAISE EXCEPTION
            'recovery cap exceeded for support payment %: support provided %c, already booked %c, attempted +%c (max remaining %c)',
            NEW.payment_id, v_net_support, v_booked, v_new, v_net_support - v_booked
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ff_recovery_cap_guard
    BEFORE INSERT OR UPDATE ON ff_recovery
    FOR EACH ROW EXECUTE FUNCTION fn_ff_recovery_cap();

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Per-member cleared contribution total (the load-bearing number for s17).
-- Only 'cleared' rows count; a cleared reversal subtracts its amount.
CREATE VIEW v_member_contribution_total AS
SELECT  p.campaign_id,
        p.participant_id,
        p.member_id,
        (COALESCE(SUM(c.amount_cents) FILTER (WHERE c.status = 'cleared' AND c.reverses_id IS NULL), 0)
       - COALESCE(SUM(c.amount_cents) FILTER (WHERE c.status = 'cleared' AND c.reverses_id IS NOT NULL), 0)
        )::bigint AS contributed_cents
FROM        ff_participant p
LEFT JOIN   ff_contribution c ON c.participant_id = p.participant_id
GROUP BY    p.campaign_id, p.participant_id, p.member_id;

-- Fund balance (s12, s18): opening + contributions in + recoveries in
--                          − support paid out − expenses.  All cents, all netted.
-- NB: each SUM(...) FILTER is individually COALESCEd to 0. Writing
-- "SUM(a) - SUM(b)" would yield NULL whenever there are no reversal rows
-- (x - NULL = NULL), silently zeroing the whole term.
CREATE VIEW v_fund_balance AS
SELECT
    cam.campaign_id,
    (cam.opening_balance_cents
  + (SELECT COALESCE(SUM(c.amount_cents) FILTER (WHERE c.status='cleared' AND c.reverses_id IS NULL), 0)
          - COALESCE(SUM(c.amount_cents) FILTER (WHERE c.status='cleared' AND c.reverses_id IS NOT NULL), 0)
      FROM ff_contribution c JOIN ff_participant p ON p.participant_id = c.participant_id
     WHERE p.campaign_id = cam.campaign_id)
  + (SELECT COALESCE(SUM(r.amount_cents) FILTER (WHERE r.status='cleared' AND r.reverses_id IS NULL), 0)
          - COALESCE(SUM(r.amount_cents) FILTER (WHERE r.status='cleared' AND r.reverses_id IS NOT NULL), 0)
      FROM ff_recovery r
      JOIN ff_support_payment sp ON sp.payment_id = r.payment_id
      JOIN ff_participant p ON p.participant_id = sp.participant_id
     WHERE p.campaign_id = cam.campaign_id)
  - (SELECT COALESCE(SUM(sp.amount_cents) FILTER (WHERE sp.status='cleared' AND sp.reverses_id IS NULL), 0)
          - COALESCE(SUM(sp.amount_cents) FILTER (WHERE sp.status='cleared' AND sp.reverses_id IS NOT NULL), 0)
      FROM ff_support_payment sp JOIN ff_participant p ON p.participant_id = sp.participant_id
     WHERE p.campaign_id = cam.campaign_id)
  - (SELECT COALESCE(SUM(e.amount_cents) FILTER (WHERE e.reverses_id IS NULL), 0)
          - COALESCE(SUM(e.amount_cents) FILTER (WHERE e.reverses_id IS NOT NULL), 0)
      FROM ff_expense e
     WHERE e.campaign_id = cam.campaign_id)
    )::bigint AS balance_cents
FROM ff_campaign cam;

-- Financial report line (s18): opening, contributions, participant count, support
-- paid, recovered, expenses, closing balance — one row per campaign.
CREATE VIEW v_fund_report AS
SELECT
    cam.campaign_id,
    cam.name,
    cam.opening_balance_cents,
    (SELECT COALESCE(SUM(c.amount_cents) FILTER (WHERE c.status='cleared' AND c.reverses_id IS NULL), 0)
          - COALESCE(SUM(c.amount_cents) FILTER (WHERE c.status='cleared' AND c.reverses_id IS NOT NULL), 0)
      FROM ff_contribution c JOIN ff_participant p ON p.participant_id = c.participant_id
     WHERE p.campaign_id = cam.campaign_id)::bigint AS contributions_cleared_cents,
    (SELECT COUNT(*) FROM ff_participant p WHERE p.campaign_id = cam.campaign_id) AS participant_count,
    (SELECT COALESCE(SUM(sp.amount_cents) FILTER (WHERE sp.status='cleared' AND sp.reverses_id IS NULL), 0)
          - COALESCE(SUM(sp.amount_cents) FILTER (WHERE sp.status='cleared' AND sp.reverses_id IS NOT NULL), 0)
      FROM ff_support_payment sp JOIN ff_participant p ON p.participant_id = sp.participant_id
     WHERE p.campaign_id = cam.campaign_id)::bigint AS support_paid_cents,
    (SELECT COALESCE(SUM(r.amount_cents) FILTER (WHERE r.status='cleared' AND r.reverses_id IS NULL), 0)
          - COALESCE(SUM(r.amount_cents) FILTER (WHERE r.status='cleared' AND r.reverses_id IS NOT NULL), 0)
      FROM ff_recovery r
      JOIN ff_support_payment sp ON sp.payment_id = r.payment_id
      JOIN ff_participant p ON p.participant_id = sp.participant_id
     WHERE p.campaign_id = cam.campaign_id)::bigint AS recovered_cents,
    (SELECT COALESCE(SUM(e.amount_cents) FILTER (WHERE e.reverses_id IS NULL), 0)
          - COALESCE(SUM(e.amount_cents) FILTER (WHERE e.reverses_id IS NOT NULL), 0)
      FROM ff_expense e WHERE e.campaign_id = cam.campaign_id)::bigint AS expenses_cents,
    (SELECT balance_cents FROM v_fund_balance b WHERE b.campaign_id = cam.campaign_id) AS closing_balance_cents
FROM ff_campaign cam;

-- ----------------------------------------------------------------------------
-- Surplus distribution (s17): pro-rata by cleared contribution, in integer
-- cents, with the rounding remainder allocated by the largest-remainder
-- (Hamilton) method so the shares sum EXACTLY to the distributable surplus.
--
-- Surplus defaults to the current fund balance, but may be overridden by
-- p_surplus_cents when finalising (s16/s17) — e.g. to hold back a reserve.
-- Deterministic tie-break: remainder DESC, contribution DESC, participant_id ASC.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_surplus_distribution(
    p_campaign_id   BIGINT,
    p_surplus_cents BIGINT DEFAULT NULL
)
RETURNS TABLE (participant_id BIGINT, member_id INT,
               contributed_cents BIGINT, share_cents BIGINT) AS $$
DECLARE
    v_surplus BIGINT;
    v_total   BIGINT;
BEGIN
    IF p_surplus_cents IS NULL THEN
        SELECT balance_cents INTO v_surplus FROM v_fund_balance WHERE campaign_id = p_campaign_id;
    ELSE
        v_surplus := p_surplus_cents;
    END IF;
    IF v_surplus IS NULL OR v_surplus <= 0 THEN
        RETURN;
    END IF;

    SELECT SUM(t.contributed_cents) INTO v_total
      FROM v_member_contribution_total t
     WHERE t.campaign_id = p_campaign_id AND t.contributed_cents > 0;
    IF v_total IS NULL OR v_total = 0 THEN
        RETURN;
    END IF;

    RETURN QUERY
    WITH base AS (
        SELECT t.participant_id, t.member_id, t.contributed_cents,
               -- exact real share as a high-precision numeric (never money)
               (t.contributed_cents::numeric * v_surplus) / v_total AS exact_share
        FROM v_member_contribution_total t
        WHERE t.campaign_id = p_campaign_id AND t.contributed_cents > 0
    ),
    floored AS (
        SELECT b.*,
               FLOOR(b.exact_share)::bigint            AS floor_share,
               b.exact_share - FLOOR(b.exact_share)    AS remainder
        FROM base b
    ),
    ranked AS (
        SELECT f.*,
               SUM(f.floor_share) OVER ()              AS sum_floor,
               ROW_NUMBER() OVER (ORDER BY f.remainder DESC,
                                           f.contributed_cents DESC,
                                           f.participant_id ASC) AS rn
        FROM floored f
    )
    SELECT r.participant_id,
           r.member_id,
           r.contributed_cents::bigint,
           (r.floor_share + CASE WHEN r.rn <= (v_surplus - r.sum_floor) THEN 1 ELSE 0 END)::bigint
    FROM ranked r
    ORDER BY r.participant_id;
END;
$$ LANGUAGE plpgsql STABLE;

COMMIT;
