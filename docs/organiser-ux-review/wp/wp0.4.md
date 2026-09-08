# WP0.4 — Data hygiene scripts

Planner output. Branch to implement on: `feat/oux-wp0.4-data-hygiene` (off `develop`). Nothing in this package
runs against production; the operator does. Nothing in this package is a migration.

---

## 1. Specification

### 1.1 Work package (verbatim)

> **WP0.4 Data hygiene scripts.** High-risk implementer prepares; operator runs on production. Scripts, each with a
> rollback and a verification query: convert the seven organiser-by-work-role `admin` accounts to `user` (appendix G 6;
> decision 2); backfill `campaign_organisers` from `campaigns.organiser_id`; resolve the seven duplicate unit placements
> (H1 and H3) keeping the primary or latest row and logging the rest. Acceptance: scripts rehearsed on dev and their
> verification queries return the expected counts. Depends on decision 2.

(`docs/organiser-ux-review/IMPLEMENTATION_ORCHESTRATION_PROMPT.md:116`.)

### 1.2 Decisions consumed

- **Decision 2 — Confirmed** (`docs/organiser-ux-review/DECISIONS.md`, "Answers"): "The seven `admin` accounts with
  `work_role = organiser` become `user`; the two lead organisers are named as leads." The two `lead_organiser`
  accounts, the `coordinator` and the `industrial_coordinator` stay `admin` (appendix G.6).
- **Decision 8 — Confirmed, with a note** (same file): "A `user`-role organiser must be able to create campaigns and
  actions with themselves assigned." This is why sections 3.5 and 3.6 recommend the sequencing they do, and why script 02
  runs before script 01.
- **Operator input already registered** in `DECISIONS.md` ("Operator inputs the work packages also need"): "Dev
  re-seeded from a production snapshot (schema plus campaign data) … Needed by WP2.1, WP0.4 rehearsal." Section 6
  states exactly what can and cannot be rehearsed before that happens.

### 1.3 Appendix sections cited

| Source | Used for |
|---|---|
| `appendix-G-production-data.md` G.1, G.3, G.4, G.5, G.6 | expected counts (table sizes, per-campaign "Same-type dupes", H1/H3/H7, the user table, campaigns per organiser) |
| `appendix-C-data-model.md` 1.1, 1.3 | `campaigns.organiser_id` = "the single primary lead"; `campaign_organisers` DDL and `campaign_role` values |
| `appendix-C-data-model.md` 3.3 | `campaign_worker_ou` columns, `is_primary` semantics, the two BEFORE triggers |
| `appendix-C-data-model.md` 3.2 item 3, 3.4 | level-2 sub-units sit outside group rules; rule-sourced rows are recomputed client-side |
| `appendix-C-data-model.md` 6.1, 6.2 | role model; what a `user` cannot do (delete = admin only on the OU tables) |
| `appendix-C-data-model.md` 8.4 | H1, H3, H5, H6, H7 verbatim — reused unchanged in `90_verify_all.sql` |
| `appendix-D-navigation-roles.md` 5.1, 5.4, 5.5, 5.6, 6 | `user_profiles` columns; the `isAdmin` and `/api/admin/*` surfaces a converted account loses; `resolveCampaignOrganiser`; `campaign_organisers` API and "My campaigns" |

### 1.4 Live DDL confirmed against the baseline (not the legacy files)

Everything below was read from `supabase/migrations/20260908050000_baseline_schema.sql` (the live schema per
`docs/organiser-ux-review/PROGRESS.md` standing notes), not from the migration filenames the appendices cite.

- `user_profiles` — `20260908050000_baseline_schema.sql:9887-9900`: `user_id uuid PK`, `role varchar(10) NOT NULL
  DEFAULT 'viewer'` CHECK in `('admin','user','viewer')`, `display_name`, `organiser_id`, `work_role varchar(30)` CHECK
  in `('coordinator','lead_organiser','organiser','industrial_officer','industrial_coordinator','specialist')`,
  `reports_to uuid`, `phone`, `created_at`, `updated_at`. Trigger `trg_user_profiles_updated_at` BEFORE UPDATE
  (`:22641`) — it bumps `updated_at` on conversion and is not restored by the rollback (benign; noted in 3.4).
- `campaign_organisers` — `:9470-9480`. Columns: `id integer NOT NULL` (serial, `:9484-9496`), **`campaign_id`**,
  **`organiser_id`** (there is no `user_id` column — the join to a person is
  `organisers.organiser_id → user_profiles.organiser_id`), `campaign_role varchar(30) NOT NULL DEFAULT 'organiser'`
  with CHECK in `('lead','organiser','coordinator','industrial_officer','specialist')` (`:9477`),
  `reports_to_organiser_id integer` (nullable), `added_at timestamptz DEFAULT now()`.
  NOT NULL columns the insert must satisfy: `campaign_id`, `organiser_id`, `campaign_role` (defaulted).
  Constraints: PK `(id)` (`:19031`), **UNIQUE `(campaign_id, organiser_id)`** (`:19026`) — this is what makes the
  backfill idempotent via `ON CONFLICT DO NOTHING`. There is **no** unique index enforcing one `'lead'` per campaign.
  FKs: campaign CASCADE (`:23495`), organiser CASCADE (`:23500`), reports_to_organiser NO ACTION (`:23505`).
  RLS: `campaign_organisers_read_all` for any authenticated (`:28286`); `campaign_organisers_write` USING
  `can_write_to_campaign(campaign_id)` (`:28290`).
- `campaign_worker_ou` — `:9636-9645`: `id integer NOT NULL` (serial), `ou_id`, `worker_id`, `is_primary boolean NOT
  NULL DEFAULT false`, `created_at timestamptz NOT NULL DEFAULT now()`, `assignment_source varchar(20) NOT NULL
  DEFAULT 'manual'` CHECK in `('manual','rule')`, `assigned_rule_id integer` (FK ON DELETE SET NULL). UNIQUE
  `(ou_id, worker_id)`. No `campaign_id` — every campaign-scoped query joins `campaign_organising_units`.
- Triggers on `campaign_worker_ou` — `:22417` `trg_check_no_worker_on_group_container` and `:22421`
  `trg_check_worker_ou_group_exclusivity`, both BEFORE INSERT OR UPDATE OF `ou_id`. Body of
  `check_worker_ou_group_exclusivity()` at `:1209-1248`: it returns immediately when the target unit's `ou_group_id`
  IS NULL, and otherwise raises only when the worker already sits in a unit of the **same campaign, same `ou_type`,
  different non-null `ou_group_id`**. Consequence for the rollback: see 5.5.
- `campaign_worker_membership` — `:7698-7704`: `membership_id`, `campaign_id`, `worker_id`, `created_at`,
  `updated_at`; UNIQUE `(campaign_id, worker_id)`.
- `campaigns` — `:9651-9683`: `organiser_id integer` (nullable, FK to `organisers`), plus `is_standing boolean NOT
  NULL DEFAULT false` (`:9674`, comment `:9710`) and `is_sms_episode boolean NOT NULL DEFAULT false` (`:9675`,
  comment `:9714`) and `archived_at` (`:9676`, "used for hidden SMS episode campaigns").
- Delete policies that a converted account loses — all `FOR DELETE TO authenticated USING (get_user_role() =
  'admin')`: `campaign_organising_units` `:25553`, `campaign_worker_ou` `:25585`, `campaign_worker_membership`
  `:25581`, `campaigns` `:25593`, `campaign_leader_worker_links` `:25549`. Insert/update on the same tables stay
  `admin,user` (`:25959, :26007, :26003, :26015, :26331, :26375, :26371, :26383`). This is appendix C 6.2 confirmed
  against the baseline.
- `is_assigned_to_campaign(p_campaign_id)` — `:3651-3672`: true for **any** `campaign_organisers` row for the user's
  organiser. `is_lead_organiser_for_campaign(p_campaign_id)` — `:3711-3756`: arm 1 requires
  `work_role IN ('lead_organiser','coordinator','industrial_coordinator')`, so it will **not** fire for the seven
  after conversion; **arm 2** (`campaign_organisers.campaign_role = 'lead'`) has no `work_role` requirement and is
  what the backfill uses. `delete_campaign(p_campaign_id)` is SECURITY DEFINER and allows `is_admin() OR
  is_lead_organiser_for_campaign()`.
- Default privileges: `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon /
  authenticated / service_role` (`:33393-33396`). **Any new table in `public` is world-readable by the anon and
  authenticated roles unless the script revokes it.** Script 00 must revoke and enable RLS (see 2.3).
- `campaign_organisers` API vocabulary — `apps/organising-db/src/app/api/campaign-organisers/[campaignId]/route.ts:62`
  and `:111`: `const validRoles = ['lead', 'organiser', 'coordinator', 'industrial_officer', 'specialist']`; POST
  defaults `campaign_role = 'organiser'` (`:58`) and returns 409 on PostgREST `23505` "already on the campaign team"
  (`:79-81`) — i.e. the API already treats `(campaign_id, organiser_id)` as the identity of a roster row. The API
  asserts **no** one-lead-per-campaign invariant (no check in POST `:67-83` or PATCH `:125-132`); the invariant is
  ours to keep, and the post-check in 4.3 asserts it.
- `excludeSmsEpisodes` — `apps/organising-db/src/lib/campaign/visible-campaigns.ts:12-17`: every list surface filters
  `is_sms_episode = false`. The backfill uses the same filter.

---

## 2. Plan — where the scripts live and why they are not migrations

### 2.1 Location

The repo has no `scripts/` convention beyond loose files (`scripts/seed-oa-standard-wrapper.sql`,
`scripts/test-workload-dashboard.sh`, `scripts/validate-supabase-migrations.mjs`, `scripts/video-pipeline/`). Create:

```
scripts/data-hygiene/oux-wp0.4/
  README.md                              run order, connection, what to paste back, retention of the log table
  00_create_hygiene_log.sql              creates public._oux_hygiene_log (idempotent)
  01_role_conversion.sql                 admin+organiser -> user
  01_rollback.sql
  02_backfill_campaign_organisers.sql    campaigns.organiser_id -> campaign_organisers (campaign_role='lead')
  02_rollback.sql
  03_resolve_duplicate_placements.sql    H1 + H3 duplicate campaign_worker_ou rows
  03_rollback.sql
  90_verify_all.sql                      READ-ONLY: H1/H3/H5/H6/H7 verbatim + every invariant count
  99_drop_hygiene_log.sql                DROP TABLE _oux_hygiene_log (see 2.3)
```

No TypeScript. No file under `supabase/migrations/`. `pnpm validate:migrations` only reads
`join(process.cwd(),"supabase","migrations")` (`scripts/validate-supabase-migrations.mjs:6`), so adding these files
cannot affect it — and it must still be run to prove that (section 7).

### 2.2 Why none of this is a migration

1. **It would run in the wrong places.** `docs/DEV_PROD_ENVIRONMENT.md` (migration workflow) pushes every file in
   `supabase/migrations/` to dev first and then to production, and states "The canonical migrations now replay
   successfully from an empty PostgreSQL 17 database". A data fix that selects seven specific production rows either
   silently no-ops on an empty database or, worse, encodes a one-off production state into the replayable baseline
   forever.
2. **The ledger was just rebased.** `PROGRESS.md` standing notes: the three `20260908050*` baseline files are the whole
   history and the legacy files are audit-only. Adding a data migration on top of a freshly repaired ledger for
   something that is not a schema change re-opens the dev/prod ledger divergence the baseline fixed.
3. **There is no down migration in this repo.** The acceptance criterion demands a rollback per change; a rollback that
   the operator runs by hand from an audit log is only expressible as a script.
4. **Timing is a human decision.** Script 01 changes what seven people can do in the app on the day it runs, and
   section 4.2 recommends deferring it. Migrations run when the deploy runs; these run when the operator says so.

The orchestration prompt already frames it this way: "Any change to production data or schema is prepared as a script
with a rollback and a verification query, and handed to the operator to run"
(`IMPLEMENTATION_ORCHESTRATION_PROMPT.md:30`).

### 2.3 The audit table

`00_create_hygiene_log.sql`:

```sql
CREATE TABLE IF NOT EXISTS public._oux_hygiene_log (
  log_id        bigserial PRIMARY KEY,
  script        text        NOT NULL,   -- '01_role_conversion' | '02_backfill_campaign_organisers' | '03_resolve_duplicate_placements'
  action        text        NOT NULL CHECK (action IN ('update','insert','delete')),
  table_name    text        NOT NULL,
  row_pk        jsonb       NOT NULL,   -- identifying key of the affected row
  before_row    jsonb,                  -- NULL for inserts
  after_row     jsonb,                  -- NULL for deletes
  note          text,
  logged_at     timestamptz NOT NULL DEFAULT now(),
  rolled_back_at timestamptz            -- set by the matching *_rollback.sql; makes rollback idempotent
);

COMMENT ON TABLE public._oux_hygiene_log IS
  'Organiser UX WP0.4 data-hygiene audit trail. Every row changed by scripts 01-03 with its prior value. '
  'The *_rollback.sql scripts read this table; dropping it makes the rollbacks unusable. '
  'May be dropped (99_drop_hygiene_log.sql) once WP1.6 is on production, phase 1 exit is signed off, '
  'and at least 30 days have passed since the last script run.';

-- Public-schema tables inherit GRANT ALL to anon and authenticated
-- (baseline_schema.sql:33393-33396). This table holds user_ids; lock it down.
REVOKE ALL ON public._oux_hygiene_log FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public._oux_hygiene_log_log_id_seq FROM anon, authenticated;
ALTER TABLE public._oux_hygiene_log ENABLE ROW LEVEL SECURITY;   -- enabled, no policies = deny all; service_role/postgres bypass
```

RLS is enabled deliberately so this table does not join the four RLS-disabled `_archive_*` tables in the Supabase
security advisory (appendix G.7). `IF NOT EXISTS` + no data means 00 is safe to re-run.

**Retention.** The table survives until all three of: WP1.6 is on production; phase 1 exit is signed off in
`PROGRESS.md`; 30 days since the last of scripts 01–03 ran. Then run `99_drop_hygiene_log.sql`, record the date in the
`PROGRESS.md` "Human tasks" row, and regenerate types if prod types are being regenerated
(`SUPABASE_PROJECT_REF=gteygwfgjvczanmrwgbr pnpm gen:types` — operator only). Until then, note that a prod type
regeneration will include `_oux_hygiene_log` in `packages/db-types/generated.ts`; that is harmless and expected.

### 2.4 Shape every script follows

```sql
-- ============ PRE-CHECK (read-only; paste the output into wp/wp0.4.md) ============
   ... SELECTs with the expected value in a comment ...
-- ============ CHANGE ============
BEGIN;
   ... one data-modifying CTE statement whose RETURNING feeds an INSERT into _oux_hygiene_log ...
COMMIT;
-- ============ POST-CHECK (read-only) ============
   ... SELECTs with the expected value in a comment ...
-- Rollback: run <nn>_rollback.sql
```

The change is one statement inside one transaction: the delete/update/insert and its audit rows commit together or not
at all. In the Supabase SQL editor the whole file runs as one submission; in `psql` use
`\set ON_ERROR_STOP on` and `\i`.

---

## 3. Script 01 — role conversion

### 3.1 Pre-check

```sql
-- Expected on production (appendix G.6): 7
SELECT count(*) AS admin_organisers_to_convert
FROM public.user_profiles
WHERE role = 'admin' AND work_role = 'organiser';

-- Full distribution, so the operator can see nothing else moves.
-- Expected (G.6): admin/organiser 7, admin/lead_organiser 2, admin/coordinator 1,
--                 admin/industrial_coordinator 1, user/organiser 1, user/industrial_officer 1  (13 rows total)
SELECT role, work_role, count(*)
FROM public.user_profiles GROUP BY 1,2 ORDER BY 1,2;
```

No user id or email appears anywhere in the script; the selector is the predicate itself.

### 3.2 Change

```sql
BEGIN;
WITH upd AS (
  UPDATE public.user_profiles
     SET role = 'user'
   WHERE role = 'admin' AND work_role = 'organiser'
  RETURNING user_id, work_role
)
INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
SELECT '01_role_conversion', 'update', 'public.user_profiles',
       jsonb_build_object('user_id', user_id),
       jsonb_build_object('role', 'admin', 'work_role', work_role),
       jsonb_build_object('role', 'user',  'work_role', work_role),
       'decision 2: admin accounts whose work_role is organiser become user'
FROM upd;
COMMIT;
```

The prior value is `'admin'` by construction (it is the WHERE clause), so nothing is inferred. Re-running updates 0
rows and logs 0 rows: idempotent. `work_role`, `reports_to`, `organiser_id`, `display_name` are untouched — the two
lead organisers, the coordinator and the industrial coordinator are outside the predicate and stay `admin`.

### 3.3 Post-check

```sql
-- Expected: 0
SELECT count(*) AS remaining_admin_organisers
FROM public.user_profiles WHERE role='admin' AND work_role='organiser';

-- Expected: 7 (matches the pre-check count)
SELECT count(*) AS converted FROM public._oux_hygiene_log
WHERE script='01_role_conversion' AND rolled_back_at IS NULL;

-- Expected: user/organiser 8 (the 7 converted + the 1 pre-existing), admin 4 (2 lead_organiser, 1 coordinator,
-- 1 industrial_coordinator), user/industrial_officer 1
SELECT role, work_role, count(*) FROM public.user_profiles GROUP BY 1,2 ORDER BY 1,2;
```

### 3.4 Rollback (`01_rollback.sql`)

```sql
BEGIN;
WITH und AS (
  UPDATE public.user_profiles p
     SET role = (l.before_row->>'role')
    FROM public._oux_hygiene_log l
   WHERE l.script = '01_role_conversion'
     AND l.action = 'update'
     AND l.rolled_back_at IS NULL
     AND p.user_id = (l.row_pk->>'user_id')::uuid
  RETURNING l.log_id
)
UPDATE public._oux_hygiene_log SET rolled_back_at = now()
WHERE log_id IN (SELECT log_id FROM und);
COMMIT;

-- Expected after rollback: 7
SELECT count(*) FROM public.user_profiles WHERE role='admin' AND work_role='organiser';
```

`rolled_back_at` makes the rollback idempotent and lets 01 be run forward again afterwards. `updated_at` is not
restored (the `trg_user_profiles_updated_at` trigger at `baseline_schema.sql:22641` bumps it on both passes); that is
metadata only and is called out in the README.

### 3.5 What a converted account loses, and the sequencing recommendation

Because `admin ≡ user` for INSERT and UPDATE at the database level (appendix D 5.7; baseline `:25959, :26007, :26003,
:26015, :26331, :26375, :26371, :26383`), the conversion costs nothing for creating or editing. It costs two things.

**a. Deletes, until WP1.6 lands (appendix C 6.2, confirmed against the baseline policies listed in 1.4):**

| Operation the seven do today | Table | After conversion |
|---|---|---|
| Delete a unit (`wall-chart/delete-organising-unit-dialog.tsx`) | `campaign_organising_units` `:25553` | silently no-ops (PostgREST returns success, 0 rows) |
| Remove a worker from a unit; **move a worker between units** (a move deletes the source row, `move-worker-mutation.ts`) | `campaign_worker_ou` `:25585` | silently no-ops |
| Remove a worker from a campaign (`useRemoveWorkerFromCampaign.ts`) | `campaign_worker_membership` `:25581` | silently no-ops |
| Unlink a leader/follower | `campaign_leader_worker_links` `:25549` | silently no-ops |
| Delete a campaign | `campaigns` `:25593` direct DELETE | no-ops — **but** the `delete_campaign()` RPC (SECURITY DEFINER, `is_admin() OR is_lead_organiser_for_campaign()`) still works for a campaign where the account is `campaign_role='lead'`, which script 02 gives them |

Appendix C 6.2 records the symptom precisely: "PostgREST returns success with 0 rows (the exact symptom recorded for
`campaign_unit_rules` in `M:20260701110000:1-10`)". Silent failure on everyday work — delete a unit, move a worker — is
the worst available failure mode, which drives the recommendation below.

**b. Admin surfaces, permanently — this is the point of decision 2, not a regression** (appendix D 5.4, 5.5, 5.6):
the three admin sidebar links and the Administration page (`administration/page.tsx:2457-2470`); every `/api/admin/*`
route (invite/update/delete user, set password, settings, rate limits, SMS status, AI cache, manual archive, refresh
gate criteria); employer merge in Overview → Employers; the worksite-detail admin control; Upcoming Projects
refresh/rematch and the admin branches of the match-review panel; the email-wrapper editor; and
`resolveCampaignOrganiser` (`src/lib/campaign/resolve-campaign-organiser.ts:43,80`), which stops a non-admin assigning
a campaign or task list to **another** user's organiser. That last one is exactly decision 8 ("Admins **and** lead
organisers may assign other organisers"), and decision 8's note — a `user` must be able to create a campaign with
**themselves** assigned — is already satisfied by `resolveCampaignOrganiser`, which permits self-assignment. WP1.6
widens the check to `lead_organiser`. WP1.6 does not restore the Administration page, and should not.

**Recommendation (operator decision, question 1 in section 9): run 00, 02 and 03 now; run 01 after WP1.6 is on
production.** Reasons: 02 and 03 are pure data hygiene with no effect on anyone's permissions, and 02 unblocks WP1.3
("Depends on WP1.1, WP0.4 backfill", `IMPLEMENTATION_ORCHESTRATION_PROMPT.md:128`); 01 is the only script that changes
what a human can do, its cost is silent failure on daily work, and WP1.6 — which moves exactly these delete policies to
`can_write_to_campaign()` (`:132`) — removes that cost entirely. Deferring 01 costs nothing: the seven keep working as
they do today, and phase 0 exit is "merged **or handed over**" (`:120`), which a prepared, rehearsed, operator-queued
script satisfies.

**If the operator wants 01 sooner** (for example to make the role-coverage testing in WP1.6 realistic), the interim
loss is acceptable but must be announced: for the window between running 01 and WP1.6 reaching production, the seven
organisers cannot delete a unit, remove a worker from a unit or a campaign, unlink a leader, or move a worker between
units, and the UI will not tell them so. Escalation path in that window: the two lead organisers, the coordinator and
the industrial coordinator, who remain `admin`. Script 02 **must** have run first either way (3.6).

### 3.6 Run order

Run order is **00 → 02 → 03 → 01**, even though the file numbering is 00/01/02/03 as specified. 02 must precede 01
because the `campaign_organisers` rows it writes are what keep the seven's campaign-level write access after
conversion: `is_lead_organiser_for_campaign()` arm 1 (`baseline_schema.sql:3714-3722`) requires
`work_role IN ('lead_organiser','coordinator','industrial_coordinator')` and so stops firing for them, while arm 2
(`:3724-3732`, `campaign_role='lead'`) and `is_assigned_to_campaign()` (`:3665-3671`, any roster row) start firing.
Running 01 last also keeps the permission window as short as possible. The README states this in the first paragraph
and each script's header repeats it.

---

## 4. Script 02 — backfill `campaign_organisers`

### 4.1 Scope of the backfill

Every campaign with `organiser_id IS NOT NULL` that is **not** an SMS episode and **not** the standing campaign, and
that has no existing roster row for that organiser.

- `is_sms_episode = false`: episodes are hidden per-episode containers excluded from every list surface
  (`visible-campaigns.ts:12-17`; baseline comment `:9714`). A roster row on one would put a hidden container on an
  organiser's "My campaigns".
- `is_standing = false`: `can_write_to_campaign()` already grants write on the standing campaign to any authenticated
  user (baseline comment `:9710`), so a roster row adds no access, and the shared "OA Membership Outreach" container
  should not appear as one organiser's campaign (appendix C 1.1).

`campaign_role = 'lead'`, not the table default `'organiser'` (`baseline_schema.sql:9474`). Justification:
`campaigns.organiser_id` is documented as "the single 'primary lead'" (appendix C 1.1 / 1.3); `'lead'` is a valid value
in both the CHECK (`:9477`) and the API's `validRoles` (`route.ts:62,111`); and only `'lead'` triggers
`is_lead_organiser_for_campaign()` arm 2 (`:3724-3732`), which is what preserves for the converted accounts the
`delete_campaign()` and permission-approval capabilities they hold today as admins. Choosing `'organiser'` instead
would grant `is_assigned_to_campaign()` only and would quietly downgrade them.

Not an escalation: the six organisers who own campaigns are, per G.6, among the seven admins plus (possibly) others;
each gains lead rights only on campaigns where they are already the named `organiser_id`, which they can already do
today as `admin`. The one `user`/`organiser` account has no linked organiser record (G.6, "Linked to organiser record:
0"), so it gains nothing.

### 4.2 Pre-check

```sql
-- Diagnostic: how the 22 campaigns break down. Expected (G.1, G.3): total 22, sms_episodes 0, standing 1,
-- with_organiser 21 (appendix G.6: 7+6+4+2+1+1, plus 1 unassigned).
SELECT count(*)                                                        AS campaigns_total,
       count(*) FILTER (WHERE is_sms_episode)                          AS sms_episodes,
       count(*) FILTER (WHERE is_standing)                             AS standing,
       count(*) FILTER (WHERE organiser_id IS NOT NULL)                AS with_organiser,
       count(*) FILTER (WHERE organiser_id IS NOT NULL
                          AND is_standing AND NOT is_sms_episode)      AS standing_with_organiser
FROM public.campaigns;

-- THE number the change must produce. Expected 21 if the standing campaign is the unassigned one,
-- 20 if the standing campaign carries an organiser_id (see open question 2). Do not assume: record the value.
SELECT count(*) AS expected_inserts
FROM public.campaigns c
WHERE c.organiser_id IS NOT NULL
  AND c.is_sms_episode = false
  AND c.is_standing    = false
  AND NOT EXISTS (SELECT 1 FROM public.campaign_organisers co
                   WHERE co.campaign_id = c.campaign_id AND co.organiser_id = c.organiser_id);

-- Expected (G.1): 0 rows in the table today.
SELECT count(*) AS campaign_organisers_before FROM public.campaign_organisers;

-- Expected: 0 rows. Any campaign that already has a 'lead' other than campaigns.organiser_id
-- must be looked at by hand before running the change.
SELECT co.campaign_id, co.organiser_id, c.organiser_id AS campaign_organiser_id
FROM public.campaign_organisers co JOIN public.campaigns c USING (campaign_id)
WHERE co.campaign_role = 'lead' AND co.organiser_id IS DISTINCT FROM c.organiser_id;

-- Expected: 0 rows. campaigns.organiser_id pointing at an organiser that no longer exists would break the FK.
SELECT c.campaign_id FROM public.campaigns c
LEFT JOIN public.organisers o ON o.organiser_id = c.organiser_id
WHERE c.organiser_id IS NOT NULL AND o.organiser_id IS NULL;
```

### 4.3 Change

```sql
BEGIN;
WITH ins AS (
  INSERT INTO public.campaign_organisers (campaign_id, organiser_id, campaign_role, reports_to_organiser_id)
  SELECT c.campaign_id, c.organiser_id, 'lead', NULL
  FROM public.campaigns c
  WHERE c.organiser_id IS NOT NULL
    AND c.is_sms_episode = false
    AND c.is_standing    = false
  ON CONFLICT (campaign_id, organiser_id) DO NOTHING
  RETURNING id, campaign_id, organiser_id, campaign_role, added_at
)
INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
SELECT '02_backfill_campaign_organisers', 'insert', 'public.campaign_organisers',
       jsonb_build_object('id', id),
       NULL,
       jsonb_build_object('campaign_id', campaign_id, 'organiser_id', organiser_id,
                          'campaign_role', campaign_role, 'added_at', added_at),
       'backfilled from campaigns.organiser_id'
FROM ins;
COMMIT;
```

`ON CONFLICT (campaign_id, organiser_id) DO NOTHING` uses the UNIQUE constraint at `:19026`; re-running inserts and
logs 0 rows. `reports_to_organiser_id` is left NULL — the lead hierarchy is `user_profiles.reports_to` (appendix D 6)
and inventing a per-campaign one here would be scope creep.

### 4.4 Post-check

```sql
-- Expected: 0
SELECT count(*) AS still_missing
FROM public.campaigns c
WHERE c.organiser_id IS NOT NULL AND c.is_sms_episode = false AND c.is_standing = false
  AND NOT EXISTS (SELECT 1 FROM public.campaign_organisers co
                   WHERE co.campaign_id = c.campaign_id AND co.organiser_id = c.organiser_id);

-- Expected: equals the pre-check expected_inserts (21 on production, subject to open question 2)
SELECT count(*) AS campaign_organisers_after FROM public.campaign_organisers;
SELECT count(*) AS logged FROM public._oux_hygiene_log
WHERE script='02_backfill_campaign_organisers' AND rolled_back_at IS NULL;

-- INVARIANT: at most one 'lead' per campaign. Expected: 0 rows.
SELECT campaign_id, count(*) FROM public.campaign_organisers
WHERE campaign_role='lead' GROUP BY 1 HAVING count(*) > 1;

-- INVARIANT: every roster row's organiser matches campaigns.organiser_id. Expected: 0 rows.
SELECT co.campaign_id FROM public.campaign_organisers co
JOIN public.campaigns c USING (campaign_id)
WHERE co.organiser_id IS DISTINCT FROM c.organiser_id;

-- Distribution, for the WP1.3 "My campaigns" baseline. Expected: 6 organisers with 7,6,4,2,1,1 campaigns.
SELECT organiser_id, count(*) FROM public.campaign_organisers GROUP BY 1 ORDER BY 2 DESC;
```

### 4.5 Rollback (`02_rollback.sql`)

```sql
BEGIN;
WITH del AS (
  DELETE FROM public.campaign_organisers co
  USING public._oux_hygiene_log l
  WHERE l.script = '02_backfill_campaign_organisers'
    AND l.action = 'insert'
    AND l.rolled_back_at IS NULL
    AND co.id = (l.row_pk->>'id')::int
    -- only remove rows still exactly as inserted; anything edited since is left alone
    AND co.campaign_id   = (l.after_row->>'campaign_id')::int
    AND co.organiser_id  = (l.after_row->>'organiser_id')::int
    AND co.campaign_role = (l.after_row->>'campaign_role')
  RETURNING l.log_id
)
UPDATE public._oux_hygiene_log SET rolled_back_at = now() WHERE log_id IN (SELECT log_id FROM del);
COMMIT;

-- Expected after rollback: 0
SELECT count(*) FROM public.campaign_organisers;
-- Expected: 0 rows. Any row here was edited after the backfill and was deliberately not removed.
SELECT log_id, row_pk FROM public._oux_hygiene_log
WHERE script='02_backfill_campaign_organisers' AND rolled_back_at IS NULL;
```

---

## 5. Script 03 — resolve duplicate unit placements (H1 and H3)

### 5.1 What counts as a duplicate

Straight from appendix C 8.4, unchanged:

- **H1** — the same worker in more than one unit of the same **group**: partition
  `(campaign_id, ou_group_id, worker_id)` over rows whose unit has `ou_group_id IS NOT NULL`. (Partitioning by
  `ou_group_id` alone is sufficient: a group and its members share one `ou_type` — appendix C 0.)
- **H3** — the same worker in more than one **standalone** unit of the same `ou_type`: partition
  `(campaign_id, ou_type, worker_id)` over rows whose unit has `ou_group_id IS NULL AND parent_ou_id IS NULL`.

The two sets are disjoint by construction, so no row is considered twice. Rows whose unit has
`ou_group_id IS NULL AND parent_ou_id IS NOT NULL` — level-2 sub-units, which appendix C 3.2 item 3 notes sit outside
the group rules — are in **neither** hazard query and are **not touched**. H2 (parent + sub-unit roll-up rows) is 0 on
production (G.5) and is out of scope regardless: it is the "roll-up model" the current design relies on
(appendix C 0).

**Keeper rule:** within each partition, keep `ORDER BY is_primary DESC, created_at DESC, id DESC` and delete the rest.
`is_primary` first per the work package; `created_at DESC` = "latest"; `id DESC` only as a deterministic tiebreak for
identical timestamps. H7 = 0 on production (G.5), so no partition contains two primaries and the primary is always the
keeper.

### 5.2 Pre-check

```sql
-- H1 and H3 verbatim from appendix C 8.4, wrapped in count(*). Expected: 2 and 5.
SELECT count(*) AS h1_pairs FROM (
  SELECT cou.campaign_id, cou.ou_group_id, cwo.worker_id
  FROM campaign_worker_ou cwo JOIN campaign_organising_units cou ON cou.ou_id = cwo.ou_id
  WHERE cou.ou_group_id IS NOT NULL
  GROUP BY 1,2,3 HAVING COUNT(*) > 1) x;

SELECT count(*) AS h3_pairs FROM (
  SELECT cou.campaign_id, cou.ou_type, cwo.worker_id
  FROM campaign_worker_ou cwo JOIN campaign_organising_units cou ON cou.ou_id = cwo.ou_id
  WHERE cou.ou_group_id IS NULL AND cou.parent_ou_id IS NULL
  GROUP BY 1,2,3 HAVING COUNT(*) > 1) x;

-- Rows that will actually be deleted, broken down. This is the number to record; do NOT assume it is 7.
-- G.5 counts 2 + 5 = 7 offending worker/dimension PAIRS, and G.3's "Same-type dupes" column
-- (campaign 57 = 2, 64 = 3, 42 = 2) agrees. If every pair has exactly two placements the excess is 7 rows;
-- a pair with three placements makes it more. The post-checks, not this number, are the authority.
WITH keyed AS (
  SELECT cwo.id, cwo.worker_id, cwo.is_primary, cwo.assignment_source, cwo.created_at,
         cou.campaign_id,
         CASE WHEN cou.ou_group_id IS NOT NULL THEN 'H1' ELSE 'H3' END AS hazard,
         CASE WHEN cou.ou_group_id IS NOT NULL THEN 'group:'||cou.ou_group_id::text
              ELSE 'type:'||cou.ou_type END AS dim_key
  FROM campaign_worker_ou cwo JOIN campaign_organising_units cou ON cou.ou_id = cwo.ou_id
  WHERE cou.ou_group_id IS NOT NULL
     OR (cou.ou_group_id IS NULL AND cou.parent_ou_id IS NULL)
), ranked AS (
  SELECT k.*, row_number() OVER (PARTITION BY k.campaign_id, k.dim_key, k.worker_id
                                 ORDER BY k.is_primary DESC, k.created_at DESC, k.id DESC) AS rn
  FROM keyed k
)
SELECT hazard, campaign_id, assignment_source, count(*) AS rows_to_delete
FROM ranked WHERE rn > 1 GROUP BY 1,2,3 ORDER BY 1,2,3;

-- Baselines to compare after. Expected (G.1): 2670 and 1614.
SELECT count(*) AS membership_before FROM public.campaign_worker_membership;
SELECT count(*) AS worker_ou_before  FROM public.campaign_worker_ou;

-- Per-campaign "members in at least one unit" (G.3: 57->303, 64->267, 42->202). Must be identical afterwards.
SELECT cou.campaign_id, count(DISTINCT cwo.worker_id) AS members_in_a_unit
FROM campaign_worker_ou cwo JOIN campaign_organising_units cou ON cou.ou_id = cwo.ou_id
GROUP BY 1 ORDER BY 1;
```

**If any `rows_to_delete` has `assignment_source = 'rule'`, stop and tell the orchestrator.** Rule-sourced rows are
regenerated client-side: `recomputeOuAssignments` deletes every `assignment_source='rule'` row in the campaign and
reinserts from the rules (appendix C 3.4, `src/lib/campaign/recompute-ou-assignments.ts:158-362`), so a duplicate the
script deletes would come back the next time someone opens the units section. Production has 194 rule rows and 2 rules
(G.1, G.4), so the overlap may well be zero — but the pre-check must prove it rather than hope. If it is non-zero, the
underlying rule needs fixing in phase 2 and those rows are excluded from this script.

### 5.3 Change

```sql
BEGIN;
WITH keyed AS (
  SELECT cwo.id, cwo.ou_id, cwo.worker_id, cwo.is_primary, cwo.assignment_source,
         cwo.assigned_rule_id, cwo.created_at, cou.campaign_id,
         CASE WHEN cou.ou_group_id IS NOT NULL THEN 'H1' ELSE 'H3' END AS hazard,
         CASE WHEN cou.ou_group_id IS NOT NULL THEN 'group:'||cou.ou_group_id::text
              ELSE 'type:'||cou.ou_type END AS dim_key
  FROM public.campaign_worker_ou cwo
  JOIN public.campaign_organising_units cou ON cou.ou_id = cwo.ou_id
  WHERE cou.ou_group_id IS NOT NULL
     OR (cou.ou_group_id IS NULL AND cou.parent_ou_id IS NULL)
), ranked AS (
  SELECT k.*, row_number() OVER (PARTITION BY k.campaign_id, k.dim_key, k.worker_id
                                 ORDER BY k.is_primary DESC, k.created_at DESC, k.id DESC) AS rn
  FROM keyed k
), losers AS (
  SELECT * FROM ranked WHERE rn > 1
), del AS (
  DELETE FROM public.campaign_worker_ou cwo
  USING losers l
  WHERE cwo.id = l.id
  RETURNING l.id            AS del_id,
            l.ou_id         AS del_ou_id,
            l.worker_id     AS del_worker_id,
            l.is_primary    AS del_is_primary,
            l.assignment_source AS del_assignment_source,
            l.assigned_rule_id  AS del_assigned_rule_id,
            l.created_at    AS del_created_at,
            l.campaign_id   AS del_campaign_id,
            l.hazard        AS del_hazard,
            l.dim_key       AS del_dim_key
)
INSERT INTO public._oux_hygiene_log (script, action, table_name, row_pk, before_row, after_row, note)
SELECT '03_resolve_duplicate_placements', 'delete', 'public.campaign_worker_ou',
       jsonb_build_object('id', del_id),
       jsonb_build_object('id', del_id, 'ou_id', del_ou_id, 'worker_id', del_worker_id,
                          'is_primary', del_is_primary, 'assignment_source', del_assignment_source,
                          'assigned_rule_id', del_assigned_rule_id, 'created_at', del_created_at),
       NULL,
       del_hazard||' duplicate: campaign '||del_campaign_id||' '||del_dim_key
FROM del;
COMMIT;
```

Every column the work package asks for is logged — `ou_id`, `worker_id`, `is_primary`, `assignment_source`,
`assigned_rule_id`, `created_at` — plus the original `id`, so the rollback restores the row byte-for-byte. Re-running
after a successful run deletes and logs 0 rows (the duplicates are gone): idempotent.

### 5.4 Post-check

```sql
-- H1, H3, H7, H5 verbatim from appendix C 8.4. Expected: 0, 0, 0, 0.
--   (H7 was already 0 and cannot be created by deleting rows; H5 likewise.)
... the same three count(*)-wrapped queries as 5.2, plus H5 and H7 ...

-- INVARIANT: membership untouched. Expected: identical to membership_before (2670).
SELECT count(*) AS membership_after FROM public.campaign_worker_membership;

-- INVARIANT: exactly the logged rows were removed. Expected: worker_ou_before - logged
SELECT count(*) AS worker_ou_after FROM public.campaign_worker_ou;
SELECT count(*) AS logged FROM public._oux_hygiene_log
WHERE script='03_resolve_duplicate_placements' AND rolled_back_at IS NULL;

-- INVARIANT: no worker lost their only placement. Expected: identical per-campaign numbers to the pre-check
-- (57 -> 303, 64 -> 267, 42 -> 202, everything else unchanged).
SELECT cou.campaign_id, count(DISTINCT cwo.worker_id) AS members_in_a_unit
FROM campaign_worker_ou cwo JOIN campaign_organising_units cou ON cou.ou_id = cwo.ou_id
GROUP BY 1 ORDER BY 1;

-- INVARIANT: every logged worker still has a placement in the dimension they were de-duplicated in.
-- Expected: 0 rows.
SELECT l.log_id, l.before_row->>'worker_id' AS worker_id, l.note
FROM public._oux_hygiene_log l
WHERE l.script='03_resolve_duplicate_placements' AND l.rolled_back_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM campaign_worker_ou cwo JOIN campaign_organising_units cou ON cou.ou_id = cwo.ou_id
    WHERE cwo.worker_id = (l.before_row->>'worker_id')::int
      AND cou.campaign_id = (SELECT campaign_id FROM campaign_organising_units
                             WHERE ou_id = (l.before_row->>'ou_id')::int));
```

### 5.5 Rollback (`03_rollback.sql`)

```sql
BEGIN;
WITH src AS (
  SELECT log_id, (row_pk->>'id')::int AS id, before_row
  FROM public._oux_hygiene_log
  WHERE script='03_resolve_duplicate_placements' AND action='delete' AND rolled_back_at IS NULL
), ins AS (
  INSERT INTO public.campaign_worker_ou
    (id, ou_id, worker_id, is_primary, created_at, assignment_source, assigned_rule_id)
  SELECT s.id,
         (s.before_row->>'ou_id')::int,
         (s.before_row->>'worker_id')::int,
         (s.before_row->>'is_primary')::boolean,
         (s.before_row->>'created_at')::timestamptz,
         (s.before_row->>'assignment_source'),
         nullif(s.before_row->>'assigned_rule_id','')::int
  FROM src s
  ON CONFLICT (id) DO NOTHING
  RETURNING id
)
UPDATE public._oux_hygiene_log l SET rolled_back_at = now()
WHERE l.log_id IN (SELECT log_id FROM src WHERE id IN (SELECT id FROM ins));
COMMIT;

-- Expected after rollback: h1_pairs = 2, h3_pairs = 5, worker_ou count back to worker_ou_before
```

**The re-insert passes both BEFORE triggers** (`baseline_schema.sql:22417, :22421`), and this is not luck:

- `check_no_worker_on_group_container()` (`:1083-1103`) rejects worker rows on a container. These rows existed, and
  G.2 confirms "No worker rows point at a container", so none of them targets one.
- `check_worker_ou_group_exclusivity()` (`:1209-1248`) returns immediately when the target unit's `ou_group_id` IS
  NULL — that covers every **H3** row. For **H1** rows the target unit has a group, but the retained keeper is in the
  **same** group, and the trigger raises only for a *different* non-null `ou_group_id` of the same `ou_type`; as
  appendix C 3.3 puts it, it "does **not** prevent multiple units within the same group". So the exact state that
  existed before the delete is re-creatable.

Restoring the original `id` values is safe: they were already consumed from
`campaign_worker_ou_id_seq`, so re-inserting them cannot collide with future inserts and the sequence needs no
`setval`. **Caveat, stated in the README:** the rollback must run before anyone else changes the affected workers'
placements. If someone has since put one of those workers into a different group of the same `ou_type`, the trigger
will reject that one row and the transaction aborts with nothing restored; the log still holds every column needed to
restore by hand.

---

## 6. Rehearsal on dev — what exists now, what waits for the re-seed

Dev is `dpnnmkhabysfdogllsyh`. Production (`gteygwfgjvczanmrwgbr`) is not touched, not even read, by anyone but the
operator. `docs/DEV_PROD_ENVIRONMENT.md` records that dev has the full prod schema, reference data **and the 11 auth
logins**, but "All campaign data was stripped: campaigns, campaign plans/tasks, assessments…".

### 6.1 Read-only state check the verifier runs on dev first

```sql
-- Script 01's material. Expect a non-zero admin/organiser count; it need not equal 7,
-- because dev copied the 11 auth logins whereas production has 13 user_profiles rows (G.1, G.6).
SELECT role, work_role, count(*) FROM public.user_profiles GROUP BY 1,2 ORDER BY 1,2;
SELECT count(*) AS dev_admin_organisers FROM public.user_profiles WHERE role='admin' AND work_role='organiser';

-- Scripts 02 and 03's material. Expect 0 / 0 / 0 / 0 until the re-seed.
SELECT count(*) AS campaigns, count(*) FILTER (WHERE organiser_id IS NOT NULL) AS with_organiser
FROM public.campaigns;
SELECT count(*) AS campaign_organisers FROM public.campaign_organisers;
SELECT count(*) AS worker_ou FROM public.campaign_worker_ou;
SELECT count(*) AS membership FROM public.campaign_worker_membership;
```

### 6.2 Evidence the verifier can produce **now**

1. `00_create_hygiene_log.sql` on dev; re-run it; both succeed (idempotent); `REVOKE`/RLS confirmed with
   `SELECT relrowsecurity FROM pg_class WHERE relname='_oux_hygiene_log';` → `t`, and
   `SELECT has_table_privilege('authenticated','public._oux_hygiene_log','SELECT');` → `f`.
2. **Full round trip of script 01 on dev**, which is the one script whose material exists there:
   pre-check → forward (N rows updated, N rows logged) → post-check (0 remaining `admin`+`organiser`) → forward again
   (0 rows, proving idempotency) → `01_rollback.sql` → the role/work_role distribution is byte-identical to the
   pre-check, and every log row has `rolled_back_at` set. Dev is left exactly as found.
3. `02` and `03` on dev run to completion against empty inputs: 0 inserts, 0 deletes, 0 log rows, and every post-check
   returns 0. That is real evidence of **syntactic and semantic validity** — the CTEs compile, the column names,
   casts, conflict targets and trigger interactions are all exercised by the planner — but it is **not** evidence of
   the counts.
4. `90_verify_all.sql` runs clean on dev and returns the H1/H3/H5/H6/H7 zero-row results.

### 6.3 Evidence that waits for the dev re-seed

The count-based acceptance ("their verification queries return the expected counts") for scripts 02 and 03 cannot be
produced until the operator re-seeds dev from a production snapshot — already listed in `DECISIONS.md` under "Operator
inputs the work packages also need", needed by "WP2.1, WP0.4 rehearsal". After the re-seed the verifier repeats 02 and
03 with their pre-checks, post-checks and rollbacks and pastes the raw output into `wp/wp0.4.md` section 5. Until then
the ledger row reads **verifying (partial: 01 rehearsed; 02/03 await dev re-seed)** and WP0.4 does not claim its
acceptance criterion.

Connection: `psql "$SUPABASE_DEV_DB_URL"` with `\set ON_ERROR_STOP on`, or the Supabase SQL editor for
`dpnnmkhabysfdogllsyh`. Never `supabase db push` — these are not migrations.

---

## 7. How the operator runs it on production

The orchestrator, the implementer and the verifier never run any of this against `gteygwfgjvczanmrwgbr`. `README.md`
in the script folder says, in this order:

1. Take a backup / note the point-in-time-recovery timestamp before starting. The scripts have rollbacks; PITR is the
   backstop if the log table is lost.
2. Connect as `postgres`: Supabase SQL editor for project `gteygwfgjvczanmrwgbr`, or
   `psql "postgresql://postgres:…@db.gteygwfgjvczanmrwgbr.supabase.co:5432/postgres" -v ON_ERROR_STOP=1`. RLS does not
   apply to this role, so the delete policies discussed in 3.5 do not obstruct the scripts themselves.
3. Run `90_verify_all.sql` first and paste the output into `docs/organiser-ux-review/wp/wp0.4.md` §5 as the "before"
   snapshot.
4. Run, in this order, pasting each script's pre-check and post-check output into the same file as you go:
   **`00_create_hygiene_log.sql` → `02_backfill_campaign_organisers.sql` → `03_resolve_duplicate_placements.sql` →
   `01_role_conversion.sql`** (see 3.6 for why 02 precedes 01, and 3.5 for why 01 may be deferred to a later sitting
   after WP1.6 reaches production).
   Run one file at a time. If any pre-check disagrees with its expected value, stop and report before running the
   change.
5. Run `90_verify_all.sql` again and paste the "after" snapshot.
6. If anything is wrong, run the matching `<nn>_rollback.sql` (in reverse order if more than one), then
   `90_verify_all.sql` again.
7. Tick the "Run WP0.4 scripts on production" row in `PROGRESS.md` → "Human tasks" and record the date.
8. Leave `_oux_hygiene_log` in place; run `99_drop_hygiene_log.sql` only per the retention rule in 2.3.

---

## 8. Tests, verification commands and expected values

### 8.1 There are no unit tests, and why

WP0.4 adds no TypeScript: no pure function, no component, no API route. There is nothing for vitest to import — the
existing pattern (`src/lib/**/__tests__`) has no hook for a `.sql` file, and a fake in-memory Postgres would test the
fake. **The pre-check and post-check queries in each script are the test**, and the acceptance criterion is stated in
those terms by the work package itself ("their verification queries return the expected counts"). `90_verify_all.sql`
is the whole suite in one read-only file, so the same assertions can be run before, after and at any later date.

### 8.2 Expected values

| # | Assertion | Query location | Expected (production) | Source |
|---|---|---|---|---|
| 1 | `user_profiles` with `role='admin' AND work_role='organiser'` before 01 | 01 pre-check | **7** | G.6 |
| 2 | Same, after 01 | 01 post-check | **0** | — |
| 3 | Log rows for `01_role_conversion` | 01 post-check | **7** | = #1 |
| 4 | Accounts still `admin` after 01 | 01 post-check | **4** (2 `lead_organiser`, 1 `coordinator`, 1 `industrial_coordinator`) | G.6, decision 2 |
| 5 | `user` + `organiser` accounts after 01 | 01 post-check | **8** (7 converted + 1 existing) | G.6 |
| 6 | Same, after `01_rollback.sql` | rollback check | back to **7** admin/organiser | — |
| 7 | `campaign_organisers` rows before 02 | 02 pre-check | **0** | G.1 |
| 8 | Campaigns needing a roster row | 02 pre-check | **21** (7+6+4+2+1+1); **20** if the standing campaign carries an `organiser_id` — computed, not assumed | G.6, open question 2 |
| 9 | `campaign_organisers` rows after 02 | 02 post-check | **= #8** | — |
| 10 | Campaigns still missing a roster row | 02 post-check | **0** | — |
| 11 | Campaigns with >1 `campaign_role='lead'` | 02 post-check | **0 rows** | invariant |
| 12 | Roster rows disagreeing with `campaigns.organiser_id` | 02 post-check | **0 rows** | invariant |
| 13 | Campaigns per organiser after 02 | 02 post-check | 6 organisers: **7, 6, 4, 2, 1, 1** | G.6 |
| 14 | `campaign_organisers` after `02_rollback.sql` | rollback check | **0** | — |
| 15 | H1 pairs before 03 | 03 pre-check | **2** | G.5 |
| 16 | H3 pairs before 03 | 03 pre-check | **5** | G.5 |
| 17 | Rows to delete | 03 pre-check | **7** if every pair has exactly two placements; recorded, not assumed (G.3 "Same-type dupes": 57→2, 64→3, 42→2 = 7) | G.3, G.5 |
| 18 | Rows to delete with `assignment_source='rule'` | 03 pre-check | **0** — non-zero stops the run (5.2) | C 3.4 |
| 19 | `campaign_worker_ou` before 03 | 03 pre-check | **1,614** | G.1 |
| 20 | `campaign_worker_ou` after 03 | 03 post-check | **1,614 − #17** (1,607 if #17 = 7) | — |
| 21 | H1 after 03 | 03 post-check | **0** | acceptance |
| 22 | H3 after 03 | 03 post-check | **0** | acceptance |
| 23 | H7 after 03 | 03 post-check | **0** (was 0; unchanged) | G.5 |
| 24 | H5 after 03 | 03 post-check | **0** (was 0; unchanged) | G.5 |
| 25 | `campaign_worker_membership` before and after 03 | 03 pre/post | **2,670 both times** — the headline invariant | G.1 |
| 26 | Members in ≥1 unit, per campaign, before and after 03 | 03 pre/post | identical lists; 57→**303**, 64→**267**, 42→**202** | G.3 |
| 27 | Logged workers with no remaining placement in that campaign | 03 post-check | **0 rows** | invariant |
| 28 | `campaign_worker_ou` after `03_rollback.sql` | rollback check | back to **1,614**, H1 = 2, H3 = 5 | — |
| 29 | H6 (members with no unit) | 90_verify_all | **1,162** before and after — 03 must not change it | G.5, G.4 |

### 8.3 Repo commands (they prove the branch is clean, not the data)

From `apps/organising-db`:

```bash
pnpm lint      # no TS changed; must stay green
pnpm test      # no TS changed; must stay green
pnpm build     # no TS changed; must stay green
```

From the repo root:

```bash
pnpm validate:migrations   # must stay green: proves nothing was added under supabase/migrations/
```

The acceptance criterion itself is proven by section 6.2 (dev round trip of 00 and 01, plus 02/03 executing cleanly)
and, after the dev re-seed, by section 6.3 — with the raw output pasted into
`docs/organiser-ux-review/wp/wp0.4.md` §5.

### 8.4 Risks and the rules they could break

| Risk | Mitigation |
|---|---|
| A script is mistaken for a migration and pushed with `supabase db push` | Files live under `scripts/data-hygiene/`, never `supabase/migrations/`; `pnpm validate:migrations` in CI; the README's first line says so; 2.2 records the reasoning |
| 01 runs before 02 and the seven lose campaign-level write in the gap | Run order fixed at 00 → 02 → 03 → 01 in the README and in every script header (3.6) |
| 01 leaves the seven unable to delete units / move workers, silently | 3.5: recommend running 01 only after WP1.6 is on production; if not, announce the window and the escalation path |
| `_oux_hygiene_log` is world-readable (it holds `user_id`s) | 00 revokes from `anon`/`authenticated` and enables RLS with no policies — required because `ALTER DEFAULT PRIVILEGES` grants ALL on new public tables (`baseline_schema.sql:33393-33396`) |
| `_oux_hygiene_log` shows up as a new Supabase security advisory | RLS enabled (contrast the four RLS-disabled `_archive_*` tables in G.7) |
| The log is dropped and a rollback is then needed | 99 is a separate file with a retention rule (2.3); the table comment repeats it; PITR is the backstop (7.1) |
| 03 deletes a rule-generated row that `recomputeOuAssignments` immediately recreates | Pre-check #18 breaks the deletions down by `assignment_source` and the run stops if any are `'rule'` (5.2, appendix C 3.4) |
| The rollback of 03 trips `check_worker_ou_group_exclusivity` | Argued impossible for an unchanged database (5.5) and the caveat for a changed one is documented; the log keeps every column for a manual restore |
| Deleting placements changes reported coverage | Invariants #25, #26, #27, #29 assert membership, per-campaign "in a unit" and H6 are all unchanged |
| 02 grants `campaign_role='lead'` more widely than intended | Only to the organiser already named in `campaigns.organiser_id`, who can already do all of it as `admin` today; invariants #11 and #12 assert one lead per campaign matching `campaigns.organiser_id` (4.1) |
| Expected counts are hard-coded and reality differs | Every count is computed by a pre-check; the expected value lives in a comment; a mismatch stops the run |
| Scripts hard-code user ids or emails | They do not: 01 selects on `role='admin' AND work_role='organiser'`, 02 on `campaigns.organiser_id`, 03 on the hazard predicates |
| Re-running a script double-applies it | 01 no-ops on the predicate; 02 uses `ON CONFLICT (campaign_id, organiser_id) DO NOTHING`; 03's duplicates no longer exist; every rollback is guarded by `rolled_back_at IS NULL` |
| A prod type regeneration picks up `_oux_hygiene_log` | Expected and harmless while it exists; regenerate after 99 (2.3). Never run `pnpm gen:types` without `SUPABASE_PROJECT_REF` (PROGRESS.md standing note) |

---

## 9. Out of scope

Tempted, deliberately excluded:

- **Changing any RLS policy.** Moving `campaigns`, `campaign_organising_units`, `campaign_worker_ou` and
  `campaign_worker_membership` deletes onto `can_write_to_campaign()` is WP1.6
  (`IMPLEMENTATION_ORCHESTRATION_PROMPT.md:132`) and is a migration, not a data script.
- **Fixing the UI that offers deletes which fail.** Also WP1.6.
- **Adding `isLeadOrganiser` to `auth-context.tsx` or widening `resolveCampaignOrganiser` to lead organisers.** WP1.6 /
  decision 8.
- **H2, H4, H6, H8.** H2 = 0 and is the roll-up model by design; H4 and H8 are inputs to the WP2.1 migration, not
  hygiene; H6 (1,162 members with no unit) is 44% of the data and is the *product problem* phase 2 solves, not a defect
  to delete.
- **Populating `campaign_edit_permissions`** (0 rows) or activating the dormant campaign-permission UI (appendix D
  5.7).
- **Setting `reports_to_organiser_id` on the backfilled roster rows**, or adding the two lead organisers to every
  campaign team. Decision 2 says name them as leads; where that is surfaced is WP1.3/WP1.6, and inventing a
  per-campaign hierarchy from `user_profiles.reports_to` here would pre-empt it.
- **Setting `is_primary` on the survivors** of a de-duplication that had no primary. H7 = 0 today and forcing a primary
  would be a product decision, not hygiene.
- **Touching the 20 group containers, `parent_ou_id`, or level-2 sub-units.** WP2.1's migration.
- **Fixing the four RLS-disabled `_archive_*` tables** from G.7 — real, but section 10 of the main report, not WP0.4.
- **Deleting the 34 draft `campaign_worker_lists`, the empty `campaign_universes`, or any other stale data.** Not in
  the work package.
- **A TypeScript runner, a `pnpm` script, or CI automation for these files.** They must be run deliberately by a human
  against production, once.

---

## 10. Open questions for the operator

1. **Sequencing of script 01 (blocking for the production run, not for the code).** Recommendation in 3.5: run 00, 02
   and 03 as soon as they are approved, and hold 01 until WP1.6 is on production, because between conversion and WP1.6
   the seven organisers cannot delete a unit, remove a worker from a unit or a campaign, unlink a leader, or move a
   worker between units, and those failures are silent. Confirm "hold 01", or accept the interim loss — in which case
   the seven must be told, with the two lead organisers and the coordinators as the escalation path.
2. **Does the standing campaign carry an `organiser_id`?** G.6 gives 21 campaigns with an organiser out of 22, and G.3
   lists campaign 49 as the standing one. Script 02 excludes standing campaigns (4.1), so the backfill inserts 21 rows
   if 49 is the unassigned campaign and 20 if it is not. The pre-check reports both numbers; the operator only needs to
   confirm which it was when pasting the output, and confirm that excluding the standing campaign is what they want
   (recommended: yes — `can_write_to_campaign()` already grants everyone write there).
3. **Dev re-seed timing.** Already registered in `DECISIONS.md` as an operator input; scripts 02 and 03 cannot produce
   count-based rehearsal evidence until it happens (6.3). Is it coming before or after WP2.1, so the ledger row can say
   so?

Assumptions taken without asking (state, do not block): the operator connects as `postgres` via the Supabase SQL
editor or `psql`, so RLS does not apply to the scripts; PITR is available as a backstop; `campaign_role='lead'` is the
right roster role for `campaigns.organiser_id` (justified in 4.1 from `route.ts:62,111` and
`is_lead_organiser_for_campaign` arm 2); and the log table lives in `public` with a leading underscore, matching the
existing `_archive_*` convention in that schema.

## 11. Orchestrator approval

**Approved 2026-09-08** as written. Orchestrator positions on section 10: (1) adopt the recommendation — run order 00 → 02 → 03 → 01, and **hold script 01 until WP1.6 is on production**; the README and every script header say so; the operator may override when running. (2) The pre-check settles the 20-vs-21 count; no operator answer needed before implementation. (3) Dev re-seed timing is an operator input; the ledger row will read "verifying (partial: 01 rehearsed; 02/03 await dev re-seed)" until then. Branch: `feat/oux-wp0.4-data-hygiene` (stacked on WP0.1 until PR #22 merges; PR base `develop`). One addition: the implementer must include the full post-check queries in `03_resolve_duplicate_placements.sql` (section 5.4 abbreviates them with "…"); nothing in the scripts may be elided.

## 12. Deviations from plan

All scripts implement sections 2-8 as written; the CHANGE statements are byte-for-byte the plan's. Departures, all
additive and read-only unless stated:

1. **Sequencing guard added to 01's pre-check.** Section 3.1 lists two pre-checks; the script adds a third,
   `campaign_organisers_rows_present` (expected > 0), so an operator who runs 01 before 02 is stopped by the
   pre-check rather than by memory of section 3.6. 01's post-check also adds `still_admin` (= 4), which is 8.2 #4.
2. **Pre-checks added to every rollback.** Sections 3.4, 4.5 and 5.5 give only the CHANGE and an after-count. Each
   `*_rollback.sql` now has the full 2.4 shape: a `pending_rollback` count; for 02 a "still exactly as inserted"
   count; for 03 two conflict probes (a logged `id` already present in `campaign_worker_ou`; a logged
   `(ou_id, worker_id)` already present under another id), each expected 0 rows, because either would make the
   re-insert skip or abort.
3. **00 and 99 are wrapped in `BEGIN`/`COMMIT` and carry PRE-/POST-CHECK sections.** Section 2.3 shows bare DDL.
   The post-check of 00 asserts `relrowsecurity = t`, `has_table_privilege` = f for `anon`/`authenticated` and
   `has_sequence_privilege` = f (the 6.2 item 1 checks, moved into the file). 00's comment also cites the
   sequence default privileges (`baseline_schema.sql:33373-33376`) alongside the table ones (`:33393-33396`),
   since the `REVOKE ... ON SEQUENCE` is there for that reason. 99's pre-check computes `days_since_last_run`
   for retention condition 3.
4. **90 evaluates the audit-log counts through a guard.** Section 7 step 3 runs 90 *before* 00, and 8.1 says it can
   run "at any later date" (i.e. after 99). A plain `SELECT` on `_oux_hygiene_log` would then abort the file under
   `ON_ERROR_STOP`, so section E of 90 evaluates #3, #27 and the 02/03 logged counts via
   `to_regclass('public._oux_hygiene_log')` + `query_to_xml()` (STABLE, so the `CASE` stays lazy) and returns
   NULL when the table is absent. The same counts appear as plain `SELECT`s in the 01/02/03 post-checks.
5. **H5 and H6 wrapping in 90.** "Wrapped in count(*)" is applied literally to H1, H3 and H7. H5 verbatim is already
   a `COUNT(*)`, so re-wrapping would always return 1; it is labelled, not wrapped. H6 verbatim returns one row
   per campaign, so `count(*)` alone would not yield the 1,162 of #29; it is wrapped as
   `count(*) AS h6_campaigns_with_unallocated, sum(count) AS h6_members_with_no_unit`, with the verbatim text
   unchanged inside the subquery.
6. **H1/H3 text.** 03's pre-/post-checks use the wrappers exactly as section 5.2 prints them (which drops the
   appendix's `COUNT(*) AS units` output column); 90 carries the appendix 8.4 text verbatim, alias included.
   Same predicate, same partition, same counts.
7. **No production identifier in the folder.** Section 7 step 2 prints the production host in the `psql` example;
   the README writes `<production postgres connection string>` instead, so nothing under `scripts/data-hygiene/`
   can be pointed at production by copy-paste. The dev ref is likewise not repeated (the plan's section 6 has it).
8. **Idempotency wording for 99.** `DROP TABLE IF EXISTS` is idempotent, but 99's pre-checks read the table and
   error if it is already gone; the header says so rather than claiming a clean re-run.

No schema discrepancy was found (see the confirmation table below). One line-number drift only:
`campaign_organisers_pkey` is the two-line statement at `:19031-19032` (plan cites `:19031`).

### Implementer notes

**Schema confirmed against `supabase/migrations/20260908050000_baseline_schema.sql` before writing:**

| Object the SQL relies on | Baseline lines | Confirmed |
|---|---|---|
| `user_profiles` (`user_id uuid`, `role varchar(10)` CHECK `admin/user/viewer`, `work_role varchar(30)` CHECK incl. `organiser`, `updated_at`) | `:9887-9900` | yes |
| `trg_user_profiles_updated_at` BEFORE UPDATE | `:22641` | yes |
| `campaign_organisers` (`id`, `campaign_id`, `organiser_id`, `campaign_role` DEFAULT `organiser` CHECK incl. `lead`, `reports_to_organiser_id`, `added_at`) | `:9470-9480` | yes |
| UNIQUE `(campaign_id, organiser_id)` = `campaign_organisers_campaign_id_organiser_id_key` (02's `ON CONFLICT` target) | `:19026-19027` | yes |
| `campaign_worker_ou` (`id`, `ou_id`, `worker_id`, `is_primary`, `created_at`, `assignment_source` CHECK `manual/rule`, `assigned_rule_id`) | `:9636-9645` | yes |
| `campaign_worker_ou` PK `(id)` (03_rollback's `ON CONFLICT` target), UNIQUE `(ou_id, worker_id)`, `id` default `nextval` | `:19167`, `:19162`, `:18106` | yes |
| `campaign_organising_units` (`ou_id`, `campaign_id`, `ou_type`, `parent_ou_id`, `is_group_container`, `ou_group_id`) | table DDL | yes |
| `campaign_worker_membership` (`membership_id`, `campaign_id`, `worker_id`), UNIQUE `(campaign_id, worker_id)` | `:7698-7704`, `:19152` | yes |
| `campaigns.organiser_id`, `is_standing`, `is_sms_episode` | `:9651-9683` | yes |
| `organisers` PK `(organiser_id)` (02 FK probe) | `:19507` | yes |
| `trg_check_no_worker_on_group_container`, `trg_check_worker_ou_group_exclusivity` BEFORE INSERT OR UPDATE OF `ou_id`; bodies return early on `ou_group_id IS NULL` and raise only for a *different* non-null group of the same type | `:22417`, `:22421`, `:1083-1103`, `:1209-1248` | yes -- 5.5's argument holds |
| `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon/authenticated` (and `ON SEQUENCES`) | `:33393-33396` (`:33373-33376`) | yes -- 00's REVOKEs are required |

**Validation performed (no database was connected to, anywhere):**

- `psql` 17.6 is installed but was not used to connect. `pg_format`, `pgsanity`, `pglast` and `sqlparse` are not
  installed; no offline parser was added.
- Careful manual read of every file against the plan and the baseline DDL above.
- `node -e` structural check over all nine `.sql` files (comments and string literals stripped first):
  every change/rollback file contains exactly one `BEGIN;` and one `COMMIT;` in that order, 90 contains none;
  parentheses balance in every file; every file's header carries the run order (`00 -> 02 -> 03 -> 01`) and the
  hold on 01 and the not-a-migration line; every change file has PRE-CHECK / CHANGE / POST-CHECK; no UUID, no `@`,
  no `<id column> = <number>` predicate and no project ref anywhere; each rollback references the exact
  `script` and `action` literals its change file writes (`01_role_conversion`/`update`,
  `02_backfill_campaign_organisers`/`insert`, `03_resolve_duplicate_placements`/`delete`) and 90 references all
  three; the `_oux_hygiene_log` insert column list is the single string
  `script, action, table_name, row_pk, before_row, after_row, note` in 01, 02 and 03, and every one of those
  columns exists in 00's `CREATE TABLE`. Result: all checks passed.
- `pnpm validate:migrations` from the repo root:
  `Validated 3 Supabase migrations with unique 14-digit versions.` (exit 0) -- unaffected, as 2.1 predicts.
- `pnpm lint` / `pnpm test` from `apps/organising-db` (8.3): test green (56 files, 732 tests passed); lint exits 1 with "✖ 294 problems (143 errors, 151 warnings)" -- every flagged path is an existing `apps/organising-db` source file, none of which this branch touches (the branch adds only files under `scripts/data-hygiene/` and this document), so the failure is pre-existing on `develop` and not introduced here. `pnpm build` was not run (no TypeScript changed; the instruction was not to start the app).
- Not possible here: executing any script. The dev rehearsal (6.2) and the count evidence (6.3) are the verifier's.

**Files (line counts):**

```
      76 oux-wp0.4/00_create_hygiene_log.sql
      77 oux-wp0.4/01_role_conversion.sql
      58 oux-wp0.4/01_rollback.sql
     106 oux-wp0.4/02_backfill_campaign_organisers.sql
      62 oux-wp0.4/02_rollback.sql
     166 oux-wp0.4/03_resolve_duplicate_placements.sql
      93 oux-wp0.4/03_rollback.sql
     208 oux-wp0.4/90_verify_all.sql
      56 oux-wp0.4/99_drop_hygiene_log.sql
      81 oux-wp0.4/README.md
       2 README.md
     985 total
```

**Commits on `feat/oux-wp0.4-data-hygiene`:**

- `9d6349d` feat(oux-wp0.4): add data-hygiene folder, README and audit-log create/drop scripts
- `4d1eff0` feat(oux-wp0.4): script 01 role conversion (admin+organiser -> user) with rollback
- `716c990` feat(oux-wp0.4): script 02 backfill campaign_organisers from campaigns.organiser_id with rollback
- `b7c3c5e` feat(oux-wp0.4): script 03 resolve duplicate unit placements (H1, H3) with rollback
- `2911e17` feat(oux-wp0.4): read-only verification suite 90_verify_all.sql
- (this commit) feat(oux-wp0.4): record deviations, schema confirmation and validation in wp0.4.md section 12

## 13. Verification output

_(verifier pastes raw output)_

## 14. Reviewer findings

_(reviewer)_
