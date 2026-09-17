# OUX WP3.8 — Campaign families and shared assessments: scripts

Package: `docs/organiser-ux-review/wp/wp3.8.md` (Revision 1, approved; §9.1 answered as recommended);
specification in `docs/organiser-ux-review/IMPLEMENTATION_ORCHESTRATION_PROMPT.md` phase 3.

Operator-reviewed SQL artefacts. They are not migrations: never copy them under `supabase/migrations/`
and never run them with `supabase db push` (`supabase/.temp/project-ref` names **production**; no
`supabase` CLI command is run from this checkout). Execute each only under explicit operator
authorisation for the named environment and exact step, one file per submission, output pasted
before the next. Mutating files start with `BEGIN;` and the WP2.1/2.2 environment guard: they refuse
to run unless `public._oux_env_marker` is a valid clone/dev singleton **or**
`current_setting('oux.env', true) = 'production'` in the same transaction. Production has no marker;
the operator adds `SET LOCAL oux.env = 'production';` immediately after **every** `BEGIN;` in the
same submission. The committed files omit that line and name no project.

**Status (Stage 1):** every file below has been written but NOT executed against any database. The
first execution is Stage 2 on normal dev (migration + ledger row, `01` before/after) and the
realistic-data rehearsal of wp3.8.md §0.1 step 4, each under operator approval.

| File | Kind | Where it runs |
|---|---|---|
| `00_campaign64_vessel_unit_basis.sql` | read-only | operator, on production (task 2 in `PROGRESS.md` human tasks); agent, on dev or the realistic data set |
| `00_family_measurement.sql` | read-only simulation for acceptance item 4 (wp3.8.md §5.3): simulates 61 → 64, 62 → 64 and activity 88 as `family` with `VALUES`, recomputes the summary under the §3.3 rule and compares row by row with the live view. References none of the new columns or the helper, so it runs before and after the migration. Prints aggregates per campaign only | realistic data set (agent, read is free); pasted into wp3.8.md §9.2 item 4 |
| `01_family_checksums.sql` | read-only checksums over `campaign_activities`, `campaign_activity_ratings` and `campaign_worker_rating_summary` for campaigns 61, 62, 64 (wp3.8.md §0.3). Two labelled statements: **A** pre-migration (5 columns), **B** post-migration (adds `children_n`, `family_n`); the operator runs whichever applies | any project; agent on dev / the realistic set, operator on production — before and after every mutating step |
| `../../../supabase/migrations/20260917100000_wp3_8_campaign_families.sql` | **migration** (schema only; no row written): `campaigns.parent_campaign_id`, `campaign_activities.scope`, `trg_campaigns_enforce_one_level`, `campaign_family_activity_ids()`, the two views, the RD-a policy `wp38_car_delete_family`; refuses a repeated apply; post-assertions incl. a byte-identical summary-view checksum | dev (Stage 2, one `BEGIN; … COMMIT;` submission + the ledger row `('20260917100000','wp3_8_campaign_families')` as its own statement), realistic set (rehearsal), production (operator, wp3.8.md §0.1 step 6) |
| `90_rollback_wp3_8_campaign_families.sql` | mutating (rollback of the migration): drops the policy, restores both views verbatim from the baseline, drops the helper, the trigger and its function, the indexes and the columns. **STOPS** while any campaign has a parent or any activity is `scope = 'family'` (run `91` first; it never silently drops data). Migration-history repair (`DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260917100000'`) is a separate, explicitly approved statement quoted in the header, not executed | realistic data set (rehearsal: forward → `90` → forward again); recovery only elsewhere |
| `10_campaign64_family.sql` | mutating data run sheet (wp3.8.md §3.2): `parent_campaign_id = 64` on 61, 62, 69; `scope = 'family'` on activities 88–92 of 64; 93 and 95 asserted untouched; the eight rows logged to `public._oux_hygiene_log` (WP0.4 shape); post-assertions (3 children, 5 family rows, `campaign_family_activity_ids(61)` = own ∪ {88..92}, counts and the ratings checksum unchanged); an appended read-only SELECT after `COMMIT;` | **production only** (69 exists only there), operator, after the migration and the merge (§0.1 step 6 (e)). Not rehearsed on the realistic set (FQ-g-a) |
| `91_rollback_campaign64_family.sql` | mutating: reverses `10` (parent links cleared, 88–92 back to `campaign`), logs the reversal and stamps the `10` log rows `rolled_back_at`; precondition is exactly the state `10` leaves | production, operator, recovery only |

## Run order

### Normal dev (Stage 2)

1. `01_family_checksums.sql` variant A (read-only), output pasted.
2. The exact migration file as one submission wrapped `BEGIN; … COMMIT;`, then the ledger row
   `INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260917100000','wp3_8_campaign_families')`
   as its own approved statement (the WP2.2 dev mechanism). Never `supabase db push`, never `apply_migration`.
3. `01` variant B — `ratings_md5` and `summary_md5` identical to step 1; `activities_md5` differs only by the
   new `scope` column; `children_n = 0`, `family_n = 0`. `pg_get_viewdef` of the summary view pasted.
4. Contract suite (`pnpm test:contract`, `OUX_CONTRACT_*` in the shell only, incl. the new
   `OUX_CONTRACT_ADMIN_EMAIL` / `_PASSWORD`).

### Realistic data set (rehearsal, wp3.8.md §0.1 step 4)

`01` A (before) → migration + ledger row → `01` B (after-forward-1) → `90` → `01` A (after-rollback;
identical to before) → migration + ledger row again → `01` B (after-forward-2; identical to
after-forward-1) → `00_family_measurement.sql`. The clone marker is present, so `90` runs without
`SET LOCAL oux.env`. `10` is **not** rehearsed here (its precondition requires campaign 69).

### Production (operator only, wp3.8.md §0.1 step 6)

`01` A → `BEGIN; SET LOCAL oux.env = 'production'; <migration>; <ledger row>; COMMIT;` + the §0.2 SELECT →
`01` B → merge the PR (types regenerate) → after the deploy is live: `10` with `SET LOCAL oux.env = 'production';`
after `BEGIN;` → its appended SELECT shows `children = 3`, `family = 5` (otherwise `91` and report) → `01` B.
