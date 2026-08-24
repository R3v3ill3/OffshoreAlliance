# ROV Industry Fighting Fund — ledger

A member-funded campaign support fund (strategy §1–§22). ~200 members contribute
$50/week into a central pool; the pool compensates members who lose income from
protected industrial action; recoveries from later settlements repay the fund; any
end-of-campaign surplus is returned pro-rata by total contributed.

Money-handling code — correctness and auditability are the priority.

## Files

| File | Purpose |
|---|---|
| `supabase/migrations/20260824100000_rov_fighting_fund_ledger.sql` | Migration 1 — tables, **FK wiring**, RLS. No money logic. |
| `supabase/migrations/20260824100100_rov_fighting_fund_money.sql` | Migration 2 — reversal guard, **recovery cap**, balance/report views, **surplus function**. |
| `supabase/rollback/20260824100000_..._down.sql` | Down-migration for migration 1. |
| `supabase/rollback/20260824100100_..._down.sql` | Down-migration for migration 2. |
| `supabase/tests/rov_fighting_fund_test.sql` | Test suite (see below). |
| `scripts/test/ff_prereqs.sql`, `scripts/test/run_ff_tests.sh` | Scratch-DB harness. |

## Applying / rolling back

Migrations apply through the repo's normal manual flow (`supabase db push`; see
`docs/DEV_PROD_ENVIRONMENT.md`). Supabase is forward-only and only scans the top
level of `supabase/migrations/`, so the down-migrations live in `supabase/rollback/`
(never auto-applied) and are run by hand, **money-down first**:

```
psql "$DATABASE_URL" -f supabase/rollback/20260824100100_rov_fighting_fund_money_down.sql
psql "$DATABASE_URL" -f supabase/rollback/20260824100000_rov_fighting_fund_ledger_down.sql
```

**Not applied to prod or dev.** Verified only against a throwaway local database via
`scripts/test/run_ff_tests.sh` (drops/recreates `ff_scratch`, applies both migrations,
runs the suite, then proves the down-migrations remove every `ff_` object).

## What changed vs. the draft (`rov_fighting_fund_schema.sql`)

Confirmed as-is: BIGINT-cents throughout, append-only ledgers with reversal rows,
and the largest-remainder surplus split. Corrections made:

1. **FK wiring (the draft's core TODO).** There is no `members` table — members are
   `workers(worker_id INT)`, employers are `employers(employer_id INT)`. The draft's
   unwired `BIGINT member_id/employer_id` placeholders are now real `INT` FKs. Money
   stays BIGINT; only the FK id columns are INT (to match the `SERIAL` PKs).
2. **Reversal model made consistent (was a double-count bug).** The draft's
   `v_member_contribution_total` netted reversals but `v_fund_balance` did **not**, so a
   reversed contribution/payment stayed in the balance. Reworked to one rule everywhere:
   a reversal is a `cleared` row with `reverses_id` set and a positive amount; every
   total is `Σ(originals) − Σ(reversals)`. The `'reversed'` status was dropped as
   ambiguous — a reversal is identified structurally by `reverses_id IS NOT NULL`.
3. **NULL-poisoning fixed.** `SUM(x) FILTER(orig) − SUM(x) FILTER(rev)` is NULL when a
   campaign has no reversal rows (`x − NULL = NULL`), which silently zeroed whole terms.
   Every `SUM(...) FILTER` is now individually `COALESCE(...,0)`.
4. **Recovery cap enforced (Step 3, was an app-level TODO).** `fn_ff_recovery_cap`
   rejects any recovery whose cumulative total would exceed the support payment it repays
   (§13 "lesser of"). Counts pending+cleared active recoveries (net of recovery
   reversals) so it can't be bypassed by stacking `pending` rows; cap = payment amount
   net of payment reversals. Single and cumulative both covered.
5. **Reversal integrity guard added.** `fn_ff_reversal_guard` blocks reversing a
   reversal, cross-owner reversals, and over-reversal (cumulative reversals > original).
6. **Broken `UNIQUE(participant_id, week_starting, reverses_id)` removed.** NULLs are
   distinct, so it constrained nothing; a strict unique would also forbid the legitimate
   "reverse then re-post" pattern. Duplicate-week detection is a committee/app control
   (noted in the migration). **← confirm this is acceptable.**
7. **Additions:** `reverses_id` on recoveries and expenses (append-only corrections);
   `opening_balance_cents` on the campaign; `v_fund_report` for §18 reporting; RLS on all
   fund tables (admin/user read+write, **no DELETE policy** = append-only at the security
   layer); deterministic surplus tie-break (`remainder DESC, contribution DESC,
   participant_id ASC`); optional `p_surplus_cents` override on the surplus function for
   §16 finalisation with a held-back reserve.

## Apportionment decisions (please confirm)

These affect how money is counted/split:

- **Surplus base = cleared, net-of-reversal contributions only** (§3/§17). Pending and
  failed weeks do not count. Supported members still receive their pro-rata surplus on
  what they contributed (§17 has no carve-out for recipients).
- **Recovery cap counts pending+cleared** (stronger than the literal "cleared" wording)
  to prevent over-commitment. Equal-to-cap is allowed; one cent over is rejected.
- **Amounts are immutable by convention** — corrections are reversals, not `UPDATE`s of
  `amount_cents`. A DB-level immutability trigger could enforce this if you want it.
- **Qualifying period / foundation eligibility (§9)** are stored (`qualifying_weeks`,
  `ff_participant.foundation`) but eligibility itself is committee-determined, not
  enforced in-schema. Confirm you don't want a hard gate.

## Tests

`scripts/test/run_ff_tests.sh` (all passing) covers:

- **A** — pending/failed weeks lower a member's contribution, and the surplus share reflects it.
- **B** — awkward split sums exactly: 3 members, $100.01 surplus, unequal contributions → 5000 + 3334 + 1667 = 10001, no cent lost or invented.
- **C** — recovery cannot exceed its support payment (single, cumulative, and after a recovery reversal frees the cap).
- **D** — `v_fund_balance` = opening + contributions cleared + recoveries cleared − support cleared − expenses (pending/failed excluded).
- **E** — a reversal row nets a contribution back out (member total and fund balance).
- **F** — reversal guard rejects cross-owner and over-reversal.
