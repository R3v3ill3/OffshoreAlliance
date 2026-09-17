# OUX WP3.8 — Campaign families and shared assessments: scripts

Package: `docs/organiser-ux-review/wp/wp3.8.md` (plan, to be written once decisions 11 and 12 are answered);
specification in `docs/organiser-ux-review/IMPLEMENTATION_ORCHESTRATION_PROMPT.md` phase 3.

| File | Kind | Where it runs |
|---|---|---|
| `00_campaign64_vessel_unit_basis.sql` | read-only | operator, on production (task 2 in `PROGRESS.md` human tasks); agent, on dev or the realistic data set |
| `90_rollback_wp3_8_campaign_families.sql` | mutating (rollback of the migration) | written with the migration; run-sheet style of `oux-wp2.1/README.md` |

Later files (the campaign-64 data run sheet: parent of 61 and 62, sector-wide assessments → `family`) are added
by the package once the migration is on production and the operator has answered task 3.
