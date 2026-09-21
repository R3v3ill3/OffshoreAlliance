# WP3.8 — Campaign families and shared assessments

Status: **Revision 1 (2026-09-17) — approved; §9.1 answered by the operator the same day (all recommendations); Stage 1 implementing.** Orchestrator amendments over Revision 0: §0.1 step 4 (no ledger catch-up on the realistic set; WP2.2a/b absent there, out of scope), §5.4 step 8 rewritten, §9.1 gains the `OUX_CONTRACT_ADMIN_*` input. Written against `main` at `e2cf34a2` (WP2.4c merged; lint baseline 298).
Branch: `feat/oux-wp3.8-campaign-families` off `main`. Draft PR into `main`. Migration package: the promotion gate of
`PROGRESS.md:18` applies.

Specification: `IMPLEMENTATION_ORCHESTRATION_PROMPT.md:178–207` (verbatim, binding). Decisions: `DECISIONS.md:20–21`,
`:55–78` — FAM-a, SET-a, SPN-a′, UNV-a, KND-a, MIR-a, ASC-a, RAT-a, VIEW-a, all confirmed by the operator on
2026-09-17. This plan does not reopen any of them. Facts recorded in `DECISIONS.md:74` (reader inventory, RLS line
numbers, the campaign-64 shape) are cited, not re-derived; where this plan found the inventory incomplete it says so
(§2, finding F1).

Environment rules that bind every step here: production `gteygwfgjvczanmrwgbr` is never read or written by an agent;
normal dev `dpnnmkhabysfdogllsyh` is read freely and mutated only with per-file operator approval; the realistic data
set `yqjkuobcawvigsfpgrcm` is read freely and mutated only under an approved run sheet (`PROGRESS.md:19`,
`PHASE2_MAIN_ORCHESTRATION_PROMPT.md:53–61`). `supabase/.temp/project-ref` names **production**, so no `supabase` CLI
command is run from this checkout at any stage (verified 2026-09-17: the file contains `gteygwfgjvczanmrwgbr`;
`scripts/data-hygiene/oux-wp2.2/README.md` "Never run `supabase db push` from this checkout").

### Decision labels used in this document (each unique in this plan)

| Label | Topic | Section |
|---|---|---|
| **FQ-a** | Scope of the readers the specification's grep missed (single-quoted `.from('campaign_activities')`) | §2 F1, §9.1 |
| **FQ-b** (RD-a / RD-b) | Ratings delete policy gap for a child organiser (RLS stop condition) | §3.4, §9.1 |
| **FQ-c** | A child's participation import may stamp `an_resource_*` on the parent's family activity | §3.6, §9.1 |
| **FQ-d** | `vw_sms_assessment_report` stays owner-attributed | §2 C, §9.1 |
| **FQ-e** | `campaign_last_activity()` (WP1.3 cards) stays owner-scoped | §2 C, §9.1 |
| **FQ-f** | Task-list dialog keeps offering owned activities only | §2 A row 8, §9.1 |
| **FQ-g** | Whether the campaign-64 data run sheet is rehearsed on the realistic data set | §0 step 4, §9.1 |
| **TRG-a / TRG-b** | Where SET-a ("writer of both") is enforced: trigger (recommended) or UI only | §3.1, §9.1 |
| **UI-a** | When the scope toggle is shown in the parent | §3.7 |
| **CL-a** | Clear-ratings from a child on a shared activity: restricted to the selected members | §3.8 |

---

## 0. Database sequence

One migration, one rollback, one data run sheet with its own rollback, two read-only files. Style: WP2.1/2.2
(`supabase/migrations/20260914090100_wp2_2_one_unit_per_group_enforcement.sql:1–75` for a migration — preconditions in
a `DO` block that refuse a repeated apply, no explicit `BEGIN`/`COMMIT`, a counts temp table, post-assertions, comments
naming the plan section; `scripts/data-hygiene/oux-wp2.2/91_rollback_wp2_2_enforcement.sql:1–30` for a rollback —
explicit `BEGIN;`, the environment guard that accepts a valid `_oux_env_marker` **or** `current_setting('oux.env')
= 'production'`, preconditions, post-conditions, a final labelled result set, `COMMIT;`).

| File | Kind | Runs where |
|---|---|---|
| `supabase/migrations/20260917100000_wp3_8_campaign_families.sql` | migration (schema only; no data change) | dev (Stage 2), realistic data set (rehearsal), production (operator) |
| `scripts/data-hygiene/oux-wp3.8/90_rollback_wp3_8_campaign_families.sql` | rollback of the migration; refuses to run while any family link or `family` scope row exists | realistic data set (rehearsal); recovery only elsewhere |
| `scripts/data-hygiene/oux-wp3.8/10_campaign64_family.sql` | data run sheet: `parent_campaign_id = 64` on 61, 62, 69; `scope = 'family'` on 88–92 | **production only** (69 exists only there), operator, after the migration and the merge |
| `scripts/data-hygiene/oux-wp3.8/91_rollback_campaign64_family.sql` | reverses `10` | production, operator, recovery only |
| `scripts/data-hygiene/oux-wp3.8/01_family_checksums.sql` | read-only checksums over `campaign_activities`, `campaign_activity_ratings` and `campaign_worker_rating_summary` for campaigns 61, 62, 64 (§0.3) | any project; agent on dev / realistic set, operator on production |
| `scripts/data-hygiene/oux-wp3.8/00_family_measurement.sql` | read-only simulation for acceptance item 4 (§5.3) | realistic data set (agent, read is free) |
| `scripts/data-hygiene/oux-wp3.8/README.md` | edited: the table at `README.md:6–11` gains the rows above | — |

The timestamp `20260917100000` sorts after every existing migration (latest `20260914090100`) and is a valid UTC
calendar stamp, which is all `scripts/validate-supabase-migrations.mjs:7–50` checks.

### 0.1 Steps, in order, and who runs each

| Step | Database | Who | What | Notes |
|---|---|---|---|---|
| 1 | — | implementer | Stage 1 (§6): migration, `90`, `10`, `91`, `00`, `01`, helper, pure module, contract suite written. `pnpm validate:migrations` green. | No database. |
| 2 | **Dev** | agent through the connector, **per-file operator approval** (or the operator by paste) | (a) `01_family_checksums.sql` read-only, paste output; (b) the exact migration file as one submission wrapped `BEGIN; … COMMIT;` in `execute_sql`, then (c) the ledger row `INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260917100000','wp3_8_campaign_families')` as its own approved statement (the WP2.2 dev mechanism, `oux-wp2.2/README.md` "Normal dev" step 1); (d) `01` again — every checksum identical (the migration changes no row; the summary view's output must be byte-identical because no campaign has a parent yet); (e) `pg_get_viewdef` of the summary view pasted. | Never `supabase db push` (project-ref = production). Never `apply_migration` (it would write a ledger version that is not the file's). |
| 3 | **Dev** | verifier | Contract suite (§4.2) with the `OUX_CONTRACT_*` variables in the shell. Two runs pasted into §9.2 (before and after Stage 3's reader switch; the second proves the switch changed nothing at the database). | Fixture campaigns are created and deleted by the suite. |
| 4 | **Realistic data set** | operator approves the run sheet; agent runs each file through the connector one at a time, pasting output before the next | **No ledger catch-up** (orchestrator amendment, Revision 1): the realistic set's ledger, read on 2026-09-17, already carries `20260913000000 an_survey_reports`; what it lacks is WP2.2a `20260914090000` and WP2.2b `20260914090100`, which need WP2.2's cleanup sequence and are out of WP3.8's scope (recorded in `PROGRESS.md` standing notes). The WP3.8 migration references no WP2.2 object, so the rehearsal runs on the set as it is → `01` (before) → migration + ledger row → `01` (after-forward-1; identical) → `90` (rollback; stops if any family row exists — none) → `01` (after-rollback; identical) → migration + ledger row again → `01` (after-forward-2; identical) → `00_family_measurement.sql` (§5.3; read-only; the simulation, not the data run sheet). | The clone marker `_oux_env_marker = 'clone'` is present (verified read-only 2026-09-17), so `90` runs without `SET LOCAL oux.env`. **FQ-g:** `10_campaign64_family.sql` is **not** rehearsed here (recommended): its precondition requires campaign 69, absent from the 12 September snapshot; acceptance item 4 is a read-only simulation (§5.3). Alternative FQ-g-b: a rehearsal variant with `(61, 62)` only, as a separately approved file. |
| 5 | — | verifier, reviewer | Stages 3–4: preview green, jsdom, review. | |
| 6 | **Production** | **operator only** | Run sheet, one file per SQL Editor submission, `postgres` role, output pasted before the next: (a) `01_family_checksums.sql` (before) → (b) `BEGIN; SET LOCAL oux.env = 'production'; <exact migration text> ; INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260917100000','wp3_8_campaign_families'); COMMIT;` followed by the read-only verification SELECT of §0.2 (the migration itself carries no environment guard, as no migration in this programme does; the guard line is harmless and documents intent) → (c) `01` (after; identical) → (d) operator merges the PR (`gen-types.yml` regenerates `generated.ts` from production, now carrying `parent_campaign_id` and `scope`) → (e) after the deploy is live: `10_campaign64_family.sql` with `SET LOCAL oux.env = 'production';` after `BEGIN;` → (f) its appended read-only SELECT shows 3 children of 64 and 5 family activities → (g) `01` (after data; the activities checksum for 64 changes by exactly the five `scope` values, ratings checksum unchanged, summary rows for 61/62 change per §5.3's prediction). | The agent prepares every file; it never runs anything on production. If (f) does not show exactly `children = 3, family = 5`, stop: `91_rollback_campaign64_family.sql` and report. |

### 0.2 Verification SELECT appended after the migration (read-only)

```sql
SELECT
  (SELECT count(*) FROM pg_attribute WHERE attrelid = 'public.campaigns'::regclass AND attname = 'parent_campaign_id' AND NOT attisdropped) AS parent_col,
  (SELECT count(*) FROM pg_attribute WHERE attrelid = 'public.campaign_activities'::regclass AND attname = 'scope' AND NOT attisdropped) AS scope_col,
  (to_regprocedure('public.campaign_family_activity_ids(integer)') IS NOT NULL) AS helper_present,
  (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.campaigns'::regclass AND tgname = 'trg_campaigns_enforce_one_level' AND NOT tgisinternal) AS trigger_present,
  (SELECT reloptions FROM pg_class WHERE oid = 'public.campaign_worker_rating_summary'::regclass) AS view_reloptions,
  (SELECT string_agg(attname, ',' ORDER BY attnum) FROM pg_attribute WHERE attrelid = 'public.campaign_worker_rating_summary'::regclass AND attnum > 0 AND NOT attisdropped) AS view_columns,
  (SELECT count(*) FROM public.campaigns WHERE parent_campaign_id IS NOT NULL) AS children_now,
  (SELECT count(*) FROM public.campaign_activities WHERE scope = 'family') AS family_now,
  (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260917100000') AS ledger_row;
-- expected: 1, 1, true, 1, {security_invoker=true},
-- campaign_id,worker_id,cumulative_rating,last_activity_rating,has_supportive_activity_rating,supportive_activity_count, 0, 0, 1
```

### 0.3 `01_family_checksums.sql` (read-only; no environment marker)

```sql
SELECT
  (SELECT md5(string_agg(a::text, '|' ORDER BY a.activity_id))
     FROM public.campaign_activities a WHERE a.campaign_id IN (61,62,64))                      AS activities_md5,
  (SELECT md5(string_agg(r::text, '|' ORDER BY r.rating_id))
     FROM public.campaign_activity_ratings r
     JOIN public.campaign_activities a ON a.activity_id = r.activity_id
    WHERE a.campaign_id IN (61,62,64))                                                          AS ratings_md5,
  (SELECT md5(string_agg(v::text, '|' ORDER BY v.campaign_id, v.worker_id))
     FROM public.campaign_worker_rating_summary v WHERE v.campaign_id IN (61,62,64))          AS summary_md5,
  (SELECT count(*) FROM public.campaign_activities WHERE campaign_id IN (61,62,64))            AS activities_n,
  (SELECT count(*) FROM public.campaign_worker_rating_summary WHERE campaign_id IN (61,62,64)) AS summary_rows,
  (SELECT count(*) FROM public.campaigns WHERE parent_campaign_id IS NOT NULL)                 AS children_n,   -- errors before the migration: expected, run the 3-column variant then
  (SELECT count(*) FROM public.campaign_activities WHERE scope = 'family')                    AS family_n;
```

The file carries both variants (a pre-migration version without the last two columns and the full version) as two
labelled statements; the operator runs whichever applies. `a::text` includes every column, so after the migration
the activities checksum differs from before **only** because each row gained `scope = 'campaign'` — the rehearsal
compares before-forward with after-rollback (must be equal) and after-forward-1 with after-forward-2 (must be equal).
The ratings checksum and the summary checksum must be identical at every point until the data run sheet runs.
Measured on the realistic data set on 2026-09-17 (pre-migration): `activities_md5 8a477f78…`, `ratings_md5
e4e8fa5c…`, `summary_md5 9ccbaa63…`, `activities_n 8`, `summary_rows 388` (61 = 48, 62 = 64, 64 = 276).

Before-and-after evidence compares checksums, not row totals (`PHASE2_MAIN_ORCHESTRATION_PROMPT.md:95`): membership
totals drift when a writer opens a campaign; `campaign_activities` and `campaign_activity_ratings` do not drift on
page open, and the summary view's rows for a campaign change only when its memberships or ratings change, which the
rehearsal window must avoid (nobody opens 61/62/64 on the realistic set; it is not wired to Vercel).

---

## 1. Scope and non-goals

**In scope** (the specification, `IMPLEMENTATION_ORCHESTRATION_PROMPT.md:180–205`):

1. Schema: `campaigns.parent_campaign_id` (FAM-a) with CHECK, index, FK `ON DELETE SET NULL` and the trigger
   `campaigns_enforce_one_level`; `campaign_activities.scope` (ASC-a); the helper `campaign_family_activity_ids`;
   `campaign_worker_rating_summary` rewritten (VIEW-a); one other view (§2 C); the RLS confirmation, with one gap
   raised (§3.4).
2. Application: the pure module `lib/campaign/families.ts`; every reader of §2 marked **changes** switched to it;
   the participation import accepting a family activity of the parent (RAT-a); the Assessments tab's **Shared from
   <parent>** section, the parent's **Shared with N campaigns** badge and scope toggle; the chart selector, the
   participation selector and the worker sheet listing family assessments; the Basics sheet's **Part of** selector
   (SET-a); the header link; the parent's Setup children card; three telemetry events.
3. The campaign-64 data run sheet, prepared by the agent and run by the operator; the sector-wide set is the
   operator's answer of 2026-09-17 (`DECISIONS.md:82`, `PROGRESS.md:111`): 88, 89, 90, 91, 92 → `family`; 93, 95
   stay `campaign`; children 61, 62, 69.

**Non-negotiable** (`IMPLEMENTATION_ORCHESTRATION_PROMPT.md:227`): one level, enforced in the database; ratings never
duplicated (one row per worker per activity, on the owner's activity); no cross-campaign unit or placement moves and
no unit/placement change of any kind; no new creation path; the sector campaign is not restructured; no structure
file is touched while WP2.5/2.6/2.7/2.4b are in flight (§3.15).

**Out of scope, recorded so it is not folded in:** WP3.9 (spin-off UI, `unit-card-menu.tsx`, the create flow);
multi-level families; a "merge back"; sharing with *some* children (ASC-b); shadow activities (RAT-b); any change to
`campaign_last_activity()`, `vw_sms_assessment_report`, task lists or leader forms (§9.1 FQ-d/e/f); SMS-episode
containers as family members; generated-types changes (`packages/db-types/generated.ts` is not edited on the branch;
it regenerates from production after the merge, `PROGRESS.md:137`).

---

## 2. Reader inventory (complete)

**Method.** `grep -rn 'from("campaign_activities")' src` (the specification's 17 files, `DECISIONS.md:74`) **plus**
`grep -rn "from('campaign_activities')"` — the codebase mixes quote styles, and the single-quoted form is used by
28 further sites in 24 files that the recorded inventory missed (**finding F1**; see FQ-a) — plus every PostgREST
embed `campaign_activities(...)`, every reader and writer of `campaign_activity_ratings`, every `.rpc(` whose SQL
touches either table (`record_assessment_event`, `campaign_last_activity`, `seed_bargaining_quickstart_activities`,
`apply_participation_import`, `can_write_to_campaign`, `campaigns_i_can_write`), and every database object in the
baseline and later migrations that references either table (a `grep -n` over `20260908050000_baseline_schema.sql`
and `2026090[9]*`, `202609[1-9]*`).

**The rule** (`IMPLEMENTATION_ORCHESTRATION_PROMPT.md:186`): a reader that answers "this campaign's assessments"
**changes** (it asks the helper: owned, or my parent's `family`); a reader keyed to a plan, a list, a script, a token
or an activity id is **unchanged**. Where a reader is unchanged for a reason other than that rule, the reason is
stated (**unchanged-with-reason**). Verdicts, counted per table row: **changes — 30 distinct sites** (12 in the
specification's files: A1–A6, A11–A14; 16 secondary surfaces under FQ-a: A18, A19, A21b, A22, A23, A25, A26, A27,
A32–A38, A41; 2 database views: C1, C6; rows B8, B16, B19 cross-reference A rows), **unchanged — 46 rows**,
**unchanged-with-reason — 12 rows** (A8, A12d, A29, B1, B2, B4, B5, B6, B7, C4, C5, C12, C14 are the reasoned ones; C14
is recorded behaviour), and **4 rows whose text is unchanged pending FQ-b** (A25b, B3, B8b, B18).

### 2.A App readers of `campaign_activities`

| # | `path:line` | What it asks | Verdict |
|---|---|---|---|
| A1 | `components/campaigns/wall-chart/assessment-selector.tsx:43–50` (`fetchWallChartAssessmentOptions`) | this campaign's assessments → the Colour-by selector, the per-unit View control, the legacy header, the v2 toolbar (`v2/wall-chart-toolbar.tsx:170` via `hooks/use-wall-chart-core-data.ts:107`), the list view (`workforce/workforce-list-view.tsx:652`), the bulk toolbar (`:101`), the inline rating popover (`inline-rating-popover.tsx:223`), participation-import steps (`step-assessment.tsx:31`, `extra-column-mappings.tsx:83`), the distribution charts (`useAssessmentDistributions.ts:46–49`) | **changes** (§3.5 row 1); every consumer above inherits it with no edit |
| A2 | `wall-chart/participation-selector.tsx:36–41` | this campaign's activities (participation source) | **changes** |
| A3 | `wall-chart/use-participation-predicate.ts:41–47` | this campaign's latest activity | **changes** (latest across owned + family) |
| A4 | `wall-chart/clear-ratings-dialog.tsx:51–57` | this campaign's assessments (to clear) | **changes**, with CL-a (§3.8) |
| A5 | `wall-chart/worker-detail-sheet.tsx:1299–1304` | this campaign's assessments (Record rating picker) | **changes** |
| A5b | `wall-chart/worker-detail-sheet.tsx:1317–1347` (ratings embed `activity:campaign_activities(... campaign_id)`, filtered `activity.campaign_id === Number(campaignId)` at `:1347`) | this worker's ratings in this campaign | **changes** (filter by the family id set) |
| A6 | `components/campaigns/campaign-assessments.tsx:159–163` | this campaign's activities (tab list) | **changes** |
| A6b | `campaign-assessments.tsx:268–272` (`.delete().eq("activity_id").eq("campaign_id")`) | delete an owned activity | **unchanged** — owner-only by design; the UI never offers delete on a shared row (§3.7) |
| A7 | `assessments/create-assessment-dialog.tsx:122–126` | insert | **unchanged** (writer; a new activity is always owned, `scope` defaults `campaign`) |
| A8 | `task-lists/create-task-list-dialog.tsx:348–355` | this campaign's activities (task-list target) | **unchanged-with-reason** — task lists are per campaign (`fn_task_list_item_side_effects` `:2780–2820` enrols into the *list's* campaign; leader tokens and their policies key on `tl.campaign_id` `:27528–27530`); offering the parent's family activity here would let a child's leader form write onto the parent row, which RAT-a permits but which was not asked for. **FQ-f** recommends leaving it for a follow-up. The dialog shares the query key `["campaign-activities", campaignId]` with A6, so A6 moves to its own key (§3.5) |
| A8b | `create-task-list-dialog.tsx:442–446` | patch `assessment_type` by id | **unchanged** |
| A9 | `activists/woc-meeting-dialog.tsx:234–247` | insert (`woc_meeting`) | **unchanged** |
| A10 | `activists/structure-tests-panel.tsx:157–169` | insert (`structure_test`) | **unchanged** |
| A11 | `import/worker-import-wizard.tsx:691–697` | this campaign's assessments (import columns → ratings) | **changes** |
| A12 | `api/campaigns/[id]/participation-import/apply/route.ts:305–313` | the chosen existing activity must belong to this campaign | **changes** — accept owned **or** parent-`family` (§3.6) |
| A12b | `…/apply/route.ts:334–342` | extra existing activity, same check | **changes** (same helper) |
| A12c | `…/apply/route.ts:165–175` (`createAssessment`) | insert | **unchanged** |
| A12d | `…/apply/route.ts:537–545` (`an_resource_*` update by `activity_id`) | stamp the AN link on the activity | **unchanged-with-reason** — by id; when the target is the parent's family activity this writes the parent's row (RLS update is role-only `:26299`). **FQ-c** |
| A13 | `api/campaigns/[id]/role-check/route.ts:66–70` (activities) and `:85–90` (rating = 1 rows) | this campaign's activities → rating-1 raters → role-check candidates | **changes** — family ids, **and** candidates restricted to this campaign's members (today the route never filters by membership: `:126–131` reads workers by id; with a family activity the parent's other members would appear as candidates — VIEW-a) |
| A14 | `api/campaigns/[id]/an-actions/route.ts:60–64` | this campaign's AN-linked assessments | **changes** (a family activity's AN link shows as linked in the child) |
| A15 | `api/worker-import/apply/route.ts:193–203` | insert | **unchanged** |
| A16 | `api/call-share/[token]/route.ts:253–257` (by ids), `:188` (embed) | by id / by script | **unchanged** |
| A17 | `lib/sms/survey-runtime.ts:715–719` | by id | **unchanged** |
| A18 | `app/(dashboard)/campaigns/[id]/phone/lists/new/page.tsx:311–322` | this campaign's assessments (list-builder filter) | **changes** (FQ-a) |
| A19 | `api/campaigns/[id]/assessments/route.ts:30–35` | this campaign's assessments (endpoint) | **changes** (FQ-a) |
| A20 | `api/campaigns/[id]/cleanup/route.ts:164–168`, `:197–201` | delete this campaign's assessments (test cleanup) | **unchanged** — must stay owner-only (a child must never delete the parent's) |
| A21 | `api/campaigns/[id]/sms-lists/[listId]/p2p/route.ts:246–249` | pinned assessments by id | **unchanged** |
| A21b | `…/p2p/route.ts:610–614` | pins must be assessments of `targetCampaign` | **changes** (FQ-a) — accept family |
| A22 | `api/campaigns/[id]/sms-surveys/route.ts:149–158`, `:189–196` | survey / question rating targets must be in this campaign | **changes** (FQ-a) |
| A23 | `api/campaigns/[id]/sms-surveys/[surveyId]/route.ts:380–389`, `:417–425` | same, on update | **changes** (FQ-a) |
| A24 | `api/section-plans/[sectionPlanId]/ai/sequence-suggest/route.ts:52–57`; `…/stage-mapping/route.ts:47` | by plan | **unchanged** |
| A25 | `api/sms/conversations/[id]/assessments/route.ts:185–195` | the activity must belong to the effective campaign | **changes** (FQ-a) |
| A25b | `…/assessments/route.ts:228–236` (delete of the actual/NULL-event row) | clear a rating | **unchanged** text; **FQ-b** (delete policy) |
| A26 | `api/sms/conversations/[id]/draft-reply/route.ts:178–184` (ratings embed `campaign_activities!inner(campaign_id)` `.eq('campaign_activities.campaign_id', …)`) | this worker's ratings in the conversation's campaign (AI context) | **changes** (FQ-a; `.in('activity_id', ids)` from the helper RPC) |
| A26b | `…/draft-reply/route.ts:211–215` | by id | **unchanged** |
| A27 | `api/sms/conversations/[id]/route.ts:355–368` | an attached activity must belong to the conversation's campaign | **changes** (FQ-a) |
| A28 | `components/campaigns/OutreachCleanupPanel.tsx:111–116` | owned assessments for cleanup | **unchanged** (owner-only, as A20) |
| A29 | `bargaining/BargainingInsightsWidget.tsx:145–148` | this campaign's `woc_meeting` events | **unchanged-with-reason** — WOC meetings are plan chrome, never shared (the UI offers the toggle on `assessment` rows only, §3.7) |
| A30 | `bargaining/BaselineAssessmentQuickStart.tsx:21–26`, `:34–39` | own template rows after seeding | **unchanged** |
| A31 | `phone/SessionAssessmentRatingsPanel.tsx:57–60` | by ids | **unchanged** |
| A32 | `phone/setup/CallCtaAmbitionsEditor.tsx:329–335` | this campaign's assessments (CTA targets) | **changes** (FQ-a) |
| A33 | `sms/inbox/SmsAssessmentPanel.tsx:91–96` | this campaign's assessments (inbox rating chips) | **changes** (FQ-a); `:113` by id **unchanged** |
| A34 | `sms/inbox/SmsMemberSidebar.tsx:124–129` | this campaign's activities (attach) | **changes** (FQ-a) |
| A35 | `sms/inbox/SmsNewChatDialog.tsx:129–134` | this campaign's activities | **changes** (FQ-a) |
| A36 | `sms/inbox/SmsPinnedAssessment.tsx:120–126` | this campaign's assessments (pinned chips) | **changes** (FQ-a) |
| A37 | `sms/p2p/SmsP2pPanel.tsx:352–358` | this campaign's assessments (board setup) | **changes** (FQ-a) |
| A38 | `sms/surveys/SmsSurveysPanel.tsx:603–609` | this campaign's assessments (survey targets) | **changes** (FQ-a) |
| A39 | `lib/hooks/useCallOutcomes.ts:114–135` | find/insert this campaign's shadow activity | **unchanged** |
| A40 | `lib/hooks/useSectionActivities.ts:27–31`, `:51–62`, `:77–81` | by plan | **unchanged** |
| A41 | `lib/phone/fetch-user-assessments.ts:31–36` | this campaign's assessments (phone rating targets) | **changes** (FQ-a); the shadow exclusion `:50–55` stays keyed to this campaign's `call_outcome_definitions` |
| A42 | embeds keyed to a list/script/token: `campaign-task-lists.tsx:116`, `wall-chart/worker-relationships-tab.tsx:71`, `phone/CallSessionPage.tsx:244`, `api/campaign-leader/[token]/route.ts:130`, `:177` | by list / script | **unchanged** |

### 2.B App readers and writers of `campaign_activity_ratings`

| # | `path:line` | What it asks | Verdict |
|---|---|---|---|
| B1 | `campaign-assessments.tsx:214–221` | ratings of the selected activity by id | **unchanged-with-reason** — rows for the parent's non-members arrive; the table is built from this campaign's members (`workerRows`, `:373–380`) and looks ratings up by member, so they are never rendered (VIEW-a holds at the consumer) |
| B1b | `campaign-assessments.tsx:303–314` (upsert), `:357` (bulk upsert) | write by activity id | **unchanged** — this is RAT-a's write path: a family activity's id is the parent's row |
| B2 | `assessment-selector.tsx:91–96` (`last_rated_at` over ids) | sort hint | **unchanged-with-reason** — may reflect a rating by a non-member of the child; it orders the dropdown only. Accepted; recorded |
| B3 | `clear-ratings-dialog.tsx:67–72` (delete by worker ids + activity) | clear | **unchanged** text (CL-a keeps `workerIds` = the selected members); **FQ-b** |
| B4 | `wall-chart/hooks/use-wall-chart-core-data.ts:174–180` | ratings for the Colour-by / filter activities by id | **unchanged-with-reason** — tile lookup by member (`collapseActivityRatingsToWorkerMap` then per-tile) |
| B5 | `wall-chart/v2/use-wall-chart-view-v2.ts:159–163` | same for the v2 chart | **unchanged-with-reason** — same shape; file owned by WP2.4/2.4c (`wp/wp2.4.md:811`), not edited |
| B6 | `workforce/workforce-list-view.tsx:227–233` | same for the legacy list | **unchanged-with-reason** — same shape; file owned by WP2.6 (`wp/wp2.6.md:640`), not edited |
| B7 | `lib/hooks/useAssessmentDistributions.ts:110–116` | ratings for every option by id | **unchanged-with-reason** — distributions iterate member ids (`buildDistribution(..., allMemberIds / unit members, ratingMap)` `:315–320`), so non-member rows never count. Only `:46–49` changes (§3.5 row 1b) |
| B8 | `worker-detail-sheet.tsx:1319–1347` | history | **changes** (A5b) |
| B8b | `worker-detail-sheet.tsx:1371–1375` (delete by `rating_id`) | remove a rating | **unchanged** text; **FQ-b** |
| B9 | `use-participation-predicate.ts:67–72` | raters of one activity | **unchanged** (by id; consumed per member) |
| B10 | `lib/campaign/use-batch-save-activity-ratings.ts:55–60`; `lib/hooks/useSaveActivityRating.ts:57–62` | upsert by activity id | **unchanged** (RAT-a write path; the sheet posts the parent's `activity_id` through this hook, §4.3) |
| B11 | `lib/campaign/task-list-progress.ts:131–136`, `:238–242` | by list | **unchanged** |
| B12 | `api/campaign-leader/[token]/route.ts:252–256`, `:528–545`, `:553–558` | by task list | **unchanged** |
| B13 | `api/calls/lists/[listId]/populate/route.ts:94–99`; `api/campaigns/[id]/call-lists/[listId]/populate/route.ts:96` | by `assessment_id` (from A18/A19) | **unchanged** |
| B14 | `api/campaigns/[id]/participation-import/apply/route.ts:130` (`loadRatingMap`); `…/match/route.ts:161–166` | by activity id | **unchanged** |
| B15 | `api/campaigns/[id]/prospective/[prospectiveId]/promote/route.ts:154–159` | by task list's activity | **unchanged** |
| B16 | `api/campaigns/[id]/role-check/route.ts:85–90` | rating-1 rows on this campaign's activities | **changes** (A13) |
| B17 | `api/campaigns/[id]/sms-lists/[listId]/p2p/route.ts:203–210` | by pinned ids | **unchanged** |
| B18 | `api/sms/conversations/[id]/assessments/route.ts:231` | delete | **FQ-b** (A25b) |
| B19 | `api/sms/conversations/[id]/draft-reply/route.ts:179` | see A26 | **changes** (FQ-a) |
| B20 | `sms/inbox/SmsAssessmentPanel.tsx:147`; `SmsPinnedAssessment.tsx:158` | by ids | **unchanged** |
| B21 | `campaign_worker_rating_summary` readers: `campaign-assessments.tsx:195`, `use-wall-chart-core-data.ts:75`, `workforce-list-view.tsx:186`, `phone-wizard/PhoneWizardSteps.tsx:557`, `step-campaign-ambitions.tsx:238`, `lib/hooks/useCampaignListStats.ts:207`, `useCampaignsAllStats.ts:150`, `api/campaigns/[id]/worker-lists/[listId]/route.ts:91`, `api/calls/lists/[listId]/populate/route.ts:130`, `…/call-lists/[listId]/populate/route.ts:136` | per-campaign summary | **unchanged** — the view carries VIEW-a |
| B22 | `vw_sms_assessment_report` / `vw_sms_chat_session_report` readers: `api/campaigns/[id]/sms-reporting/route.ts:65–74`, `api/reports/sms/route.ts:46` | reports | **unchanged** (views, §2 C) |

### 2.C Database objects that reference either table

| # | Object, `20260908050000_baseline_schema.sql:line` (or later migration) | What it asks | Verdict |
|---|---|---|---|
| C1 | `campaign_worker_rating_summary` `:10699–10760` (`security_invoker`; `rating_activity` joins ratings to `campaign_activities`, outer join `r.campaign_id = m.campaign_id` `:10756`; `last_activity_rating` subquery `a2.campaign_id = m.campaign_id` `:10745–10750`) | this campaign's ratings per member | **changes** — full SQL in §3.3. Live definition confirmed identical in substance on dev and on the realistic set (2026-09-17, `pg_get_viewdef`; the two deparse a varchar-array cast differently, so the migration asserts the column list, never an md5) |
| C1-dep | dependents (from `pg_depend` on the realistic set, 2026-09-17): depth 1 `v_campaign_activist_register` `:15503`, `v_campaign_coverage_map` `:15562`, `v_campaign_foundational_readiness` `:15624`, `v_section_plan_soc_recording_grid` `:15768`, `v_section_plan_workforce_mapping` `:15851`, `v_strength_assessment_inputs` `:15918`; depth 2 `v_campaign_coverage_summary`. No function body references the view (`pg_proc.prosrc` search returned none) | consume the summary | **unchanged** — `CREATE OR REPLACE VIEW` with the identical column list (name, type, order) keeps every dependent valid; nothing is dropped. The migration asserts the column list before and after (§3.3). WP2.1 listed `v_section_plan_workforce_mapping` among the views it recreated (`20260912035329:383`, `:992`); its current text is the baseline's and is not touched |
| C2 | `worker_ambition_rating` `:7710–7752` | ratings → `activity_ambitions` → `plan_ambitions` → `campaign_stage_plans` | **unchanged** (keyed to a plan) |
| C3 | `ambition_activity_contribution` `:7636–7652`; `ambition_progress` `:7754–` | plan | **unchanged** |
| C4 | `v_worker_escalation_tier` `:16013–16100` | industrial-action ratings via `activity_events`, grouped by the activity's `campaign_id` | **unchanged-with-reason** — no app reader (`grep` finds none); industrial-action activities are never offered the family toggle (UI-a limits it to `assessment` rows); a parent's tier still counts a child-recorded rating because the rating is on the parent's row |
| C5 | `vw_sms_assessment_report` `:16352–16365` | SMS-sourced ratings per (owner campaign, source) | **unchanged-with-reason** — attribution by owner is RAT-a's intent (the sector campaign's report counts SMS ratings its children record on shared assessments); a family-scoped rewrite would count one row in two campaigns' totals and change the parent's existing numbers. **FQ-d** |
| C6 | `vw_sms_chat_session_report` `:16498–16542`; the `assessments_recorded` subquery `:16533–16537` (`a.campaign_id = o.campaign_id` and `r.worker_id IN (openers of the list)`) | per P2P list: SMS ratings recorded for the list's openers on this campaign's activities | **changes** — `a.activity_id IN (SELECT public.campaign_family_activity_ids(o.campaign_id))`; the openers restriction already gives VIEW-a (the view is owner-executed, no `security_invoker`; the helper is `SECURITY INVOKER` and runs as the view's owner inside it, exactly as the tables do today). Full text in §3.3 |
| C7 | `call_section_funnel` `:8639–8663` | call lists/scripts; references neither table | **unchanged** (listed in `DECISIONS.md:74`; recorded: no reference) |
| C8 | `v_section_plan_summary` `:15804–15848` (counts activities by `section_plan_id`), `v_section_plan_workplan` `:15891–15915`, `v_section_plan_soc_recording_grid` `:15768` | plan | **unchanged** |
| C9 | `v_pia_participation_by_action` `:15710–15760` | pia actions | **unchanged** |
| C10 | `worksites_view` `:17711–17745`; `workload_campaign_activities` `:17276–17313` | reference neither table | **unchanged** (recorded: `DECISIONS.md:74` lists `worksites_view` in error) |
| C11 | `record_assessment_event` `:4598–4650` (SECURITY DEFINER upsert by `activity_id`) | write | **unchanged** — RAT-a's RPC write path (`SmsAssessmentPanel`, `campaign-leader`, `promote`, `survey` trigger) |
| C12 | `campaign_last_activity(integer[])` `20260910090000_campaign_last_activity.sql:28–70` (`a.campaign_id = ids.cid`) | latest rating per campaign for My-campaigns cards | **unchanged-with-reason** — a card timestamp, not a chart read; the parent's card updates when a child rates a shared assessment; making it family-aware needs a membership join for VIEW-a. **FQ-e** |
| C13 | `create_call_list_from_activity` `:1723–1760`, `materialise_sequence_run` `:3900–3960`, `seed_bargaining_quickstart_activities` `:5706–5738`, `seed_bargaining_woc_template` `:5745–5770`, `seed_pia_pack_*` `:5840–5920` | by id / insert owned | **unchanged** |
| C14 | triggers on ratings: `fn_activist_profile_on_rating` `:2093–2110` (`trg_activist_profile_on_rating` `:22293`: a rating of 1 ensures an activist profile in the **activity's** campaign); `fn_auto_rate_promote_task_list_leader` `:2180–2215`; `fn_task_list_item_side_effects` `:2780–2820` | side effects keyed to the activity's owner / the list | **unchanged** — recorded behaviour: a child organiser rating 1 on a shared assessment creates the activist profile in the **parent** (where the row lives); the child's own profile is created by its own membership/role paths. Reviewer note, not a change |
| C15 | policies on `campaign_activities`: insert `:25923` (role), update `:26299` (role), select `:26945` (`true`), delete `:27518` (`can_write_to_campaign(campaign_id) OR is_admin()`); on `campaign_activity_ratings`: insert `:25927`, update `:26303`, select `:26949`, delete `:27522–27524` (owner of the activity). Confirmed live on the realistic set 2026-09-17 (`pg_policy`, same text) | RLS | **unchanged** — they already make RAT-a's insert/upsert work from a child (§3.4) — **except** the ratings **delete** gap, **FQ-b** |
| C16 | policies on activity-child tables keyed to the activity's owner: `activity_ambitions` `:27481/:27563/:27646`, `activity_events` `:27487/:27569/:27654`, `petition_signatures` `:27917/:27946/:27980`, `meeting_attendance` `:27911/:27940/:27971`, `sms_interactions` `:27933/:27952`, `email_cta_responses` `:27905/:27933`, `woc_meeting_details` `:29058` | definition-side writes | **unchanged** — a child sees a shared activity's definition read-only; only ratings are shared |
| C17 | `campaigns` policies `wp16_campaigns_update` (`20260909120000:127–136`), `wp16_campaigns_delete` (`:143–152`), `delete_campaign()` (`20260909130000:76–128`); trigger `trg_campaigns_updated_at` `:22409` | campaign row writes | **unchanged**; SET-a's "writer of both" is enforced by the new trigger (TRG-a, §3.1); `delete_campaign` deletes the campaign row and the FK's `ON DELETE SET NULL` clears children's links; `updated_at` advances on 61/62/69 when `10` runs (expected metadata churn, as WP2.1 recorded) |
| C18 | index `idx_campaign_activities_campaign` `:20589` | serves the helper's owned branch | **unchanged**; a partial index for the family branch is added (§3.1) |
| C19 | `car_worker_phase_event_uq` `:19186` (`UNIQUE NULLS NOT DISTINCT (activity_id, worker_id, rating_phase, event_id)`) | one rating row per worker per activity/phase/event | **unchanged** — this is what makes "ratings never duplicated" hold on the parent's row |

---

## 3. Design

### 3.1 Schema (migration `20260917100000_wp3_8_campaign_families.sql`)

Sections, in order, each commented with its plan section:

**1. Preconditions** (`DO` block; refuse a repeated or partial apply): `parent_campaign_id` absent from
`campaigns`; `scope` absent from `campaign_activities`; `to_regprocedure('public.campaign_family_activity_ids(integer)')
IS NULL`; trigger `trg_campaigns_enforce_one_level` absent; `campaign_worker_rating_summary` exists with
`security_invoker=true` and exactly the six columns of §0.2 (asserted by name and order); `pg_get_viewdef` of it
contains the literal `r.campaign_id = m.campaign_id` (the join this migration replaces; if absent, the live view is
not the baseline's and the migration stops rather than overwrite an unknown definition).

**2. Counts temp table** (`ON COMMIT DROP`): row counts of `campaigns`, `campaign_activities`,
`campaign_activity_ratings`, `campaign_worker_membership`; the summary view's column list; a whole-view checksum
`md5(string_agg(v::text ORDER BY campaign_id, worker_id))` (2,726 memberships on the realistic set; cheap).

**3. `campaigns.parent_campaign_id`**

```sql
ALTER TABLE public.campaigns
  ADD COLUMN parent_campaign_id integer NULL
    REFERENCES public.campaigns(campaign_id) ON DELETE SET NULL,
  ADD CONSTRAINT campaigns_parent_not_self CHECK (parent_campaign_id IS NULL OR parent_campaign_id <> campaign_id);
CREATE INDEX idx_campaigns_parent_campaign_id ON public.campaigns (parent_campaign_id) WHERE parent_campaign_id IS NOT NULL;
COMMENT ON COLUMN public.campaigns.parent_campaign_id IS
  'WP3.8 (FAM-a, wp3.8.md §3.1): the one parent this campaign is part of. One level only (trg_campaigns_enforce_one_level). '
  'Changes nothing about membership, groups, units or placements. ON DELETE SET NULL: deleting the parent unlinks its children; '
  'the parent''s activities and their ratings go with the parent (campaign_activities FK CASCADE :23305), so a child stops seeing '
  'the shared assessments and the ratings recorded from it — they were the parent''s rows (RAT-a).';
```

**4. `campaign_activities.scope`**

```sql
ALTER TABLE public.campaign_activities
  ADD COLUMN scope text NOT NULL DEFAULT 'campaign'
    CONSTRAINT campaign_activities_scope_check CHECK (scope IN ('campaign', 'family'));
CREATE INDEX idx_campaign_activities_family ON public.campaign_activities (campaign_id) WHERE scope = 'family';
COMMENT ON COLUMN public.campaign_activities.scope IS
  'WP3.8 (ASC-a, wp3.8.md §3.1). campaign = visible in the owning campaign only. family = also visible, and ratable, in every '
  'campaign whose parent_campaign_id is this activity''s campaign_id. The rule every reader applies: "owned by this campaign, or '
  'owned by my parent with scope = family" — public.campaign_family_activity_ids(). Ratings are never copied: a rating recorded '
  'from a child lands on this row (RAT-a); a child reads a shared activity''s ratings for its own members only (VIEW-a).';
```

Adding a `NOT NULL DEFAULT` column rewrites no rows on PostgreSQL ≥ 11 (fast default); the realistic set has 43
activity rows in any case.

**5. Trigger `campaigns_enforce_one_level`** — `BEFORE INSERT OR UPDATE OF parent_campaign_id, is_sms_episode,
is_standing ON campaigns FOR EACH ROW`, `SECURITY INVOKER`, `SET search_path TO pg_catalog, public`:

```sql
CREATE OR REPLACE FUNCTION public.campaigns_enforce_one_level() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path TO pg_catalog, public AS $$
DECLARE
  v_parent public.campaigns%ROWTYPE;
  v_parent_changed boolean := TG_OP = 'INSERT' OR NEW.parent_campaign_id IS DISTINCT FROM OLD.parent_campaign_id;
BEGIN
  -- A parent (a campaign with children) can never become an episode or the standing campaign.
  IF (NEW.is_sms_episode OR NEW.is_standing)
     AND EXISTS (SELECT 1 FROM public.campaigns c WHERE c.parent_campaign_id = NEW.campaign_id) THEN
    RAISE EXCEPTION 'campaign_family_parent_kind' USING ERRCODE = 'check_violation',
      DETAIL = 'A campaign with child campaigns cannot be an SMS episode or the standing campaign.';
  END IF;
  IF NEW.parent_campaign_id IS NULL THEN RETURN NEW; END IF;     -- clearing is always allowed (SET-a)

  IF NEW.parent_campaign_id = NEW.campaign_id THEN
    RAISE EXCEPTION 'campaign_family_self' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.is_sms_episode OR NEW.is_standing THEN
    RAISE EXCEPTION 'campaign_family_child_kind' USING ERRCODE = 'check_violation',
      DETAIL = 'An SMS episode or the standing campaign cannot be part of a family.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.campaigns c WHERE c.parent_campaign_id = NEW.campaign_id) THEN
    RAISE EXCEPTION 'campaign_family_child_has_children' USING ERRCODE = 'check_violation',
      DETAIL = 'A campaign that has child campaigns cannot itself be part of another campaign (one level).';
  END IF;

  SELECT * INTO v_parent FROM public.campaigns WHERE campaign_id = NEW.parent_campaign_id;
  IF NOT FOUND THEN RETURN NEW; END IF;                            -- the FK raises 23503
  IF v_parent.parent_campaign_id IS NOT NULL THEN
    RAISE EXCEPTION 'campaign_family_parent_has_parent' USING ERRCODE = 'check_violation',
      DETAIL = 'The chosen parent is itself part of a campaign (one level).';
  END IF;
  IF v_parent.is_sms_episode OR v_parent.is_standing OR v_parent.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'campaign_family_parent_kind' USING ERRCODE = 'check_violation',
      DETAIL = 'An SMS episode, the standing campaign or an archived container cannot be a parent.';
  END IF;

  -- SET-a (TRG-a): setting a parent needs write access to the parent as well. The child side is the row policy
  -- (wp16_campaigns_update). Operator scripts run as postgres (auth.uid() IS NULL) and skip this arm.
  IF v_parent_changed AND auth.uid() IS NOT NULL
     AND NOT public.can_write_to_campaign(NEW.parent_campaign_id) THEN
    RAISE EXCEPTION 'campaign_family_parent_not_writable' USING ERRCODE = '42501',
      DETAIL = 'You need write access to the parent campaign to make this campaign part of it.';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_campaigns_enforce_one_level
  BEFORE INSERT OR UPDATE OF parent_campaign_id, is_sms_episode, is_standing ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.campaigns_enforce_one_level();
```

Cases covered, each a contract test (§4.2): self; grandparent (setting a parent on a campaign that has children);
grandchild (choosing a parent that has a parent); parent is an episode, standing or archived; child is an episode or
standing; a parent flipped to episode/standing while it has children; parent not writable by the caller (SET-a);
clearing always allowed; parent deleted → FK `SET NULL` (tested by deleting the fixture parent with children still
linked and asserting `parent_campaign_id IS NULL` on the child, and that the child's ratings on the shared activity
are gone with the parent's activities — the stated meaning of `ON DELETE SET NULL` here). `archived_at` is today an
SMS-episode marker (`:9718` column comment); refusing it as a parent costs nothing and closes the case the
specification asks about. **TRG-b** (alternative): enforce SET-a in the Basics sheet only (the eligibility list is
already limited to writable campaigns); rejected because the database is the authority for every other write rule in
this programme (`wp/wp1.6.md`, `wp/wp2.2.md` §3.1).

**6. Helper `campaign_family_activity_ids`** — STABLE, SECURITY INVOKER, `SET search_path`, as specified. It runs
under the caller's RLS; the select policies on both tables are `USING (true)` for `authenticated` (`:26945`, `:27041`),
so it returns the same ids for every signed-in user.

```sql
CREATE OR REPLACE FUNCTION public.campaign_family_activity_ids(p_campaign_id integer)
RETURNS SETOF integer
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path TO pg_catalog, public
AS $$
  SELECT a.activity_id
  FROM public.campaign_activities a
  WHERE a.campaign_id = p_campaign_id
  UNION
  SELECT a.activity_id
  FROM public.campaigns c
  JOIN public.campaign_activities a ON a.campaign_id = c.parent_campaign_id
  WHERE c.campaign_id = p_campaign_id
    AND a.scope = 'family';
$$;
COMMENT ON FUNCTION public.campaign_family_activity_ids(integer) IS
  'WP3.8 (wp3.8.md §3.1): the activities a campaign may read and rate — its own, plus its parent''s scope = family ones. '
  'One definition for SQL views and for PostgREST readers (lib/campaign/families.ts mirrors it). A parent never sees a child''s.';
REVOKE ALL ON FUNCTION public.campaign_family_activity_ids(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.campaign_family_activity_ids(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.campaign_family_activity_ids(integer) TO authenticated, service_role;
```

Grants follow `20260910090000_campaign_last_activity.sql:68–72`. A function with a `SET` clause is never inlined by
the planner, so the view calls it per membership row; §7 R4 has the measured cost (fine at this scale) and the
fallback.

**7. `campaign_worker_rating_summary`** — §3.3, `CREATE OR REPLACE VIEW … WITH (security_invoker = true)`.

**8. `vw_sms_chat_session_report`** — §3.3, `CREATE OR REPLACE VIEW` (no `security_invoker`, as today).

**9. Post-assertions**: both columns present with the stated default/CHECK; the two indexes; the trigger; the helper
with `prosecdef = false` and `proconfig` containing `search_path`; the summary view's column list equals the
captured one and `reloptions` still `security_invoker=true`; the whole-view checksum equals the captured one (no
campaign has a parent, so the output is byte-identical); row counts of the four tables unchanged; `children_now = 0`,
`family_now = 0`; `SELECT count(*) FROM public.campaign_family_activity_ids(<any existing campaign>)` equals that
campaign's activity count.

**Rollback `90_rollback_wp3_8_campaign_families.sql`** (operator/agent, run-sheet style): `BEGIN;` → environment
guard (verbatim from `oux-wp2.2/91:11–29`) → preconditions: the WP3.8 objects exist; **STOP** if any
`campaigns.parent_campaign_id IS NOT NULL` or any `scope = 'family'` row exists (run `91_rollback_campaign64_family.sql`
first; the rollback never silently drops data) → capture counts → restore `vw_sms_chat_session_report` verbatim from
the baseline (`:16498–16542`) → restore `campaign_worker_rating_summary` verbatim from the baseline (`:10699–10760`,
`WITH (security_invoker='true')`; dependents stay valid, same column list) → `DROP FUNCTION
public.campaign_family_activity_ids(integer)` → `DROP TRIGGER trg_campaigns_enforce_one_level ON public.campaigns;
DROP FUNCTION public.campaigns_enforce_one_level()` → `DROP INDEX idx_campaign_activities_family; ALTER TABLE
campaign_activities DROP COLUMN scope` → `DROP INDEX idx_campaigns_parent_campaign_id; ALTER TABLE campaigns DROP
CONSTRAINT campaigns_parent_not_self, DROP COLUMN parent_campaign_id` (dropping the column drops its FK) →
post-conditions (objects absent, view text contains `r.campaign_id = m.campaign_id` again, counts unchanged) → final
labelled result set → `COMMIT;`. Migration-history repair (`DELETE FROM supabase_migrations.schema_migrations WHERE
version = '20260917100000'`) is a separate, explicitly approved statement, as in WP2.1/2.2.

### 3.2 Data run sheet `10_campaign64_family.sql` and `91_rollback_campaign64_family.sql`

`10`: `BEGIN;` → the environment guard (the operator adds `SET LOCAL oux.env = 'production';` after `BEGIN;`; the
committed file omits it and names no project) → preconditions: the WP3.8 objects exist; campaigns 64, 61, 62, 69
exist; 64 has `parent_campaign_id IS NULL`, `is_sms_episode = false`, `is_standing = false`; each of 61, 62, 69 has
`parent_campaign_id IS NULL`, no children, not episode/standing; activities 88, 89, 90, 91, 92 exist with
`campaign_id = 64`, `activity_kind = 'assessment'`, `scope = 'campaign'`; 93 and 95 exist with `scope = 'campaign'`
(they are left alone; the assertion pins the operator's answer) → capture `updated_at` of 61/62/69 →
`UPDATE public.campaigns SET parent_campaign_id = 64 WHERE campaign_id IN (61, 62, 69)` (runs as `postgres`, so the
trigger's SET-a arm is skipped and its structural arms still fire) → `UPDATE public.campaign_activities SET scope =
'family' WHERE activity_id IN (88, 89, 90, 91, 92) AND campaign_id = 64` → log the eight changed rows to
`public._oux_hygiene_log` (WP0.4 shape: script, action, table_name, row_pk, before_row, after_row; present on
production since WP0.4 and on both other projects, verified read-only 2026-09-17) → post-assertions: exactly 3 rows
with `parent_campaign_id = 64`, exactly 5 `family` rows all owned by 64, `campaign_family_activity_ids(61)` = 61's own
ids ∪ {88..92}, no other row changed (counts) → `COMMIT;` → appended read-only SELECT:

```sql
SELECT c.campaign_id, c.name, c.parent_campaign_id, c.updated_at,
       (SELECT count(*) FROM public.campaign_family_activity_ids(c.campaign_id)) AS visible_activities
FROM public.campaigns c WHERE c.campaign_id IN (61, 62, 64, 69) ORDER BY c.campaign_id;
SELECT activity_id, campaign_id, scope FROM public.campaign_activities WHERE campaign_id = 64 ORDER BY activity_id;
```

Expected: 61, 62, 69 → parent 64; `visible_activities` = own count + 5; 64 → parent NULL; scope rows 88–92 `family`,
93 and 95 `campaign`. The agent never decides the sector-wide set; the ids are the operator's answer of 2026-09-17.

`91`: guard → precondition: 3 children of 64 and 5 family rows as above → `UPDATE campaigns SET parent_campaign_id
= NULL WHERE campaign_id IN (61,62,69) AND parent_campaign_id = 64`; `UPDATE campaign_activities SET scope =
'campaign' WHERE activity_id IN (88,89,90,91,92) AND campaign_id = 64` → log → post-assertions (0 and 0) → result set
→ `COMMIT;`.

### 3.3 The two views, in full

`campaign_worker_rating_summary` — the baseline text (`:10699–10760`) with exactly two changes: the `rating_activity`
CTE drops the unused `a.campaign_id` column and the outer join becomes an `IN (SELECT campaign_family_activity_ids(m.campaign_id))`;
the `last_activity_rating` subquery does the same. The membership join (`campaign_worker_membership m` ⋈
`worker_base_rating`) is untouched — VIEW-a: a child sees a shared activity's ratings only for its own members
because every row of this view starts from `m`.

```sql
CREATE OR REPLACE VIEW public.campaign_worker_rating_summary WITH (security_invoker = true) AS
WITH worker_base_rating AS (
  SELECT m_1.campaign_id, m_1.worker_id,
    CASE
      WHEN lower(mrt.role_name::text) = ANY (ARRAY['contact'::text, 'activist'::text, 'delegate'::text]) THEN 1
      WHEN w.is_bargaining_rep = true THEN 1
      WHEN umt.type_name::text = ANY (ARRAY['financial_member'::character varying, 'non_oa_member'::character varying, 'member_pending'::character varying]::text[]) THEN 2
      ELSE NULL::integer
    END AS base_rating
  FROM public.campaign_worker_membership m_1
  JOIN public.workers w ON w.worker_id = m_1.worker_id
  LEFT JOIN public.union_membership_types umt ON umt.union_membership_type_id = w.union_membership_type_id
  LEFT JOIN public.member_role_types mrt ON mrt.role_type_id = w.member_role_type_id
), rating_activity AS (
  SELECT r_1.rating_id, r_1.worker_id, r_1.activity_id, r_1.rating, r_1.binary_value, r_1.rated_at,
    CASE
      WHEN lower(TRIM(BOTH FROM r_1.binary_value)) = ANY (ARRAY['yes'::text, 'y'::text, 'true'::text, 't'::text, '1'::text]) THEN 'yes'::text
      WHEN lower(TRIM(BOTH FROM r_1.binary_value)) = ANY (ARRAY['no'::text, 'n'::text, 'false'::text, 'f'::text, '0'::text]) THEN 'no'::text
      WHEN lower(TRIM(BOTH FROM r_1.binary_value)) = 'abstained'::text THEN 'abstain'::text
      WHEN lower(TRIM(BOTH FROM r_1.binary_value)) = ANY (ARRAY['unsure'::text, 'unknown'::text, 'abstain'::text]) THEN lower(TRIM(BOTH FROM r_1.binary_value))
      ELSE lower(TRIM(BOTH FROM r_1.binary_value))
    END AS binary_key,
    CASE
      WHEN lower(TRIM(BOTH FROM a.supporter_outcome_value)) = ANY (ARRAY['yes'::text, 'y'::text, 'true'::text, 't'::text, '1'::text]) THEN 'yes'::text
      WHEN lower(TRIM(BOTH FROM a.supporter_outcome_value)) = ANY (ARRAY['no'::text, 'n'::text, 'false'::text, 'f'::text, '0'::text]) THEN 'no'::text
      WHEN lower(TRIM(BOTH FROM a.supporter_outcome_value)) = 'abstained'::text THEN 'abstain'::text
      WHEN lower(TRIM(BOTH FROM a.supporter_outcome_value)) = ANY (ARRAY['unsure'::text, 'unknown'::text, 'abstain'::text]) THEN lower(TRIM(BOTH FROM a.supporter_outcome_value))
      ELSE COALESCE(NULLIF(lower(TRIM(BOTH FROM a.supporter_outcome_value)), ''::text), 'yes'::text)
    END AS supporter_key
  FROM public.campaign_activity_ratings r_1
  JOIN public.campaign_activities a ON a.activity_id = r_1.activity_id
  WHERE a.is_perception = false
)
SELECT m.campaign_id,
  m.worker_id,
  CASE
    WHEN wb.base_rating IS NOT NULL THEN round((wb.base_rating::numeric + COALESCE(sum(r.rating::numeric) FILTER (WHERE r.rating IS NOT NULL), 0::numeric)) / (1 + count(r.rating_id) FILTER (WHERE r.rating IS NOT NULL))::numeric)::integer
    WHEN count(r.rating_id) FILTER (WHERE r.rating IS NOT NULL) > 0 THEN round(avg(r.rating::numeric) FILTER (WHERE r.rating IS NOT NULL))::integer
    ELSE NULL::integer
  END AS cumulative_rating,
  ( SELECT r2.rating
      FROM public.campaign_activity_ratings r2
      JOIN public.campaign_activities a2 ON a2.activity_id = r2.activity_id
     WHERE a2.activity_id IN (SELECT public.campaign_family_activity_ids(m.campaign_id))   -- WP3.8: was a2.campaign_id = m.campaign_id
       AND a2.is_perception = false AND r2.worker_id = m.worker_id AND r2.rating IS NOT NULL
     ORDER BY r2.rated_at DESC NULLS LAST
     LIMIT 1) AS last_activity_rating,
  COALESCE(bool_or(r.rating IS NOT NULL AND (r.rating = ANY (ARRAY[1, 2])) OR r.binary_key IS NOT NULL AND (r.binary_key <> ALL (ARRAY['unsure'::text, 'unknown'::text, 'abstain'::text, 'maybe'::text])) AND r.binary_key = r.supporter_key), false) AS has_supportive_activity_rating,
  count(DISTINCT r.activity_id) FILTER (WHERE r.rating IS NOT NULL AND (r.rating = ANY (ARRAY[1, 2])) OR r.binary_key IS NOT NULL AND (r.binary_key <> ALL (ARRAY['unsure'::text, 'unknown'::text, 'abstain'::text, 'maybe'::text])) AND r.binary_key = r.supporter_key)::integer AS supportive_activity_count
FROM public.campaign_worker_membership m
JOIN worker_base_rating wb ON wb.campaign_id = m.campaign_id AND wb.worker_id = m.worker_id
LEFT JOIN rating_activity r ON r.worker_id = m.worker_id
  AND r.activity_id IN (SELECT public.campaign_family_activity_ids(m.campaign_id))         -- WP3.8: was r.campaign_id = m.campaign_id
GROUP BY m.campaign_id, m.worker_id, wb.base_rating;
```

The implementer copies the operator/expression text from the **live** `pg_get_viewdef` on dev (Stage 2 step (e))
rather than from this document, so the only diff against the live definition is the two marked lines; the reviewer
diffs the two texts.

`vw_sms_chat_session_report` — baseline `:16498–16542` verbatim except line `:16535`:
`WHERE a.activity_id IN (SELECT public.campaign_family_activity_ids(o.campaign_id)) AND r.source = ANY (…) AND r.worker_id IN (…)`.

### 3.4 RLS confirmation (RAT-a) and the one gap (FQ-b)

What already makes RAT-a work for a `user` on the child, confirmed against the live policy text on the realistic set
(2026-09-17) and the baseline lines in C15:

- read the parent's family activity: `Authenticated users can read campaign_activities` `USING (true)` `:26945`;
- insert a rating on it: `Admin/User can insert campaign_activity_ratings` (role only) `:25927`; update: `:26303`;
  the upsert `onConflict` path used by `useSaveActivityRating.ts:57–62` needs both, and has both;
- `record_assessment_event` `:4598` is SECURITY DEFINER and gated by its callers (`sms/conversations/[id]/assessments/route.ts:198–206`
  checks `can_write_to_campaign(effectiveCampaignId)` — the **child's** id, which is right);
- delete the activity: `Can delete campaign_activities` `USING (can_write_to_campaign(campaign_id) OR is_admin())`
  `:27518` — the parent's id, so a child-only writer is refused. **Stays owner-only** (specification).

**The gap — `Can delete campaign_activity_ratings` `:27522–27524`** gates on the *activity's* campaign: a child
organiser who is not a writer of the parent can insert and overwrite a rating on the shared activity but can never
remove it (the sheet's "Remove rating" `worker-detail-sheet.tsx:1371–1375`, the clear-ratings dialog
`clear-ratings-dialog.tsx:67–72`, and the SMS "Unassessed" path `assessments/route.ts:228–236` all delete). Under
RLS a refused delete is a silent 0-row result, so the UI would say "Rating removed" and nothing would change.
The specification says: raise a gap as a stop condition. **FQ-b:**

- **RD-a (recommended)** — one additive policy in the migration, tested by contract:
  ```sql
  CREATE POLICY "wp38_car_delete_family" ON public.campaign_activity_ratings FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.campaign_activities a
    JOIN public.campaigns child ON child.parent_campaign_id = a.campaign_id
    JOIN public.campaign_worker_membership m ON m.campaign_id = child.campaign_id AND m.worker_id = campaign_activity_ratings.worker_id
    WHERE a.activity_id = campaign_activity_ratings.activity_id
      AND a.scope = 'family'
      AND public.get_user_role() = ANY (ARRAY['admin','user'])
      AND public.can_write_to_campaign(child.campaign_id)));
  ```
  A writer of a child may delete a rating on a shared activity **only for a member of that child** — the same
  boundary as VIEW-a. Policies are OR-ed, so the owner path is unchanged. `90` drops it.
- **RD-b** — no policy; the child's UI hides Remove/Clear on shared activities and the SMS route returns 409 for
  "Unassessed" on a shared activity; a wrong rating can only be overwritten.

If the operator chooses RD-b, §4.2's delete test asserts the refusal instead, and §3.7/§3.8 hide the controls.

Pre-existing looseness, recorded and **not** changed: any `user` can `UPDATE` any activity row via PostgREST
(`:26299` is role-only), so the scope toggle is enforced in the UI (writers of the owner) and not by RLS; the same
holds today for title, labels and every other column.

### 3.5 The pure module and the reader switch

`apps/organising-db/src/lib/campaign/families.ts` (pure; no imports from React or Supabase; vitest beside it):

```ts
export type ActivityScope = "campaign" | "family";
export type FamilyActivityLike = { activity_id: number; campaign_id: number; scope?: ActivityScope | string | null };

/** PostgREST `.or()` clause for "owned by campaignId, or owned by parentId with scope = family". */
export function familyActivityFilter(campaignId: number | string, parentId: number | string | null | undefined): string;
//   no parent  → `campaign_id.eq.<cid>`
//   parent     → `campaign_id.eq.<cid>,and(campaign_id.eq.<pid>,scope.eq.family)`
//   throws on a non-integer id (the clause is interpolated into a query string)

/** True when `activity` is visible to `campaignId` as a shared (family) activity of `parentId`. */
export function isFamilyActivity(activity: FamilyActivityLike, campaignId: number | string, parentId: number | string | null | undefined): boolean;
export function isOwnedActivity(activity: FamilyActivityLike, campaignId: number | string): boolean;
/** Owned first (input order), then family (input order); drops anything else — the client-side mirror of the helper. */
export function partitionFamilyActivities<T extends FamilyActivityLike>(rows: T[], campaignId, parentId): { owned: T[]; family: T[] };
export function familyLabel(parentName: string | null | undefined): string;      // "Shared from Fugro" / "Shared from parent campaign"
export function sharedWithLabel(childCount: number): string;                     // "Shared with 1 campaign" / "Shared with 3 campaigns"
export function familyErrorMessage(code: string | null | undefined, message: string): string; // maps campaign_family_* → sentences
```

Name refinement recorded (not a conflict): the specification writes `isFamilyActivity(activity, campaignId)`; the
function cannot answer without the parent, so it takes `parentId` as a third argument. `familyActivityFilter` and
`familyLabel` keep the specified names.

**Loading `parent_campaign_id` once.** `apps/organising-db/src/lib/campaign/campaign-parent.ts`:
`loadCampaignParent(client, campaignId): Promise<{ parentId: number | null; parentName: string | null }>` —
`from("campaigns").select("parent_campaign_id, parent:campaigns!campaigns_parent_campaign_id_fkey(campaign_id, name)").eq("campaign_id", id).maybeSingle()`
(the FK name is the one PostgreSQL derives for the `REFERENCES` clause in §3.1; the migration's post-assertion pins it) —
and the hook `useCampaignParent(campaignId)` = `useQuery({ queryKey: ["campaign-parent", Number(campaignId)], queryFn, staleTime: 5 min })`.
Every client reader that today knows only `campaignId` calls the hook and gates its own query on
`parent.isSuccess` (`enabled`), so the first render already has the family rows; every server route calls the loader
once. The campaign page's own query (`[id]/page.tsx:336–347`, `select("*")`) and the header's `useCampaign`
(`usePlannerCampaigns.ts:80–99`, `select("*")`) receive `parent_campaign_id` for free once the column exists; the
hand-typed `CampaignDetail` (`page.tsx:95–115`) and `CampaignBasics` (`campaign-basics-edit-sheet.tsx:35–43`) gain
`parent_campaign_id?: number | null` (optional, so fixtures compile). The Basics sheet and the header use the row they
already have; the readers below use the hook so they never depend on the page's query.

**Per-file switch table** (every row is a `.eq("campaign_id", …)` → `.or(familyActivityFilter(campaignId, parentId))`,
plus the hook/loader; nothing else in the file changes unless stated):

| Row | File `:line` | Current | New |
|---|---|---|---|
| 1 | `assessment-selector.tsx:43–50` | `.eq("campaign_id", campaignId).eq("activity_kind","assessment")` | `fetchWallChartAssessmentOptions(supabase, campaignId, parentId)`; select adds `campaign_id, scope`; option gains `campaign_id`, `scope`, `is_family` (§3.7); `useWallChartAssessmentOptions(campaignId)` keeps its signature (called from nine files incl. WP2.6-owned ones), calls `useCampaignParent` internally, key `["campaign-assessments-rated", campaignId, parentId ?? 0]` (prefix invalidations — `refreshWallChartAssessmentOptions` at `campaign-assessments.tsx:277`, `clear-ratings-dialog.tsx:78`, the header bar `:399–401` — still match); `removeDeletedActivityFromWallChartCache` (`:146–155`) switches `setQueryData` → `setQueriesData` on the prefix |
| 1b | `lib/hooks/useAssessmentDistributions.ts:46–49` | its own `useQuery` on the same key with `fetchWallChartAssessmentOptions(supabase, campaignId)` | `useWallChartAssessmentOptions(campaignId)` (one queryFn per key) |
| 2 | `participation-selector.tsx:36–41` | `.eq("campaign_id", campaignId)` | filter; select adds `campaign_id, scope`; family group (§3.7) |
| 3 | `use-participation-predicate.ts:41–47` | `.eq("campaign_id", campaignId).order(...).limit(1)` | filter; key gains `parentId` |
| 4 | `clear-ratings-dialog.tsx:51–57` | `.eq("campaign_id", campaignId).eq("activity_kind","assessment")` | filter; key `["campaign-activities", campaignId, "assessment", parentId ?? 0]`; CL-a (§3.8) |
| 5 | `worker-detail-sheet.tsx:1299–1304` | same | filter; same key as row 4; family group in the Select (§3.7) |
| 5b | `worker-detail-sheet.tsx:1347` | `.filter((r) => r.activity?.campaign_id === Number(campaignId))` | `.filter((r) => r.activity && (isOwnedActivity(r.activity, campaignId) \|\| isFamilyActivity(r.activity, campaignId, parentId)))`; embed adds `scope`; the history row shows a "Shared" badge for family rows |
| 6 | `campaign-assessments.tsx:159–163` | `.eq("campaign_id", campaignId)` under key `["campaign-activities", campaignId]` | filter; **new key** `["campaign-activities-family", campaignId, parentId ?? 0]` (A8 keeps the old key owned-only); `select("*")` already returns `scope`; the delete's invalidations (`:276–286`) and the header bar's `onCreated` (`campaign-detail-header-bar.tsx:390–402`) add the new key |
| 7 | `import/worker-import-wizard.tsx:691–697` | `.eq("campaign_id", numericCampaignId)` | filter; key gains `parentId` |
| 8 | `participation-import/apply/route.ts:305–313`, `:334–342` | `activity.campaign_id !== campaignId → 400` | `select("activity_id, campaign_id, title, scope")`; accept when `isOwnedActivity \|\| isFamilyActivity(activity, campaignId, parent.parentId)`; `loadCampaignParent` once at the top of the handler; error text unchanged ("Assessment not found for this campaign") |
| 9 | `role-check/route.ts:66–70`, `:85–90`, `:126–131` | activities `.eq("campaign_id")`; ratings by those ids; workers by id | activity ids from `.rpc("campaign_family_activity_ids", { p_campaign_id })` (server, one call; the RPC returns `SETOF integer` as `number[]`); ratings `.in("activity_id", ids)` **and** `.in("worker_id", memberIds)` where `memberIds` is one read of `campaign_worker_membership` for the campaign (VIEW-a) |
| 10 | `an-actions/route.ts:60–64` | `.eq("campaign_id", campaignId).not("an_resource_id","is",null)` | filter with the loader |
| 11–25 (FQ-a) | A18, A19, A21b, A22, A23, A25, A26, A27, A32–A38, A41 | `.eq("campaign_id", …)` / `activity.campaign_id !== cid` | same pattern: client files use the hook; routes use the loader; validation sites accept owned-or-family. A26 uses the RPC ids with `.in("activity_id", ids)` in place of the `!inner` embed filter |

Readers marked unchanged in §2 are not opened.

### 3.6 `participation-import/apply/route.ts` and RAT-a

With row 8 the import accepts the parent's family activity as its target; `writeRatingChunk` (`:182–`) then upserts
against that `activity_id`, so the ratings land on the parent's row for the child's matched workers. Membership
side-effects of the import stay on the child (the route enrols into `campaignId`). **FQ-c:** `:537–545` then stamps
`an_resource_*` on the parent's activity when `body.an_resource` is set. Recommended: allow — a shared sector petition
tracks one AN action wherever it is imported from, and the AN link is a property of the assessment (`:8911` column
comment), not of the importing campaign; the child's `an-actions` list (row 10) then shows it as linked. Alternative:
skip the stamp when the target is family and report "AN link not recorded on a shared assessment" in the response.

### 3.7 UI

Terminology per plan §3.6 (`docs/ORGANISER_UX_REVIEW_AND_PLAN.md:122–133`): "campaign", "assessment", "Part of",
"Shared from", "Shared with"; never "episode", "container", "scope" as user-facing words (the toggle says "Share with
family campaigns").

- **Assessments tab** (`campaign-assessments.tsx:645–685`): `partitionFamilyActivities(assessmentActivities, campaignId, parentId)`.
  Owned pills render as today. When `family.length > 0`, a second heading **Shared from &lt;parent&gt;** (`familyLabel(parentName)`)
  with the family pills: selectable (the ratings table `:700–…` and bulk update work unchanged — they post against the
  pill's `activity_id`, the parent's row), a "Shared" `Badge`, **no** Trash button (`:669–684` guarded by
  `isOwnedActivity`), no `ActivityAmbitionLinksPanel` for a family row (`:690–696` — ambitions are the owner's plan).
  The definition (title, type, labels) is read-only in the child: the tab never edits definitions today, so nothing
  is removed. In the **parent**, an owned `assessment` pill whose `scope === "family"` shows the badge
  `sharedWithLabel(children.length)` (children from `["campaign-children", campaignId]`: `from("campaigns").select("campaign_id, name").eq("parent_campaign_id", id)`).
  **UI-a:** the scope toggle (`assessments/assessment-scope-toggle.tsx`, a small `Switch` in the pill row, writers only)
  is rendered when the campaign has no parent **and** (it has ≥ 1 child **or** the row is already `family`); it writes
  `update({ scope }).eq("activity_id").eq("campaign_id", campaignId)`, invalidates the family keys, and emits
  `assessment_scope_changed`. Turning sharing **off** with N ≥ 1 children opens an `AlertDialog`: "Child campaigns will
  no longer see this assessment. Ratings recorded from them stay here." — the answer to "what a child sees when the
  parent clears family": the activity disappears from every child list on the next fetch (no child-side warning; a
  child's stored Colour-by selection falls back to Cumulative through the existing effect `assessment-selector.tsx:186–192`),
  and the ratings stay on the parent's row, visible in the parent.
- **Selector** (`assessment-selector.tsx:235–283` and the per-unit control `:403–440`): a third `SelectGroup` labelled
  `familyLabel(parentName)` listing family options (rated and unrated together), each with the " · shared" suffix; the
  two existing groups list owned options only; the grouping is one exported pure function `groupAssessmentOptions(options, campaignId, parentId)`
  so both controls and the tests share it. `WallChartAssessmentOption` (`wall-chart/types.ts:114–125`) gains
  `campaign_id: number; scope: ActivityScope; is_family: boolean` (additive).
- **Participation selector** (`participation-selector.tsx:100–110`): same third group.
- **Worker sheet** (`worker-detail-sheet.tsx:1428–1447`): the Assessment `Select` gains the same group; saving posts
  `activityId: selectedActivity.activity_id` through `useSaveActivityRating` (`:1478–1485`) — for a family option that
  is the parent's id (acceptance item 3). `family_assessment_rated` is emitted here, in the Assessments tab's
  `saveRating`/`bulkSaveRatings`, and in `inline-rating-popover.tsx` when the chosen option `is_family`.
- **Basics sheet** (`campaign-basics-edit-sheet.tsx`): a **Part of** `Select` under the organiser picker (`:295–306`):
  options = `from("campaigns").select("campaign_id, name").is("parent_campaign_id", null).eq("is_sms_episode", false).eq("is_standing", false).neq("campaign_id", campaignId).order("name")`
  intersected client-side with `useCampaignWriteAccess(candidateIds)` (`lib/hooks/useCampaignWriteAccess.ts:16–33`,
  one `campaigns_i_can_write` round trip), plus "None"; disabled with the reason "This campaign has N child campaigns"
  when `["campaign-children"]` is non-empty. Save adds `parent_campaign_id` to the payload (`:240–253`); a
  `campaign_family_*` error from the trigger is shown through `familyErrorMessage` in the existing error slot
  (`:416–422`); success invalidates `["campaign", …]`, `["campaign-parent", …]`, `["campaign-children", …]` and emits
  `campaign_parent_set`. Clearing is allowed (SET-a).
- **Header** (`campaign-detail-header-bar.tsx:362–364`): under the dates, "Part of &lt;parent&gt;" as a `Link` to
  `/campaigns/<parentId>` when `campaign.parent_campaign_id` is set (name from `useCampaignParent`).
- **Parent's Setup**: the Setup tab is the workforce/universe panel (`lib/campaign/workspace-tabs.ts:228–238`), rendered at
  `[id]/page.tsx:760` (`<CampaignUniverseSection …/>`). A new `components/campaigns/campaign-family-card.tsx` is mounted
  on the line **above** it (one import, one line; `campaign-universe-section.tsx` and `campaign-settings.tsx` untouched —
  §3.15): "Part of &lt;parent&gt;" with an Edit link that opens the Basics sheet's route, or "Child campaigns (N)" as a
  list of links; hidden when the campaign has neither.
- **Telemetry** (`lib/analytics/events.ts:33–37` union; builders after `:240`): `campaign_parent_set { campaign_id, parent_id: number | null, previous_parent_id: number | null }`,
  `assessment_scope_changed { campaign_id, activity_id, scope: ActivityScope, child_count }`,
  `family_assessment_rated { campaign_id, parent_id, activity_id }`. Integer ids and a closed union only; the privacy
  test `lib/analytics/__tests__/events.test.ts` is extended with the three builders.

### 3.8 Clear ratings from a child on a shared activity (CL-a)

`ClearRatingsDialog` receives `workerIds` from the chart's selection (`v2/wall-chart-dialogs-v2.tsx:345–349`, legacy
`wall-chart-dialogs.tsx:271`), i.e. tiles, i.e. members of the viewing campaign. The delete (`:67–72`) is `.in("worker_id",
workerIds).eq("activity_id", id)` and therefore can never touch another campaign's members' ratings — the dialog's
copy gains one sentence for a family option: "This assessment is shared from &lt;parent&gt;; only the selected workers'
ratings are cleared." Under RD-a the delete succeeds for members; under RD-b the family group is omitted from this
dialog. No RPC is added.

### 3.9 Generated types

`packages/db-types/generated.ts` is not edited on the branch and nothing on the branch reads
`Database["public"]["Tables"]["campaigns"]["Row"]["parent_campaign_id"]` or `…["campaign_activities"]["Row"]["scope"]`:
the browser client and the server client are `SupabaseClient<any>` (`structure-api.contract.test.ts:119–122`), the
columns are typed by the hand-written `ActivityScope`/`FamilyActivityLike` in `families.ts`, by the optional fields on
`CampaignActivity` (`types/organising-row-types.ts:540–551`, `scope?: ActivityScope`), `CampaignDetail` and
`CampaignBasics`, and by the option type (§3.7) — the WP2.2 pattern for RPC contracts (`structure-api.ts:14–17`).
After the operator merges (post production apply), `gen-types.yml` regenerates from production and the two columns
appear; no code changes then. A regeneration from dev on the branch is **not** done (it would strip nothing but is
not needed and would touch a shared file).

### 3.15 File boundaries

Packages in flight: WP2.5 (Compare, `wp/wp2.5.md:718–732`), WP2.6 (List, `wp/wp2.6.md:636–650`), WP2.7 (Editor,
`wp/wp2.7.md:921–935`), WP2.4b (mirror, `wp/wp2.4.md:731–790`), WP2.4c (merged 2026-09-17). WP3.8 opens none of their
files and none of the structure files.

| File WP3.8 edits or creates | Owner elsewhere? | How a collision is avoided |
|---|---|---|
| `supabase/migrations/20260917100000_wp3_8_campaign_families.sql` (new); `scripts/data-hygiene/oux-wp3.8/**` (new files, README edited) | none — WP2.5/2.6/2.7/2.4b carry no migration and no `supabase/` object | — |
| `lib/campaign/families.ts`, `campaign-parent.ts`, their `__tests__`, `__contract__/campaign-families.contract.test.ts` (new) | none (`lib/campaign/groups/**` is WP2.4/2.4c's; not entered) | — |
| `components/campaigns/campaign-family-card.tsx`, `assessments/assessment-scope-toggle.tsx` (new) | none | — |
| `wall-chart/assessment-selector.tsx`, `participation-selector.tsx`, `use-participation-predicate.ts`, `clear-ratings-dialog.tsx`, `worker-detail-sheet.tsx` (RatingsTab `:1286–1500` only), `inline-rating-popover.tsx` (telemetry line) | not in any in-flight owns-list (`wall-chart/v2/**` is; these are the shared legacy-dir components the v2 toolbar imports, `v2/wall-chart-toolbar.tsx:9–11`) | signatures unchanged (`AssessmentSelectorProps`, `useWallChartAssessmentOptions(campaignId)`), so `v2/wall-chart-toolbar.tsx`, `workforce-list-view.tsx:652`, `workforce-bulk-toolbar.tsx:101` and `use-wall-chart-core-data.ts:107` compile untouched |
| `wall-chart/types.ts:114–125` (`WallChartAssessmentOption` fields, additive) | shared; WP2.4 added `group_id` to another type | additive fields on a different type; merge keeps both |
| `components/campaigns/campaign-assessments.tsx`, `campaign-basics-edit-sheet.tsx`, `campaign-detail-header-bar.tsx:362–364`, `import/worker-import-wizard.tsx:691–697` | none | — |
| `app/(dashboard)/campaigns/[id]/page.tsx` — `:95–115` (type field) and one line at `:760` | WP2.7 edits `:51` and `:880` (`wp/wp2.7.md:925`) | different regions; whichever merges second merges `main` in (never rebases) |
| `lib/analytics/events.ts` (three union members + builders, additive) | WP2.5 adds one member (`wp/wp2.5.md:727`); WP2.7 "additive union" (`wp/wp2.7.md:936`) | additive; a textual conflict is resolved by keeping every member |
| `lib/analytics/__tests__/events.test.ts` (additive cases) | same | same |
| `lib/hooks/useAssessmentDistributions.ts:46–49` | none | — |
| `types/organising-row-types.ts:540–551` (`scope?`) | none | — |
| API routes: `participation-import/apply`, `role-check`, `an-actions`; FQ-a routes A19, A21b, A22, A23, A25, A26, A27 | none | — |
| FQ-a components A18, A32–A38, A41 (`phone/**`, `sms/**`, `lib/phone/`) | none (WP3.5 action containers is not started) | — |
| `wall-chart/__tests__/harness/fixture.ts` (one additive `family` knob), new test files under `wall-chart/__tests__/`, `components/campaigns/__tests__/` | harness rule: additive helpers only, never a signature change (`wp/wp2.6.md:648`) | additive |
| **Not touched** | `wall-chart/v2/**` (except the v2 characterisation snapshot, regenerated for react-query key lines only — D20), `lib/campaign/groups/**`, `lib/workers/sync-campaign-universe.ts`, `lib/workers/reconcile-placements.ts`, `structure-api.ts`, `structure-save.ts`, `campaign-settings.tsx`, `campaign-universe-section.tsx`, `campaign-units-section.tsx`, `campaign-wizard.tsx`, `create-organising-unit-dialog.tsx`, `workforce-board.tsx`, `workforce-list-view.tsx`, `workforce-bulk-toolbar.tsx`, `wall-chart-prefs.ts`, `use-wall-chart-core-data.ts`, `wall-chart-toolbar.tsx`, `unit-card-menu.tsx` (WP3.9), `packages/db-types/generated.ts`, every WP2.1/2.2 script, `supabase/.temp/*`, any e2e spec or helper | | |

Branch from `main` at or after `e2cf34a2`. If WP2.5/2.6/2.7 merge while WP3.8 is in flight, merge `main` in before each
stage's commit and re-run the suites; stop condition §7 S6 if a §3.15 file moved under it.

---

## 4. Tests

### 4.1 Unit tests (vitest, node, no DB) — run by `pnpm test`

- `lib/campaign/__tests__/families.test.ts`: `familyActivityFilter` with and without a parent (exact strings), string
  ids, rejection of non-integers; `isFamilyActivity` true only for `campaign_id === parentId && scope === 'family'` and
  never when `campaignId === parentId`; `isOwnedActivity`; `partitionFamilyActivities` (owned first, family second,
  sibling's and grandparent's rows dropped, order preserved, a `campaign`-scoped row of the parent excluded);
  `familyLabel` / `sharedWithLabel` singular/plural; `familyErrorMessage` for each `campaign_family_*` code and the
  pass-through.
- `lib/campaign/__tests__/campaign-parent.test.ts`: the loader's select string and its null handling (fake client
  returning `{ parent_campaign_id: null }`, a row with an embedded parent, an array-shaped embed).
- `wall-chart/__tests__/assessment-selector.grouping.test.ts`: `groupAssessmentOptions` — owned rated/unrated groups
  unchanged for a campaign with no parent (pins today's order), family group present only with a parent.
- `lib/analytics/__tests__/events.test.ts`: the three builders carry only ids/enums (privacy rule).

Test count ≥ the count on `main` at `e2cf34a2`; nothing skipped, quarantined or deleted.

### 4.2 Contract tests (vitest, DB-backed) — `pnpm test:contract`, normal dev only

File `src/lib/campaign/__contract__/campaign-families.contract.test.ts`, collected by the existing
`vitest.contract.config.ts:20` glob (`src/**/__contract__/**/*.contract.test.ts`, node, `fileParallelism: false`).
Environment, as the WP2.2 suite (`structure-api.contract.test.ts:52–60`, throws — never skips — when a variable is
missing or the host is production): `OUX_CONTRACT_SUPABASE_URL`, `OUX_CONTRACT_SUPABASE_ANON_KEY`,
`OUX_CONTRACT_USER_EMAIL/_PASSWORD` (the `user` account), `OUX_CONTRACT_FOREIGN_USER_EMAIL/_PASSWORD` (**required** here:
a second `user`-role account), and **new** `OUX_CONTRACT_ADMIN_EMAIL/_PASSWORD` (the dev admin account the e2e suite
already uses, `PROGRESS.md:105`); `OUX_CONTRACT_WORKER_IDS` optional as today. Values live in the shell only.

**Fixture** (`beforeAll`), created through the same REST insert the e2e cleanup helper and the WP2.2 suite use
(`tests/e2e/roles/campaign-cleanup.ts:106–113`; not a product creation path): the **admin** creates parent **P**
(`WP3.8 contract parent <runId>`), the **foreign user** creates child **C** (so C's only writer besides admins is the
foreign user: `created_by` default, `20260909120000:119–121`), the admin creates sibling **S** and links **C** and
**S** to **P** (`update campaigns set parent_campaign_id`), the admin creates on P one `assessment` activity **F** with
`scope = 'family'` and one **O** with `scope = 'campaign'`, and inserts memberships: workers `w1, w2` into C, `w1, w3`
into P, `w4` into S (ids from `OUX_CONTRACT_WORKER_IDS` or the first six workers). `afterAll`: the admin flips any
`is_standing` fixture row back to false, then `delete_campaign` on C, S, then P (`20260909130000:76–128`; cascades
activities and ratings) and asserts zero leftover rows by name.

| Test | Client | Asserts |
|---|---|---|
| one level: grandparent | admin | `update P set parent_campaign_id = G` (a fresh campaign G) → `campaign_family_child_has_children` |
| one level: grandchild | admin | a fresh C2 with `parent_campaign_id = C` → `campaign_family_parent_has_parent` |
| self | admin | `update C set parent_campaign_id = C` → `campaign_family_self` (or `23514` from the CHECK; either accepted, both are asserted absent on success) |
| SMS-episode parent | admin | a fresh E with `is_sms_episode = true`; C3 with parent E → `campaign_family_parent_kind` |
| standing parent | admin | a fresh T with `is_standing = true` (dev has 0 standing; flipped back before deletion because `delete_campaign` refuses standing); C4 with parent T → refused |
| episode child | admin | E with `parent_campaign_id = P` → `campaign_family_child_kind` |
| parent flipped while it has children | admin | `update P set is_sms_episode = true` → `campaign_family_parent_kind` |
| SET-a | foreign user | `update C set parent_campaign_id = P2` (a campaign the foreign user cannot write to) → `42501`; clearing (`null`) succeeds |
| helper | user, foreign user | `rpc('campaign_family_activity_ids', { p_campaign_id: C })` = C's own ∪ {F}; not O; not S's; for P = P's own only; for S = S's own ∪ {F} |
| RAT-a insert | foreign user (writer of C, not of P) | upsert a rating on F for w1 → row on F; `rpc('record_assessment_event', …)` path also succeeds |
| delete of the activity refused | foreign user | `delete from campaign_activities where activity_id = F` → 0 rows (RLS) and F still exists |
| delete of a rating (FQ-b) | foreign user | RD-a: deleting w1's rating on F succeeds; deleting w3's (a P member, not in C) → 0 rows. RD-b: both 0 rows |
| VIEW-a | user | `campaign_worker_rating_summary` for C: w1 has `supportive_activity_count = 1` after a supportive rating on F, w2 unchanged; **no row for w3**; the same query for P counts w1 and w3; a rating on O for w1 changes P's row and not C's |
| SET NULL | admin | delete P (via `delete_campaign`) with C still linked → C's `parent_campaign_id IS NULL`; F's ratings gone |

Every assertion reads the database state after the call, as `wp/wp2.2.md:558–562` requires. The WP2.2 suite is not
re-run for this package (no structure RPC is touched).

### 4.3 jsdom tests — run by `pnpm test`

Harness: the WP2.3/2.4 mount harness (`wall-chart/__tests__/harness/mount.tsx`, `backend.ts`, `fixture.ts`),
which mounts any `ComponentType<{ campaignId; canWrite }>` (`mount.tsx:28`), answers every `from(table)` from the
fixture's tables (filters ignored, `backend.ts:11–14`; `.or` accepted, `:187`), records writes on non-structure tables
(`WriteInvocation`, `:41–46`) and throws on an unseeded table. Additive fixture knob
`buildWallChartFixture(size, { family: { parentId: 9, parentName: "ROV sector wide", activities: [...] } })`: the
`campaigns` row (`fixture.ts:425`) gains `campaign_id: 1, parent_campaign_id: 9, parent: { campaign_id: 9, name }`
and `campaign_activities` gains rows with `campaign_id: 9, scope: "family"`; owned rows gain `campaign_id: 1, scope:
"campaign"`. Because the fake ignores filters, exclusion (a `campaign`-scoped row of the parent) is proven by the pure
tests of §4.1, and the jsdom tests prove rendering and the write target.

- `components/campaigns/__tests__/campaign-assessments.family.test.tsx`: mounts `CampaignAssessmentsSection` on the
  family fixture (tables it needs beyond the chart's: `campaign_worker_membership` with the worker embed,
  `campaign_task_lists`, `activity_ambitions`, `campaigns` — the unseeded-table error names any other): renders the
  heading "Shared from ROV sector wide", the family pill with the "Shared" badge and **no** Remove button; the owned pill
  keeps its Remove button; selecting the family pill and saving a rating records an upsert on
  `campaign_activity_ratings` with the parent's `activity_id`. A second case on a no-parent fixture: no heading, no
  badge (pins today's DOM). A third case: a parent fixture (`children: 2`, owned row `scope: "family"`) shows "Shared
  with 2 campaigns" and the toggle; toggling records an update `{ scope: "campaign" }`.
- `wall-chart/__tests__/assessment-selector.family.test.tsx`: a wrapper component holding `AssessmentSelection` state
  mounts `AssessmentSelector`; opening the select shows the group "Shared from ROV sector wide" with the family option
  " · shared"; choosing it calls `onChange` with the parent's `activityId` (acceptance item 3, "the chart selector lists a
  family assessment with the badge").
- `wall-chart/__tests__/worker-detail-sheet.family.test.tsx`: mounts `RatingsTab` (`worker-detail-sheet.tsx:1274`)
  with `workerId`, `workerName`, `canWrite`; picks the family assessment, saves → the recorded upsert's `activity_id` is
  the parent's (acceptance item 3, "rating from the child's sheet posts against the parent's `activity_id`"); the
  history list shows the "Shared" badge on a family row and hides a row whose activity is neither owned nor family.
- `components/campaigns/__tests__/campaign-basics-edit-sheet.family.test.tsx`: the Part of select lists only
  candidates returned by the `campaigns_i_can_write` fake (`rpcAnswers`, `backend.ts`), excludes the campaign itself,
  is disabled with the reason when children exist, and Save records `parent_campaign_id` in the update payload.

The existing characterisation suites (`wall-chart.characterization.test.tsx`, `wall-chart-v2.*`) run on fixtures with
no parent; they must stay byte-identical (the family group renders only with a parent).

### 4.4 Migration validation and rehearsal

`pnpm validate:migrations` (root). The dev apply and the realistic-data rehearsal of §0 with the `01` checksums
pasted at every point into §9.2.

### 4.5 e2e

None added: the package's flows are proven by contract (database), jsdom (rendering, write target) and the operator's
hand test (§5.4); the sandbox cannot run a browser suite (D80/D81, `PROGRESS.md:105`).

---

## 5. Commands (the verifier runs these; raw output into §9.2)

### 5.1 Local

```bash
cd /path/to/OffshoreAlliance
pnpm validate:migrations                         # "Validated 14 Supabase migrations …"
pnpm --filter organising-db lint                 # total ≤ 298 (146 errors / 152 warnings, PROGRESS.md:20); every touched file clean on its changed lines
pnpm --filter organising-db exec tsc --noEmit    # exit 0
pnpm --filter organising-db test                 # count ≥ main@e2cf34a2; 0 skipped beyond the established ones
pnpm --filter organising-db build                # exit 0 (no database access; .env.local targets production and is never used at runtime here)
```

### 5.2 Contract suite (normal dev; variables in the shell only, never printed)

```bash
cd apps/organising-db
OUX_CONTRACT_SUPABASE_URL=https://dpnnmkhabysfdogllsyh.supabase.co \
OUX_CONTRACT_SUPABASE_ANON_KEY=… OUX_CONTRACT_USER_EMAIL=… OUX_CONTRACT_USER_PASSWORD=… \
OUX_CONTRACT_FOREIGN_CAMPAIGN_ID=… OUX_CONTRACT_FOREIGN_USER_EMAIL=… OUX_CONTRACT_FOREIGN_USER_PASSWORD=… \
OUX_CONTRACT_ADMIN_EMAIL=… OUX_CONTRACT_ADMIN_PASSWORD=… \
pnpm test:contract src/lib/campaign/__contract__/campaign-families.contract.test.ts
```

The paste reports passed / failed / skipped (expected skipped = 0). Run once after Stage 2 and once after Stage 3.

### 5.3 Acceptance item 4 — `scripts/data-hygiene/oux-wp3.8/00_family_measurement.sql` (read-only)

Runs on the realistic data set through the connector (read is free). No write, no transaction control, no session
setting, no environment marker; aggregates only. It **simulates** the family (61 → 64, 62 → 64) and one family
activity (88, the operator's first sector-wide assessment) with `VALUES`, recomputes the summary under the §3.3 rule
for 61, 62 and 64, and compares row by row with the live view:

```sql
WITH family AS (SELECT * FROM (VALUES (61, 64), (62, 64)) AS f(child_id, parent_id)),
     family_flag AS (SELECT 88 AS activity_id),
     fam_ids AS (
       SELECT c.campaign_id AS viewing_id, a.activity_id
       FROM public.campaigns c JOIN public.campaign_activities a ON a.campaign_id = c.campaign_id
       UNION
       SELECT f.child_id, a.activity_id
       FROM family f JOIN public.campaign_activities a ON a.campaign_id = f.parent_id
       JOIN family_flag ff ON ff.activity_id = a.activity_id),
     wb AS ( /* worker_base_rating, verbatim from §3.3 */ ),
     ra AS ( /* rating_activity without the campaign join, verbatim from §3.3 */ ),
     simulated AS (
       SELECT m.campaign_id, m.worker_id, /* cumulative_rating and supportive_activity_count exactly as §3.3 */
       FROM public.campaign_worker_membership m
       JOIN wb ON wb.campaign_id = m.campaign_id AND wb.worker_id = m.worker_id
       LEFT JOIN ra r ON r.worker_id = m.worker_id
                     AND r.activity_id IN (SELECT activity_id FROM fam_ids fi WHERE fi.viewing_id = m.campaign_id)
       WHERE m.campaign_id IN (61, 62, 64)
       GROUP BY m.campaign_id, m.worker_id, wb.base_rating)
SELECT s.campaign_id, count(*) AS members,
       count(*) FILTER (WHERE s.cumulative_rating IS DISTINCT FROM v.cumulative_rating
                           OR s.supportive_activity_count IS DISTINCT FROM v.supportive_activity_count) AS rows_changed,
       count(*) FILTER (WHERE (…changed…) AND EXISTS (SELECT 1 FROM public.campaign_worker_membership p
                                                     WHERE p.campaign_id = 64 AND p.worker_id = s.worker_id)) AS rows_changed_shared_with_parent,
       count(*) FILTER (WHERE (…changed…) AND EXISTS (SELECT 1 FROM public.campaign_activity_ratings r
                                                     WHERE r.activity_id = 88 AND r.worker_id = s.worker_id)) AS rows_changed_rated_on_88
FROM simulated s
JOIN public.campaign_worker_rating_summary v ON v.campaign_id = s.campaign_id AND v.worker_id = s.worker_id
GROUP BY s.campaign_id ORDER BY s.campaign_id;
```

Run read-only on 2026-09-17 while planning (the query above in full): **61: 48 members, 2 rows changed, all 2 shared
with the parent, all 2 rated on 88; 62: 64 members, 13 changed, 13 shared, 13 rated on 88; 64: 276 members, 0
changed.** That is the acceptance shape: child summaries change only for shared workers who hold a rating on the
family activity, and the parent's counts are unchanged. After the migration is on the realistic set the same file
still runs (it does not depend on the new columns) and the verifier pastes it again; the implementer may add a second
statement that computes the same comparison through the live view with `campaign_family_activity_ids` once `10`'s
production output exists (operator paste), which is the post-data evidence.

### 5.4 Operator hand-test checklist (E2 pattern; branch preview against normal dev; `user` account)

0. Preconditions the agent prepares on dev (one approved file, or through the app): the contract fixture is gone; a
   parent-shaped campaign **HT-P** (bargaining, no parent, one assessment "Sector petition") and a child-shaped
   campaign **HT-C** writable by the `user` account, with ≥ 2 members of which ≥ 1 is also a member of HT-P. Both may
   be created through the existing manual create path (not a new path).
1. Open HT-C → header pencil → Basics sheet → **Part of** lists HT-P (and no SMS episode, no standing campaign, not
   HT-C) → choose it → Save. Expect: the header shows "Part of HT-P" as a link; Setup shows the family card.
2. Open HT-P → Assessments tab → "Sector petition" shows the **Share with family campaigns** toggle → turn it on.
   Expect: badge "Shared with 1 campaign".
3. Back in HT-C → Assessments tab: the section **Shared from HT-P** lists "Sector petition" with the Shared badge and
   no Remove button; the wall chart's Colour by lists it under "Shared from HT-P"; the participation source lists it.
4. From HT-C's wall chart open a member's sheet → Record rating → pick "Sector petition" → rate 1 → Save. Expect: tile
   colour updates in HT-C; in HT-P's Assessments tab the rating appears against the same worker (acceptance item 5).
5. Rate a worker who is a member of HT-C only. Expect: visible in HT-C; in HT-P that worker is **not** listed (not a
   member), but the rating row exists on the parent's activity (the parent's Assessments table shows members only —
   confirm through the worker's profile timeline or HT-P's sheet after adding them; optional).
6. In HT-C, clear the rating from the sheet (Remove) — under RD-a it succeeds; under RD-b the control is absent.
7. In HT-P turn the toggle off → confirm the warning → HT-C's Assessments tab no longer shows the section; HT-C's
   Colour by falls back to Cumulative; HT-P still shows the ratings.
8. In HT-C's Basics sheet set Part of → None → Save. Expect: the header link is gone. Then the one-level rule: create a
   third campaign HT-G; in HT-P's Basics sheet set Part of → HT-G → Save (HT-P now has a parent); back in HT-C set Part
   of → HT-P → Save. Expect: the sheet reports "The chosen parent is itself part of a campaign" and nothing is saved.
   Clear HT-P's parent afterwards.
9. Screenshots of steps 1, 3, 4, 7 into `docs/organiser-ux-review/wp/evidence/wp3.8/`.

---

## 6. Stages

| Stage | Ends in this verifiable state | Needs the operator |
|---|---|---|
| **1** ✅ `f3888ef` + fix round 1 | Migration, `90`, `10`, `91`, `00`, `01`, README written; `families.ts` + `campaign-parent.ts` + unit tests green; contract suite written (compiles under `tsc`); `pnpm validate:migrations` green; lint/test/build green. Fresh Fable **static** review of the SQL (the WP2.2 Stage 1 practice). | FQ-a … FQ-g and TRG-a answered in §9.1 (they shape Stage 1's files). |
| **2** ✅ database steps 2026-09-21 (contract run pending CA credentials) | Migration on normal dev with its ledger row; `01` identical before/after; `pg_get_viewdef` pasted; contract run 1 pasted (0 skipped). Realistic-data rehearsal (§0 step 4) pasted with the four checksum points and the measurement. | Approval of the exact dev file and of the realistic-set run sheet. |
| **3** ✅ `5fde140` + fix round 1 `1cbb64c` (review APPROVE WITH ADVISORIES) | Reader switch rows 1–10 (+ 11–25 under FQ-a), UI of §3.7/§3.8, telemetry; jsdom tests green; contract run 2 pasted; preview deployed. Fresh Fable review (database-touching package). | — |
| **4** (short path, operator 2026-09-21: hand test on production after the data run sheet instead of the preview; contract run when the CA credentials exist) | Operator hand test (§5.4) passed with screenshots; measurement re-run; whole-PR review; ledger row; PR marked ready. Production run sheet prepared (§0 step 6). | Hand test; then the production sequence (operator only): migration → merge → `10`. |

Commits: one per stage (CLAUDE.md: one commit per completed unit of work; the orchestrator commits the plan).

---

## 7. Risks and stop conditions

**Risks**

- **R1 — types regeneration on merge.** `gen-types.yml` regenerates `generated.ts` from production on the merge; if
  the operator merges before applying the migration the new columns are stripped — harmless at runtime (nothing reads
  them from the generated types, §3.9) but the promotion gate forbids that order anyway. Mitigation: §0 step 6 order;
  the PR description repeats it.
- **R2 — a reader that could not be classified.** None: every site in §2 has a verdict. The residual risk is a reader
  added to `main` after `e2cf34a2` (the Cursor session precedent, `PROGRESS.md:132`); the implementer re-runs the two
  greps at Stage 3 and records any new site in §8.3 with a verdict.
- **R3 — view dependents.** `campaign_worker_rating_summary` has seven dependents (§2 C1-dep); `CREATE OR REPLACE
  VIEW` needs the same column list, which the migration asserts before and after; no drop/recreate chain. If the
  live column list ever differs from the six names in §0.2 the precondition stops the migration (stop S3).
- **R4 — performance of the `IN (SELECT campaign_family_activity_ids(m.campaign_id))` join.** Measured read-only on
  the realistic data set on 2026-09-17 with the helper's body inlined as a correlated subquery (the closest read-only
  proxy; the real function is not inlinable because of `SET search_path`): campaign 61 (48 members) 6.1 ms vs 2.2 ms
  today; campaign 64 (276 members) 4.1 ms for the aggregate join, 175 subplan evaluations, all buffers cached. The
  helper's owned branch uses `idx_campaign_activities_campaign` `:20589`; the family branch the new partial index.
  Stage 2 pastes `EXPLAIN (ANALYZE, BUFFERS)` of `SELECT * FROM campaign_worker_rating_summary WHERE campaign_id IN
  (64, 57)` on the realistic set after the forward apply; **budget: ≤ 10× today's execution time and < 100 ms** for the
  161-unit campaign 57. Fallback if exceeded: an inlinable twin without the `SET` clause (schema-qualified body) used
  by the view only, recorded as a deviation.
- **R5 — RLS.** The delete gap is FQ-b; RD-a adds one policy that `90` drops. No other policy changes.
- **R6 — query-key collisions.** A6 shares `["campaign-activities", campaignId]` with A8 (different select shapes
  already); A6 moves to its own key (§3.5 row 6). `["campaign-assessments-rated", campaignId]` is read by two hooks
  with different queryFns today (A1 and 1b); 1b switches to the shared hook.
- **R7 — dev has no realistic family.** The contract fixture builds one; the hand test builds HT-P/HT-C; nothing on
  dev is left behind (fixture cleanup asserted).
- **R8 — `ON DELETE SET NULL` semantics.** Deleting a parent removes its activities and every rating on them,
  including those recorded from children (they are the parent's rows). `delete_campaign` has no confirmation of this
  today; the UI's delete dialog copy is out of scope, recorded for the ledger's incidental findings.
- **R9 — a family activity of a non-assessment kind.** The CHECK allows `family` on any `activity_kind`; only the UI
  restricts the toggle to assessments. A SQL-set `family` on a `woc_meeting` row would appear in a child's participation
  selector (A2 lists all kinds). Accepted; the run sheet flags assessments only.
- **R10 — concurrent family writes (Stage 1 fix round 1, advisory A1).** The trigger's structural checks read other
  rows under READ COMMITTED; without a lock, `UPDATE A SET parent = B` concurrent with `UPDATE B SET parent = C` (or
  `INSERT C2 (parent = C)` concurrent with `UPDATE C SET parent = P`) could both commit and leave a two-level chain —
  the FK's `FOR KEY SHARE` does not serialise a non-key column update. **Closed by the lock:** the trigger takes
  `pg_advisory_xact_lock(hashtext('wp38_campaign_family'), id)` on the campaign and, when a parent is set, on the
  parent, in ascending id order, before its first check (§8.3 D16). A row lock on the parent was rejected because
  under RLS `wp16_campaigns_update`'s USING clause applies to `FOR UPDATE`/`FOR NO KEY UPDATE`, so a child-only
  writer would see no parent row and skip the parent checks. A contract test cannot prove this; the residual is closed
  by the lock, not by a test.
- **R11 — `anon` on `vw_sms_chat_session_report` (recorded behaviour, advisory A2).** A function referenced by a view
  executes as the calling role, not as the view's owner. `anon` holds the baseline's blanket `GRANT ALL` on the view
  (`:32995`) but no EXECUTE on `campaign_family_activity_ids()`, so an anon read of the view now fails with
  "permission denied for function"; no reader uses anon (`api/campaigns/[id]/sms-reporting`, `api/reports/sms` read
  through the session server client). For `authenticated` / `service_role` the helper's table reads hit the
  `USING (true)` select policies, so the report's numbers are identical. Accepted; `90` restores the baseline view.

**Stop conditions** (implementer stops and reports; no workaround)

1. `supabase/.temp/project-ref` would be relied on, or any command would touch `gteygwfgjvczanmrwgbr`.
2. FQ-b unanswered when Stage 1 reaches the migration's policy section.
3. The migration's precondition fails on dev or the realistic set (live view not the baseline's; column list differs).
4. Any `01` checksum differs where this plan says "identical".
5. R4's budget is exceeded on the realistic set.
6. A §3.15 "not touched" file must be edited to make a test green, or a §3.15 shared file moved under the branch
   (WP2.5/2.6/2.7 merge) in the same lines.
7. An existing test would need to be skipped, deleted or weakened.
8. Lint total would exceed 298 or `tsc` fails in an untouched file.
9. The contract fixture cannot be created through the REST insert (a product creation path would be needed).
10. The production run sheet's step (f) does not show exactly 3 children and 5 family rows.

---

## 8. Deviations from plan

### 8.3 (implementer keeps; `wp/wp2.2.md` §8.3 format: `D<n>`, deviation, reason, plan section changed)

| # | Deviation | Reason | Plan section |
|---|---|---|---|
| D1 | `lib/campaign/campaign-parent.ts` imports the value `createClient` from `@/lib/supabase/client` (not only "the Supabase client types") for `useCampaignParent`, and carries no `"use client"` directive. | The app has no Supabase context hook — every hook calls `createClient()` (`useCampaignWriteAccess.ts`); the directive would turn the module into a client boundary and break `loadCampaignParent` for the server routes that import it in Stage 3. `client.ts` has no module-level side effects (every `window`/lock access is inside a function), so a route may import the module. | §3.5 |
| D2 | `loadCampaignParent(client, …)` accepts `CampaignParentClient = { from(table: string): unknown }` and narrows to the exported `CampaignParentQueryChain` inside, instead of a structural `from…select…eq…maybeSingle` shape. | Matching the PostgREST generic builder chain structurally makes `tsc` recurse (TS2589) for both `SupabaseClient` and `SupabaseClient<any>`; with the `unknown` return both app clients are accepted without a cast (type-level check in `campaign-parent.test.ts`), the way `StructureRpcClient` keeps to `rpc`. Additive exports beyond §3.5's list: `FAMILY_SCOPE`, `FAMILY_ERROR_MESSAGES`, `CAMPAIGN_PARENT_SELECT`, `CAMPAIGN_PARENT_QUERY_KEY`, `NO_PARENT`, `parseCampaignParent`, `CampaignParent`, `CampaignParentQueryResult`. | §3.5 |
| D3 | `familyActivityFilter(cid, cid)` (a parent equal to the campaign) returns the plain owned clause, `isFamilyActivity` is false for it, and a blank string parent counts as no parent. | The trigger never allows a self-parent; the plain clause is the safe answer and keeps the interpolated string minimal. §4.1 already requires "never when `campaignId === parentId`" for `isFamilyActivity`. | §3.5 |
| D4 | Migration preconditions also assert: `vw_sms_chat_session_report` exists and carries the baseline predicate `a.campaign_id = o.campaign_id`; the policy `wp38_car_delete_family`, the two indexes and `campaigns_enforce_one_level()` are absent; `can_write_to_campaign(integer)` and `get_user_role()` exist. Post-assertions also pin the FK name `campaigns_parent_campaign_id_fkey` with `ON DELETE SET NULL`, the presence of the RD-a policy and of the unchanged owner delete policy, `STABLE` on the helper, and both views' rewritten text; the helper probe uses the campaign with the most activities (skipped on an empty database). | The second view is overwritten too, so it gets the same "is it the baseline's" stop; the FK name is what the loader embeds through (§3.5 says the post-assertion pins it). | §3.1 items 1, 9 |
| D5 | The `campaign_family_self` raise carries a DETAIL; `COMMENT ON FUNCTION` on the trigger function; `COMMENT ON VIEW` on `campaign_worker_rating_summary` (the baseline had none — `90` sets it back to `NULL`) and one WP3.8 sentence added to the baseline comment of `vw_sms_chat_session_report` (`90` restores the baseline comment verbatim). **Fix round 1 (A2):** the migration's section-8 comment no longer claims the helper "runs as the view's owner" — a function referenced by a view executes as the calling role; consequence recorded: `anon` (blanket `GRANT ALL` on the view, baseline `:32995`, no EXECUTE on the helper) now gets "permission denied for function" on that view; no reader uses anon; `authenticated`/`service_role` results unchanged (§7 R11). | Documentation only; the reviewer reading `pg_get_viewdef`/`\d+` sees why the view differs from the baseline. | §3.1 items 5, 7, 8; §7 R11 |
| D6 | The migration ends with a labelled SELECT (WP2.2b style) — the §0.2 columns minus `ledger_row` plus `policy_present`. | A migration cannot see its own ledger row; the operator still appends §0.2 as written after the ledger insert. | §0.2 |
| D7 | `90` drops the policy first (it references both new columns), captures and re-asserts the summary view's whole-view checksum (equal, since no family rows exist by precondition) and the survival of the owner delete policy. | Stronger than "counts unchanged": proves the restored view is the baseline's output byte for byte. | §3.1 Rollback |
| D8 | `91` writes its own log rows (script `91_rollback_campaign64_family`) **and** stamps `rolled_back_at` on the `10_campaign64_family` rows. | The WP0.4 rollback convention (`01_rollback.sql`), so a forward → rollback → forward cycle stays auditable. | §3.2 |
| D9 | `10` also captures the ratings checksum over 61/62/64/69 and asserts it unchanged; the campaign log rows carry `updated_at` before/after; the file is not idempotent (a second run stops at the preconditions, as intended); 64's precondition also requires `archived_at IS NULL` (the trigger refuses an archived parent, so the STOP is readable rather than a trigger error). **Fix round 1 (A3):** every precondition and post-assertion in `10` and `91` is scoped to this run's rows — "no child of 64 yet / no family row on 64 yet" before, "exactly 3 children of 64 (61, 62, 69) and exactly 5 family rows on 64 (88–92)" after, `91` the mirror — instead of global "zero parents / zero family rows anywhere" and "exactly 3 / 5 globally"; the "no other row changed" check is a checksum of the four campaign rows minus `parent_campaign_id`/`updated_at`, of 64's activities minus `scope`, and of the four campaigns' ratings, replacing the four global table counts (memberships and ratings elsewhere may legitimately move on a live database). The unused `parent_campaign_id` column captured in `_wp38_10_children` is dropped. The 61/62/69 "no parent, no children" preconditions are kept. | Production step (e) runs after the deploy is live; an organiser setting "Part of" in the new Basics sheet between the merge and (e) must not stop `10` (advisory A3). The README tells the operator to run `10` straight after the deploy all the same. | §3.2, §0.1 step 6 |
| D10 | Contract suite: `OUX_CONTRACT_FOREIGN_CAMPAIGN_ID` is accepted but not required (the SET-a target P2 is a fresh admin-created campaign the foreign user cannot write to); the three accounts must be distinct and their roles are asserted; the fixture sanity test asserts the foreign user's writable set is exactly {C}; the RAT-a test also records w3's rating (admin) as the setup for RD-a and VIEW-a, VIEW-a runs **before** the RD-a delete (file order), and the RD-a test additionally proves the owner path unchanged on O; the standing row is flipped back inside its test as well as in `afterAll`, and `afterAll` also flips `is_sms_episode` back to false on every fixture row before `delete_campaign` (an episode with no live action deletes anyway; nothing fixture-shaped survives); the suite refuses to start when `parent_campaign_id` is unreadable (migration absent) rather than failing fourteen times. | Test-order dependencies made explicit; nothing skipped. | §4.2, §5.2 |
| D11 | Contract suite has a fifteenth case: `familyActivityFilter(C, P)` through PostgREST `.or()` returns exactly `campaign_family_activity_ids(C)`. | Proves the pure module's clause against the real database once, so the Stage 3 reader switch rests on a tested string. | §4.2 |
| D12 | Later-migration check (recorded in the migration header): no migration after the baseline redefines `campaign_worker_rating_summary`, `vw_sms_chat_session_report`, any `campaign_activity_ratings` policy or any `campaigns` trigger; WP1.6 rewrote the `campaigns` policies only. | Nothing to change; recorded so the reviewer need not repeat the grep. | §3.1 |
| D13 | `00_family_measurement.sql` adds a `compared` CTE so the `changed` predicate is written once (the plan's `(…changed…)` elision); the optional second statement through the live view is not added. | The file must not reference the helper (it runs before the migration exists). | §5.3 |
| D14 | `oux-wp3.8/README.md` gains, beyond the table rows, a row for the migration itself, the guard paragraph and the three run-order sections. | The WP2.2 README shape the operator already follows. | §0 |
| D15 | `useCampaignParent` keys `["campaign-parent", 0]` and is disabled for an unusable id instead of `Number(campaignId)` (`NaN`). | A `NaN` key never matches an invalidation; callers can still spread the key. | §3.5 |
| D16 | **Fix round 1 (A1).** `campaigns_enforce_one_level()` begins with `PERFORM pg_advisory_xact_lock(hashtext('wp38_campaign_family'), id)` on `NEW.campaign_id` and, when `NEW.parent_campaign_id` is set (and differs), on the parent — `least()` first, then `greatest()` — before its first structural check. The lock is taken on clearing too (only the campaign's own id then): cheap, and every write of the family columns serialises on the ids it touches. | The §3.1 text's three EXISTS/SELECT checks read other rows under READ COMMITTED with no lock; two concurrent transactions could each pass and both commit a two-level chain, and the FK's `FOR KEY SHARE` does not serialise a non-key column update. Ascending id order rules out deadlock between two writers. `SELECT … FOR UPDATE` / `FOR NO KEY UPDATE` on the parent row was rejected: under RLS the `wp16_campaigns_update` USING clause applies to a locking clause, so a child-only writer would get no row and skip the parent checks. A contract test cannot prove concurrency; the residual is recorded as closed by the lock (§7 R10). | §3.1 item 5; §7 R10 |
| D17 | **Stage 3 reader re-check (§7 R2).** The two greps (`.from("campaign_activities")`, `.from('campaign_activities')`) plus the `campaign_activity_ratings` and embed greps re-run on the Stage 3 tree (branch base `3040e95`, one commit past `e2cf34a2`: the drag auto-scroll fix, no reader touched) match §2's inventory site for site; no new site, no verdict changed. | Recorded so the reviewer need not repeat it. | §2, §7 R2 |
| D18 | `groupAssessmentOptions(options, campaignId, parentId)` lives in a new pure module `wall-chart/assessment-option-groups.ts` and is re-exported from `assessment-selector.tsx` (plus `WALL_CHART_ASSESSMENT_OPTIONS_KEY`). With no parent it returns exactly today's two owned groups in today's order and an empty family group; with a parent the family group is the `isFamilyActivity` rows (rated and unrated together, input order) and every other row stays owned — never hidden — because exclusion is the database filter's job (proven by the §4.1 pure tests and the D11 contract case). | The §4.1 grouping test must run in the node environment; `assessment-selector.tsx` is `"use client"` and imports the browser client. | §3.7, §4.1 |
| D19 | The fallback-to-Cumulative effects in `AssessmentSelector` and `UnitAssessmentViewControl` test `isPending` instead of `isLoading`. | The options query is disabled until the parent query succeeds (`enabled: parent.isSuccess`); a disabled query reports `isLoading === false` with no data, so the `isLoading` guard would reset a stored assessment selection to Cumulative during the parent's first load. `isPending` is true until data exists under the new key. | §3.5 row 1 |
| D20 | **Characterisation snapshots (S6, resolved).** `characterize.ts` snapshots the whole cache key set, so the plan's key design (rows 1–5, 7; §7 R6) changes both characterisation snapshots: `["campaign-assessments-rated","1"]`, `["campaign-activities","1","assessment"]`, `["wallchart-activities-list","1"]`, `["wallchart-latest-activity","1"]`, `["worker-import-assessments",1]` gain the `0` suffix and `["campaign-parent",1]` / `["campaign-parent",0]` (D28) appear. The legacy snapshot (`wall-chart/__tests__/__snapshots__/`) was regenerated — `git diff -U0` shows key lines only, no DOM line. The v2 snapshot (`wall-chart/v2/__tests__/__snapshots__/wall-chart-v2.characterization.test.tsx.snap`) sits under the §3.15 "not touched" `wall-chart/v2/**`; the implementer stopped (S6) and the orchestrator resolved it on 2026-09-21: WP2.4c, the owner of `wall-chart/v2/**`, merged on 2026-09-17 and WP2.5/2.6 do not own that file, so §3.15 is amended for this one file. **Regenerated under orchestrator amendment to §3.15; key lines only, 80 lines** (`vitest run -u` on that one file; `git diff -U0`: 80 changed lines, all 80 react-query key lines — 8× each of the ten lines above — and 0 DOM lines). The alternative (parent loaded inside each queryFn with unchanged keys, one extra PK round trip per reader fetch) was not taken. | The plan's §4.3 last paragraph assumed the suites pin DOM only. | §3.5, §3.15, §4.3, §7 S6 |
| D21 | Fixture (additive): the base `campaign_activities` rows carry `campaign_id: 1, scope: "campaign"` and the `campaigns` row carries `campaign_id: 1, parent_campaign_id: null, parent: null` in every fixture (not only under the knob); the `family` knob is `{ parentId, parentName, activities?, children?, ownedScope? }` with `SHARED_FAMILY_ACTIVITY` (901, "Sector petition") as the default shared row; `children` rows are appended to `campaigns` after campaign 1's own row (`.maybeSingle()` reads `rows[0]`). None of the new fields is rendered: the regenerated legacy snapshot differs in key lines only. | `partitionFamilyActivities` drops rows without an owner, so a no-parent mount on rows lacking `campaign_id` would show "No assessments yet" instead of today's DOM. | §4.3 |
| D22 | The children query (`["campaign-children", cid]`, tab / card / Basics sheet) and the Basics sheet's candidate query repeat their server predicates client-side (`parent_campaign_id === cid`; not self, no parent, not episode, not standing); the Basics sheet keeps the current parent selectable even when `campaigns_i_can_write` does not list it (an admin-set parent), so Save does not silently drop it; the write-access RPC is asked once for the candidate ids only. | The harness fake ignores filters; the product must agree with PostgREST either way. | §3.7 "Basics sheet", §4.3 |
| D23 | The family card's Edit link is `?edit=basics`; the header bar derives the Basics sheet's open state from that parameter (`open = state || (edit === "basics" && canWrite)`) and drops it from the URL on close. `CampaignFamilyCard` takes `canWrite` as well as `campaignId` (the one mount line passes both). | The Basics sheet has no route — it is header state (`basicsSheetOpen`). A `useEffect` that set the state was rejected by `react-hooks/set-state-in-effect` (lint total 299 > 298). | §3.7 "Parent's Setup", "Header" |
| D24 | The Assessments tab's own `CreateAssessmentDialog` gains `onCreated` invalidating `["campaign-activities-family", cid]` (the dialog itself invalidates only `["campaign-activities", cid]`, the key A8 keeps); the header bar's `onCreated` adds `["campaign-activities-family", campaignId]` and `["campaign-assessments-rated", campaignId]` with the **string** id. Its existing `["campaign-assessments-rated", numericCampaignId]` line uses a number and never matched the string-keyed hook — pre-existing, left as is. | Without the tab's invalidation a newly created assessment would not appear in the tab until remount. | §3.5 row 6 |
| D25 | `inline-rating-popover.tsx`: beyond the telemetry line, `CumulativeRatingPopover` (the tile's rating picker) groups through `groupAssessmentOptions` and renders the third group. `InlineRatingPopover` (handed an `activityId` by callers in files not touched) emits no `family_assessment_rated`; a family rating from a tile in assessment view is therefore not counted by that event — recorded gap, closable by an optional prop when those callers are next opened. | Without the group a shared option would sit unlabelled in "Assessments"/"Not yet rated". | §3.7 |
| D26 | A41 `fetchUserAssessments(supabase, campaignId)` calls `loadCampaignParent` inside the function (the browser client satisfies `CampaignParentClient`), so its two callers (`BackgroundInfoStep.tsx`, `phone/assessment-setup/page.tsx`, not on the switch list) stay untouched; cost: one PK round trip per fetch. | The plain function has no hook to gate on. | §3.5 rows 11–25 |
| D27 | Row 9 and A26 normalise the `campaign_family_activity_ids` RPC result whether PostgREST returns scalars or one-key objects, and skip the ratings query when the helper returns no ids; A26's embed becomes `campaign_activities(title, campaign_id)` (no `!inner`, no embed filter). Row 9 additionally reads `campaign_worker_membership` once and applies `.in("worker_id", memberIds)` (VIEW-a) and returns early when the campaign has no members. | `SETOF integer` serialises as scalars; the defensive branch costs nothing. | §3.5 row 9, §2 A26 |
| D28 | `useCampaignParent` is passed `null` while the owning surface is closed (`worker-import-wizard`, `SmsNewChatDialog`, `SmsP2pPanel`, `SmsSurveysPanel`, `CallCtaAmbitionsEditor` for a non-positive id), so no parent read happens for a closed dialog; the disabled entry is keyed `["campaign-parent", 0]` (D15's shape) and appears in the characterisation key set. | A dialog mounted closed on every campaign page must not add a round trip. | §3.5 |
| D29 | The scope toggle (`assessments/assessment-scope-toggle.tsx`) invalidates, by prefix, `["campaign-activities-family", cid]`, `["campaign-activities", cid]`, `["campaign-assessments-rated", cid]`, `["wallchart-activities-list", cid]`, `["wallchart-latest-activity", cid]` (exported as `invalidateAssessmentScopeReaders`); the toggle is offered on `activity_kind === "assessment"` rows only, for writers, when the campaign has no parent and (≥ 1 child or the row is already `family`); the parent's badge uses `sharedWithLabel(children.length)`. The worker sheet's history key gains `parentId ?? 0` and is gated (its client filter depends on the parent); `useSaveActivityRating`'s prefix invalidation still matches. | "The family keys" spelled out. | §3.7, §3.5 row 5b |
| D30 | **A5 evidence (§9.3).** After `pnpm build` (exit 0), plain `node -e "require(...)"` on the built chunk of every switched route — `campaigns/[id]/{assessments, role-check, an-actions, participation-import/apply, sms-surveys, sms-surveys/[surveyId], sms-lists/[listId]/p2p}` and `sms/conversations/[id]/{assessments, draft-reply, (route)}` — loads and exposes its handlers (`GET`/`POST`/`PATCH`/`DELETE`), and `require` of the built `campaign-parent` chunk alone loads with `typeof window === "undefined"`; the node-environment unit file `campaign-parent.test.ts` (11 cases) imports `loadCampaignParent` as before. No route module breaks at import time. | Carried from the Stage 1 review. | §9.3 A5 |
| D31 | Telemetry: the three builders come with `trackCampaignParentSet` / `trackAssessmentScopeChanged` / `trackFamilyAssessmentRated` wrappers (the `events.ts` idiom) and an `AssessmentScopeProp` closed union; `campaign_parent_set` is emitted only when the parent actually changed; `family_assessment_rated` is emitted from the sheet, the tab's single and bulk saves, and the tile picker (D25). | Additive. | §3.7 last bullet |
| D32 | **Fix round 1 (F1, blocking).** The Basics sheet puts `parent_campaign_id` in the update payload only when it differs from `campaign.parent_campaign_id ?? null`; `onSuccess` already branched on the same comparison. jsdom case added: an unchanged-parent save records a payload without the column. | `campaigns_enforce_one_level` is `BEFORE UPDATE OF parent_campaign_id` and fires whenever the column is in the SET list, so every child save re-ran the structural checks (a child whose parent had since been archived could not save a rename until it cleared Part of) and took two advisory locks. | §3.7 "Basics sheet" |
| D33 | **Fix round 1 (F3).** The tab test asserts the panel by its real heading, "Ambition links": present for the owned pill, absent after selecting the family pill, present again after re-selecting the owned pill (the `isOwnedActivity` guard is now exercised). The earlier assertion used "Linked ambitions", a string the panel never renders. | Test only. | §4.3 |
| D34 | **Fix round 1 (F4).** Basics sheet cases added: (a) mounted with `parent_campaign_id: 9`, choosing None saves `parent_campaign_id: null`; (b) 9 absent from the `campaigns_i_can_write` answer → "ROV sector wide" stays selectable as the current value (D22); (c) the `campaigns` update answered with `{ code: "23514", message: "campaign_family_parent_has_parent" }` renders "Failed to save: The chosen parent is itself part of a campaign (one level)." and `onSaved` is not called. Harness (additive): `answerWrite(table, op, error)` in `backend.ts` queues a PostgREST-shaped error for the next write on `table:op` (the write is still recorded; `then`/`single`/`maybeSingle` return it); `resetBackend` clears the queue. | Test and harness only; the knob is additive (§3.15 harness rule). | §4.3 |
| D35 | **Fix round 1 (F5).** When `useCampaignParent` errors, the three primary surfaces say so instead of their empty state: the Assessments tab and the sheet's Ratings tab render `Couldn't load this campaign's family: <message>` (`role="alert"`) in place of "No assessments yet." / the Record-rating empty copy / "No activity ratings recorded…"; the campaign-level `AssessmentSelector` renders the same line as the listbox's group label with Cumulative still selectable. The per-unit View control, the participation selector, the clear-ratings dialog and the FQ-a surfaces keep the silent-disable behaviour (small controls; the tab and the sheet carry the message for the page). | The gated readers are merely disabled on a parent error, which read as "nothing here". | §3.5, §3.7 |
| D36 | **Fix round 1 (F6).** `isPending` replaces `isLoading` for the first-render placeholder in the sheet's history list (`historyPending`), in `participation-import/step-assessment.tsx` (destructured as `isPending: isLoading`, one line) and in `useAssessmentDistributions` (`loadingOptions`). Left as `isLoading`: the selector triggers' `disabled` / "Loading…" placeholder (cosmetic; the fallback effects already use `isPending`, D19) and `inline-rating-popover.tsx`'s `disabled={isLoading || options.length === 0}` (the popover opens on a click after the chart has loaded, so the parent is cached). | A disabled query reports `isLoading === false` with no data, so the gated readers showed their empty copy for one round trip. | §3.5 |
| D37 | **Fix round 1 (F7).** The Basics sheet's candidate query adds `.is("archived_at", null)` (select gains `archived_at`) and the client-side predicate `archived_at == null`; jsdom case: an archived campaign in the fake's `campaigns` rows is neither asked about in `campaigns_i_can_write` nor offered. | The trigger refuses an archived parent; the list should not offer one. | §3.7 "Basics sheet" |
| D38 | **Fix round 1 (F8, recorded).** The `InlineRatingPopover` telemetry gap (D25) stays a follow-up: its callers live in files WP3.8 does not touch. | No code. | §3.7 |

---

## 9. Approval, verification output, review

### 9.1 Questions for the operator (answer by label; "as recommended" is a complete answer)

**Answered 2026-09-17 by the operator: "agree with all recommendations, proceed".** In force: **FQ-a-a** (include the 15 FQ-a readers), **RD-a** (member-scoped delete policy), **FQ-c allow**, **FQ-d/e/f leave**, **FQ-g-a** (simulation + schema rehearsal; no data run sheet rehearsal), **TRG-a**, **CA supply at Stage 2**, **HT delete afterwards**. Plan status: **approved; implementing Stage 1.** **2026-09-21, operator:** "go ahead with the plan … full permission to do all necessary steps up to the point of pushing everything to main" — this is the per-file approval for the dev apply (§0.1 step 2), the realistic-data rehearsal run sheet (§0.1 step 4) and the Stage 3/4 work; production (§0.1 step 6) and the merge stay the operator's.

| # | Question | Recommendation |
|---|---|---|
| **FQ-a** | The specification's reader inventory (17 files) missed 15 further "this campaign's assessments" sites in the SMS inbox, P2P boards, surveys, the phone list builder, CTA setup and the phone rating targets (§2 A18–A41, marked FQ-a). Switch them in WP3.8, or defer them to a follow-up WP3.8b (until then a child cannot rate a shared assessment from SMS or phone, only from the chart, the sheet, the Assessments tab and imports)? | **Include (FQ-a-a):** each is the same one-line switch through `families.ts`; the sector-petition use case is rated from SMS boards today (`SmsPinnedAssessment`); leaving them makes the rule "every per-campaign read" false on the surfaces organisers use most. Alternative FQ-a-b: defer, recorded in the ledger. |
| **FQ-b** | Ratings delete gap (§3.4): a child organiser can rate a shared assessment but never remove the rating. RD-a: one additive delete policy scoped to the child's members; RD-b: hide Remove/Clear on shared activities. | **RD-a** — the same member boundary as VIEW-a, tested by contract; RD-b leaves a silent 0-row "Rating removed". |
| **FQ-c** | A child's participation import into a shared assessment stamps the AN link on the parent's activity (§3.6). Allow, or skip the stamp for a family target? | **Allow** — one AN action per shared assessment, wherever imported. |
| **FQ-d** | `vw_sms_assessment_report` stays owner-attributed (a child's SMS ratings on shared assessments count in the parent's SMS report, not the child's). | **Leave** as owner-attributed; record in the ledger. |
| **FQ-e** | `campaign_last_activity()` (My-campaigns cards) stays owner-scoped. | **Leave**; the parent's card reflects a child's rating on a shared assessment. |
| **FQ-f** | Task lists keep targeting owned activities only (§2 A8). | **Leave**; follow-up if a sector task list is wanted. |
| **FQ-g** | Rehearse the campaign-64 data run sheet on the realistic data set with a (61, 62)-only variant, or rely on the read-only simulation (§5.3) and the schema rehearsal? | **Simulation + schema rehearsal (FQ-g-a)**; the production file's preconditions are its own guard, and 69 is absent from the snapshot. |
| **TRG-a** | Enforce SET-a ("writer of both") in the trigger (TRG-a) or in the UI only (TRG-b)? | **TRG-a**. |
| **CA** | The contract suite needs a dev **admin** account in the shell as `OUX_CONTRACT_ADMIN_EMAIL` / `OUX_CONTRACT_ADMIN_PASSWORD` (the e2e admin account will do), beside the two `user` accounts WP2.2's suite already uses. Supplied out of band; never written down. | **Supply** when Stage 2 runs. |
| **HT** | The hand test (§5.4) creates HT-P/HT-C on dev through the manual create path; confirm the `user` account may keep them or that the agent deletes them afterwards (one approved file). | **Delete afterwards** through `delete_campaign`, as the contract fixture does. |

Decisions 11 and 12 are not reopened. The specification's names are kept (`parent_campaign_id`, `scope`,
`campaign_family_activity_ids`, `families.ts`, `familyActivityFilter`, `familyLabel`, the three event names); the one
refinement (`isFamilyActivity` takes `parentId`) is recorded in §3.5.

### 9.2 Evidence (the verifier pastes raw output; one block per acceptance item)

**Item 1 — migration on dev; validate/lint/test/build; realistic-data rehearsal with checksums.**

*Stage 1 (no database), Sonnet verifier 2026-09-17 on the Stage 1 tree (committed as `f3888ef`):*

```
pnpm validate:migrations      → Validated 14 Supabase migrations with unique 14-digit versions.   exit 0
tsc --noEmit                  → (no output)                                                        exit 0
pnpm lint                     → ✖ 298 problems (146 errors, 152 warnings)   = main baseline 298    exit 1 (baseline)
eslint <five new TS files>    → (no output)                                                        exit 0
pnpm test                     → Test Files 1 failed | 120 passed (121); Tests 1 failed | 1746 passed (1747); 106.89s
                                 failed: wall-chart/__tests__/wall-chart.render-cost.test.tsx
                                 "renders 305 members across 161 units within budget" — expected 10254.9 to be less than 6000
                                 (pre-existing wall-clock budget; untouched file; same failure recorded for WP2.4c, PROGRESS.md row 2.4c)
vitest run families + campaign-parent → Test Files 2 passed (2); Tests 34 passed (34)               exit 0
vitest list -c vitest.contract.config.ts --filesOnly → campaign-families.contract.test.ts, structure-api.contract.test.ts
pnpm build                    → ƒ (Dynamic) server-rendered on demand                               exit 0
grep BEGIN;/COMMIT; in the migration → one comment line only (:14)
grep 'SET LOCAL oux.env' in 10/91/90 → comment lines only (the operator-adds-it note)
grep production ref in migration/scripts/lib → only the PRODUCTION_HOST refusal constants of the two contract suites
git diff --stat generated.ts, src/components, src/app, baseline → empty
```

*Fix round 1 (advisories A1–A4), implementer 2026-09-17:* `validate:migrations` 14 / exit 0; `tsc` exit 0; the two unit files 34 passed; eslint on the five TS files exit 0.

*Stage 2 baselines (read-only, orchestrator, 2026-09-17, before any mutation; `01` variant A plus whole-table counts):*

```
normal dev dpnnmkhabysfdogllsyh:   campaigns 61/62/64 absent (activities_n 0, summary_rows 0, md5s NULL);
                                   all_activities 5, all_ratings 54, all_campaigns 5,
                                   whole_summary_md5 e483c02f0a11d32d57190fd9e7e34955,
                                   ledger tail 20260914090000, 20260914090100 (WP2.2a/b present)
realistic yqjkuobcawvigsfpgrcm:    activities_md5 8a477f781ad6799b03f5ed2f650bdd27, ratings_md5 e4e8fa5cbc1cbf5f1cb6e460420bff87,
                                   summary_md5 9ccbaa63abe95f41265a84ddfb22d62c, activities_n 8, summary_rows 388,
                                   all_activities 43, all_ratings 494, all_campaigns 22,
                                   whole_summary_md5 d42abdb414100cfd5038dc311af8b823, _oux_env_marker rows 1
```

Because dev has no campaign 61/62/64, the dev before/after comparison uses `whole_summary_md5` and the three whole-table counts; the 61/62/64 checksums are the realistic set's evidence.

*Stage 2 (orchestrator through the connector under the operator's 2026-09-21 approval; one submission per step, output recorded before the next):*

```
NORMAL DEV dpnnmkhabysfdogllsyh
  migration (exact file at 7e6c3ce, one submission BEGIN … COMMIT) →
    parent_col 1, scope_col 1, helper_present true, trigger_present 1, policy_present 1,
    view_reloptions {security_invoker=true}, view_columns = the baseline six, children_now 0, family_now 0
  ledger row INSERT → 20260917100000 wp3_8_campaign_families
  01 variant B after → whole_summary_md5 e483c02f0a11d32d57190fd9e7e34955 (= before), all_activities 5, all_ratings 54,
    all_campaigns 5 (= before), children_n 0, family_n 0, ledger tail 20260914090000,20260914090100,20260917100000
  pg_get_viewdef(campaign_worker_rating_summary) → the two IN (SELECT campaign_family_activity_ids(m.campaign_id)) predicates present,
    r.campaign_id = m.campaign_id absent; vw_sms_chat_session_report → a.activity_id IN (SELECT campaign_family_activity_ids(o.campaign_id))

REALISTIC DATA SET yqjkuobcawvigsfpgrcm (no ledger catch-up; WP2.2a/b absent there, out of scope)
  01 A before          activities 8a477f781ad6799b03f5ed2f650bdd27  ratings e4e8fa5cbc1cbf5f1cb6e460420bff87  summary 9ccbaa63abe95f41265a84ddfb22d62c  whole d42abdb414100cfd5038dc311af8b823
  forward 1 + ledger   post-assertions passed; ledger_row 1
  01 B after-forward-1 activities d744d93fb8f2ed6df22235f38d30f544 (scope column added, expected)  ratings e4e8fa5c… (=)  summary 9ccbaa63… (=)  whole d42abdb4… (=)  children 0 family 0
  90 rollback          policy_before 1 → policy_after 0; parent/scope/helper/trigger remain: false; view_reloptions {security_invoker=true};
                       summary_checksum before = after = d42abdb414100cfd5038dc311af8b823; campaigns 22, activities 43, ratings 494, memberships 2726 unchanged
  ledger repair        DELETE … WHERE version = '20260917100000' → 1 row
  01 A after-rollback  activities 8a477f78… (= before)  ratings e4e8fa5c… (=)  summary 9ccbaa63… (=)  whole d42abdb4… (=)
  forward 2 + ledger   post-assertions passed; ledger_row 1
  01 B after-forward-2 activities d744d93f… (= after-forward-1)  ratings e4e8fa5c… (=)  summary 9ccbaa63… (=)  whole d42abdb4… (=)  children 0 family 0
                       ledger tail 20260913000000, 20260917100000
  00 measurement       61: 48 members, 2 changed, 2 shared with 64, 2 rated on 88 · 62: 64 / 13 / 13 / 13 · 64: 276 / 0 / 0 / 0  (= planning-time prediction)
  R4 EXPLAIN ANALYZE   SELECT * FROM campaign_worker_rating_summary WHERE campaign_id IN (64, 57): 581 rows, Execution Time 26.984 ms,
                       Planning 7.940 ms, shared hit 4634, 192 helper evaluations in the outer join, 20 in the last-rating subplan — under the
                       100 ms budget (no same-query pre-migration timing was taken, so the 10× clause is not measured; the absolute budget holds)
```

Stage 2 remaining: the contract suite (§4.2, §5.2) — needs the `OUX_CONTRACT_*` accounts, which this remote session does not hold (CA).

*Production run sheet (operator, `scripts/data-hygiene/oux-wp3.8/prod/`), outputs pasted by the operator:*

```
P1 checksums before (2026-09-21): activities_md5 af4609dd76581874d869cf6dbbcf33f6  ratings_md5 f7d15b0751ccddf50a327fe445beba0c
                                  summary_md5 157ba01837c2303b30b226938aa3bd8b  activities_n 9  summary_rows 472
                                  (production has moved on from the 12 September snapshot: 9 activities on 61/62/64, 472 summary rows)
P2 migration + ledger row:        parent_col 1, scope_col 1, helper_present true, trigger_present 1, policy_present 1,
                                  view_reloptions [security_invoker=true], view_columns = the baseline six, children_now 0, family_now 0, ledger_row 1
                                  (= expected row; the migration's post-assertions passed, incl. the byte-identical summary-view checksum)
```

**Item 2 — contract tests on dev (run 1 and run 2).**
_(passed / failed / skipped; the VIEW-a and one-level cases named)_

**Item 3 — jsdom, and the Stage 3 verifier run** (Sonnet verifier 2026-09-21 on `5fde140`; fix round 1 `1cbb64c` figures from the implementer's run):

```
git status --short              → (empty)                                      tsc --noEmit → (no output) exit 0
pnpm lint                       → ✖ 298 problems (146 errors, 152 warnings)   = baseline 298
eslint <45 changed TS files>    → 15 problems, every one on a pre-existing line outside the commit's hunks
                                  (campaign-assessments.tsx 28/548/556/561, worker-detail-sheet.tsx 265/1229,
                                   worker-import-wizard.tsx 11/504/1578/2209, CallCtaAmbitionsEditor.tsx 8, sms-surveys/[surveyId]/route.ts 582)
pnpm test (5fde140)             → Test Files 1 failed | 125 passed (126); Tests 1 failed | 1767 passed (1768)
pnpm test (1cbb64c, fix round)  → Test Files 1 failed | 125 passed (126); Tests 1 failed | 1771 passed (1772)
                                  failed (both): wall-chart.render-cost "renders 305 members across 161 units within budget" — wall-clock budget, sandbox speed, untouched file
family/telemetry files          → 8 files, 69 passed (5fde140); 73 passed (1cbb64c)
pnpm build                      → ƒ (Dynamic) server-rendered on demand       exit 0
snapshot diffs                  → legacy and v2 characterisation .snap: 0 non-key changed lines each (react-query key lines only)
familyActivityFilter call sites → 21; remaining .eq("campaign_id") in the six chart/tab files are task lists, membership,
                                  the summary view, the owner-only delete and the import wizard's units (intended)
boundary grep                   → only the v2 characterisation .snap (D20); no production ref outside PRODUCTION_HOST constants
```

**Item 4 — read-only measurement on the realistic data set.**
_(§5.3 output; planning-time result recorded above: 61 → 2 rows, 62 → 13 rows, 64 → 0)_

**Item 5 — operator hand test.**
_(§5.4 steps with pass/fail and screenshot paths)_

### 9.3 Reviewer findings and resolution

**Stage 1 static review (fresh Fable, 2026-09-17, on `f3888ef`): APPROVE WITH ADVISORIES — no blocking finding.** The reviewer diffed both view texts against the baseline (three hunks / one hunk, column list and `security_invoker` kept; `90` restores byte-identically), confirmed the migration applies cleanly on baseline + later migrations and refuses a second apply, walked every trigger arm, the helper's grants, RD-a's boundary, `90`'s order and STOP, `10`/`91`, `01`/`00`, `families.ts` and the fifteen contract cases against §4.2.

| # | Finding | Resolution |
|---|---|---|
| A1 (advisory, strong) | One-level trigger: the structural checks read other rows under READ COMMITTED with no lock; two concurrent writers could commit a two-level chain (the FK's `FOR KEY SHARE` does not serialise a non-key update). | **Fixed in fix round 1:** `pg_advisory_xact_lock(hashtext('wp38_campaign_family'), id)` on the campaign and the parent in ascending order before the first check; row locks on the parent rejected (RLS USING applies to locking clauses). §7 R10, §8.3 D16. |
| A2 (advisory) | Migration comment wrongly said the helper runs as the view's owner; `anon` (blanket GRANT on `vw_sms_chat_session_report`) now gets "permission denied for function" on that view; no reader uses anon. | **Fixed:** comment reworded; recorded as §7 R11 / §8.3 D5. |
| A3 (advisory) | `10`/`91` asserted global zero/3/5 counts, so a "Part of" set by an organiser between the deploy and step (e) would stop the run. | **Fixed:** assertions scoped to children of 64 (= 61/62/69) and family rows on 64 (= 88–92); "no other row changed" now compares checksums of the affected rows; README tells the operator to run `10` straight after the deploy. §8.3 D9. |
| A4 (advisory) | §8.3 gaps (D10 `is_sms_episode` unflag; D9 `archived_at` precondition; unused captured column). | **Fixed** (D9, D10 extended; column dropped). |
| A5 (advisory, Stage 3 watch) | `campaign-parent.ts` imports the browser `createClient` factory into a module routes will import (D1); no top-level `window` access found, but a first for this app. | **Closed in Stage 3 (D30):** every switched route's built chunk loads under plain `node` and exposes its handlers; the built `campaign-parent` chunk loads with `window` undefined. |

**Stage 3 review (fresh Fable, 2026-09-21, on `5fde140`): CHANGES REQUIRED → fix round 1 (`1cbb64c`) → re-check: APPROVE WITH ADVISORIES.** The reviewer walked all 19 `.or(familyActivityFilter)` sites and the two RPC-id sites (single top-level `.or()` ANDed with the other filters; no sibling/grandparent/`campaign`-scoped parent row can pass), every renamed query key and its invalidations across `src`, every write path, the clear-ratings delete, terminology, scope (only the two snapshots' key lines beyond the plan's files), the tests, telemetry and A5.

| # | Finding | Resolution |
|---|---|---|
| F1 (blocking) | The Basics sheet sent `parent_campaign_id` on every save; the trigger is `BEFORE UPDATE OF parent_campaign_id` and fires whenever the column is in the SET list, so a child whose parent had since been archived could not save any edit, and every child save took two advisory locks. | **Fixed (D32):** the column is sent only when changed; jsdom case pins its absence on an unchanged save. |
| F2 | §9.2 lacked the Stage 3 verifier paste. | **Fixed:** item 3 above. |
| F3 | The tab test asserted a heading that does not exist, so the ambition-panel guard was untested. | **Fixed (D33):** asserts "Ambition links" present/absent in both directions. |
| F4 | Basics tests lacked clearing from a set parent, the non-writable current parent, and a trigger error. | **Fixed (D34):** three cases; additive `answerWrite` harness knob (confirmed additive). |
| F5 | A failed parent load was silent in every gated reader. | **Fixed (D35)** in the Assessments tab, the sheet's Ratings tab and the campaign-level selector (Cumulative stays selectable); the secondary surfaces keep silent-disable. |
| F6 | First-render empty states while the parent is pending. | **Fixed (D36)** in the sheet history, the import step and the distributions hook; cosmetic `isLoading` on trigger placeholders left. Re-check note: on a *failed* parent load those two surfaces now stay in their loading state (recorded, incidental findings). |
| F7 | Archived campaigns were offered as parents (the trigger refuses them). | **Fixed (D37):** `.is("archived_at", null)` + client predicate + test. |
| F8 | `InlineRatingPopover` emits no `family_assessment_rated` when handed an `activityId` by untouched callers (D25). | **Recorded follow-up (D38).** |
| Re-check advisories | No jsdom assertion that the three events fire (privacy test covers builders); the F6 loading-forever-on-error note. | Recorded in `PROGRESS.md` incidental findings for the next package that opens those files. |

---

## 10. Revision history

- **Revision 1 (2026-09-17)** — orchestrator review: approved subject to §9.1. Amendments: §0.1 step 4 corrected (the realistic set already has `an_survey_reports`; it lacks WP2.2a/b, which stay out of scope); §5.4 step 8 rewritten as a clear one-level check; §9.1 row for the contract admin account. Checked against the specification and the non-negotiables: one level in the database (trigger), ratings never duplicated (RAT-a write paths unchanged, `car_worker_phase_event_uq`), no unit/placement change, no structure file in §3.15, no production access, no new creation path.
- **Revision 0 (2026-09-17)** — plan written by the Fable planner against `main` at `e2cf34a2`; read-only checks on
  the realistic data set (`pg_get_viewdef`, `pg_depend`, `pg_policy`, campaign 61/62/64 shape, `EXPLAIN`, the
  measurement simulation, checksums) and on dev (`pg_get_viewdef`, migration ledger) recorded inline; no database was
  written.
