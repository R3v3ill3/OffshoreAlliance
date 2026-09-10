# Appendix G: production data snapshot

Read-only aggregate queries run against the production Supabase project (`gteygwfgjvczanmrwgbr`) on 7 September 2026. Only counts, distributions and constraint checks were read; no worker names, phone numbers, emails or free text. Campaigns are referred to by numeric id.

## G.1 Table sizes (public schema, rows)

| Table | Rows |
|---|---|
| campaigns | 22 |
| campaign_worker_membership | 2,670 |
| campaign_organising_units | 239 (219 leaf units, 20 containers) |
| campaign_worker_ou | 1,614 |
| campaign_universes / campaign_universe_rules | 0 / 0 |
| campaign_organisers | 0 |
| campaign_edit_permissions | 0 |
| worker_campaign_connections | 2 |
| campaign_unit_rules | 2 |
| campaign_leader_worker_links | 92 |
| campaign_activist_profiles | 109 |
| campaign_worker_lists / items | 83 (34 draft, 49 fired) / 967 |
| campaign_stage_plans | 43 |
| workers | 2,407 |
| organisers | 11 |
| user_profiles | 13 |

## G.2 Units by type

| ou_type | Units | Containers | With parent | With estimate | Campaigns using it |
|---|---|---|---|---|---|
| worksite | 156 | 0 | 143 | 13 | 6 |
| employer | 28 | 18 | 0 | 2 | 3 |
| work_area | 23 | 0 | 0 | 15 | 4 |
| custom | 18 | 2 | 7 | 9 | 5 |
| job_type | 9 | 0 | 0 | 6 | 1 |
| shift | 5 | 0 | 0 | 5 | 1 |

All units have `source = 'manual'`. Five of the eleven permitted types (department, network, ethnic_community, crew_rotation, accommodation) have never been used.

Parent/child pairs: employer container → worksite unit, 143; custom container → custom unit, 7. Maximum depth 2 (campaigns 57, 47, 23). No worker rows point at a container.

`unit_basis` keys: employer_id 171, worksite_id 135, custom 19, occupation_group_id 9, dimension 4. 214 units have a basis; 3 have commonality logic; 0 have an anchor worker; 3 have a unit `user_rating`.

Leaf unit sizes: 219 leaf units, 12 empty, median 2 workers, 90th percentile 14, maximum 149.

## G.3 Per-campaign structure

| Campaign | Status / type | Units (containers) | Types | Members | In a unit | Multi-unit | Same-type dupes | Stage plans | Activities | Rated workers | Lists |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 57 | active / bargaining | 161 (18) | employer, worksite | 305 | 303 | 2 | 2 | 0 | 0 | 0 | 1 |
| 64 | active / political | 8 | employer | 277 | 267 | 3 | 3 | 1 | 7 | 61 | 8 |
| 60 | active / organising | 0 | – | 224 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 47 | active / bargaining | 12 (1) | custom, work_area | 223 | 85 | 0 | 0 | 0 | 2 | 30 | 0 |
| 48 | active / bargaining | 3 | work_area | 219 | 0 | 0 | 0 | 1 | 6 | 9 | 0 |
| 42 | active / bargaining | 3 | custom, worksite | 212 | 202 | 36 | 2 | 1 | 3 | 59 | 1 |
| 26 | active / bargaining | 15 | custom, employer, job_type | 207 | 207 | 36 | 0 | 6 | 2 | 5 | 0 |
| 59 | active / bargaining | 8 | work_area | 196 | 196 | 0 | 0 | 0 | 0 | 0 | 0 |
| 66 | planning / bargaining | 0 | – | 160 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 21 | active / bargaining | 0 | – | 146 | 0 | 0 | 0 | 6 | 0 | 0 | 0 |
| 27 | active / bargaining | 5 | shift | 80 | 15 | 0 | 0 | 6 | 3 | 2 | 0 |
| 37 | active / bargaining | 3 | worksite | 74 | 74 | 0 | 0 | 7 | 5 | 9 | 57 |
| 15 | active / bargaining | 0 | – | 72 | 0 | 0 | 0 | 6 | 5 | 1 | 0 |
| 41 | active / bargaining | 5 | worksite | 61 | 61 | 0 | 0 | 0 | 1 | 22 | 0 |
| 65 | planning / bargaining | 0 | – | 55 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| 23 | active / bargaining | 4 (1) | custom | 48 | 48 | 0 | 0 | 6 | 3 | 50 | 0 |
| 61 | active / bargaining | 6 | custom, worksite | 48 | 11 | 0 | 0 | 1 | 1 | 19 | 3 |
| 58 | active / bargaining | 5 | work_area | 28 | 28 | 0 | 0 | 0 | 0 | 0 | 0 |
| 62 | active / bargaining | 0 | – | 16 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 55 | active / bargaining | 1 | worksite | 11 | 11 | 0 | 0 | 1 | 1 | 4 | 0 |
| 50 | active / organising | 0 | – | 8 | 0 | 0 | 0 | 1 | 4 | 6 | 12 |
| 49 | active / organising (standing) | 0 | – | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

Every campaign has `current_phase = preparing_to_bargain`, including the organising and political ones. Campaign types: bargaining 18, organising 3, political 1.

## G.4 Assignments and membership

| Measure | Value |
|---|---|
| campaign_worker_ou by source | manual 1,420; rule 194 |
| campaign_worker_ou by is_primary | true 300; false 1,314 |
| Members with no unit at all | 1,162 of 2,670 (44%), across 14 campaigns |
| Members in at least one unit | 1,508 (56%) |

## G.5 Migration-hazard checks (appendix C, section 8.4)

| Check | Result |
|---|---|
| H1 worker in more than one unit of the same group | 2 |
| H2 parent-plus-sub-unit roll-up rows | 0 |
| H3 worker in more than one standalone unit of the same type | 5 |
| H5 unit rows whose worker is not a member of the campaign | 0 |
| H6 members with no unit | 1,162 (14 campaigns) |
| H7 workers with more than one primary unit | 0 |
| H8 leaf units with no usable dimension (custom or no basis) | 34 of 219 |

## G.6 Users and organisers

| role | work_role | Accounts | Linked to organiser record | Has reports_to |
|---|---|---|---|---|
| admin | organiser | 7 | 7 | 7 |
| admin | lead_organiser | 2 | 2 | 2 |
| admin | coordinator | 1 | 1 | 0 |
| admin | industrial_coordinator | 1 | 1 | 0 |
| user | organiser | 1 | 0 | 0 |
| user | industrial_officer | 1 | 0 | 1 |

Campaigns per organiser (`campaigns.organiser_id`, non-episode): 7, 6, 4, 2, 1, 1, plus 1 unassigned. `app_settings` holds thirteen integration keys and no feature flags.

## G.7 Security advisory returned by Supabase

Row-level security is disabled on `public.employer_state_bargaining_phase_map`, `public._archive_orphan_call_scripts_20260612`, `public._archive_orphan_call_lists_20260612` and `public._archive_call_attempt_outcomes_20260613`. See section 10 of the main report.

## G.8 Queries

The per-campaign table (G.3) was produced with a single query over `campaigns`, `campaign_organising_units`, `campaign_worker_ou`, `campaign_worker_membership`, `campaign_stage_plans`, `campaign_activities`, `campaign_activity_ratings` and `campaign_worker_lists`, grouping worker-unit rows per (campaign, worker) to derive "in a unit", "multi-unit" and "same-type duplicates". The hazard checks are the queries listed verbatim in appendix C, section 8.4, wrapped in `count(*)`.
