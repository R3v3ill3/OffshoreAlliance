-- ============================================================================
-- ROV Industry Fighting Fund — test suite
-- Run against a THROWAWAY database only (see scripts/test/run_ff_tests.sh).
-- Requires: ff_prereqs.sql + both fund migrations applied first.
-- Any failed ASSERT aborts psql (ON_ERROR_STOP) with a non-zero exit.
-- ============================================================================
\set ON_ERROR_STOP on
SET client_min_messages TO notice;

-- ----------------------------------------------------------------------------
-- TEST E: a reversal row correctly nets a contribution back out.
-- ----------------------------------------------------------------------------
DO $$
DECLARE v_cid BIGINT; v_pid BIGINT; v_c1 BIGINT; v_total BIGINT; v_bal BIGINT;
BEGIN
    INSERT INTO ff_campaign(name, started_on) VALUES ('E: reversal', DATE '2026-01-05')
        RETURNING campaign_id INTO v_cid;
    INSERT INTO ff_participant(campaign_id, member_id, joined_on) VALUES (v_cid, 1, DATE '2026-01-05')
        RETURNING participant_id INTO v_pid;

    INSERT INTO ff_contribution(participant_id, week_starting, amount_cents, status, cleared_at)
        VALUES (v_pid, DATE '2026-01-05', 5000, 'cleared', now()) RETURNING contribution_id INTO v_c1;

    SELECT contributed_cents INTO v_total FROM v_member_contribution_total WHERE participant_id = v_pid;
    ASSERT v_total = 5000, format('E1: expected 5000, got %s', v_total);

    -- reversal: new cleared row pointing at the original
    INSERT INTO ff_contribution(participant_id, week_starting, amount_cents, status, cleared_at, reverses_id)
        VALUES (v_pid, DATE '2026-01-05', 5000, 'cleared', now(), v_c1);

    SELECT contributed_cents INTO v_total FROM v_member_contribution_total WHERE participant_id = v_pid;
    ASSERT v_total = 0, format('E2: expected 0 after reversal, got %s', v_total);

    SELECT balance_cents INTO v_bal FROM v_fund_balance WHERE campaign_id = v_cid;
    ASSERT v_bal = 0, format('E3: expected fund balance 0, got %s', v_bal);

    RAISE NOTICE 'PASS E: reversal nets a contribution back out';
END $$;

-- ----------------------------------------------------------------------------
-- TEST D: v_fund_balance = opening + contributions cleared + recoveries cleared
--         − support cleared − expenses. Pending/failed rows must NOT count.
-- ----------------------------------------------------------------------------
DO $$
DECLARE v_cid BIGINT; v_pid BIGINT; v_pay BIGINT; v_exp2 BIGINT; v_bal BIGINT; r RECORD;
BEGIN
    INSERT INTO ff_campaign(name, started_on, opening_balance_cents)
        VALUES ('D: balance', DATE '2026-01-05', 100000) RETURNING campaign_id INTO v_cid;
    INSERT INTO ff_participant(campaign_id, member_id, joined_on) VALUES (v_cid, 1, DATE '2026-01-05')
        RETURNING participant_id INTO v_pid;

    -- contributions: 4 x 5000 cleared = 20000 ; plus one pending and one failed (ignored)
    INSERT INTO ff_contribution(participant_id, week_starting, amount_cents, status, cleared_at) VALUES
        (v_pid, DATE '2026-01-05', 5000, 'cleared', now()),
        (v_pid, DATE '2026-01-12', 5000, 'cleared', now()),
        (v_pid, DATE '2026-01-19', 5000, 'cleared', now()),
        (v_pid, DATE '2026-01-26', 5000, 'cleared', now()),
        (v_pid, DATE '2026-02-02', 5000, 'pending', NULL),
        (v_pid, DATE '2026-02-09', 5000, 'failed',  NULL);

    -- support: 12000 cleared ; plus a 3000 pending (ignored)
    INSERT INTO ff_support_payment(participant_id, week_starting, amount_cents, reason, status, paid_at)
        VALUES (v_pid, DATE '2026-01-12', 12000, 'stood_down', 'cleared', now()) RETURNING payment_id INTO v_pay;
    INSERT INTO ff_support_payment(participant_id, week_starting, amount_cents, reason, status)
        VALUES (v_pid, DATE '2026-01-19', 3000, 'stood_down', 'pending');

    -- recovery: 4000 cleared ; plus a 1000 pending (ignored). Both within the 12000 cap.
    INSERT INTO ff_recovery(payment_id, amount_cents, status, cleared_at) VALUES (v_pay, 4000, 'cleared', now());
    INSERT INTO ff_recovery(payment_id, amount_cents, status) VALUES (v_pay, 1000, 'pending');

    -- expenses: 1500 effective. Add an 800 expense then reverse it (nets to 0).
    INSERT INTO ff_expense(campaign_id, amount_cents, category, incurred_on) VALUES (v_cid, 1500, 'banking', DATE '2026-01-31');
    INSERT INTO ff_expense(campaign_id, amount_cents, category, incurred_on) VALUES (v_cid, 800, 'admin', DATE '2026-01-31')
        RETURNING expense_id INTO v_exp2;
    INSERT INTO ff_expense(campaign_id, amount_cents, category, incurred_on, reverses_id)
        VALUES (v_cid, 800, 'admin', DATE '2026-01-31', v_exp2);

    -- 100000 + 20000 + 4000 - 12000 - 1500 = 110500
    SELECT balance_cents INTO v_bal FROM v_fund_balance WHERE campaign_id = v_cid;
    ASSERT v_bal = 110500, format('D1: expected balance 110500, got %s', v_bal);

    SELECT * INTO r FROM v_fund_report WHERE campaign_id = v_cid;
    ASSERT r.contributions_cleared_cents = 20000, format('D2 contributions: %s', r.contributions_cleared_cents);
    ASSERT r.support_paid_cents          = 12000, format('D3 support: %s', r.support_paid_cents);
    ASSERT r.recovered_cents             = 4000,  format('D4 recovered: %s', r.recovered_cents);
    ASSERT r.expenses_cents              = 1500,  format('D5 expenses: %s', r.expenses_cents);
    ASSERT r.closing_balance_cents       = 110500, format('D6 closing: %s', r.closing_balance_cents);

    RAISE NOTICE 'PASS D: fund balance = contributions + recoveries − support − expenses (pending/failed excluded)';
END $$;

-- ----------------------------------------------------------------------------
-- TEST A: a member with failed/pending weeks contributes less than a member who
--         paid every week, and the surplus split reflects that.
-- ----------------------------------------------------------------------------
DO $$
DECLARE v_cid BIGINT; v_full BIGINT; v_part BIGINT; w INT;
        v_tfull BIGINT; v_tpart BIGINT; v_sfull BIGINT; v_spart BIGINT; v_sum BIGINT;
BEGIN
    INSERT INTO ff_campaign(name, started_on) VALUES ('A: pending reduces', DATE '2026-01-05')
        RETURNING campaign_id INTO v_cid;
    INSERT INTO ff_participant(campaign_id, member_id, joined_on) VALUES (v_cid, 2, DATE '2026-01-05')
        RETURNING participant_id INTO v_full;
    INSERT INTO ff_participant(campaign_id, member_id, joined_on) VALUES (v_cid, 3, DATE '2026-01-05')
        RETURNING participant_id INTO v_part;

    -- full member: 10 cleared weeks @ 5000 = 50000
    FOR w IN 0..9 LOOP
        INSERT INTO ff_contribution(participant_id, week_starting, amount_cents, status, cleared_at)
            VALUES (v_full, DATE '2026-01-05' + (w*7), 5000, 'cleared', now());
    END LOOP;
    -- partial member: 6 cleared, 2 failed, 2 pending => 30000 cleared
    FOR w IN 0..5 LOOP
        INSERT INTO ff_contribution(participant_id, week_starting, amount_cents, status, cleared_at)
            VALUES (v_part, DATE '2026-01-05' + (w*7), 5000, 'cleared', now());
    END LOOP;
    INSERT INTO ff_contribution(participant_id, week_starting, amount_cents, status) VALUES
        (v_part, DATE '2026-02-16', 5000, 'failed'),
        (v_part, DATE '2026-02-23', 5000, 'failed'),
        (v_part, DATE '2026-03-02', 5000, 'pending'),
        (v_part, DATE '2026-03-09', 5000, 'pending');

    SELECT contributed_cents INTO v_tfull FROM v_member_contribution_total WHERE participant_id = v_full;
    SELECT contributed_cents INTO v_tpart FROM v_member_contribution_total WHERE participant_id = v_part;
    ASSERT v_tfull = 50000, format('A1 full total: %s', v_tfull);
    ASSERT v_tpart = 30000, format('A2 partial total (pending/failed excluded): %s', v_tpart);
    ASSERT v_tfull > v_tpart, 'A3: full contributor must exceed partial contributor';

    -- surplus split (balance-derived path): balance = 80000, all distributed
    SELECT share_cents INTO v_sfull FROM fn_surplus_distribution(v_cid) WHERE participant_id = v_full;
    SELECT share_cents INTO v_spart FROM fn_surplus_distribution(v_cid) WHERE participant_id = v_part;
    SELECT SUM(share_cents) INTO v_sum FROM fn_surplus_distribution(v_cid);
    ASSERT v_sfull = 50000, format('A4 full share: %s', v_sfull);
    ASSERT v_spart = 30000, format('A5 partial share: %s', v_spart);
    ASSERT v_sfull > v_spart, 'A6: full contributor gets the larger surplus share';
    ASSERT v_sum = 80000, format('A7 sum of shares = balance: %s', v_sum);

    RAISE NOTICE 'PASS A: pending/failed weeks lower the contribution and the surplus share';
END $$;

-- ----------------------------------------------------------------------------
-- TEST B: surplus split sums EXACTLY to the distributable balance, with awkward
--         numbers — 3 members, $100.01 (10001c) surplus, unequal contributions.
--         No cent lost or invented (largest-remainder / Hamilton).
-- ----------------------------------------------------------------------------
DO $$
DECLARE v_cid BIGINT; p1 BIGINT; p2 BIGINT; p3 BIGINT;
        v_sum BIGINT; v_plus_ones INT; v_bad INT; s1 BIGINT; s2 BIGINT; s3 BIGINT;
BEGIN
    INSERT INTO ff_campaign(name, started_on) VALUES ('B: exact split', DATE '2026-01-05')
        RETURNING campaign_id INTO v_cid;
    INSERT INTO ff_participant(campaign_id, member_id, joined_on) VALUES (v_cid, 4, DATE '2026-01-05') RETURNING participant_id INTO p1;
    INSERT INTO ff_participant(campaign_id, member_id, joined_on) VALUES (v_cid, 5, DATE '2026-01-05') RETURNING participant_id INTO p2;
    INSERT INTO ff_participant(campaign_id, member_id, joined_on) VALUES (v_cid, 6, DATE '2026-01-05') RETURNING participant_id INTO p3;

    -- unequal contributions: 100000, 66667, 33333  (total 200000)
    INSERT INTO ff_contribution(participant_id, week_starting, amount_cents, status, cleared_at) VALUES
        (p1, DATE '2026-01-05', 100000, 'cleared', now()),
        (p2, DATE '2026-01-05',  66667, 'cleared', now()),
        (p3, DATE '2026-01-05',  33333, 'cleared', now());

    -- distribute an explicit awkward surplus of 10001 cents
    SELECT SUM(share_cents) INTO v_sum FROM fn_surplus_distribution(v_cid, 10001);
    ASSERT v_sum = 10001, format('B1: shares must sum to exactly 10001, got %s', v_sum);

    -- every share is floor(exact) or floor(exact)+1, and exactly (surplus - sum_floor) get the +1
    WITH d AS (
        SELECT participant_id, contributed_cents, share_cents,
               FLOOR(contributed_cents::numeric * 10001 / 200000)::bigint AS floor_share
        FROM fn_surplus_distribution(v_cid, 10001)
    )
    SELECT COUNT(*) FILTER (WHERE share_cents NOT IN (floor_share, floor_share + 1)),
           COUNT(*) FILTER (WHERE share_cents = floor_share + 1)
      INTO v_bad, v_plus_ones FROM d;
    ASSERT v_bad = 0, format('B2: some share off by >1 cent from ideal (count=%s)', v_bad);
    ASSERT v_plus_ones = 2, format('B3: expected exactly 2 rounding cents allocated, got %s', v_plus_ones);

    -- concrete deterministic expectation: p1=5000, p2=3334, p3=1667
    SELECT share_cents INTO s1 FROM fn_surplus_distribution(v_cid, 10001) WHERE participant_id = p1;
    SELECT share_cents INTO s2 FROM fn_surplus_distribution(v_cid, 10001) WHERE participant_id = p2;
    SELECT share_cents INTO s3 FROM fn_surplus_distribution(v_cid, 10001) WHERE participant_id = p3;
    ASSERT s1 = 5000 AND s2 = 3334 AND s3 = 1667, format('B4: expected 5000/3334/1667, got %s/%s/%s', s1, s2, s3);

    RAISE NOTICE 'PASS B: awkward surplus splits exactly (10001 = 5000 + 3334 + 1667)';
END $$;

-- ----------------------------------------------------------------------------
-- TEST C: a recovery cannot exceed its support payment (single and cumulative).
-- ----------------------------------------------------------------------------
DO $$
DECLARE v_cid BIGINT; v_pid BIGINT; v_pay BIGINT; v_r10 BIGINT; v_ok BOOLEAN;
BEGIN
    INSERT INTO ff_campaign(name, started_on) VALUES ('C: recovery cap', DATE '2026-01-05')
        RETURNING campaign_id INTO v_cid;
    INSERT INTO ff_participant(campaign_id, member_id, joined_on) VALUES (v_cid, 7, DATE '2026-01-05')
        RETURNING participant_id INTO v_pid;
    INSERT INTO ff_support_payment(participant_id, week_starting, amount_cents, reason, status, paid_at)
        VALUES (v_pid, DATE '2026-01-12', 40000, 'demobilised', 'cleared', now()) RETURNING payment_id INTO v_pay;

    -- (C1) single recovery over the cap -> rejected
    v_ok := false;
    BEGIN
        INSERT INTO ff_recovery(payment_id, amount_cents, status) VALUES (v_pay, 50000, 'pending');
    EXCEPTION WHEN check_violation THEN v_ok := true;
    END;
    ASSERT v_ok, 'C1: a single recovery exceeding the support payment must be rejected';

    -- (C2) cumulative partial recoveries within cap are accepted (30000 + 10000 = 40000)
    INSERT INTO ff_recovery(payment_id, amount_cents, status) VALUES (v_pay, 30000, 'pending');
    INSERT INTO ff_recovery(payment_id, amount_cents, status) VALUES (v_pay, 10000, 'pending')
        RETURNING recovery_id INTO v_r10;

    -- (C3) one more cent tips over the cap -> rejected
    v_ok := false;
    BEGIN
        INSERT INTO ff_recovery(payment_id, amount_cents, status) VALUES (v_pay, 1, 'pending');
    EXCEPTION WHEN check_violation THEN v_ok := true;
    END;
    ASSERT v_ok, 'C3: cumulative recoveries exceeding the support payment must be rejected';

    -- (C4) reversing the 10000 recovery frees the cap again
    INSERT INTO ff_recovery(payment_id, amount_cents, status, cleared_at, reverses_id)
        VALUES (v_pay, 10000, 'cleared', now(), v_r10);
    INSERT INTO ff_recovery(payment_id, amount_cents, status) VALUES (v_pay, 10000, 'pending'); -- back to 40000, ok

    -- (C5) equal-to-cap is allowed; one more cent now is not
    v_ok := false;
    BEGIN
        INSERT INTO ff_recovery(payment_id, amount_cents, status) VALUES (v_pay, 1, 'pending');
    EXCEPTION WHEN check_violation THEN v_ok := true;
    END;
    ASSERT v_ok, 'C5: exceeding the cap after a reversal is still rejected';

    RAISE NOTICE 'PASS C: recovery cap enforced (single, cumulative, and after reversal)';
END $$;

-- ----------------------------------------------------------------------------
-- TEST F: reversal integrity guard — cross-owner and over-reversal are rejected.
-- ----------------------------------------------------------------------------
DO $$
DECLARE v_cid BIGINT; pA BIGINT; pB BIGINT; cA BIGINT; v_ok BOOLEAN;
BEGIN
    INSERT INTO ff_campaign(name, started_on) VALUES ('F: reversal guard', DATE '2026-01-05')
        RETURNING campaign_id INTO v_cid;
    INSERT INTO ff_participant(campaign_id, member_id, joined_on) VALUES (v_cid, 8, DATE '2026-01-05') RETURNING participant_id INTO pA;
    INSERT INTO ff_participant(campaign_id, member_id, joined_on) VALUES (v_cid, 9, DATE '2026-01-05') RETURNING participant_id INTO pB;
    INSERT INTO ff_contribution(participant_id, week_starting, amount_cents, status, cleared_at)
        VALUES (pA, DATE '2026-01-05', 5000, 'cleared', now()) RETURNING contribution_id INTO cA;

    -- (F1) reversal attributed to a different participant -> rejected
    v_ok := false;
    BEGIN
        INSERT INTO ff_contribution(participant_id, week_starting, amount_cents, status, cleared_at, reverses_id)
            VALUES (pB, DATE '2026-01-05', 5000, 'cleared', now(), cA);
    EXCEPTION WHEN check_violation THEN v_ok := true;
    END;
    ASSERT v_ok, 'F1: a reversal for a different participant must be rejected';

    -- (F2) over-reversal (reversing 6000 of a 5000 original) -> rejected
    v_ok := false;
    BEGIN
        INSERT INTO ff_contribution(participant_id, week_starting, amount_cents, status, cleared_at, reverses_id)
            VALUES (pA, DATE '2026-01-05', 6000, 'cleared', now(), cA);
    EXCEPTION WHEN check_violation THEN v_ok := true;
    END;
    ASSERT v_ok, 'F2: reversing more than the original amount must be rejected';

    RAISE NOTICE 'PASS F: reversal guard rejects cross-owner and over-reversal';
END $$;

DO $$ BEGIN RAISE NOTICE '======== ALL ROV FIGHTING FUND TESTS PASSED ========'; END $$;
