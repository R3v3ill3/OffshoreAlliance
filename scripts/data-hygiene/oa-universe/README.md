# OA Universe alignment — profiling pack (read-only)

Read-only SQL for the data review described in `docs/data-architecture/OA_UNIVERSE_ALIGNMENT_PLAN.md`.
Every file here is `SELECT`-only: nothing is created, updated or deleted. Run them in order; each
prints one or more result sets that feed a numbered finding or worksheet in the plan.

Where to run them (per the programme's standing rule on Supabase projects):

- **Production `gteygwfgjvczanmrwgbr`** — the operator or an agent may run these files (decision D0,
  22 September 2026: read-only profiling on production is permitted for this workstream). Results are
  pasted into the plan's decision register or the worksheets under `docs/data-architecture/worksheets/`.
  No other agent access to production is covered by that decision.
- **Realistic clone `yqjkuobcawvigsfpgrcm`** — the rehearsal target for every write script; it lags
  production (it predates the September membership sync), so counts differ.

The pack is deliberately PII-free: it returns counts, distributions, organisation names, worksite
names, agreement names and occupation titles. It never selects a worker's name, phone, email,
address or member number.

| File | Purpose | Feeds |
|---|---|---|
| `00_profile_counts.sql` | Row counts for every entity and junction in the organising model (runs on every project) | Plan §1.1 |
| `00b_profile_supplementary.sql` | Role breakdown of `employer_worksite_roles`; `membership_update_batches` count (needs `20260921030000`, absent on the 12 September clone) | Plan §1.1 |
| `01_profile_employers.sql` | One row per employer with lineage signals (created date, category, parent, ABN, workers, roles, agreements, aliases) | `employers_adjudication_*.csv` |
| `02_profile_worksites.sql` | One row per worksite with type, flags, principal/operator, workers, roles, agreement links | `worksites_adjudication_*.csv` |
| `03_profile_workers_links.sql` | Worker link coverage (employer, worksite, member number, occupation), created-month histogram, employer×worksite pairs missing from `employer_worksite_roles` | Plan §2.4 |
| `04_profile_agreements.sql` | Agreements by status/scope/source sheet, worksite coverage, one row per agreement with its holder and linked worksites | Plan §2.5 |
| `05_candidate_clusters.sql` | Near-duplicate clusters for employers and worksites (first significant token after stripping legal and generic words) | Plan §3, Phase 1 |
| `06_oa_universe_crossmatch.sql` | Keyword cross-match of OA Universe assets and contractors against `worksites` and `employers` | Plan §2.9 |
| `07_hierarchy_and_patches.sql` | Campaign universe definitions, groups, units and organiser patches | Plan §2.7 |

Re-run the pack at the end of every washing round; the deltas are the acceptance evidence.

Nothing here is a migration: never copy these files under `supabase/migrations/` and never run
them with `supabase db push`.
