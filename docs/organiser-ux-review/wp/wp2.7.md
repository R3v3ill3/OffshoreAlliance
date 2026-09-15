# WP2.7 — Groups and units editor (Setup → Groups & units)

Status: **Revision 1 (2026-09-15) — plan written; operator answers to §9.1 pending (T2, D45, D72, FG, WZ, AB, SZ, DL, LB, NU, RD, E2). Implementation not started.**
Written against `main` at `7e8a3fab` (WP2.2 complete on production 2026-09-15, `wp/wp2.2.md` §9.2 "Production step 8";
WP2.4 merged at `5a16de07`, `PROGRESS.md:45`). Depends on WP2.2 only (`IMPLEMENTATION_ORCHESTRATION_PROMPT.md:154`); may
run in parallel with WP2.5 and WP2.6 on the file boundaries of `wp/wp2.4.md` §3.18 (`:806–820`), restated and tightened
in §3.15 below.

Branch (proposed): `feat/oux-wp2.7-groups-units-editor` off `main`. Draft PR into `main`. **No migration under the
recommended answers** (T2-a, D45-a, D72-a — §0, §3.4, §3.5, §3.11), so the promotion gate of `PROGRESS.md:18` does not
bind; §3.4 spells out the migration, its rollback and the full gate sequence that would apply if the operator chooses
T2-b instead.

This document follows `wp/README.md`: specification → plan → approval → deviations → verification → review. §0 is
placed first, as in `wp/wp2.2.md` and `wp/wp2.4.md`, because it states what the package needs from the databases.

### Decision labels used in this document (each label is unique; none is reused)

| Label | Topic | Section |
|---|---|---|
| **T2-a / T2-b** | Unit type change on a saved unit: keep fixed (no SQL) or widen `structure_unit_update` by migration 2.7a with C-a displacement | §3.4 |
| **D45-a / D45-b** | Legacy `ou_group_id` shapes: switch the readers to `group_id` (code-side) or normalise the rows (data script) | §3.5 |
| **D72-a / D72-b** | Membership rewritten before a refused placement save: ordered membership diff (code-side) or a membership-aware RPC (migration 2.7b) | §3.11 |
| **FG-a / FG-b** | Whether the editor is flag-gated on `groups_v2` | §3.2 |
| **WZ-a / WZ-b** | Wizard step 5: embed the editor (units persist at step 5) or keep the draft-list step | §3.13 |
| **AB-a / AB-b** | Auto-build placement mechanism for Shift / Crew / Occupation / Work area: rules + Recompute, or one-off assignments | §3.9 |
| **SZ-a / SZ-b** | Share-of-group base: membership count (estimate fallback) or always the campaign estimate | §3.8 |
| **DL-a / DL-b** | Delete the legacy editor files and the units half of `structure-save.ts` in this package, or keep them until WP2.8 | §3.13, §7 |
| **LB-a / LB-b** | Rename the full-mode sub-tab label "Campaign Units" → "Units" | §3.2 |
| **NU-a / NU-b** | The v2 wall chart's "New unit" opens the editor's Add-unit dialog, or keeps the legacy create dialog | §3.13 |
| **RD-a / RD-b** | Use of the realistic data set | §3.16 |
| **E2-a / E2-b** | How the package is accepted: Playwright from a credentialled shell, or the operator by hand from §4.6 | §4.5, §4.6 |

---

## 0. Where the schema has to be, and when (nothing to do under the recommendation)

Every database object the editor calls or reads exists on **production** and on **normal dev**:

| Object | Where defined | Production | Normal dev |
|---|---|---|---|
| `campaign_groups` (kind CHECK of seven values, `name` unique per campaign case-insensitively, one fixed kind per campaign, `source_ou_id`) with RLS `campaign_groups_select … USING (true)` and insert/update on `can_write_to_campaign` | `supabase/migrations/20260912035329_wp2_1_campaign_groups.sql:400–482` | 2026-09-13 | 2026-09-14 |
| `campaign_group_kind_for_ou_type`, `campaign_group_target_for_unit`, `campaign_group_ensure`; triggers `trg_cou_y_default_group` (BEFORE INSERT OR UPDATE OF `campaign_id, ou_type, ou_group_id, parent_ou_id, is_group_container, group_id`) and `trg_cou_z_after_group_change` (AFTER; cascades `group_id` to the unit's placements) | same file `:14–120`, `:610–745`, `:759–769` | 2026-09-13 | 2026-09-14 |
| `structure_group_create` (fixed kinds idempotent via `campaign_group_ensure`; custom kinds inserted by name, `display_order` `80 + n`), `structure_group_update` (rename and/or reorder; a container-backed custom group's rename also renames the container), `structure_group_reorder`, `structure_group_delete` (`empty_only` / `cascade_units`) | `supabase/migrations/20260914090000_wp2_2_structure_api.sql:1455–1752` | 2026-09-15 (2.2a) | 2026-09-14 |
| `structure_units_create` (element whitelist `:839`; C-g `:1021–1034`), `structure_unit_update` (whitelist `:1109–1112`: `name, total_workers_estimated, estimated_size, target_size, commonality_logic, display_order, user_rating, anchor_worker_id, unit_basis, source_metadata`), `structure_unit_reorder`, `structure_unit_delete`, `structure_unit_merge`, `structure_unit_split`, `structure_units_bulk_save` | same file `:1754`, `:1857`, `:1881`, `:1934`, `:1957`, `:2205`, `:2461–2560` | 2026-09-15 | 2026-09-14 |
| `structure_placements_assign` / `_move` / `_unassign` / `_replace_rule_rows` | same file `:2562`, `:2630`, `:2862`, `:2956` | 2026-09-15 | 2026-09-14 |
| `campaign_worker_ou_one_unit_per_group` unique index; `cwo_set_group_id()` with the 23505 pre-check; `campaign_group_membership` view | `supabase/migrations/20260914090100_wp2_2_one_unit_per_group_enforcement.sql:92–95`, `:104–150`, `:156–173` | 2026-09-15 (2.2b) | 2026-09-14 |
| `campaign_unit_rules`, `campaign_ou_candidates`, `campaign_ou_coverage_summary`, `worker_shift_options`, `worker_work_area_options`, `worker_roster_panel_options`, `occupations`, `occupation_groups` (all read or written by the surfaces the editor replaces; none is a structure table) | baseline `20260908050000_baseline_schema.sql`; read today by `campaign-units-section.tsx:321–366` and `step-campaign-units.tsx` (lookups) | live | live |

Consequences: no `supabase` CLI command, no connector call, no run sheet and no types regeneration is part of this
package under T2-a / D45-a / D72-a. The hand-typed wrapper `apps/organising-db/src/lib/campaign/structure-api.ts` is
not changed (its argument and result types already cover every call the editor makes, `:258–357`, `:366–442`).
`packages/db-types/generated.ts` is not touched. `git diff --stat main -- supabase/ packages/db-types/` must be empty
at every stage (§5, stop condition 1).

**Migration statement.** *Not needed* under the recommendation. If the operator chooses **T2-b** (§3.4) the package
gains one additive migration `2.7a` (`<UTC ts>_wp2_7_unit_type_change.sql`) plus its rollback
`scripts/data-hygiene/oux-wp2.7/92_rollback_wp2_7_unit_type_change.sql`, becomes a high-risk (Fable) implementation
for that stage, and the full promotion-gate sequence of §3.4.4 applies. If the operator chooses **D72-b** (§3.11) the
same applies for `2.7b`. Neither is recommended.

---

## 1. Specification (verbatim) and the sources it consumes

### 1.1 Specification (`IMPLEMENTATION_ORCHESTRATION_PROMPT.md:154`)

> **WP2.7 Groups and units editor.** Standard implementer. One editor in Setup replacing wizard step 5, the settings
> units section, the Campaign Units tab and the create-unit dialog (appendix B 6.6 duplication matrix); share-of-group
> sizing; auto-build from universe and worker fields. Acceptance: every capability in appendix B 6.3 has a counterpart
> or a documented retirement; the settings path can no longer flatten groups (appendix B 6.1). Depends on WP2.2.

Phase-2 exit (`:160`) is unchanged by this package. WP2.8 (`:156`) retires `is_group_container`, `ou_group_id` and the
exclusivity trigger "once WP2.2's inventory is at zero" and removes the flag; WP3.1 (`:164`) builds the three-screen
create flow on top of this editor ("how to slice it with pre-built Worksite and Employer groups and templates …
Depends on … WP2.7").

### 1.2 Binding additions from the phase-2 orchestration prompt (`PHASE2_MAIN_ORCHESTRATION_PROMPT.md`)

1. `:42` — production is never read or written by an agent; `:44` — the promotion gate binds any package with a
   migration (§0 states this package has none under the recommendation; §3.4.4 gives the sequence if it gains one).
2. `:47` — sync-on-open is a writer; every inventory of writers includes it. The editor's "Build from Who's in"
   (§3.9) calls the same library function the sync route calls (`lib/workers/sync-campaign-universe.ts`), through the
   structure API as WP2.2 row 15 left it; the guard test stays green with an empty inventory.
3. `:48` — no test skipped, disabled or quarantined; nothing widened; advisories not folded in silently (A3, A4, A5,
   D72 and T2 are carried here **by name** from `wp/wp2.4.md` §3.17 and `wp/wp2.2.md` §9.1).
4. `:49` — stop conditions (§8.4).
5. `:59` — realistic data: §3.16 says the package does not need it (RD-a).
6. `:91` — run-sheet shape, quoted in §3.4.4 for the conditional migration.
7. `:119` — "WP2.4 → WP2.5, WP2.6, WP2.7 in parallel where files are disjoint (WP2.7 needs only WP2.2)"; §3.15.
8. Inherited (`IMPLEMENTATION_ORCHESTRATION_PROMPT.md:34–36`, `:71`, `:78`, `:82–92`): nothing removed, only
   relocated; full mode keeps working; no materialised Unassigned, no localStorage view state, no new
   campaign-creation path; role coverage with a `user` account; the reviewer checklist; the guides manifest is checked
   when a taught screen changes (`:71`).

### 1.3 Plan §5.4, §5.5 and §5.8 as this plan reads them (`docs/ORGANISER_UX_REVIEW_AND_PLAN.md`)

- `:198` principle 5 — "Groups and units are edited in one editor used by setup, settings and the chart."
- `:269` — the **Setup** tab: Who's in, **Groups & units**, Organisers, Basics as cards that edit in place.
- `:289` **Group** — Worksite, Employer, Shift, Crew, Occupation, Work area, or a named Custom group; a complete
  partition of the membership; Unassigned derived.
- `:290` **Unit** — "a name, an estimated size (entered as a share of the group when the group is defined, stored as a
  number), an optional leader, and its own rating and coverage. Units of a Worksite or Employer group are created
  automatically from the universe; units of Occupation, Shift, Work area and Crew groups can be auto-filled from the
  matching worker fields when those are populated, and otherwise named by the organiser."
- `:294` — no nesting inside the organiser's model; "Split a unit" creates sibling units in the same group.
- `:325` (create-flow step 3, delivered by WP3.1 on this editor) — "Tick the groups that apply. Worksite and Employer
  are pre-ticked and pre-built from step 2. Shift, Crew, Occupation, Work area and Custom ask for unit names (chips:
  'Day, Night') and a share-of-group slider per unit, which becomes each unit's estimate. Auto-fill from worker fields
  is offered where data exists ('Occupation: 14 occupations found, build units from them?')."
- `:331` — Setup "becomes the single editor for universe, groups and units, organisers and basics. The existing
  settings accordion, 'Re-run wizard', … are retired or redirected to it." **Decision 7** (`DECISIONS.md:42`) amends
  this: no creation path is retired, prominence is reduced; this package therefore *redirects* the settings units
  section and wizard step 5 into the editor and retires nothing a user can reach today except the container ("group
  of units") flow, whose replacement is the group itself (§3.10).
- `:463` phase 2 — "Setup → Groups & units editor replaces the wizard step, the settings accordion section, the units
  tab and the create-unit dialog."
- `:122–133` terminology: Group, Unit, Unassigned, Not in any group, Who's in.
- `DECISIONS.md:37` decision 3 — the seven kinds plus a user-defined kind: `kind = custom`, the group's name is the
  kind label ("Language", "Rotation"). `:39` decision 4 — 100 % Unassigned at instigation is normal; the empty
  structure must read as normal. `:40` decision 5 — Employer and Worksite are two independent groups; "the create flow
  and the editor pre-build both groups from the universe and must not assume either side is singular."

### 1.4 Binding handoffs from earlier packages

- `wp/wp2.2.md` §1.5 (`:111–128`) — group UI is not WP2.2's; the DB retirements are WP2.8's.
- `wp/wp2.2.md` §3.3 (`:292–327`) — the RPC family; §3.4 rules C-a…C-l (`:328–343`); §11.2 signatures (`:3119–3166`).
- `wp/wp2.2.md` D43 (`:879`, allocation diff with `skip`), D45 (`:881`, `ou_group_id` is container membership only;
  "Orchestrator to confirm both"), D46/D49/D50 (`:882–886`, `onConflict` per caller and the reallocate `move`),
  D48 (`:884`, Type select disabled with a visible reason — the T2 interim), D53 (`:895`, the validation sentences),
  D56 (`:898`, the settings grid lists non-container units only), D72 (`:925`, membership rewrite ordering left to
  WP2.4, then re-carried).
- `wp/wp2.2.md` §8.2 "Stage 7 advisories carried to WP2.4" (`:797`): **A3** (create dialog drops `moved` / `displaced`
  counts), **A4** (settings units-save toast for a delete-context `23505`), **A5** (one intent, three conflict
  policies), **A8** (done in WP2.4).
- `wp/wp2.2.md` §9.1 **T2** (`:968`): "Unit type change in the units-section edit dialog … interim = the Type select is
  disabled with a visible reason (D48). Widening `structure_unit_update`'s whitelist needs SQL plus C-a displacement
  after the cascade → operator decision, candidate for Stage 6 or WP2.7 — **pending operator**." §11.12 (`:4146–4152`)
  "D45 consequences to carry into WP2.7": the three `ou_group_id` readers and the two coexisting shapes.
- `wp/wp2.4.md` §1.5 (`:145`) — "Groups and units editor, share-of-group sizing, auto-build — WP2.7. Group
  create/rename/reorder/delete have no screen in WP2.4 (the `structure_group_*` RPCs stay contract-tested only)."
  §3.17 (`:794–804`, **CA-a approved**): A5 decided as policy ("a dialog where the user picked specific workers uses
  `onConflict: 'error'` …; every bulk or automatic path uses `'skip'` and reports the skipped count … WP2.7 applies
  the policy to the editor it builds"); A3, A4, D72 re-carried here. §3.18 (`:806–820`): WP2.7 owns
  `campaign-units-section.tsx`, `campaign-wizard.tsx`, `campaign-settings.tsx`, `step-campaign-units.tsx`,
  `create-organising-unit-dialog.tsx`, `lib/campaign/structure-save.ts`, new `setup/**`; consumes `unitsOfGroup`;
  "the ⋯ menu's Rename/Set estimate dialog may be replaced by the editor's". §3.6 (`:527`, MN-a): the v2 card menu
  offers Rename, Set estimate, Assign people, Split, Merge, Delete.
- `PROGRESS.md:45` (WP2.4 row: 1,563 tests; lint 295 = base; guard 3/3) and `:102` (the parallel Cursor commits
  `e47b4d10`, `4461c2ee` on `sync-campaign-universe.ts`, `campaign-settings.tsx`, `campaign-universe-section.tsx`,
  `campaign-wizard.tsx`, `step-employers-worksites.tsx`, `universe-match-mode-control.tsx`; the session was confirmed
  stopped on 2026-09-15, `wp/wp2.4.md` §9.2). Every citation into those files below is against `7e8a3fab`.
- `apps/organising-db/src/lib/campaign/workspace-tabs.ts:234–236` — "Plan 3.6 says 'Unit'; the full-mode trigger still
  reads 'Campaign Units' and is not renamed here (WP2.7 owns that)."

### 1.5 Not in WP2.7 (recorded so it is not folded in silently)

- The **Who's in** card (`campaign-universe-section.tsx`, incl. the Cursor match-mode control `:409–416`), the
  Organisers and Basics cards, the setup checklist drawer (WP3.2), templates and the three-screen create flow (WP3.1).
  The editor exposes what WP3.1's step 3 needs (§3.9 auto-build, §3.8 shares) as reusable components and pure
  helpers, but the create flow itself is WP3.1's.
- Wizard **step 6** and the settings **"Allocate workers"** section keep `StepAllocateWorkers` as their grid
  (`campaign-wizard.tsx:1753–1780`, `campaign-settings.tsx:1075–1112`); only their **save** changes (D72, §3.11) and
  the grid's cross-group conflict hint switches to `group_id` (D45-a, §3.5). Placing people is the wall chart's job
  (plan `:291`, `:310`); the editor offers Assign people / Move / Remove per unit as the Units tab does today.
- Other unit creators outside the four named surfaces: `add-workers-client.tsx` "new unit" (appendix B 6.5 `:252`),
  `worker-import/organising-units/route.ts`, `campaign-import/apply/route.ts`, the split dialog. Untouched (all on the
  structure API since WP2.2).
- The **legacy wall chart** (flag off) and its dialogs: `wall-chart-dialogs.tsx:200` keeps mounting
  `CreateOrganisingUnitDialog`, the legacy delete/merge/split dialogs stay as they are. Only the A3 one-liner touches
  the create dialog (§3.12). WP2.8 deletes them all.
- The DB retirements (`is_group_container`, `ou_group_id`, `check_worker_ou_group_exclusivity`, the legacy split
  function, `campaign_groups.source_ou_id`) and the reporting views — WP2.8.
- `groups_v2` itself, the v2 chart's toolbar/band/cards (`wall-chart/v2/**` beyond the one dialog mount named in
  §3.13), `lib/campaign/groups/**`, `useUserCampaignPrefs` — WP2.4's, consumed only.
- `workforce-list-view.tsx` and its `ou_group_id` readers (`:288–289`, `:448`, `:609`) — **WP2.6's** (§3.18 of
  wp2.4.md); recorded as a hand-off in §3.5, not changed here.
- `lib/workers/sync-campaign-universe.ts` (`ou_group_id` as container parent, `:53–57`, `:361–377`) — WP2.4b's; its
  reading of `ou_group_id` is the documented container semantics and is unaffected by D45-a.
- Undo toasts, leader avatar, bulk Set rating (wp2.4.md §1.5), touch (WP4.1), guides re-recording (WP2.9, human).
- Any change under `supabase/`, to `packages/db-types/generated.ts`, to `structure-api.ts`, or to any RPC — unless
  the operator chooses T2-b or D72-b (§3.4, §3.11).

---

## 2. Current-state map

### 2.1 The four surfaces the specification names, and what each writes today

All writes already go through `structureApi(client)` (WP2.2; guard test
`src/lib/campaign/__tests__/no-direct-structure-writes.test.ts` green with an empty inventory, `PROGRESS.md:45`).

| Surface | Mounted at | Reads | Writes (wrapper call → RPC) | Lines |
|---|---|---|---|---|
| **Wizard step 5 "Campaign units"** (`StepCampaignUnits`, 1,704 lines) | `campaign-wizard.tsx:1721–1750` (step title `:1298`) | wizard scope query `:259–398` (units hydrated as drafts `srv_<id>` with `parent_ou_id`, `is_group_container`, `ou_group_id`, `:347–367`; placements `:369–377`) | `saveUnitsMutation` `:789–963`: `saveUnitDrafts` (ONE `structure_units_bulk_save`, `structure-save.ts:420–447`), then **in-memory** auto-allocation of scope workers to worksite/employer-basis units (`:828–862`), proportional re-estimate (`:865–919`), `pendingGroupAllocations` resolved into `workerUnitAllocations` (`:935–956`), `setStep(6)` | draft type `step-campaign-units.tsx:46–70`; scope toggles with an even estimate split `:296–380`; single add (occupational grouping / occupation / custom) `:383–459`; the 4-phase "group of units" container flow `:463–557`, `:721–1000`; legacy "Sub" `:590–608`; per-dimension sums and over-total warnings `:610–640`, `:1080–1105`; synthetic "Unallocated" row `:1162–1176`; inline `GroupAllocationPanel` `:1467–1560` |
| **Wizard step 6 / settings "Allocate workers"** (`StepAllocateWorkers`, kept — §1.5) | `campaign-wizard.tsx:1753–1780`; `campaign-settings.tsx:1075–1112` | membership + placements (paged, D77) | `saveWorkersMutation` `campaign-wizard.tsx:965–1010`, `campaign-settings.tsx:531–582`: **delete all `campaign_worker_membership` rows, re-insert the selection** (`:970–976` / `:534–546`), then `savePlacements` (diff, D43; `structure-save.ts:515–560`), then `stampEmployerWorksiteFromOu` + `syncWorkersToMatchingCampaigns` (wizard only, `:996–1007`) | the D72 defect: a refused placement save leaves the membership rewritten; every kept membership row loses its `created_at` (the table has only `created_at`/`updated_at`, baseline `:7698–7704`) |
| **Settings "Campaign units"** section | `campaign-settings.tsx:1045–1072` (accordion item `units`) | scope query `:170–215` (hydrates the same draft shape, D56) | `saveUnitsMutation` `:509–529` → `saveUnitDrafts`; `toast.success("Campaign units saved.")` | `units` / `pendingGroupAllocations` state `:141–142` |
| **Units tab** (`CampaignUnitsSection`, 2,401 lines; `?tab=workforce&sub=campaign-units`) | `app/(dashboard)/campaigns/[id]/page.tsx:51`, `:879–884` (with `CoveragePanel` below it) | `campaign-members` `:239`, `rule-employers` `:262`, `rule-worksites` `:275`, `campaign-ous` `:287` (`select("*")`, ordered `display_order, name`), `campaign-worker-ou` `:303` (with `worker:workers(...)`), `campaign-unit-rules` `:321`, `campaign-ou-coverage` `:338` (`campaign_ou_coverage_summary`), `campaign-ou-candidates` `:360` | `acceptCandidate` `:448` (`units.bulkSave({creates:[wtp_seeded]})` then the `campaign_ou_candidates` update), `rejectCandidate` `:488`, `generateCandidates` `:501`, `createOu` `:518` (`bulkSave creates`, D47), `updateOu` `:563` (`bulkSave updates` minus `ou_type`, D48 `:1928–1949`), `assignOu` `:624` (`placements.assign onConflict "error"`, D49/D54), `recomputeRules` `:669` (`recomputeOuAssignments`), `addRule` `:695` / `deleteRule` `:734` (direct `campaign_unit_rules` writes — not a structure table; auto-recompute), `rateUnit` `:755` (`units.update({user_rating})`), `removeFromUnitMutation` `:768` (`placements.unassign({ouId})`), `reallocateToUnitMutation` `:790` (`placements.move keepInParent:false`, D50) | header `:1136–1190`: Suggest from plan, Recompute rules, **New group** (opens `CreateOrganisingUnitDialog`, `:2277`), **Add unit** (dialog `:1905–2020`), Merge units (picker `:2326`); per unit `:1196–1420`: rating 1–5, Edit (`title="Edit unit"` `:1336`), Assign worker `:1362`, menu Split into sub-units `:1396` / Assign workers `:1408` / Delete unit `:1415`; "Show sub-units" `:1327`; worker table with Remove from unit `:1484`, Reallocate to… `:1499`, per-row remove `:1586`; Assignment rules `:1608–1755`; "Unallocated" pseudo-unit `:1785–1889` with Assign to unit… `:1809` |
| **Create-unit dialog** (`CreateOrganisingUnitDialog`, 1,075 lines) | legacy chart `wall-chart-dialogs.tsx:17`, `:200`; v2 chart `wall-chart/v2/wall-chart-dialogs-v2.tsx:36`, `:221–235` (opened from the Units popover's "New unit", `wall-chart-unit-manager.tsx:105`, `:147` → `wall-chart-toolbar.tsx:286` `setCreateUnitOpen(true)`); Units tab `:2277` | existing units | `api.units.create({ units, assignments })` `:429`, then `api.units.reorder` for the placement step `:440–447`; `onSuccess` `:454–457` invalidates and focuses — the `created.moved` / `created.displaced` counts are dropped (**A3**) | 4-step mini-wizard (details / placement / workers / review, `:76`, `:567–571`); "group of units" phases `:604–848`; `GROUPABLE_TYPES` `:64` (excludes employer / worksite / job_type); containers written with `parent_ou_id` + `ou_group_id: "container"` `:405–411` |

### 2.2 What the structure API already offers the editor (nothing new is needed)

- Groups: `groups.create` / `update` / `reorder` / `remove` (`structure-api.ts:489–526`; SQL §0). Fixed kinds are
  idempotent (`:1489–1512` of 2.2a); a custom group's name is unique per campaign (23505 → `duplicate_group`,
  `structure-api.ts:153–156`); `structure_group_delete cascade_units` deletes units through the unit-delete core
  (members of a container before the container, `:1703–1714`) and refuses while anything references the group.
- Units: `units.create` with `client_ref`, `group_id` pin for custom-kind elements only (C-g, 2.2a `:1021–1034`),
  `units.update` (whitelist `:1109–1112` — `ou_type` and `group_id` are **not** in it: T2), `units.reorder`,
  `units.remove` with `reassignments` and `deleteChildren`, `units.merge` (same group only, C-j), `units.split`
  (siblings in the source's group, C-k), `units.bulkSave`.
- Placements: `assign` (`onConflict` skip/move/error), `move` (`fromOuId` null = from Unassigned; `withinGroupId`;
  `keepInParent`), `unassign`, `replaceRuleRows` (Recompute, R1).
- The error mapping and the sentences: `structure-error-message.ts:44–64` (`structureErrorMessage`), `:82–85`
  (`duplicateInGroupMessage(err, lead)`), `ALREADY_IN_GROUP_MESSAGE` `:19`.
- Pure group derivations from WP2.4 (`lib/campaign/groups/derive-group-view.ts`): `sortUnits` `:71`, `unitsOfGroup`
  `:82`, `groupOfUnit` `:90`, `unitsByWorker` `:102`, `deriveGroupView` `:124` (→ `workersByUnit`,
  `unassignedWorkerIds`, `placementByWorker`), `notInAnyGroup` `:165`; `resolve-group-selection.ts` (`orderGroups`
  `:41`, `parseGroupParam` `:63`, `groupParamValue` `:70`, `resolveGroupSelection` `:79`); the groups query shape and
  key `CAMPAIGN_GROUPS_QUERY_KEY = "campaign-groups"` in `wall-chart/v2/use-wall-chart-groups.ts:18–25`.

### 2.3 The T2 interim (unit type change)

`campaign-units-section.tsx:1928–1949`: the Type select is `disabled={editingOuId != null}` with the line "The type is
fixed once a unit exists — it decides which group the unit belongs to."; the update patch never sends `ou_type`
(D48). The legacy dialog let `ou_type` change, and the WP2.1 triggers would move the unit and its placements to the
other group (`trg_cou_y_default_group` re-derives on `UPDATE OF ou_type`, `20260912035329:644–671`;
`cou_after_group_change` cascades `group_id` to the placements `:711–715`). Under 2.2b that cascade fires
`trg_cwo_z_set_group_id` (`BEFORE INSERT OR UPDATE OF ou_id, group_id`, `:771–773`), whose pre-check raises
`23505 campaign_worker_ou_one_unit_per_group` when the worker already holds a unit in the target group
(`20260914090100:120–139`) — so a type change without prior displacement fails mid-cascade. The RPC whitelist refuses
`ou_type` with `22023` (contract case "rejects keys outside the whitelist (description, leader_worker_id, ou_type)",
`structure-api.contract.test.ts:628`). No screen offers a type change today; the wizard/settings editors never edited
the type of a saved unit (D44).

### 2.4 The D45 shapes (legacy `ou_group_id`)

`ou_group_id`'s documented meaning is container membership (`types/organising-row-types.ts:582–587`: "FK to the group
container OU that owns this member unit. Always equals parent_ou_id when set; NULL for containers and standalone
units"). Two shapes coexist on production (wp2.2.md §11.12 `:4146–4152`):

- **Legacy wizard shape** — a sub-unit under a *plain* (non-container) parent with `ou_group_id = parent_ou_id`
  (the legacy insert set it "for every non-container child, container or not", D45 `:881`; appendix B 4.2 `:154`).
- **Post-WP2.2 shape** — the same case created after Stage 5 carries `ou_group_id = NULL` and `parent_ou_id` only
  (`structure-save.ts:250–253`; `structure_units_create` refuses `ou_group_id` on a non-container, 22023).

Neither shape affects `group_id`: `campaign_group_target_for_unit` consults `ou_group_id` only when it names a
**container** of custom kind (`20260912035329:69–85`); a plain parent falls through to the type-label group. The
difference is visible only to the readers that treat `ou_group_id` as "in a group" (§2.5). Production counts are not
known to the agent (never read); appendix G (`appendix-G-production-data.md:11`) has 239 units / 20 containers and H2
= 0 roll-up rows (`:88`), so the legacy-shape population is a subset of the ~219 leaf units with a plain parent —
the read-only count query in §3.5 lets the operator see the number if wanted.

### 2.5 Every legacy `ou_group_id` / `parent_ou_id` reader (27 files; the ones D45 touches in bold)

| File | Lines | What it reads `ou_group_id` / `parent_ou_id` as | Owner / disposition |
|---|---|---|---|
| **`lib/campaign/ou-reassignment-targets.ts`** | `:22–40` | "same container" (`ou_group_id`) or "same parent" (`parent_ou_id`) narrows the reassignment targets; falls back to same `ou_type` | **WP2.7 (D45-a: `group_id`-based, §3.5)**; callers: `delete-organising-unit-dialog.tsx:62` (`allOus: OuRowForReassignment[]`), `campaign-units-section.tsx` reallocate `:2135–2160` |
| **`components/campaigns/step-allocate-workers.tsx`** | `:45–47`, `:346–380`, `:701–707` | the cross-group conflict hint: "target belongs to group X (`ou_group_id`) and the worker is in a unit of group Y of the same `ou_type`" | **WP2.7 (D45-a; the hint becomes C-a on `group_id`)** |
| `components/campaigns/workforce/workforce-list-view.tsx` | `:288–289`, `:448`, `:609` | group name per unit, the `ouGroupIds` filter, the grouped-view bucket ("employer group of the primary unit") | **WP2.6** (rewrites the list on shared state); hand-off in §3.5 |
| `lib/workers/sync-campaign-universe.ts` | `:53–57`, `:324`, `:347–377` | the matched member's container (§3.7 of wp2.2.md, M2 going forward) | WP2.4b; correct semantics, untouched |
| `app/api/campaign-import/apply/route.ts` | `:603–640` | container + members written with both columns (correct shape) | untouched |
| `components/campaigns/step-campaign-units.tsx` | `:55`, `:564`, `:599–603` | draft hierarchy | deleted with the step (DL-a) |
| `components/campaigns/campaign-wizard.tsx` / `campaign-settings.tsx` | `:347–367`, `:1770–1771` / `:191–213` | hydration into drafts; passed to the grid | WP2.7: hydration keeps the columns, the grid receives `group_id` too |
| `components/campaigns/campaign-units-section.tsx` | 13 sites | container badge, sub-unit toggle, reallocate targets | deleted (DL-a); capabilities relocated (§3.10) |
| `components/campaigns/wall-chart/create-organising-unit-dialog.tsx` | `:405–411` | writes containers | legacy chart only after WP2.7; A3 fix only |
| `wall-chart/split-unit-dialog.tsx` (`:57`, `:149`, `:337`, `:600`), `delete-organising-unit-dialog.tsx` (`:60`, `:93–94`), `wall-chart-dialogs.tsx` (`:263–264`), `v2/wall-chart-dialogs-v2.tsx` (`:279`), `wall-chart-unit-manager.tsx` (`:57`, `:64`), `hooks/use-wall-chart-structure.ts` (`:358`, `:374`), `wall-chart-unit-hierarchy.tsx` (`:112`), `wall-chart/types.ts` (`:139`, `:147`) | — | container / nesting semantics of the legacy chart and the split dialog's source container | untouched (WP2.8 removes the legacy chart) |
| `activists/coverage-panel.tsx` (`:266–267`, `:361–362`), `activists/use-woc-data.ts` (`:22`, `:44–51`), `api/campaigns/[id]/activists/export/route.ts` (`:122–123`, `:291`) | — | `parent_ou_id` → the "group name" column of the coverage map | untouched (WP2.8 makes them group-aware) |
| `campaign-worker-assignment-picker.tsx:179`, `lib/hooks/useAssessmentDistributions.ts:67` | comments only | — | untouched |
| `types/organising-row-types.ts` (`:148`, `:577–598`, `:651`) | types | — | untouched (WP2.8) |

### 2.6 Setup-tab plumbing the editor mounts into

- Organiser mode: the **Setup** tab's subs are `universe` ("Who's in") and `campaign-units` labelled **"Units"**
  (`lib/campaign/workspace-tabs.ts:227–238`); `CampaignSetupCards` (Organisers, Basics, Strategic plan, Import worker
  list, Re-run wizard) renders above the sub row (`campaign-tab-bar.tsx:220–227`;
  `components/campaigns/setup/campaign-setup-cards.tsx`).
- Full mode: the registry labels the sub **"Campaign Units"** (`lib/campaign-tabs.ts:256`, module `setup`); pinned by
  `lib/campaign/__tests__/campaign-surfaces.fixture.ts:61`, `campaign-tabs-full-mode.fixture.ts:38`,
  `workspace-tabs.test.ts:479–488` (P4: "the organiser label wins over the registry's: Units, not Campaign Units"),
  and by e2e `tests/e2e/roles/unit-lifecycle.ts:220–224`, `tests/e2e/structure-api.spec.ts:670`.
- The page mounts `<CampaignUnitsSection>` then `<CoveragePanel>` under `TabsContent value="campaign-units"`
  (`[id]/page.tsx:879–884`); the `TabsTrigger` value `campaign-units` is the e2e URL anchor (`unit-lifecycle.ts:15–24`).
- Copy that names the tab: `activists/wocs-panel.tsx:245` ("No units defined on Campaign Units yet."),
  `campaign-universe-section.tsx:405` ("… Wall Chart / List and Campaign Units sub-tabs.").

### 2.7 Test harness and fixtures available

- The wall-chart harness (`wall-chart/__tests__/harness/{backend,fixture,mount,mocks,locate}.ts(x)`): fake PostgREST
  and `fetchApi` edges over a fixture; RPCs recorded (`rpcInvocations()`) and answered (`answerRpc`); direct
  structure-table writes throw `DirectStructureWriteError` (`backend.ts:48–58`, D57); every builder chain recorded
  (`queryInvocations()`). The `small` fixture carries `campaign_groups` (Employer 1, Worksite 2, Shift 3; `fixture.ts:176–178`)
  and `group_id` on every unit (`:160–164`); `large` is 305 members / 161 units with `LARGE_GROUPS` (`:190–191`, `:266`).
- Mounted-screen precedents: `components/campaigns/__tests__/campaign-save-flows.structure-writes.test.tsx` (wizard
  and settings mounted for real; 12 cases) and `campaign-units-section.structure-writes.test.tsx` (16 cases: every
  row-9 path's exact `p_*` payload, dialog close, invalidations, alert wording, D48 select, D49 sentence, candidate
  row update, "no direct write").
- Node fake: `lib/campaign/__tests__/fake-structure-client.ts` (ordered `calls` list of `from` chains and `rpc`).
- Contract suite (`__contract__/structure-api.contract.test.ts`, `pnpm test:contract`, env-gated, dev only): one
  `describe` per RPC incl. all four `structure_group_*` (`:434–540`). Unchanged by this package unless T2-b / D72-b.
- e2e: `tests/e2e/roles/unit-lifecycle.ts` (`renameUnit` via the Units tab "Edit unit" dialog, `:209–240`; `deleteUnit`
  via the wall-chart popover `:243–258`), `unit-lifecycle-user.spec.ts:100–143` / `-admin.spec.ts:76`,
  `structure-api.spec.ts` items 4 (merge from the Units tab, `:655–700`), 5 (settings "Save campaign units" round trip,
  `:589–603`, `:702–748`) and 6 (role refusal on the settings units save, `:762–772`). All unrun in the sandbox
  (wp2.2.md D80/D81); the operator accepts by hand (E2-b precedent, wp2.4.md §9.1).

### 2.8 Terminology in the surfaces being replaced (appendix B §7, `:274–284`)

"Campaign units" / "Organising unit" / "OU coverage" / "dimension" / "group container" / "employer group" / "vessel
units" / "sub-unit" / "Unallocated" / "Job type" / raw `job_type` badges. The editor uses plan 3.6 words only: Group,
Unit, Unassigned, Who's in; kind labels from `campaign_group_kind_for_ou_type` (Worksite, Employer, Shift, Crew,
Occupation, Work area) and the custom group's own name.

---

## 3. Target design

### 3.1 Principles

1. **One editor, four mount points.** `GroupsUnitsEditor` (new, `components/campaigns/setup/groups-units-editor/`)
   is the only groups-and-units editor: the Units tab renders it, wizard step 5 embeds it, the settings "Campaign
   units" section embeds it, the v2 chart's "New unit" opens its Add-unit dialog. No draft list, no "Save": every
   action is one structure RPC, applied immediately, with the exact same error surfaces as the v2 chart (toast through
   `structureErrorMessage`; inline `role="alert"` in dialogs).
2. **The group is the unit of navigation.** Groups in display order on the left (or as a segmented row under
   `md`), the selected group's units on the right, the group's derived **Unassigned** as the last row. The selected
   group is `?group=` (same param and resolver as the chart, `resolve-group-selection.ts:79`), so a link from the
   chart lands on the same group; the editor writes `?group=` only, never the prefs document (the chart owns it).
3. **No nesting, no containers.** The editor never sets `is_group_container`, `parent_ou_id` or `ou_group_id` on a
   create (decision 5; plan `:294`). Legacy containers are rendered by what they *are* in the group model: an
   Employer-kind container is a unit of the Employer group (it holds M2 placements); a custom-kind container is the
   group it backs (`source_ou_id`) and is not listed as a unit; sub-units are units of their own group.
4. **Every write is a structure RPC** already contract-tested; the only non-structure writes are the ones the Units
   tab makes today (`campaign_unit_rules`, `campaign_ou_candidates`, `campaign_worker_membership` in the allocation
   save). The guard test stays green with an empty inventory; the harness's `DirectStructureWriteError` pins it for
   the editor.
5. **A5 as policy** (wp2.4.md §3.17): picked-worker dialogs use `onConflict: "error"` and name the worker; bulk or
   automatic paths use `"skip"` and report the skipped count.
6. **Nothing removed, only relocated.** §3.10 maps every appendix B 6.3 / 6.4 / 4.2 capability to its place in the
   editor or to a documented retirement; the retirements are the two container flows ("New group" as a container of
   same-type units; the step-5 "Add a group of units" phases) and the "Sub" button, each of which has a group-model
   counterpart (a Group; Split).
7. **Full mode keeps working.** The legacy chart, its dialogs and the legacy list view are untouched (A3 aside);
   the editor is not a chart. Under `groups_v2` off, an organiser sees the legacy chart *and* the new editor
   (FG-a, §3.2); the data model both read is the WP2.1 one.
8. **No flag, no localStorage, no creation path, no migration** (under the recommendation).

### 3.2 Where the editor lives; FG and LB

- **Units tab** — `[id]/page.tsx:879–884` renders `<GroupsUnitsEditor campaignId canWrite variant="tab" />` in place
  of `<CampaignUnitsSection>`; `<CoveragePanel>` stays below it unchanged.
- **Wizard step 5** — §3.13 (WZ).
- **Settings "Campaign units"** — §3.13.
- **v2 chart "New unit"** — §3.13 (NU).
- **FG — flag gating.** **FG-a (recommended):** not gated. Reasons: (i) WP2.2 principle 9 — a flag would keep the
  legacy editors alive and defeat the acceptance "the settings path can no longer flatten groups"; (ii) the group
  model is the database truth for everyone since WP2.1/2.2 — the editor shows it, the legacy chart shows the same
  units flat, which is what it does today for plain units; (iii) WP2.8 removes the flag anyway. **FG-b:** render the
  editor only when `groups_v2` is on, keep the four legacy surfaces otherwise — doubles the maintained surface for one
  package and leaves D72/A4 in the legacy paths.
- **LB — label.** **LB-a (recommended):** the full-mode sub label becomes **"Units"** (`lib/campaign-tabs.ts:256`),
  matching the organiser label (`workspace-tabs.ts:236`) and plan 3.6; the three fixtures and the P4 test are updated
  to the new literal (P4 keeps asserting that the organiser override exists and that both labels are "Units"; nothing
  is weakened); e2e selectors `getByRole("tab", { name: "Units" })` in `unit-lifecycle.ts:222` and
  `structure-api.spec.ts:670`; the two copy strings (`wocs-panel.tsx:245`, `campaign-universe-section.tsx:405`).
  **LB-b:** leave "Campaign Units". The `TabsTrigger` value `campaign-units` (the URL) does not change under either.

### 3.3 The group model as edited (kinds, types, custom kinds, legacy rows)

| Group kind | Add-unit `ou_type` | `group_id` on the create element | Auto-build source (§3.9) |
|---|---|---|---|
| `worksite` | `worksite` (`unit_basis.worksite_id`) | derived by trigger (never sent) | Who's in: `campaign_worksites` |
| `employer` | `employer` (`unit_basis.employer_id`) | derived | Who's in: `campaign_employers` |
| `shift` | `shift` (`unit_basis.shift_id` when built) | derived | members' `workers.shift_id` → `worker_shift_options` |
| `crew` | `crew_rotation` (`unit_basis.roster_panel_id`) | derived | members' `roster_panel_id` → `worker_roster_panel_options` |
| `occupation` | `job_type` (`unit_basis.canonical_occupation_id` or `occupation_group_id`) | derived | members' `canonical_occupation_id` → `occupations` / `occupation_groups` |
| `work_area` | `work_area` (`unit_basis.work_area_id`) | derived | members' `work_area_id` → `worker_work_area_options` |
| `custom` (incl. the label groups Department / Network / Ethnic community / Accommodation / Custom that `campaign_group_kind_for_ou_type` derives, `20260912035329:24–28`) | `custom` (`unit_basis { custom: true }`) | **pinned** to the group (`group_id`, C-g) | none — names typed (chips "Day, Night" → one `units.create` with several elements) |

The mapping lives in one pure module `lib/campaign/setup/group-kinds.ts` (`ouTypeForKind(kind)`, `kindLabel`,
`canAddGroup(kind, existing)`, the seven-kind list mirroring `structure_group_create`'s check `:1476`). A group of a
fixed kind can exist once per campaign (`campaign_groups_one_fixed_kind_per_campaign`); the Add-group dialog greys a
fixed kind that already exists. A custom group needs a name (decision 3) which is its kind label; the RPC's 23505 on
a duplicate name is shown as "A group named … already exists."

Legacy rows, rendered without special cases:

- Employer-kind containers (`is_group_container`, `group_id` = Employer group, M2 placements): units of the Employer
  group; Delete on one calls `units.remove({ deleteChildren: false })` so its worksite children (units of the Worksite
  group) are **detached, never deleted** — a deliberate difference from the legacy delete dialog (`:104–199` deleted
  children; D35) because in the group model those children belong to another group. Recorded as design point DC in
  §3.7; the confirm names it ("Its N worksite units stay in the Worksite group").
- Custom-kind containers (`group_id NULL`, a group's `source_ou_id`): not listed; the group is; rename propagates
  (SQL `:1568–1585`). Group delete with `cascade_units` deletes the member units but leaves the container row
  (2.2a comment `:1752`) — harmless, retired by WP2.8; the editor's confirm does not mention it.
- Sub-units (`parent_ou_id` set): units of their own group; Split… on any unit uses the existing dialog
  (`SplitUnitDialog`), which under C-k creates siblings in the same group.

### 3.4 T2 — unit type change on a saved unit

**T2-a (recommended): keep the type fixed; no SQL.** The editor has no Type control at all: a unit's group is where
it sits. "Changing the type" is expressed in group-model terms as *move this unit to another group*, done with two
existing atomic operations the editor already exposes: **Add unit** in the target group (name, estimate copied), then
**Delete…** the old unit with "Move everyone to <new unit>" (`units.remove` with `reassignments: [{ worker_id,
to_ou_id }]` — the delete core applies the move rules, so cross-group reassignment displaces per C-a and carries the
primary per C-h; contract case `:655`). The Delete dialog's target list offers units of *any* group for this purpose
(§3.7 DC). Reasons: (i) the capability was never reachable from the wizard/settings editors and is disabled in the
Units tab since D48 with no operator report of need; (ii) under the group model a Worksite becoming a Shift is a new
unit, not an edit; (iii) T2-b needs a migration and therefore the whole promotion gate, a Fable implementer for the
SQL, and displacement/basis rules whose UX ("3 people would lose their Shift placement") is a dialog of its own.

**T2-b: migration 2.7a widens the whitelist.** Recorded exactly so the operator can choose it with eyes open:

1. **File** `supabase/migrations/<UTC ts>_wp2_7_unit_type_change.sql` (created with `npx supabase migration new
   wp2_7_unit_type_change` after operator approval of that command; name per
   `scripts/validate-supabase-migrations.mjs`). One implicit transaction (repository convention, 2.2a header
   `:11–13`). Sections: (0) preconditions — `oux_internal.structure__update_unit` and the 2.2b index exist, else
   raise; (1) `CREATE OR REPLACE FUNCTION oux_internal.structure__update_unit(...)` with the whitelist `:1109–1112`
   extended by `ou_type` and `group_id`, and, when `p_patch ? 'ou_type'`: refuse a container (`P0001`), refuse an
   unknown type (`22023`, via `campaign_group_kind_for_ou_type`), refuse when the current `unit_basis` carries a
   scope key (`employer_id`, `worksite_id`, `canonical_occupation_id`, `occupation_group_id`) unless the patch
   replaces `unit_basis` (`22023`: "clear the scope basis when changing the type"); resolve the target group
   (`campaign_group_target_for_unit(new_type, false, NULL)` → `campaign_group_ensure`, or the pinned custom
   `group_id`, C-g); if it differs from the current group, **displace first** (delete-before-write, §3.1 of wp2.2.md):
   for every worker placed on the unit who holds another placement in the target group, delete that other row
   (the unit's row wins, as `structure_placements_move` does), carry `is_primary` (C-h), count `displaced`; then
   `UPDATE … SET ou_type = …, group_id = <target or NULL to re-derive>` — the WP2.1 BEFORE trigger re-derives or
   validates (`20260912035329:626–671`), the AFTER trigger cascades to the placements (`:711–715`), and the 2.2b
   pre-check no longer fires because the duplicates are gone; (2) the public `structure_unit_update` body is
   unchanged (it only forwards) but its `COMMENT` is refreshed; (3) post-assertions in a `DO` block (`prosrc`
   contains `'ou_type'`). The return shape gains `displaced` (wrapper `unitUpdateResultSchema` gains an optional
   `displaced` — the only `structure-api.ts` change, additive).
2. **Rollback** `scripts/data-hygiene/oux-wp2.7/92_rollback_wp2_7_unit_type_change.sql`: env-guarded like `90`
   (`:14–31`); restores the 2.2a body of `oux_internal.structure__update_unit` verbatim; prints the whitelist line
   after. Recovery-only; migration-history repair is a separate operator command.
3. **Tests**: contract cases in `structure-api.contract.test.ts` — type change within a kind family (no group change:
   plain update), fixed → fixed with displacement (counts and state), fixed → custom pin, refusal on a container, on
   a scope-based unit, on an unknown type, atomicity (a refused displacement leaves nothing changed); the guard test
   unchanged; a jsdom case for the editor's "Change group…" dialog.
4. **Promotion gate (binding, `PROGRESS.md:18`; the WP2.2 G1 shape `wp/wp2.2.md:674–716`)**, run as one checklist,
   each output pasted before the next file is handed over:
   1. migration + rollback on the branch; `pnpm validate:migrations` green;
   2. **normal dev**: the agent applies the exact file through the connector with the operator's approval for that
      file (or the operator pastes it) — one submission: `BEGIN;` + file + `COMMIT;` + the read-only check (`SELECT
      prosrc LIKE '%''ou_type''%' FROM pg_proc WHERE proname = 'structure__update_unit'`), then the ledger row
      `<ts> wp2_7_unit_type_change` in `supabase_migrations.schema_migrations`; **never `supabase db push` from this
      checkout** (`supabase/.temp/project-ref` names production, wp2.2.md §8.2 A7);
   3. contract suite on dev (`pnpm test:contract`, env in the shell only; the skipped count reported), preview
      acceptance;
   4. operator switches the production project's Supabase GitHub deploy to manual (human-task precedent,
      `PROGRESS.md` human tasks) and confirms;
   5. **production** (operator only, SQL Editor, `postgres` role, never the connector's `apply_migration`): one file
      prepared by the agent from the committed migration — `BEGIN;` **`SET LOCAL oux.env = 'production';`** + the
      migration body + `COMMIT;` + the same read-only `SELECT` — then a second one-line submission inserting the
      ledger row; the operator pastes both results;
   6. operator merges the PR (Vercel Production deploys; `gen-types.yml` regenerates — no new symbol, the function
      signature is unchanged, so no `generated.ts` diff is expected; the regen commit is checked);
   7. GitHub deploy switched back to automatic; ledger row updated with the pasted outputs.
   Rollback on production, if ever needed, is `92` with the same `SET LOCAL` line — recovery-only, operator-run.

### 3.5 D45 — the legacy `ou_group_id` shapes

**D45-a (recommended): code-side — the two readers this package owns stop reading `ou_group_id` as "in a group" and
read `group_id` (the WP2.1 column that *is* the group); the rows are left as they are.**

- `lib/campaign/ou-reassignment-targets.ts:15–42` — `OuRowForReassignment` gains `group_id?: number | null`; the
  candidate rule becomes: same `group_id` as the source, not a container, **and** (kept from today, because the
  legacy `check_worker_ou_group_exclusivity` trigger still enforces one container per `ou_type`, D17) when the source
  is a member of an Employer container (`ou_group_id` set *and* that row is a container), only siblings of the same
  container. The D45 case — a sub-unit under a plain parent with either `ou_group_id` shape — now gets the units of
  its own group instead of "siblings under the same parent" (`:31–33`) or "same container" (`:35–37`); the same-type
  fallback (`:39–40`) becomes the same-group rule. `ouTargetLabel` unchanged. Tests: the new rule for each shape;
  legacy container members unchanged (pinned).
- `components/campaigns/step-allocate-workers.tsx:346–380` and `:701–707` — the unit prop gains `group_id`; the
  conflict is C-a: the worker already holds another unit **of the same `group_id`** ("already in <unit> of the same
  group"); the "same `ou_type`" and container lookups go. Both callers pass `group_id` from their hydration reads
  (`campaign-wizard.tsx:347–367` selects `*`-equivalent columns — add `group_id`; `campaign-settings.tsx:191–193` adds
  `group_id` to the select).
- `workforce-list-view.tsx` (`:288–289`, `:448`, `:609`) — **WP2.6's file**; recorded here as a hand-off: its
  group-name map, `ouGroupIds` filter and grouped-view bucket read the legacy container; WP2.6's list on shared state
  replaces them with the selected group. Not edited by WP2.7 (stop condition 8 if it must be).
- Read-only count the operator may run (dev by the agent, read is free; production by the operator, optional; no
  writes, no `SET LOCAL`):
  ```sql
  -- legacy-shape rows: a non-container child whose ou_group_id names a plain (non-container) parent
  SELECT count(*) AS legacy_shape_rows
  FROM public.campaign_organising_units AS u
  JOIN public.campaign_organising_units AS p ON p.ou_id = u.ou_group_id
  WHERE u.ou_group_id IS NOT NULL AND NOT p.is_group_container;
  ```

**D45-b: normalise the rows** — an env-guarded script `UPDATE campaign_organising_units SET ou_group_id = NULL WHERE
<the predicate above>`, logged to `_oux_hygiene_log`, rehearsed on dev, run on production by run sheet. `group_id` is
unaffected (§2.4), so the only observable change is in the legacy readers. Not recommended: it is a production data
mutation for a column WP2.8 drops, and the readers still need the code change to be group-aware.

### 3.6 Groups panel (create, rename, reorder, delete — the `structure_group_*` RPCs get their first screen)

| Action | Control | Call | Notes |
|---|---|---|---|
| List | left column, display order (`orderGroups`), each row: kind label chip, name, unit count, Unassigned count (from `deriveGroupView`), selected state | read `campaign_groups` (`CAMPAIGN_GROUPS_QUERY_KEY`, same fetch as the chart), `campaign_organising_units`, `campaign_worker_ou`, membership | the empty structure ("No groups yet. Add a group to start slicing the membership.") reads as normal, not an error (decision 4) |
| Add group | "Add group" → dialog: kind (seven; existing fixed kinds disabled "already exists"), name (required for Custom; optional label for a fixed kind) | `groups.create({ kind, name })` → `{ group_id, created }` | on success select the new group; for a fixed kind whose auto-build source has data, the units panel shows the Build offer (§3.9) |
| Rename | ⋯ → Rename… (also for fixed kinds: label only) | `groups.update({ groupId, name })` | 23505 → "A group named … already exists." |
| Reorder | ⋯ → Move up / Move down (keyboard-accessible buttons; no drag) | `groups.reorder({ groupIds: <full order> })` | the chart's selector reads the same order |
| Delete | ⋯ → Delete… → confirm dialog with counts ("Delete **Shift** and its 3 units? 41 placements in those units are removed. People stay in the campaign.") | `groups.remove({ groupId, mode: units.length ? "cascade_units" : "empty_only" })` | a refusal (`rule_violation` still referenced / `forbidden`) toasts; A4 wording (§3.12) on a `duplicate_in_group` in this context |

Selecting a group writes `?group=<id>` (`groupParamValue`); the initial selection resolves `?group=` → prefs (read via
`useUserCampaignPrefs`, WP2.4's hook) → first group. "Not in any group" is not a group here (nothing to edit); the
editor's summary line links to the chart's Not in any group view.

### 3.7 Units panel (per selected group)

Rows are `unitsOfGroup(ous, groupId)` in the query's order; the last row is **Unassigned in <group>** (derived; count
+ "Move to unit…"; cannot be renamed, rated or deleted — plan `:291`).

| Row element / action | Control | Call | A5 policy / notes |
|---|---|---|---|
| Name | inline edit (Enter / blur) | `units.update({ ouId, patch: { name } })` | blank refused client-side with the D53 sentence |
| Estimate and share | number input + share % (§3.8) | `units.update({ patch: { total_workers_estimated } })` | D58 whole-number check client-side |
| Count | "N placed · M est." (from `workersByUnit`) | — | unfilled slots shown as in the chart's header |
| Rating 1–5 | the units-tab buttons (`:1266–1300` today) | `units.update({ patch: { user_rating } })` | unchanged |
| Reorder | ⋯ → Move up / Move down | `units.reorder({ ouIds: <the group's units in the new order> })` | the RPC numbers only the listed units; ordering across groups may interleave in the legacy chart (accepted in wp2.4.md §8.2) |
| Assign people… | ⋯ → dialog = `CampaignWorkerAssignmentPicker` (existing) | `placements.assign({ ouId, workerIds, source: "manual", isPrimary: single && ticked, onConflict: "error" })` | picked workers → **error**; `duplicate_in_group` → `duplicateInGroupMessage(err, "A worker is already in another unit of that group")` (D54); count from `inserted` |
| People (expand) | table of the unit's placements (`campaign-worker-ou` with `worker:workers(...)` as today `:303–320`), checkboxes | Remove from unit → `placements.unassign({ ouId, workerIds })`; Move to… (targets = other units of the group) → `placements.move({ workerIds, fromOuId, toOuId, keepInParent: false })` | D50 semantics; the `removed` count check as today |
| Unassigned row → Move to unit… | multi-select of the group's Unassigned members → target unit | `placements.move({ workerIds, fromOuId: null, toOuId, keepInParent: false })` | from Unassigned inserts `manual` rows (contract `:992`) |
| Edit details… | ⋯ → dialog: target size, commonality logic, anchor worker (today's dialog fields `:1905–2020` minus Type) | `units.update({ patch: { target_size, commonality_logic, anchor_worker_id } })` | whitelist keys only |
| Rules… | ⋯ → dialog = the assignment-rules builder moved verbatim (`RULE_DIMENSIONS` `:159–167`, `addRule` `:695`, `deleteRule` `:734`, chips `:1608–1640`) | `campaign_unit_rules` insert / delete (non-structure), then `recomputeOuAssignments` | unchanged behaviour |
| Split… | ⋯ → `SplitUnitDialog` (existing; `members` built as `:896` does today) | `units.split` | C-k siblings in the group |
| Merge… | ⋯ → `MergeUnitsDialog` (existing) with `ous` = the group's units | `units.merge` | disabled when alone in the group (as the v2 menu) |
| Delete… | ⋯ → `DeleteOrganisingUnitDialog` (existing) with `allOus` = all units incl. `group_id` (D45-a targets) | `units.remove({ ouId, reassignments, deleteChildren: false })` | **DC**: never deletes units of another group; the confirm says what stays; the reassignment target list is the same group first, then other groups (for the T2-a "move to another group" path) |
| Add unit | "Add unit" → dialog: name(s) (chips: several at once), estimate or share; for a custom group nothing else; for fixed kinds an optional basis picker (Worksite/Employer: pick from Who's in; Occupation: pick an occupation or grouping — the step-5 single-add lookups `:383–459` moved here) | `units.create({ units: [...] })` (one call, several elements) | fixed kinds: no `group_id` sent; custom: `group_id` pinned; `display_order` omitted (the RPC appends, D47) |
| Build units | "Build from Who's in" / "Build from members' <field>" (§3.9) | `units.create` (+ rules + Recompute, or + universe sync) | bulk → **skip** semantics and the counts reported |
| Header | Suggest from plan, Recompute rules (as today `:1136–1160`); "Suggested units" card (`:1040–1123`, accept/reject/customise unchanged, accept lands in the candidate's type's group); the coverage strip (`campaign_ou_coverage_summary`, `:1021–1050`) | unchanged calls | relocated, not removed |

Every mutation invalidates the same keys the Units tab and the chart share: `["campaign-ous", id]`,
`["campaign-worker-ou", id]`, `["campaign-groups", id]`, `["campaign-ou-coverage", id]`, `["campaign-members", id]`,
`["campaign-unit-rules", id]`, `["campaign-ou-candidates", id]`, plus `["campaign-wizard-scope", id]` when embedded
(§3.13). A `forbidden` on any action is a toast (the editor is also gated on `canWrite`: a viewer sees no controls).

### 3.8 Share-of-group sizing (SZ)

Plan `:290`: the estimate is "entered as a share of the group when the group is defined, stored as a number". Pure
module `lib/campaign/setup/share-of-group.ts`: `groupTotal({ memberCount, campaignEstimate })`,
`shareOf(estimate, total)`, `estimateFromShare(sharePct, total)` (rounded, `>= 0`, whole), `sumOfShares(units,
total)`. The units panel shows, per unit, the estimate **and** its share of the group total; editing either writes
the estimate (`units.update`). The group header shows "Σ estimates 120 of 130 (92 %)" and an over-100 % warning —
the step-5 per-dimension sum and "over" warning (`:610–640`, `:1080–1105`) relocated. The proportional re-estimate the
wizard did silently after step 5 (`campaign-wizard.tsx:865–919`) is **retired**: sizing is explicit.

- **SZ-a (recommended):** the group total is the campaign's **member count** when it is > 0 (the group is a partition
  of the membership; the count is the truth), else `campaigns.total_worker_estimate` (Who's in not yet synced — the
  instigation case, decision 4), else shares are shown as "—" and only numbers are entered.
- **SZ-b:** always `campaigns.total_worker_estimate` (today's base for the even split, `step-campaign-units.tsx:334–337`);
  stale once the sync runs.

### 3.9 Auto-build (AB)

Offered per group, from the group row and the empty state ("Occupation: 14 occupations found among 305 members —
build 14 units?"; plan `:325`). Pure planners in `lib/campaign/setup/build-units.ts` return the `units.create`
payload and the rules to add, given the existing units (so nothing is duplicated: a unit whose `unit_basis` already
carries the same id is skipped and counted).

| Group | Source read (paged with `fetchAllRows`, `lib/supabase/fetch-all-rows.ts:14–33`) | Units created | Placement mechanism |
|---|---|---|---|
| Worksite | `campaign_worksites` (non-sector-wide rows) + `worksites` names — the same reads as `step-campaign-units.tsx` toggles and `campaign-universe-section.tsx:125` | one `worksite` unit per worksite without one (`unit_basis { worksite_id }`), share = even split of the group total (SZ), editable after | `syncCampaignUniverseFromEmployersWorksites(supabase, campaignId)` — the WP2.2 row-15 writer (`universe` rows, `onConflict: "skip"`, honours the Cursor match mode); the result is announced with WP2.4's `sync-notice-message.ts` sentence ("N workers added, M placed, K already placed") |
| Employer | `campaign_employers` + `employers` names | one `employer` unit per employer (`unit_basis { employer_id }`) | same sync call |
| Occupation | members' `workers.canonical_occupation_id` (+ `occupations`, `occupation_groups`), choice "by occupation" / "by occupation grouping" | `job_type` units with `unit_basis { canonical_occupation_id }` / `{ occupation_group_id }` | **AB-a**: one include rule per unit (`dimension_type: "occupation"`, `operator: "equals"`, `value_text: canonical name` — the engine matches names and aliases, `recompute-ou-assignments.ts:146–153`; grouping → `occupation_grouping`) then `recomputeOuAssignments` (ONE `replaceRuleRows`, R1) |
| Shift / Crew / Work area | members' `shift_id` / `roster_panel_id` / `work_area_id` + `worker_shift_options` / `worker_roster_panel_options` / `worker_work_area_options` names | `shift` / `crew_rotation` / `work_area` units with `unit_basis { shift_id \| roster_panel_id \| work_area_id }` | **AB-a**: one include rule per unit with `value_int = option id` (the typed form the engine prefers, `:128–133`, `:156–163`; note the builder's `RULE_DIMENSIONS` `:159–167` lacks `roster_panel` — the dialog gains "Crew / roster" for the Crew group) then Recompute |
| Custom | — | names typed (chips) | Assign people… / the chart |

- **AB-a (recommended):** field-based placement is **rules + Recompute** — `rule` provenance, re-runnable when
  workers' fields change ("Recompute rules" already exists), visible per unit in Rules…, and it is the mechanism the
  product already has; the Recompute RPC only replaces `rule` rows and skips a worker who holds a `manual`/`universe`
  unit in the group (C-a, contract `:1088`). Members whose field is empty stay Unassigned (the honest state).
- **AB-b:** one-off `assignments` in the same `units.create` call (`manual` provenance, `move` semantics within the
  new units' groups). Simpler, but the placement never updates and cannot be told from a hand placement.

"Build from Who's in" is disabled with a reason when the campaign is sector-wide (no worksite rows) or Who's in is
empty ("Add employers or worksites in Who's in first"). Both builds are bulk → skip semantics, counts reported.

### 3.10 Capability map — appendix B 6.3 / 6.4 / 4.2 → counterpart or documented retirement (the acceptance table)

| # | Capability today (appendix B ref; current lines) | In the editor | Status |
|---|---|---|---|
| 1 | Coverage card: total units, with contact, with activist, assigned distinct, multi-unit (6.3; `:1021–1050`) | coverage strip at the top of the editor, same view read | counterpart |
| 2 | "Suggested units" from WTP: accept / reject / customise (6.3; `:1040–1123`, `:448–516`) | same card, same calls; an accepted unit lands in its type's group | counterpart |
| 3 | Suggest from plan (6.3; `:1144–1152`) | header action | counterpart |
| 4 | Recompute rules (6.3; `:1153–1160`) | header action and inside Rules… | counterpart |
| 5 | **New group** = a container of same-type units via `CreateOrganisingUnitDialog` (6.3; `:1162–1168`, 6.4) | **Add group** (a `campaign_groups` row) + Add unit / Build units in it | **retired as a container flow; replaced by the group itself** (decision 5, plan `:294`) |
| 6 | Add unit: name, type, estimate, target size, commonality, anchor (6.3; `:1169–1171`, `:1905–2020`) | Add unit (name, estimate/share) in the selected group; Edit details… (target size, commonality, anchor). **No Type control** — the group is the type (T2-a) | counterpart; type selection relocated to "which group" |
| 7 | Edit unit (6.3; `:1336`) | inline name/estimate; Edit details… | counterpart |
| 8 | Merge units picker (≥ 2) (6.3; `:1173–1186`, `:2326`) | ⋯ → Merge… within the group (`MergeUnitsDialog`) | counterpart |
| 9 | Rating 1–5 (6.3; `:1266–1300`) | row rating | counterpart |
| 10 | Assign worker (picker + conflict dialog) (6.3; `:1362`, `:2044–2100`) | ⋯ → Assign people… | counterpart (A5: error) |
| 11 | Split into sub-units (6.3; `:1396`) | ⋯ → Split… (siblings in the group, C-k) | counterpart; "sub-unit" wording is the dialog's (WP2.8/WP4) |
| 12 | Assign workers (bulk) (6.3; `:1408`) | Assign people… (multi-select) | counterpart |
| 13 | Delete unit with reassignment targets (6.3; `:1415`; `ou-reassignment-targets.ts`) | ⋯ → Delete… (same dialog; targets by `group_id`, D45-a; DC) | counterpart |
| 14 | "Show sub-units" toggle (6.3; `:1327`) | — (no nesting; sub-units are units of their group) | **retired** (decision 5) |
| 15 | Worker table, checkboxes, Remove from unit, Reallocate to… (same type), per-row remove (6.3; `:1484`, `:1499`, `:1586`) | People (expand): Remove from unit, Move to… (units of the group) | counterpart |
| 16 | Assignment rules builder per unit (6.3; `:1608–1755`) | ⋯ → Rules… (moved verbatim; + Crew/roster dimension) | counterpart |
| 17 | Container message "This is an employer group — assign workers … within it" (6.3; `:1625–1628`) | — (containers are ordinary units of the Employer group and accept placements since C-e/M2) | **retired** |
| 18 | "Unallocated" pseudo-unit, select-all, Assign to unit… (6.3; `:1785–1889`) | **Unassigned in <group>** row, Move to unit… | counterpart, per group, plan wording |
| 19 | Create-unit dialog: single unit (6.4) | Add unit | counterpart |
| 20 | Create-unit dialog: group of units + members (6.4; `:604–848`) | Add group + Add unit (several names at once) | **retired as a container flow** (as 5) |
| 21 | Create-unit dialog: placement top / bottom / after (6.4; `:852–894`) | Move up / Move down on the row (`units.reorder`) | counterpart |
| 22 | Create-unit dialog: workers per new unit (6.4; `:896–993`) | Assign people… after creation; Build units places automatically | counterpart |
| 23 | Wizard step 5: "Build from scope" toggles, even estimate split (4.2; `:296–380`) | Build from Who's in (Worksite / Employer groups), share-based sizing | counterpart |
| 24 | Wizard step 5: Add a single unit — occupational grouping / occupation / custom (4.2; `:383–459`) | Add unit in Occupation (basis picker) / custom group; Build from occupations | counterpart |
| 25 | Wizard step 5: "Add a group of units" 4-phase container flow (4.2; `:463–557`) | Add group + Add unit | **retired as a container flow** (as 5) |
| 26 | Wizard step 5: "Sub" (legacy sub-unit) (4.2; `:590–608`) | ⋯ → Split… | **retired**; Split covers it (plan `:294`) |
| 27 | Wizard step 5: inline group allocation panel (4.2; `:1467–1560`) | Assign people… per unit | counterpart |
| 28 | Wizard step 5: dimension sums, over-total warnings, synthetic Unallocated row (4.2; `:610–640`, `:1080–1105`, `:1162–1176`) | group total, Σ shares, over-100 % warning; the Unassigned row | counterpart |
| 29 | Wizard step 5 → in-memory auto-allocation and proportional re-estimate (`campaign-wizard.tsx:828–919`) | Build from Who's in runs the universe sync (placements persisted, `universe` provenance); sizing explicit | counterpart (mechanism changed: persisted, visible) |
| 30 | Settings "Campaign units" section (6.1) | the editor embedded (no Save button; every action saves) | counterpart; **the settings path cannot flatten groups because it no longer has its own save path** (it had stopped flattening at D45/D56) |
| 31 | Settings "Allocate workers" and wizard step 6 (6.1 / 4.5) | unchanged grid; D72-a save (§3.11) | kept (§1.5) |

### 3.11 The allocation saves — D72 (membership rewritten before a refused placement save)

**D72-a (recommended): code-side ordered diff, no migration.** New `saveMembershipAndPlacements(client, campaignId,
ouIds, desiredMemberIds, desiredPlacements)` in `lib/campaign/structure-save.ts`, replacing the delete-all /
re-insert at `campaign-wizard.tsx:970–976` and `campaign-settings.tsx:534–546`:

1. read the current membership (paged, `campaign_worker_membership … order worker_id … range`) →
   `planMembershipSave(current, desired)` = `{ add, remove }` (pure);
2. **insert** `add` (chunked; non-structure table; a refusal leaves nothing changed);
3. `savePlacements(...)` as today (unassign then assign, D43) — `desired` never names a worker in `remove` (the grid
   has no rows for them), so their placements are unassigned here;
4. **delete** `remove` last.

Every intermediate state is valid: no placement for a non-member (step 2 precedes 3; `structure__worker_ids`'s
membership check, 2.2a `:358`), no lost rows the grid keeps (kept memberships keep `created_at`; kept placements keep
id, primary and provenance), and a refusal at step 3 leaves new members as Unassigned, at step 4 leaves removed
workers as members without placements — both visible in the chart and retried by the next save. The toast reports
`{ membersAdded, membersRemoved, inserted, removed, skipped }`. The wizard's `stampEmployerWorksiteFromOu` /
`syncWorkersToMatchingCampaigns` after-save calls are unchanged. Tests: node (fake client: order pinned; refusal at
each step leaves the described state; empty diff issues no membership write but still the D41-style empty placement
call is **not** needed here — a refused save is surfaced by the placement RPC when there is one, and by the membership
insert/delete errors otherwise; a fully empty diff toasts "Nothing to save") and the mounted `campaign-save-flows` suite.

**D72-b:** a membership-aware RPC `structure_membership_replace(p_campaign_id, p_worker_ids, p_placements jsonb)` in
one transaction (migration 2.7b, wrapper method, contract tests, full gate). Atomic, but it moves `campaign_worker_membership`
— not a structure table — behind the structure API and needs a migration for a save that D72-a makes safe without one.

### 3.12 A3, A4, A5 (carried from WP2.2 via WP2.4 CA-a)

- **A3** — `create-organising-unit-dialog.tsx:454–457` (legacy chart only after this package): `onSuccess` gains a
  toast "N moved from another unit of the same group" when `created.moved + created.displaced > 0` (the RPC applies
  `p_assignments` with move semantics). The editor's Add unit has no workers step, and Assign people… reports
  `inserted` and refuses duplicates (`error`), so the editor cannot drop a count. Test: one mounted case on the dialog.
- **A4** — every delete-context toast in the editor (Delete unit, Delete group cascade) goes through
  `duplicateInGroupMessage(err, "A member's worker would be in two units of one group")` when `kind ===
  "duplicate_in_group"`, otherwise `structureErrorMessage`; the settings units-save toast the advisory named no longer
  exists (the section is the editor). Test: the toast sentence for a seeded 23505 on `structure_unit_delete` and on
  `structure_group_delete`.
- **A5** — applied per §3.1 principle 5 and the §3.7 table; pinned by the jsdom suite (`p_on_conflict` per action).

### 3.13 The per-surface switch (WZ, NU, DL)

| Surface | Change | Decision |
|---|---|---|
| Units tab | `[id]/page.tsx:51`, `:880` → `GroupsUnitsEditor`; `CoveragePanel` unchanged | — |
| **Wizard step 5** | **WZ-a (recommended):** step 5 renders `<GroupsUnitsEditor variant="wizard" />` with Back / Continue; **units and placements persist as they are made** (the campaign exists since step 1). Continue = `await queryClient.refetchQueries(["campaign-wizard-scope", campaignId])` (so step 6 hydrates the units and placements the editor made, exactly as edit mode hydrates today `:538–553`), `setStep(6)`. Removed: `saveUnitsMutation` `:789–963`, `units` / `pendingGroupAllocations` editing state, the in-memory auto-allocation and re-estimate, the D53 error line for step 5 (each editor action has its own), D59's step-5 reset. Step 6 pre-populates from the DB (universe rows from Build from Who's in; assignments made in the editor). **WZ-b:** keep `StepCampaignUnits` as step 5 and only replace the tab and settings — contradicts the specification ("replacing wizard step 5") and keeps the D45 shapes alive. | WZ |
| Settings "Campaign units" | the accordion body renders `<GroupsUnitsEditor variant="settings" />`; `saveUnitsMutation` `:509–529`, `units` state `:141` and `pendingGroupAllocations` removed; the "Allocate workers" grid's `units` prop comes from the scope query (`:191–213` + `group_id`), not from draft state; the section title becomes "Groups & units" | — |
| Settings "Allocate workers" / wizard step 6 | `saveMembershipAndPlacements` (§3.11); `group_id` on the grid's units (§3.5) | D72 |
| **v2 chart "New unit"** (`wall-chart-toolbar.tsx:286` → `setCreateUnitOpen`) | **NU-a (recommended):** `wall-chart/v2/wall-chart-dialogs-v2.tsx:221–235` mounts the editor's `AddUnitDialog` (group preselected = the chart's current group; "Not in any group" → the dialog asks for a group) instead of `CreateOrganisingUnitDialog`; `onCreated` focus behaviour kept. The toolbar and the unit manager are not edited. **NU-b:** keep the legacy 4-step dialog on the v2 chart until WP2.8. | NU |
| Legacy chart | untouched (A3 aside) | — |
| **Deletions (DL)** | **DL-a (recommended):** delete `campaign-units-section.tsx` (2,401), `step-campaign-units.tsx` (1,704), the units half of `structure-save.ts` (`planUnitsBulkSave`, `applyUnitsSaveResult`, `validateUnitsSavePlan`, `saveUnitDrafts`, `UnitDraftInput`, `EXISTING_UNIT_COLUMNS`) and their tests, in the same commit as the last caller (Stage 3), with every pinned behaviour re-pinned in the editor's suite (§4.3 mapping table) so the reviewer can see nothing was lost. `savePlacements`, `planPlacementsSave` stay (D72-a builds on them). **DL-b:** keep the files uncalled until WP2.8 (dead code, ~4,100 lines, and two test suites exercising nothing the product runs). | DL |

`CampaignUnitDraft` (`step-campaign-units.tsx:46–70`) is still the shape the wizard/settings hydrate for step 6's
grid; under DL-a it moves to `lib/campaign/setup/unit-draft.ts` (type only) or the grid's own prop type is used — the
implementer records which (deviation).

### 3.14 Query keys, invalidations, errors, telemetry, hints, guides

- Keys: the editor reuses the chart's keys so both stay in step (§3.7 list) and shares `CAMPAIGN_GROUPS_QUERY_KEY`.
- Errors: `structureErrorMessage` for toasts; dialogs render an inline `role="alert"` line and reset on close (D48
  precedent); `forbidden` is never silent.
- Telemetry: one event `campaign_structure_edited` `{ campaign_id, action, group_kind }` added to
  `lib/analytics/events.ts` (additive union; WP2.4's pattern `:158`). Optional; the reviewer may strike it.
- Hints: none added (the group-selector hint is WP2.4's).
- Guides: series B (B1–B3, `public/help-videos/manifest.json:233–330`) teaches the Units tab; routes are `/campaigns/*`
  (unchanged, `:284–286`), so the manifest test (`src/lib/hints/__tests__/help-manifest.test.ts`) is unaffected; the
  screen changed, so the WP2.9 re-recording row in `PROGRESS.md` human tasks gains "B2/B3 now show the Groups & units
  editor" (ledger edit by the orchestrator, not code).

### 3.15 File boundaries with WP2.5, WP2.6, WP2.4b and WP2.8 (so they can run in parallel)

| Package | Owns (may edit) | WP2.7 touches? |
|---|---|---|
| **WP2.7** | `components/campaigns/setup/**` (new editor), `lib/campaign/setup/**` (new pure helpers), `campaign-units-section.tsx` (deleted), `step-campaign-units.tsx` (deleted), `campaign-wizard.tsx` (step 5 / step 6 save), `campaign-settings.tsx` (units section / allocation save), `step-allocate-workers.tsx` (`group_id` hint), `lib/campaign/structure-save.ts`, `lib/campaign/ou-reassignment-targets.ts`, `create-organising-unit-dialog.tsx` (A3 only), `[id]/page.tsx:51,880` (mount), `lib/campaign-tabs.ts:256` (label), `wall-chart/v2/wall-chart-dialogs-v2.tsx:221–235` (NU-a), the fixtures/tests named in §4, `tests/e2e/roles/unit-lifecycle.ts`, `tests/e2e/structure-api.spec.ts` items 4–6, `wocs-panel.tsx:245` and `campaign-universe-section.tsx:405` (copy) | — |
| **WP2.5** Compare | `wall-chart/compare/**`, the toolbar's `compareSlot`, prefs key `compare`, the band's matrix mode | no overlap; WP2.7 does not edit `wall-chart-toolbar.tsx` |
| **WP2.6** List | `workforce/workforce-list-view.tsx`, `workforce-bulk-toolbar.tsx`, `lib/campaign/workforce-view.ts`, the `ViewToggle` in `workforce-board.tsx`, prefs key `layout` | no overlap; the `ou_group_id` readers in the list view are WP2.6's (§3.5 hand-off) |
| **WP2.4b** mirror | `lib/workers/sync-campaign-universe.ts`, new `reconcile-placements.ts`, `move-worker-mutation.ts:136–146` | WP2.7 **calls** `syncCampaignUniverseFromEmployersWorksites` and `syncNoticeMessage` but edits neither file |
| **WP2.8** | deletes the legacy chart, dialogs, `create-organising-unit-dialog.tsx`, the flag; retires the columns and trigger; makes charts and the activists panels group-aware | WP2.7 leaves `create-organising-unit-dialog.tsx` in place (legacy chart) |

Shared files WP2.7 edits that another package might also touch: `[id]/page.tsx` (two lines), `lib/analytics/events.ts`
(additive union) — merged around; `wall-chart/v2/wall-chart-dialogs-v2.tsx` (WP2.4's, merged; no parallel owner).
WP2.7 branches from `main` at or after `7e8a3fab`; if WP2.5 or WP2.6 merges first, the branch merges `main` in
(never rebases) and re-runs the suites (stop condition 8 if a §3.15 file moved under it).

### 3.16 Performance and realistic data (RD)

The editor renders one group's units as rows (no tiles); the 161-unit campaign's largest group is 143 worksite units
(appendix G; `LARGE_GROUPS` in the harness fixture `:190`). A jsdom render-cost case mounts the editor on the `large`
fixture and asserts it renders within the v2 chart's absolute budget (6 s in the same run, wp2.4.md D23) and issues no
more queries than the Units tab today (nine keys; §2.1). **RD-a (recommended):** the realistic data set is not used —
the fixture is the same scale; **RD-b:** additionally run the §3.5 count query read-only on the realistic data set
(read is free) to report how many legacy-shape rows a production-shaped copy holds.

---

## 4. Tests

### 4.1 Unit tests (vitest, node, no DB) — run in `pnpm test`

- `lib/campaign/setup/__tests__/group-kinds.test.ts` — kind ↔ `ou_type` both ways; `canAddGroup` greys existing fixed
  kinds and never a custom one; labels equal `campaign_group_kind_for_ou_type`'s.
- `share-of-group.test.ts` — SZ-a base precedence; rounding; over-100 %; the "—" state.
- `build-units.test.ts` — `planScopeUnits` (existing worksite/employer bases skipped and counted; sector-wide → empty
  with reason), `planFieldUnits` for shift / crew / work area (option ids, names, existing bases skipped),
  `planOccupationUnits` (occupation vs grouping), the rule rows each plan yields (dimension, `value_int` vs
  `value_text` per `recompute-ou-assignments.ts:128–163`), and that no plan element ever carries `is_group_container`,
  `parent_ou_id` or `ou_group_id`.
- `structure-save.test.ts` — `planMembershipSave`; `saveMembershipAndPlacements` order and refusal states with the
  fake client (add → unassign/assign → remove; a refusal at each step); the units-half tests are removed with the code
  (DL-a) — listed one by one in the deviations log with the editor case that now pins the same behaviour.
- `ou-reassignment-targets.test.ts` (new) — the D45-a rule per shape: plain unit (same group), sub-unit under a plain
  parent in both `ou_group_id` shapes (same group), Employer-container member (same container), custom unit (its
  group), containers never offered, T2-a "other groups" list when asked for.
- `structure-error-message.test.ts` — the A4 lead sentence (if not already covered).
- `no-direct-structure-writes.test.ts` — unchanged; must stay green (the editor's files are scanned).
- `lib/campaign/__tests__/campaign-surfaces.fixture.ts`, `campaign-tabs-full-mode.fixture.ts`, `workspace-tabs.test.ts`
  P4 — the LB-a label literal.

### 4.2 Contract tests (DB-backed) — none

No RPC or migration changes under T2-a / D72-a; the four `structure_group_*` RPCs already have cases (`:434–540`).
Under T2-b or D72-b, §3.4.3 / §3.11 list the cases; the run is Stage 2 on dev with the skipped count reported.

### 4.3 Interaction tests (jsdom, the wall-chart harness) — `components/campaigns/setup/__tests__/`

`groups-units-editor.structure-writes.test.tsx` — the editor mounted for real on the `small` fixture (groups 1–3,
units 10–13/20); every action pins the **exact** `rpcInvocations()` payload, the invalidations and the sentence:

| Action | Pinned |
|---|---|
| render | groups in display order; the selected group from `?group=`; the Unassigned row's count equals `deriveGroupView`'s; a viewer (`canWrite: false`) sees no write control; empty structure renders the normal empty state |
| Add group (custom "Language") | `structure_group_create { p_kind: "custom", p_name: "Language" }`; duplicate 23505 → "A group named … already exists." |
| Add group (fixed) | existing fixed kinds disabled; `p_kind: "shift"` with `p_name: null` |
| Rename / reorder / delete group | `structure_group_update { p_name }`; `structure_group_reorder { p_group_ids: [...] }`; `structure_group_delete { p_mode: "empty_only" }` for an empty group and `"cascade_units"` after the confirm with the counts in its text; A4 sentence on a seeded 23505 |
| Add unit, fixed group | `structure_units_create` element `{ name, ou_type: "worksite", unit_basis?, total_workers_estimated }` with **no** `group_id`, `is_group_container`, `parent_ou_id`, `ou_group_id`; several names → several elements in one call |
| Add unit, custom group | element with `ou_type: "custom"`, `group_id: <group>`, `unit_basis: { custom: true }` |
| Rename / estimate / share / rating / details | `structure_unit_update` patches `{ name }`, `{ total_workers_estimated }` (from a share edit: the rounded number), `{ user_rating }`, `{ target_size, commonality_logic, anchor_worker_id }`; blank name refused client-side, no RPC |
| Reorder units | `structure_unit_reorder { p_ou_ids: <group's ids only> }` |
| Assign people… | `structure_placements_assign { p_on_conflict: "error", p_source: "manual", p_is_primary }`; the D54 sentence on a seeded 23505 |
| People: remove / move | `structure_placements_unassign { p_ou_id }`; `structure_placements_move { p_from_ou_id, p_to_ou_id, p_keep_in_parent: false, p_within_group_id: null }`; targets limited to the group |
| Unassigned → Move to unit… | `structure_placements_move { p_from_ou_id: null, … }` |
| Delete unit | `structure_unit_delete { p_reassignments, p_delete_children: false }`; an Employer container's confirm says its worksite units stay (DC); reassignment targets from `getReassignmentTargetOus` |
| Rules… | `campaign_unit_rules` insert (via `writeInvocations()`), then `structure_placements_replace_rule_rows` (Recompute) |
| Build from Who's in | `structure_units_create` with one element per worksite not yet built, then the sync's `structure_placements_assign { p_source: "universe", p_on_conflict: "skip" }` calls, then the notice sentence |
| Build from members' shift | `structure_units_create` (shift units with `unit_basis { shift_id }`), rule inserts with `value_int`, then `replace_rule_rows`; skipped existing units counted in the toast |
| Suggested units accept | the `wtp_seeded` create then the `campaign_ou_candidates` update (moved from the units-section suite) |
| Refusals | a `42501` on any action → the permission sentence toast; no state change |
| No direct write | the harness's `DirectStructureWriteError` never thrown (the suite runs with writes disallowed) |

`campaign-save-flows.structure-writes.test.tsx` (updated): wizard step 5 mounts the editor and Continue issues no
structure RPC but refetches the scope and moves to step 6; step 6 and the settings allocation pin the D72-a order
(membership insert → unassign/assign → membership delete) and the refusal states; the settings units section mounts
the editor. `campaign-units-section.structure-writes.test.tsx` is removed with the component (DL-a) — its 16 pins are
listed against the editor cases above (deviations log).

`wall-chart-v2.interaction.test.tsx` (WP2.4's; one additive case): "New unit" opens the Add-unit dialog with the
current group preselected and creates through `structure_units_create` (NU-a). The control census is unchanged.

`create-organising-unit-dialog` (A3): one mounted case — a seeded `units.create` result with `moved: 1` toasts the
sentence.

### 4.4 Render cost

`groups-units-editor.render-cost.test.tsx` — the `large` fixture, the Worksite group (143 units) selected: renders
within 6 s absolute in the same run as the v2 chart's case, and issues no more than the Units tab's nine query keys.

### 4.5 e2e (Playwright; written and type-checked, unrun in the sandbox — wp2.2.md D80/D81)

- `tests/e2e/roles/unit-lifecycle.ts` `renameUnit` (`:209–240`): the Units tab now hosts the editor — the tab name
  (LB-a), the unit row's inline name field (`aria-label="Unit name"`), Enter to save; `deleteUnit` (wall-chart popover)
  unchanged. Both role specs (`unit-lifecycle-user.spec.ts:100–143`, `-admin.spec.ts:76`) keep their flow.
- `tests/e2e/structure-api.spec.ts` item 4 (`:655–700`): Merge… from the unit's ⋯ menu in the editor (dialog
  `MergeUnitsDialog`, "Merge duplicate units"); item 5 (`:702–748`): the settings section is the editor — create a unit
  (Add unit), rename inline, delete (⋯ → Delete…), each awaiting its own RPC response instead of one
  `structure_units_bulk_save`; item 6 (`:762–772`): the `user` account on the foreign campaign sees the editor with a
  refusal toast on Add unit (42501) and no "saved" sentence.
- New `tests/e2e/groups-editor.spec.ts`: add a custom group, add two units in it, assign a worker (error path on a
  second group placement), Build from Who's in on campaign 1 (units created only for worksites without one; idempotent
  re-run creates nothing), delete the group with cascade; cleanup through the structure API as `structure-api.spec.ts`
  does.
- **E2-a:** run from a credentialled shell against the branch preview; **E2-b (expected, precedent wp2.4.md §9.1):** the
  operator performs §4.6 by hand on the branch preview; the orchestrator records the result in §9.2.

### 4.6 Operator hand-test checklist (acceptance, E2-b) — to be copied to `wp/wp2.7-acceptance-checklist.md` at Stage 3 with the preview URL

Preview: the branch's Vercel preview (dev data; nothing touches production). Two accounts: the **e2e user** (`user`
role, writes to campaign 1) and the **dev admin** (any campaign). "The editor" = Campaigns → open a campaign → Setup
(organiser mode) or Workforce (full mode) → **Units**. Each step ends with the sentence you should be able to say is
true; if not, note what you saw and carry on.

**Step 1 — the editor replaces the Units tab (campaign 1, e2e user)**
1. Open **Units**. *Expected: a Groups list on the left (Employer, Worksite, … in order) and the selected group's units
   on the right, ending with **Unassigned in <group>**; the address bar carries `group=<id>`; no "Campaign Units" label,
   no "New group" / "Add unit (type)" controls; a coverage strip at the top; "Suggested units" if the campaign has WTP
   candidates.*
2. Click another group. *Expected: its units and its own Unassigned row; the address updates; opening the wall chart
   (Workforce → Wall chart, `groups_v2` on) shows the same group selected.*

**Step 2 — groups**
1. **Add group** → kind **Custom**, name "Language" → Add. *Expected: "Language" appears last in the list and is
   selected; the units panel is empty with "Add unit" and no Build offer.*
2. Add group → kind **Shift** (if the campaign has none). *Expected: "Shift" appears; kinds already present are greyed
   "already exists".*
3. ⋯ on "Language" → Rename → "Languages". *Expected: renamed in place; the chart's Group selector shows "Languages".*
4. ⋯ → Move up / Move down. *Expected: the order changes and survives a reload.*
5. Add group → Custom, name "Languages" again. *Expected: "A group named Languages already exists." and no new group.*

**Step 3 — units in a custom group**
1. In "Languages": **Add unit** → names "Tagalog, Bahasa" → Add. *Expected: two units appear; the chart's band for
   Languages shows two empty cards plus Unassigned.*
2. Rename "Bahasa" inline → "Bahasa Indonesia". Set the estimate of "Tagalog" to a number; then change its **share**
   to 50 %. *Expected: the estimate becomes half the group total shown in the header ("Σ estimates … of …").*
3. ⋯ on Tagalog → **Assign people…** → pick two members → Assign. *Expected: "2 assigned"; the unit's count reads
   "2 placed"; the People table lists them.*
4. ⋯ on Bahasa Indonesia → Assign people… → pick one of the same two. *Expected: refused — "A worker is already in
   another unit of that group — Worker … already has a placement in group …"; nothing changed.*
5. In Tagalog's People table tick one worker → **Move to…** → Bahasa Indonesia. *Expected: the worker moves; counts
   update; the chart agrees.*
6. On the **Unassigned in Languages** row → Move to unit… → pick one member → Tagalog. *Expected: placed.*
7. ⋯ on Bahasa Indonesia → **Delete…** → choose "Move everyone to Tagalog" → Delete. *Expected: the unit is gone and
   its worker is in Tagalog.*

**Step 4 — build from Who's in and from a worker field (dev admin, a campaign with employers/worksites in Who's in)**
1. Select **Worksite** → **Build from Who's in**. *Expected: "N units created, M already existed", then the sync
   notice ("… placed in units …"); one unit per worksite of Who's in; re-clicking creates 0.*
2. Select **Employer** → Build from Who's in. *Expected: one unit per employer; members placed by the sync.*
3. Select **Shift** (add it if needed) → **Build from members' shifts** (if the campaign's workers have shifts;
   otherwise the button says "No shifts recorded on this campaign's members" — record that). *Expected: one unit per
   shift found; ⋯ → Rules… on one shows an Include rule "Shift: <name>"; members with that shift are placed; those
   without stay Unassigned.*

**Step 5 — the wizard and settings paths**
1. Campaigns → New campaign → complete steps 1–4 for a test campaign → step 5. *Expected: step 5 **is** the editor
   (same panels); units you add are saved immediately (reload the page: still there); Continue goes to step 6 with the
   grid pre-populated from what the editor placed.*
2. On that campaign: **All settings** → "Groups & units". *Expected: the editor, no "Save campaign units" button.*
3. Settings → "Allocate workers": untick one member, add another member to a unit, Save. *Expected: "Worker
   allocation saved. 1 member added, 1 removed" (counts as applicable); other placements unchanged (check the chart).*
4. Delete the test campaign.

**Step 6 — the v2 chart's New unit, and the legacy chart (e2e user)**
1. Wall chart (`groups_v2` on) → **Units (n)** → **New unit**. *Expected: the editor's Add-unit dialog with the current
   group preselected; a created unit appears in the band.*
2. Dev admin: untick `Groups v2` for the e2e user; e2e user reloads the wall chart. *Expected: the legacy chart exactly
   as before; its Units popover's "New unit" opens the legacy 4-step dialog; the Units tab still shows the new
   editor.*
3. Clean up: delete "Languages" (⋯ → Delete… → confirm "Delete Languages and its 1 unit? …") and "Shift" if you
   created it.

**What to send back:** pass / what you saw per numbered item, the campaign ids, and for step 4.3 whether shifts existed.

---

## 5. Verification commands (exact; run from repo root unless stated)

```bash
# static
pnpm --filter organising-db exec tsc --noEmit -p tsconfig.json
pnpm --filter organising-db lint          # touched lines clean; total problems ≤ 295 (PROGRESS.md:45 baseline)
pnpm --filter organising-db test          # 1,563 baseline + this package's suites; no test skipped

# acceptance greps (each must exit 1 = no match, except where noted)
rg -n "CampaignUnitsSection|StepCampaignUnits|pendingGroupAllocations|saveUnitDrafts|planUnitsBulkSave" apps/organising-db/src            # DL-a
rg -n "ou_group_id" apps/organising-db/src/lib/campaign/ou-reassignment-targets.ts apps/organising-db/src/components/campaigns/step-allocate-workers.tsx | rg -v "container"   # D45-a (container narrowing may remain)
rg -n "is_group_container|parent_ou_id|ou_group_id" apps/organising-db/src/components/campaigns/setup apps/organising-db/src/lib/campaign/setup   # the editor never writes the legacy hierarchy (reads allowed only in the D45-a target rule) — reviewer inspects any hit
rg -n "localStorage|sessionStorage" apps/organising-db/src/components/campaigns/setup apps/organising-db/src/lib/campaign/setup
rg -n "\"Campaign Units\"" apps/organising-db/src apps/organising-db/tests   # LB-a
rg -n "Unallocated" apps/organising-db/src/components/campaigns/setup        # terminology
git diff --stat main -- supabase/ packages/db-types/ apps/organising-db/src/lib/campaign/structure-api.ts   # empty (no migration, no RPC change)

# guard + the package's suites
pnpm --filter organising-db test -- src/lib/campaign/__tests__/no-direct-structure-writes.test.ts src/lib/campaign/setup src/components/campaigns/setup src/components/campaigns/__tests__ src/lib/campaign/__tests__/structure-save.test.ts

# build
pnpm --filter organising-db build

# e2e against the branch preview (credentials from the operator's shell; never printed) — E2-a only
# E2E_BASE_URL=<branch preview> pnpm --filter organising-db e2e -- tests/e2e/groups-editor.spec.ts tests/e2e/structure-api.spec.ts tests/e2e/roles/unit-lifecycle-user.spec.ts
# sandboxed runner behind a TLS-intercepting proxy only (wp2.2.md D80): prepend E2E_IGNORE_HTTPS_ERRORS=1

# read-only count (dev, agent; production, operator, optional) — §3.5
# SELECT count(*) AS legacy_shape_rows FROM public.campaign_organising_units u JOIN public.campaign_organising_units p ON p.ou_id = u.ou_group_id WHERE u.ou_group_id IS NOT NULL AND NOT p.is_group_container;
```

---

## 6. Stages, commits, PR, promotion gate

### 6.1 Stages

| Stage | Content | Needs DB? |
|---|---|---|
| 0 | This plan approved (§9.1 answered); ledger row "planning → implementing"; branch cut (git commands put to the operator). | No |
| 1 | **Pure library and carried fixes, no UI:** `lib/campaign/setup/{group-kinds,share-of-group,build-units}.ts`; `structure-save.ts` D72-a (`planMembershipSave`, `saveMembershipAndPlacements`); D45-a in `ou-reassignment-targets.ts` and the `step-allocate-workers.tsx` hint (+ `group_id` from both hydrations); A3 in the legacy create dialog; all §4.1 tests and the two small mounted cases (A3; the grid hint). Static review checkpoint (fresh reviewer, Opus). | No |
| 2 | **The editor:** `components/campaigns/setup/groups-units-editor/**` (shell, groups panel, units panel, Add-group / Add-unit / Edit-details / Rules / Move-to dialogs, the relocated Suggested-units card and coverage strip), mounted on the Units tab; NU-a in `wall-chart-dialogs-v2.tsx` + the v2 case; LB-a label + fixtures; §4.3 suite and §4.4 render cost. Review checkpoint (fresh reviewer, **Fable** — the editor writes placements and reads worker data). | No |
| 3 | **The switch and the deletions:** wizard step 5 (WZ-a) and the settings section on the editor; step 6 / settings allocation on `saveMembershipAndPlacements`; delete `campaign-units-section.tsx`, `step-campaign-units.tsx`, the units half of `structure-save.ts` and their suites with the re-pin mapping (DL-a); e2e helper and specs updated + new spec written and type-checked; `wp/wp2.7-acceptance-checklist.md` from §4.6 with the preview URL; **operator acceptance (E2-b) on the branch preview**, recorded in §9.2. | Preview (dev) |
| 4 | Verifier output pasted (§9.2); fresh whole-package reviewer (Fable; max two fix rounds, §9.3); `PROGRESS.md` row (+ the WP2.9 guides note and the WP2.6 hand-off); PR marked ready. | — |

### 6.2 Commits

One commit per completed stage (Stage 0 plan + ledger, Stage 1, Stage 2, Stage 3, Stage 4 evidence), small and
descriptive, on `feat/oux-wp2.7-groups-units-editor`; the branch only ever merges `main` in. Every push and the PR
command are put to the operator first. `supabase/.temp/*` is never staged.

### 6.3 PR

Draft PR `feat/oux-wp2.7-groups-units-editor → main`, title `feat(oux-wp2.7): groups and units editor in Setup
(replaces wizard step 5, the settings units section, the Units tab and the create-unit dialog)`. Body: §3 summary, the
§3.10 capability table, the evidence matrix, the T2/D45/D72/FG/WZ/AB/SZ/DL/LB/NU decisions as approved, "no migration"
stated once, the WP2.6 hand-off (§3.5). Marked ready only after Stage 4.

### 6.4 Promotion gate

**Not applicable under the recommendation: no migration.** The merge deploys code that calls RPCs already on
production since 2026-09-15. `gen-types.yml`, the Supabase GitHub integration and run sheets are untouched. If T2-b or
D72-b is chosen, §3.4.4 is the gate, verbatim, and the ledger row says so before Stage 1.

---

## 7. Files

New:
- `apps/organising-db/src/components/campaigns/setup/groups-units-editor/`: `groups-units-editor.tsx` (shell,
  `variant: "tab" | "wizard" | "settings"`), `groups-panel.tsx`, `units-panel.tsx`, `unit-row.tsx`, `unassigned-row.tsx`,
  `add-group-dialog.tsx`, `add-unit-dialog.tsx` (also used by the v2 chart), `edit-unit-details-dialog.tsx`,
  `unit-rules-dialog.tsx` (moved builder), `move-to-unit-dialog.tsx`, `build-units-offer.tsx`, `suggested-units-card.tsx`
  (moved), `coverage-strip.tsx` (moved), `use-editor-data.ts` (the queries and invalidations), `__tests__/*` (§4.3, §4.4)
- `apps/organising-db/src/lib/campaign/setup/`: `group-kinds.ts`, `share-of-group.ts`, `build-units.ts`, `__tests__/*`
- `apps/organising-db/src/lib/campaign/__tests__/ou-reassignment-targets.test.ts`
- `apps/organising-db/tests/e2e/groups-editor.spec.ts`
- `docs/organiser-ux-review/wp/wp2.7-acceptance-checklist.md` (Stage 3, from §4.6)

Modified:
- `components/campaigns/campaign-wizard.tsx` — step 5 on the editor (WZ-a); step 6 save on `saveMembershipAndPlacements`;
  `group_id` in the scope hydration; the removed state and mutations.
- `components/campaigns/campaign-settings.tsx` — the units section on the editor; allocation save; `group_id` in
  the scope select; section title.
- `components/campaigns/step-allocate-workers.tsx` — `group_id` on the unit prop; the C-a conflict hint (D45-a).
- `lib/campaign/structure-save.ts` — D72-a additions; units half removed (DL-a).
- `lib/campaign/ou-reassignment-targets.ts` — D45-a rule.
- `components/campaigns/wall-chart/create-organising-unit-dialog.tsx` — A3 toast only.
- `components/campaigns/wall-chart/v2/wall-chart-dialogs-v2.tsx:221–235` — NU-a mount; `v2/__tests__/wall-chart-v2.interaction.test.tsx` — one case.
- `app/(dashboard)/campaigns/[id]/page.tsx:51`, `:880` — the mount.
- `lib/campaign-tabs.ts:256` — label (LB-a); `lib/campaign/__tests__/{campaign-surfaces,campaign-tabs-full-mode}.fixture.ts`, `workspace-tabs.test.ts` P4.
- `components/campaigns/activists/wocs-panel.tsx:245`, `components/campaigns/campaign-universe-section.tsx:405` — copy.
- `lib/analytics/events.ts` — one additive union member (optional).
- `components/campaigns/__tests__/campaign-save-flows.structure-writes.test.tsx`, `lib/campaign/__tests__/structure-save.test.ts`.
- `tests/e2e/roles/unit-lifecycle.ts`, `tests/e2e/structure-api.spec.ts` (items 4–6).
- `docs/organiser-ux-review/PROGRESS.md` — ledger row; WP2.9 note; WP2.6 hand-off; incidental findings if any.

Deleted (DL-a): `components/campaigns/campaign-units-section.tsx`, `components/campaigns/step-campaign-units.tsx`,
`components/campaigns/__tests__/campaign-units-section.structure-writes.test.tsx` (pins re-homed per §4.3).

Not modified: anything under `supabase/`; `packages/db-types/generated.ts`; `lib/campaign/structure-api.ts`;
`lib/campaign/groups/**`; `lib/hooks/useUserCampaignPrefs.ts`; `wall-chart/v2/**` beyond the one dialog mount and one
test case; `wall-chart-toolbar.tsx`; `wall-chart-unit-manager.tsx`; the legacy chart and its dialogs (A3 aside);
`workforce/**` (WP2.6); `lib/workers/sync-campaign-universe.ts` and `sync-notice-message.ts` (WP2.4b; called only);
`campaign-universe-section.tsx` beyond one copy string; `step-employers-worksites.tsx`; `universe-match-mode-control.tsx`;
any existing e2e spec other than the two named; the guides manifest.

---

## 8. Evidence matrix, risks, deviations, stop conditions

### 8.1 Acceptance-evidence matrix

| Criterion | Evidence |
|---|---|
| One editor in Setup replacing the four surfaces | §3.13 switch table ticked in the PR; `rg` greps in §5 (no `CampaignUnitsSection` / `StepCampaignUnits`); the mounted wizard/settings cases render the editor; checklist steps 1, 5, 6 |
| Every appendix B 6.3 capability has a counterpart or a documented retirement | §3.10 table (31 rows) in the PR; each counterpart row has a §4.3 case; the four retirements (rows 5/14/17/20/25/26 → containers, sub-unit toggle, container message, Sub) name their group-model replacement |
| The settings path can no longer flatten groups (B 6.1) | the settings section has no save path of its own (mounted case: no `structure_units_bulk_save` from settings); groups are `campaign_groups` rows edited only through `structure_group_*`; checklist step 5.2 |
| Share-of-group sizing | `share-of-group` tests; the §4.3 share → estimate case; checklist step 3.2 |
| Auto-build from universe and worker fields | `build-units` tests; the §4.3 Build cases (create payload, sync calls / rules + Recompute); checklist step 4 |
| Group create / rename / reorder / delete via the RPCs | §4.3 group cases; checklist step 2 |
| T2 decided | §9.1 answer; under T2-a the Delete dialog's cross-group targets case; under T2-b the contract cases and the gate record |
| D45 decided | §9.1; `ou-reassignment-targets.test.ts`; the grid hint case; the WP2.6 hand-off recorded in `PROGRESS.md` |
| D72 fixed | `structure-save.test.ts` order/refusal cases; mounted step-6 and settings cases; checklist step 5.3 |
| A3 / A4 / A5 | the dialog case; the two A4 toast cases; `p_on_conflict` pinned per action |
| No migration, no RPC change, guard green | `git diff --stat main -- supabase/ packages/db-types/ …structure-api.ts` empty; guard test in `pnpm test` |
| Full mode keeps working | legacy vitest suites unchanged and green (except the two deleted with their components, re-homed); legacy chart untouched; checklist step 6.2 |
| Terminology (plan 3.6) | `rg Unallocated` in the editor = 0; reviewer checklist item 5 |
| Role coverage (`user`) | the e2e user performs steps 1–3 and 6; item 6 of `structure-api.spec.ts` rewritten for the editor; the harness suite mounts with `role: "user"` |
| No localStorage, no new flag, no creation path, no materialised Unassigned | `rg` in §5; reviewer checklist |
| Render cost at 161 units | §4.4 output pasted in §9.2 |

### 8.2 Risks and mitigations

| Risk | Mitigation |
|---|---|
| The WP1.6 role-coverage e2e helper (`renameUnit`) and `structure-api.spec.ts` items 4–6 break the moment the Units tab changes | rewritten in Stage 3 against the editor's anchors (button names, dialog titles, `aria-label`s); type-checked; acceptance by hand (E2-b) covers the same flows |
| Deleting ~4,100 lines of legacy editor (DL-a) loses a behaviour nobody re-pinned | the deviations log carries a one-to-one mapping from every deleted test to the editor case that pins it; the reviewer checks the mapping (checklist item 7) |
| Wizard step 5 now persists immediately (WZ-a): an abandoned wizard leaves units and placements on a `planning` campaign | it already leaves the campaign, scope, agreements and estimate (each step writes, appendix B 2.1); the campaign is deletable from the list; WP3.1's `setup_complete` flag makes drafts visible |
| Build from Who's in triggers the universe sync (a writer; totals drift during hand tests) | the notice reports what changed; evidence rules stay "hazard counts, not totals" (`PROGRESS.md` standing notes); the button is explicit, never automatic |
| AB-a Recompute after a field build replaces every `rule` row of the campaign | R1: only `rule` rows; `manual` / `universe` survive (contract `:1088`); the builder's own Recompute button already does this today |
| An Employer-container delete detaches worksite children (DC) where the legacy dialog deleted them | the confirm names it; the legacy chart's dialog is unchanged; the RPC path is the contract-tested `p_delete_children = false` (`:677`) |
| A cross-group reassignment in Delete… (T2-a path) is refused by the legacy exclusivity trigger for Employer-container members (D17) | surfaced as `rule_violation` with the trigger's sentence; the D45-a rule keeps container members narrowed to their container so the refused targets are not offered |
| `?group=` written by both the chart and the editor | same param, same resolver, one writer per screen; the editor never writes the prefs document |
| Share edits round to whole numbers and can drift the Σ | the header shows the Σ and the warning; estimates are advisory (chart slots) |
| A custom-kind container's group deletion leaves the container row (2.2a comment `:1752`) | harmless (no group, unplaceable); WP2.8 retires; noted in the deviations log if the reviewer wants a count |
| Collision with WP2.6 on `workforce-list-view.tsx` `ou_group_id` readers | not edited here; hand-off row in `PROGRESS.md`; stop condition 8 |
| Collision with WP2.5/2.6 on `[id]/page.tsx`, `events.ts`, `wall-chart-dialogs-v2.tsx` | two-line edits; merge `main` in before Stage 3's commit and re-run |
| Lint creep from the new tree | touched lines clean; total ≤ 295 |
| The guides B2/B3 show a screen that no longer exists | human task already logged (WP2.9); the ledger note names the change |
| Render cost of a 143-row group | §4.4 case; rows carry no tiles; if it fails the budget, stop (§8.4 item 6) |

### 8.3 Deviations from plan (implementer keeps; numbering starts at D1)

_None yet._

### 8.4 Stop conditions (implementer stops and reports; no workaround)

1. Any change would be needed under `supabase/`, to `packages/db-types/generated.ts` or to `structure-api.ts`
   (under T2-a / D45-a / D72-a).
2. A capability in appendix B 6.3 / 6.4 / 4.2 turns out to have neither a counterpart nor a retirement listed in §3.10.
3. An editor action cannot be expressed as one existing RPC call, other than the documented composites (Build =
   create + sync / rules + Recompute; Delete-with-reassign).
4. Any existing vitest suite would need a change beyond the deletions and re-homings listed in §4.3 / §7, or any test
   would need to be skipped or weakened.
5. `structure_unit_update` or `structure_units_create` refuses a key the editor sends (whitelist drift).
6. The §4.4 render-cost case exceeds the budget.
7. Lint total would exceed 295 or `tsc` fails in an untouched file.
8. A §3.15 file owned by WP2.5 / WP2.6 / WP2.4b must be edited, or a shared file has changed on `main` since the branch
   was cut and the orchestrator has not said how to merge.
9. Anything would touch `gteygwfgjvczanmrwgbr`, or an e2e run would target it.
10. A third fix round would be needed.
11. The operator chose T2-b or D72-b and a migration file is about to be written before the ledger row records the gate.

---

## 9. Approval, verification output, review

### 9.1 Operator decisions and approvals

| # | Question | Options | Recommendation |
|---|---|---|---|
| **T2** | Unit type change on a saved unit (carried from `wp/wp2.2.md` §9.1) | **T2-a** keep fixed; "move to another group" = Add unit in the target group + Delete… with "move everyone" (two existing atomic RPCs); **T2-b** migration 2.7a widens `structure_unit_update` with `ou_type` (+ custom `group_id`), C-a displacement before the cascade, scope-basis refusal; rollback `92`; full gate (§3.4.4) | **T2-a** — no migration; no need reported; the group model has no "type" to edit |
| **D45** | Legacy `ou_group_id` shapes (wp2.2.md D45 / §11.12) | **D45-a** readers switch to `group_id` (`ou-reassignment-targets.ts`, the step-6 hint); rows untouched; optional read-only count; the list view's readers handed to WP2.6; **D45-b** normalise the rows by run sheet | **D45-a** |
| **D72** | Membership rewritten before a refused placement save (wp2.2.md D72) | **D72-a** ordered diff: add members → placements diff → remove members; every intermediate state valid; **D72-b** membership-aware RPC (migration 2.7b + gate) | **D72-a** |
| **FG** | Flag gating | **FG-a** none — the editor replaces the four surfaces for everyone; **FG-b** behind `groups_v2` with the legacy surfaces kept | **FG-a** |
| **WZ** | Wizard step 5 | **WZ-a** embed the editor; units persist as made; Continue refetches and moves to step 6; **WZ-b** keep the draft-list step | **WZ-a** |
| **AB** | Auto-build placement for Shift / Crew / Occupation / Work area | **AB-a** rules + Recompute (`rule` provenance, re-runnable); **AB-b** one-off `manual` assignments | **AB-a** (Worksite / Employer always via the universe sync) |
| **SZ** | Share-of-group base | **SZ-a** member count, else the campaign estimate, else numbers only; **SZ-b** always the campaign estimate | **SZ-a** |
| **DL** | Legacy editor files and the units half of `structure-save.ts` | **DL-a** delete now with the re-pin mapping; **DL-b** keep until WP2.8 | **DL-a** |
| **LB** | Full-mode sub label | **LB-a** "Units" (fixtures, e2e selectors, two copy strings updated); **LB-b** keep "Campaign Units" | **LB-a** |
| **NU** | v2 chart "New unit" | **NU-a** the editor's Add-unit dialog (group preselected); **NU-b** keep the legacy dialog on v2 | **NU-a** |
| **RD** | Realistic data set | **RD-a** not used; **RD-b** run the §3.5 count read-only there | **RD-a** |
| **E2** | Acceptance | **E2-a** Playwright from a credentialled shell; **E2-b** the operator by hand from §4.6 | write the specs; **E2-b** expected |
| — | Confirm D45's two facts from wp2.2.md D45 (`:881`): (i) `ou_group_id` means container membership only; (ii) the settings page saves drafted groups as groups (already true since Stage 5; moot under DL-a) | — | confirm |

Approvals required, in order:

1. Answer T2, D45, D72, FG, WZ, AB, SZ, DL, LB, NU, RD, E2 (a silent acceptance of the recommendations is fine, as
   for T / C-k in WP2.2).
2. Approve `git checkout -b feat/oux-wp2.7-groups-units-editor main`, the Stage-0 commit of this plan and the ledger
   row, `git push -u origin feat/oux-wp2.7-groups-units-editor`, and opening the draft PR.
3. Approve each stage commit and push individually.
4. Confirm the agent may run the §3.5 read-only count on normal dev (read is free; confirmation requested because
   the query is new).
5. E2-b: perform §4.6 on the branch preview when Stage 3 is ready and report; the orchestrator records the result in §9.2.
6. Only if T2-b or D72-b: approve `npx supabase migration new …`, the dev apply per file, and the production run sheet
   step by step (§3.4.4).

**Orchestrator approval:** _pending (Revision 1)._

### 9.2 Verification output (verifier pastes raw output)

_pending._

### 9.3 Reviewer findings and resolution

_pending._

---

## 10. Revision history

- **Revision 1** (2026-09-15): initial plan against `main` at `7e8a3fab`. Recommends T2-a (type fixed; no migration),
  D45-a (readers on `group_id`; list view handed to WP2.6), D72-a (ordered membership diff; no migration), FG-a (no
  flag), WZ-a (wizard step 5 embeds the editor), AB-a (rules + Recompute for field builds; universe sync for Who's in),
  SZ-a (member count as the share base), DL-a (delete the legacy editors now, re-pin their tests), LB-a ("Units"),
  NU-a (v2 New unit → the editor's dialog), RD-a, E2-b. One editor under `components/campaigns/setup/`, pure helpers
  under `lib/campaign/setup/`, every write an existing structure RPC, the `structure_group_*` RPCs' first screen, the
  A3/A4/A5 dispositions, the 31-row capability map as the acceptance table, a hand-test checklist as the acceptance
  vehicle, and the conditional migration 2.7a with its rollback and gate sequence should T2-b be chosen.
