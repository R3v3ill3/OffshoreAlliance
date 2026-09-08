# WP0.4 data-hygiene scripts (Organiser UX review)

**Operator-run SQL. Not migrations.** Nothing in this folder goes under `supabase/migrations/` and nothing here is
ever run with `supabase db push`. Plan, expected values and reasoning: `docs/organiser-ux-review/wp/wp0.4.md`.

**Run order is `00 -> 02 -> 03 -> 01`, not the file numbering, and script 01 is held until WP1.6 is on production.**
02 must precede 01 because the `campaign_organisers` rows it writes (`campaign_role = 'lead'`) are what keep the
converted accounts' campaign-level write access after they stop being `admin`
(`is_lead_organiser_for_campaign()` arm 2; wp0.4.md 3.6). 01 is held because, between conversion and WP1.6, the
converted organisers cannot delete a unit, remove a worker from a unit or a campaign, unlink a leader, or move a
worker between units, and the UI does not tell them (wp0.4.md 3.5). The operator may override the hold; if so,
announce that window and the escalation path (the two lead organisers and the two coordinators, who stay `admin`).

## Files

| File | What it does | Rollback |
|---|---|---|
| `00_create_hygiene_log.sql` | Creates `public._oux_hygiene_log` (audit trail; locked down, RLS on). Idempotent. | none needed; `99` removes it |
| `01_role_conversion.sql` | `user_profiles`: `role='admin' AND work_role='organiser'` -> `role='user'` (decision 2). **HELD until WP1.6 is on production.** | `01_rollback.sql` |
| `02_backfill_campaign_organisers.sql` | Inserts a `campaign_role='lead'` roster row for every non-SMS-episode, non-standing campaign with an `organiser_id`. | `02_rollback.sql` |
| `03_resolve_duplicate_placements.sql` | Deletes duplicate `campaign_worker_ou` rows (hazards H1 and H3), keeping the primary, else the latest. | `03_rollback.sql` |
| `90_verify_all.sql` | Read-only. H1/H3/H5/H6/H7 verbatim plus every invariant count, each labelled with its expected production value. | n/a |
| `99_drop_hygiene_log.sql` | Drops the audit table. Retention rule below. | none (PITR) |

Every change script has the same shape: **PRE-CHECK** (read-only, expected values in comments) -> **CHANGE** (one
statement inside one `BEGIN`/`COMMIT`, whose `RETURNING` writes the audit rows in the same transaction) ->
**POST-CHECK** (read-only) -> pointer to the rollback. No user id, email, campaign id or worker id is hard-coded;
each script selects on the predicate in the plan. Every script is idempotent: re-running a forward script changes
and logs 0 rows; every rollback only applies log rows with `rolled_back_at IS NULL` and stamps them.

## How the operator runs it on production

The orchestrator, the implementer and the verifier never run any of this against production.

1. Take a backup / note the point-in-time-recovery timestamp before starting. The scripts have rollbacks; PITR is
   the backstop if the log table is lost.
2. Connect as `postgres`: the Supabase SQL editor for the production project, or
   `psql "<production postgres connection string>" -v ON_ERROR_STOP=1`. RLS does not apply to this role, so the
   delete policies discussed in wp0.4.md 3.5 do not obstruct the scripts themselves. In `psql`, run a file with
   `\i <file>`; in the SQL editor, paste the whole file and run it as one submission.
3. Run `90_verify_all.sql` first and paste the output into `docs/organiser-ux-review/wp/wp0.4.md` 13 as the
   "before" snapshot.
4. Run, in this order, pasting each script's pre-check and post-check output into the same file as you go:
   **`00_create_hygiene_log.sql` -> `02_backfill_campaign_organisers.sql` -> `03_resolve_duplicate_placements.sql`
   -> `01_role_conversion.sql`** (01 held until WP1.6 is on production -- see above).
   Run one file at a time. **If any pre-check disagrees with its expected value, stop and report before running the
   change.** In particular, 03's pre-check must show no `assignment_source = 'rule'` rows to delete (wp0.4.md 5.2).
5. Run `90_verify_all.sql` again and paste the "after" snapshot.
6. If anything is wrong, run the matching `<nn>_rollback.sql` (in reverse order if more than one:
   `01_rollback` -> `03_rollback` -> `02_rollback`), then `90_verify_all.sql` again.
7. Tick the "Run WP0.4 scripts on production" row in `docs/organiser-ux-review/PROGRESS.md` -> "Human tasks" and
   record the date.
8. Leave `_oux_hygiene_log` in place; run `99_drop_hygiene_log.sql` only per the retention rule below.

## Rehearsal on dev

Same files, same order, against the dev project only (`psql "$SUPABASE_DEV_DB_URL"` with `\set ON_ERROR_STOP on`,
or the dev SQL editor). Until dev is re-seeded from a production snapshot, only 00 and 01 have material there; 02
and 03 run to completion against empty inputs (0 rows, every post-check 0), which proves the SQL compiles but not
the counts (wp0.4.md 6). Never `supabase db push`.

## Caveats

- **`user_profiles.updated_at`** is bumped by `trg_user_profiles_updated_at` on both the 01 conversion and its
  rollback; it is metadata only and is not restored.
- **`03_rollback.sql` must run before anyone changes the affected workers' placements.** The re-insert passes both
  BEFORE triggers on `campaign_worker_ou` for an unchanged database. If someone has since put one of those workers
  into a *different* group of the same `ou_type`, `trg_check_worker_ou_group_exclusivity` rejects that one row and
  the whole transaction aborts with nothing restored; the log holds every column needed to restore by hand.
- **`02_rollback.sql` after `01_role_conversion.sql`** removes the converted accounts' campaign-level access; roll
  back 01 first.
- Only rows still exactly as inserted are removed by `02_rollback.sql`; a roster row edited since the backfill is
  left alone and listed by the post-check.

## Retention of `_oux_hygiene_log`

The table survives until **all three** of: WP1.6 is on production; phase 1 exit is signed off in `PROGRESS.md`;
30 days since the last of scripts 01-03 ran. Then run `99_drop_hygiene_log.sql`, record the date in the
`PROGRESS.md` "Human tasks" row, and regenerate types if prod types are being regenerated (operator only, always
with `SUPABASE_PROJECT_REF` set). Until then a prod type regeneration will include `_oux_hygiene_log` in
`packages/db-types/generated.ts`; that is harmless and expected. Dropping the table makes the rollbacks unusable.
