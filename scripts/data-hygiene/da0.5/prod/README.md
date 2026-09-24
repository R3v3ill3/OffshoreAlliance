# DA0.5 — production run sheet (operator only)

Ready-to-paste files generated from the committed scripts in the parent folder: `SET LOCAL oux.env = 'production';`
is already inserted after `BEGIN;` in the mutating file, and the catalog check is condensed to one result row.
Supabase dashboard → production project → SQL Editor → New query → paste the whole file → Run. One file per
submission, in this order, each result pasted to the orchestrator before the next.

| Step | File | Kind | Expect |
|---|---|---|---|
| P1 | `P1_before.sql` | read-only | tables 16, columns 171, constraints 72, indexes 33, policies 27, triggers 8, RLS 16, function md5 `764235c6…`, ledger row **f**, ledger max `20260921030000`, ledger rows 16, vessels 25/3/0/0, contractors 14/2/0/0, 4 alias strings missing |
| P2 | `P2_record_ledger_row.sql` | mutating (one ledger row + one audit row) | `ledger_row_present t … ledger_rows 17 … log_rows_written 1` |
| P3 | `P3_after.sql` | read-only | as P1 except ledger row **t**, ledger max `20260922040000`, ledger rows 17 |

Recovery only, if asked: paste `../90_remove_ledger_row.sql` with `SET LOCAL oux.env = 'production';` inserted after
its `BEGIN;` (the orchestrator will supply it as `PX1` if ever needed).

The migration file `supabase/migrations/20260922040000_mobilisation_radar.sql` is **never** submitted to production:
its tables already exist and its `CREATE POLICY` statements would fail (plan §3.2). Prerequisite: operator input O-1
(confirmed 2026-09-24).
