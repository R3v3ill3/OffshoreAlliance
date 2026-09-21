# WP3.8 — production run sheet (operator only)

Ready-to-paste files, generated mechanically from the committed scripts in the parent folder by
`scripts/data-hygiene/oux-wp3.8/prod/` (`SET LOCAL oux.env = 'production';` inserted after `BEGIN;`, a read-only
SELECT after `COMMIT;` where the script lacked one, and a header saying what to expect and what to paste back).
Supabase dashboard → production project → SQL Editor → New query → paste the whole file → Run. One file per
submission, in this order, each result pasted to the orchestrator before the next file is run. The agent never
runs anything on production.

| Step | File | Kind | When |
|---|---|---|---|
| P1 | `P1_checksums_before.sql` | read-only | now |
| P2 | `P2_migration.sql` | **schema migration** + ledger row, one transaction | now, before the merge |
| P3 | `P3_checksums_after_migration.sql` | read-only | straight after P2 |
| — | merge the pull request into `main` | code deploy (Vercel Production) + types regeneration from production | after P3 shows the expected row |
| P4 | `P4_campaign64_family.sql` | **data**: 61, 62, 69 → part of 64; assessments 88–92 shared | straight after the deploy is live |
| P5 | `P5_checksums_after_data.sql` | read-only | straight after P4 |
| PX1 | `PX1_rollback_campaign64_family.sql` | recovery only | only if asked |
| PX2 | `PX2_rollback_migration.sql` | recovery only (after PX1 if P4 ran) | only if asked |

Notes
- P2 before the merge is mandatory: the merged code reads the new columns on every assessment screen.
- The production project's Supabase GitHub integration is on automatic deploy for `main`. P2 records the ledger row
  `20260917100000`, so the integration's push after the merge finds nothing pending and applies nothing.
- The migration's own post-assertions and P3 are the checks that P2 changed no row: `ratings_md5` and `summary_md5`
  must be identical to P1.
- P4 is scoped to campaign 64's children and activities; a family an organiser makes elsewhere between the merge and P4
  neither stops nor enters it. Run it straight after the deploy all the same.
