# DA0.3 — production run sheet (operator only)

Ready-to-paste files generated from the committed scripts: the migration is wrapped `BEGIN; SET LOCAL oux.env =
'production'; … ; <ledger row>; COMMIT;` with a read-only SELECT after it, and the preflight is one statement.
Supabase dashboard → production project → SQL Editor → New query → paste the whole file → Run. One file per
submission, in this order, each result pasted to the orchestrator before the next.

| Step | File | Kind | Expect |
|---|---|---|---|
| P1 | `P1_preflight_before.sql` | read-only | employers 187 / worksites 194 with md5s; aliases merge 39 / import 8; DA0.3 objects absent; raw columns 0 |
| P2 | `P2_migration.sql` | **schema migration** + ledger row, one transaction | one row: `20260922120000 / da0_3_name_match_reviews / t / t / t / 3` |
| P3 | `P3_preflight_after.sql` | read-only | same counts, md5s and view md5s as P1; objects present; both CHECKs five-valued |
| — | merge the branch into `main` (pull request) | code deploy + types regeneration from production | after P3 matches |
| — | import the next weekly membership batch as usual, then run `P3_preflight_after.sql` again | | queue rows present in `name_match_reviews`; employers/worksites md5 unchanged since P3 (Phase 0 exit criterion) |

Recovery only, if asked: `../91_clear_da0_3_data.sql` then `../90_rollback_da0_3_name_match_reviews.sql`, each with
`SET LOCAL oux.env = 'production';` after `BEGIN;` (the orchestrator supplies them as PX1/PX2 if ever needed).
P2 before the merge is mandatory: the merged code reads the new table and columns.
