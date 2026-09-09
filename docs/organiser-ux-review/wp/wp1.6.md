# WP1.6 — Auth and RLS alignment

Planner output. Branch checked out: `feat/oux-wp1.1-workspace-mode` (content identical to merged
`develop` for this package's purposes). Live schema: `supabase/migrations/20260908050000_baseline_schema.sql`
(cited below as `B:<line>`). App root for every relative path: `apps/organising-db/`.

---

## 1. Specification

### 1.1 Work package (verbatim)

> **WP1.6 Auth and RLS alignment.** High-risk implementer. `isLeadOrganiser` in
> `src/lib/supabase/auth-context.tsx`; a migration moving `campaigns`, `campaign_organising_units`,
> `campaign_worker_ou` and `campaign_worker_membership` insert, update and delete policies to
> `can_write_to_campaign()` (appendix C 6.2); UI stops offering deletes that fail. Acceptance:
> role-coverage tests with `admin`, `user` and `viewer` accounts on dev for create, edit and delete of a
> unit and a campaign; migration rehearsal recorded. Depends on decisions 2 and 8.

### 1.2 Decisions consumed

- **Decision 2 — Confirmed** (`docs/organiser-ux-review/DECISIONS.md`, Answers): the seven `admin`
  accounts whose `work_role` is `organiser` become `user`; the two lead organisers are named as leads.
  The conversion script (WP0.4's `01_role_conversion.sql`) is **HELD on production until this package is
  live**. It has already been run **on dev** (PROGRESS "Human tasks": 02 inserted 5, 03 deleted 2, 01
  converted 4, 2026-09-08), so dev is in the post-hygiene shape this package must work against.
- **Decision 8 — Confirmed with a note**: admins **and** lead organisers may assign other organisers;
  and **a `user`-role organiser must be able to create campaigns and actions with themselves assigned**.
  The note names the mechanism: "the `created_by` path in `can_write_to_campaign()` is what makes this
  work and must be set on every creation path."

### 1.3 Live DDL confirmed against the baseline

Every policy the appendices cite, quoted from the baseline (not from `migrations_legacy/`):

| Line | Policy |
|---|---|
| `B:25549` | `CREATE POLICY "Admin can delete campaign_leader_worker_links" ON "public"."campaign_leader_worker_links" FOR DELETE TO "authenticated" USING (("public"."get_user_role"() = 'admin'::"text"));` |
| `B:25553` | `CREATE POLICY "Admin can delete campaign_organising_units" … USING (("public"."get_user_role"() = 'admin'::"text"));` |
| `B:25581` | `CREATE POLICY "Admin can delete campaign_worker_membership" … USING (("public"."get_user_role"() = 'admin'::"text"));` |
| `B:25585` | `CREATE POLICY "Admin can delete campaign_worker_ou" … USING (("public"."get_user_role"() = 'admin'::"text"));` |
| `B:25593` | `CREATE POLICY "Admin can delete campaigns" … USING (("public"."get_user_role"() = 'admin'::"text"));` |
| `B:25955` | `CREATE POLICY "Admin/User can insert campaign_leader_worker_links" … FOR INSERT … WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"])));` |
| `B:25959` | `… "Admin/User can insert campaign_organising_units" …` same predicate |
| `B:26003` | `… "Admin/User can insert campaign_worker_membership" …` same predicate |
| `B:26007` | `… "Admin/User can insert campaign_worker_ou" …` same predicate |
| `B:26015` | `… "Admin/User can insert campaigns" …` same predicate |
| `B:26327` | `CREATE POLICY "Admin/User can update campaign_leader_worker_links" … FOR UPDATE … USING (role IN admin,user) WITH CHECK (role IN admin,user);` |
| `B:26331` | `… "Admin/User can update campaign_organising_units" …` same |
| `B:26371` | `… "Admin/User can update campaign_worker_membership" …` same |
| `B:26375` | `… "Admin/User can update campaign_worker_ou" …` same |
| `B:26383` | `… "Admin/User can update campaigns" …` same |
| `B:26981, 26985, 27029, 27033, 27041` | `"Authenticated users can read <table>" … FOR SELECT TO "authenticated" USING (true);` — **untouched by this package** |

Helper chain (all `LANGUAGE sql STABLE SECURITY DEFINER`, owner `postgres`):

- `can_write_to_campaign(p_campaign_id integer)` — `B:994-1009`:
  `(is_standing campaign AND auth.uid() IS NOT NULL) OR is_admin() OR is_campaign_creator(p) OR
  is_lead_organiser_for_campaign(p) OR is_assigned_to_campaign(p) OR has_campaign_edit_permission(p)`.
- `get_user_role()` — `B:3346-3349`: `SELECT role FROM public.user_profiles WHERE user_id = auth.uid()`.
- `is_admin()` — `B:3638-3644`. `is_assigned_to_campaign()` — `B:3651-3672` (agreement route **or** any
  `campaign_organisers` row). `is_campaign_creator()` — `B:3678-3685` (`campaigns.created_by = auth.uid()`).
  `is_coordinator_or_lead()` — `B:3692-3704` (`role='admin' OR work_role IN
  ('lead_organiser','coordinator','industrial_coordinator')`). `has_campaign_edit_permission()` — `B:3558-3566`.
- `is_lead_organiser_for_campaign(p)` — `B:3711-3756`, four arms:
  arm 1 `campaigns.organiser_id` match **plus** `work_role IN ('lead_organiser','coordinator','industrial_coordinator')`
  (`B:3714-3722`); arm 2 `campaign_organisers.campaign_role='lead'`, no work_role requirement (`B:3724-3732`);
  arm 3 campaign-scoped `reports_to_organiser_id` plus a lead/coordinator work_role (`B:3734-3741`);
  arm 4 legacy global `reports_to` chain plus a lead/coordinator work_role (`B:3743-3754`).
- `delete_campaign(p_campaign_id)` — `B:1768-1801`, `plpgsql SECURITY DEFINER`,
  gate at `B:1777-1779`: `IF NOT (public.is_admin() OR public.is_lead_organiser_for_campaign(p_campaign_id)) THEN
  RAISE EXCEPTION 'not_authorized'; END IF;`. Comment `B:1807`.

Tables:

- `campaigns` — `B:9651-9683`. `created_by uuid` at `B:9666`, **no DEFAULT**; FK
  `campaigns_created_by_fkey → auth.users(id) ON DELETE SET NULL` (`B:23831`). `is_standing boolean NOT NULL
  DEFAULT false` (`B:9674`), `is_sms_episode` (`B:9675`), `archived_at` (`B:9676`). Triggers:
  `trg_campaigns_updated_at` BEFORE UPDATE (`B:22409`) and `trg_prevent_live_sms_episode_delete` BEFORE
  DELETE (`B:22549`) — **no BEFORE INSERT trigger exists**, so nothing sets `created_by` today.
- `campaign_organising_units` — has `campaign_id integer NOT NULL` (`B:9500-9520`; `ou_type` CHECK includes `worksite, employer, shift, department, network, job_type,
  ethnic_community, crew_rotation, accommodation, work_area, custom`).
- `campaign_worker_ou` — `B:9636-9645`: `ou_id`, `worker_id`, `is_primary`, `assignment_source`,
  `assigned_rule_id`. **No `campaign_id` column** — every campaign scope is a join through
  `campaign_organising_units`. UNIQUE `(ou_id, worker_id)`.
- `campaign_worker_membership` — `B:7698-7704`: `membership_id, campaign_id, worker_id`; UNIQUE
  `(campaign_id, worker_id)`.
- `campaign_leader_worker_links` — `campaign_id integer NOT NULL`, `leader_worker_id`,
  `follower_worker_id`, `notes`, `created_by uuid`, CHECK `no_self_link`.

---

## 2. Plan

### 2.0 The one design decision everything else follows from

`can_write_to_campaign()` is **not** a superset of today's `get_user_role() IN ('admin','user')`. Read
`B:994-1009`: the first arm is `(is_standing campaign AND auth.uid() IS NOT NULL)`, and
`is_assigned_to_campaign` (`B:3651-3672`) and `has_campaign_edit_permission` (`B:3558-3566`) never look at
`user_profiles.role`. A **`viewer`** therefore returns `true` from `can_write_to_campaign()` for the
standing campaign, for any campaign with a `campaign_organisers` row for their organiser, and for any
campaign with an active `campaign_edit_permissions` grant.

A naive swap of the predicate would hand viewers write access on exactly those campaigns and would fail
this package's own acceptance criterion ("a `viewer` … unchanged: read-only"). **Every new policy in
§2.1 is therefore `role floor AND campaign scope`:**

```sql
("public"."get_user_role"() = ANY (ARRAY['admin'::text, 'user'::text]))
AND "public"."can_write_to_campaign"(<campaign_id expression>)
```

This is the minimal correct form. It is a strict narrowing of today's policy in every case, so nothing a
`viewer` can do today changes, and it preserves the `is_standing` behaviour the work package asks for
(any authenticated **staff** account may write to the standing campaign) without extending it to viewers.

### 2.1 The migration

**New file:** `supabase/migrations/20260909093000_wp1_6_campaign_write_policies.sql`

Name satisfies `scripts/validate-supabase-migrations.mjs:7`
(`^(\d{14})_([a-z0-9]+(?:_[a-z0-9]+)*)\.sql$`) and sorts after `20260908050200`. It is a **new**
timestamped file; the three baseline files are never edited.

#### 2.1.1 `campaigns.created_by` gets a default (decision 8's note)

Confirmed by grep of every campaign-INSERT path: only `src/app/api/sms/episodes/route.ts:202` sets
`created_by`. `src/app/(dashboard)/campaigns/new/manual/page.tsx:66-76`,
`src/components/campaigns/campaign-wizard.tsx:565-596`,
`src/lib/hooks/usePlannerCampaigns.ts:624-638` and
`src/app/api/campaign-import/apply/route.ts:107-114` all omit it. There is no BEFORE INSERT trigger
(`B:22409`, `B:22549` are the only triggers on `campaigns`).

A column DEFAULT is the smallest change that covers all five paths at once and cannot be forgotten by a
sixth. A BEFORE INSERT trigger would also work but adds a function, a trigger and a rollback step for no
extra capability.

```sql
ALTER TABLE "public"."campaigns"
  ALTER COLUMN "created_by" SET DEFAULT "auth"."uid"();

COMMENT ON COLUMN "public"."campaigns"."created_by" IS
  'Account that created the campaign. Defaults to auth.uid() so every client creation path is covered '
  '(WP1.6, decision 8): is_campaign_creator() is what lets a user-role organiser write to a campaign '
  'they made themselves. NULL for rows created before 2026-09-09, by the service role, or from psql.';
```

Notes: `auth.uid()` is `STABLE` and reads `request.jwt.claims`; column defaults may call it (this is the
standard Supabase idiom). Service-role and psql inserts get `NULL`, exactly as today. **No backfill** of
existing rows — we do not know who created them; existing campaigns are covered by WP0.4 script 02's
`campaign_organisers` rows (`is_lead_organiser_for_campaign` arm 2, `B:3724-3732`) and by
`is_assigned_to_campaign` (`B:3651-3672`).

#### 2.1.2 Drop the generation-1 write policies

```sql
DROP POLICY IF EXISTS "Admin/User can insert campaigns"                     ON "public"."campaigns";
DROP POLICY IF EXISTS "Admin/User can update campaigns"                     ON "public"."campaigns";
DROP POLICY IF EXISTS "Admin can delete campaigns"                          ON "public"."campaigns";
DROP POLICY IF EXISTS "Admin/User can insert campaign_organising_units"     ON "public"."campaign_organising_units";
DROP POLICY IF EXISTS "Admin/User can update campaign_organising_units"     ON "public"."campaign_organising_units";
DROP POLICY IF EXISTS "Admin can delete campaign_organising_units"          ON "public"."campaign_organising_units";
DROP POLICY IF EXISTS "Admin/User can insert campaign_worker_ou"            ON "public"."campaign_worker_ou";
DROP POLICY IF EXISTS "Admin/User can update campaign_worker_ou"            ON "public"."campaign_worker_ou";
DROP POLICY IF EXISTS "Admin can delete campaign_worker_ou"                 ON "public"."campaign_worker_ou";
DROP POLICY IF EXISTS "Admin/User can insert campaign_worker_membership"    ON "public"."campaign_worker_membership";
DROP POLICY IF EXISTS "Admin/User can update campaign_worker_membership"    ON "public"."campaign_worker_membership";
DROP POLICY IF EXISTS "Admin can delete campaign_worker_membership"         ON "public"."campaign_worker_membership";
DROP POLICY IF EXISTS "Admin/User can insert campaign_leader_worker_links"  ON "public"."campaign_leader_worker_links";
DROP POLICY IF EXISTS "Admin/User can update campaign_leader_worker_links"  ON "public"."campaign_leader_worker_links";
DROP POLICY IF EXISTS "Admin can delete campaign_leader_worker_links"       ON "public"."campaign_leader_worker_links";
```

The five `"Authenticated users can read …"` SELECT policies (`B:26981, 26985, 27029, 27033, 27041`) are
**not** dropped.

#### 2.1.3 New policies — `campaigns`

`campaigns` INSERT is the one case where `can_write_to_campaign()` cannot apply: the row does not exist,
so `is_campaign_creator(p)` / `is_lead_organiser_for_campaign(p)` have nothing to read. **Keep today's
rule exactly** (work package: "any `admin`/`user` may insert, `viewer` may not — keep today's rule"), and
let the new `created_by` default make the row writable to its creator from the moment it lands:

```sql
CREATE POLICY "wp16_campaigns_insert" ON "public"."campaigns"
  FOR INSERT TO "authenticated"
  WITH CHECK ("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"]));

CREATE POLICY "wp16_campaigns_update" ON "public"."campaigns"
  FOR UPDATE TO "authenticated"
  USING (
    ("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"]))
    AND "public"."can_write_to_campaign"("campaign_id")
  )
  WITH CHECK (
    ("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"]))
    AND "public"."can_write_to_campaign"("campaign_id")
  );

-- DELETE keeps an explicit standing-campaign guard: can_write_to_campaign()'s first arm
-- (B:997-1001) is TRUE for every authenticated account on the standing campaign, and a
-- shared container must not be deletable by whoever happens to open it.
CREATE POLICY "wp16_campaigns_delete" ON "public"."campaigns"
  FOR DELETE TO "authenticated"
  USING (
    "public"."is_admin"()
    OR (
      "is_standing" = false
      AND ("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"]))
      AND "public"."can_write_to_campaign"("campaign_id")
    )
  );
```

`campaign_id` is immutable in practice, so USING and WITH CHECK are identical for UPDATE.

#### 2.1.4 New policies — `campaign_organising_units`, `campaign_worker_membership`, `campaign_leader_worker_links`

All three carry `campaign_id NOT NULL`, so the expression is direct. One `FOR ALL` policy per table would
be shorter, but three per-operation policies keep the `pg_policies` snapshot in §2.6 diffable against the
"before" snapshot row-for-row, and match the shape used elsewhere in the baseline.

```sql
-- campaign_organising_units
CREATE POLICY "wp16_cou_insert" ON "public"."campaign_organising_units"
  FOR INSERT TO "authenticated"
  WITH CHECK (
    ("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"]))
    AND "public"."can_write_to_campaign"("campaign_id")
  );

CREATE POLICY "wp16_cou_update" ON "public"."campaign_organising_units"
  FOR UPDATE TO "authenticated"
  USING (
    ("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"]))
    AND "public"."can_write_to_campaign"("campaign_id")
  )
  WITH CHECK (
    ("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"]))
    AND "public"."can_write_to_campaign"("campaign_id")
  );

CREATE POLICY "wp16_cou_delete" ON "public"."campaign_organising_units"
  FOR DELETE TO "authenticated"
  USING (
    ("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"]))
    AND "public"."can_write_to_campaign"("campaign_id")
  );
```

The same three, character for character apart from the policy name and table, for
`campaign_worker_membership` (`wp16_cwm_insert|update|delete`) and `campaign_leader_worker_links`
(`wp16_clwl_insert|update|delete`).

An UPDATE that *moves* a unit between campaigns is blocked unless the account can write to both, because
USING tests the old `campaign_id` and WITH CHECK the new one. That is correct and is not a behaviour the
app uses (`campaign-units-section.tsx:587-590` never updates `campaign_id`).

#### 2.1.5 New policies — `campaign_worker_ou` (no `campaign_id` column)

`campaign_worker_ou` (`B:9636-9645`) has only `ou_id`. The policy joins through
`campaign_organising_units`. Inside a policy the candidate row is referenced by the table name, so the
correlation is unambiguous:

```sql
CREATE POLICY "wp16_cwo_insert" ON "public"."campaign_worker_ou"
  FOR INSERT TO "authenticated"
  WITH CHECK (
    ("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"]))
    AND EXISTS (
      SELECT 1
      FROM "public"."campaign_organising_units" "cou"
      WHERE "cou"."ou_id" = "campaign_worker_ou"."ou_id"
        AND "public"."can_write_to_campaign"("cou"."campaign_id")
    )
  );

CREATE POLICY "wp16_cwo_update" ON "public"."campaign_worker_ou"
  FOR UPDATE TO "authenticated"
  USING (
    ("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"]))
    AND EXISTS (
      SELECT 1 FROM "public"."campaign_organising_units" "cou"
      WHERE "cou"."ou_id" = "campaign_worker_ou"."ou_id"
        AND "public"."can_write_to_campaign"("cou"."campaign_id")
    )
  )
  WITH CHECK (
    ("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"]))
    AND EXISTS (
      SELECT 1 FROM "public"."campaign_organising_units" "cou"
      WHERE "cou"."ou_id" = "campaign_worker_ou"."ou_id"
        AND "public"."can_write_to_campaign"("cou"."campaign_id")
    )
  );

CREATE POLICY "wp16_cwo_delete" ON "public"."campaign_worker_ou"
  FOR DELETE TO "authenticated"
  USING (
    ("public"."get_user_role"() = ANY (ARRAY['admin'::"text", 'user'::"text"]))
    AND EXISTS (
      SELECT 1 FROM "public"."campaign_organising_units" "cou"
      WHERE "cou"."ou_id" = "campaign_worker_ou"."ou_id"
        AND "public"."can_write_to_campaign"("cou"."campaign_id")
    )
  );
```

The `EXISTS` subquery reads `campaign_organising_units`, whose own SELECT policy is
`USING (true)` for `authenticated` (`B:26985`), so the join never hides a row and never yields a
confusing "row does not exist" outcome. `campaign_worker_ou.ou_id` is `NOT NULL` with an FK to
`campaign_organising_units`, so the subquery always finds exactly one row.

`assignment_source = 'rule'` rows written by the rule engine go through the same client, so they are
covered by the same policy.

#### 2.1.6 A batch write-access helper (used by §2.4 and §2.5)

```sql
CREATE OR REPLACE FUNCTION "public"."campaigns_i_can_write"("p_campaign_ids" integer[])
RETURNS SETOF integer
LANGUAGE "sql" STABLE SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
  SELECT c.campaign_id
  FROM public.campaigns c
  WHERE c.campaign_id = ANY (p_campaign_ids)
    AND public.get_user_role() = ANY (ARRAY['admin', 'user'])
    AND public.can_write_to_campaign(c.campaign_id);
$$;

ALTER FUNCTION "public"."campaigns_i_can_write"("p_campaign_ids" integer[]) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."campaigns_i_can_write"(integer[]) FROM PUBLIC, "anon";
GRANT EXECUTE ON FUNCTION "public"."campaigns_i_can_write"(integer[]) TO "authenticated", "service_role";

COMMENT ON FUNCTION "public"."campaigns_i_can_write"(integer[]) IS
  'WP1.6. Returns the subset of p_campaign_ids the caller may write to under the WP1.6 policies '
  '(role floor AND can_write_to_campaign). One round trip for list surfaces and for the universe sync, '
  'so the write rule has exactly one definition.';
```

This is not scope creep: §2.4's list-page gate and §2.5's universe-sync fix each need the same answer for
a *set* of campaigns, and doing it with N `can_write_to_campaign` RPCs, or by re-implementing the rule in
TypeScript, would be worse on both counts. It leaks nothing a `SELECT` on `campaigns` does not already
expose (SELECT is `USING (true)`, `B:27041`).

#### 2.1.7 `delete_campaign()` must learn the creator arm

`delete_campaign` (`B:1768-1801`) is `SECURITY DEFINER` and is the **only** path the UI uses to delete a
campaign (`src/lib/hooks/useDeleteCampaign.ts:13`). Its gate at `B:1777-1779` is `is_admin() OR
is_lead_organiser_for_campaign(p)`. Neither arm fires for a `user`-role organiser who just created a
campaign for themselves — `is_lead_organiser_for_campaign` arm 1 requires
`work_role IN ('lead_organiser','coordinator','industrial_coordinator')` (`B:3714-3722`), and a fresh
campaign has no `campaign_organisers` row. Without this change, the acceptance criterion "create, edit
and **delete** … a campaign" as `user` cannot pass no matter what the table policy says.

```sql
CREATE OR REPLACE FUNCTION "public"."delete_campaign"("p_campaign_id" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  -- WP1.6: added is_campaign_creator (decision 8 — a user-role organiser must be able to
  -- delete a campaign they created). Deliberately NOT can_write_to_campaign(): its
  -- is_standing arm (B:997-1001) would let any authenticated account delete the shared
  -- standing campaign.
  IF NOT (
    public.is_admin()
    OR public.is_lead_organiser_for_campaign(p_campaign_id)
    OR public.is_campaign_creator(p_campaign_id)
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM campaigns WHERE campaign_id = p_campaign_id) THEN
    RAISE EXCEPTION 'campaign_not_found';
  END IF;

  -- body unchanged from B:1785-1799
  DELETE FROM campaign_stage_workplan_tasks WHERE campaign_id = p_campaign_id;
  DELETE FROM gate_assessments ga USING gate_definitions gd
    WHERE ga.gate_id = gd.gate_id AND gd.campaign_id = p_campaign_id;
  DELETE FROM gate_definitions   WHERE campaign_id = p_campaign_id;
  DELETE FROM campaign_stage_plans WHERE campaign_id = p_campaign_id;
  DELETE FROM reporting_snapshots  WHERE campaign_id = p_campaign_id;
  DELETE FROM campaign_timelines   WHERE campaign_id = p_campaign_id;
  DELETE FROM campaigns            WHERE campaign_id = p_campaign_id;
END;
$$;

COMMENT ON FUNCTION "public"."delete_campaign"("p_campaign_id" integer) IS
  'Deletes a campaign and dependent planning data. Allowed for admins, lead organisers and the '
  'campaign creator (WP1.6).';
```

The existing `trg_prevent_live_sms_episode_delete` BEFORE DELETE trigger (`B:22549`) still fires; SMS
episodes stay protected.

#### 2.1.8 The fifth table — recommendation on `campaign_leader_worker_links`

**Recommend: include it.** The work-package sentence names four tables, and plan 5.10 names "the four
core tables". Three reasons to add the fifth anyway, and the orchestrator can strike §2.1.4's `clwl`
block if it disagrees:

1. WP0.4 §3.5's table of "what a converted account loses" lists `campaign_leader_worker_links :25549`
   alongside the other four as a **silent no-op**. Leaving it behind leaves one delete that still fails
   silently after a package whose stated acceptance is "UI stops offering deletes that fail".
2. `useDeleteLeaderLink` (`src/components/campaigns/wall-chart/use-leader-links.ts:209-224`) has no
   campaign-scoped gate available to it other than the one this package builds. Gating it on `isAdmin`
   instead would be a *new* UI restriction — a regression in the opposite direction.
3. The table has `campaign_id NOT NULL`, so it needs no join and adds three policies and zero design.

Cost of including it: one more table in the rollback and in the `pg_policies` snapshot. Cost of
excluding it: an inconsistent product and a follow-up migration.

#### 2.1.9 Exact effect, per account class

| Account | Before | After |
|---|---|---|
| `admin` (any) | insert/update everywhere; delete everywhere | **unchanged** — `is_admin()` short-circuits `can_write_to_campaign` (`B:1003`), and the `campaigns` DELETE policy names `is_admin()` first |
| `user` who is the campaign's organiser **with** a `campaign_organisers` row (WP0.4 script 02's backfill, `campaign_role='lead'`) | insert/update yes; **delete silently no-ops** | insert/update/**delete** yes. Route: `is_lead_organiser_for_campaign` arm 2 (`B:3724-3732`) — and arm 2 has no `work_role` requirement, which is precisely why WP0.4 chose `'lead'` over `'organiser'` (wp0.4 §4.1) |
| `user` who created the campaign (new campaigns only) | insert/update yes; delete no-ops | full write via `is_campaign_creator` (`B:3678-3685`), because §2.1.1 sets `created_by`. This is decision 8's note satisfied end to end |
| `user` who is `campaigns.organiser_id` but has **no** roster row and did **not** create it (e.g. an existing campaign if script 02 were skipped) | insert/update yes | **loses insert/update/delete**. `is_lead_organiser_for_campaign` arm 1 requires a lead/coordinator `work_role` (`B:3714-3722`), which an `organiser` does not have. **WP0.4 script 02 is a hard prerequisite** — see §7 and the §8 pre-flight query |
| `user` **not on** the campaign at all | could create and edit units on **any** campaign (appendix C 6.2: "a `user` can create units on any campaign, including ones they are not assigned to") | **loses insert/update/delete on that campaign's units, memberships, leader links and the campaign row.** This is the intended tightening — plan 5.10, "Bring the four core tables … under `can_write_to_campaign()`" — and it is a **behaviour change the operator must be told about**: today any staff account can build structure on any campaign; after this, they must be on the team or hold an edit permission |
| `viewer` | read-only | **unchanged, read-only** — guaranteed by the role floor in §2.0, without which `can_write_to_campaign` would have opened the standing campaign and any campaign with a roster row or an edit grant |
| any authenticated staff account on the **standing** campaign (`is_standing = true`, `B:9674`) | insert/update yes, delete admin-only | insert/update yes (first arm of `can_write_to_campaign`, `B:997-1001`); **delete stays effectively admin-only** by the explicit `is_standing = false` guard in §2.1.3 |
| `service_role` (SMS/email webhooks, token routes) | bypasses RLS | unchanged — RLS does not apply |

### 2.2 Widening who may assign another organiser (decision 8)

`resolveCampaignOrganiserId` is at `src/lib/campaign/resolve-campaign-organiser.ts:40-104`. The gate is
narrower than appendix D 5.3 implies. Read the real control flow:

- `:76-78` — if the target staff member **already has** an `organiser_id`, it returns immediately. **Any
  `canWrite` account can already assign any linked organiser today.**
- `:80-84` — the throw only fires when the target has **no** organisers row *and* the caller is neither
  the target (`targetUserId !== options.currentUserId`) nor an admin:
  ```ts
  if (targetUserId !== options.currentUserId && !options.isAdmin) {
    throw new Error(
      "This team member does not have an organiser record yet. Only an admin can assign them until they are linked under Administration, or they can be selected after linking."
    );
  }
  ```
- `:86-101` — otherwise it **creates** an `organisers` row and links `user_profiles.organiser_id`. That
  write, not the assignment, is what is admin-gated.

So decision 8 ("admins **and** lead organisers may assign other organisers") is about who may mint an
organiser record for a colleague. Self-assignment is already permitted at `:80` and needs no change,
which is what wp0.4 §3.5b already recorded.

**Change:** replace the `isAdmin: boolean` option with a capability flag, and set it from the same role
set the database uses.

```ts
// src/lib/campaign/resolve-campaign-organiser.ts:43
options: { currentUserId: string; canLinkOtherOrganisers: boolean }
```
```ts
// :80
if (targetUserId !== options.currentUserId && !options.canLinkOtherOrganisers) {
```
and the message at `:81-83` becomes
`"This team member does not have an organiser record yet. An admin or lead organiser can link them under Administration; after that anyone can select them."`

**Which roles?** `is_coordinator_or_lead()` (`B:3692-3704`) is the database's own answer to "lead or
above": `role = 'admin' OR work_role IN ('lead_organiser','coordinator','industrial_coordinator')`. It is
also the exact set used by the one existing `work_role` server gate,
`src/app/api/permissions/pending/route.ts:25-30` (appendix D 5.3). **Recommend the same set**, i.e.
include coordinators and industrial coordinators: decision 8 says "lead organisers", and per decision 2
coordinators and industrial coordinators stay `admin` anyway, so including them costs nothing today and
keeps one definition if that ever changes. The client-side equivalent is `isAdmin || isLeadOrganiser`
from §2.3, where `isLeadOrganiser` covers all three `work_role` values.

**Every caller, and whether it needs more than the helper change** — all six pass
`{ currentUserId: user.id, isAdmin }` and become `{ currentUserId: user.id, canLinkOtherOrganisers: isAdmin || isLeadOrganiser }`:

| Caller | Line | Change |
|---|---|---|
| `src/components/campaigns/campaign-basics-edit-sheet.tsx` | `:234-238` | destructure `isLeadOrganiser` from `useAuth()`; pass the new flag. Nothing else |
| `src/components/campaigns/task-lists/create-task-list-dialog.tsx` | `:474-478` | same |
| `src/components/campaigns/campaign-settings.tsx` | `:361-365` | same |
| `src/components/campaigns/campaign-wizard.tsx` | `:560-563` and `:617-620` | same, both call sites |
| `src/app/(dashboard)/campaigns/new/manual/page.tsx` | `:61-65` (flag from `useAuth()` at `:43`) | same |
| `src/app/api/campaigns/[id]/worker-lists/[listId]/fire/task/route.ts` | `:94-97` | **server** — no `useAuth()`. Compute the flag from the profile the route already loads: `role === 'admin' \|\| ['lead_organiser','coordinator','industrial_coordinator'].includes(work_role)`. Use the shared `deriveWorkRoleFlags` from §2.3 so there is one implementation |

No caller needs a change beyond passing the widened flag. `requireStaffUser`
(`src/lib/campaign/auth-api.ts:3-20`) is untouched — it is a role floor, not a campaign gate, and every
`/api/admin/*` inline `role !== 'admin'` check stays exactly as it is (wp0.4 §3.5b: WP1.6 does not
restore the Administration page).

### 2.3 `isLeadOrganiser` in the auth context

**File:** `src/lib/supabase/auth-context.tsx`. Today the context type is `AuthContextType` at `:30-42`,
the default value at `:44-61`, `const role: UserRole = profile?.role ?? "viewer"` at `:370`, and the
provider value at `:372-390` with `isAdmin/isUser/isViewer/canWrite` at `:382-385`. `work_role` is on
`profile` (`UserProfile`, `src/types/organising-row-types.ts:832-842`) and is read by **no** UI today
(appendix D 5.2).

**New pure module:** `src/lib/auth/work-role-flags.ts`

```ts
import type { UserProfile, WorkRole } from "@/types/organising-row-types";

/** work_role values the database treats as "lead or above" — is_coordinator_or_lead(), B:3692-3704. */
export const LEAD_WORK_ROLES: readonly WorkRole[] = [
  "lead_organiser",
  "coordinator",
  "industrial_coordinator",
] as const;

export type WorkRoleFlags = {
  /** work_role is lead_organiser, coordinator or industrial_coordinator. Mirrors is_coordinator_or_lead()
   *  minus its role='admin' arm, which callers combine with isAdmin themselves. */
  isLeadOrganiser: boolean;
  /** Any organiser-shaped work_role, lead included — the audience for organiser mode (WP1.1). */
  isOrganiser: boolean;
};

export function deriveWorkRoleFlags(
  profile: Pick<UserProfile, "work_role"> | null | undefined
): WorkRoleFlags {
  const workRole = profile?.work_role ?? null;
  return {
    isLeadOrganiser: workRole != null && LEAD_WORK_ROLES.includes(workRole),
    isOrganiser: workRole === "organiser" || (workRole != null && LEAD_WORK_ROLES.includes(workRole)),
  };
}
```

`coordinator` and `industrial_coordinator` **do** count as `isLeadOrganiser`, deliberately: the flag's one
job is to answer "may this account act as a lead?", and `is_coordinator_or_lead()` (`B:3692-3704`) is the
database's answer. Documented in the doc comment so a reader is not surprised by the name.

`isOrganiser` is exposed as the work package asks; WP1.1 is its first consumer.

**Wiring** (three edits, all additive so no existing consumer breaks):

- `:30-42` — add to `AuthContextType`: `isLeadOrganiser: boolean; isOrganiser: boolean;`
- `:44-61` — add `isLeadOrganiser: false, isOrganiser: false,` to the default context value.
- `:370-385` — after `const role: UserRole = profile?.role ?? "viewer";` add
  `const workRoleFlags = deriveWorkRoleFlags(profile);` and spread
  `isLeadOrganiser: workRoleFlags.isLeadOrganiser, isOrganiser: workRoleFlags.isOrganiser,`
  into the provider value beside `canWrite` at `:385`.

`useCurrentUserProfile` (`src/lib/hooks/usePlannerOptions.ts:172-192`), the second independent fetch of
the same row, is left alone — deduplicating it is not this package's job.

**Tests:** `src/lib/auth/__tests__/work-role-flags.test.ts` (vitest, sibling `__tests__` pattern as in
`src/lib/campaign/__tests__/`): null profile, `work_role: null`, each of the six legal `work_role` values
from the `user_profiles` CHECK (`B:9887-9900`), and an unknown string cast through — asserting
`specialist` and `industrial_officer` are neither lead nor organiser.

### 2.4 UI stops offering deletes that fail

Two halves, exactly as the work package frames it.

#### (a) Gate delete controls on **campaign** write access, not global `canWrite`

There is **no** existing client-side `can_write_to_campaign` call. Grep of `src/` finds the RPC only in
API routes: `src/app/api/sms/actions/route.ts:56`, `src/app/api/sms/relays/route.ts:181`,
`src/app/api/sms/conversations/route.ts:212`, `.../[id]/messages/route.ts:87`,
`.../[id]/assessments/route.ts:201`, `.../[id]/draft-reply/route.ts:90`,
`src/app/api/workers/[workerId]/route.ts:173`,
`src/app/api/campaigns/[id]/sms-surveys/[surveyId]/route.ts:500,673`, `.../actions/route.ts:231`,
`.../worker-list/route.ts:69`. Appendix C 7.2's `.rpc()` inventory lists it because of these.

**New file:** `src/lib/hooks/useCampaignWriteAccess.ts`

```ts
"use client";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";

/** Write access for a set of campaigns, in one RPC. Source of truth is the DB (WP1.6). */
export function useCampaignWriteAccess(campaignIds: number[]) {
  const supabase = createClient();
  const { canWrite } = useAuth();
  const ids = [...new Set(campaignIds.filter((n) => Number.isFinite(n) && n > 0))].sort((a, b) => a - b);
  return useQuery({
    queryKey: ["campaign-write-access", ids],
    enabled: canWrite && ids.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("campaigns_i_can_write", { p_campaign_ids: ids });
      if (error) throw error;
      return new Set<number>((data ?? []).map((n: number) => Number(n)));
    },
  });
}

/** Single-campaign convenience. Returns false while loading — controls appear, they do not vanish. */
export function useCanWriteToCampaign(campaignId: string | number | undefined): {
  canWriteCampaign: boolean;
  isLoading: boolean;
} {
  const id = Number(campaignId);
  const { data, isLoading } = useCampaignWriteAccess(Number.isFinite(id) ? [id] : []);
  const { canWrite } = useAuth();
  return { canWriteCampaign: canWrite && (data?.has(id) ?? false), isLoading };
}
```

**Wiring — one edit does most of the work.** `src/app/(dashboard)/campaigns/[id]/page.tsx:238`
(`const { user, canWrite } = useAuth();`) feeds `canWrite={!!canWrite}` to every section on the page
(`:439, 541, 572, 578, 591, 595, 599, 648, 756, 760, 764, 768, 770, 776, 801, 840`). Change **that one
value** to the campaign-scoped one:

```ts
const { user, canWrite: canWriteGlobal } = useAuth();
const { canWriteCampaign, isLoading: writeAccessLoading } = useCanWriteToCampaign(campaignId);
// While the RPC is in flight keep today's behaviour so nothing flickers away.
const canWrite = writeAccessLoading ? canWriteGlobal : canWriteCampaign;
```

That single change covers every consumer named in the work package that lives under the campaign page:

- `wall-chart/delete-organising-unit-dialog.tsx` — reached only through
  `campaign-wall-chart.tsx:1562` (`onDeleteUnit={canWrite ? … : undefined}`) and
  `:2105-2109` ("Delete unit" dropdown item, inside `{canWrite && …}` at `:2071`), plus
  `wall-chart-unit-manager.tsx:220-228, 258-266` (per-unit trash buttons, `aria-label={`Delete ${label}`}`).
- `move-worker-mutation.ts` — drag/drop is already gated at `campaign-wall-chart.tsx:1313` and `:1363`
  (`if (!canWrite) return;`) and `dropDisabled={!canWrite}` at `:1664, 1910, 2177, 2302`.
- `campaign-units-section.tsx` remove/reallocate — `canWrite` prop at `:163, 166`, controls at
  `:1454-1471` ("Remove from unit"), `:1566-1580` (per-row remove), `:1317-1337` ("Edit unit"),
  `:1157` ("Add unit"), `:1610-1614` ("Remove rule").
- `campaign_leader_worker_links` unlink — `useDeleteLeaderLink`
  (`use-leader-links.ts:209-224`) is called from the relationship UI under the same page; it inherits the
  gate. Where it is invoked outside a `canWrite` branch, add the gate at the call site.
- `useRemoveWorkerFromCampaign` (`src/lib/hooks/useRemoveWorkerFromCampaign.ts:44-162`) — called from
  `worker-detail-sheet.tsx` (inside the campaign page) and from the dialler. The dialler is campaign-scoped
  too; add `useCanWriteToCampaign(campaignId)` at that call site and hide the "No longer in campaign
  universe" panel when false.

**`campaigns/page.tsx:272-295`** (the delete-campaign column) is the one surface *outside* the campaign
page. It renders one row per campaign, so a per-row RPC is out. Use the batch hook against the ids the
list already has:

```ts
// after the ["campaigns"] query at :141
const { data: writable } = useCampaignWriteAccess(campaigns.map((c) => c.campaign_id));
// :272
if (canWrite) { … render: (row) => writable?.has(row.campaign_id) ? <Button …/> : null … }
```

Keep `CampaignDeleteDialog`'s existing `not_authorized` translation
(`src/components/campaigns/campaign-delete-dialog.tsx:25-27`) as the backstop: the client gate is a
hint, the RPC is the authority. Note that `delete_campaign`'s rule (§2.1.7) is *narrower* than
`campaigns_i_can_write` (no `is_assigned_to_campaign`, no `has_campaign_edit_permission` arm), so the
button can still appear for a team member who is not lead/creator — and the dialog already tells them
so, loudly. Making the two identical would mean a second RPC; **recommend not doing it in this package**
and record it in §9.

#### (b) Make the mutations fail loudly instead of silently

PostgREST returns 2xx with zero rows when a DELETE or UPDATE is filtered out by RLS (appendix C 6.2
records the symptom). After this migration a `user` *can* delete on their own campaigns, but the silent
path still exists for every other campaign, and hiding a control is not a guarantee.

**New pure module:** `src/lib/supabase/assert-rows-affected.ts`

```ts
/** Raised when a write succeeded at the transport level but changed no rows — almost always RLS. */
export class NoRowsAffectedError extends Error {
  readonly expected: number;
  readonly actual: number;
  constructor(action: string, expected: number, actual: number) {
    super(
      `${action} changed no rows. You may not have permission to change this campaign — ask an admin or the campaign's lead organiser for access.`
    );
    this.name = "NoRowsAffectedError";
    this.expected = expected;
    this.actual = actual;
  }
}

export type CountedResult = { error: unknown; count: number | null };

/**
 * Throws when a counted PostgREST write affected fewer rows than expected.
 * `count` is null when the caller forgot `{ count: "exact" }` — treated as "unknown", not as failure,
 * so adding the assertion can never turn a working call into a broken one.
 */
export function assertRowsAffected(result: CountedResult, expected: number, action: string): void {
  if (result.error) throw result.error;
  if (expected <= 0) return;
  if (result.count == null) return;
  if (result.count < expected) throw new NoRowsAffectedError(action, expected, result.count);
}
```

Copy note: the message names "campaign", "admin" and "lead organiser" only — no plan-terminology nouns
(Unit, Group, Unassigned) are needed, and none are misused.

**Call sites, with their current code:**

| File:line | Current | Change |
|---|---|---|
| `wall-chart/delete-organising-unit-dialog.tsx:155-160` | `const { error: delErr } = await supabase.from("campaign_worker_ou").delete().eq("ou_id", ouId).eq("worker_id", workerId); if (delErr) throw delErr;` | `.delete({ count: "exact" })`; `assertRowsAffected(res, 1, "Removing the worker from the unit")` |
| `…:167-173` (child units) | `const { error: childErr } = await supabase.from("campaign_organising_units").delete().in("ou_id", childOuIds); if (childErr) throw childErr;` | `.delete({ count: "exact" })`; `assertRowsAffected(res, childOuIds.length, "Deleting the sub-units")` |
| `…:175-179` (the unit) | `const { error: delOuErr } = await supabase.from("campaign_organising_units").delete().eq("ou_id", ouId); if (delOuErr) throw delOuErr;` | `.delete({ count: "exact" })`; `assertRowsAffected(res, 1, "Deleting the unit")`. `onError` at `:189` already surfaces `e.message` via `window.alert` |
| `wall-chart/move-worker-mutation.ts:83-90` | already `.delete({ count: "exact" })`, `deleted = count ?? 0` — **the count is captured and never checked** | `assertRowsAffected(res, workerIds.length, "Moving the workers to Unassigned")` before assigning |
| `…:217-224` (per-ref source delete) | already `{ count: "exact" }` | `assertRowsAffected(res, 1, "Moving the worker out of its unit")` |
| `useRemoveWorkerFromCampaign.ts:77-83` | `.delete().eq("worker_id", …).in("ou_id", ouIds)` | `{ count: "exact" }`, **expected 0** — a worker may legitimately be in no unit. Do **not** assert; instead capture the count and use it below |
| `useRemoveWorkerFromCampaign.ts:86-91` | `.delete().eq("campaign_id", cidNum).eq("worker_id", workerId)` — the membership row, which always exists | `{ count: "exact" }`; `assertRowsAffected(res, 1, "Removing the worker from the campaign")`. `onError` at `:159-161` already toasts |
| `campaign-units-section.tsx:755-760` (`removeFromUnitMutation`) | `.delete().eq("ou_id", ouId).in("worker_id", workerIds)` | `{ count: "exact" }`; `assertRowsAffected(res, workerIds.length, "Removing the workers from the unit")`. `onError` at `:768` alerts |
| `campaign-units-section.tsx:801-807` (`reallocateToUnitMutation` source delete) | `.delete().eq("ou_id", fromOuId).in("worker_id", workerIds)` | `{ count: "exact" }`; `assertRowsAffected(res, workerIds.length, "Moving the workers out of the old unit")`. `onError` at `:817` alerts |
| `campaign-units-section.tsx:722` (unit rule delete) | `.delete().eq("rule_id", ruleId)` | `{ count: "exact" }`; `assertRowsAffected(res, 1, "Deleting the rule")` — `campaign_unit_rules` is not in this migration but has the same recorded symptom (appendix C 6.2) |
| `use-leader-links.ts:209-224` (`useDeleteLeaderLink`) | `.delete().eq("link_id", linkId)` | `{ count: "exact" }`; `assertRowsAffected(res, 1, "Unlinking the leader")`; add an `onError` toast (it has none) |

`campaign-delete-dialog.tsx` needs **no** change: it goes through the RPC, which raises
`not_authorized`, and `deleteErrorMessage` (`:20-32`) already translates it.

The diff stays small: one 25-line helper plus one added argument and one added line at eleven call sites.

### 2.5 The cross-campaign universe sync — the largest hidden risk

`syncWorkersToMatchingCampaigns` (`src/lib/workers/sync-campaign-universe.ts:224-…`) loads **every**
planning/active non-episode campaign (`:109-117`), finds the ones whose universe matches the worker
(`:240-246`), then upserts `campaign_worker_membership` (`:179-194`) and `campaign_worker_ou`
(`:196-211`) into **all of them** — including campaigns the caller has no relationship with.

Under §2.1 those upserts stop being no-ops and become **hard errors**: an INSERT that fails `WITH CHECK`
raises `42501 new row violates row-level security policy`, which `upsertMembership:190` and
`upsertOuAssignments:207` rethrow. That would make the whole enclosing mutation fail. Callers:
`move-worker-mutation.ts:296`, `worker-detail-sheet.tsx:464`, `campaign-wizard.tsx:1133`,
`api/campaigns/[id]/add-workers/route.ts:199`, `api/campaigns/[id]/create-worker/route.ts:308`,
`api/worker-import/apply/route.ts:622`, `api/campaign-import/apply/route.ts:474`,
`api/workers/[workerId]/route.ts:298`, `api/workers/batch-update/route.ts:134`. Every one of those API
routes uses the **user-scoped** server client (`@/lib/supabase/server`, e.g. `add-workers/route.ts:3`) —
none uses `lib/supabase/admin.ts` — so RLS applies throughout, exactly as appendix C 6.2 states.

**Fix (required, not optional):** filter the target set in `syncWorkersToMatchingCampaigns` using the
`campaigns_i_can_write` RPC from §2.1.6, and report what was skipped.

```ts
// sync-campaign-universe.ts, after the matchingCampaigns filter at :240-246
const { data: writableIds, error: waErr } = await supabase.rpc("campaigns_i_can_write", {
  p_campaign_ids: matchingCampaigns.map((c) => c.campaignId),
});
if (waErr) throw new Error(waErr.message);
const writable = new Set<number>((writableIds ?? []).map((n: number) => Number(n)));
const skippedNoAccess = matchingCampaigns.filter((c) => !writable.has(c.campaignId)).length;
const allowedCampaigns = matchingCampaigns.filter((c) => writable.has(c.campaignId));
```

`SyncWorkersResult` (`:213-217`) gains `campaignsSkippedNoAccess: number`. The one place a human sees it,
`move-worker-mutation.ts:296`, does not currently read the result; leave it that way and log once via the
existing `console.error` idiom (`api/workers/[workerId]/route.ts:300`).

**This is a genuine, operator-visible behaviour change** and it belongs in the PR description and the
ledger: today, moving a worker in campaign X also enrols them into campaign Y if Y's universe matches;
after this, it does so only if the actor can write to Y. In practice nothing changes until WP0.4 script
01 runs on production (11 of 13 accounts are admins today, appendix C 6.2 / plan 3.2), which is why the
sequencing in §7 matters. The proper long-term fix is a `SECURITY DEFINER` universe-sync RPC; **out of
scope here** (§9), recorded as a follow-up.

`stampEmployerWorksiteFromOu` writes only `workers` rows, which this migration does not touch.

### 2.6 Migration rehearsal (verifier procedure)

Dev project only — `dpnnmkhabysfdogllsyh`. **Never** `gteygwfgjvczanmrwgbr`.

```bash
# from the repo root
npx supabase link --project-ref dpnnmkhabysfdogllsyh
env -u SUPABASE_DB_PASSWORD npx supabase migration list
```

**"Before" snapshot** (run in the Supabase SQL editor or `psql`, save the output verbatim into the
verification section of this file):

```sql
SELECT schemaname, tablename, policyname, cmd, roles::text, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'campaigns',
    'campaign_organising_units',
    'campaign_worker_ou',
    'campaign_worker_membership',
    'campaign_leader_worker_links'
  )
ORDER BY tablename, cmd, policyname;

-- creator default + function bodies, for the before/after diff
SELECT column_name, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'campaigns' AND column_name = 'created_by';

SELECT proname, pg_get_functiondef(oid)
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('delete_campaign', 'campaigns_i_can_write');
```

Expected "before": 15 rows for the five tables' write policies (five DELETE `get_user_role() = 'admin'`,
five INSERT and five UPDATE `get_user_role() = ANY(ARRAY['admin','user'])`) plus five SELECT
`USING (true)` rows; `column_default` NULL; `campaigns_i_can_write` absent.

```bash
npx supabase db push --dry-run   # must list exactly 20260909093000_wp1_6_campaign_write_policies.sql
npx supabase db push
```

Re-run the same three queries as the **"after"** snapshot. Expected: 15 new `wp16_*` write policies with
the §2.1 predicates, the five SELECT policies untouched, `column_default = auth.uid()`,
`campaigns_i_can_write` present, `delete_campaign` containing `is_campaign_creator`.

```bash
pnpm validate:migrations           # repo root
```

**Type regeneration.** Confirmed **not needed for the policies** — `pg_policies` is not in the generated
types. It **is** needed for `campaigns_i_can_write`, which is a new RPC and must appear under
`Database["public"]["Functions"]` or the `.rpc()` calls in §2.4 and §2.5 will not typecheck.
`campaigns.created_by` is already `string | null` in Row and `created_by?: string | null` in Insert and
Update (`packages/db-types/generated.ts:8898` block, offsets +9/+36/+63) — Supabase already marks it
optional on Insert because it is nullable, so **adding the DEFAULT changes nothing in the generated
types**. Run it anyway, once, after `db push`:

```bash
SUPABASE_PROJECT_REF=dpnnmkhabysfdogllsyh pnpm gen:types    # repo root
git diff --stat packages/db-types/generated.ts               # expect the new function entry only
```

### 2.7 Role-coverage tests

#### 2.7.1 Harness changes

`playwright.config.ts` today has one project and one storage state (`STORAGE_STATE =
"tests/e2e/.auth/user.json"`, `:18`; single `projects: [{ name: "chromium", … }]` at `:33`).
`tests/e2e/global-setup.ts:28-53` signs in once. `tests/e2e/env.ts` reads `E2E_USER_EMAIL` /
`E2E_USER_PASSWORD` and exports `hasE2ECredentials`; absent credentials **skip**, never fail.

Changes, all following the established pattern:

- `tests/e2e/env.ts` — add `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD`, `hasE2EAdminCredentials`, and
  `NO_ADMIN_CREDENTIALS_MESSAGE` mirroring `:12-13`.
- `playwright.config.ts` — export `ADMIN_STORAGE_STATE = "tests/e2e/.auth/admin.json"`; two projects:
  ```ts
  projects: [
    { name: "chromium",       use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE },
      testIgnore: /roles\/.*-admin\.spec\.ts/ },
    { name: "chromium-admin", use: { ...devices["Desktop Chrome"], storageState: ADMIN_STORAGE_STATE },
      testMatch: /roles\/.*-admin\.spec\.ts/ },
  ]
  ```
- `tests/e2e/global-setup.ts` — factor the sign-in body (`:38-52`) into `signIn(email, password, path)`
  and call it for each account. **Always write both files** even with no credentials, for the reason the
  existing comment at `:19-23` gives (Playwright resolves `storageState` before any `test.skip`).

Credentials are read from the environment only; they are never printed, never written to the repo, and
no agent types them into a form (DECISIONS.md, "Test accounts (2026-09-08)").

#### 2.7.2 `user` — the positive path, self-contained (decision 8's note)

`tests/e2e/roles/unit-lifecycle-user.spec.ts`, guarded by `test.skip(!hasE2ECredentials, …)`.

This spec creates its own campaign so it depends on **no** dev fixture and directly exercises the
decision-8 note (a `user` creates a campaign with themselves assigned, then edits and deletes its units):

1. `page.goto("/campaigns/new/manual")`. Fill the name field with a unique `WP1.6 role check <ts>`;
   the form is `src/app/(dashboard)/campaigns/new/manual/page.tsx` (the `!canWrite` branch at `:94-100`
   renders "You do not have permission to create campaigns." — assert it is **absent**). Submit; the
   mutation's `onSuccess` at `:80-83` redirects to `/campaigns/<id>/settings`, so
   `await page.waitForURL(/\/campaigns\/(\d+)\/settings/)` and capture the id.
2. Go to `/campaigns/<id>?tab=workforce&sub=wall-chart`. Assert the wall chart renders (same anchors as
   `tests/e2e/wall-chart.spec.ts:26-32`: the "Wall chart" CardTitle div and
   `getByRole("button", { name: "Wall chart" })` with `aria-pressed="true"`).
3. **Create a unit.** `getByRole("button", { name: "New unit" })` —
   `wall-chart-unit-manager.tsx:91` when the campaign has no units (the case here) and `:131` inside the
   Units popover otherwise. The dialog is `create-organising-unit-dialog.tsx`: title "New organising
   unit" (`:585`), name field under `<Label>Name</Label>` (`:639`) with placeholder `e.g. Day Shift`
   (`:643`), submit `getByRole("button", { name: /Create units/ })` (`:1095`). Assert a
   `[data-ou-id]` card with the new name appears.
4. **Rename it (edit).** The rename control lives on the Units tab, not the wall chart:
   `/campaigns/<id>?tab=workforce&sub=units` → `campaign-units-section.tsx:1319-1337`, a ghost icon
   button with `title="Edit unit"` → `getByTitle("Edit unit")`. Change the name, save, assert the new
   name renders. (`updateOu` at `:561-590` is the mutation under test.)
5. **Delete it.** Back on the wall chart, open the Units popover and click
   `getByRole("button", { name: `Delete ${unitName}` })` (`wall-chart-unit-manager.tsx:227`), or the
   "Delete unit" dropdown item (`campaign-wall-chart.tsx:2105-2108`). With no workers in the unit the
   confirm is the AlertDialog titled "Delete organising unit?" (`delete-organising-unit-dialog.tsx:275`)
   with action `Delete unit` (`:288`). Assert the unit card disappears **and** that no
   `NoRowsAffectedError` alert fired — `page.on("dialog", …)` collects `window.alert` (the dialog's
   `onError` at `:189`) and the spec fails if any appeared. This is the "no silent failure" assertion.
6. **Delete the campaign.** `/campaigns` → `getByRole("button", { name: `Delete ${campaignName}` })`
   (`campaigns/page.tsx:285`) → type the exact name into `#delete-campaign-name-db`
   (`campaign-delete-dialog.tsx:94`) → `getByRole("button", { name: "Delete campaign" })` (`:111`).
   Assert the row disappears and that the error paragraph at `:101` never rendered. This is the
   assertion that §2.1.7's `is_campaign_creator` arm actually landed.

Step 6 leaves dev clean: the spec deletes everything it created.

#### 2.7.3 `user` — the negative path

Handled **twice**, because the UI half and the database half are different claims:

- **UI:** open a campaign the account cannot write to and assert the "New unit" button
  (`wall-chart-unit-manager.tsx:91,131`) and the per-unit `Delete <name>` buttons (`:227, :265`) are
  **absent** — that is §2.4(a) working. Which campaign that is must be discovered, not hard-coded: on dev
  today WP0.4 script 02 gave the e2e account a `campaign_role='lead'` row on campaign 1 (its
  `organiser_id` was set to 10 for the WP0.2 run, PROGRESS "Previews and e2e"), so campaign 1 is now a
  **positive** case. The verifier runs the §2.7.5 discovery query first and passes the id as
  `E2E_FOREIGN_CAMPAIGN_ID`; when it is unset the spec skips with a clear message.
- **Database:** the SQL probe pack in §2.7.5, which is deterministic and does not depend on the UI.

#### 2.7.4 `admin`

`tests/e2e/roles/unit-lifecycle-admin.spec.ts`, in the `chromium-admin` project, guarded by
`test.skip(!hasE2EAdminCredentials, NO_ADMIN_CREDENTIALS_MESSAGE)`. Same six steps as §2.7.2 but run
against **the campaign the `user` account cannot write to** (`E2E_FOREIGN_CAMPAIGN_ID`), for steps 3–5
only — create a unit, rename it, delete it, then stop. It must not delete a campaign it did not create.
This proves "admin unchanged: any campaign".

#### 2.7.5 `viewer`, and the `user` negative case — SQL probes

**There is no `viewer` account on dev** (wp0.4 dev-state: 9 profiles, all `admin` before the hygiene run;
after it, `admin` and `user` only). Two options:

- **Recommended, no operator input:** a rolled-back transaction that temporarily demotes a real dev
  profile to `viewer`, impersonates it, and probes. Nothing persists.
- **Optional, cleaner:** the operator creates a dev `viewer` account and supplies
  `E2E_VIEWER_EMAIL` / `E2E_VIEWER_PASSWORD`, and a third Playwright project asserts the same controls
  are absent. Listed as an operator input in §10; **not** a blocker.

**New file:** `scripts/data-hygiene/oux-wp1.6/95_role_probes.sql` (dev only; header says so in capitals).
Run with `psql "$DEV_DB_URL" -v ON_ERROR_STOP=1 -f scripts/data-hygiene/oux-wp1.6/95_role_probes.sql`.

```sql
-- WP1.6 role probes. DEV ONLY (dpnnmkhabysfdogllsyh). Never run against production.
-- Everything happens inside one transaction that ALWAYS rolls back.
\set ON_ERROR_STOP on
\timing off

BEGIN;

-- 0. Discovery: a campaign the E2E user account can write to, and one it cannot.
--    Replace :'e2e_uid' with the e2e account's auth uid (SELECT user_id FROM user_profiles
--    WHERE display_name = '<the e2e account>'), recorded in the verification section.
\set e2e_uid '00000000-0000-0000-0000-000000000000'

SELECT set_config('request.jwt.claims',
       json_build_object('sub', :'e2e_uid', 'role', 'authenticated')::text, true);

SELECT c.campaign_id, c.name, c.is_standing, c.created_by,
       public.can_write_to_campaign(c.campaign_id) AS writable
FROM public.campaigns c
WHERE c.is_sms_episode = false
ORDER BY c.campaign_id;
-- Record: at least one writable = true (positive fixture) and one false
-- (E2E_FOREIGN_CAMPAIGN_ID for §2.7.3 / §2.7.4).

-- 1. Negative case for the `user` role: writes against a campaign it cannot write to.
--    :foreign_ou_id is an ou_id belonging to a campaign whose `writable` above was false.
\set foreign_campaign_id 0
\set foreign_ou_id 0

SET LOCAL ROLE authenticated;

DO $probe$
DECLARE n int;
BEGIN
  BEGIN
    INSERT INTO public.campaign_organising_units (campaign_id, ou_type, name)
    VALUES (current_setting('wp16.foreign_campaign_id')::int, 'custom', 'wp16 probe');
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE WARNING 'FAIL user/insert campaign_organising_units on foreign campaign: % row(s)', n;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS user/insert campaign_organising_units on foreign campaign: 42501';
  END;

  UPDATE public.campaign_organising_units
     SET name = name || ' wp16'
   WHERE ou_id = current_setting('wp16.foreign_ou_id')::int;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '% user/update campaign_organising_units on foreign campaign: % row(s)',
               CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END, n;

  DELETE FROM public.campaign_worker_ou
   WHERE ou_id = current_setting('wp16.foreign_ou_id')::int;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '% user/delete campaign_worker_ou on foreign campaign: % row(s)',
               CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END, n;

  DELETE FROM public.campaign_worker_membership
   WHERE campaign_id = current_setting('wp16.foreign_campaign_id')::int;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '% user/delete campaign_worker_membership on foreign campaign: % row(s)',
               CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END, n;

  DELETE FROM public.campaign_organising_units
   WHERE ou_id = current_setting('wp16.foreign_ou_id')::int;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '% user/delete campaign_organising_units on foreign campaign: % row(s)',
               CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END, n;
END
$probe$;

RESET ROLE;

-- 2. Viewer case. Borrow the same account and demote it for this transaction only.
UPDATE public.user_profiles SET role = 'viewer' WHERE user_id = :'e2e_uid';

SET LOCAL ROLE authenticated;   -- claims are still :'e2e_uid' from step 0

DO $probe$
DECLARE n int;
BEGIN
  -- Insert on ANY campaign, including the standing one: the role floor in the WP1.6
  -- policies must stop a viewer even where can_write_to_campaign() returns true.
  BEGIN
    INSERT INTO public.campaign_organising_units (campaign_id, ou_type, name)
    SELECT c.campaign_id, 'custom', 'wp16 viewer probe'
    FROM public.campaigns c ORDER BY c.is_standing DESC, c.campaign_id LIMIT 1;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE WARNING 'FAIL viewer/insert campaign_organising_units: % row(s)', n;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS viewer/insert campaign_organising_units: 42501';
  END;

  BEGIN
    INSERT INTO public.campaigns (name, campaign_type, status)
    VALUES ('wp16 viewer probe', 'organising', 'planning');
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE WARNING 'FAIL viewer/insert campaigns: % row(s)', n;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS viewer/insert campaigns: 42501';
  END;

  UPDATE public.campaigns SET notes = coalesce(notes, '') || 'wp16';
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '% viewer/update campaigns: % row(s)', CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END, n;

  DELETE FROM public.campaign_worker_ou WHERE true;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '% viewer/delete campaign_worker_ou: % row(s)', CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END, n;

  DELETE FROM public.campaign_worker_membership WHERE true;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '% viewer/delete campaign_worker_membership: % row(s)', CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END, n;

  DELETE FROM public.campaign_leader_worker_links WHERE true;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '% viewer/delete campaign_leader_worker_links: % row(s)', CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END, n;
END
$probe$;

RESET ROLE;

ROLLBACK;   -- nothing above survives: not the demotion, not any probe row
```

Implementation notes the implementer must honour:

- The `current_setting('wp16.…')` reads need the values set once as postgres before the role switch:
  `SELECT set_config('wp16.foreign_campaign_id', :'foreign_campaign_id', true), set_config('wp16.foreign_ou_id', :'foreign_ou_id', true);`
  (psql `\set` variables are not visible inside a `DO` body).
- Each probe that can raise is wrapped in its own `BEGIN … EXCEPTION … END` sub-block so a `42501` does
  not abort the outer transaction and strand the remaining probes.
- `SET LOCAL ROLE authenticated` is required: RLS is not enforced for the table owner or a superuser, so
  probing as `postgres` would prove nothing.
- Expected output is **PASS on every line**. Any `WARNING … FAIL` is a failed acceptance criterion.

**Practicality verdict:** this is practical and is the recommended route. A dedicated dev `viewer`
account is nicer for the e2e layer but is not needed to satisfy the acceptance criterion.

### 2.8 Unit tests (vitest)

| File | Covers |
|---|---|
| `src/lib/auth/__tests__/work-role-flags.test.ts` | `deriveWorkRoleFlags`: null profile; `work_role: null`; each of the six CHECK values (`B:9887-9900`); asserts `coordinator` and `industrial_coordinator` are `isLeadOrganiser`, `specialist` and `industrial_officer` are neither |
| `src/lib/supabase/__tests__/assert-rows-affected.test.ts` | `assertRowsAffected`: rethrows `result.error` untouched; `count === expected` passes; `count < expected` throws `NoRowsAffectedError` with `expected`/`actual` populated and a message naming the permission remedy; `count === null` passes (caller omitted `{ count: "exact" }`); `expected <= 0` passes; `count > expected` passes |

The policies themselves are not unit-testable — they are proved by §2.6's `pg_policies` diff and §2.7's
probes. No test asserts on migration file text (the WP0.2 lesson at PROGRESS "Baseline": a test that
reads a migration path broke when the ledger was rebased).

### 2.9 Verification commands

From `apps/organising-db`:

```bash
pnpm lint      # 143 errors / 151 warnings is the standing baseline; must not rise, and every
               # file this package touches must be clean on its changed lines
pnpm test      # new: 2 files; must stay green and add no failures
pnpm build
```

From the repo root:

```bash
pnpm validate:migrations
SUPABASE_PROJECT_REF=dpnnmkhabysfdogllsyh pnpm gen:types
```

Against the branch's Vercel Preview (dev-backed), from `apps/organising-db`:

```bash
E2E_BASE_URL=<branch preview url> \
E2E_FOREIGN_CAMPAIGN_ID=<from the §2.7.5 discovery query> \
pnpm e2e
# E2E_USER_* and E2E_ADMIN_* come from the operator's shell profile; never printed, never committed.
```

Acceptance mapping:

| Criterion | Proof |
|---|---|
| migration moves the write policies to `can_write_to_campaign()` | §2.6 before/after `pg_policies` snapshots pasted into the verification section |
| `isLeadOrganiser` in the auth context | `pnpm test` (work-role-flags) + `pnpm build` |
| UI stops offering deletes that fail | §2.7.3 UI assertions (controls absent) + §2.8 `assert-rows-affected` tests + §2.7.2 step 5's "no alert fired" assertion |
| role coverage: `admin` | `chromium-admin` project green (§2.7.4) |
| role coverage: `user` | `chromium` project green (§2.7.2) + `user` probes PASS (§2.7.5 part 1) |
| role coverage: `viewer` | `viewer` probes PASS (§2.7.5 part 2) |
| migration rehearsal recorded | `db push --dry-run`, `db push`, `migration list`, `validate:migrations` output transcribed into this file |

---

## 3. Sequencing and rollback

### 3.1 Order of operations with WP0.4 script 01

WP0.4 §3.5's recommendation, accepted by the operator, is **00 → 02 → 03 → 01 with 01 held until WP1.6 is
on production**. The reason is exactly this package: 01 costs the seven organisers their deletes, and
WP1.6 gives them back, campaign-scoped.

Two hard ordering rules:

1. **Script 02 must already have run wherever this migration lands.** Without the
   `campaign_organisers` backfill, an existing campaign's `user`-role organiser matches none of
   `can_write_to_campaign`'s arms: arm 1 of `is_lead_organiser_for_campaign` needs a lead/coordinator
   `work_role` (`B:3714-3722`), `is_campaign_creator` needs `created_by` (NULL on every pre-2026-09-09
   row), `is_assigned_to_campaign` needs a roster row (`B:3665-3671`). They would lose insert and update
   they have today. On **dev** this is already satisfied (PROGRESS: 02 inserted 5 on 2026-09-08). On
   **production** it is the §8 pre-flight query's job to prove it before the deploy.
2. **Script 01 runs after this migration is live on production**, per the held decision. Between the
   deploy and 01, nothing changes for anyone: the seven are still `admin`, and `is_admin()` is the first
   real arm of `can_write_to_campaign` (`B:1003`).

Recommended production sequence: 00 → 02 → 03 (already queued) → deploy WP1.6 → verify with the §8
post-flight query → run 01 → spot-check one converted account.

### 3.2 Rollback

**New file:** `scripts/data-hygiene/oux-wp1.6/90_rollback_wp1_6_policies.sql`, plus a
`scripts/data-hygiene/oux-wp1.6/README.md`. This follows the WP0.4 convention exactly and honours
`scripts/data-hygiene/README.md`: *"Nothing here is a migration: never copy these files under
`supabase/migrations/` and never run them with `supabase db push`."* A down-migration under
`supabase/migrations/` would be worse — it would be replayed on every fresh environment and would undo
the package by design.

Contents, in this order:

```sql
-- WP1.6 rollback. Operator-run. NOT a migration.
BEGIN;

-- 1. Drop the WP1.6 write policies (15).
DROP POLICY IF EXISTS "wp16_campaigns_insert"  ON "public"."campaigns";
-- … all 15 wp16_* names …

-- 2. Restore the generation-1 policies, character for character from
--    20260908050000_baseline_schema.sql lines 25549, 25553, 25581, 25585, 25593,
--    25955, 25959, 26003, 26007, 26015, 26327, 26331, 26371, 26375, 26383.
CREATE POLICY "Admin can delete campaigns" ON "public"."campaigns"
  FOR DELETE TO "authenticated" USING (("public"."get_user_role"() = 'admin'::"text"));
-- … the other 14, quoted verbatim from the baseline …

-- 3. Restore delete_campaign() to its baseline body (B:1768-1801) and comment (B:1807).
-- 4. Drop the new function.
DROP FUNCTION IF EXISTS "public"."campaigns_i_can_write"(integer[]);

-- 5. Leave campaigns.created_by DEFAULT auth.uid() IN PLACE.
--    It is harmless under the old policies (which never read created_by) and dropping it would
--    silently un-attribute campaigns created between the deploy and the rollback. To drop it
--    anyway: ALTER TABLE public.campaigns ALTER COLUMN created_by DROP DEFAULT;

COMMIT;
```

The rollback is **not** idempotent-safe against a partially applied migration; it assumes the migration
completed. `db push` is transactional per file, so a partial apply cannot happen.

Client code is safe under rollback: `useCampaignWriteAccess` would 404 on the dropped RPC, React Query
would surface `isLoading: false` with `data === undefined`, and §2.4's `useCanWriteToCampaign` returns
`false` — controls hide rather than break. If the rollback is expected to be long-lived, revert the app
commit too.

---

## 4. Risks

| # | Risk | Rule it could break | Mitigation |
|---|---|---|---|
| R1 | **Organisers locked out of campaigns with no roster row.** If script 02 has not run, or ran before a campaign was created, the campaign's `user`-role organiser loses insert/update they have today | "Nothing is removed from the product" | §8 pre-flight query, run by the verifier on dev and by the operator on production **before** the deploy; expected result zero rows. §3.1 rule 1 |
| R2 | **Viewers gain write** if the role floor in §2.0 is dropped in review as "redundant" | Acceptance: "`viewer` unchanged: read-only" | §2.0 states the reason inline; §2.7.5 part 2 proves it; a comment in the migration names `B:997-1001` as the cause |
| R3 | **Any `user` could delete the standing campaign** via `can_write_to_campaign`'s first arm | Data loss on the shared "OA Membership Outreach" container | Explicit `is_standing = false` guard on the `campaigns` DELETE policy (§2.1.3); `delete_campaign` deliberately does **not** use `can_write_to_campaign` (§2.1.7) |
| R4 | **Cross-campaign universe sync starts throwing 42501** and breaks every worker move, import and add-worker path | "Full mode keeps working" | §2.5's filter is mandatory, not optional. Behaviour change (workers no longer auto-enrol into campaigns the actor cannot write to) is recorded in the PR and the ledger; follow-up RPC in §9 |
| R5 | **Per-row cost of `can_write_to_campaign` on bulk deletes.** `useRemoveWorkerFromCampaign:77-83` and `move-worker-mutation.ts:83-90` delete tens to hundreds of `campaign_worker_ou` rows; the policy evaluates a `SECURITY DEFINER` SQL function per row through a join | Wall-chart performance budget | Existing policies already call `can_write_to_campaign` per row on `campaign_organisers`, `campaign_activities` and 40-odd other tables at the same data scale (dev: 113 `campaign_worker_ou` rows; production: ~673 memberships, `M:20260605120000:17`). Verifier runs `EXPLAIN (ANALYZE, BUFFERS)` on a 100-row `campaign_worker_ou` delete as `authenticated` inside the §2.7.5 transaction and records the timing. If it regresses, the fallback is a single-campaign-scoped policy variant, not a revert |
| R6 | `campaigns_i_can_write` is `SECURITY DEFINER` and could leak campaign existence | Least privilege | It returns only ids the caller passed in, and `campaigns` SELECT is already `USING (true)` for `authenticated` (`B:27041`). `REVOKE … FROM PUBLIC, anon` in §2.1.6 |
| R7 | **The list-page gate and `delete_campaign`'s rule differ** (§2.4a): a team member who is not lead or creator sees the button and gets `not_authorized` | "UI stops offering deletes that fail" — partially | Documented; `campaign-delete-dialog.tsx:25-27` already renders a real, specific message. Recorded in §9 as deliberately deferred |
| R8 | `auth.uid()` as a column default returns NULL for service-role and psql inserts | `created_by` incomplete | Same as today (nothing sets it except the SMS episode route). Stated in the column comment. No creation path depends on it being non-NULL |
| R9 | Two projects in `playwright.config.ts` could make the existing `wall-chart.spec.ts` run twice | e2e signal | `testIgnore`/`testMatch` in §2.7.1 confine the admin project to `tests/e2e/roles/*-admin.spec.ts` |
| R10 | Lint debt: touched files are large (`campaign-wall-chart.tsx`, `campaign-units-section.tsx`) | PROGRESS standing note | Only changed lines must lint clean and the 143/151 totals must not rise |

---

## 5. File-by-file summary

**New**

| Path | Purpose |
|---|---|
| `supabase/migrations/20260909093000_wp1_6_campaign_write_policies.sql` | §2.1 — default, 15 dropped policies, 15 new policies, `campaigns_i_can_write`, `delete_campaign` |
| `apps/organising-db/src/lib/auth/work-role-flags.ts` | §2.3 — `deriveWorkRoleFlags`, `LEAD_WORK_ROLES` |
| `apps/organising-db/src/lib/auth/__tests__/work-role-flags.test.ts` | §2.8 |
| `apps/organising-db/src/lib/supabase/assert-rows-affected.ts` | §2.4b — `assertRowsAffected`, `NoRowsAffectedError` |
| `apps/organising-db/src/lib/supabase/__tests__/assert-rows-affected.test.ts` | §2.8 |
| `apps/organising-db/src/lib/hooks/useCampaignWriteAccess.ts` | §2.4a — `useCampaignWriteAccess`, `useCanWriteToCampaign` |
| `apps/organising-db/tests/e2e/roles/unit-lifecycle-user.spec.ts` | §2.7.2, §2.7.3 |
| `apps/organising-db/tests/e2e/roles/unit-lifecycle-admin.spec.ts` | §2.7.4 |
| `scripts/data-hygiene/oux-wp1.6/95_role_probes.sql` | §2.7.5 |
| `scripts/data-hygiene/oux-wp1.6/90_rollback_wp1_6_policies.sql` | §3.2 |
| `scripts/data-hygiene/oux-wp1.6/README.md` | run order, dev-only warning, "not a migration" |

**Changed**

| Path:line | Change |
|---|---|
| `src/lib/supabase/auth-context.tsx:30-42, 44-61, 370-385` | `isLeadOrganiser`, `isOrganiser` on the type, the default value and the provider |
| `src/lib/campaign/resolve-campaign-organiser.ts:43, 80-84` | `isAdmin` → `canLinkOtherOrganisers`; message reworded |
| `src/components/campaigns/campaign-basics-edit-sheet.tsx:234-238` | pass the new flag |
| `src/components/campaigns/task-lists/create-task-list-dialog.tsx:474-478` | pass the new flag |
| `src/components/campaigns/campaign-settings.tsx:361-365` | pass the new flag |
| `src/components/campaigns/campaign-wizard.tsx:560-563, 617-620` | pass the new flag (both) |
| `src/app/(dashboard)/campaigns/new/manual/page.tsx:43, 61-65` | pass the new flag |
| `src/app/api/campaigns/[id]/worker-lists/[listId]/fire/task/route.ts:92-97` | derive the flag server-side via `deriveWorkRoleFlags` |
| `src/app/(dashboard)/campaigns/[id]/page.tsx:238` | `canWrite` becomes campaign-scoped |
| `src/app/(dashboard)/campaigns/page.tsx:141, 272-295` | per-row delete gate from `useCampaignWriteAccess` |
| `src/components/campaigns/wall-chart/delete-organising-unit-dialog.tsx:155-160, 167-173, 175-179` | `{ count: "exact" }` + `assertRowsAffected` |
| `src/components/campaigns/wall-chart/move-worker-mutation.ts:83-90, 217-224` | assert the counts it already collects |
| `src/lib/hooks/useRemoveWorkerFromCampaign.ts:77-83, 86-91` | `{ count: "exact" }` + assert on membership |
| `src/components/campaigns/campaign-units-section.tsx:722, 755-760, 801-807` | `{ count: "exact" }` + `assertRowsAffected` |
| `src/components/campaigns/wall-chart/use-leader-links.ts:209-224` | `{ count: "exact" }` + assert + `onError` toast |
| `src/lib/workers/sync-campaign-universe.ts:213-217, 240-246` | filter targets by `campaigns_i_can_write`; `campaignsSkippedNoAccess` on the result |
| `playwright.config.ts:18, 33` | second storage state and project |
| `tests/e2e/env.ts:9-14` | admin credentials |
| `tests/e2e/global-setup.ts:28-53` | sign in twice |
| `packages/db-types/generated.ts` | regenerated (new RPC entry only) |
| `docs/organiser-ux-review/PROGRESS.md` | ledger row 1.6, and the WP0.4 human-task row noting 01 is now unblocked |

---

## 6. Pre-flight and post-flight queries

**Pre-flight (R1). Run on dev by the verifier and on production by the operator, before the deploy.**
Every non-episode, non-standing campaign must have a route to write access for its own organiser:

```sql
-- Campaigns whose named organiser would LOSE write access. Expect zero rows.
-- (Fix round 1: role = 'user' — only user-role accounts can lose anything; viewers have no
-- write access before or after. work_role IS NULL is included: NOT IN (...) alone is NULL
-- for those rows and silently drops exactly the accounts this query exists to find.)
SELECT c.campaign_id, c.name, c.organiser_id, up.display_name, up.role, up.work_role
FROM public.campaigns c
JOIN public.organisers o     ON o.organiser_id = c.organiser_id
JOIN public.user_profiles up ON up.organiser_id = o.organiser_id
WHERE c.is_sms_episode = false
  AND c.is_standing = false
  AND up.role = 'user'
  AND c.created_by IS DISTINCT FROM up.user_id
  AND (
    up.work_role IS NULL
    OR up.work_role NOT IN ('lead_organiser', 'coordinator', 'industrial_coordinator')
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.campaign_organisers co
    WHERE co.campaign_id = c.campaign_id AND co.organiser_id = o.organiser_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.campaign_edit_permissions cep
    WHERE cep.campaign_id = c.campaign_id AND cep.granted_to = up.user_id AND cep.status = 'active'
  )
ORDER BY c.campaign_id;
```

Any row means WP0.4 script 02 has not covered that campaign. **Do not deploy until it returns zero.**
Because 01 is held on production, `up.role = 'user'` will filter almost everything out there today;
re-run it immediately **before** running 01, when it becomes the meaningful check. The query is
checked in as `scripts/data-hygiene/oux-wp1.6/00_preflight_organiser_write_access.sql` (read-only,
safe on production) and the post-flight below as `01_postflight_write_coverage.sql`; the folder README
carries the production run sheet.

**Post-flight.** Per-account write coverage, so the operator can see the shape of the change:

```sql
SELECT up.display_name, up.role, up.work_role,
       count(*) FILTER (WHERE co.campaign_id IS NOT NULL) AS campaigns_on_roster,
       count(*) FILTER (WHERE c.created_by = up.user_id)  AS campaigns_created
FROM public.user_profiles up
LEFT JOIN public.organisers o          ON o.organiser_id = up.organiser_id
LEFT JOIN public.campaign_organisers co ON co.organiser_id = o.organiser_id
LEFT JOIN public.campaigns c            ON c.created_by = up.user_id
GROUP BY 1,2,3
ORDER BY 2, 1;
```

---

## 7. Out of scope

Things I was tempted to include and did not:

- **Organiser mode UI, module registry, navigation.** `isOrganiser` is exposed here; WP1.1 and WP1.2 use it.
- **Per-campaign module toggles** and any `app_settings` / `user_profiles` preference column
  (appendix C 6.3, appendix D 5.6, appendix D 10 item 5).
- **The permission-request UI.** `src/components/permissions/{my-permissions-panel,pending-requests-panel,request-campaign-access-modal}.tsx`
  are imported by no page (appendix D 5.4) and `/api/permissions/*` is called only by them. This package
  makes `has_campaign_edit_permission` load-bearing for the first time, which strengthens the case for
  surfacing that UI — but wiring it is a package of its own.
- **Restoring the Administration page or any `/api/admin/*` route to `user` accounts.** wp0.4 §3.5b:
  "WP1.6 does not restore the Administration page, and should not."
- **Bringing the remaining generation-1 tables under `can_write_to_campaign`** —
  `campaign_employers`, `campaign_worksites`, `campaign_prospective_workers`, `campaign_unit_rules`,
  `campaign_ou_candidates`, `worker_*_options` (appendix C 6.2). One `campaign_unit_rules` delete gets
  the `assertRowsAffected` treatment because it sits in a file this package already touches, but no
  policy on those tables changes.
- **A `SECURITY DEFINER` universe-sync RPC** to keep cross-campaign enrolment org-wide (§2.5, R4).
  Recommended as a follow-up work package.
- **Reconciling `delete_campaign`'s rule with `campaigns_i_can_write`** so the list-page gate is exact
  (§2.4a, R7). Deferred deliberately; the dialog already shows a real error.
- **Deduplicating the second profile fetch** in `useCurrentUserProfile`
  (`src/lib/hooks/usePlannerOptions.ts:172-192`, appendix D 5.2).
- **`campaigns.created_by` backfill** for historical rows. Unknowable; `campaign_organisers` covers them.
- **Removing the dead `'coordinator'` branches** in the `worker_campaign_connections` policies
  (appendix C 6.2's third practical consequence — `'coordinator'` is not a legal `user_profiles.role`).
- **`reports_to` for the "my team" view** (plan 5.10's second bullet). That is WP1.3.

---

## 8. Open questions for the operator

1. **Admin e2e credentials.** `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` for a dev account with
   `role = 'admin'` — after the 2026-09-08 hygiene run, dev's remaining admins are the two lead
   organisers, the coordinator and the industrial coordinator. Supplied through the environment only,
   as with `E2E_USER_*`. Without them the admin project skips cleanly and that acceptance row is
   unproven.
2. **A dev `viewer` account (optional).** §2.7.5's rolled-back SQL probes satisfy the criterion without
   one. If you want the viewer path covered at the UI layer too, supply `E2E_VIEWER_EMAIL` /
   `E2E_VIEWER_PASSWORD` and I will add a third Playwright project. **Assumption if silent: SQL probes only.**
3. **Behaviour change to sign off (§2.1.9, row 5).** After this package a `user`-role organiser can no
   longer create or edit units on a campaign they are not on. Today any staff account can (appendix C
   6.2). Plan 5.10 asks for exactly this; confirming it is a product change, not a bug.
4. **Behaviour change to sign off (§2.5, R4).** Moving or importing a worker will no longer auto-enrol
   them into matching campaigns the actor cannot write to. Nothing fails; the enrolment is skipped and
   counted. **Assumption if silent: proceed as specified**, with a follow-up package for the
   `SECURITY DEFINER` sync.
5. **Production pre-flight (§6).** The pre-flight query must return zero rows on production **twice**:
   once before the WP1.6 deploy and once immediately before running WP0.4 script 01. Confirm you will
   run it and paste the output, since no agent may touch `gteygwfgjvczanmrwgbr`.
6. **`campaign_leader_worker_links` as a fifth table (§2.1.8).** Recommended in; strike it if you want
   the package to match the four-table wording exactly, at the cost of one remaining silent no-op.

## 9. Orchestrator position (2026-09-09, approval pending two operator sign-offs)

Plan accepted in substance. Orchestrator answers to section 8: (1) admin credentials requested from the operator as `E2E_ADMIN_*`; (2) SQL probes only, no viewer account; (6) **include** `campaign_leader_worker_links` as the fifth table (the plan's reasons stand; leaving one silent no-op defeats the package's purpose). Questions 3, 4 and 5 are the operator's: two behaviour changes (a `user` can no longer create or edit units on campaigns they are not on; worker moves and imports no longer auto-enrol into campaigns the actor cannot write to) and the commitment to run the production pre-flight query twice. Implementation does not start until those three are answered. The role floor (`role IN ('admin','user') AND can_write_to_campaign(...)`) is mandatory and the reviewer (Fable) must confirm no policy lacks it. Reviewer tier: Fable (RLS).

**Added scope (orchestrator, 2026-09-09, from the WP1.1 review).** The baseline policy "Users can update own profile" (`20260908050000_baseline_schema.sql:27887`) together with `GRANT ALL ON TABLE user_profiles TO authenticated` (`:31208`) and no column-level grants or guard trigger means an authenticated `user` can `PATCH /rest/v1/user_profiles?user_id=eq.<self>` and set `role = 'admin'` (or `work_role`, `organiser_id`, `reports_to`), which `get_user_role()` (`:3346`) then trusts. WP1.6 must close this: restrict self-updates to the columns a user may legitimately edit (display_name, phone; optionally workspace_prefs) via a BEFORE UPDATE trigger that rejects changes to `role`, `work_role`, `organiser_id`, `reports_to` unless `is_admin()`, or via column-level grants; include a rolled-back probe proving a `user` cannot escalate; verify the admin `update-user` route (service role) still works. This is blocking for WP1.6's review.

**Operator sign-offs (2026-09-09): YES to all three.** (3) A `user`-role organiser can only create or edit units on campaigns they are on (organiser, team, creator or edit grant); (4) worker moves and imports no longer auto-enrol into campaigns the actor cannot write to, the skipped count is reported, a privileged sync is a possible follow-up; (5) the operator will run the production pre-flight query before the WP1.6 deploy and again before hygiene script 01. Admin e2e credentials are in place (`E2E_ADMIN_*`). **WP1.6 is approved for implementation** after WP1.5 clears the checkout, with the added profile self-escalation scope. Implementer: Fable (high-risk). Reviewer: Fable.

## 10. Orchestrator approval

**Approved 2026-09-09** with the operator's three sign-offs recorded above and the added profile self-escalation scope (mandatory). Include `campaign_leader_worker_links` as the fifth table. Every new write policy carries the role floor `get_user_role() IN ('admin','user') AND can_write_to_campaign(...)`. Branch `feat/oux-wp1.6-auth-rls`, stacked on WP1.5 → WP1.1; PR base `develop`. Implementer: Fable. Reviewer: Fable. The verifier applies the migration to dev only (CLI linked to dev; confirm `supabase/.temp/project-ref` first), runs the pre-flight query on dev, regenerates types from dev, runs the role-coverage e2e with the `user` and `admin` projects against the branch preview, and runs the rolled-back SQL probes (viewer and the self-escalation probe).

## 11. Deviations from plan

Implementer (Fable), 2026-09-09. Everything in §2 is implemented as written except the items below.

1. **Migration filename** — `20260909120000_wp1_6_campaign_write_policies.sql`, not the plan's
   `20260909093000_…`. The plan was written before WP1.1's `20260909100000_workspace_mode.sql` existed;
   `093000 < 100000` would have sorted the WP1.6 file *before* WP1.1's on a fresh environment (and `db push`
   on dev would have applied an "older" version after a newer one). `120000` applies after it. Every
   reference to the filename in §2.6 / §5 should be read as the `120000` file.
2. **Profile guard forces an RPC for organiser linking** (§9 added scope interacting with §2.2).
   `resolveCampaignOrganiserId` used to `INSERT organisers` then `UPDATE user_profiles SET organiser_id`
   from the **user-scoped** client (`:86-101`). The new BEFORE UPDATE guard rejects that write for every
   non-admin — including the *self* link that decision 8's note depends on (a `user` creating their first
   campaign with themselves assigned has no organisers row yet). A guard that let a non-admin set their own
   `organiser_id` from NULL would be an escalation (pointing at another organiser's id inherits every
   organiser-keyed arm of `can_write_to_campaign`). So the migration adds
   `link_organiser_for_profile(p_user_id uuid) RETURNS integer` — `SECURITY DEFINER`, owner `postgres`,
   gate `auth.uid() IS NOT NULL AND role IN ('admin','user') AND (p_user_id = auth.uid() OR
   is_coordinator_or_lead())`, idempotent (returns the existing id when already linked), `REVOKE … FROM
   PUBLIC, anon`. The resolver calls it instead of the two client writes; `canLinkOtherOrganisers` stays as
   the client-side pre-check for the friendly message and the RPC is the authority. Side effect that is a
   strict improvement: a `user`-role lead organiser linking a colleague now *works* (before this the
   `user_profiles` UPDATE was an RLS no-op for them and the resolver returned an unlinked id).
3. **Guard design detail** — the trigger function is `SECURITY INVOKER` on purpose and gates on
   `current_user IN ('authenticated','anon') AND NOT is_admin()`, because inside a `SECURITY DEFINER`
   function owned by `postgres` (`link_organiser_for_profile`, `delete_campaign`) `current_user` is
   `postgres`, and the service role runs as `service_role`. A `SECURITY DEFINER` trigger function would have
   reported `postgres` for everyone and made the check vacuous. `user_id` is guarded alongside the four
   columns the orchestrator listed (changing a PK to another account's uid is the same class of hole).
   `display_name`, `phone`, `workspace_prefs` and `updated_at` stay self-editable. Rollback drops the
   trigger, its function and the RPC.
4. **Probe pack extended** beyond §2.7.5: a positive `user` section (insert a campaign, confirm
   `created_by = auth.uid()`, insert/update/delete a unit on it, `delete_campaign()` succeeds), the
   self-escalation section (role, work_role, organiser_id, reports_to each 42501; display_name/phone/
   workspace_prefs still update; `link_organiser_for_profile(self)` works; `…(other)` is `not_authorized`
   for a plain organiser), a `delete_campaign()` and direct standing-campaign delete probe in the negative
   section, a `campaigns_i_can_write` emptiness probe for the viewer, and a final `service_role` section
   proving the admin routes' client can still change `role`/`work_role`. The §6 pre-flight query is
   embedded in the discovery step so the verifier gets it in the same run. Variables are passed with
   `-v` (defaults let a discovery-only pass run without them); `\if :{?var}` requires psql 10+.
5. **`move-worker-mutation.ts` "Move to Unassigned" expected count** is the number of distinct workers
   among refs whose `fromOuId` is non-null, not `workerIds.length` as the plan's table says: a worker
   dragged from Unassigned to Unassigned has no row to delete, and the plan's figure would have raised a
   false `NoRowsAffectedError` there. The per-ref delete keeps the plan's `expected = 1` and is inside the
   `mode === "move"` branch, so copy is unaffected.
6. **`useRemoveWorkerFromCampaign`** — the plan said to "capture the count and use it below" for the
   `campaign_worker_ou` delete. The only sensible use (warn when unit rows went but the membership did
   not) is unreachable because the membership assertion throws first, so the count is not captured; the
   call passes `expected = 0` (transport errors still rethrown) exactly as the plan's reasoning intends.
7. **Dialler gate shape** — the dialler has no "No longer in campaign universe" *panel*; removal is one of
   two call dispositions (`REMOVAL_CALL_DISPOSITIONS`). The gate hides those two disposition buttons
   when `useCanWriteToCampaign(campaignId)` is false (kept while loading), which is the same intent.
8. **`campaign_leader_worker_links` unlink call site** needed no extra gate: `WorkerRelationshipsTab`
   already renders every remove control inside `canWrite &&`, and it receives the campaign page's now
   campaign-scoped `canWrite`. `useDeleteLeaderLink` got the assertion and an `onError` toast as planned.
9. **Admin spec fallback** — when `E2E_FOREIGN_CAMPAIGN_ID` is unset the admin spec uses the first row on
   `/campaigns` rather than skipping, since "any campaign" is what it proves; with the id set it runs the
   contrast case the plan specifies. It never deletes a campaign.
10. **No new spec file for `planUniverseSyncTargets`** — its five cases were appended to the existing
    `src/lib/workers/__tests__/sync-campaign-universe.test.ts` instead of a new file.
11. **`packages/db-types/generated.ts` not regenerated here** (verifier's step, per the brief). No cast was
    needed at any `.rpc("campaigns_i_can_write")` / `.rpc("link_organiser_for_profile")` call site:
    `createClient()` in `src/lib/supabase/client.ts` returns an untyped `SupabaseClient`, the server
    `createClient()` returns an ungeneric `createServerClient(...)`, and `sync-campaign-universe.ts` takes
    `any`. `tsc --noEmit` passes without the regenerated types; regenerating adds the two function entries.
12. **PROGRESS.md not edited** (brief). §5's "Changed" table row for it is for the verifier/orchestrator.

### Implementer notes

**Migration:** `supabase/migrations/20260909120000_wp1_6_campaign_write_policies.sql` — every dropped
policy's baseline text is quoted in a comment directly above its `DROP` for diffing. `pnpm validate:migrations`
→ `Validated 5 Supabase migrations with unique 14-digit versions.`

**Files**

New: `supabase/migrations/20260909120000_wp1_6_campaign_write_policies.sql`;
`scripts/data-hygiene/oux-wp1.6/{README.md,90_rollback_wp1_6_policies.sql,95_role_probes.sql}`;
`apps/organising-db/src/lib/auth/work-role-flags.ts` + `__tests__/work-role-flags.test.ts`;
`apps/organising-db/src/lib/supabase/assert-rows-affected.ts` + `__tests__/assert-rows-affected.test.ts`;
`apps/organising-db/src/lib/hooks/useCampaignWriteAccess.ts`;
`apps/organising-db/tests/e2e/roles/{unit-lifecycle.ts,unit-lifecycle-user.spec.ts,unit-lifecycle-admin.spec.ts}`.

Changed (all under `apps/organising-db/`): `src/lib/supabase/auth-context.tsx`,
`src/lib/campaign/resolve-campaign-organiser.ts`, `src/components/campaigns/campaign-basics-edit-sheet.tsx`,
`src/components/campaigns/task-lists/create-task-list-dialog.tsx`, `src/components/campaigns/campaign-settings.tsx`,
`src/components/campaigns/campaign-wizard.tsx`, `src/app/(dashboard)/campaigns/new/manual/page.tsx`,
`src/app/api/campaigns/[id]/worker-lists/[listId]/fire/task/route.ts`, `src/app/(dashboard)/campaigns/[id]/page.tsx`,
`src/app/(dashboard)/campaigns/page.tsx`, `src/components/campaigns/wall-chart/delete-organising-unit-dialog.tsx`,
`src/components/campaigns/wall-chart/move-worker-mutation.ts`, `src/lib/hooks/useRemoveWorkerFromCampaign.ts`,
`src/components/campaigns/campaign-units-section.tsx`, `src/components/campaigns/wall-chart/use-leader-links.ts`,
`src/components/phone/CallSessionPage.tsx`, `src/lib/workers/sync-campaign-universe.ts`,
`src/lib/workers/__tests__/sync-campaign-universe.test.ts`, `playwright.config.ts`, `tests/e2e/env.ts`,
`tests/e2e/global-setup.ts`.

**Gates (2026-09-09, from `apps/organising-db` unless noted)**

- `pnpm exec eslint <every touched file>` → 3 errors / 1 warning, **all pre-existing at HEAD** on lines not
  touched (`delete-organising-unit-dialog.tsx:99` set-state-in-effect; `CallSessionPage.tsx:219`
  set-state-in-effect and `:527` exhaustive-deps — the same findings at `:98`, `:204`, `:512` in the HEAD
  versions via `git show HEAD:… | eslint --stdin`). Zero findings on changed lines.
- `pnpm test` → 63 files, 852 tests passed (3 new/extended: work-role-flags 10, assert-rows-affected 7,
  planUniverseSyncTargets 5).
- `pnpm exec tsc --noEmit -p tsconfig.json` → exit 0.
- `pnpm build` → exit 0.
- `env -u E2E_USER_EMAIL -u E2E_USER_PASSWORD -u E2E_ADMIN_EMAIL -u E2E_ADMIN_PASSWORD pnpm e2e` → 7 skipped,
  exit 0 (6 in `chromium`, 1 in `chromium-admin`; no spec runs twice).
- repo root `pnpm validate:migrations` → exit 0.

**Verifier hand-off (dev only — `dpnnmkhabysfdogllsyh`; never `gteygwfgjvczanmrwgbr`)**

1. `cat supabase/.temp/project-ref` must print `dpnnmkhabysfdogllsyh`; if not,
   `npx supabase link --project-ref dpnnmkhabysfdogllsyh`.
2. `env -u SUPABASE_DB_PASSWORD npx supabase migration list` — expect the three baseline files and
   `20260909100000` applied, `20260909120000` local-only.
3. Run the §2.6 "before" snapshot (three queries; `pg_proc` list should also include
   `link_organiser_for_profile`, `user_profiles_guard_privileged_columns`) and paste into §12.
4. `npx supabase db push --dry-run` — must list exactly `20260909120000_wp1_6_campaign_write_policies.sql`.
5. `npx supabase db push`.
6. Pre-flight query (§6) on dev — expect zero rows.
7. "After" `pg_policies` snapshot (same three queries) — expect 15 `wp16_*` rows with the §2.1 predicates,
   the 5 SELECT rows untouched, `column_default = auth.uid()`, `campaigns_i_can_write` and
   `link_organiser_for_profile` present, `delete_campaign` containing `is_campaign_creator`, and
   `SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.user_profiles'::regclass` including
   `trg_user_profiles_guard_privileged_columns`.
8. `SUPABASE_PROJECT_REF=dpnnmkhabysfdogllsyh pnpm gen:types` (repo root); `git diff --stat
   packages/db-types/generated.ts` — expect the two new function entries (and nothing for `created_by`).
9. From `apps/organising-db`: `pnpm exec tsc --noEmit -p tsconfig.json`, `pnpm test`, `pnpm build`.
10. Credentialled e2e, both projects, against the branch preview:
    `E2E_BASE_URL=<preview> E2E_FOREIGN_CAMPAIGN_ID=<from step 11's discovery> pnpm e2e` with
    `E2E_USER_*` / `E2E_ADMIN_*` from the shell. Run step 11's discovery pass first to get the foreign id.
11. `psql "$DEV_DB_URL" -v ON_ERROR_STOP=1 -v e2e_uid='<uid>' [-v foreign_campaign_id=… -v foreign_ou_id=…]
    -f scripts/data-hygiene/oux-wp1.6/95_role_probes.sql` — expect PASS on every line; paste the output.
    Optionally the R5 `EXPLAIN (ANALYZE, BUFFERS)` from the comment at the end of the file.
12. Verify `/api/admin/update-user` still works as an admin (change a dev account's `work_role` and back) —
    the service-role path is also covered by probe section 5.

**Commits (branch `feat/oux-wp1.6-auth-rls`, stacked on WP1.5 → WP1.1)**

- `17fc01a` feat(oux-wp1.6): campaign write policies, profile guard, rollback and role probes
- `36f4600` feat(oux-wp1.6): isLeadOrganiser/isOrganiser in the auth context; organiser linking via RPC
- `6e1328f` feat(oux-wp1.6): campaign-scoped write gates and loud deletes
- `e8fe3ed` feat(oux-wp1.6): role-coverage e2e for user and admin, second Playwright project
- (this file) feat(oux-wp1.6): deviations and implementer notes

## 12. Verification output

Verifier run 2026-09-09 at 9ed0164; migration applied to dev dpnnmkhabysfdogllsyh; preview https://offshore-alliance-rl90168d8-reveille-strategy.vercel.app.

### 12.1 Pre-push state

```
$ cat supabase/.temp/project-ref
dpnnmkhabysfdogllsyh

$ pnpm validate:migrations
Validated 5 Supabase migrations with unique 14-digit versions.

$ env -u SUPABASE_DB_PASSWORD npx --no-install supabase migration list
   Local          | Remote         | Time (UTC)
  ----------------|----------------|---------------------
   20260908050000 | 20260908050000 | 2026-09-08 05:00:00
   20260908050100 | 20260908050100 | 2026-09-08 05:01:00
   20260908050200 | 20260908050200 | 2026-09-08 05:02:00
   20260909100000 | 20260909100000 | 2026-09-09 10:00:00
   20260909120000 |                | 2026-09-09 12:00:00
```
4 applied remote, `20260909120000` local-only — matches expectation.

### 12.2 "Before" snapshot (dev)

`pg_policies` for the six tables (5 write-policy tables + `user_profiles`): 15 generation-1 write
policies (5×DELETE `get_user_role() = 'admin'`, 5×INSERT and 5×UPDATE
`get_user_role() = ANY(ARRAY['admin','user'])`) plus 5 `USING (true)` SELECT rows, plus the three
pre-existing `user_profiles` policies (`Admin can insert profiles`, `Authenticated users can read
user_profiles`, `Users can read own profile`, `Users can update own profile` — the last with
`qual`/`with_check` = `(user_id = auth.uid()) OR (get_user_role() = 'admin')`, i.e. no column guard yet).

`campaigns.created_by` column_default: `null`.

### 12.3 Pre-flight query (§6, R1) — before push

Zero rows. **Pass** — no organiser would lose write access; script 02 backfill already covers dev.

### 12.4 Migration rehearsal

```
$ env -u SUPABASE_DB_PASSWORD npx --no-install supabase db push --dry-run
DRY RUN: migrations will *not* be pushed to the database.
Would push these migrations:
 • 20260909120000_wp1_6_campaign_write_policies.sql
Finished supabase db push.
```
Exactly the one expected file.

```
$ env -u SUPABASE_DB_PASSWORD npx --no-install supabase db push
Applying migration 20260909120000_wp1_6_campaign_write_policies.sql...
NOTICE (00000): trigger "trg_user_profiles_guard_privileged_columns" for relation "public.user_profiles" does not exist, skipping
Finished supabase db push.
```
The NOTICE is the migration's own `DROP TRIGGER IF EXISTS` guard firing on a first apply — expected, not
an error.

```
$ env -u SUPABASE_DB_PASSWORD npx --no-install supabase migration list
   Local          | Remote         | Time (UTC)
  ----------------|----------------|---------------------
   20260908050000 | 20260908050000 | 2026-09-08 05:00:00
   20260908050100 | 20260908050100 | 2026-09-08 05:01:00
   20260908050200 | 20260908050200 | 2026-09-08 05:02:00
   20260909100000 | 20260909100000 | 2026-09-09 10:00:00
   20260909120000 | 20260909120000 | 2026-09-09 12:00:00
```
All five applied.

### 12.5 Pre-flight query — after push

Re-ran (same query, dev unchanged in the meantime): zero rows. **Pass.**

### 12.6 "After" snapshot (dev)

`pg_policies`, `campaigns` write surface — 15 `wp16_*` rows, each with the role-floor-AND-scope shape:

- `campaigns`: `wp16_campaigns_insert` (`get_user_role() = ANY(ARRAY['admin','user'])`),
  `wp16_campaigns_update` (role floor AND `can_write_to_campaign(campaign_id)` on both USING/WITH CHECK),
  `wp16_campaigns_delete` (`is_admin() OR (is_standing = false AND role floor AND
  can_write_to_campaign(campaign_id))`).
- `campaign_organising_units`, `campaign_worker_membership`, `campaign_leader_worker_links`: each has
  `wp16_{cou,cwm,clwl}_{insert,update,delete}` with `role floor AND can_write_to_campaign(campaign_id)`.
- `campaign_worker_ou`: `wp16_cwo_{insert,update,delete}` with `role floor AND EXISTS (SELECT 1 FROM
  campaign_organising_units cou WHERE cou.ou_id = campaign_worker_ou.ou_id AND
  can_write_to_campaign(cou.campaign_id))`.
- All five `"Authenticated users can read …"` SELECT policies (`USING (true)`) untouched.
- `user_profiles`: the three pre-existing policies untouched (`Users can update own profile` still reads
  `(user_id = auth.uid()) OR (get_user_role() = 'admin')` — the column-level guard is enforced by the new
  trigger, not by this policy, per the implementer's deviation note 3).

`campaigns.created_by` column_default: `auth.uid()`. **Pass.**

`pg_proc` — `campaigns_i_can_write` (`prosecdef = true`), `delete_campaign` (`prosecdef = true`,
`SECURITY DEFINER`), `link_organiser_for_profile` (`prosecdef = true`) all present.
`delete_campaign`'s body contains `public.is_campaign_creator(p_campaign_id)` as a third OR arm alongside
`is_admin()` and `is_lead_organiser_for_campaign(p_campaign_id)`, with the comment explaining why it does
not use `can_write_to_campaign` (the standing-campaign arm).

`pg_trigger` on `user_profiles` (excluding internal): `trg_user_profiles_guard_privileged_columns`,
`trg_user_profiles_updated_at`. Both present.

### 12.7 Role probes (`scripts/data-hygiene/oux-wp1.6/95_role_probes.sql`)

Run via `mcp__…__execute_sql` against dev inside one `BEGIN … ROLLBACK` (the MCP tool does not surface
`RAISE NOTICE`/`WARNING`, so the probe body was mechanically rewritten to write each PASS/FAIL line into a
`CREATE TEMP TABLE` instead of `RAISE`, with a final `SELECT … ORDER BY seq` before the `ROLLBACK`; the
underlying assertions are unchanged from the committed file). `e2e_uid` was discovered by querying
`user_profiles` for `organiser_id = 10` (the id the WP0.4/WP0.2 hygiene run set for the e2e account per
PROGRESS): `f7c048e2-ecfe-4e9c-8715-7f4c899f0d37`, `display_name = "troy reveille"`, `role = "user"`,
`work_role = "organiser"` — the exact shape decision 8's note targets. `foreign_campaign_id = 3`
("Acme Energy EBA 2026 — DEMO", `writable = false`, `sample_ou_id = 8`) and `foreign_campaign_id = 1`
("testco1", `writable = true`) were read from the discovery query, i.e. `E2E_FOREIGN_CAMPAIGN_ID=3` for
the e2e negative case and the admin spec.

Raw output, in order (all 38 lines PASS, none WARNING/FAIL):

```
 1 PASS user/insert campaign_organising_units on foreign campaign: 42501
 2 PASS user/update campaign_organising_units on foreign campaign: 0 row(s)
 3 PASS user/update campaigns on foreign campaign: 0 row(s)
 4 PASS user/delete campaign_worker_ou on foreign campaign: 0 row(s)
 5 PASS user/delete campaign_worker_membership on foreign campaign: 0 row(s)
 6 PASS user/delete campaign_leader_worker_links on foreign campaign: 0 row(s)
 7 PASS user/delete campaign_organising_units on foreign campaign: 0 row(s)
 8 PASS user/delete campaigns (direct, foreign campaign): 0 row(s)
 9 PASS user/delete_campaign() on foreign campaign: not_authorized
10 PASS user/delete standing campaign (direct): 0 row(s)
11 PASS user/insert campaigns: created_by = auth.uid()
12 PASS user/can_write_to_campaign(own campaign)
13 PASS user/campaigns_i_can_write(own campaign)
14 PASS user/insert campaign_organising_units on own campaign
15 PASS user/update campaign_organising_units on own campaign: 1 row(s)
16 PASS user/delete campaign_organising_units on own campaign: 1 row(s)
17 PASS user/delete_campaign(own campaign)
18 PASS user/self-escalate role=admin: 42501
19 PASS user/self-escalate work_role=lead_organiser: 42501
20 PASS user/self-escalate organiser_id: 42501
21 PASS user/self-escalate reports_to: 42501
22 PASS user/update own display_name/phone/workspace_prefs: 1 row(s)
23 PASS user/link_organiser_for_profile(self) -> 10 (profile now 10)
24 PASS user/link_organiser_for_profile(other): not_authorized
25 PASS viewer/get_user_role() = viewer
26 PASS viewer/insert campaign_organising_units: 42501
27 PASS viewer/insert campaigns: 42501
28 PASS viewer/update campaigns: 0 row(s)
29 PASS viewer/update campaign_organising_units: 0 row(s)
30 PASS viewer/delete campaign_worker_ou: 0 row(s)
31 PASS viewer/delete campaign_worker_membership: 0 row(s)
32 PASS viewer/delete campaign_leader_worker_links: 0 row(s)
33 PASS viewer/delete campaign_organising_units: 0 row(s)
34 PASS viewer/delete campaigns: 0 row(s)
35 PASS viewer/campaigns_i_can_write(all) is empty
36 PASS viewer/self-escalate role=admin: 42501
37 PASS viewer/link_organiser_for_profile(self): not_authorized
38 PASS service_role/update role+work_role: 1 row(s)
```

Post-rollback check confirmed the transaction left no residue: `user_profiles` row for
`f7c048e2-ecfe-4e9c-8715-7f4c899f0d37` still reads `role='user', work_role='organiser',
organiser_id=10`, and `select count(*) from campaigns where name like 'wp16%'` = 0.

**R5 (per-row cost).** Dev's largest single-campaign `campaign_worker_ou` set is campaign 1 at 95 rows
(not the full 100 the plan asked for; dev has no campaign with ≥100). `EXPLAIN (ANALYZE, BUFFERS)` for a
95-row delete as `authenticated` (rolled back):

```
Delete on campaign_worker_ou  (actual time=22.762..22.763 rows=0 loops=1)
  Buffers: shared hit=1581 dirtied=1
  ->  Nested Loop  (actual time=20.915..22.499 rows=95 loops=1)
        Filter: (get_user_role() = ANY ('{admin,user}') AND …)
        SubPlan 2 -> Seq Scan on campaign_organising_units cou
              Filter: can_write_to_campaign(campaign_id)
Planning Time: 2.065 ms
Execution Time: 22.849 ms
```
22.8ms for 95 rows — no regression concern at dev/production scale (R5's own comparison point is
production's ~673-row `campaign_worker_membership`, i.e. the same order of magnitude).

### 12.8 Type regeneration

```
$ SUPABASE_PROJECT_REF=dpnnmkhabysfdogllsyh pnpm gen:types
$ git diff --stat packages/db-types/generated.ts
 packages/db-types/generated.ts | 8 ++++++++
 1 file changed, 8 insertions(+)
```
Diff contains exactly the two new function entries and nothing else:
```
+      campaigns_i_can_write: {
+        Args: { p_campaign_ids: number[] }
+        Returns: number[]
+      }
+      link_organiser_for_profile: {
+        Args: { p_user_id: string }
+        Returns: number
+      }
```
No change near `created_by` — confirms the plan's prediction that the DEFAULT does not affect generated
types. Committed alone as `9ed0164 chore(oux-wp1.6): regenerate database types from dev`.

### 12.9 App-level gates (from `apps/organising-db`)

```
$ pnpm exec tsc --noEmit -p tsconfig.json; echo tsc $?
tsc 0

$ pnpm test 2>&1 | grep -E 'Test Files|Tests |FAIL'
 Test Files  63 passed (63)
      Tests  852 passed (852)

$ pnpm lint 2>&1 | grep problems
✖ 294 problems (143 errors, 151 warnings)

$ pnpm build 2>&1 | tail -4
(clean production build, no errors; route manifest printed, ends with
"ƒ Proxy (Middleware)" / "ƒ  (Dynamic)  server-rendered on demand")
```
All four match the implementer's recorded baseline exactly (294/143/151 unchanged, 63/852 tests green,
tsc and build both exit 0).

### 12.10 Preview deployment

```
$ git rev-parse 2af8210
2af8210c574d8eacf3f553d9a31302932015ecb9

$ gh api "repos/R3v3ill3/OffshoreAlliance/deployments?sha=2af8210c574d8eacf3f553d9a31302932015ecb9&per_page=3"
```
One deployment found immediately (no polling needed): id `6343335761`, `environment=Preview`,
`created_at=2026-09-09T05:39:57Z`.

```
$ gh api "repos/R3v3ill3/OffshoreAlliance/deployments/6343335761/statuses"
```
`state=success`, `environment_url=https://offshore-alliance-rl90168d8-reveille-strategy.vercel.app`.

**Timing note.** The preview build (created 05:39:57Z) predates this verifier's `db push` (run later in
this same session, before the 05:56Z type-regen). This does not affect RLS correctness — policies are
evaluated by Postgres against the live database at request time, not baked into the Next.js build — and
the credentialled e2e below ran after the migration was live, against this same preview URL, confirming
the policies took effect for real HTTP requests.

### 12.11 Credentialled e2e (both projects, against the preview)

`E2E_FOREIGN_CAMPAIGN_ID=3` (from §12.7's discovery). `E2E_USER_*` / `E2E_ADMIN_*` read from the shell
profile; never printed.

Four attempts were made because the first three showed instability against the preview (browser crash,
global-setup login timeout, a strict-mode locator double-match) that looked environmental rather than
policy-related; the pattern across all runs is recorded below rather than only the last one, per "record
failures verbatim."

**Attempt 1 — full suite (`pnpm e2e`).** 4 failed, 1 skipped, 2 passed:
- `unit-lifecycle-user.spec.ts:37` (create/rename/delete own campaign) — failed at the rename step.
- `unit-lifecycle-user.spec.ts:80` (negative case, foreign campaign) — failed: `page.goto` to
  `/campaigns/3?...` exceeded the 30s timeout (`waitForResponse` on the write-access RPC did not
  resolve in time).
- `wall-chart.spec.ts:23` (pre-existing spec, not part of WP1.6) — failed: no worker tile / Unassigned
  card became visible within 5s on the campaign the spec opens.
- `unit-lifecycle-admin.spec.ts:25` — failed: `Test timeout of 180000ms exceeded` clicking "New unit"
  (element detached from DOM, retried, still timed out).
- 2 passed (`actions-hub.spec.ts` cases), 1 skipped (`mobile-dialer.spec.ts`, an unrelated pre-existing
  spec skipped for its own reasons, not WP1.6).

**Attempt 2 — `unit-lifecycle-user.spec.ts` only, `--retries=1`.** Both tests failed on the first try and
again on retry, with different symptoms each time:
- Test 1, try 1: `page.goto: Page crashed` navigating to `/campaigns/new/manual`. Try 2 (retry): reached
  the rename step and failed the same way as attempt 1 (`element(s) not found` for the just-created unit's
  row, `roles/unit-lifecycle.ts:90`).
- Test 2, try 1: failed with `strict mode violation` — the locator
  `locator('[data-worker-id]').first().or(locator('[data-ou-id="unassigned"]'))` resolved to **two**
  elements (an Unassigned card and a worker tile) instead of one, because `.first()` binds before `.or()`
  in this construction. This is a spec-locator defect, not an RLS symptom: the foreign campaign correctly
  has both a worker tile and an Unassigned card visible, the assertion just cannot express "at least one of
  either." Try 2 (retry): `Target page, context or browser has been closed` before the assertion ran.

**Attempt 3 — full suite again.** Global setup itself failed: `page.goto` to `/login` exceeded 30s
(`global-setup.ts:38`). Zero tests ran. A direct `curl` to the same `/login` URL immediately afterward
returned `http_code=200` in 0.57s, so the app was not down; this looks like resource contention from
repeated Chromium launches in the verifier's sandbox rather than a preview outage.

**Attempt 4 — full suite, `--workers=1`.** 3 failed, 1 skipped, 3 passed:
```
✓ actions-hub.spec.ts:22 (6.7s)
✓ actions-hub.spec.ts:62 (3.1s)
- mobile-dialer.spec.ts:30 (skipped, unrelated)
✘ unit-lifecycle-user.spec.ts:37 (37.3s) — same rename-step failure as attempts 1–2
✓ unit-lifecycle-user.spec.ts:80 (4.4s) — PASSED this time: negative case confirmed, no write
  controls rendered for the e2e `user` account on campaign 3
✘ wall-chart.spec.ts:23 (9.8s) — different failure this time: page never navigated to
  `/campaigns/<id>?...tab=workforce...sub=wall-chart` after clicking a row (`toHaveURL` timeout, URL
  stayed on `/campaigns`)
✘ unit-lifecycle-admin.spec.ts:25 (37.0s) — same rename-step failure as `unit-lifecycle-user.spec.ts:37`
```

**Pattern across all four attempts.** `unit-lifecycle-user.spec.ts:37` and `unit-lifecycle-admin.spec.ts:25`
failed at the identical point every time they got far enough to reach it: `renameUnit()`
(`tests/e2e/roles/unit-lifecycle.ts:90`) times out waiting for the row of the unit just created in the
same test to reappear on the Units tab (`div.rounded-md.border` containing a `p.font-medium` with the new
unit's name). This is reproducible and not obviously an artefact of preview instability, since the create
step immediately before it (and the delete step immediately after, when reached) succeeded. It is
recorded here without further diagnosis, per this task's "report without interpretation" instruction — a
finding for the reviewer/implementer to triage, not a change made by the verifier.

`unit-lifecycle-user.spec.ts:80` (the RLS-relevant negative case) **passed** on the one attempt that
reached a stable run (attempt 4), and the SQL probes in §12.7 already independently prove the same and
stronger claims (role floor, campaign scope, self-escalation, standing-campaign guard) with 38/38 PASS.
`wall-chart.spec.ts` is a pre-existing spec outside this package's scope; its two different failure modes
across attempts 1 and 4 look like preview-side flakiness rather than a WP1.6 regression, but are recorded
as observed.

Screenshot paths (from the last run, attempt 4; earlier attempts' screenshots were overwritten by
Playwright's `test-results/` reuse):
- `apps/organising-db/test-results/roles-unit-lifecycle-user--48198-tes-a-unit-and-the-campaign-chromium/test-failed-1.png`
- `apps/organising-db/test-results/wall-chart-Wall-chart-—-fl-4cc2a-igns-and-see-the-wall-chart-chromium/test-failed-1.png`
- `apps/organising-db/test-results/roles-unit-lifecycle-admin-00052-etes-a-unit-on-any-campaign-chromium-admin/test-failed-1.png`

### 12.12 Admin `update-user` route / service-role exemption

Trigger function body (`user_profiles_guard_privileged_columns`), read from `pg_proc`:

```sql
BEGIN
  IF NEW.user_id      IS DISTINCT FROM OLD.user_id
  OR NEW.role         IS DISTINCT FROM OLD.role
  OR NEW.work_role    IS DISTINCT FROM OLD.work_role
  OR NEW.organiser_id IS DISTINCT FROM OLD.organiser_id
  OR NEW.reports_to   IS DISTINCT FROM OLD.reports_to
  THEN
    IF current_user IN ('authenticated', 'anon') AND NOT public.is_admin() THEN
      RAISE EXCEPTION
        'Only an admin can change role, work_role, organiser_id or reports_to on a user profile'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
```

The gate is `current_user IN ('authenticated', 'anon') AND NOT public.is_admin()`. `service_role` is
neither `authenticated` nor `anon`, so the guard is a no-op for it regardless of `is_admin()` — exactly
what §11 deviation 3 describes (a `SECURITY INVOKER` trigger checking the literal Postgres role, not the
JWT claim, because `SECURITY DEFINER` callers would otherwise see `current_user = 'postgres'`).

`src/app/api/admin/update-user/route.ts` confirms the code path: it calls
`createAdminClient()` (`src/lib/supabase/admin.ts`, the service-role client) at line 104 and performs the
profile update through it, not through the user-scoped `createClient()` used earlier in the same route for
reads. Probe §12.7 line 38 (`service_role/update role+work_role: 1 row(s)` — PASS) independently confirms
this in the database: a direct `UPDATE user_profiles SET role='user', work_role='lead_organiser'` as
`service_role` succeeded where the identical statement as `authenticated` (probe section 3) raised 42501.

### 12.13 Summary table

| Step | Result | Key values |
|---|---|---|
| 1. project-ref / validate:migrations | green | `dpnnmkhabysfdogllsyh`; 5 migrations validated |
| 2. migration list (pre) | green | 4 applied remote, `20260909120000` local-only |
| 3. "before" snapshot | green | 15 gen-1 policies + 5 SELECT; `created_by` default NULL |
| 4. pre-flight (R1) | green | 0 rows |
| 5. db push (dry-run, real, list) | green | exactly one file; applied; 5/5 in migration list |
| 6. "after" snapshot + pg_proc + triggers | green | 15 `wp16_*` policies; `created_by` default `auth.uid()`; `campaigns_i_can_write`, `link_organiser_for_profile`, `delete_campaign` (with `is_campaign_creator`) present; both triggers present |
| 7. role probes | green | 38/38 PASS (user negative/positive, self-escalation, viewer, service_role); rollback verified clean; R5 22.8ms/95 rows |
| 8. type regen | green | 2 new function entries only, diff-stat +8/-0 |
| 9. tsc / test / lint / build | green | tsc 0; 63 files / 852 tests; 294 problems (143/151, baseline unchanged); build clean |
| 10. preview deployment | green | `environment_url` found immediately, `state=success` |
| 11. credentialled e2e | **mixed/red** | RLS-relevant cases pass (SQL probes 38/38; UI negative case passed on a stable run); a reproducible non-RLS failure in the shared `renameUnit()` helper blocks the create→rename→delete happy path for both `user` and `admin` specs across every attempt; one pre-existing, out-of-scope spec (`wall-chart.spec.ts`) also flaked |
| 12. admin route / service-role exemption | green | trigger gate quoted; route uses `createAdminClient()`; probe line 38 confirms in DB |

Preview: `https://offshore-alliance-rl90168d8-reveille-strategy.vercel.app`
Commits: `9ed0164` (types), `2af8210` (deviations/implementer notes, pre-existing) — full stack
`17fc01a 36f4600 6e1328f e8fe3ed 2af8210 9ed0164`.

## 13. Reviewer findings

_(reviewer)_
