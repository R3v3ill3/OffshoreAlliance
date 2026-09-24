# DA0.5 — production run sheet (operator only)

Ready-to-paste files generated from the committed scripts in the parent folder: `SET LOCAL oux.env = 'production';`
is already inserted after `BEGIN;` in the mutating files, and the catalog check is condensed to one result row.
Supabase dashboard → production project → SQL Editor → New query → paste the whole file → Run. One file per
submission, in this order, each result pasted to the orchestrator before the next.

| Step | File | Kind | Expect |
|---|---|---|---|
| P1 | `P1_before.sql` | read-only | tables 16, columns 173, constraints 72, indexes 34, policies 27, triggers 8, function md5 `764235c6…`, recipients table **t** with 2 policies, signal columns 2, `mobilisation_ledger_rows` **NULL**, ledger max `20260921030000`, ledger rows 16, vessels 25/3/0/0, contractors 14/2/0/0, 4 alias strings missing |
| P2 | `P2_record_ledger_row.sql` | mutating (one ledger row + one audit row) | `ledger_row_present t … ledger_rows 17 … log_rows_written 1` |
| P2b | `P2b_record_later_ledger_rows.sql` | mutating (two ledger rows + two audit rows) | `rows_20260923220000 1, rows_20260924010000 1, ledger_rows 19, … log_rows_written 2` |
| P3 | `P3_after.sql` | read-only | as P1 except `mobilisation_ledger_rows` = the three versions, ledger max `20260924010000`, ledger rows 19 |

Why three rows: `main` moved after the DA0.5 plan was written and carries two further mobilisation migrations
(`20260923220000_mobilisation_recipients.sql`, `20260924010000_mobilisation_signal_schedule.sql`); production already
holds every object they create (checked read-only 2026-09-24: the recipients table, its two policies and trigger, the
two signal columns and the index — hence columns 173 and indexes 34, against the radar file's 171 and 33) and the
ledger has no row for any of the three. None of the three files is ever submitted to production: the radar and
recipients files' `CREATE POLICY` statements would fail, and the recipients seed would re-add removed people.

Recovery only, if asked: `../91_remove_later_ledger_rows.sql` then `../90_remove_ledger_row.sql`, each with
`SET LOCAL oux.env = 'production';` after `BEGIN;` (supplied as PX files if ever needed). Prerequisite: O-1
(confirmed 2026-09-24).
