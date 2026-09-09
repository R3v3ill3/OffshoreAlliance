# Progress ledger — Organiser UX plan

Orchestration of `docs/ORGANISER_UX_REVIEW_AND_PLAN.md` (7 September 2026). One row per work package. Decisions are in `DECISIONS.md`; per-package plans, verification output and reviewer findings are in `wp/<wp-id>.md`.

Status key: **not started** · **blocked (decision n)** · **planning** · **implementing** · **verifying** · **in review** · **PR draft** · **PR ready** · **merged** · **handed over** (operator runs it).

## Standing notes

- **Types:** the root `gen:types` script defaults to the production project. Always run `SUPABASE_PROJECT_REF=dpnnmkhabysfdogllsyh pnpm gen:types`. Never run it without the variable.
- **Migrations:** the ledger was rebased on 2026-09-08 into three baseline files under `supabase/migrations/`. Every migration file the appendices cite (`0002_rls_policies.sql`, `0013_campaign_workflow.sql`, `20260608100000_ou_group_integrity.sql`, …) now lives in `supabase/migrations_legacy/` and is audit-only. The live definitions are in `20260908050000_baseline_schema.sql`; implementers must read the baseline, not the legacy file, when changing a policy, trigger or view.
- **Plan documents:** the plan and appendices were authored on branch `claude/organiser-ux-campaign-workflow-bi0uai` and were not on `develop`. WP0.1 merges them into its branch so later packages can cite them.
- **Commands:** from `apps/organising-db`: `pnpm lint`, `pnpm test`, `pnpm build`. Root: `pnpm validate:migrations`.
- **Branches:** `feat/oux-<wp-id>-<slug>` off `develop`; draft PR into `develop`; never `main`.
- **Baseline (develop at 1b959b1, measured 2026-09-08):** `pnpm build` green; `pnpm test` 632 passing, 1 test file fails to load (`src/lib/sms/__tests__/rating-source-taxonomy.test.ts` reads a migration the baseline rebase moved to `migrations_legacy/`; a stale path, fixed in WP0.2); `pnpm lint` 143 errors / 151 warnings, all pre-existing. Per-package standard until the debt is cleared: every touched file lints clean on its changed lines and the total error count must not rise. Clearing the debt is a housekeeping task for the operator to authorise, not part of any work package.
- **Local environment:** `apps/organising-db/.env.local` points at the **production** project. No agent may run the app locally (`pnpm dev`, `pnpm start`) or take screenshots until the operator supplies a dev-pointed environment; `pnpm build` alone is permitted (it does not query the database; every route is dynamic). Screenshot acceptance evidence is deferred until then and PRs stay draft.
- **Previews and e2e (2026-09-08):** every `feat/oux-*` branch gets a Vercel Preview deployment backed by dev; agents run `pnpm e2e` with `E2E_BASE_URL` set to the branch preview and the operator-supplied `E2E_USER_*` variables sourced from the shell profile (never printed, never stored in the repo). Flow one passed against the WP0.4 preview (tip of the phase-0 stack) on 2026-09-08 with the `user`-role account. Dev data change for that run, reversible: campaign 1 (`organiser_id` 4 → 10) so the e2e account owns one active campaign with 95 members and 4 units.

## Ledger

| WP | Title | Status | Branch | PR | Verification | Open risks | Decisions consumed |
|---|---|---|---|---|---|---|---|
| 0.1 | Decision register and branch setup | merged | `feat/oux-wp0.1-decision-register` | [#22](https://github.com/R3v3ill3/OffshoreAlliance/pull/22) | docs only | — | 1–10 recorded |
| 0.2 | Instrumentation and test harness | merged | `feat/oux-wp0.2-instrumentation-e2e` | [#25](https://github.com/R3v3ill3/OffshoreAlliance/pull/25) | lint at baseline (143/151); 732 tests pass (taxonomy test repaired and re-bounded); tsc, build green; `pnpm e2e` skips cleanly without credentials on cached Chromium 1194 | Flow one PASSED on the dev preview 2026-09-08 with the `user` account; events not observed in PostHog (no dev project, deferred) | — |
| 0.3 | Defaults, copy and layout quick wins | merged | `feat/oux-wp0.3-defaults-copy-layout` | [#24](https://github.com/R3v3ill3/OffshoreAlliance/pull/24) | lint at baseline (143/151), 657 tests pass + 1 pre-existing collection failure (WP0.2), build green; screenshots captured on the dev preview 2026-09-08 (wp0.3.md §7) | DataTable card view now fires on phones/iPads; needs visual check | — |
| 0.4 | Data hygiene scripts | merged; handed over to operator to run | `feat/oux-wp0.4-data-hygiene` | [#26](https://github.com/R3v3ill3/OffshoreAlliance/pull/26) | Two full dev rehearsals (02: 5 inserted, 03: 2 deleted, 01: 5 converted; every rollback restored dev field-for-field; `pnpm validate:migrations` green); production-scale counts await the dev re-seed | Script 01 held until WP1.6 is on production; run order 00 → 02 → 03 → 01; three submissions per script | 2, 8 |
| 0.5 | Usability baseline pack | merged | `feat/oux-wp0.5-usability-baseline-pack` | [#23](https://github.com/R3v3ill3/OffshoreAlliance/pull/23) | docs only: lint unchanged | — | — |
| 1.1 | Module registry and workspace mode | PR draft | `feat/oux-wp1.1-workspace-mode` | [#27](https://github.com/R3v3ill3/OffshoreAlliance/pull/27) | migration `20260909100000_workspace_mode.sql` applied to dev, types regenerated; 780 tests, tsc, build green, lint at baseline; role probe: `user` reads defaults, sees 0 app_settings rows | Two admin-editor advisories deferred; nothing consumes the hook yet (WP1.2/1.4) | 1 |
| 1.2 | Navigation driven by modules | PR draft | `feat/oux-wp1.2-nav-modules` | [#30](https://github.com/R3v3ill3/OffshoreAlliance/pull/30) | 884 tests incl. nine nav-model snapshots, a full-mode literal and a falsifiable reachability suite; full e2e suite green on preview incl. the organiser round trip; screenshots in evidence/wp1.2 | Full-mode sidebar flashes for organisers while the profile loads (WP1.1 fail-open; recorded) | 1 |
| 1.3 | My campaigns home | not started | | | | | |
| 1.4 | Campaign workspace | not started | | | | | |
| 1.5 | Actions hub | PR draft | `feat/oux-wp1.5-actions-hub` | [#28](https://github.com/R3v3ill3/OffshoreAlliance/pull/28) | 828 tests, tsc, build green, lint at baseline; credentialled e2e on the branch preview: hub spec, `/sms` redirect and flow one pass | Sidebar still labels the hub "SMS Tools" until WP1.2; moderation count capped by PostgREST max-rows at very high relay volumes | 10 |
| 1.6 | Auth and RLS alignment | PR draft | `feat/oux-wp1.6-auth-rls` | [#29](https://github.com/R3v3ill3/OffshoreAlliance/pull/29) | Migrations `20260909120000` and `20260909130000` on dev; 41-line role probe pack (user, viewer, self-escalation, service role); full e2e both projects green ×2 on preview; 852 tests, tsc, build, lint at baseline | Behaviour changes signed off (unit writes only on own campaigns; no auto-enrol into unwritable campaigns); production pre-flight must return zero rows before deploy and again before hygiene 01; auth start-up deadlock fixed here (scope addition) | 2, 8 |
| 1.7 | Guides and hints | not started | | | | | 9 |
| 2.1 | Schema and migration | not started | | | | | 3, 4, 5 |
| 2.2 | Structure API | not started | | | | | |
| 2.3 | Wall chart decomposition | not started | | | | | |
| 2.4 | Group selector and per-group Unassigned | not started | | | | | |
| 2.5 | Compare matrix | not started | | | | | |
| 2.6 | List view on shared state | not started | | | | | |
| 2.7 | Groups and units editor | not started | | | | | |
| 2.8 | Consumers, retirements and flag removal | not started | | | | | |
| 2.9 | Guides (series B and C) | not started | | | | | 9 |
| 3.1 | Three-screen create flow | not started | | | | | 6, 7 |
| 3.2 | Setup checklist drawer | not started | | | | | |
| 3.3 | Strategic plan module | not started | | | | | |
| 3.4 | Demote creation paths (decision 7) | not started | | | | | 7 |
| 3.5 | Action containers | not started | | | | | 10 |
| 3.6 | Link to campaign | not started | | | | | 10 |
| 3.7 | Guides (A4, A5) | not started | | | | | 9 |
| 4.1 | Touch and mobile | not started | | | | | |
| 4.2 | SOC-grain fields | not started | | | | | |
| 4.3 | Post-study and metrics | not started | | | | | |

## Phase exits

| Phase | Exit criteria | Evidence | Date |
|---|---|---|---|
| 0 | WP0.2–0.5 merged or handed over; baseline numbers recorded by the operator | PRs #22–#26 merged into develop 2026-09-08; flow one passed on the dev preview from a `user` account; WP0.3 screenshot-verified; WP0.4 rehearsed twice on dev and handed to the operator; usability baseline and PostHog visibility outstanding (human task / deferred) | 2026-09-08 (code complete; study pending) |
| 1 | Organiser mode on for the pilot group; e2e flow one green from a `user` account; no missing-feature report unanswerable via More or "Show everything" | | |
| 2 | e2e flows two and three green; share of memberships in a unit and median unit size reported from dev and production; no per-unit filter or view override remains | | |
| 3 | e2e flows four and five green; one creation path; a standalone action linked end to end on dev | | |

## Human tasks (not code)

| Task | Raised by | Status |
|---|---|---|
| Run the usability baseline study (WP0.5 pack) | Phase 0 | pending |
| Run WP0.4 scripts on production (00 → 02 → 03; 01 held until WP1.6 is live) | WP0.4 | pending on production. **Run on dev by the operator 2026-09-08:** 02 inserted 5, 03 deleted 2, 01 converted 4 (the e2e account was already `user`); audit log intact, nothing rolled back. Dev now has the post-hygiene shape, so the four converted dev accounts hit the admin-only delete policies until WP1.6 lands. |
| Re-record OVERVIEW clip | WP1.7 | pending |
| Re-record B1–B3, C1–C3 | WP2.9 | pending |
| Re-record A4, A5 | WP3.7 | pending |

## Flag removals

_(dated notes when `workspace_mode` or `groups_v2` paths are deleted)_

## Incidental findings (not part of any work package until assigned)

| Found in | Finding | Assigned to |
|---|---|---|
| WP1.1 review (2026-09-09) | `user_profiles` "update own profile" policy plus table-wide grants let an authenticated `user` set their own `role`, `work_role`, `organiser_id` or `reports_to` via PostgREST; `get_user_role()` trusts the column. Exists in production today. | **Closed in WP1.6** (BEFORE UPDATE guard on role, work_role, organiser_id, reports_to, user_id; probe-proven) |
| WP1.4 planning (2026-09-09) | The SOC wizard is launched with `?cid=` from the campaign page and the phone wizard but reads only `campaign_id`, so it never pre-fills the campaign it was opened from. | Unassigned; small fix for WP1.4 or WP3.3 |
| WP1.1 verification (2026-09-09) | `supabase/.temp/` (the CLI link target) is tracked in git, so a fresh clone is linked to production. | Operator housekeeping: gitignore `supabase/.temp/` |
| WP0.3 review (2026-09-08) | Appendix D 3.2 counts 44 campaign-page surfaces; the SMS panel renders five views, so the inventory is 45. | Recorded in WP1.4's fixture |
| WP1.6 fix round 2 (2026-09-09) | Pre-existing auth start-up deadlock: the `onAuthStateChange` callback awaited a PostgREST query while auth-js held its initialisation lock, so warm full-page loads of small pages hung until "Hard Refresh Connection". Reproduced 8/8 on the preview before the fix. | **Closed in WP1.6** (callback body deferred per Supabase guidance; 6/6 warm loads pass after) |
