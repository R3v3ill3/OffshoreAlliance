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
| `03_resolve_duplicate_placements.sql` | Deletes duplicate `campaign_worker_ou` rows (hazards H1 and H3), keeping the primary, else the latest. Any partition containing a rule-sourced row is excluded by the statement itself. | `03_rollback.sql` |
| `90_verify_all.sql` | Read-only, application tables only. H1/H3/H5/H6/H7 verbatim plus every invariant count, each labelled with its expected production value. Runs before `00` and after `99`. | n/a |
| `91_verify_log.sql` | Read-only, audit-log invariants (#3, #27, per-script logged counts). **Run only while `_oux_hygiene_log` exists** (after `00`, before `99`). | n/a |
| `99_drop_hygiene_log.sql` | Drops the audit table. Retention rule below. | none (PITR) |

Every change script has the same shape: **PRE-CHECK** (read-only, expected values in comments) -> **CHANGE** (one
statement inside one `BEGIN`/`COMMIT`, whose `RETURNING` writes the audit rows in the same transaction) ->
**POST-CHECK** (read-only) -> pointer to the rollback. No user id, email, campaign id or worker id is hard-coded;
each script selects on the predicate in the plan. Every script is idempotent: re-running a forward script changes
and logs 0 rows; every rollback only applies log rows with `rolled_back_at IS NULL` and stamps them.

## How to submit a script: three blocks, three submissions

Each change and rollback script is divided by unmistakable delimiters into **BLOCK 1 of 3 PRE-CHECK**, **BLOCK 2 of 3
CHANGE** and **BLOCK 3 of 3 POST-CHECK**, with `END OF BLOCK 1` / `END OF BLOCK 2` lines marking the copy-paste
boundaries. **Never paste a whole file into the SQL editor as one submission.** The Supabase SQL editor returns
**one result set per submission** (the last statement's), so a pre-check pasted together with the change is never
seen and the change runs regardless of what the pre-check would have said. Instead:

1. Paste BLOCK 1 (from its banner to `END OF BLOCK 1`) and run it. To see every result rather than only the last,
   submit each statement of the block on its own. Compare every value with the expected value in its comment.
   **If any pre-check disagrees with its expected value, stop and report before running the change.**
2. Paste BLOCK 2 (`BEGIN; ... COMMIT;`) and run it as a second submission.
3. Paste BLOCK 3 and run it as a third submission (again per statement if you want every result).

Under interactive `psql` (`psql "<connection string>" -v ON_ERROR_STOP=1`, then `\i <file>` or paste per block):
if a statement inside BLOCK 2 fails, `ON_ERROR_STOP` stops the file but the session is left inside an **aborted
transaction**; run `ROLLBACK;` before doing anything else, then investigate. Nothing was committed.

`90_verify_all.sql` and `91_verify_log.sql` have no blocks (no `BEGIN`/`COMMIT`); submit them per statement if you
want every result, or run them with `psql` and capture the whole output.

## How the operator runs it on production

The orchestrator, the implementer and the verifier never run any of this against production.

1. Take a backup / note the point-in-time-recovery timestamp before starting. The scripts have rollbacks; PITR is
   the backstop if the log table is lost.
2. Connect as `postgres`: the Supabase SQL editor for the production project, or
   `psql "<production postgres connection string>" -v ON_ERROR_STOP=1`. RLS does not apply to this role, so the
   delete policies discussed in wp0.4.md 3.5 do not obstruct the scripts themselves.
3. Run `90_verify_all.sql` first and paste the output into `docs/organiser-ux-review/wp/wp0.4.md` 13 as the
   "before" snapshot. (`91_verify_log.sql` cannot run yet: the log table does not exist before `00`.)
4. Run, in this order, block by block as described above, pasting each script's pre-check and post-check output
   into the same file as you go:
   **`00_create_hygiene_log.sql` -> `02_backfill_campaign_organisers.sql` -> `03_resolve_duplicate_placements.sql`
   -> `01_role_conversion.sql`** (01 held until WP1.6 is on production -- see above).
   One file at a time; three submissions per file. **If any pre-check disagrees with its expected value, stop and
   report before running the change.** In particular, 03's pre-check must show `rows_to_delete_rule_sourced = 0`
   (wp0.4.md 5.2); if it does not, report it. The CHANGE itself skips every partition that contains a rule row,
   and the post-check `unresolved_rule_partitions` lists what it skipped (those go to phase 2).
5. Run `90_verify_all.sql` and `91_verify_log.sql` again and paste the "after" snapshot.
6. After 01: tell the converted organisers to **sign out and back in** (see Caveats).
7. If anything is wrong, run the matching `<nn>_rollback.sql` (in reverse order if more than one:
   `01_rollback` -> `03_rollback` -> `02_rollback`), then `90` and `91` again.
8. Tick the "Run WP0.4 scripts on production" row in `docs/organiser-ux-review/PROGRESS.md` -> "Human tasks" and
   record the date.
9. Leave `_oux_hygiene_log` in place; run `99_drop_hygiene_log.sql` only per the retention rule below.

## Rehearsal on dev

Same files, same order, block by block, against the dev project only (`psql "$SUPABASE_DEV_DB_URL"` with
`\set ON_ERROR_STOP on`, or the dev SQL editor). Dev carries only a small data set until it is re-seeded from a
production snapshot, so 02 and 03 prove the SQL compiles and the invariants hold on small counts, not the
production counts (wp0.4.md 6, 13). Never `supabase db push`.

## Caveats

- **After 01 (and after `01_rollback.sql`) the affected organisers must sign out and back in.** The web client
  reads `role` from `user_profiles` once at session load
  (`apps/organising-db/src/lib/supabase/auth-context.tsx`, `fetchProfile`) and derives `isAdmin` from that cached
  copy, while `get_user_role()` in RLS flips immediately. Until they re-authenticate the UI offers admin actions
  the database now refuses.
- **`is_lead_organiser_for_campaign()` arm 2 has no `role` / `work_role` check, and `user_profiles.organiser_id`
  is not unique** (it is a plain FK to `organisers`; no unique index in the baseline). Arm 2 grants lead access
  to *every* profile whose `organiser_id` matches a `campaign_organisers` row with `campaign_role='lead'`. So any
  future profile linked to one of the six organisers that 02 backfills inherits lead access for those campaigns,
  regardless of its own role. This is a pre-existing property of the function, not something 02 introduces (02
  only adds rows for organisers who already have that access as `admin` today); it is recorded here so a later
  "why can this new account edit that campaign" question has its answer.
- **`user_profiles.updated_at`** is bumped by `trg_user_profiles_updated_at` on both the 01 conversion and its
  rollback; it is metadata only and is not restored.
- **`03_rollback.sql` must run before anyone changes the affected workers' placements, and can be blocked by a
  legacy violation too.** The re-insert re-fires both BEFORE triggers on `campaign_worker_ou`.
  `trg_check_worker_ou_group_exclusivity` rejects a row if the worker holds a placement in a *different* non-null
  group of the same `ou_type` in the same campaign -- whether that placement was added since 03 ran or already
  existed before the trigger did (the original row pre-dating the trigger is how such a legacy state can exist at
  all). Either way the trigger rejects that one row and the whole transaction aborts with nothing restored.
  03_rollback's third pre-check probe replicates the trigger's predicate for every pending log row (expected 0
  rows) so this is known before the change; the log holds every column needed to restore by hand.
- **`02_rollback.sql` after `01_role_conversion.sql`** removes the converted accounts' campaign-level access; roll
  back 01 first.
- Only rows still exactly as inserted are removed by `02_rollback.sql`; a roster row edited since the backfill is
  left alone and listed by the post-check.
- **Invariants #12 and #13** (every `campaign_organisers` row matches `campaigns.organiser_id`; the per-organiser
  distribution 7, 6, 4, 2, 1, 1) hold **immediately after 02 only**. The roster UI legitimately adds
  `campaign_role='organiser'` members later, so a later `90_verify_all.sql` snapshot showing rows there is not a
  failure.
- **Rule-sourced duplicates.** 03's CHANGE excludes every `(campaign, dimension, worker)` partition that contains
  any `assignment_source='rule'` row (`recomputeOuAssignments` would recreate a deleted rule row client-side).
  Expected 0 such partitions on production; if there are any, H1/H3 stay non-zero by exactly that many after 03
  and the post-check `unresolved_rule_partitions` lists them for phase 2.

## Retention of `_oux_hygiene_log`

The table survives until **all three** of: WP1.6 is on production; phase 1 exit is signed off in `PROGRESS.md`;
30 days since the last of scripts 01-03 (or their rollbacks) ran -- 99's pre-check computes this from
`greatest(max(logged_at), max(rolled_back_at))`. Then run `99_drop_hygiene_log.sql`, record the date in the
`PROGRESS.md` "Human tasks" row, and regenerate types if prod types are being regenerated (operator only, always
with `SUPABASE_PROJECT_REF` set). Until then a prod type regeneration will include `_oux_hygiene_log` in
`packages/db-types/generated.ts`; that is harmless and expected. Dropping the table makes the rollbacks and
`91_verify_log.sql` unusable.
