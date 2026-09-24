# DA0.2 — Remove the synthetic dataset

Planner: Fable (planning session of 2026-09-22). Status: **plan, awaiting approval** (§7). Ledger row:
`../PROGRESS.md:78`. Scripts: `scripts/data-hygiene/da0.2/` (§2). Every number below comes from a
read-only query run on 2026-09-22 against production `gteygwfgjvczanmrwgbr` and the 12 September clone
`yqjkuobcawvigsfpgrcm`, or from a file cited by `path:line`. No personal data: ids, organisation,
worksite and campaign names, counts and digests only.

## 1. Specification

### 1.1 The §5 row, verbatim (`../OA_UNIVERSE_ALIGNMENT_PLAN.md:380`)

> | DA0.2 | Remove the synthetic dataset (D4, confirmed): employers 787, 791 and the six same-day contractors
> 788–790, 792–794; worksites 196–199; campaigns 15 and 37; program 6; projects 18–21; 11 employer–worksite
> roles; 664 workers (none with a membership number) and their cascaded rows. Order: campaigns → workers →
> projects → program → worksites → employers, because `workers.employer_id`, `workers.worksite_id` and
> `projects.worksite_id` are `NO ACTION` while the campaign and role junctions cascade. The preflight lists
> child-row counts per table (SMS, email, call and rating rows attached to the 665) and worker 1536, the
> operator's own test record, which is kept: re-pointed to AWU WA Branch / AWU Head Office before the TestCo
> rows go and removed from campaign 64 (D16). Rehearse on the clone with a rollback; then the operator runs
> it on production | `00_preflight.sql`, `10_remove_test_dataset.sql`, `90_rollback.sql` | active workers
> fall by 664 to 5,085; `05_candidate_clusters.sql` no longer lists a `test` cluster; campaigns 15 and 37
> gone |

### 1.2 The orchestration paragraph, verbatim (`../ORCHESTRATION_PROMPT.md:173`)

> **DA0.2 Remove the synthetic dataset.** Fable planner and implementer at `max`; Fable reviewer; Sonnet
> verifier on the clone. Scope is fixed by D4: employers 787, 791, 788–790, 792–794; worksites 196–199;
> campaigns 15 and 37; program 6; projects 18–21; 11 employer–worksite roles; 664 workers. Worker 1536 is
> kept (D16): re-pointed to AWU WA Branch (741) and AWU Head Office (185) before the TestCo rows go, its
> membership of campaign 64 removed, its membership of 37 gone with the campaign. Deletion order from plan
> §5 (campaigns → workers → projects → program → worksites → employers); the preflight lists child-row
> counts per table for the 664 workers and asserts 1536's new placement before any delete. Rehearse
> forward-back-forward on the clone (the clone has the same synthetic rows). Acceptance: active workers on
> production fall by 664 to 5,085, `05` shows no `test` cluster, campaigns 15 and 37 gone, worker 1536 a
> member of 50 only. No open dependency.

### 1.3 Plan sections and decisions consumed

- §0 item 3 (`OA_UNIVERSE_ALIGNMENT_PLAN.md:16`): the synthetic dataset accounts for 665 of the 5,749
  active workers; every one of the 665 sits on a `TEST` worksite and none has a membership number.
- §1.2 lineage T (`:76`): the eight employers created 9 and 16 April 2026.
- §1.3 synthetic worksites row (`:101`): `Test Onshore Gas Plant` (350 workers), `TEST · TestCo 2 — Alpha
  FPSO / Bravo Platform / Charlie FPU` (315).
- D4 (`:445`): remove the TestCo-related data; identity confirmed by the operator on 22 Sep.
- D16 (`:457`): keep worker 1536, re-pointed to AWU WA Branch / AWU Head Office; remove its membership of
  64; 37 disappears with the dataset; active workers after DA0.2: 5,085.
- D17 (`:458`): Phase 0 rehearses on the 12 September clone, which has the synthetic rows.
- §7 risk row (`:468`): "Removing the synthetic dataset removes real people if the identification is wrong
  — Confirm against the membership system export before deletion; soft-delete first (`is_active = false`,
  tag) and hard-delete a week later." §3.4 says how this plan meets it.
- Non-negotiable rules (`ORCHESTRATION_PROMPT.md:32–45`) and the run-sheet and verification standards
  (`:100–120`): every mutating script ships with a preflight, a rollback whose precondition is exactly the
  state the script leaves, a verification `SELECT`; evidence is per-campaign membership and placement
  checksums, not row totals; production is operator-run through the SQL editor as `postgres`.
- No §3 design section is consumed: this package changes no schema and no code.

## 2. Files

No application code changes and no migration. New files, all in this branch:

| File | Kind | Purpose |
|---|---|---|
| `docs/data-architecture/wp/da0.2.md` | plan | this file |
| `scripts/data-hygiene/da0.2/00_preflight.sql` | read-only, one statement | §3.1 |
| `scripts/data-hygiene/da0.2/10_remove_test_dataset.sql` | mutating, one transaction | §3.2 |
| `scripts/data-hygiene/da0.2/90_rollback.sql` | mutating, one transaction | §3.3 |

Code read to write them (as it is today):

- Run-sheet style: `scripts/data-hygiene/oux-wp3.8/README.md:8–15` (guard and submission rules),
  `oux-wp3.8/10_campaign64_family.sql:31–45` (environment guard, copied verbatim), `:48–131`
  (preconditions), `:133–155` (before-state temp tables), `:157–204` (hygiene-log rows in the WP0.4
  shape), `:206–297` (post-assertions), `:301–311` (read-only `SELECT` after `COMMIT`);
  `oux-wp3.8/91_rollback_campaign64_family.sql:40–75` (rollback precondition = forward post-state),
  `:147–151` (`rolled_back_at` stamping).
- Log table: `scripts/data-hygiene/oux-wp0.4/00_create_hygiene_log.sql:31–42` — columns `log_id, script,
  action (update|insert|delete), table_name, row_pk jsonb, before_row jsonb, after_row jsonb, note,
  logged_at, rolled_back_at`; RLS enabled, revoked from `anon`/`authenticated` (`:52–57`). The production
  copy has the same ten columns (queried through `information_schema.columns`) and the same `action` CHECK.
- Marker: `scripts/data-hygiene/oux-wp2.1/01_environment_marker.sql:24–28` (`_oux_env_marker(singleton,
  env, marked_at)`); the clone's row is `clone (2026-09-12)`; production has no marker table.
- Schema: `supabase/migrations/20260908050000_baseline_schema.sql:9735` (`workers`; `member_number` at
  `:9753`, `reference_id` at `:9766`, `project_id` at `:9761`), `:12526` (`projects`, `worksite_id NOT
  NULL`), `:13426` (`programs`, `principal_employer_id`), `:11790` (`employer_worksite_roles`), `:17612–17627`
  (`worksite_hierarchy_report_rows_mv`, built from `worksite_hierarchy_report_rows` at `:17552`, which joins
  `employer_worksite_roles`, `employers` and `work_scopes`), `:5297–5301` (`refresh_worksite_hierarchy_report_rows_mv()`).
- Triggers whose bodies were read (§3.4): baseline `:528` `auto_add_soc_capacity`, `:1014`
  `check_gate_change_against_overlap`, `:1209` `check_worker_ou_group_exclusivity`, `:1626`
  `cou_enforce_group_consistency`, `:1658` `cou_enforce_hierarchy_invariants`, `:1902`
  `enforce_stage_overlap_with_hard_gates`, `:2000` `enforce_stage_phase_invariant`, `:2064`
  `fn_activist_profile_on_membership`, `:2091` `fn_activist_profile_on_rating`, `:2114`
  `fn_activist_profile_on_role_change`, `:2143` `fn_activist_profile_on_task_list`, `:2180`
  `fn_auto_rate_promote_task_list_leader`, `:2283` `fn_csa_sync_bargaining_phase_state`, `:2432`
  `fn_ensure_activist_profile`, `:2615` `fn_reject_setup_ambition_activity_link`, `:2801`
  `fn_task_list_item_side_effects`, `:4558` `prevent_live_sms_episode_delete`, `:4587`
  `propagate_employer_scope`, `:6271` `sync_call_list_current_script`, `:6341` `sync_worker_phone_e164`,
  `:6633` `trigger_refresh_gate_criteria_on_campaign_change`, `:6674`
  `trigger_refresh_gate_criteria_on_worker_change`, `:6694` `update_connection_stats_on_activity`, `:6761`
  `validate_worker_project_worksite`, `:6825` `workers_normalize_non_oa_union_option`;
  `20260912035329_wp2_1_campaign_groups.sql:610` `cou_default_group`, `:678` `cou_after_group_change`;
  `20260914090000_wp2_2_structure_api.sql:167` `check_no_worker_on_group_container`;
  `20260914090100_wp2_2_one_unit_per_group_enforcement.sql:104` `cwo_set_group_id`;
  `20260917100000_wp3_8_campaign_families.sql:223` `campaigns_enforce_one_level`.
- Membership-system key: `apps/organising-db/src/components/import/membership-import-wizard.tsx:757–760,
  797–798` (the sync matches on `workers.reference_id`), `apps/organising-db/src/app/api/membership-import/apply/route.ts:266, 390`
  — line numbers of the committed code (`HEAD`, `b9df593e`); the working tree carries DA0.3's uncommitted edits to both
  files, which this package does not touch.
- Acceptance instrument: `scripts/data-hygiene/oa-universe/05_candidate_clusters.sql:4–13` (employer key)
  and `:15–24` (worksite key: `Test Onshore Gas Plant` and the three `TEST · TestCo 2 —` names all reduce
  to the token `test`; `TestCo Energy` and `TestCo 2` reduce to `testco`); `00_profile_counts.sql:1–45`.
- Worksheets: `docs/data-architecture/worksheets/employers_adjudication_2026-09-22.csv:4,7,61,111,115,118,157,158`
  (employers 792, 790, 788, 793, 794, 789, 791, 787: decision "Remove with the synthetic dataset (D4)",
  operator, 2026-09-22; the `worksite_roles` column sums to 10), `worksites_adjudication_2026-09-22.csv:167–170`
  (196–199: "Delete with the synthetic dataset (D4)") and `:14` (185 AWU Head Office),
  `employers_adjudication_2026-09-22.csv:19` (741 Australian Workers' Union WA Branch).

## 3. Scripts

### 3.0 Evidence gathered on 2026-09-22 (read-only)

**Identity (§ read-first item 5 of the brief).** Identical on production and the clone:

| id | name | created | notes |
|---|---|---|---|
| employer 787 | TestCo Energy | 2026-04-09 | principal of worksite 196 |
| employer 788 | Fortis Maintenance Services | 2026-04-09 | |
| employer 789 | Pacific Coatings & Insulation | 2026-04-09 | |
| employer 790 | Alliance Site Services | 2026-04-09 | |
| employer 791 | TestCo 2 | 2026-04-16 | principal of 197–199 and of program 6; the campaign employer of 15 and 37 |
| employer 792 | Aegis Offshore Maintenance Pty Ltd | 2026-04-16 | |
| employer 793 | NorthStar Marine Coatings | 2026-04-16 | |
| employer 794 | Offshore Crew Services Ltd | 2026-04-16 | |
| worksite 196 | Test Onshore Gas Plant | 2026-04-09 | project 18 |
| worksite 197 | TEST · TestCo 2 — Alpha FPSO | 2026-04-16 | project 19 |
| worksite 198 | TEST · TestCo 2 — Bravo Platform | 2026-04-16 | project 20 |
| worksite 199 | TEST · TestCo 2 — Charlie FPU | 2026-04-16 | project 21 |
| campaign 15 | Test2 | 2026-04-16 | active; not an SMS episode, not standing, no parent, no children |
| campaign 37 | testco | 2026-04-28 | as 15; owns group 3 (kind `worksite`) and units 25, 26, 27 |
| program 6 | TEST · TestCo 2 Offshore Maintenance Program | 2026-04-16 | `program_worksites` 13:197, 14:198, 15:199 |
| projects 18–21 | Test Onshore Gas Plant Brownfields; TEST · TestCo 2 — Alpha — brownfields / Bravo — maintenance / Charlie — maintenance | 2026-04-09/16 | on 196, 197, 198, 199 |
| employer 741 | Australian Workers' Union WA Branch | 2026-04-01 | keep target (D16); 3 workers on production (ids 3447–3449, created 2026-09-17), 0 on the clone |
| worksite 185 | AWU Head Office | 2026-04-01 | keep target (D16); 0 workers on both |
| campaign 50 | Offshore Allliance internal | 2026-05-28 | active; 11 members on production, 8 on the clone; employers 795, 741; sector-wide |
| campaign 64 | ROV sector wide | 2026-08-20 | active; 364 members / 398 placements on production, 276 / 266 on the clone |

**Workers.** Scope filter: `employer_id IN (787…794) OR worksite_id IN (196…199)`, minus worker 1536.

| measure | production | clone |
|---|---|---|
| workers total / active | 6,564 / 5,749 | 2,407 / 2,293 |
| scope including 1536 | 665 | 665 |
| scope excluding 1536 (the 664), total / active | 664 / 664 | 664 / 664 |
| md5 of the 664 ids | `f6589df6e2507a35542632026c3d0c34` | `f6589df6e2507a35542632026c3d0c34` (identical) |
| per employer 787 / 788 / 789 / 790 / 791 / 792 / 793 / 794 / NULL | 80 / 120 / 55 / 95 / 72 / 108 / 48 / 84 / 2 | same |
| per worksite 196 / 197 / 198 / 199 | 350 / 106 / 104 / 104 | same |
| per project 18 / 19 / 20 / 21 / NULL | 350 / 104 / 104 / 104 / 2 | same |
| created 2026-04-09 (ids 322–671) / 04-16 (672–983) / 05-27 (1537) / 06-03 (1541) | 350 / 312 / 1 / 1 | same |
| `updated_at` | all 664 on 2026-08-20 | same |
| employer in scope but worksite outside 196–199 | 0 | 0 |
| worksite in scope but employer outside 787–794 | 2: ids 681 (in the 16 April batch) and 1537 (employer NULL) | same |
| `reference_id` NOT NULL | 0 | 0 |
| `member_number` NOT NULL | **304** (160 of length 7, 144 of length 8, all one letter + digits, all distinct, none shared with any worker outside the scope) | 304 (same shape) |
| workers outside the scope with `member_number` NOT NULL / `reference_id` NOT NULL | 0 / 5,229 | 0 / 770 |
| September-sync rows for the 664 (`worker_membership_transitions` / `worker_history`) | 0 / 0 | 0 / 0 |
| `phone_e164` shared with a worker outside the scope / email shared (case-folded) | 0 / 0 | 0 / 0 |
| emails matching the test-address pattern (`~* 'test'`) | 663 of 664 (the one exception is 1537; 681 and 1541 match) | 663 (same exception) |
| first + last name shared with a worker outside the scope | 29 (18 of the 9 April batch, 9 of the 16 April batch, per the reviewer) — expected for a generated fixture; the phone/email rows above are the ones that matter | 6 |
| index on `member_number` / on `reference_id` | none / `workers_reference_id_unique` | same |
| memberships / placements of the 664 outside campaigns 15 and 37 | none / none | none / none |

**Worker 1536** (identical on both): employer 791, worksite 197, project NULL, active, `member_role_type_id`
8 (activist-like, so `fn_activist_profile_on_role_change` fires on update), no `member_number`, no
`reference_id`, created 2026-05-26; memberships 2589:37, 4451:50, 11434:64; placement 37:25 only; activist
profiles 37, 50, 64. Rows in campaign 64: membership 1, placement 0, activist profile 1, worker-list items 2,
email-list items 4 (3 on the clone), leader links 0. Kept and untouched: 4 `sms_conversations`, 58
`sms_interactions`, 1 `email_conversations`, 13 `worker_an_tags`.

**Junctions.** `employer_worksite_roles` in scope (by employer or by worksite, the same rows): **10**, ids
82:787:196, 83:788:196, 84:789:196, 85:790:196, 87:791:197, 89:793:197, 91:791:198, 93:793:198, 95:791:199,
97:793:199. The §5 row and D4 say 11; the database (both projects) and the worksheet's own per-employer
column (`employers_adjudication_2026-09-22.csv`: 1+1+1+1+3+0+3+0) say 10 — recorded as a deviation of the
specification text, not of the data (§5 P6). `program_worksites` of 6: 13, 14, 15. `project_employers`: 13
rows (18:787–790; 19–21: 791, 792, 793). `worksite_scopes` 36 (the same rows by employer and by worksite),
`employer_scopes` 18. `campaign_employers` 15:791, 37:791; `campaign_worksites` 15 and 37 × 197, 198, 199;
campaign 37 owns group 3 and units 25–27 (all `group_id` 3, not containers); campaign 15 has no unit.
Memberships of 15/37: production 386 of the 664 + 1 (1536) = 387; clone 145 + 1 = 146 (campaign 37 was
refreshed on production after 12 September). Activities 10, ratings 11 on both.

### 3.1 `00_preflight.sql` (read-only)

One `SELECT` returning `(section, k, v)` rows; sections A identity, B workers, C w1536, D structure, E doomed
(per-table counts of every row the forward script will delete, computed by walking `pg_constraint` from the
six roots over `ON DELETE CASCADE` keys plus the three `NO ACTION` campaign children the script deletes
explicitly), F set-null (rows outside the closure an `ON DELETE SET NULL` key will null, self-referencing keys
included — exactly the `update` rows `10` logs), G BLOCKER (rows outside the closure holding a `NO ACTION`/
`RESTRICT` key into it, or a self-referencing CASCADE key), G2 (`NO ACTION`/`RESTRICT` keys between two closure
tables with the closure rows that use them), H cross-checks, I checksums (every campaign: `count(*)` and
`md5(string_agg(worker_id::text, ',' ORDER BY worker_id))` over `campaign_worker_membership`; the same over
`campaign_worker_ou` with `ou_id`), J pack (the `00_profile_counts.sql` rows the package moves and the two
`05` test clusters), K environment (marker, log, matview, schema fingerprints, role capabilities). It was run
on both projects on 2026-09-22 and again after fix round 1 on 2026-09-23 (production 250 rows, clone 248;
every section returns on both — the `env_marker` row is guarded with `to_regclass`, production has no marker
table); the outputs are the tables in §3.0 and §4. On production the operator runs it; on the clone the
verifier. Section-K rows `hygiene_log rows=` and `hygiene_log_da02_pending/rolled_back` grow with every run and
are excluded from every "identical `00`" comparison (review finding 8); everything else is expected identical
(`updated_at` is restored with triggers off and 1536 is asserted byte-identical on the clone).

#### 3.1.1 The foreign-key graph (one `pg_constraint` query per project; the clone's result, with the ten production-only edges marked)

Direct single-column foreign keys into the six root tables, grouped by `ON DELETE` action. Production's
graph is the clone's plus `email_draft_attachments.campaign_id` (CASCADE) and
`email_draft_attachments.draft_id → campaign_comms_drafts` (CASCADE), and the vessel-tracking module's keys
`mobilisation_alerts.{contractor_id, operator_id, worksite_id}`, `mobilisation_signals.{contractor_id,
operator_id, worksite_id}`, `mobilisation_watch_contractors.employer_id`, `vessels.owner_operator_id` (all SET
NULL); none of them holds a row in scope today, and the scripts read `pg_constraint` at run time, so they are
covered without being named. One composite foreign key exists in `public`
(`email_message_attachments(message_id, conversation_id) → email_messages`); it does not reach any root
table, which the scripts assert.

| parent | edges (clone + production-only) | by action |
|---|---|---|
| `campaigns` | 72+1 | **CASCADE** (58): `activist_tasks.campaign_id`, `ambition_progress_events.campaign_id`, `an_tag_sync_log.campaign_id`, `bargaining_decision_points.campaign_id`, `bargaining_gate_definitions.campaign_id`, `bargaining_strength_assessments.campaign_id`, `call_issue_observations.campaign_id`, `call_lists.campaign_id`, `call_objections.campaign_id`, `call_outcome_definitions.campaign_id`, `call_scripts.campaign_id`, `campaign_actions.campaign_id`, `campaign_activist_profiles.campaign_id`, `campaign_activities.campaign_id`, `campaign_agreements.campaign_id`, `campaign_ambitions.campaign_id`, `campaign_comms_drafts.campaign_id`, `campaign_data_fields.campaign_id`, `campaign_data_fieldsets.campaign_id`, `campaign_edit_permissions.campaign_id`, `campaign_employers.campaign_id`, `campaign_groups.campaign_id`, `campaign_leader_worker_links.campaign_id`, `campaign_organisers.campaign_id`, `campaign_organising_units.campaign_id`, `campaign_ou_candidates.campaign_id`, `campaign_permission_requests.campaign_id`, `campaign_prospective_workers.campaign_id`, `campaign_situation_analyses.campaign_id`, `campaign_situation_revisions.campaign_id`, `campaign_stage_workplan_tasks.campaign_id`, `campaign_task_lists.campaign_id`, `campaign_unit_rules.campaign_id`, `campaign_universes.campaign_id`, `campaign_wocs.campaign_id`, `campaign_worker_lists.campaign_id`, `campaign_worker_membership.campaign_id`, `campaign_worksites.campaign_id`, `documents.campaign_id`, `email_canned_replies.campaign_id`, `email_lists.campaign_id`, `intractable_bargaining_tracker.campaign_id`, `member_endorsement_votes.campaign_id`, `pabo_applications.campaign_id`, `participation_import_batches.campaign_id`, `phone_call_actions.campaign_id`, `pia_actions.campaign_id`, `plan_revision_notes.campaign_id`, `section_plans.campaign_id`, `sms_canned_replies.campaign_id`, `sms_lists.campaign_id`, `sms_relays.campaign_id`, `sms_surveys.campaign_id`, `sms_test_recipients.campaign_id`, `structure_tests.campaign_id`, `user_campaign_prefs.campaign_id`, `worker_campaign_connections.campaign_id`, `worker_campaign_facts.campaign_id`; **NO ACTION** (4): `campaign_stage_plans.campaign_id`, `campaign_timelines.campaign_id`, `gate_definitions.campaign_id`, `reporting_snapshots.campaign_id`; **SET NULL** (10): `an_survey_imports.campaign_id`, `campaigns.parent_campaign_id`, `email_conversations.campaign_id`, `email_cta_responses.campaign_id`, `petition_signatures.campaign_id`, `sms_conversations.campaign_id`, `sms_interactions.campaign_id`, `sms_lists.assessment_campaign_id`, `soc_sessions.campaign_id`, `worker_notes.campaign_id`; production-only CASCADE: `email_draft_attachments.campaign_id` |
| `workers` | 63+0 | **CASCADE** (41): `activist_tasks.worker_id`, `ambition_progress_events.worker_id`, `call_attempt_cta_ratings.worker_id`, `call_attempt_objections.worker_id`, `call_issue_observations.worker_id`, `call_list_items.worker_id`, `campaign_action_results.worker_id`, `campaign_activist_profiles.worker_id`, `campaign_activity_ratings.worker_id`, `campaign_leader_worker_links.follower_worker_id`, `campaign_leader_worker_links.leader_worker_id`, `campaign_task_list_items.worker_id`, `campaign_worker_list_items.worker_id`, `campaign_worker_membership.worker_id`, `campaign_worker_ou.worker_id`, `communications_log.worker_id`, `email_cta_responses.worker_id`, `email_list_items.worker_id`, `email_send_log.worker_id`, `email_unsubscribe_tokens.worker_id`, `meeting_attendance.worker_id`, `petition_signatures.worker_id`, `section_plan_soc_recordings.worker_id`, `sms_ballot_roll.worker_id`, `sms_interactions.worker_id`, `sms_list_items.worker_id`, `sms_send_log.worker_id`, `sms_survey_sessions.worker_id`, `sms_test_recipients.worker_id`, `woc_members.worker_id`, `worker_additional_occupations.worker_id`, `worker_agreements.worker_id`, `worker_an_tags.worker_id`, `worker_assignments.worker_id`, `worker_campaign_connections.worker_id`, `worker_campaign_facts.worker_id`, `worker_history.worker_id`, `worker_membership_transitions.worker_id`, `worker_notes.worker_id`, `worker_specialisations.worker_id`, `worker_tags.worker_id`; **SET NULL** (22): `call_attempts.caller_leader_worker_id`, `call_attempts.caller_session_worker_id`, `call_list_items.claimed_by_worker_id`, `call_share_form_events.worker_id`, `call_share_tokens.designated_worker_id`, `call_share_tokens.leader_worker_id`, `campaign_leader_form_events.worker_id`, `campaign_organising_units.anchor_worker_id`, `campaign_ou_coverage.leader_worker_id`, `campaign_ou_coverage.second_worker_id`, `campaign_prospective_workers.merged_worker_id`, `campaign_prospective_workers.source_leader_worker_id`, `campaign_stage_workplan_tasks.assigned_worker_id`, `campaign_task_lists.leader_worker_id`, `campaign_worker_lists.leader_worker_id`, `email_conversations.worker_id`, `sms_ballot_events.worker_id`, `sms_conversations.worker_id`, `sms_relay_messages.member_worker_id`, `structure_test_results.leader_worker_id`, `woc_committee_meetings.chair_worker_id`, `woc_committee_meetings.next_chair_worker_id` |
| `projects` | 5+0 | **CASCADE** (2): `project_agreements.project_id`, `project_employers.project_id`; **NO ACTION** (2): `projects.absorbed_into_project_id`, `workers.project_id`; **SET NULL** (1): `worksite_contracts.project_id` |
| `programs` | 2+0 | **CASCADE** (1): `program_worksites.program_id`; **SET NULL** (1): `worksite_contracts.program_id` |
| `worksites` | 14+2 | **CASCADE** (8): `agreement_worksites.worksite_id`, `campaign_worksites.worksite_id`, `employer_worksite_roles.worksite_id`, `program_worksites.worksite_id`, `worksite_contracts.worksite_id`, `worksite_name_aliases.worksite_id`, `worksite_scopes.worksite_id`, `worksite_tags.worksite_id`; **NO ACTION** (3): `projects.worksite_id`, `workers.worksite_id`, `worksites.parent_worksite_id`; **SET NULL** (3): `worker_roster_panel_options.worksite_id`, `worker_shift_options.worksite_id`, `worker_work_area_options.worksite_id`; production-only SET NULL: `mobilisation_alerts.worksite_id`, `mobilisation_signals.worksite_id` |
| `employers` | 22+6 | **CASCADE** (8): `agreement_employers.employer_id`, `campaign_employers.employer_id`, `employer_name_aliases.employer_id`, `employer_scopes.employer_id`, `employer_sectors.employer_id`, `employer_tags.employer_id`, `employer_worksite_roles.employer_id`, `project_employers.employer_id`; **NO ACTION** (9): `agreements.employer_id`, `documents.employer_id`, `employers.parent_employer_id`, `programs.principal_employer_id`, `workers.employer_id`, `worksite_contracts.contractor_employer_id`, `worksite_scopes.employer_id`, `worksites.operator_id`, `worksites.principal_employer_id`; **SET NULL** (5): `employer_merge_events.survivor_employer_id`, `upcoming_project_employers.employer_id`, `worker_roster_panel_options.employer_id`, `worker_shift_options.employer_id`, `worker_work_area_options.employer_id`; production-only SET NULL: `mobilisation_alerts.contractor_id`, `mobilisation_alerts.operator_id`, `mobilisation_signals.contractor_id`, `mobilisation_signals.operator_id`, `mobilisation_watch_contractors.employer_id`, `vessels.owner_operator_id` |

The claim in the §5 row is confirmed by `pg_constraint`: `workers.employer_id`, `workers.worksite_id`,
`workers.project_id`, `projects.worksite_id`, `programs.principal_employer_id`,
`worksites.principal_employer_id`, `worksites.operator_id` and `worksite_scopes.employer_id` are `NO ACTION`;
the campaign junctions (`campaign_employers`, `campaign_worksites`, `campaign_worker_membership`,
`campaign_worker_ou` via its unit) and `employer_worksite_roles` cascade. Two `NO ACTION` keys are
`DEFERRABLE INITIALLY DEFERRED` (`campaign_organising_units.group_id` and `campaign_worker_ou.group_id` →
`campaign_groups`), so group 3 can go in the same transaction as its units and placements. The stated order
resolves every `NO ACTION` key: campaign children before campaigns (the three explicit ones), workers before
projects/worksites/employers, projects before worksites, program and worksites before employers.

#### 3.1.2 The rows the forward script deletes (section E of the preflight, both projects, 2026-09-22)

72 tables. Counts are rows reachable from the six roots over CASCADE keys, de-duplicated across paths;
"prod / clone".

| table | prod / clone | table | prod / clone | table | prod / clone |
|---|---|---|---|---|---|
| `workers` | 664 / 664 | `campaigns` | 2 / 2 | `employers` | 8 / 8 |
| `worksites` | 4 / 4 | `projects` | 4 / 4 | `programs` | 1 / 1 |
| `campaign_worker_membership` | **387 / 146** | `campaign_worker_ou` | **315 / 74** | `worker_an_tags` | 386 / 386 |
| `campaign_worker_list_items` | 336 / 336 | `campaign_worker_lists` | 57 / 57 | `call_list_items` | 146 / 146 |
| `email_list_items` | 133 / 133 | `email_send_log` | 133 / 133 | `worker_tags` | 74 / 74 |
| `campaign_leader_worker_links` | 58 / 58 | `plan_ambitions` | 37 / 37 | `worksite_scopes` | 36 / 36 |
| `campaign_task_list_items` | 23 / 23 | `employer_scopes` | 18 / 18 | `campaign_leader_form_events` | 17 / 17 |
| `an_tag_sync_log` | 16 / 16 | `campaign_activist_profiles` | 16 / 16 | `plan_capacities` | 16 / 16 |
| `call_share_form_events` | 14 / 14 | `campaign_stage_plans` | 13 / 13 | `project_employers` | 13 / 13 |
| `plan_where_to_play` | 12 / 12 | `reporting_snapshots` | **12 / 8** | `campaign_activity_ratings` | 11 / 11 |
| `campaign_activities` | 10 / 10 | `employer_worksite_roles` | 10 / 10 | `gate_definitions` | 10 / 10 |
| `sms_survey_questions` | 10 / 10 | `call_lists` | 7 / 7 | `phone_call_action_lists` | 7 / 7 |
| `plan_wtp_ambitions` | 7 / 7 | `campaign_comms_drafts` | 6 / 6 | `campaign_worksites` | 6 / 6 |
| `call_share_tokens` | 6 / 6 | `phone_call_actions` | 6 / 6 | `activity_ambitions` | 5 / 5 |
| `campaign_ambitions` | 5 / 5 | `campaign_task_lists` | 5 / 5 | `email_lists` | 5 / 5 |
| `oauth_send_batches` | 5 / 5 | `sms_send_log` | 4 / 4 | `sms_survey_sessions` | 4 / 4 |
| `call_outcome_definitions` | 3 / 3 | `campaign_organising_units` | 3 / 3 | `program_worksites` | 3 / 3 |
| `call_attempt_outcomes` | 2 / 2 | `campaign_employers` | 2 / 2 | `campaign_leader_tokens` | 2 / 2 |
| `campaign_organisers` | 2 / 2 | `email_click_tokens` | 2 / 2 | `section_plans` | 2 / 2 |
| `worker_activity_log` | 2 / 2 | `worker_campaign_connections` | 2 / 2 | `worker_notes` | 2 / 2 |
| `call_attempts` | 1 / 1 | `call_list_scripts` | 1 / 1 | `call_script_sections` | 1 / 1 |
| `call_scripts` | 1 / 1 | `call_step_outcomes` | 1 / 1 | `campaign_groups` | 1 / 1 |
| `campaign_situation_analyses` | 1 / 1 | `plan_revision_notes` | 1 / 1 | `plan_theory_of_winning` | 1 / 1 |
| `section_plan_situation_snippets` | 1 / 1 | `sms_survey_definition_versions` | 1 / 1 | `sms_surveys` | 1 / 1 |

Totals: **3,119 rows on production, 2,633 on the clone**; the only differences are the three bold cells
(campaign 37's memberships and placements were refreshed on production after 12 September, and four more
reporting snapshots were taken). Not in the table because they are 0 on both: every other child of the six
roots, including every SMS list, ballot, petition, WOC, meeting and communications-log table, `documents`,
`agreements`, `worker_history`, `worker_membership_transitions`. Rows attached to worker 1536 are not in the
closure (it is excluded from the root filter) except through campaign 37, which is why
`campaign_worker_membership` is 387 = 386 + 1 and `campaign_activist_profiles` 16 = 15 + 1.

Section F, rows outside the closure nulled by `SET NULL` keys (identical on both): `sms_conversations` 3, 4, 5
(`campaign_id` → 37 and `worker_id` → one of the 664, both nulled: 6 log rows); `soc_sessions` 4, 5, 6
(`campaign_id` → 37, `plan_id` → `campaign_stage_plans` 112 / 116, `capacity_id` → `plan_capacities` 15 / 19,
all nulled: 9 log rows); `worker_notes` 1 (`campaign_id` → 37; the note belongs to worker 1536 and survives:
1 log row) — 16 update rows in all. `worker_notes` 4 and 5 also carry `campaign_id = 37` but belong to two of
the 664 workers, so they are closure rows and are logged once, as deletes (review finding 1; the forward
script collects the closure of all six roots before any SET NULL update runs). Self-referencing SET NULL keys
(`campaign_organising_units.parent_ou_id`, `call_scripts.base_script_id`, `activist_tasks.next_task_id`;
`campaigns.parent_campaign_id` is also self-referencing) hold 0 rows into the closure today; they are in the
same F/G machinery. Section G, blockers: exactly the two expected rows, worker 1536's `employer_id` and
`worksite_id`. Section G2, `NO ACTION` keys between two closure tables: 10 keys / 2,351 rows on production
(2,110 on the clone) — `workers.employer_id`, `workers.worksite_id`, `workers.project_id`,
`projects.worksite_id`, `programs.principal_employer_id`, `worksites.principal_employer_id`,
`worksite_scopes.employer_id` (all resolved by the root order, child root before parent root) and the two
deferrable `group_id` keys into `campaign_groups`; the forward script orders each root's deletes
topologically and stops before any row moves if a non-deferred key's child would be deleted in a later root
than its parent (0 such rows today). Section H: every cross-check 0 apart from worksites 196–199 (principal 787/791) and
program 6 (principal 791); no `unit_basis` or `campaign_unit_rules` row of another campaign names a synthetic
employer or worksite; no worksite or employer has a synthetic parent; no agreement, document, contract,
upcoming-project or SMS list references the scope.

### 3.2 `10_remove_test_dataset.sql` (mutating, one transaction)

- **Environment guard**: verbatim from `oux-wp3.8/10_campaign64_family.sql:27–44`; on production the
  operator inserts `SET LOCAL oux.env = 'production';` after `BEGIN;`.
- **Catalogue helpers** (temp, `ON COMMIT DROP`): `_da02_edges` (single-column public foreign keys with the
  three `NO ACTION` campaign children `campaign_stage_plans`, `gate_definitions`, `reporting_snapshots`
  promoted to cascade-like), `_da02_pk` (per-table primary-key expressions), `_da02_doomed` (every row to
  delete: root, table, depth, `row_pk`, `row_data`), `_da02_counts_before` (row count of every ordinary table
  in `public`), `_da02_checksums_before` (per-campaign membership and placement checksums), `_da02_before`
  (worker totals, 1536's row as jsonb), `_da02_log_ids`.
- **Preconditions** (any failure stops the file before a row moves): hygiene log present and no un-rolled-back
  rows of this script; the 19 entity rows present **by id and name** as in §3.0; 15 and 37 not SMS episodes,
  not standing, no parent, no children; projects 18–21 on 196–199 and named as TEST; 741 and 185 present by
  name; the scope filter yields exactly 664 rows, all active, all on 196–199, none with `reference_id`; the
  employer-less rows are exactly 681 and 1537; every non-null `member_number` in scope is one letter + digits
  and shared with no worker outside the scope (§5 P1); no worker outside the 664 sits on projects 18–21; no
  membership or placement of the 664 outside 15/37; worker 1536 exactly `emp=791 ws=197 active cwm=37/50/64
  profiles=37/50/64 cwo64=0`; campaigns 50 and 64 present; roles exactly the ten ids, `program_worksites`
  exactly 13–15, `campaign_employers` exactly 15:791, 37:791, `campaign_worksites` exactly the six rows,
  units exactly 25–27 in group 3, group 3 the only group; the §3.1.2 cross-checks all 0; every cascading child
  table has a primary key; no composite key reaches a root.
- **Step A1**: worker 1536 leaves campaign 64 — membership row 11434, any placement in a unit of 64 (0
  today), the activist profile (64, 1536); each logged as `delete` with the full row.
- **Lock** (review finding 10): `LOCK TABLE workers, campaign_worker_membership, campaign_worker_ou IN SHARE
  ROW EXCLUSIVE MODE` right after the guard, so a concurrent sync-on-open waits instead of failing the run late.
- **Collect** (review finding 1): `pg_temp.da02_collect_root` gathers, for all six roots in the stated order
  and before anything moves, the root rows and their cascade closure breadth-first into `_da02_doomed`
  (`root`, `root_ord`, `table_name`, `depth`, `row_pk`, `row_data`; a row already collected under an earlier
  root stays there). A `$cross_root$` block then asserts 664 worker rows in the closure and that no closure
  row references, through a non-deferred `NO ACTION`/`RESTRICT` key, a closure row of an earlier root (review
  finding 6; 0 today).
- **Step S** (`pg_temp.da02_apply_set_null`): once, against the full closure — every row outside it that a
  `SET NULL` key (self-referencing keys included, review finding 5) points at a closure row is logged as
  `update` (full `before_row`, `after_row` = the column nulled, one log row per row and column) and the column
  is nulled. A closure row is never touched here, so `worker_notes` 4 and 5 are logged once, as deletes.
- **Steps B–E, F–G** (`pg_temp.da02_remove_root`): per root, the tables are put in a topological order over
  every foreign key between them (CASCADE, NO ACTION, RESTRICT; SET NULL keys were resolved in S): a table is
  deleted only once no other pending table of the root references it; a cycle, if one ever appears, falls back
  to deepest-first with a NOTICE. The root's closure rows are logged as `delete` in that order (so the log
  reverses into parents-first for the rollback) and deleted by primary key in the same order, asserting after
  every table that its count fell by no more than the rows logged. Roots in order: campaigns (15, 37), workers
  (the 664), projects (18–21), programs (6), then A2, then worksites (196–199), employers (787–794). The three
  temp functions are dropped before `COMMIT` (review finding 14).
- **Step A2** (between E and F, because `workers.employer_id`/`worksite_id` are `NO ACTION` on 197 and 791):
  `UPDATE workers SET employer_id = 741, worksite_id = 185 WHERE worker_id = 1536 AND employer_id = 791 AND
  worksite_id = 197`, logged as `update` with 1536's full before and after rows. Runs after B and A1 so that
  `fn_activist_profile_on_role_change` (AFTER UPDATE, `baseline_schema.sql:2114`) finds only campaign 50,
  whose profile exists (`fn_ensure_activist_profile` is `ON CONFLICT DO NOTHING`, `:2432`).
- **Hygiene-log rows** (`public._oux_hygiene_log`, WP0.4 shape; `script = '10_remove_test_dataset'`):
  one `delete` per removed row with `row_pk` (the primary key as jsonb) and `before_row` (the full row as
  jsonb, so the rollback can reinsert it with its primary key); one `update` per (row, column) nulled by a
  `SET NULL` key; one `update` for A2; and one `update` on the pseudo-table `_da02_snapshot` whose
  `before_row` holds the pre-run worker totals, per-table counts, per-campaign checksums and 1536's row, and
  whose `after_row` holds the post-run equivalents plus `rows_logged`. Predicted log rows (corrected walk of
  2026-09-23, preflight F = 16 on both projects): production 3,119 + 2 (A1) + 16 (SET NULL: `sms_conversations`
  3 × 2 + `soc_sessions` 3 × 3 + `worker_notes` 1) + 1 (A2) + 1 (snapshot) = **3,139**; clone 2,633 + 2 + 16 +
  1 + 1 = **2,653**. (The uncorrected script would have written 3,141 / 2,655 by logging `worker_notes` 4 and 5
  as updates before deleting them — review finding 1.)
- **Post-assertions**: the 19 entity rows and the ten roles gone; workers total and active both down by
  exactly 664 and exactly 664 worker rows logged; 1536 exactly `emp=741 ws=185 active cwm=50 profiles=50
  cwo64=0`; every table in the foreign-key neighbourhood of the deleted rows has a count that fell by
  exactly the rows logged for it (a `WARNING`, not a stop, for an unrelated table that moved during the
  run); delete-log rows = closure + A1; exactly one `workers` update row; every campaign other than 15, 37
  and 64 has identical membership and placement checksums, 64 has one membership fewer and identical
  placements, 15 and 37 are gone; the `05` `test` worksite cluster and `testco` employer cluster are empty.
- **Appended read-only `SELECT` after `COMMIT`**: `workers_active`, `workers_total`, `campaigns_15_37`,
  `employers_787_794`, `worksites_196_199`, `roles`, `w1536`, `test_worksite_cluster`, `log_rows_pending`,
  `snapshot_rows_logged`. Expected on production: 5085, 5900, 0, 0, 0, 0, `emp=741 ws=185 cwm=50`, 0, 3139,
  3138 (the snapshot counts the rows logged before its own log row is appended, so it is one less than
  `log_rows_pending`; `90` compares against pending rows excluding the snapshot). On the clone: 1629, 1743, 0, 0,
  0, 0, the same 1536 line, 0, 2653, 2652.

### 3.3 `90_rollback.sql` (mutating, one transaction; precondition = exactly the state `10` leaves)

- **Preconditions**: pending rows of `10_remove_test_dataset` (`rolled_back_at IS NULL`) exist with exactly
  one `_da02_snapshot` row and only `delete`/`update` actions; the pending rows (snapshot excluded) number
  exactly `after_state->>'rows_logged'` (review finding 11), and on clone/dev the worker totals equal the
  snapshot's `after_state`; every logged table still exists with a primary key; the 19 entity rows absent; 741 and 185 present by name; 1536 exactly `emp=741 ws=185 cwm=50
  profiles=50`; no logged delete row is already back; every logged update row still exists; no user trigger
  on a logged table is already disabled.
- **Replay** (fix round 4 — independent of the log order): user triggers on every logged table disabled
  (`ALTER TABLE … DISABLE TRIGGER USER`; foreign-key triggers stay live). The pending *tables* are put in a
  parents-first topological order computed from `pg_constraint` (single-column keys between pending tables;
  self-references ignored; `DEFERRABLE` keys treated as absent): a table is placed once every table it
  references is placed; when nothing is ready (a genuine cycle) the table whose unplaced parents are all
  reached through *nullable* columns is placed next with those columns relaxed (inserted `NULL`, completed by
  a full-row update once its parents have landed); a cycle with no such table stops the file. `delete` rows
  are reinserted table by table in that order, by `log_id` ascending, via `INSERT … SELECT … FROM
  jsonb_populate_record(NULL::table, before_row)` with an explicit column list (generated columns excluded,
  `OVERRIDING SYSTEM VALUE` when the table has a `GENERATED ALWAYS` identity column). After every delete-row
  has landed and the relaxed rows are completed, the `update` rows (SET NULL restorations, 1536's re-point)
  are applied newest-first by primary key (every column including `updated_at`, identity-always columns
  excluded). A retry loop remains as a safety net: a row that still hits a foreign-key violation is deferred,
  passes continue while any row lands, and the file stops only when a whole pass lands nothing — naming the
  row, its table, the violated constraint and the parent table. Triggers re-enabled; the forward rows stamped `rolled_back_at = now()`; each
  replayed row logged under `script = '90_rollback'` (`insert` with `after_row`, or `update` with the
  pre-restore row as `before_row`).
- **Post-assertions** (review finding 2 — deltas against the rollback's own before-state, so the file is
  runnable at any time until the log rows are dropped): nothing deferred; replayed rows = pending rows; no
  forward row unstamped; workers total and active = own before + 664; all 19 entity rows back; 1536 on 791/197
  with memberships/profiles 37/50/64; every logged table = own before + rows reinserted (strict for logged
  tables and their foreign-key neighbourhood, warning otherwise); campaigns 15 and 37 equal to the forward
  snapshot; campaign 64 = own before + 1 membership, placements unchanged; every other campaign's membership
  and placement checksum unchanged across the rollback; no snapshot campaign missing; zero orphans across
  every foreign key touching a logged table; every trigger back in its pre-run state. Where
  `public._oux_env_marker` exists (clone/dev) the forward snapshot is additionally enforced byte-for-byte —
  every table count, every campaign checksum, 1536's row — because nothing else moves there between the runs;
  on production those comparisons are reported as `WARNING`s (the weekly batch may have moved them).
- **Appended read-only `SELECT` after `COMMIT`**: `forward_rows_pending` 0, `campaigns_15_37` 2,
  `employers_787_794` 8, `worksites_196_199` 4, `workers_active` = own before + 664 (2293 on the clone rehearsal; 5749 on production
  only if nothing moved since the forward run), `w1536` `emp=791 ws=197 cwm=37/50/64`. Then `00_preflight.sql`
  again: every section identical to the pre-forward output apart from the two section-K log-count rows (the
  verifier diffs the two).

### 3.4 Decisions taken in this plan

1. **Soft-delete first (§7 risk row) is not used; the logged-rows approach satisfies "reversible".** The
   risk row's safeguard is "confirm against the membership system export; soft-delete first, hard-delete a
   week later". The identification is confirmed three ways without the export: every one of the 664 sits on
   a `TEST` worksite under a `TEST`/`TestCo` employer created in two same-day batches; none carries
   `reference_id`, which is the key the membership sync matches on
   (`membership-import-wizard.tsx:797–798`) and which 5,229 real workers on production carry; and the
   September sync touched none of them (0 transition and 0 history rows, `updated_at` all 2026-08-20). A
   soft-delete would leave the 664 inside every density report (`is_active = false` rows are still counted
   by the pack's `workers` row and by every campaign universe that does not filter on it), would not remove
   campaigns 15 and 37, and would need its own rollback. The hard delete is reversible row-for-row from
   `_oux_hygiene_log` — the rehearsal proves it (§4) — and it can be reversed on production at any time
   until the log rows are dropped (§6). The week of grace is kept as a process step instead: the operator
   holds `99`-style log clean-up for at least 30 days (the WP0.4 retention rule,
   `oux-wp0.4/00_create_hygiene_log.sql:45–48`), during which `90_rollback.sql` restores everything: its
   post-assertions are deltas against its own before-state (§3.3), so it runs after the weekly batch has moved
   other campaigns, and only on the clone does it also demand byte-identity with the forward snapshot.
2. **Triggers.** The four row-level DELETE triggers in `public` (review finding 7):
   `campaigns.trg_prevent_live_sms_episode_delete` (15/37 are not episodes; asserted),
   `call_list_scripts.trg_cls_sync_current` (`sync_call_list_current_script`, `baseline_schema.sql:6271`: nulls
   `call_lists.script_id` on a row that is itself being deleted),
   `campaign_agreements.trg_sync_campaign_replaced_agreement` and
   `worker_campaign_facts.trg_worker_campaign_fact_history` (writes `worker_campaign_fact_history`, a table
   with no foreign key, which the count check would not notice); `campaign_agreements` holds 0 rows for 15/37
   and `worker_campaign_facts` 0 rows for 15/37 or the 664 on both projects, and `10` asserts both before any
   row moves. The SET NULL updates fire `updated_at` triggers on `sms_conversations` and
   `soc_sessions`; the rollback restores `updated_at` from `before_row` with triggers off. A2 fires
   `trg_workers_updated_at` (expected), `trg_validate_worker_project_worksite` (1536 has no project; no-op),
   `refresh_gate_on_worker_update` (a `pg_notify`), `workers_phone_e164_sync` (phone unchanged; no-op),
   `trg_workers_normalize_non_oa_union_option` (no-op) and `trg_activist_profile_on_role_change` (see A2
   above). `campaigns_enforce_one_level` and `cwo_set_group_id`/`cou_default_group`/`cou_after_group_change`
   are INSERT/UPDATE triggers: irrelevant to the forward deletes, and disabled during the rollback, whose
   reinserted rows already carry their `group_id`. The rollback disables user triggers because otherwise
   `fn_activist_profile_on_membership`, `fn_task_list_item_side_effects`, `fn_auto_rate_promote_task_list_leader`
   (which also updates `workers.member_role_type_id`), `auto_add_soc_capacity` (inserts a `plan_capacities`
   row the log then re-inserts), `propagate_employer_scope` (upserts `employer_scopes.is_current`) and
   `update_connection_stats_on_activity` (increments counters already restored) would create or alter rows
   the log does not contain. `session_replication_role` is not available to `postgres` here
   (`has_parameter_privilege` = false on both projects), hence `ALTER TABLE … DISABLE TRIGGER USER` per
   table, restored and asserted before `COMMIT`.
3. **RLS** does not apply: every affected table is owned by `postgres`, none has `FORCE ROW LEVEL SECURITY`,
   and `postgres` has `BYPASSRLS` (both projects). The scripts are run as `postgres` per the run-sheet rules.
4. **Views and materialised views.** The one materialised view, `worksite_hierarchy_report_rows_mv`, holds 55
   rows on both projects and none of them names a synthetic worksite or employer (the base view filters to
   scoped roles the TEST rows never had), so no refresh is needed; `refresh_worksite_hierarchy_report_rows_mv()`
   remains available to the operator. Ordinary views recompute.
5. **Audit and batch tables left alone.** `import_logs` (68 rows on production, 42 on the clone) and
   `membership_update_batches` (1 row on production; the table does not exist on the clone) have no foreign
   key to any table in the closure and are not touched. `_oux_hygiene_log` gains the rows of §3.2.
   `worker_history` and `worker_membership_transitions` cascade from `workers` but hold 0 rows for the 664.
   `an_tag_sync_log` (16 rows of campaigns 15/37) and `worker_an_tags` (386 rows of the 664) are deleted with
   their parents; whatever Action Network holds for these synthetic people is outside the database (§5 P5).
6. **Sequences and identity.** Every primary key in the 72 tables is a plain serial (`nextval` default) except
   `campaign_groups.group_id`, which is `GENERATED BY DEFAULT AS IDENTITY`; both accept explicit values on
   insert, so the rollback restores the original keys without `OVERRIDING SYSTEM VALUE`. The only
   `GENERATED ALWAYS` identity columns in `public` are `campaign_ambition_revisions.id` and
   `_oux_wp21_canonical_basis.mapping_id` (0 rows in scope); the rollback adds `OVERRIDING SYSTEM VALUE` for
   any table that has one. Generated columns (`intractable_bargaining_tracker.nine_month_threshold_at`,
   `pabo_applications.voter_turnout_pct`, production-only `membership_movement_snapshots.net_movement`; 0 rows
   in scope) are excluded from the reinsert column list. Deletes do not move sequences and the reinserted ids
   are below every sequence's current value, so no `setval` is needed or performed.
7. **Why the closure is computed at run time rather than hard-coded.** Production carries ten foreign keys
   the clone lacks (§3.1.1) and the weekly membership batch keeps moving campaign 37's memberships; a
   hard-coded table list would be wrong on one of the two projects. The forward script therefore reads
   `pg_constraint`, logs whatever it finds, and proves afterwards that every table's count fell by exactly
   the rows it logged. The preflight prints the same closure so the operator compares before running.
8. **Worker 1536's activist profile for campaign 64** is removed with the membership (A1): it was derived
   from that membership by `fn_activist_profile_on_membership` (`baseline_schema.sql:2064`), and a profile
   without a membership is a state the application never creates. Its worker-list and email-list items in
   campaign 64 (2 and 4 rows) are organiser artefacts of a live campaign and stay (§5 P3).
9. **Why D16 survives the next membership batch** (review finding 13). Campaign 64's `campaign_employers` are
   28, 39, 40, 83, 84, 716, 721, 728 — neither 791 nor 741 — so 1536's membership of 64 was manual and a
   universe refresh will not re-add it; campaign 50's employers are 741 and 795 (sector-wide worksites), so
   1536's membership of 50 survives the re-point to 741/185. That is what keeps "member of 50 only" true
   after the run and `90`'s `cwm=50` precondition stable (identical on both projects).

### 3.5 Run order

Clone (verifier, connector, one file per submission, under approval per file): `00` → `10` dry run (final
`COMMIT;` replaced by `ROLLBACK;`; the appended `SELECT` shows the pre-run values) → `10` → `00` → `90`
→ `00` (identical to the first) → `10` → `00` (identical to the second) → `90` if the clone is to be left
as found, else leave it forward (D17: the 12 September clone is retired once the fresh clone matches
production). Production (operator, SQL editor, `SET LOCAL oux.env = 'production';` after every `BEGIN;`):
`00` → `10` → `00` → the profiling pack `00`–`07` → paste into §11. `90` only on a stop condition (§5).

## 4. Acceptance evidence

Stated before implementation; the verifier pastes against these.

| criterion | production (22 Sep 2026 preflight) | clone (12 Sep copy, 22 Sep preflight) |
|---|---|---|
| active workers fall by 664 | 5,749 → **5,085**; total 6,564 → 5,900 (`wp/da0.1.md` does not exist yet; the verifier records the DA0.1 baseline there and cites it here) | 2,293 → **1,629**; total 2,407 → 1,743 |
| `05_candidate_clusters.sql` lists no `test` worksite cluster (and no `testco` employer cluster) | today: `196, 197, 198, 199` under `test`; `787, 791` under `testco` → after: none / none | same |
| campaigns 15 and 37 gone | 2 → 0 | 2 → 0 |
| worker 1536 a member of 50 only, on 741/185 | `cwm=37/50/64` → `cwm=50`; profiles `37,50,64` → `50` | same |
| campaign 64 checksum | memberships 364 → 363 (`1a0c723847c7ffb4ad326df1b7dd14ca` changes), placements 398, `35d998b8f3b183ccd8b37a46299cab3f` unchanged | memberships 276 → 275 (`7136269b71a6a2e4bc17f4725f9ac5c7` changes), placements 266, `44160600fd8b9db457e9f1d9ea2e5353` unchanged |
| every other campaign checksum identical before and after | the 21 lines below | the 19 lines below |
| rows logged by `10` | 3,139 | 2,653 |
| `_oux_hygiene_log` rows | 736 → 3,875 | 346 → 2,999 |
| rehearsal | not rehearsed on production (operator run after the clone rehearsal) | `00` after `90` identical to `00` before `10`, and `00` after the second `10` identical to `00` after the first — in both cases excluding the two section-K rows that count the log (`hygiene_log rows=`, `hygiene_log_da02_pending/rolled_back`) |
| pack delta (`00_profile_counts.sql` rows) | workers −664, workers_active −664, employers 187 → 179, worksites 194 → 190, worksites_active 188 → 184, employer_worksite_roles 251 → 241, worksite_scopes 49 → 13, employer_scopes 28 → 10, programs 4 → 3, program_worksites 10 → 7, projects 20 → 16, campaigns 24 → 22, campaign_groups 25 → 24, campaign_organising_units 253 → 250, campaign_worker_ou 2,506 → 2,191, campaign_worker_membership 3,456 → 3,068, campaign_employers 48 → 46, campaign_worksites 122 → 116 | workers −664 ×2, employers 171 → 163, worksites 174 → 170, worksites_active 168 → 164, roles 251 → 241, worksite_scopes 49 → 13, employer_scopes 28 → 10, programs 4 → 3, program_worksites 10 → 7, projects 20 → 16, campaigns 22 → 20, campaign_groups 20 → 19, campaign_organising_units 239 → 236, campaign_worker_ou 1,921 → 1,847, campaign_worker_membership 2,726 → 2,579, campaign_employers 46 → 44, campaign_worksites 122 → 116 |

Per-campaign checksums before (`mem_n` / `mem_md5` / `ou_n` / `ou_md5`), production:

```
15: 72 b751b5c2a8a9b2cf53e9e5640d281a34 / 0 -                                 (gone after)
21: 67 2937c80e02fe8becaa07c7ffe1d256dd / 56 a4a18aea21b97d26f41e218b02d0ca0e
23: 48 f34b53b239b9fd56ca94fc7cb6cc225c / 48 09ff42f537438944a8d3b2f94011d5d2
26: 216 b4269d914fbd8bfac345e176ad363252 / 284 324322f19429a54158564c895b906096
27: 382 5822502b20164b0858e5b8ccbb632a55 / 15 a752065f2b97c70c15eec56fe06c859c
37: 315 b7709bac401060f477decaad8c50308b / 315 a43874c65310cc4c04c68048cdc3edcd  (gone after)
41: 61 3001d5cf0785e7aa5276dd4a6910c44f / 61 f6f391cda8752629015da30fde8a286d
42: 140 9a37ce058f996d2737abacb31048ef65 / 199 aeec1e99281df286b8ca72b12497b553
47: 223 16bd5db083ed0b753a026ae1f7226e38 / 85 72334c25b42643e7a0b2ee37e68ab283
48: 219 4a22632a0272b0c714b76ccc4a934228 / 0 -
49: 0 - / 0 -
50: 11 a81a54f527e16008b6a75b0b775d0987 / 0 -
55: 11 e8cf11c48e46d8f34039b5b35a77640c / 11 b6ea2d85d5601356f1e3286b3c5ef2c6
57: 639 9be83446f012fec8023fe67d3a413be0 / 786 aa8361d776cc568b52d9136591b2692b
58: 28 3787f32edb4f999314087158fb662100 / 28 46ef975145f25459b0843c97f3c35e98
59: 196 2b32133f470a84cd7beb149b218ac909 / 196 d99f4d4ac3287e2fb1d0549a50a7962b
60: 224 8dbf2decb5fbe06ccd283a194650c690 / 0 -
61: 52 2a86d8c1707e9044d9077c4b5295b536 / 11 1a4747a6a422a702db6a133a8c8cacf4
62: 64 f1dfbed6a6a17dba8543b9dff36cf663 / 13 6e2219f80e2cbabd281e800a90526abc
64: 364 1a0c723847c7ffb4ad326df1b7dd14ca / 398 35d998b8f3b183ccd8b37a46299cab3f  (mem_n 363 after; ou unchanged)
65: 15 624e331880f7fa0e847a2f64b0b369b0 / 0 -
66: 14 aacd19f73847e0abf558250e91c4c9b4 / 0 -
68: 39 97d0612c23ebb81649527dbbe9bf3dcb / 0 -
69: 56 48ca87942a8829145233718c103e1278 / 0 -
```

Clone:

```
15: 72 b751b5c2a8a9b2cf53e9e5640d281a34 / 0 -                                 (gone after)
21: 146 eb1620a94589f1af3a1c6c635b405e90 / 0 -
23: 48 f34b53b239b9fd56ca94fc7cb6cc225c / 48 09ff42f537438944a8d3b2f94011d5d2
26: 216 b4269d914fbd8bfac345e176ad363252 / 284 324322f19429a54158564c895b906096
27: 80 cc2ec66e0618ac90f302740ebfe17fe7 / 15 a752065f2b97c70c15eec56fe06c859c
37: 74 4055c684d3e0a83a260bbfc99d014b24 / 74 844df0fbe36847ba9ba6312f8b0c2232    (gone after)
41: 61 3001d5cf0785e7aa5276dd4a6910c44f / 61 f6f391cda8752629015da30fde8a286d
42: 212 0684c5c5720da040c254258ac3c997f7 / 236 5f03d021e0d04e58ab63930e8cd852a6
47: 223 16bd5db083ed0b753a026ae1f7226e38 / 85 72334c25b42643e7a0b2ee37e68ab283
48: 219 4a22632a0272b0c714b76ccc4a934228 / 0 -
49: 0 - / 0 -
50: 8 e32c927b307976328bd90e447284e248 / 0 -
55: 11 e8cf11c48e46d8f34039b5b35a77640c / 11 b6ea2d85d5601356f1e3286b3c5ef2c6
57: 305 88ea6e21af475cfcd6b8efc1c54addfc / 606 768839e6dbebae44921bf7d7e9b1146c
58: 28 3787f32edb4f999314087158fb662100 / 28 46ef975145f25459b0843c97f3c35e98
59: 196 2b32133f470a84cd7beb149b218ac909 / 196 d99f4d4ac3287e2fb1d0549a50a7962b
60: 224 8dbf2decb5fbe06ccd283a194650c690 / 0 -
61: 48 e235cb0622d6e925f9dc3486f7f55f73 / 11 1a4747a6a422a702db6a133a8c8cacf4
62: 64 f1dfbed6a6a17dba8543b9dff36cf663 / 0 -
64: 276 7136269b71a6a2e4bc17f4725f9ac5c7 / 266 44160600fd8b9db457e9f1d9ea2e5353  (mem_n 275 after; ou unchanged)
65: 55 999f5a93438dfe8ba039746b572f1e74 / 0 -
66: 160 93e2ee6beca5f4b77594580a4e0d30ca / 0 -
```

Schema fingerprints (preflight section K) differ between the projects (production `fp_fk_edges`
`5e7810dd3dc98a8b7e9422bc28b0be35`, `fp_triggers` `77188aa72ca7ea05abce584ca792bbbe`; clone
`2b7d6ab91d81159de92a4266d0ed6f59`, `eae74d6efa782f8a1ac9f7ae48089e67`) because of the production-only
tables in §3.1.1; the column set of the 72 affected tables is identical (`8a645cf1eb10c4c4ea80b62ebc678b64`
on both). PostgreSQL 17.6 on both.

## 5. Operator inputs

| id | input | tied to | default if unanswered |
|---|---|---|---|
| P1 | **Confirm the reading of `member_number`.** D4 says none of the 665 has a membership number. 304 of the 664 carry a value in `workers.member_number` (one letter + 6–7 digits, all distinct, shared with no other worker); no other worker in either database carries `member_number` at all — `OA_UNIVERSE_ALIGNMENT_PLAN.md:176` calls it "a dead column (no index, never written)", and there is indeed no index on it while `reference_id` carries `workers_reference_id_unique`. Both wizards match `reference_id → email → phone` (the worker wizard adds a name tier, `:176`; `membership-import-wizard.tsx:797–798`): none of the 665 has a `reference_id` (5,229 real workers on production do), none shares a `phone_e164` or an email with any worker outside the scope (0 / 0 on both projects), and 663 of the 664 emails match the test-address pattern. 29 of the 664 share first + last name with a worker outside the scope (6 on the clone), which is expected of a generated fixture and is why the phone/email result carries the identification. The plan reads the 304 values as part of the synthetic fixture. | `10` precondition ("no `reference_id`; `member_number` synthetic in shape and unshared") | **stop** — the forward script is not run on production until the operator confirms |
| P2 | Confirm that workers 681 (employer NULL, worksite 197, in the 16 April batch), 1537 (employer NULL, worksite 197, created 27 May, member of 37) and 1541 (employer 791, worksite 197, created 3 June, member of 37) are synthetic. They are inside the 664 that D4 counted (350 + 312 + 1536 + 1537 + 1541 = 665), but 1537 and 1541 were created by hand on the days after 1536. **Worker 1537 is the only one of the 664 whose email does not match the test-address pattern** (681 and 1541 match it; preflight B row `email_not_test_patterned_ids`); its email and phone are shared with no worker outside the scope. | `10` precondition (681 and 1537 pinned as the employer-less pair; 1541 inside the filter) | included, as D4 counted them |
| P3 | Worker 1536's campaign-64 artefacts beyond the membership: the activist profile (64, 1536) is removed with the membership (§3.4 item 8); its 2 worker-list items and 4 email-list items in campaign 64 stay. | step A1 | as stated |
| P4 | A quiet window for the production run: `10` locks `workers`, `campaign_worker_membership` and `campaign_worker_ou` `IN SHARE ROW EXCLUSIVE MODE` (writers wait, readers do not) and its count assertions on the other affected tables are strict (a concurrent write aborts the transaction harmlessly); `90` holds SHARE ROW EXCLUSIVE locks on every logged table (~72, taken by `ALTER TABLE … DISABLE TRIGGER USER`) until its `COMMIT`, so application writes to those tables block for its duration (review finding 9). Run before the next weekly membership batch, so DA0.1's baseline and the 5,085 figure line up. | §3.5 | operator schedules |
| P5 | Whether Action Network holds people or tags for the synthetic workers (386 `worker_an_tags` and 16 `an_tag_sync_log` rows are deleted here; nothing outside the database is touched). | §3.4 item 5 | out of scope; noted for the ledger's incidental findings |
| P6 | Acknowledge that the roles in scope are 10, not the 11 in the §5 row and the orchestration paragraph (§3.0). | `10` precondition pins the ten ids | the plan proceeds on 10 |
| P7 | **Authorise fix round 3 and the resumed clone rehearsal** (`ORCHESTRATION_PROMPT.md:44`: a third fix round stops for the operator). The fix is one projection line in `90_rollback.sql` (§10 fix round 3), prepared and cross-checked but **not rehearsed**. Resume from step 4 against the clone's current post-forward-1 hold state (§11): `90` → `00` #3 compared with `00` #1 (identical apart from the two section-K log-count rows) → `10` forward 2 → `00` #4 compared with `00` #2. | §3.5 steps 4–7; §11 | **stop** — nothing runs on the clone until authorised |

Stop conditions (any one halts the package and goes to the operator): the clone's synthetic set differs from
production's in any row of §3.0 or §3.1.2 other than the three bold cells (the 664 ids' md5 is identical
today); the preflight at run time shows a G BLOCKER row other than worker 1536's two; any H cross-check other
than the four worksites and program 6 is non-zero; a doomed-table count at run time differs from the
preflight prediction by anything the weekly batch cannot explain (only `campaign_worker_membership`,
`campaign_worker_ou`, `worker_an_tags`, `campaign_activist_profiles`, `reporting_snapshots` may move);
`10`'s appended `SELECT` differs from §3.2's expected values (run `90`, report); the rehearsal's `00` after
`90` is not identical to `00` before `10`; a third fix round is needed.

## 6. Risks

| risk | safeguard |
|---|---|
| The identification is wrong and real people are deleted | Every row pinned by id **and** name in the preconditions; the 664 must all be active, on a `TEST` worksite, without `reference_id`; the two employer-less rows pinned to 681 and 1537; the 664 ids' md5 identical on both projects; P1/P2 confirmed before production; every deleted row logged with its full content and reinsertable by `90` until the log is cleaned up |
| A cascade removes a row the log does not hold | Rows are deleted explicitly deepest-first so cascades find nothing; the count of every table in the foreign-key neighbourhood must fall by exactly the rows logged; the closure walk reads `pg_constraint` at run time, so production-only keys are covered; a composite key reaching a root stops the file |
| A `NO ACTION` key outside the stated order blocks the delete | The preflight's G section and the `10` preconditions list every such reference; today only 1536's, resolved by A2 before F and G; anything else stops before a row moves |
| Campaign universes elsewhere change | The 664 have no membership or placement outside 15/37 (asserted); every other campaign's checksum is asserted identical, 64's asserted at −1 membership and identical placements |
| Triggers create or alter rows during the rollback | User triggers disabled per logged table for the rollback transaction and their pre-run state asserted afterwards; the forward script leaves triggers on (only two benign DELETE triggers exist) |
| Rollback reinserts in the wrong order | Reverse log order is parents-first by construction (topological within each root); foreign-key violations are retried per pass and, for mutual references, resolved by a relaxed insert plus full-row completion; a zero-orphan check across every touched key closes the transaction |
| Rollback needed after production has moved on | `90` asserts deltas against its own before-state and demands byte-identity with the forward snapshot only where `_oux_env_marker` exists; it stays runnable until the log rows are dropped (§3.3, §3.4 item 1) |
| `_oux_hygiene_log` holds the deleted rows' personal data | Same posture as WP0.4: RLS on, revoked from `anon` and `authenticated`, readable by `postgres`/`service_role` only; nothing is exported; the plan carries counts and ids only |
| The log is dropped before anyone wants the rollback | WP0.4 retention rule (30 days after the last script run, phase exit signed off); the DA0.2 rows stay until the operator signs the ledger row off |
| The clone rehearsal passes but production differs (weekly batch, production-only tables) | The scripts derive everything from the catalogue and the live rows and assert exact deltas; the preflight is run on production immediately before `10` and compared with §3.1.2; P4 quiet window |
| Reports that read `employer_worksite_roles` / `worksite_scopes` | The 10 roles and 36 scopes belong to the TEST rows only (§3.0); the materialised view holds none of them |

## 7. Approval

**Approved by the orchestrator, 2026-09-22**, against the §5 row, D4 and D16 and the rules, with these conditions:

1. **P1, P2 and P6 gate the production run sheet, not the clone rehearsal.** The clone is a copy whose rollback is
   proven by the rehearsal itself, so `10` may run there once the Fable review (§10) returns no blocking finding.
   On production, `10` is not handed over until the operator has confirmed in writing (a) that the 304
   `member_number` values on the synthetic workers are part of the fixture (`reference_id`, the membership
   system's key, is null on all 664 and set on 5,229 real workers), (b) that workers 681, 1537 and 1541 are
   synthetic, and (c) that the roles in scope are the ten listed (the §5 row's "11" was a count error). The
   orchestrator puts all three to the operator in the Phase 0 hand-over.
2. The eight decisions in §3.4 are accepted, including no soft-delete-first (the logged-row rollback and the
   30-day log retention replace it) and the run-time closure from `pg_constraint`.
3. P3 (1536's campaign-64 list items stay) and P5 (Action Network is outside the database) are accepted as the
   defaults; P5 is recorded in the ledger's incidental findings.
4. Clone run order per §3.5, left **forward** at the end (D17 retires this clone after Phase 0); DA0.3's clone
   rehearsal follows DA0.2's, matching the production order DA0.2 → DA0.5 → DA0.3 (DA0.5 is already on the clone).
5. No file under `scripts/data-hygiene/da0.2/` names a project or contains `SET LOCAL oux.env`.

## 8. Deviations from plan

- **2026-09-23, fix round 1 (planner, on the reviewer's findings):** (a) the forward script collects the
  closure of all six roots before any SET NULL update or delete, and applies SET NULL once against the full
  closure (finding 1); (b) deletes within a root follow a topological order over the foreign keys between the
  root's tables instead of depth-desc/name (finding 6); (c) `90` asserts deltas against its own before-state
  and enforces snapshot byte-identity only under `_oux_env_marker` (finding 2); (d) `10` takes SHARE ROW
  EXCLUSIVE locks on the three organiser-written tables (finding 10); (e) self-referencing keys join the SET
  NULL step and the delete ordering (finding 5); (f) the temp functions are dropped before `COMMIT` (finding
  14); (g) `00`'s `env_marker` row is guarded so the file runs on production, where the marker table does not  exist (found while re-running the preflight). Predicted log rows unchanged at 3,139 / 2,653.
- **2026-09-24, fix round 4 (planner, operator-authorised rehearsal continuation):** `90`'s replay no
  longer relies on reverse log order (§3.3); and its clone/dev byte-identity check on worker 1536 now compares
  only the keys present in the snapshot (`before_state->'w1536'`, 49 keys): DA0.3's migration added three
  nullable columns to `workers` on the clone after forward 1 (`employer_name_raw`, `worksite_name_raw`,
  `names_import_id`, all absent from the snapshot), and the check is about the values the script changed,
  not later schema drift. Every snapshot key is still a `workers` column on the clone.
- **2026-09-24, fix round 2 (planner):** the clone rehearsal stopped in `10`'s `$preconditions$` block
  (`record "r" is not assigned yet`: the SQL alias `r` on `campaign_unit_rules` collided with the block's
  DECLAREd `r record`); the alias is now `cur`. **Rehearsal procedure change:** before the real forward run on
  the clone, the verifier dry-runs `10` once with its final `COMMIT;` replaced by `ROLLBACK;` — script errors
  then surface without changing data, and the appended read-only `SELECT` run after the rollback is expected
  to show the pre-run values (workers_active 2293, campaigns_15_37 2, employers 8, worksites 4, roles 10,
  `w1536 emp=791 ws=197 cwm=37/50/64`, log_rows_pending 0). The same dry-run is offered to the operator on
  production (§3.5); it holds the `10` locks for the run's duration only.

## 9. Verification record

_Verifier: paste `00` before, `10`'s appended `SELECT`, `00` after, `90`'s appended `SELECT`, `00` after
rollback, the second `10`, `00` after, and the pack delta table (`oa-universe/00`–`07`) here._

**Clone (`yqjkuobcawvigsfpgrcm`), 2026-09-23 — verifier (Sonnet), via the connector under the orchestrator's approval.**

### 00 #1 (before)

248 rows returned (section | k | v), matching §3.1's clone baseline exactly: `Σ rows / tables` (E) = 2633/72, `Σ update log rows` (F) = 16, `Σ rows` (G BLOCKER) = 2 (worker 1536's employer_id/worksite_id only), `Σ (keys total / rows)` (G2) = 20/2110, `hygiene_log rows=346`, `hygiene_log_da02_pending/rolled_back` = 0/0, `env_marker` = clone (2026-09-12), `scope_664_ids_md5` = f6589df6e2507a35542632026c3d0c34. All H cross-checks 0 apart from the four TEST worksites (196,197,198,199) and program 6, as expected.

```text
A identity | campaign:15 | Test2 (created 2026-04-16, status active, episode false, standing false, parent null)
A identity | campaign:37 | testco (created 2026-04-28, status active, episode false, standing false, parent null)
A identity | campaign:50 | Offshore Allliance internal (created 2026-05-28, status active, episode false, standing false, parent null)
A identity | campaign:64 | ROV sector wide (created 2026-08-20, status active, episode false, standing false, parent null)
A identity | employer:741 | Australian Workers' Union WA Branch (created 2026-04-01)
A identity | employer:787 | TestCo Energy (created 2026-04-09)
A identity | employer:788 | Fortis Maintenance Services (created 2026-04-09)
A identity | employer:789 | Pacific Coatings & Insulation (created 2026-04-09)
A identity | employer:790 | Alliance Site Services (created 2026-04-09)
A identity | employer:791 | TestCo 2 (created 2026-04-16)
A identity | employer:792 | Aegis Offshore Maintenance Pty Ltd (created 2026-04-16)
A identity | employer:793 | NorthStar Marine Coatings (created 2026-04-16)
A identity | employer:794 | Offshore Crew Services Ltd (created 2026-04-16)
A identity | ids_present | 8 employers, 4 worksites, 2 campaigns, 1 program, 4 projects (expected 8, 4, 2, 1, 4)
A identity | program:6 | TEST · TestCo 2 Offshore Maintenance Program (principal 791)
A identity | project:18 | Test Onshore Gas Plant Brownfields (worksite 196)
A identity | project:19 | TEST · TestCo 2 — Alpha — brownfields (worksite 197)
A identity | project:20 | TEST · TestCo 2 — Bravo — maintenance (worksite 198)
A identity | project:21 | TEST · TestCo 2 — Charlie — maintenance (worksite 199)
A identity | worksite:185 | AWU Head Office (created 2026-04-01, principal null)
A identity | worksite:196 | Test Onshore Gas Plant (created 2026-04-09, principal 787)
A identity | worksite:197 | TEST · TestCo 2 — Alpha FPSO (created 2026-04-16, principal 791)
A identity | worksite:198 | TEST · TestCo 2 — Bravo Platform (created 2026-04-16, principal 791)
A identity | worksite:199 | TEST · TestCo 2 — Charlie FPU (created 2026-04-16, principal 791)
B workers | all_total/active | 2407/2293
B workers | by_created:2026-04-09 | 350 (ids 322-671)
B workers | by_created:2026-04-16 | 312 (ids 672-983)
B workers | by_created:2026-05-27 | 1 (ids 1537-1537)
B workers | by_created:2026-06-03 | 1 (ids 1541-1541)
B workers | by_employer:787 | 80/80
B workers | by_employer:788 | 120/120
B workers | by_employer:789 | 55/55
B workers | by_employer:790 | 95/95
B workers | by_employer:791 | 72/72
B workers | by_employer:792 | 108/108
B workers | by_employer:793 | 48/48
B workers | by_employer:794 | 84/84
B workers | by_employer:null | 2/2
B workers | by_project:18 | 350
B workers | by_project:19 | 104
B workers | by_project:20 | 104
B workers | by_project:21 | 104
B workers | by_project:null | 2
B workers | by_updated:2026-08-20 | 664
B workers | by_worksite:196 | 350/350
B workers | by_worksite:197 | 106/106
B workers | by_worksite:198 | 104/104
B workers | by_worksite:199 | 104/104
B workers | cwm_664_other_campaigns | none
B workers | cwo_664_other_campaigns | none
B workers | email_not_test_patterned_ids | 1537
B workers | email_shared_with_outside | 0
B workers | email_test_patterned (contains "test") | 663
B workers | employer_in_scope_but_worksite_not | 0
B workers | member_number_not_null | 304
B workers | member_number_shape | alpha1digits:7=160,alpha1digits:8=144,null=360
B workers | member_number_shared_with_outside | 0
B workers | membership_sync_rows_for_664 (transitions/history) | 0/0
B workers | name_collisions_with_outside (first+last) | 6
B workers | outside_scope_member_number_not_null/reference_id_not_null | 0/770
B workers | phone_e164_shared_with_outside | 0
B workers | reference_id_not_null | 0
B workers | scope_664_ids_md5 | f6589df6e2507a35542632026c3d0c34
B workers | scope_664_total/active | 664/664
B workers | scope_incl_1536 | 665
B workers | workers_on_741/185 | 0/0
B workers | worksite_in_scope_but_employer_not_ids | 681,1537
C w1536 | activist_profiles (campaign) | 37,50,64
C w1536 | cwm (membership_id:campaign) | 2589:37,4451:50,11434:64
C w1536 | cwo (campaign:ou) | 37:25
C w1536 | row | emp=791 ws=197 proj=null active=true role_type=8 activist_like=true member_number_null=true reference_id_null=true created=2026-05-26
C w1536 | rows_in_campaign_64 | campaign_activist_profiles=1,campaign_leader_worker_links=0,campaign_worker_list_items=2,campaign_worker_membership=1,campaign_worker_ou=0,email_list_items=3
C w1536 | sms_conversations/sms_interactions/email_conversations (kept) | 4/58/1
D structure | activities/ratings_15_37 | 10/11
D structure | campaign_employers_15_37 | 15:791,37:791
D structure | campaign_groups_15_37 (campaign:group:kind) | 37:3:worksite
D structure | campaign_worksites_15_37 | 15:197,15:198,15:199,37:197,37:198,37:199
D structure | cwm_15_37_by_class | in664=145,w1536=1
D structure | delete_trigger_tables_in_scope (worker_campaign_facts / campaign_agreements) | 0/0
D structure | employer_worksite_roles (id:employer:worksite) | 82:787:196,83:788:196,84:789:196,85:790:196,87:791:197,89:793:197,91:791:198,93:793:198,95:791:199,97:793:199
D structure | organising_units_15_37 (campaign:ou:group:container) | 37:25:3:false,37:26:3:false,37:27:3:false
D structure | program_worksites_6 (id:worksite) | 13:197,14:198,15:199
D structure | project_employers (project:employer) | 18:787,18:788,18:789,18:790,19:791,19:792,19:793,20:791,20:792,20:793,21:791,21:792,21:793
D structure | set_null_rows (sms_conversations/soc_sessions/worker_notes with campaign 15/37) | 3,4,5 / 4,5,6 / 1
D structure | worksite_scopes/employer_scopes | 36/18
E doomed | activity_ambitions | 5 (max depth 3)
E doomed | an_tag_sync_log | 16 (max depth 1)
E doomed | call_attempt_outcomes | 2 (max depth 4)
E doomed | call_attempts | 1 (max depth 3)
E doomed | call_list_items | 146 (max depth 2)
E doomed | call_list_scripts | 1 (max depth 2)
E doomed | call_lists | 7 (max depth 1)
E doomed | call_outcome_definitions | 3 (max depth 1)
E doomed | call_script_sections | 1 (max depth 2)
E doomed | call_scripts | 1 (max depth 1)
E doomed | call_share_form_events | 14 (max depth 3)
E doomed | call_share_tokens | 6 (max depth 2)
E doomed | call_step_outcomes | 1 (max depth 4)
E doomed | campaign_activist_profiles | 16 (max depth 1)
E doomed | campaign_activities | 10 (max depth 1)
E doomed | campaign_activity_ratings | 11 (max depth 2)
E doomed | campaign_ambitions | 5 (max depth 1)
E doomed | campaign_comms_drafts | 6 (max depth 1)
E doomed | campaign_employers | 2 (max depth 1)
E doomed | campaign_groups | 1 (max depth 1)
E doomed | campaign_leader_form_events | 17 (max depth 4)
E doomed | campaign_leader_tokens | 2 (max depth 3)
E doomed | campaign_leader_worker_links | 58 (max depth 1)
E doomed | campaign_organisers | 2 (max depth 1)
E doomed | campaign_organising_units | 3 (max depth 1)
E doomed | campaign_situation_analyses | 1 (max depth 1)
E doomed | campaign_stage_plans | 13 (max depth 1)
E doomed | campaign_task_list_items | 23 (max depth 3)
E doomed | campaign_task_lists | 5 (max depth 2)
E doomed | campaign_worker_list_items | 336 (max depth 2)
E doomed | campaign_worker_lists | 57 (max depth 1)
E doomed | campaign_worker_membership | 146 (max depth 1)
E doomed | campaign_worker_ou | 74 (max depth 2)
E doomed | campaign_worksites | 6 (max depth 1)
E doomed | campaigns | 2 (max depth 0)
E doomed | email_click_tokens | 2 (max depth 3)
E doomed | email_list_items | 133 (max depth 2)
E doomed | email_lists | 5 (max depth 1)
E doomed | email_send_log | 133 (max depth 2)
E doomed | employer_scopes | 18 (max depth 1)
E doomed | employer_worksite_roles | 10 (max depth 1)
E doomed | employers | 8 (max depth 0)
E doomed | gate_definitions | 10 (max depth 1)
E doomed | oauth_send_batches | 5 (max depth 2)
E doomed | phone_call_action_lists | 7 (max depth 2)
E doomed | phone_call_actions | 6 (max depth 1)
E doomed | plan_ambitions | 37 (max depth 2)
E doomed | plan_capacities | 16 (max depth 2)
E doomed | plan_revision_notes | 1 (max depth 1)
E doomed | plan_theory_of_winning | 1 (max depth 2)
E doomed | plan_where_to_play | 12 (max depth 2)
E doomed | plan_wtp_ambitions | 7 (max depth 3)
E doomed | program_worksites | 3 (max depth 1)
E doomed | programs | 1 (max depth 0)
E doomed | project_employers | 13 (max depth 1)
E doomed | projects | 4 (max depth 0)
E doomed | reporting_snapshots | 8 (max depth 1)
E doomed | section_plan_situation_snippets | 1 (max depth 2)
E doomed | section_plans | 2 (max depth 1)
E doomed | sms_send_log | 4 (max depth 2)
E doomed | sms_survey_definition_versions | 1 (max depth 2)
E doomed | sms_survey_questions | 10 (max depth 2)
E doomed | sms_survey_sessions | 4 (max depth 2)
E doomed | sms_surveys | 1 (max depth 1)
E doomed | worker_activity_log | 2 (max depth 2)
E doomed | worker_an_tags | 386 (max depth 1)
E doomed | worker_campaign_connections | 2 (max depth 1)
E doomed | worker_notes | 2 (max depth 1)
E doomed | worker_tags | 74 (max depth 1)
E doomed | workers | 664 (max depth 0)
E doomed | worksite_scopes | 36 (max depth 1)
E doomed | worksites | 4 (max depth 0)
E doomed | Σ rows / tables | 2633 / 72
F set-null | sms_conversations.campaign_id -> campaigns | 3
F set-null | sms_conversations.worker_id -> workers | 3
F set-null | soc_sessions.campaign_id -> campaigns | 3
F set-null | soc_sessions.capacity_id -> plan_capacities | 3
F set-null | soc_sessions.plan_id -> campaign_stage_plans | 3
F set-null | worker_notes.campaign_id -> campaigns | 1
F set-null | Σ update log rows 10 will write | 16
G BLOCKER | workers.employer_id -> employers | 1
G BLOCKER | workers.worksite_id -> worksites | 1
G BLOCKER | Σ rows (expected 2: worker 1536 via employer_id and worksite_id) | 2
G2 NO ACTION within closure | campaign_organising_units.group_id -> campaign_groups (deferrable) | 3
G2 NO ACTION within closure | campaign_worker_ou.group_id -> campaign_groups (deferrable) | 74
G2 NO ACTION within closure | programs.principal_employer_id -> employers | 1
G2 NO ACTION within closure | projects.worksite_id -> worksites | 4
G2 NO ACTION within closure | workers.employer_id -> employers | 662
G2 NO ACTION within closure | workers.project_id -> projects | 662
G2 NO ACTION within closure | workers.worksite_id -> worksites | 664
G2 NO ACTION within closure | worksite_scopes.employer_id -> employers | 36
G2 NO ACTION within closure | worksites.principal_employer_id -> employers | 4
G2 NO ACTION within closure | Σ (keys total / rows) | 20 / 2110
H cross-checks | agreements_employer_in_scope | 0
H cross-checks | campaign_employers/worksites_in_scope_other_campaigns | 0/0
H cross-checks | campaigns_parent_in_scope | 0
H cross-checks | composite_fks_to_root_tables | 0
H cross-checks | documents_employer/campaign_in_scope | 0/0
H cross-checks | employers_parent_in_scope | 0
H cross-checks | programs_with_principal_in_scope | 6
H cross-checks | projects_absorbed_into_scope | 0
H cross-checks | sms_lists_15_37 | 0
H cross-checks | unit_basis/unit_rules_referencing_scope_other_campaigns | 0/0
H cross-checks | upcoming_project_employers_in_scope | 0
H cross-checks | workers_on_projects_18_21_outside_664 | 0
H cross-checks | worksite_contracts_in_scope | 0
H cross-checks | worksites_parent_in_scope | 0
H cross-checks | worksites_with_principal_or_operator_in_scope | 196,197,198,199
I checksums | campaign:015 | mem_n=72 mem_md5=b751b5c2a8a9b2cf53e9e5640d281a34 ou_n=0 ou_md5=-
I checksums | campaign:021 | mem_n=146 mem_md5=eb1620a94589f1af3a1c6c635b405e90 ou_n=0 ou_md5=-
I checksums | campaign:023 | mem_n=48 mem_md5=f34b53b239b9fd56ca94fc7cb6cc225c ou_n=48 ou_md5=09ff42f537438944a8d3b2f94011d5d2
I checksums | campaign:026 | mem_n=216 mem_md5=b4269d914fbd8bfac345e176ad363252 ou_n=284 ou_md5=324322f19429a54158564c895b906096
I checksums | campaign:027 | mem_n=80 mem_md5=cc2ec66e0618ac90f302740ebfe17fe7 ou_n=15 ou_md5=a752065f2b97c70c15eec56fe06c859c
I checksums | campaign:037 | mem_n=74 mem_md5=4055c684d3e0a83a260bbfc99d014b24 ou_n=74 ou_md5=844df0fbe36847ba9ba6312f8b0c2232
I checksums | campaign:041 | mem_n=61 mem_md5=3001d5cf0785e7aa5276dd4a6910c44f ou_n=61 ou_md5=f6f391cda8752629015da30fde8a286d
I checksums | campaign:042 | mem_n=212 mem_md5=0684c5c5720da040c254258ac3c997f7 ou_n=236 ou_md5=5f03d021e0d04e58ab63930e8cd852a6
I checksums | campaign:047 | mem_n=223 mem_md5=16bd5db083ed0b753a026ae1f7226e38 ou_n=85 ou_md5=72334c25b42643e7a0b2ee37e68ab283
I checksums | campaign:048 | mem_n=219 mem_md5=4a22632a0272b0c714b76ccc4a934228 ou_n=0 ou_md5=-
I checksums | campaign:049 | mem_n=0 mem_md5=- ou_n=0 ou_md5=-
I checksums | campaign:050 | mem_n=8 mem_md5=e32c927b307976328bd90e447284e248 ou_n=0 ou_md5=-
I checksums | campaign:055 | mem_n=11 mem_md5=e8cf11c48e46d8f34039b5b35a77640c ou_n=11 ou_md5=b6ea2d85d5601356f1e3286b3c5ef2c6
I checksums | campaign:057 | mem_n=305 mem_md5=88ea6e21af475cfcd6b8efc1c54addfc ou_n=606 ou_md5=768839e6dbebae44921bf7d7e9b1146c
I checksums | campaign:058 | mem_n=28 mem_md5=3787f32edb4f999314087158fb662100 ou_n=28 ou_md5=46ef975145f25459b0843c97f3c35e98
I checksums | campaign:059 | mem_n=196 mem_md5=2b32133f470a84cd7beb149b218ac909 ou_n=196 ou_md5=d99f4d4ac3287e2fb1d0549a50a7962b
I checksums | campaign:060 | mem_n=224 mem_md5=8dbf2decb5fbe06ccd283a194650c690 ou_n=0 ou_md5=-
I checksums | campaign:061 | mem_n=48 mem_md5=e235cb0622d6e925f9dc3486f7f55f73 ou_n=11 ou_md5=1a4747a6a422a702db6a133a8c8cacf4
I checksums | campaign:062 | mem_n=64 mem_md5=f1dfbed6a6a17dba8543b9dff36cf663 ou_n=0 ou_md5=-
I checksums | campaign:064 | mem_n=276 mem_md5=7136269b71a6a2e4bc17f4725f9ac5c7 ou_n=266 ou_md5=44160600fd8b9db457e9f1d9ea2e5353
I checksums | campaign:065 | mem_n=55 mem_md5=999f5a93438dfe8ba039746b572f1e74 ou_n=0 ou_md5=-
I checksums | campaign:066 | mem_n=160 mem_md5=93e2ee6beca5f4b77594580a4e0d30ca ou_n=0 ou_md5=-
J pack | 05 employer cluster `testco` | 787:TestCo Energy || 791:TestCo 2
J pack | 05 worksite cluster `test` | 196:Test Onshore Gas Plant || 197:TEST · TestCo 2 — Alpha FPSO || 198:TEST · TestCo 2 — Bravo Platform || 199:TEST · TestCo 2 — Charlie FPU
J pack | campaign_employers | 46
J pack | campaign_groups | 20
J pack | campaign_organising_units | 239
J pack | campaign_worker_membership | 2726
J pack | campaign_worker_ou | 1921
J pack | campaign_worksites | 122
J pack | campaigns | 22
J pack | employer_scopes | 28
J pack | employer_worksite_roles | 251
J pack | employers | 171
J pack | import_logs (untouched) | 42
J pack | membership_update_batches (untouched) | table absent
J pack | program_worksites | 10
J pack | programs | 4
J pack | projects | 20
J pack | workers | 2407
J pack | workers_active | 2293
J pack | worksite_scopes | 49
J pack | worksites | 174
J pack | worksites_active | 168
K environment | can_set_session_replication_role | false
K environment | disabled_user_triggers | none
K environment | env_marker | clone (2026-09-12)
K environment | fp_fk_edges | 2b7d6ab91d81159de92a4266d0ed6f59
K environment | fp_triggers | eae74d6efa782f8a1ac9f7ae48089e67
K environment | hygiene_log | _oux_hygiene_log rows=346
K environment | hygiene_log_da02_pending/rolled_back | 0/0
K environment | identity_always/generated_columns | campaign_ambition_revisions.id,_oux_wp21_canonical_basis.mapping_id / intractable_bargaining_tracker.nine_month_threshold_at,pabo_applications.voter_turnout_pct
K environment | matview worksite_hierarchy_report_rows_mv rows/rows_in_scope | 55/0
K environment | pg_version | PostgreSQL 17.6 on x86_64-pc-linux-gnu, compiled by gcc (GCC) 15.2.0, 64-bit
K environment | role postgres super/bypassrls | false/true
```

### 10 forward 1 — STOP (error)

The transaction errored before COMMIT and rolled back automatically (Postgres aborts the whole implicit multi-statement submission on an unhandled exception inside a `DO` block; no partial state was left). No rows were changed on the clone.

```text
ERROR:  55000: record "r" is not assigned yet
DETAIL:  The tuple structure of a not-yet-assigned record is indeterminate.
CONTEXT:  SQL statement "SELECT count(*)              FROM (
    SELECT 1 FROM public.employers WHERE parent_employer_id IN (787, 788, 789, 790, 791, 792, 793, 794)
    UNION ALL SELECT 1 FROM public.worksites WHERE parent_worksite_id IN (196, 197, 198, 199)
    UNION ALL SELECT 1 FROM public.agreements WHERE employer_id IN (787, 788, 789, 790, 791, 792, 793, 794)
    UNION ALL SELECT 1 FROM public.documents WHERE employer_id IN (787, 788, 789, 790, 791, 792, 793, 794) OR campaign_id IN (15, 37)
    UNION ALL SELECT 1 FROM public.worksite_contracts WHERE contractor_employer_id IN (787, 788, 789, 790, 791, 792, 793, 794)
                                                         OR worksite_id IN (196, 197, 198, 199) OR program_id = 6 OR project_id IN (18, 19, 20, 21)
    UNION ALL SELECT 1 FROM public.worksite_scopes WHERE employer_id IN (787, 788, 789, 790, 791, 792, 793, 794) AND worksite_id NOT IN (196, 197, 198, 199)
    UNION ALL SELECT 1 FROM public.projects WHERE absorbed_into_project_id IN (18, 19, 20, 21)
    UNION ALL SELECT 1 FROM public.campaign_employers WHERE employer_id IN (787, 788, 789, 790, 791, 792, 793, 794) AND campaign_id NOT IN (15, 37)
    UNION ALL SELECT 1 FROM public.campaign_worksites WHERE worksite_id IN (196, 197, 198, 199) AND campaign_id NOT IN (15, 37)
    UNION ALL SELECT 1 FROM public.campaign_organising_units WHERE campaign_id NOT IN (15, 37)
      AND unit_basis::text ~ '(employer_id|worksite_id)[^0-9]{0,6}(787|788|789|790|791|792|793|794|196|197|198|199)\M'
    UNION ALL SELECT 1 FROM public.campaign_unit_rules r WHERE r.campaign_id NOT IN (15, 37)
      AND row_to_json(r)::text ~ '(employer_id|worksite_id)[^0-9]{0,6}(787|788|789|790|791|792|793|794|196|197|198|199)\M'
  ) x"
PL/pgSQL function inline_code_block line 164 at SQL statement
```

**Diagnosis (not a transcription error — verified against the committed file):** `scripts/data-hygiene/da0.2/10_remove_test_dataset.sql` line 347 aliases `public.campaign_unit_rules` as `r` inside the `$preconditions$` block's NO-ACTION-reference-into-scope check, and that same block's `DECLARE` section (used later for `FOR r IN ... LOOP`) also declares a variable named `r record;`. PL/pgSQL resolves the bare identifier `r.campaign_id` against its own not-yet-assigned record variable `r` instead of the SQL table alias `r`, so this precondition check aborts with "record \"r\" is not assigned yet" every time the block runs — deterministically, not because of any data condition. This is a bug in the committed script (a PL/pgSQL variable/alias name collision), not an environment or data problem.

**Per the verifier's stop rule: no further step was run.** Steps 3–7 (the second `00`, `90`, the third `00`, forward 2, the fourth `00`) were **not executed**. The clone is left in its pre-run state (identical to "00 #1 (before)" above); no `90_rollback.sql` run was needed or performed since nothing was ever committed.

---

### Rerun, 2026-09-24 — verifier (Sonnet), via the connector under the orchestrator's approval

**Note on the first attempt (2026-09-23, above):** stopped at step 2 on the `campaign_unit_rules r` / `DECLARE r record` alias collision in `10_remove_test_dataset.sql`. Fixed by the planner (alias renamed `r` → `cur`; fix round 2, §8) and re-reviewed. This rerun follows the revised §3.5 order, which adds a dry run before the first real forward run.

#### Step 0 — DRY RUN (`10_remove_test_dataset.sql` with its final `COMMIT;` replaced by `ROLLBACK;` in the submitted text; the committed file itself is unmodified)

SUCCESS — no error. The appended read-only `SELECT` (run after the `ROLLBACK`, per §8) returned the pre-run values exactly as predicted:

```text
workers_active=2293, workers_total=2407, campaigns_15_37=2, employers_787_794=8,
worksites_196_199=4, roles=10, w1536='emp=791 ws=197 cwm=37/50/64',
test_worksite_cluster=4, log_rows_pending=0, snapshot_rows_logged=null
```

Matches §8's dry-run deviation expectation (workers_active 2293, campaigns_15_37 2, employers 8, worksites 4, roles 10, `w1536 emp=791 ws=197 cwm=37/50/64`, log_rows_pending 0) exactly. No row changed on the clone.

#### 00 #1 (before)

248 rows; identical to the 2026-09-23 "00 #1 (before)" run above in every row (confirmed: `all_total/active` 2407/2293, `scope_664_ids_md5` f6589df6e2507a35542632026c3d0c34, `Σ rows / tables` (E) 2633/72, `Σ update log rows` (F) 16, `Σ rows` (G) 2, `Σ (keys total / rows)` (G2) 20/2110, `hygiene_log rows=346`, `hygiene_log_da02_pending/rolled_back` 0/0, `env_marker` clone (2026-09-12)) — the dry run left no trace, as expected.

#### 10 forward 1 — SUCCESS

Appended read-only `SELECT`:

```text
workers_active=1629, workers_total=1743, campaigns_15_37=0, employers_787_794=0,
worksites_196_199=0, roles=0, w1536='emp=741 ws=185 cwm=50',
test_worksite_cluster=0, log_rows_pending=2653, snapshot_rows_logged=2652
```

Matches §3.2's clone expectation exactly: `1629, 1743, 0, 0, 0, 0, emp=741 ws=185 cwm=50, 0, 2653, 2652`.

#### 00 #2 (after forward 1)

118 rows. Key values: `all_total/active` 1743/1629; the 19 scoped entity rows all absent (`ids_present` "0 employers, 0 worksites, 0 campaigns, 0 program, 0 projects"); `scope_664_ids_md5` null, `scope_incl_1536`/`scope_664_total/active` all 0 (scope gone); `workers_on_741/185` 1/1; C w1536 `row` = `emp=741 ws=185 ... active=true`, `cwm` = `4451:50`, `activist_profiles` = `50`, `rows_in_campaign_64` shows membership/ou/profile all 0 (list/email items 2/3 kept, per P3); `E doomed Σ` 0/0; `F`/`G`/`G2` all 0 rows (structure intact, no live doomed rows); `J pack 05 worksite/employer cluster` both `none`; campaign 64 checksum `mem_n=275` (was 276, −1 as expected, md5 changed), `ou_n=266` unchanged; every other campaign checksum unchanged from 00 #1; `K environment hygiene_log rows=2999` (346+2653), `hygiene_log_da02_pending/rolled_back` = `2653/0`. Matches the plan's post-forward expectations (§4, §8) exactly.

#### 90 rollback — STOP (error)

The transaction errored before `COMMIT` and rolled back automatically (nothing in this submission was persisted — the environment guard and the `_da02_pending` temp table creation that preceded the error are inside the same aborted transaction). **The clone was left exactly as "00 #2" above (forward-1 state, not rolled back).**

```text
ERROR:  42703: column "after_row" does not exist
LINE 73: SELECT log_id, before_row AS before_state, after_row AS after_state
                                                     ^
```

**Diagnosis (verified against the committed file, not a transcription error):** `scripts/data-hygiene/da0.2/90_rollback.sql:67–70` creates `_da02_pending` selecting only `log_id, action, table_name, row_pk, before_row` from `public._oux_hygiene_log` — `after_row` is not in that column list. `90_rollback.sql:72–74` then builds `_da02_snapshot` as `SELECT log_id, before_row AS before_state, after_row AS after_state FROM _da02_pending`, referencing `after_row`, a column `_da02_pending` does not have. This fails deterministically on every run; it is a bug in the committed script (the temp table's column list omits `after_row`, needed to recover the `_da02_snapshot` row's `after_state`, i.e. `rows_logged`, workers/table counts and checksums at the time `10` committed), not a data or environment problem.

**Per the verifier's stop rule: no further step was run.** Steps 5–7 of this rerun (the third `00`, forward 2, the fourth `00`) were **not executed**. **The clone is currently left in the post-forward-1 state (00 #2 above), NOT rolled back** — `_oux_hygiene_log` holds 2653 pending (`rolled_back_at IS NULL`) rows of `10_remove_test_dataset`, and the 19 scoped entities are absent, worker 1536 is on 741/185/cwm=50. This is a hold state pending a fix to `90_rollback.sql`, not the "leave forward" end state the run sheet calls for (which presumes a completed forward-back-forward rehearsal). Production must not be run until `90_rollback.sql` is fixed and this rehearsal (or at minimum steps 4–7) is repeated successfully, per the risk in §3.4 item 1 (reversibility is unproven while this bug stands).

---

### Resumed after P7, 2026-09-24 — verifier (Sonnet), via the connector under the orchestrator's approval

Fix round 3 (P7) confirmed applied: `scripts/data-hygiene/da0.2/90_rollback.sql:68` now projects `after_row` in `_da02_pending` (`SELECT log_id, action, table_name, row_pk, before_row, after_row`); nothing else in `10_remove_test_dataset.sql` or `90_rollback.sql` changed (607 lines, same as before). Resumed from step 4 against the clone's current state (post-forward-1: 19 scoped entities absent, worker 1536 on 741/185/cwm=50, 2,653 pending `10_remove_test_dataset` log rows, per "00 #2" above). Context noted from the coordinator: DA0.3's rehearsal ran on this clone since DA0.2's forward 1 and left its migration applied (three nullable columns added to `workers`: `employer_name_raw`, `worksite_name_raw`, `names_import_id`) plus its own (rolled-back) `_oux_hygiene_log` rows under `da0.3/*` script names.

#### Step 4 — `90_rollback.sql` — STOP (error)

The `after_row` bug is fixed — that specific error did not recur. A **different** error occurred, inside the replay's step 4 (mutual-reference fallback), before reaching the post-assertions. **This is not the byte-identity / whole-row-jsonb check the coordinator flagged as the likely DA0.3-column risk** — it is a foreign-key-violation during row reinsertion, raised before any byte-identity comparison is reached.

```text
ERROR:  P0001: 90: email_send_log {"send_id": 274} cannot be reinserted (foreign-key violation with no nullable key to relax)
CONTEXT:  PL/pgSQL function inline_code_block line 117 at RAISE
```

**Diagnosis:** `90_rollback.sql:270–309` (step 2) replays every pending row once in reverse log order; a `delete`-action row whose `INSERT` hits `foreign_key_violation` is deferred (`_da02_deferred`). `:312–397` (step 3) retries deferred rows in passes; when a pass makes no progress, `:361–390` (step 4) tries to reinsert each still-deferred row with its nullable foreign-key columns pointing at a table still in `_da02_pending` set to NULL, to complete later (step 5). For `email_send_log` row `{"send_id": 274}`, `:364–367`'s lookup of nullable FK columns from `_da02_edges` (columns of `email_send_log` that are NOT NOT-NULL and reference a table still in `_da02_pending`) returned nothing (`v_null_cols IS NULL`), so `:368–369` raises this exception — meaning every foreign key `email_send_log` holds into a table this rollback is still reinserting is `NOT NULL`, so the row can be neither reinserted directly (its parent isn't back yet after all retry passes) nor relaxed. This is a limitation of the replay's fallback (it only handles nullable-FK cycles) exposed by at least one NOT-NULL FK cycle or late-arriving-parent case among the tables `10` deleted — independent of DA0.3's `workers` columns (those are unrelated to `email_send_log`'s foreign keys).

The transaction rolled back automatically before `COMMIT`; nothing in this submission persisted. **The clone remains in the same post-forward-1 state as before this call** (00 #2: entities absent, 1536 on 741/185/cwm=50, 2,653 pending log rows) — unchanged by this attempt.

**Per the verifier's stop rule: no further step was run.** Steps 5–7 (00 #3, forward 2, 00 #4) were **not executed**. The clone is still not in a state that proves reversibility; production must not be run until `90_rollback.sql`'s reinsert-ordering/fallback is fixed for this case and the rehearsal (from step 4, or from a fresh 00 if the fix requires a clean run) is repeated successfully.

---

### Resumed after fix round 4, 2026-09-24 — verifier (Sonnet), via the connector under the orchestrator's approval

Fix round 4 confirmed applied to `scripts/data-hygiene/da0.2/90_rollback.sql`: a parents-first topological table order computed from `pg_constraint` (self-references ignored, `DEFERRABLE` keys treated as absent), cycle-breaking by relaxing nullable columns for the table whose unplaced parents are all reached through nullable keys (the `campaign_comms_drafts` ↔ `email_lists` cycle), retry passes that continue while any row lands (cap raised to 50 passes), an error naming the row, table, violated constraint and parent table, and worker 1536's identity check narrowed to only the snapshot's own keys (so DA0.3's added `workers` columns are excluded from the comparison). `10_remove_test_dataset.sql` unchanged. Resumed from step 4 against the clone's current state (unchanged since the previous attempt: post-forward-1, "00 #2" — 19 scoped entities absent, worker 1536 on 741/185/cwm=50, 2,653 pending `10_remove_test_dataset` log rows).

#### Step 4 — `90_rollback.sql` — STOP (error)

A third, different error — this time before the reinsert phase even begins, while building the parents-first table order.

```text
ERROR:  42804: column "ord" is of type integer but expression is of type text
HINT:  You will need to rewrite or cast the expression.
QUERY:  INSERT INTO _da02_torder (tbl, ord, relax_cols)
  SELECT DISTINCT p.table_name, NULL, NULL FROM _da02_pending p WHERE p.action = 'delete'
CONTEXT:  PL/pgSQL function inline_code_block line 31 at SQL statement
```

**Diagnosis (verified against the committed file, not a transcription error):** `scripts/data-hygiene/da0.2/90_rollback.sql:290–291` seeds `_da02_torder` (`tbl text PRIMARY KEY, ord int, relax_cols text[]`, declared at `:156`) with `INSERT INTO _da02_torder (tbl, ord, relax_cols) SELECT DISTINCT p.table_name, NULL, NULL FROM _da02_pending p WHERE p.action = 'delete'`. Under `SELECT DISTINCT`, Postgres must resolve a concrete type for every output column before it can apply the `DISTINCT` comparison, and with no other type information the two bare `NULL` literals resolve to `text` rather than staying the polymorphic "unknown" type a plain `INSERT ... VALUES (..., NULL, NULL)` would keep; a `text` value does not implicitly cast to `integer` on assignment, so the insert into `ord` (`integer`) fails. This is deterministic on every run (it fires before any row is touched) and is a bug in the committed script — the two `NULL`s need explicit casts (`NULL::int, NULL::text[]`), not a data or environment problem.

The transaction rolled back automatically before `COMMIT`; nothing in this submission persisted. **The clone remains unchanged, still in the same post-forward-1 state** (00 #2: 19 scoped entities absent, worker 1536 on 741/185/cwm=50, 2,653 pending log rows).

**Per the verifier's stop rule: no further step was run.** Steps 5–7 (00 #3, forward 2, 00 #4, leave forward) were **not executed**. Reversibility remains unproven; production must not be run until this cast is fixed and the rehearsal resumes successfully from step 4.

---

### Resumed after fix round 4a, 2026-09-24 — verifier (Sonnet), via the connector under the orchestrator's approval

Fix confirmed applied: `scripts/data-hygiene/da0.2/90_rollback.sql:291` now reads `SELECT DISTINCT p.table_name, NULL::int, NULL::text[] FROM _da02_pending p WHERE p.action = 'delete'`; nothing else changed (632 lines, same as fix round 4). Resumed from step 4 against the clone's unchanged current state (post-forward-1, "00 #2": 19 scoped entities absent, worker 1536 on 741/185/cwm=50, 2,653 pending `10_remove_test_dataset` log rows).

#### Step 4 — `90_rollback.sql` — STOP (error)

The cast fix works — table ordering, reinsertion and the retry/relax logic all ran without error. A **fourth**, different error occurred at the very end, in step 7 (re-enabling triggers), after all rows had been reinserted/restored:

```text
ERROR:  55006: cannot ALTER TABLE "campaign_organising_units" because it has pending trigger events
CONTEXT:  SQL statement "ALTER TABLE public.campaign_organising_units ENABLE TRIGGER USER"
PL/pgSQL function inline_code_block line 177 at EXECUTE
```

**Diagnosis (verified against the committed file, not a transcription error):** `90_rollback.sql:436` (step 7) runs `ALTER TABLE public.%I ENABLE TRIGGER USER` for every logged table, including `campaign_organising_units`. Per §3.1.1 of this plan, `campaign_organising_units.group_id → campaign_groups` is one of the two `NO ACTION` keys that are `DEFERRABLE INITIALLY DEFERRED` (the other is `campaign_worker_ou.group_id`). Step 3 reinserts `campaign_organising_units` rows (`10` deleted 3 of them under campaigns 15/37); each reinsert queues a pending deferred trigger event for that FK, to be checked at `COMMIT` (or an explicit `SET CONSTRAINTS ... IMMEDIATE`). Postgres refuses `ALTER TABLE` on a table with a pending trigger event still queued in the same transaction — `ALTER TABLE ... ENABLE TRIGGER USER` in step 7 hits exactly that refusal. This is a gap in `90_rollback.sql`: it never accounts for the two deferrable keys into `campaign_groups` when re-enabling triggers, even though §3.1.1 explicitly calls them out. Not a data or environment problem — deterministic given the deferred constraint firing on every run that reinserts `campaign_organising_units` or `campaign_worker_ou` rows.

The transaction rolled back automatically before `COMMIT`; nothing in this submission persisted (including the reinserts and restores that appeared to succeed earlier in the same transaction — none of it survives past the failed `ALTER TABLE`). **The clone remains unchanged, still in the same post-forward-1 state** (00 #2: 19 scoped entities absent, worker 1536 on 741/185/cwm=50, 2,653 pending log rows).

**Per the verifier's stop rule: no further step was run.** Steps 5–7 of this attempt (00 #3, forward 2, 00 #4, leave forward) were **not executed**. Reversibility remains unproven; production must not be run until this is fixed (e.g. `SET CONSTRAINTS ALL IMMEDIATE` before step 7's `ENABLE TRIGGER USER` loop, or re-ordering so the deferred FK is checked before the `ALTER TABLE` calls) and the rehearsal resumes successfully from step 4.

---

### Resumed after fix round 4b, 2026-09-24 — verifier (Sonnet), via the connector under the orchestrator's approval

Fix confirmed applied: `scripts/data-hygiene/da0.2/90_rollback.sql:434–439` now fires `SET CONSTRAINTS ALL IMMEDIATE;` (with an explanatory comment) immediately before step 7's `ENABLE TRIGGER USER` loop; nothing else changed (637 lines). Resumed from step 4 against the clone's unchanged state (post-forward-1, "00 #2": 19 scoped entities absent, worker 1536 on 741/185/cwm=50, 2,653 pending `10_remove_test_dataset` log rows).

#### Step 4 — `90_rollback.sql` — SUCCESS

All prior errors are resolved. Appended read-only `SELECT`:

```text
forward_rows_pending=0, campaigns_15_37=2, employers_787_794=8, worksites_196_199=4,
workers_active=2293, w1536='emp=791 ws=197 cwm=37/50/64'
```

Matches §3.3's expectation exactly (`forward_rows_pending 0, campaigns_15_37 2, employers_787_794 8, worksites_196_199 4, workers_active` = this run's before + 664 = 2293 on the clone, `w1536 emp=791 ws=197 cwm=37/50/64`).

#### Step 5 — `00_preflight.sql` ("00 #3", after rollback) — compared with "00 #1" (2026-09-24 rerun)

248 rows returned. Every row outside section K is **identical** to "00 #1": `all_total/active` 2407/2293, `scope_664_ids_md5` f6589df6e2507a35542632026c3d0c34, all A/B/C/D rows, `E Σ` 2633/72, `F Σ` 16, `G Σ` 2, `G2 Σ` 20/2110, all H cross-checks, every I campaign checksum **including campaign 64 restored to `mem_n=276 mem_md5=7136269b71a6a2e4bc17f4725f9ac5c7`** (its pre-forward digest, byte-for-byte), and every J pack row.

```text
A identity | campaign:15 | Test2 (created 2026-04-16, status active, episode false, standing false, parent null)
A identity | campaign:37 | testco (created 2026-04-28, status active, episode false, standing false, parent null)
A identity | campaign:50 | Offshore Allliance internal (created 2026-05-28, status active, episode false, standing false, parent null)
A identity | campaign:64 | ROV sector wide (created 2026-08-20, status active, episode false, standing false, parent null)
A identity | employer:741 | Australian Workers' Union WA Branch (created 2026-04-01)
A identity | employer:787 | TestCo Energy (created 2026-04-09)
A identity | employer:788 | Fortis Maintenance Services (created 2026-04-09)
A identity | employer:789 | Pacific Coatings & Insulation (created 2026-04-09)
A identity | employer:790 | Alliance Site Services (created 2026-04-09)
A identity | employer:791 | TestCo 2 (created 2026-04-16)
A identity | employer:792 | Aegis Offshore Maintenance Pty Ltd (created 2026-04-16)
A identity | employer:793 | NorthStar Marine Coatings (created 2026-04-16)
A identity | employer:794 | Offshore Crew Services Ltd (created 2026-04-16)
A identity | ids_present | 8 employers, 4 worksites, 2 campaigns, 1 program, 4 projects (expected 8, 4, 2, 1, 4)
A identity | program:6 | TEST · TestCo 2 Offshore Maintenance Program (principal 791)
A identity | project:18 | Test Onshore Gas Plant Brownfields (worksite 196)
A identity | project:19 | TEST · TestCo 2 — Alpha — brownfields (worksite 197)
A identity | project:20 | TEST · TestCo 2 — Bravo — maintenance (worksite 198)
A identity | project:21 | TEST · TestCo 2 — Charlie — maintenance (worksite 199)
A identity | worksite:185 | AWU Head Office (created 2026-04-01, principal null)
A identity | worksite:196 | Test Onshore Gas Plant (created 2026-04-09, principal 787)
A identity | worksite:197 | TEST · TestCo 2 — Alpha FPSO (created 2026-04-16, principal 791)
A identity | worksite:198 | TEST · TestCo 2 — Bravo Platform (created 2026-04-16, principal 791)
A identity | worksite:199 | TEST · TestCo 2 — Charlie FPU (created 2026-04-16, principal 791)
B workers | all_total/active | 2407/2293
B workers | by_created:2026-04-09 | 350 (ids 322-671)
B workers | by_created:2026-04-16 | 312 (ids 672-983)
B workers | by_created:2026-05-27 | 1 (ids 1537-1537)
B workers | by_created:2026-06-03 | 1 (ids 1541-1541)
B workers | by_employer:787 | 80/80
B workers | by_employer:788 | 120/120
B workers | by_employer:789 | 55/55
B workers | by_employer:790 | 95/95
B workers | by_employer:791 | 72/72
B workers | by_employer:792 | 108/108
B workers | by_employer:793 | 48/48
B workers | by_employer:794 | 84/84
B workers | by_employer:null | 2/2
B workers | by_project:18 | 350
B workers | by_project:19 | 104
B workers | by_project:20 | 104
B workers | by_project:21 | 104
B workers | by_project:null | 2
B workers | by_updated:2026-08-20 | 664
B workers | by_worksite:196 | 350/350
B workers | by_worksite:197 | 106/106
B workers | by_worksite:198 | 104/104
B workers | by_worksite:199 | 104/104
B workers | cwm_664_other_campaigns | none
B workers | cwo_664_other_campaigns | none
B workers | email_not_test_patterned_ids | 1537
B workers | email_shared_with_outside | 0
B workers | email_test_patterned (contains "test") | 663
B workers | employer_in_scope_but_worksite_not | 0
B workers | member_number_not_null | 304
B workers | member_number_shape | alpha1digits:7=160,alpha1digits:8=144,null=360
B workers | member_number_shared_with_outside | 0
B workers | membership_sync_rows_for_664 (transitions/history) | 0/0
B workers | name_collisions_with_outside (first+last) | 6
B workers | outside_scope_member_number_not_null/reference_id_not_null | 0/770
B workers | phone_e164_shared_with_outside | 0
B workers | reference_id_not_null | 0
B workers | scope_664_ids_md5 | f6589df6e2507a35542632026c3d0c34
B workers | scope_664_total/active | 664/664
B workers | scope_incl_1536 | 665
B workers | workers_on_741/185 | 0/0
B workers | worksite_in_scope_but_employer_not_ids | 681,1537
C w1536 | activist_profiles (campaign) | 37,50,64
C w1536 | cwm (membership_id:campaign) | 2589:37,4451:50,11434:64
C w1536 | cwo (campaign:ou) | 37:25
C w1536 | row | emp=791 ws=197 proj=null active=true role_type=8 activist_like=true member_number_null=true reference_id_null=true created=2026-05-26
C w1536 | rows_in_campaign_64 | campaign_activist_profiles=1,campaign_leader_worker_links=0,campaign_worker_list_items=2,campaign_worker_membership=1,campaign_worker_ou=0,email_list_items=3
C w1536 | sms_conversations/sms_interactions/email_conversations (kept) | 4/58/1
D structure | activities/ratings_15_37 | 10/11
D structure | campaign_employers_15_37 | 15:791,37:791
D structure | campaign_groups_15_37 (campaign:group:kind) | 37:3:worksite
D structure | campaign_worksites_15_37 | 15:197,15:198,15:199,37:197,37:198,37:199
D structure | cwm_15_37_by_class | in664=145,w1536=1
D structure | delete_trigger_tables_in_scope (worker_campaign_facts / campaign_agreements) | 0/0
D structure | employer_worksite_roles (id:employer:worksite) | 82:787:196,83:788:196,84:789:196,85:790:196,87:791:197,89:793:197,91:791:198,93:793:198,95:791:199,97:793:199
D structure | organising_units_15_37 (campaign:ou:group:container) | 37:25:3:false,37:26:3:false,37:27:3:false
D structure | program_worksites_6 (id:worksite) | 13:197,14:198,15:199
D structure | project_employers (project:employer) | 18:787,18:788,18:789,18:790,19:791,19:792,19:793,20:791,20:792,20:793,21:791,21:792,21:793
D structure | set_null_rows (sms_conversations/soc_sessions/worker_notes with campaign 15/37) | 3,4,5 / 4,5,6 / 1
D structure | worksite_scopes/employer_scopes | 36/18
E doomed | activity_ambitions | 5 (max depth 3)
E doomed | an_tag_sync_log | 16 (max depth 1)
E doomed | call_attempt_outcomes | 2 (max depth 4)
E doomed | call_attempts | 1 (max depth 3)
E doomed | call_list_items | 146 (max depth 2)
E doomed | call_list_scripts | 1 (max depth 2)
E doomed | call_lists | 7 (max depth 1)
E doomed | call_outcome_definitions | 3 (max depth 1)
E doomed | call_script_sections | 1 (max depth 2)
E doomed | call_scripts | 1 (max depth 1)
E doomed | call_share_form_events | 14 (max depth 3)
E doomed | call_share_tokens | 6 (max depth 2)
E doomed | call_step_outcomes | 1 (max depth 4)
E doomed | campaign_activist_profiles | 16 (max depth 1)
E doomed | campaign_activities | 10 (max depth 1)
E doomed | campaign_activity_ratings | 11 (max depth 2)
E doomed | campaign_ambitions | 5 (max depth 1)
E doomed | campaign_comms_drafts | 6 (max depth 1)
E doomed | campaign_employers | 2 (max depth 1)
E doomed | campaign_groups | 1 (max depth 1)
E doomed | campaign_leader_form_events | 17 (max depth 4)
E doomed | campaign_leader_tokens | 2 (max depth 3)
E doomed | campaign_leader_worker_links | 58 (max depth 1)
E doomed | campaign_organisers | 2 (max depth 1)
E doomed | campaign_organising_units | 3 (max depth 1)
E doomed | campaign_situation_analyses | 1 (max depth 1)
E doomed | campaign_stage_plans | 13 (max depth 1)
E doomed | campaign_task_list_items | 23 (max depth 3)
E doomed | campaign_task_lists | 5 (max depth 2)
E doomed | campaign_worker_list_items | 336 (max depth 2)
E doomed | campaign_worker_lists | 57 (max depth 1)
E doomed | campaign_worker_membership | 146 (max depth 1)
E doomed | campaign_worker_ou | 74 (max depth 2)
E doomed | campaign_worksites | 6 (max depth 1)
E doomed | campaigns | 2 (max depth 0)
E doomed | email_click_tokens | 2 (max depth 3)
E doomed | email_list_items | 133 (max depth 2)
E doomed | email_lists | 5 (max depth 1)
E doomed | email_send_log | 133 (max depth 2)
E doomed | employer_scopes | 18 (max depth 1)
E doomed | employer_worksite_roles | 10 (max depth 1)
E doomed | employers | 8 (max depth 0)
E doomed | gate_definitions | 10 (max depth 1)
E doomed | oauth_send_batches | 5 (max depth 2)
E doomed | phone_call_action_lists | 7 (max depth 2)
E doomed | phone_call_actions | 6 (max depth 1)
E doomed | plan_ambitions | 37 (max depth 2)
E doomed | plan_capacities | 16 (max depth 2)
E doomed | plan_revision_notes | 1 (max depth 1)
E doomed | plan_theory_of_winning | 1 (max depth 2)
E doomed | plan_where_to_play | 12 (max depth 2)
E doomed | plan_wtp_ambitions | 7 (max depth 3)
E doomed | program_worksites | 3 (max depth 1)
E doomed | programs | 1 (max depth 0)
E doomed | project_employers | 13 (max depth 1)
E doomed | projects | 4 (max depth 0)
E doomed | reporting_snapshots | 8 (max depth 1)
E doomed | section_plan_situation_snippets | 1 (max depth 2)
E doomed | section_plans | 2 (max depth 1)
E doomed | sms_send_log | 4 (max depth 2)
E doomed | sms_survey_definition_versions | 1 (max depth 2)
E doomed | sms_survey_questions | 10 (max depth 2)
E doomed | sms_survey_sessions | 4 (max depth 2)
E doomed | sms_surveys | 1 (max depth 1)
E doomed | worker_activity_log | 2 (max depth 2)
E doomed | worker_an_tags | 386 (max depth 1)
E doomed | worker_campaign_connections | 2 (max depth 1)
E doomed | worker_notes | 2 (max depth 1)
E doomed | worker_tags | 74 (max depth 1)
E doomed | workers | 664 (max depth 0)
E doomed | worksite_scopes | 36 (max depth 1)
E doomed | worksites | 4 (max depth 0)
E doomed | Σ rows / tables | 2633 / 72
F set-null | sms_conversations.campaign_id -> campaigns | 3
F set-null | sms_conversations.worker_id -> workers | 3
F set-null | soc_sessions.campaign_id -> campaigns | 3
F set-null | soc_sessions.capacity_id -> plan_capacities | 3
F set-null | soc_sessions.plan_id -> campaign_stage_plans | 3
F set-null | worker_notes.campaign_id -> campaigns | 1
F set-null | Σ update log rows 10 will write | 16
G BLOCKER | workers.employer_id -> employers | 1
G BLOCKER | workers.worksite_id -> worksites | 1
G BLOCKER | Σ rows (expected 2: worker 1536 via employer_id and worksite_id) | 2
G2 NO ACTION within closure | campaign_organising_units.group_id -> campaign_groups (deferrable) | 3
G2 NO ACTION within closure | campaign_worker_ou.group_id -> campaign_groups (deferrable) | 74
G2 NO ACTION within closure | programs.principal_employer_id -> employers | 1
G2 NO ACTION within closure | projects.worksite_id -> worksites | 4
G2 NO ACTION within closure | workers.employer_id -> employers | 662
G2 NO ACTION within closure | workers.project_id -> projects | 662
G2 NO ACTION within closure | workers.worksite_id -> worksites | 664
G2 NO ACTION within closure | worksite_scopes.employer_id -> employers | 36
G2 NO ACTION within closure | worksites.principal_employer_id -> employers | 4
G2 NO ACTION within closure | Σ (keys total / rows) | 20 / 2110
H cross-checks | agreements_employer_in_scope | 0
H cross-checks | campaign_employers/worksites_in_scope_other_campaigns | 0/0
H cross-checks | campaigns_parent_in_scope | 0
H cross-checks | composite_fks_to_root_tables | 0
H cross-checks | documents_employer/campaign_in_scope | 0/0
H cross-checks | employers_parent_in_scope | 0
H cross-checks | programs_with_principal_in_scope | 6
H cross-checks | projects_absorbed_into_scope | 0
H cross-checks | sms_lists_15_37 | 0
H cross-checks | unit_basis/unit_rules_referencing_scope_other_campaigns | 0/0
H cross-checks | upcoming_project_employers_in_scope | 0
H cross-checks | workers_on_projects_18_21_outside_664 | 0
H cross-checks | worksite_contracts_in_scope | 0
H cross-checks | worksites_parent_in_scope | 0
H cross-checks | worksites_with_principal_or_operator_in_scope | 196,197,198,199
I checksums | campaign:015 | mem_n=72 mem_md5=b751b5c2a8a9b2cf53e9e5640d281a34 ou_n=0 ou_md5=-
I checksums | campaign:021 | mem_n=146 mem_md5=eb1620a94589f1af3a1c6c635b405e90 ou_n=0 ou_md5=-
I checksums | campaign:023 | mem_n=48 mem_md5=f34b53b239b9fd56ca94fc7cb6cc225c ou_n=48 ou_md5=09ff42f537438944a8d3b2f94011d5d2
I checksums | campaign:026 | mem_n=216 mem_md5=b4269d914fbd8bfac345e176ad363252 ou_n=284 ou_md5=324322f19429a54158564c895b906096
I checksums | campaign:027 | mem_n=80 mem_md5=cc2ec66e0618ac90f302740ebfe17fe7 ou_n=15 ou_md5=a752065f2b97c70c15eec56fe06c859c
I checksums | campaign:037 | mem_n=74 mem_md5=4055c684d3e0a83a260bbfc99d014b24 ou_n=74 ou_md5=844df0fbe36847ba9ba6312f8b0c2232
I checksums | campaign:041 | mem_n=61 mem_md5=3001d5cf0785e7aa5276dd4a6910c44f ou_n=61 ou_md5=f6f391cda8752629015da30fde8a286d
I checksums | campaign:042 | mem_n=212 mem_md5=0684c5c5720da040c254258ac3c997f7 ou_n=236 ou_md5=5f03d021e0d04e58ab63930e8cd852a6
I checksums | campaign:047 | mem_n=223 mem_md5=16bd5db083ed0b753a026ae1f7226e38 ou_n=85 ou_md5=72334c25b42643e7a0b2ee37e68ab283
I checksums | campaign:048 | mem_n=219 mem_md5=4a22632a0272b0c714b76ccc4a934228 ou_n=0 ou_md5=-
I checksums | campaign:049 | mem_n=0 mem_md5=- ou_n=0 ou_md5=-
I checksums | campaign:050 | mem_n=8 mem_md5=e32c927b307976328bd90e447284e248 ou_n=0 ou_md5=-
I checksums | campaign:055 | mem_n=11 mem_md5=e8cf11c48e46d8f34039b5b35a77640c ou_n=11 ou_md5=b6ea2d85d5601356f1e3286b3c5ef2c6
I checksums | campaign:057 | mem_n=305 mem_md5=88ea6e21af475cfcd6b8efc1c54addfc ou_n=606 ou_md5=768839e6dbebae44921bf7d7e9b1146c
I checksums | campaign:058 | mem_n=28 mem_md5=3787f32edb4f999314087158fb662100 ou_n=28 ou_md5=46ef975145f25459b0843c97f3c35e98
I checksums | campaign:059 | mem_n=196 mem_md5=2b32133f470a84cd7beb149b218ac909 ou_n=196 ou_md5=d99f4d4ac3287e2fb1d0549a50a7962b
I checksums | campaign:060 | mem_n=224 mem_md5=8dbf2decb5fbe06ccd283a194650c690 ou_n=0 ou_md5=-
I checksums | campaign:061 | mem_n=48 mem_md5=e235cb0622d6e925f9dc3486f7f55f73 ou_n=11 ou_md5=1a4747a6a422a702db6a133a8c8cacf4
I checksums | campaign:062 | mem_n=64 mem_md5=f1dfbed6a6a17dba8543b9dff36cf663 ou_n=0 ou_md5=-
I checksums | campaign:064 | mem_n=276 mem_md5=7136269b71a6a2e4bc17f4725f9ac5c7 ou_n=266 ou_md5=44160600fd8b9db457e9f1d9ea2e5353
I checksums | campaign:065 | mem_n=55 mem_md5=999f5a93438dfe8ba039746b572f1e74 ou_n=0 ou_md5=-
I checksums | campaign:066 | mem_n=160 mem_md5=93e2ee6beca5f4b77594580a4e0d30ca ou_n=0 ou_md5=-
J pack | 05 employer cluster `testco` | 787:TestCo Energy || 791:TestCo 2
J pack | 05 worksite cluster `test` | 196:Test Onshore Gas Plant || 197:TEST · TestCo 2 — Alpha FPSO || 198:TEST · TestCo 2 — Bravo Platform || 199:TEST · TestCo 2 — Charlie FPU
J pack | campaign_employers | 46
J pack | campaign_groups | 20
J pack | campaign_organising_units | 239
J pack | campaign_worker_membership | 2726
J pack | campaign_worker_ou | 1921
J pack | campaign_worksites | 122
J pack | campaigns | 22
J pack | employer_scopes | 28
J pack | employer_worksite_roles | 251
J pack | employers | 171
J pack | import_logs (untouched) | 42
J pack | membership_update_batches (untouched) | table absent
J pack | program_worksites | 10
J pack | programs | 4
J pack | projects | 20
J pack | workers | 2407
J pack | workers_active | 2293
J pack | worksite_scopes | 49
J pack | worksites | 174
J pack | worksites_active | 168
K environment | can_set_session_replication_role | false
K environment | disabled_user_triggers | none
K environment | env_marker | clone (2026-09-12)
K environment | fp_fk_edges | 4935f890045d8c94d4c40b846c969e64
K environment | fp_triggers | ac616370c2916c7044dcc381a4563bf4
K environment | hygiene_log | _oux_hygiene_log rows=5741
K environment | hygiene_log_da02_pending/rolled_back | 0/2653
K environment | identity_always/generated_columns | campaign_ambition_revisions.id,_oux_wp21_canonical_basis.mapping_id / intractable_bargaining_tracker.nine_month_threshold_at,pabo_applications.voter_turnout_pct
K environment | matview worksite_hierarchy_report_rows_mv rows/rows_in_scope | 55/0
K environment | pg_version | PostgreSQL 17.6 on x86_64-pc-linux-gnu, compiled by gcc (GCC) 15.2.0, 64-bit
K environment | role postgres super/bypassrls | false/true
```

**Comparison verdict: NOT fully identical.** Two section-K rows differ that are **outside the permitted allowance** (only `hygiene_log rows=` and `hygiene_log_da02_pending/rolled_back` are permitted to differ):

| row | 00 #1 (2026-09-24, before forward 1) | 00 #3 (2026-09-24, after rollback) | permitted? |
|---|---|---|---|
| `K environment \| hygiene_log` | `_oux_hygiene_log rows=346` | `_oux_hygiene_log rows=5741` | yes (permitted) |
| `K environment \| hygiene_log_da02_pending/rolled_back` | `0/0` | `0/2653` | yes (permitted) |
| `K environment \| fp_fk_edges` | `2b7d6ab91d81159de92a4266d0ed6f59` | `4935f890045d8c94d4c40b846c969e64` | **no — not permitted** |
| `K environment \| fp_triggers` | `eae74d6efa782f8a1ac9f7ae48089e67` | `ac616370c2916c7044dcc381a4563bf4` | **no — not permitted** |

Every other row (sections A–J and the rest of K — `env_marker`, `matview...`, `role postgres...`, `can_set_session_replication_role`, `disabled_user_triggers` = `none`, `identity_always/generated_columns`, `pg_version`) is byte-identical between 00 #1 and 00 #3, including every campaign checksum (campaign 64 restored exactly to `mem_n=276 mem_md5=7136269b71a6a2e4bc17f4725f9ac5c7`) and every J-pack table count. `disabled_user_triggers = none` confirms `90`'s own trigger-state post-assertion (which passed, since the run committed) — no trigger was left disabled by this run.

**Assessment:** `fp_fk_edges` and `fp_triggers` are schema-catalog fingerprints (over `pg_constraint`/`pg_trigger`), not data. Nothing in `10_remove_test_dataset.sql` or `90_rollback.sql` runs DDL against the schema (no `CREATE`/`ALTER`/`DROP` on any permanent table or constraint) — both scripts only ever run `ALTER TABLE … {DISABLE,ENABLE} TRIGGER USER` (which changes `pg_trigger.tgenabled`, would show only in `fp_triggers`, and is asserted back to the pre-run state before `COMMIT` — confirmed here since `fp_triggers` for 00 #1 and 00 #3 both derive from `tgenabled` and `disabled_user_triggers` reads `none` in both). Since the same DA0.2 scripts ran between 00 #1 and 00 #2 today with **no** fingerprint change (see 00 #2 above, not re-diffed for K's non-log rows but consistent with 00 #1's baseline throughout `10`'s own internal count-based checks), and neither `fp_fk_edges` nor `fp_triggers` is derived from any table DA0.2 touches, the most likely explanation is an external migration or DDL change applied to the shared clone by another concurrent workstream (the coordinator's own note names DA0.3 and DA0.5 as sharing this clone) between the "00 #1" preflight run earlier today and this "00 #3" run — not anything DA0.2's own scripts did. No campaign, worker, employer, worksite, program, project, junction or checksum row differs; the closure/E/F/G/G2/H/I/J sections are all identical, which would not be true if DA0.2's own rollback had left the database in a different *data* state.

**Paused before step 6, pending confirmation.** This was a difference outside the explicitly permitted section-K rows, so the verifier did not treat 00 #3 as "identical" to 00 #1 without checking first. **No data was changed by the pause** — `90` had already committed successfully and left the clone in the pre-forward (00 #1-equivalent) state; step 6 (forward 2) had not yet run.

**Orchestrator's explanation (2026-09-24), confirmed:** the fingerprint changes are caused by DA0.3's clone rehearsal, which ran on this same shared clone between this run's "00 #1" and "00 #3" and added `name_match_reviews` (with its own foreign keys and two triggers) and the `workers.names_import_id` key, leaving that migration applied. This is DA0.3's doing, not DA0.2's — confirmed independently above (no DDL in `10_remove_test_dataset.sql` or `90_rollback.sql`; every data-derived section, including every campaign checksum, is byte-identical between 00 #1 and 00 #3). **00 #3 is treated as matching 00 #1** for the purposes of this rehearsal: the only differences are the two permitted hygiene-log rows plus these two externally-caused fingerprint rows, none of which reflect anything DA0.2's scripts did. Proceeding to step 6.

#### Step 6 — `10_remove_test_dataset.sql` (forward 2) — compared with the rerun's forward 1 — SUCCESS

Appended read-only `SELECT`:

```text
workers_active=1629, workers_total=1743, campaigns_15_37=0, employers_787_794=0,
worksites_196_199=0, roles=0, w1536='emp=741 ws=185 cwm=50',
test_worksite_cluster=0, log_rows_pending=2653, snapshot_rows_logged=2652
```

**Identical counts to the rerun's forward 1** (`1629, 1743, 0, 0, 0, 0, emp=741 ws=185 cwm=50, 0, 2653, 2652`). The underlying `_oux_hygiene_log.log_id` values are higher this time (the log has grown from `90`'s reinsert/restore rows plus its own insert/update entries between the two forward runs), but `log_rows_pending`/`snapshot_rows_logged` — being counts, not ids — come out the same: 2653/2652, exactly as forward 1.

#### Step 7 — `00_preflight.sql` ("00 #4") — compared with "00 #2" — matches

118 rows. Identical to "00 #2" in every row **except** the same four section-K rows already accounted for in the 00 #3 comparison:

| row | 00 #2 (after forward 1) | 00 #4 (after forward 2) | permitted? |
|---|---|---|---|
| `hygiene_log` | `rows=2999` | `rows=8394` | yes (permitted; the log has grown through `90` and forward 2) |
| `hygiene_log_da02_pending/rolled_back` | `2653/0` | `2653/2653` | yes (permitted) |
| `fp_fk_edges` | `2b7d6ab9…` | `4935f890…` | DA0.3 drift, already accepted at 00 #3 |
| `fp_triggers` | `eae74d6e…` | `ac616370…` | DA0.3 drift, already accepted at 00 #3 |

Every other row is identical: `all_total/active` 1743/1629, the 19 scoped entities all absent, `w1536` `emp=741 ws=185 cwm=50` (`activist_profiles`=50, `cwo`=none, `rows_in_campaign_64` all 0 except the 2/3 list/email items kept), campaign 64's checksum restored to exactly the same post-forward-1 digest (`mem_n=275 mem_md5=6d93e52abc189c730fab6e863df12f15`, `ou_n=266 ou_md5=44160600fd8b9db457e9f1d9ea2e5353`), every other campaign checksum unchanged, and every J-pack count (`employers 163, worksites 170, worksites_active 164, employer_worksite_roles 241, worksite_scopes 13, employer_scopes 10, programs 3, program_worksites 7, projects 16, campaigns 20, campaign_groups 19, campaign_organising_units 236, campaign_worker_ou 1847, campaign_worker_membership 2579, campaign_employers 44, campaign_worksites 116`, `05` worksite/employer clusters both `none`).

#### Step 8 — leave the clone forward

No further script run. The clone (`yqjkuobcawvigsfpgrcm`) is left in the post-forward-2 state: the 19 synthetic entities and the 664 workers removed, worker 1536 re-pointed to 741/185 and a member of campaign 50 only, `_oux_hygiene_log` holding 2653 pending (`rolled_back_at IS NULL`) rows of this second `10_remove_test_dataset` run plus the earlier rolled-back run and `90`'s reversal rows. This matches the plan's D17 disposition (§3.5, §7 condition 4): the clone stays forward until retired.

**Rehearsal complete.** `00_preflight.sql`, `10_remove_test_dataset.sql` and `90_rollback.sql` have now all been exercised successfully on the clone after fix rounds 1–4b: forward → rollback → forward again, with `00` comparisons confirming reversibility (data-identical; the only non-permitted differences traced to DA0.3's concurrent, independent migration on the shared clone). The rehearsal supports handing DA0.2 to the operator for the production run, subject to the plan's P1/P2/P6 gates (§5) which are not part of the clone rehearsal.

## 10. Review

**2026-09-22 — Reviewer: Fable, round 1.** Read `00_preflight.sql`, `10_remove_test_dataset.sql`, `90_rollback.sql`
and this plan against the §5 row, D4, D16, the §7 risk row and `ORCHESTRATION_PROMPT.md:32–45, 100–120, 173`.
Read-only, PII-free queries were run on production and the clone (counts, ids, names, `pg_catalog`); nothing was
written anywhere, no mutating SQL was run, the full preflight body was executed on the clone (231 rows, every
section returns). Verdict: **CHANGES REQUIRED** (two blocking findings, both in the forward/rollback pair; the
identification itself holds).

**Verified (production unless stated; identical on the clone where checked).** The scope filter selects exactly 664
rows, all active, all on worksites 196–199, none with `reference_id`; md5 of the ids
`f6589df6e2507a35542632026c3d0c34` on both projects; the employer-less pair is exactly 681 and 1537; 304 carry
`member_number`, no worker outside the 664 carries one at all, 5,229 outside carry `reference_id`; 0
`worker_membership_transitions` / 0 `worker_history` rows for the 664, all 664 `updated_at` 2026-08-20; no
membership or placement of the 664 outside 15/37; the only worker outside the 664 with a membership or placement
in 15/37 is 1536 (memberships 37/50/64, placement 37:25); 741 is "Australian Workers' Union WA Branch", 185 "AWU
Head Office"; 15 = Test2 and 37 = testco, both active, not SMS episodes, not standing, no parent, no children;
`campaign_timelines` (the fourth NO ACTION campaign child) holds 0 rows for 15/37. From `pg_constraint`: the six
roots' actions are campaigns a=4 c=59 n=10, workers c=41 n=22, projects a=2 c=2 n=1, programs c=1 n=1,
worksites a=3 c=8 n=5, employers a=9 c=8 n=11 (production counts, matching §3.1.1 incl. the production-only
edges); no `ON DELETE SET DEFAULT` key; the one composite key does not reach a root; no cross-schema key into
`public`; no partitioned table; every user trigger on `public` is in state `O`; the hygiene log has RLS on, no
grant to `anon`/`authenticated`, the WP0.4 `action` CHECK, 736 rows (346 on the clone), 0 DA0.2 rows. The guard
block in `10` and `90` is byte-identical to `oux-wp3.8/10_campaign64_family.sql:31–45`; no committed file names a
project or carries an executable `SET LOCAL oux.env` line. Checksum queries are deterministic (ordered
`string_agg`, NOT NULL keys, `IS DISTINCT FROM` on NULL digests). Delete order campaigns → workers → projects →
program → A2 → worksites → employers is respected and resolves every NO ACTION key listed in §3.1.1; A1 and A2
sit where D16 needs them.

### Findings (ranked)

1. **Blocking — the rollback cannot run as written; a row is logged as `update` and then deleted.**
   `scripts/data-hygiene/da0.2/10_remove_test_dataset.sql:407–441` runs the SET NULL step for each root before the
   later roots' closures exist, and its `NOT EXISTS` (`:423`) only sees rows doomed so far. `worker_notes` rows 4
   and 5 belong to two of the 664 workers and carry `campaign_id = 37` (verified on production), so step B logs
   three `worker_notes` updates (1, 4, 5) and nulls them, then step C collects 4 and 5 (with `campaign_id` already
   NULL in `row_data`) and deletes them. `90_rollback.sql:194–204` then stops: "2 logged update row(s) of
   worker_notes no longer exist". Consequences: the rehearsal fails at the first `90`; the predicted log rows
   (`da0.2.md` §3.2, §4) are 3,141 / 2,655, not 3,139 / 2,653; the preflight's F section (`00_preflight.sql:76–83`,
   which excludes the whole closure) prints `worker_notes 1` and does not describe what `10` does. Same class,
   0 rows today: `sms_interactions.campaign_id`, `email_cta_responses.campaign_id`, `petition_signatures.campaign_id`
   (SET NULL from campaigns, CASCADE from workers), `worksite_contracts.project_id` / `.program_id`. Fix: collect
   the cascade closure of all six roots (function steps 0–1) before any SET NULL or delete runs, so step 2 sees
   the full doomed set and the log matches the preflight; or split `da02_remove_root` into a collect phase and a
   remove phase. Keep `90`'s existence precondition as is (it is the right check once `10` is fixed).

2. **Blocking — `90`'s post-assertions make the rollback unusable after any legitimate movement, contradicting the
   claim the approval relied on.** `90_rollback.sql:439–479` require every table count in the FK neighbourhood
   (which includes `workers`, `campaign_worker_membership`, `campaign_worker_ou`) and every campaign's checksum to
   equal the snapshot's *before* state. On production the first weekly batch or sync-on-open after the forward
   run changes those, and `90` aborts. §3.4 item 1 (`da0.2.md:377–381`) says the hard delete "can be reversed on
   production at any time until the log rows are dropped" and §6 (`:549`) and §7 condition 2 use that to replace
   the §7 risk row's soft-delete-first; as written the rollback is guaranteed only inside the quiet window. Fix:
   `90` takes its own before-state and asserts deltas — each logged table: now = 90-before + rows reinserted;
   campaigns 15 and 37 equal to the snapshot; 64 = 90-before + 1 (1536); every other campaign equal to 90-before —
   and keeps the snapshot-equality checks strict only where `_oux_env_marker` exists (the clone, where the preflight
   diff proves identity) or downgrades them to `WARNING` on production. Alternatively amend §3.4 item 1, §6 and §7
   to say what the rollback guarantees and when, and put the soft-delete question back to the operator.

3. **Advisory — the identification argument should cite every matching tier, not only `reference_id`.**
   `da0.2.md:368–375` and P1 (`:522`) rest on `reference_id`; `OA_UNIVERSE_ALIGNMENT_PLAN.md:176` says both wizards
   match `reference_id → email → phone` (the worker wizard adds a name tier) and calls `member_number` "a dead
   column (no index, never written)". Verified on production: `workers_reference_id_unique` exists, no index on
   `member_number`; no `phone_e164` and no email of the 664 matches any worker outside the scope (0 / 0); 663 of
   664 emails match a test-address pattern; 29 of the 664 (18 of the 9 April batch, 9 of the 16 April batch)
   share first + last name with a worker outside the scope — expected for a generated fixture, and the reason the
   email/phone result matters. Add the dead-column citation to P1 and the three counts as preflight B rows.

4. **Advisory — P2 lacks the one fact the operator needs.** Worker 1537 (employer NULL, created 27 May by hand,
   member of 37) is the only one of the 664 whose email does not match the test-address pattern; 681 and 1541
   do match it. State this in P2 (`da0.2.md:523`), ids only.

5. **Advisory — self-referencing SET NULL keys are invisible to both scripts.** `10:75–94` and `00:35–51` exclude
   `c.conrelid = c.confrelid`, so `campaign_organising_units.parent_ou_id`, `call_scripts.base_script_id` and
   `activist_tasks.next_task_id` (all SET NULL) are in neither preflight F nor step 2; a surviving row pointing at
   a doomed row would be nulled without a log row and without a count change to catch it. 0 rows today (units
   outside 25–27 with a parent in 25–27: 0; scripts based on the doomed script 20: 0; `activist_tasks` in 15/37:
   0). Include self-referencing SET NULL edges in step 2 (the walk itself may still exclude them) or assert 0.

6. **Advisory — NO ACTION keys between two doomed tables are not ordered.** `10:455–474` orders deletes by
   (depth DESC, table_name) over CASCADE edges only; from `pg_constraint` on the clone the closure contains e.g.
   `pia_actions.pabo_id → pabo_applications` (both depth 1, parent sorts first), `campaign_permission_requests
   .approved_permission_id → campaign_edit_permissions`, `pia_actions.pabo_question_id → pabo_ballot_questions`
   (depth 1 → 2). 0 rows in scope today, and a hit aborts harmlessly, but late and after minutes of work; the
   preflight G section cannot show them because it excludes doomed child rows (`00:79–80`). Print NO ACTION edges
   between closure tables with counts in the preflight, or add a topological pass over them to the delete order.

7. **Advisory — four row-level DELETE triggers, not two.** `da0.2.md:382–384`, `10:33–35`: production also has
   `campaign_agreements.trg_sync_campaign_replaced_agreement` and `worker_campaign_facts
   .trg_worker_campaign_fact_history` (inserts into `worker_campaign_fact_history`, which has no foreign key, so
   the strict count check would not notice the insert). 0 rows in scope for both today; list them and assert
   `worker_campaign_facts` has no row for 15/37 or the 664 in the preconditions.

8. **Advisory — the "identical `00`" criterion cannot hold for section K.** `da0.2.md:363–364`, `:453`, `:535–536`:
   `hygiene_log rows=` and `hygiene_log_da02_pending/rolled_back` grow with every run. State that those two K rows
   are excluded; everything else is expected identical (`updated_at` restored with triggers off; 1536 asserted
   byte-identical).

9. **Advisory — locks taken by `90`.** `90:228–231`: `ALTER TABLE … DISABLE TRIGGER USER` on every logged table
   (~72) holds SHARE ROW EXCLUSIVE locks to COMMIT, so app writes to `workers`, `campaign_worker_membership` etc.
   block (not fail) for the rollback's duration; note under P4. Permission is fine: `postgres` owns all 260
   `public` tables on both projects, every user trigger is `O` today so ENABLE restores the exact state, and RI
   triggers are untouched.

10. **Advisory — `10` takes no locks and fails late on concurrency.** A sync-on-open by any organiser during the
    run aborts at the post-check (harmless; P4). Consider `LOCK TABLE public.workers, public.campaign_worker_membership,
    public.campaign_worker_ou IN SHARE ROW EXCLUSIVE MODE` after the guard so a concurrent writer waits instead.

11. **Advisory — `90`'s precondition ignores the snapshot's `after_state`.** `90:131–211`: add pending rows =
    `after_state->>'rows_logged'` and (with the finding-2 caveat) workers total/active = `after_state`.

12. **Advisory — stale references.** `10:19, 31, 151, 216, 306, 333` cite `§2.1`, `§2.2`, `§3.5` and "operator
    input P2"; the content is at §3.0, §3.1.1, §3.4 item 6 and P1. `da0.2.md:270–272`: `soc_sessions.plan_id`
    references `campaign_stage_plans` (preflight F prints it so), not `section_plans`.

13. **Advisory — record why D16 survives the next batch.** Campaign 64's `campaign_employers` are 28, 39, 40, 83,
    84, 716, 721, 728 (neither 791 nor 741), so 1536's membership of 64 was manual and a refresh will not re-add
    it; campaign 50 lists 741 and 795, so its membership of 50 survives the re-point. This is what keeps "member
    of 50 only" true after the run and `90`'s `cwm=50` precondition stable.

14. **Advisory — tidy-up.** `10:357`: `pg_temp.da02_remove_root` outlives COMMIT for the session; `DROP FUNCTION`
    before COMMIT (the precedent leaves no object behind).

**Rules.** No production write, no CLI, no migration edited, no history invented, no personal field in any
committed file (the plan carries organisation, worksite and campaign names, ids, counts and digests only).
**Scope.** Nothing outside the package. **Provenance.** N/A (rows removed, not created). **Tests.** N/A (SQL
only); the clone rehearsal is the test. **§8 deviations.** None yet. **§5 P1–P6.** P1 `member_number` reading
(stop until confirmed); P2 681/1537/1541 synthetic (included as D4 counted them); P3 1536's campaign-64 list items
stay; P4 quiet window before the next batch; P5 Action Network out of scope; P6 ten roles, not eleven. Gating P1,
P2 and P6 to the production run and not the clone rehearsal is sound: the clone is a copy, nothing real can be
lost there, and the rehearsal proves the rollback — but only once finding 1 is fixed, because `90` as written
cannot run on the clone either. **Fix round.** One of two; re-review after the implementer resubmits `10` (and `90` or the plan text for finding 2).

**Fix round 1 — applied 2026-09-23 (planner).** Per finding:
1. applied — `10`: `pg_temp.da02_collect_root` gathers all six roots' closures first; `pg_temp.da02_apply_set_null`
   runs once against the full closure (`NOT EXISTS` over the whole `_da02_doomed`); `pg_temp.da02_remove_root`
   logs and deletes. `worker_notes` 4 and 5 are now closure rows (logged as deletes). Predicted log rows stay
   3,139 / 2,653 (§3.2); preflight F prints exactly the 16 update rows `10` writes (Σ row added).
2. applied — `90`: own before-state (`_da02_checksums_before`, `_da02_before`); post-assertions are deltas
   (logged tables = before + reinserted; 15/37 = snapshot; 64 = before + 1 membership, placements unchanged;
   other campaigns unchanged across the run; workers = before + 664); snapshot byte-identity enforced only
   where `_oux_env_marker` exists, `WARNING` otherwise. §3.4 item 1, §6 and the approval text stay with
   no soft-delete-first.
3. applied — P1 cites `OA_UNIVERSE_ALIGNMENT_PLAN.md:176` (dead column, three matching tiers) and the
   index facts; preflight B rows `phone_e164_shared_with_outside`, `email_shared_with_outside`,
   `email_test_patterned`, `email_not_test_patterned_ids`, `name_collisions_with_outside` added (0 / 0 / 663 /
   `1537` / 29 on production; 0 / 0 / 663 / `1537` / 6 on the clone); §3.0 table extended.
4. applied — P2 states that 1537 is the only one of the 664 whose email does not match the test pattern.
5. applied — self-referencing keys are in `_da02_edges` (`is_self`), take part in the SET NULL step and the
   delete ordering, and are excluded from the closure walk; preflight F/G include them (0 rows today).
6. applied — preflight section G2 prints `NO ACTION`/`RESTRICT` keys between closure tables with counts
   (10 keys / 2,351 rows on production, 2,110 on the clone; all resolved by the root order or deferrable);
   `10` orders each root's deletes topologically and its `$cross_root$` block stops if a non-deferred key's
   child would go in a later root than its parent (0 rows today).
7. applied — all four DELETE triggers listed (`10` header, §3.4 item 2); `10` asserts 0 rows in
   `worker_campaign_facts` (15/37 or the 664) and `campaign_agreements` (15/37); preflight D row added.
8. applied — §3.1, §3.3, §4 state the section-K exclusion for the "identical `00`" comparisons.
9. applied — P4 notes the SHARE ROW EXCLUSIVE locks `90` holds until `COMMIT`.
10. applied — `LOCK TABLE workers, campaign_worker_membership, campaign_worker_ou IN SHARE ROW EXCLUSIVE MODE`
    after the guard in `10`.
11. applied — `90` precondition: pending rows = `after_state->>'rows_logged'`; workers = `after_state` on
    clone/dev only.
12. applied — `10`'s comments now cite §3.0, §3.1.1, §3.1.2, §3.4 item 6 and P1; §3.1.2 names
    `campaign_stage_plans` as `soc_sessions.plan_id`'s target.
13. applied — §3.4 item 9 records campaign 64's employers (28, 39, 40, 83, 84, 716, 721, 728) and 50's (741,
    795).
14. applied — the three `pg_temp` functions are dropped before `COMMIT`.
Also found and fixed while re-running: `00`'s `env_marker` row referenced `public._oux_env_marker` directly
and failed on production; it is now guarded with `to_regclass`. Re-run 2026-09-23, read-only: production 250
rows, clone 248 rows, every section returns (A 24, B 43, C 6, D 12, E 73, F 7, G 3, G2 10, H 15, I 24/22,
J 22, K 11). Awaiting re-review.

**Fix round 2 — applied 2026-09-24 (planner; the last permitted).** The clone rehearsal stopped at step 2 with
`ERROR 55000: record "r" is not assigned yet` (`10_remove_test_dataset.sql:347`, the `$preconditions$` block):
`public.campaign_unit_rules r` shared its alias with the block's DECLAREd `r record`, so PL/pgSQL resolved
`r.campaign_id` and `row_to_json(r)` against the unassigned variable. The transaction rolled back; the clone is
untouched (§9/§11). Applied:
1. Alias renamed: `campaign_unit_rules r` → `campaign_unit_rules cur` (`cur.campaign_id`, `row_to_json(cur)`).
2. Sweep of every DO block and pg_temp function in `10` and `90` (DECLAREd variables and parameters against
   every `FROM`/`JOIN`/`UPDATE` alias, every `row_to_json(alias)` / `alias.*`, and every unqualified column
   name against variable and OUT-parameter names): `10` — `$environment_guard$` (v_valid; no aliases),
   `$preconditions$` (r, v_count, v_ids, v_txt vs aliases c, e, m, n, o, pcl, s, u and the renamed cur — the
   only collision was `r`), `da02_collect_root` (e, pk, v_added, v_depth, v_n, p_* vs d, x), `da02_apply_set_null`
   (e, pk, v_n, p_step vs d, h, s, x), `da02_remove_root` (pk, r, v_after, v_before, v_n, v_ord, v_pick, p_* vs
   c, d, e, o), `$cross_root$` (e, pk, v_count vs c, d, p, x), `$postconditions$` (r, v_before, v_count,
   v_deletes, v_doomed, v_txt, v_updates vs b, c, d, e, i, l, o, u); `90` — `$preconditions$` (pk, r, v_count,
   v_txt vs d), `$replay$` (cols, pk, r, v_n, v_null_cols, v_pass, v_progress, v_row, v_sql vs e, f, p, x),
   `$postconditions$` (r, v_count, v_own, v_snap, v_txt vs b, c, cl, e, n, o, p, tg, u, w). No other alias
   equals a variable or parameter; no unqualified column (`table_name`, `tbl`, `ord`, `root`, `n`, `depth`,
   `log_id`, `action`, `child`, …) equals a variable or an OUT parameter in the block that uses it (the OUT
   parameters `table_name`, `rows_deleted`, `rows_set_null` are only ever referenced qualified, `d.table_name`
   / `s.tbl`); the earlier `strict` → `is_strict` rename already removed the one keyword-shaped alias. Every
   `format()` string was re-counted: identifiers through `%I`, literals through `%L`, generated SQL fragments
   and type names through `%s`, argument counts matching.
3. §8 records the new rehearsal step: the verifier dry-runs `10` with `COMMIT;` → `ROLLBACK;` on the clone
   before the real forward run (§3.5 updated). No other change; predicted log rows and acceptance figures
   unchanged. Awaiting re-review.

**Fix round 3 — prepared, NOT rehearsed (operator authorisation required, ORCHESTRATION_PROMPT stop rule).**
The resumed rehearsal's `90` failed at `90_rollback.sql:72`: `_da02_pending` (`:67–70`) projected only `log_id,
action, table_name, row_pk, before_row` while `_da02_snapshot` selects `after_row AS after_state` from it (the
`after_row` read was added in fix round 1 for finding 11 without extending the projection). Change made:
`_da02_pending` now projects `after_row` as well (one line, `90_rollback.sql:68`). Cross-checks then made, every
temp table and CTE against every column its consumers reference, and every snapshot key against what `10` writes:
- `90` `_da02_pending(log_id, action, table_name, row_pk, before_row, after_row)`: consumers use `log_id`,
  `action`, `table_name`, `row_pk`, `before_row` (`SELECT *` / `p.*` into `r` in the replay: `r.log_id`,
  `r.action`, `r.table_name`, `r.row_pk`, `r.before_row`), `after_row` (`_da02_snapshot`) — all present.
- `90` `_da02_snapshot(log_id, before_state, after_state)`: consumers read `before_state` (`v_snap`, final
  `SELECT`) and `after_state` (preconditions) — present.
- `90` `_da02_edges(child, col, parent, refcol, ref_type, del, conname, col_notnull)`: consumers use `child`,
  `col`, `parent`, `refcol`, `conname`, `col_notnull` — present (`is_self`/`is_deferrable` exist only in `10`'s
  copy and are not referenced in `90`).
- `90` `_da02_pk(tbl, pk_cols, pk_from_json, pk_match)`: preconditions use `pk_cols`, `pk_from_json`; replay uses
  `pk_match` (`$1` = `row_pk`) — present.
- `90` `_da02_cols(tbl, ins_cols, upd_cols, has_identity_always)`, `_da02_counts_before(tbl, n)`,
  `_da02_checksums_before(campaign_id, mem_n, mem_md5, ou_n, ou_md5)`, `_da02_before(workers_total,
  workers_active, strict_snapshot)`, `_da02_trig_before(tbl, tgname, tgenabled)`, `_da02_log_ids(log_id)`,
  `_da02_deferred(log_id, attempts)`, `_da02_fixups(log_id)`: every referenced column present.
- Snapshot keys: `10` writes `before_row = {workers_total, workers_active, counts{table→n}, checksums{campaign_id
  →{mem_n, mem_md5, ou_n, ou_md5}}, w1536}` and `after_row = {the same five, rows_logged}`. `90` reads
  `after_state->>'rows_logged'`, `->>'workers_total'`, `->>'workers_active'` (preconditions) and
  `before_state->'counts'->>tbl`, `->'checksums'->campaign_id` (compared as a whole jsonb object with the same
  four keys built by the same `jsonb_build_object`, NULL digests included), `->'w1536'` (compared with
  `to_jsonb(w)`, the same producer), `->>'workers_active'` (final `SELECT`) — every key written; nothing read
  that is not written. Log rows: `before_row` is `to_jsonb(row)` for deletes and the full row for updates, read
  back by `jsonb_populate_record` / the full-column `UPDATE`; `row_pk` keys are the primary-key column names
  built by `_da02_pk.pk_json_args`, read back by `pk_from_json` / `pk_match` with the same names.
- `10` re-checked the same way: `_da02_edges`, `_da02_pk(tbl, pk_json_args, pk_cols, pk_from_json)`,
  `_da02_doomed(seq, root, root_ord, table_name, depth, row_pk, row_data)`, `_da02_counts_before`,
  `_da02_checksums_before`, `_da02_before(workers_total, workers_active, w1536_row, log_rows)`, `_da02_log_ids`,
  `_da02_setnull(tbl, n)`, `_da02_order(root, tbl, ord)`, `_da02_summary(step, root, table_name, rows_deleted,
  rows_set_null)`, `_da02_collected(root, root_ord, n)` — every referenced column present (the clone's forward 1
  succeeding is the empirical check).
- The clone's forward-1 figures agree with the check `90` makes first: 2,652 pending rows excluding the snapshot
  = `after_state->>'rows_logged'` 2652.
No other change. The clone stays in its hold state (§11) until P7 is answered.

**Fix round 4 — applied (operator-authorised rehearsal continuation), 2026-09-24.** The resumed `90` stopped
at its step-4 fallback: `email_send_log {"send_id": 274} cannot be reinserted (foreign-key violation with no
nullable key to relax)`. Cause, read from the clone's pending log rows (ids only): `email_send_log.draft_id`
(NOT NULL) → `campaign_comms_drafts` 47, logged at 4371 under step B, later than the send row (4230, also B), so
in reverse log order draft 47 came first — but draft 47 was itself deferred, because
`campaign_comms_drafts.email_list_id` (nullable) → `email_lists` 17, logged at 4093–4097 (B), *earlier* than
the drafts and therefore *later* in reverse order, while `email_lists.draft_id` (nullable) points back at the
drafts: a genuine mutual reference. Both tables were deferred; the single retry pass could not land either;
the fallback then relaxed and inserted the drafts, and in the same loop reached send 274 — which has no
nullable key of its own — and raised, although one more retry pass would have landed it. (The same reverse-
order inversion also exists for `call_list_items.list_id` → `call_lists`: 98 items are logged under step B
before the lists (4253–4259) but 48 more under step C (up to 4443) after them; the old retry would have
handled that one.) Changes:
1. `90` orders the pending *tables* topologically from `pg_constraint` (parents first; self-references ignored;
   `DEFERRABLE` keys treated as absent), breaks a cycle by choosing the table whose unplaced parents are all
   reached through nullable columns (relaxed on insert, completed by a full-row update after its parents are
   in), inserts each table's rows by `log_id` ascending, and applies the `update` rows only after every
   delete-row has landed (newest first, so a row nulled through several keys ends at its original state).
   For the clone's pending set the only cycle is `campaign_comms_drafts.email_list_id` ↔ `email_lists.draft_id`
   (both nullable); the order places `email_lists` first with `draft_id` relaxed (its other parent `campaigns`
   is placed already), then `campaign_comms_drafts`, then `email_send_log`, `oauth_send_batches`,
   `sms_send_log`, `email_click_tokens`.
2. The retry loop stays as a safety net, continues while *any* row lands (up to 50 passes) and raises only
   when a whole pass lands nothing; the message names the row (`row_pk`), its table, the violated constraint
   (`GET STACKED DIAGNOSTICS … CONSTRAINT_NAME`, `MESSAGE_TEXT`) and the parent table looked up from
   `_da02_edges` by constraint name.
3. Every pending table with a NOT NULL key into another pending table (clone, 2,652 pending rows; parents
   named after `→`), all placed after their parents by the order in 1: `activity_ambitions` → `campaign_activities`,
   `plan_ambitions`; `an_tag_sync_log` → `campaigns`; `call_attempt_outcomes` → `call_attempts`,
   `call_outcome_definitions`; `call_attempts` → `call_list_items`; `call_list_items` → `workers`, `call_lists`
   (the step-B/step-C split above); `call_list_scripts` → `call_lists`, `call_scripts`; `call_lists` →
   `campaigns`; `call_script_sections` → `call_scripts`; `call_scripts` → `campaigns`; `call_share_form_events`
   → `call_share_tokens`; `call_share_tokens` → `call_lists`; `call_step_outcomes` → `call_attempts`,
   `call_script_sections`; `campaign_activist_profiles` → `campaigns`, `workers`; `campaign_activities` →
   `campaigns`; `campaign_activity_ratings` → `campaign_activities`, `workers`; `campaign_ambitions` →
   `campaigns`; `campaign_comms_drafts` → `campaigns`; `campaign_employers` → `campaigns`, `employers`;
   `campaign_groups` → `campaigns`; `campaign_leader_form_events` → `campaign_leader_tokens`;
   `campaign_leader_tokens` → `campaign_task_lists`; `campaign_leader_worker_links` → `campaigns`, `workers`
   (×2); `campaign_organisers` → `campaigns`; `campaign_organising_units` → `campaigns`;
   `campaign_situation_analyses` → `campaigns`; `campaign_stage_plans` → `campaigns`;
   `campaign_task_list_items` → `campaign_task_lists`; `campaign_task_lists` → `campaigns`;
   `campaign_worker_list_items` → `campaign_worker_lists`, `workers`; `campaign_worker_lists` → `campaigns`;
   `campaign_worker_membership` → `campaigns`, `workers`; `campaign_worker_ou` → `campaign_organising_units`,
   `workers` (and `campaign_groups`, deferrable); `campaign_worksites` → `campaigns`; `email_click_tokens` →
   `email_send_log`; `email_list_items` → `email_lists`, `workers`; `email_lists` → `campaigns`;
   `email_send_log` → `campaign_comms_drafts`, `workers`; `employer_scopes` → `employers`;
   `employer_worksite_roles` → `employers`, `worksites`; `phone_call_action_lists` → `phone_call_actions`,
   `call_lists`; `phone_call_actions` → `campaigns`; `plan_revision_notes` → `campaigns`; `plan_wtp_ambitions`
   → `plan_ambitions`, `plan_where_to_play`; `program_worksites` → `programs`, `worksites`; `project_employers`
   → `employers`, `projects`; `projects` → `worksites`; `reporting_snapshots` → `campaigns`;
   `section_plan_situation_snippets` → `section_plans`; `section_plans` → `campaigns`; `sms_send_log` →
   `campaign_comms_drafts`, `workers`; `sms_survey_definition_versions`, `sms_survey_questions`,
   `sms_survey_sessions` → `sms_surveys` (sessions also → `workers`); `sms_surveys` → `campaigns`;
   `worker_activity_log` → `worker_campaign_connections`; `worker_an_tags`, `worker_notes`, `worker_tags` →
   `workers`; `worker_campaign_connections` → `campaigns`, `workers`; `worksite_scopes` → `worksites`. The
   roots `campaigns`, `workers`, `employers`, `worksites`, `programs`, `projects` have only nullable keys
   between them (`workers.employer_id/worksite_id/project_id`, `projects.worksite_id` is NOT NULL →
   `worksites` placed first, `programs.principal_employer_id`, `worksites.principal_employer_id/operator_id`),
   so the order is well defined without relaxation among the roots.
4. The clone/dev byte-identity check on worker 1536 compares only the snapshot's 49 keys (§8).
No mutating SQL was run; the clone stays in its hold state until the verifier resumes from step 4 under the
operator's continuation authorisation.

**2026-09-23 — Reviewer: Fable, round 2.** Re-read `00_preflight.sql` (286 lines), `10_remove_test_dataset.sql`
(861) and `90_rollback.sql` (607) in full and the fix-round entries above; ran the revised preflight's B/D/E/F/G/G2/K
rows read-only on the clone. Verdict: **APPROVE WITH ADVISORIES** — every round-1 finding is resolved; nothing
blocking remains; the clone rehearsal may proceed once advisory A below (a one-number plan correction) is made,
because the §5 stop condition keys on §3.2's expected values.

Resolution of the 14 findings, with the lines that resolve them:

1. Resolved. `10:565–571` collects all six roots' closures (`da02_collect_root`, `:388–432`) before A1 (`:605–627`),
   the SET NULL step (`da02_apply_set_null`, `:438–481`, whose `NOT EXISTS` at `:460` now sees the whole
   `_da02_doomed`) and the deletes (`:634–662`). `worker_notes` 4 and 5 are closure rows (E on the clone:
   `worker_notes 2`) and are logged once, as deletes; F prints `worker_notes.campaign_id 1` and `Σ update log rows
   10 will write = 16`, which is exactly what `10` writes. `90:231–241` (update rows must exist) therefore holds.
   Predicted log rows 3,139 / 2,653 confirmed: closure 3,119 / 2,633 + A1 2 + SET NULL 16 + A2 1 + snapshot 1.
2. Resolved. `90:127–139` takes its own before-state; `:447–453` workers = own + 664; `:484–510` every logged
   table = own before + rows reinserted (strict), snapshot equality strict only when `strict_snapshot`
   (`to_regclass('public._oux_env_marker') IS NOT NULL`, `:139`) and a `WARNING` otherwise; `:512–550` campaigns
   15/37 equal to the forward snapshot, 64 = own + 1 membership with placements unchanged, every other campaign
   unchanged across the run, snapshot equality strict on clone/dev only; 1536 structural state strict everywhere
   (`:467–475`), byte-identity strict on clone/dev only (`:476–482`). §3.4 item 1's "at any time" claim now holds.
3. Resolved — P1 (`da0.2.md:576`) cites plan `:176`, the index facts and the phone/email/name counts; preflight B
   rows added (`00:` `phone_e164_shared_with_outside`, `email_shared_with_outside`, `email_test_patterned`,
   `email_not_test_patterned_ids`, `name_collisions_with_outside`); clone values 0 / 0 / 663 / `1537` / 6 reproduced.
4. Resolved — P2 (`:577`) names 1537 as the one non-test-patterned email, ids only.
5. Resolved — `_da02_edges` carries `is_self` (`10:102`); the walk excludes self-references (`:410`), the SET
   NULL step includes them (`:447–451`), the topological pick excludes them (`:509`); preflight F/G print them
   (`00:` `side` CTE, self CASCADE keys go to G).
6. Resolved — per-root topological order over CASCADE/NO ACTION/RESTRICT keys with a deepest-first fallback and
   a NOTICE on a cycle (`10:500–520`); log order `o.ord, depth DESC, seq` (`:528`) so the reverse replay stays
   parents-first; `$cross_root$` (`:573–599`) stops on any non-deferred NO ACTION/RESTRICT closure row whose
   parent is in an earlier root (`p.root_ord < c.root_ord`, the correct direction); preflight G2 prints the keys
   with counts (clone: 20 keys / 2,110 rows, all resolved by the root order or deferrable).
7. Resolved — four DELETE triggers listed (`10:37–43`); `10:354–362` asserts 0 rows in `worker_campaign_facts`
   and `campaign_agreements` for the scope; preflight D row prints `0/0` on the clone.
8. Resolved — section-K exclusion stated (`00:5–7`, `90:596–598`, `da0.2.md:405, :507`).
9. Resolved — P4 (`:579`) records `90`'s SHARE ROW EXCLUSIVE locks.
10. Resolved — `LOCK TABLE public.workers, public.campaign_worker_membership, public.campaign_worker_ou IN SHARE
    ROW EXCLUSIVE MODE` immediately after the guard (`10:80`), before `_da02_counts_before` is taken.
11. Resolved — `90:173–186` (pending rows = `after_state->>'rows_logged'`; workers = `after_state` on clone/dev).
12. Resolved — cross-references corrected (see advisory B for one leftover).
13. Resolved — §3.4 item 9 records campaign 64's and 50's employers.
14. Resolved — `10:664–666` drops the three `pg_temp` functions (signatures match `:388`, `:438`, `:488`) before
    the post-assertions and `COMMIT`.

Also confirmed: the `00` env-marker row is guarded with `to_regclass` and dynamic SQL (`00:` K section; returns
`clone (2026-09-12)` on the clone and cannot fail on production); the guard blocks of `10` and `90` are still
byte-identical to `oux-wp3.8/10_campaign64_family.sql:31–45`; no committed file names a project or carries an
executable `SET LOCAL oux.env`; `10`'s post-check `expected_drop` (`:725–729`) and `v_deletes = v_doomed + A1`
(`:746`) are consistent with the restructured log.

Remaining advisories (none blocking):

- **A. Off-by-one in the plan's expected `snapshot_rows_logged`.** `10:819` evaluates `rows_logged` as
  `count(*) FROM _da02_log_ids` inside the snapshot INSERT, before the snapshot's own `log_id` is appended
  (`:824`), so `after_state->>'rows_logged'` is 3,138 on production / 2,652 on the clone while `log_rows_pending`
  is 3,139 / 2,653. `90:174–179` compares against pending rows *excluding* the snapshot, so the scripts agree with
  each other; but `da0.2.md:368–369` (§3.2, the appended-SELECT expectations) says `3139, 3139` / `2653, 2653`, and
  `10:840–841` says "log rows for this run = rows_logged in the snapshot". Because the §5 stop condition says to run
  `90` when `10`'s appended SELECT differs from §3.2, correct §3.2 to `3139, 3138` / `2653, 2652` and the `10`
  header comment (or count `rows_logged` inclusive of the snapshot and adjust `90:174–179`); the first is the
  smaller change.
- **B.** `10:169` still cites "§2.1" (the scope table is §3.0); `90:11–13` still describes the forward log order
  as "deepest rows first" (it is now the topological order of `10:528`, which reverses to parents-first as before).
- **C.** Preflight G2's Σ row counts every NO ACTION key between closure tables (20 on the clone), while the
  fix-round note says "10 keys" (those with rows); label the Σ as "keys total / rows" or count only keys with
  rows, so the operator's comparison with §3.1.2 is unambiguous.

Rules re-checked: no production write, no CLI, no migration edited, no invented history, no personal data in any
committed file (the new preflight rows are counts and ids). Scope unchanged. §8 deviations: none. Gating of
P1/P2/P6 to the production run stands. Fix round 1 of 2 used; advisories A–C need no further review round.

## 11. Run sheet record

**Clone hold state (2026-09-24, after fix round 2's rehearsal).** `00` #1, the `10` dry run (`COMMIT;` → `ROLLBACK;`),
`10` forward 1 and `00` #2 succeeded and matched §3.2 / §4 exactly (`10`'s appended `SELECT`: 1629 / 1743 / 0 / 0
/ 0 / 0 / `emp=741 ws=185 cwm=50` / 0 / 2653 / 2652). `90` then failed at its line ~72 (`_da02_snapshot` read
`after_row` from `_da02_pending`, which did not project it); that transaction rolled back. **The clone is holding
in the post-forward-1 state: 2,653 pending log rows of `10_remove_test_dataset` (2,652 + the snapshot row), the
scoped entities absent, worker 1536 on 741/185 and a member of 50 only; no user trigger disabled.** Nothing
further is run on the clone until the operator authorises P7. Production is untouched.

_Production and clone runs: each step, pasted output, date, who ran it._

Advisories A–C of round 2 applied by the orchestrator, 2026-09-23 (plan §3.2 expectation corrected to 3139/3138 and 2653/2652; `10` header comment and `§2.1` citation; `90` header wording; preflight G2 Σ label).

| step | file | outcome | date | who |
|---|---|---|---|---|
| 1 | `00_preflight.sql` (00 #1, before) | 248 rows; matches §3.1 clone baseline (E Σ 2633/72, F Σ 16, G Σ 2, G2 20/2110, hygiene_log rows=346, env_marker clone 2026-09-12) | 2026-09-23 | verifier (Sonnet), via the connector under the orchestrator's approval |
| 2 | `10_remove_test_dataset.sql` (forward 1) | **ERROR — STOP.** `55000: record "r" is not assigned yet` in the `$preconditions$` block (line 347 `campaign_unit_rules r` alias collides with the block's `DECLARE r record;`). Transaction rolled back automatically before any row moved; clone unchanged | 2026-09-23 | verifier (Sonnet), via the connector under the orchestrator's approval |
| 3–7 | `00_preflight.sql` / `90_rollback.sql` / `10_remove_test_dataset.sql` | **NOT RUN** — verifier stopped at step 2 per the stop rule; clone left in its pre-run (00 #1) state | — | — |
| 0 (rerun) | `10_remove_test_dataset.sql` DRY RUN (`COMMIT;`→`ROLLBACK;` in the submitted text only) | Success; appended SELECT after ROLLBACK matches §8 pre-run values (2293/2407/2/8/4/10/emp=791 ws=197 cwm=37/50/64/0) | 2026-09-24 | verifier (Sonnet), via the connector under the orchestrator's approval |
| 1 (rerun) | `00_preflight.sql` (00 #1, before) | 248 rows; identical to the 2026-09-23 00 #1 in every row | 2026-09-24 | verifier (Sonnet), via the connector under the orchestrator's approval |
| 2 (rerun) | `10_remove_test_dataset.sql` (forward 1) | Success; appended SELECT matches §3.2 exactly (1629, 1743, 0, 0, 0, 0, emp=741 ws=185 cwm=50, 0, 2653, 2652) | 2026-09-24 | verifier (Sonnet), via the connector under the orchestrator's approval |
| 3 (rerun) | `00_preflight.sql` (00 #2, after forward 1) | 118 rows; matches §4/§8 post-forward expectations (entities gone, w1536 emp=741 ws=185 cwm=50, campaign 64 mem_n 276→275, hygiene_log rows=2999, pending/rolled_back 2653/0, no test/testco clusters) | 2026-09-24 | verifier (Sonnet), via the connector under the orchestrator's approval |
| 4 (rerun) | `90_rollback.sql` | **ERROR — STOP.** `42703: column "after_row" does not exist` at line 73 (`_da02_pending`, created at line 67–70, omits `after_row` from its column list, but line 73 selects it). Bug in the committed script. Transaction rolled back automatically; clone left in the post-forward-1 (00 #2) state, NOT rolled back — 2653 pending log rows remain, entities still absent, 1536 on 741/185/cwm=50 | 2026-09-24 | verifier (Sonnet), via the connector under the orchestrator's approval |
| 5–7 (rerun) | `00_preflight.sql` / `10_remove_test_dataset.sql` | **NOT RUN** — verifier stopped at step 4 per the stop rule | — | — |
| 8 | leave clone forward | **NOT APPLICABLE YET** — the clone is currently forward from forward-1 only (not a completed forward-back-forward rehearsal); reversibility is unproven pending a fix to `90_rollback.sql` | 2026-09-24 | verifier (Sonnet) |
| 4 (resumed after P7) | `90_rollback.sql` (fix round 3: `_da02_pending` now projects `after_row`) | **ERROR — STOP.** `P0001: 90: email_send_log {"send_id": 274} cannot be reinserted (foreign-key violation with no nullable key to relax)` — a NOT-NULL FK from `email_send_log` into a still-pending table has no nullable column to relax (the replay's step-4 fallback only handles nullable-FK cycles). Not the byte-identity/DA0.3-column issue flagged; occurs earlier, during reinsertion. Transaction rolled back automatically; clone unchanged, still in the post-forward-1 (00 #2) state | 2026-09-24 | verifier (Sonnet), via the connector under the orchestrator's approval |
| 5–7 (resumed) | `00_preflight.sql` / `10_remove_test_dataset.sql` | **NOT RUN** — verifier stopped at step 4 per the stop rule | — | — |
| 4 (resumed after fix round 4) | `90_rollback.sql` (fix round 4: parents-first topological order, cycle relaxation, continuing retry passes, detailed error, narrowed 1536 identity check) | **ERROR — STOP.** `42804: column "ord" is of type integer but expression is of type text` — `_da02_torder`'s seeding `INSERT ... SELECT DISTINCT p.table_name, NULL, NULL ...` (line 291) resolves the two bare `NULL`s to `text` under `DISTINCT`, which does not implicitly cast to `ord`'s `integer` type. Fails before any row is touched (before the reinsert phase). Transaction rolled back automatically; clone unchanged, still in the post-forward-1 (00 #2) state | 2026-09-24 | verifier (Sonnet), via the connector under the orchestrator's approval |
| 5–7 (resumed after fix round 4) | `00_preflight.sql` / `10_remove_test_dataset.sql` | **NOT RUN** — verifier stopped at step 4 per the stop rule | — | — |
| 4 (resumed after fix round 4a) | `90_rollback.sql` (fix round 4a: `NULL::int, NULL::text[]` cast at line 291) | **ERROR — STOP.** `55006: cannot ALTER TABLE "campaign_organising_units" because it has pending trigger events` — step 7's `ALTER TABLE ... ENABLE TRIGGER USER` hits a pending deferred-constraint check queued by reinserting `campaign_organising_units` rows (its `group_id → campaign_groups` FK is `DEFERRABLE INITIALLY DEFERRED`, per §3.1.1). Cast fix worked; table ordering, reinsertion and retry/relax logic all completed. Transaction rolled back automatically; clone unchanged, still in the post-forward-1 (00 #2) state | 2026-09-24 | verifier (Sonnet), via the connector under the orchestrator's approval |
| 5–7 (resumed after fix round 4a) | `00_preflight.sql` / `10_remove_test_dataset.sql` | **NOT RUN** — verifier stopped at step 4 per the stop rule | — | — |
| 4 (resumed after fix round 4b) | `90_rollback.sql` (fix round 4b: `SET CONSTRAINTS ALL IMMEDIATE;` before the ENABLE TRIGGER loop) | **SUCCESS.** Appended SELECT matches §3.3 exactly: `forward_rows_pending=0, campaigns_15_37=2, employers_787_794=8, worksites_196_199=4, workers_active=2293, w1536='emp=791 ws=197 cwm=37/50/64'` | 2026-09-24 | verifier (Sonnet), via the connector under the orchestrator's approval |
| 5 (resumed after fix round 4b) | `00_preflight.sql` ("00 #3", vs "00 #1" of the 2026-09-24 rerun) | 248 rows. Every row outside section K identical, including campaign 64's checksum restored exactly (`mem_n=276 mem_md5=7136269b71a6a2e4bc17f4725f9ac5c7`). **Not fully identical:** `fp_fk_edges` (2b7d6ab9… → 4935f890…) and `fp_triggers` (eae74d6e… → ac616370…) both changed — a difference **outside** the permitted allowance (only `hygiene_log rows=` and `hygiene_log_da02_pending/rolled_back` are permitted to differ). Assessed as likely external schema drift on the shared clone (DA0.3/DA0.5 also rehearse there), not caused by DA0.2's scripts (no DDL in `10`/`90`; all other sections, including every checksum, are identical) — but per the stop rule this is reported as a mismatch, not silently passed | 2026-09-24 | verifier (Sonnet), via the connector under the orchestrator's approval |
| 6–8 (resumed after fix round 4b) | `10_remove_test_dataset.sql` (forward 2) / `00_preflight.sql` (00 #4) / leave forward | **NOT RUN (initial pass)** — verifier stopped at step 5's comparison per the stop rule pending confirmation the fingerprint drift is external and safe to proceed past | — | — |
| — | orchestrator confirmation | Confirmed: `fp_fk_edges`/`fp_triggers` changed because DA0.3's rehearsal ran on this shared clone between 00 #1 and 00 #3, adding `name_match_reviews` (FKs + 2 triggers) and `workers.names_import_id`; not DA0.2's doing. 00 #3 treated as matching 00 #1; proceed | 2026-09-24 | orchestrator |
| 6 | `10_remove_test_dataset.sql` (forward 2, vs rerun's forward 1) | **SUCCESS.** Appended SELECT identical counts to forward 1: `1629, 1743, 0, 0, 0, 0, emp=741 ws=185 cwm=50, 0, 2653, 2652` (log_ids higher, counts the same) | 2026-09-24 | verifier (Sonnet), via the connector under the orchestrator's approval |
| 7 | `00_preflight.sql` ("00 #4", vs "00 #2") | 118 rows; identical to 00 #2 except the same 2 permitted hygiene-log rows and the same 2 DA0.3-drift fingerprint rows already accepted at 00 #3 (nothing else differs) — campaign 64 checksum restored to the exact post-forward-1 digest, every J-pack count unchanged | 2026-09-24 | verifier (Sonnet), via the connector under the orchestrator's approval |
| 8 | leave the clone forward | Done — no further script run. Clone left in the post-forward-2 state per plan D17 (§3.5, §7 condition 4). **Rehearsal complete**: `00`/`10`/`90` all exercised successfully forward → rollback → forward, reversibility confirmed | 2026-09-24 | verifier (Sonnet), via the connector under the orchestrator's approval |

## 12. Operator decisions received (session, 2026-09-24)

| Input | Decision | Effect |
|---|---|---|
| P7 | Authorised: fix round 3 and the resumed rollback rehearsal | Rehearsal resumed; `90` stopped on a second defect (reinsert order across roots, `email_send_log` 274) — fix round 4 in progress under the same authorisation |
| P1 | The 304 synthetic workers carrying `workers.member_number` are synthetic data and are removed | `10`'s reading stands; no change to scope |
| P2 | Workers 681, 1537 and 1541 confirmed synthetic | as planned |
| P6 | Clarification requested (10 vs 11 roles): the scope is defined by the entities, not by a role list; the ten rows are every `employer_worksite_roles` row whose employer is 787–794 or whose worksite is 196–199 (ids 82, 83, 84, 85, 87, 89, 91, 93, 95, 97: TestCo Energy Operator, Fortis Maintenance Services Principal_Contractor, Pacific Coatings & Insulation Subcontractor and Alliance Site Services Principal_Contractor at Test Onshore Gas Plant; TestCo 2 Operator and NorthStar Marine Coatings Subcontractor at each of Alpha FPSO, Bravo Platform and Charlie FPU). Employers 792 and 794 hold no role row. The gaps in the id sequence (86 is Toll Energy at Gorgon LNG; 88, 90, 92, 94, 96 do not exist) are unrelated. The plan's "11" was a written count with no list behind it | pending the operator's acknowledgement |

**Fix round 4a (orchestrator, 2026-09-24):** `90_rollback.sql:291` — the two bare `NULL`s in the `INSERT INTO _da02_torder … SELECT DISTINCT` resolved to `text` under DISTINCT and could not be assigned to `ord int`; cast to `NULL::int, NULL::text[]`. No other change.

**Fix round 4b (orchestrator, 2026-09-24):** `90_rollback.sql` step 7 — `SET CONSTRAINTS ALL IMMEDIATE;` before the `ENABLE TRIGGER USER` loop, because the reinserted `campaign_organising_units` rows leave pending deferred-constraint events on the two DEFERRABLE keys into `campaign_groups`, and `ALTER TABLE` refuses a table with pending trigger events (55006). Same mechanism as `oux-wp2.1/03a_rollback.sql`. No other change.

### 11.1 Production run (operator, SQL Editor, 2026-09-24)

| Step | File | Outcome | Key values pasted |
|---|---|---|---|
| P1 | `prod/P1_preflight_before.sql` | matched §3.1.2 | ids_present 8/4/2/1/4; scope 664/664, md5 `f6589df6e2507a35542632026c3d0c34`; reference_id_not_null 0; member_number_not_null 304 (shape alpha1digits 7=160 / 8=144); employer-less 681, 1537; cwm/cwo outside 15/37 none; 1536 emp=791 ws=197 cwm 37/50/64 cwo 37:25; roles 82,83,84,85,87,89,91,93,95,97; set_null 3,4,5 / 4,5,6 / 1; E Σ 3119/72; F Σ 16; G Σ 2; G2 20/2351; H clean (program 6; worksites 196–199); J workers_active 5749, cwm 3460, cwo 2510; K hygiene_log 736, pending 0/0, env_marker absent, bypassrls t, session_replication_role f. (First attempt errored at `LINE 1: WHERE fk.del …`: a truncated copy from the session's file panel; the full file ran clean.) |
