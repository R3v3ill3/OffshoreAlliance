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

## Ledger

| WP | Title | Status | Branch | PR | Verification | Open risks | Decisions consumed |
|---|---|---|---|---|---|---|---|
| 0.1 | Decision register and branch setup | PR ready | `feat/oux-wp0.1-decision-register` | [#22](https://github.com/R3v3ill3/OffshoreAlliance/pull/22) | docs only | — | 1–10 recorded |
| 0.2 | Instrumentation and test harness | PR draft | `feat/oux-wp0.2-instrumentation-e2e` | (pending) | lint at baseline (143/151); 732 tests pass (taxonomy test repaired and re-bounded); tsc, build green; `pnpm e2e` skips cleanly without credentials on cached Chromium 1194 | Flow one not run (needs `user` account + seeded campaign); events not observed in PostHog (needs dev key) | — |
| 0.3 | Defaults, copy and layout quick wins | PR draft | `feat/oux-wp0.3-defaults-copy-layout` | [#24](https://github.com/R3v3ill3/OffshoreAlliance/pull/24) | lint at baseline (143/151), 657 tests pass + 1 pre-existing collection failure (WP0.2), build green; screenshots deferred (no dev env) | DataTable card view now fires on phones/iPads; needs visual check | — |
| 0.4 | Data hygiene scripts | not started | | | | | 2 |
| 0.5 | Usability baseline pack | not started | | | | | — |
| 1.1 | Module registry and workspace mode | not started | | | | | 1 |
| 1.2 | Navigation driven by modules | not started | | | | | |
| 1.3 | My campaigns home | not started | | | | | |
| 1.4 | Campaign workspace | not started | | | | | |
| 1.5 | Actions hub | not started | | | | | |
| 1.6 | Auth and RLS alignment | not started | | | | | 2, 8 |
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
| 0 | WP0.2–0.5 merged or handed over; baseline numbers recorded by the operator | | |
| 1 | Organiser mode on for the pilot group; e2e flow one green from a `user` account; no missing-feature report unanswerable via More or "Show everything" | | |
| 2 | e2e flows two and three green; share of memberships in a unit and median unit size reported from dev and production; no per-unit filter or view override remains | | |
| 3 | e2e flows four and five green; one creation path; a standalone action linked end to end on dev | | |

## Human tasks (not code)

| Task | Raised by | Status |
|---|---|---|
| Run the usability baseline study (WP0.5 pack) | Phase 0 | pending |
| Run WP0.4 scripts on production | WP0.4 | pending |
| Re-record OVERVIEW clip | WP1.7 | pending |
| Re-record B1–B3, C1–C3 | WP2.9 | pending |
| Re-record A4, A5 | WP3.7 | pending |

## Flag removals

_(dated notes when `workspace_mode` or `groups_v2` paths are deleted)_
