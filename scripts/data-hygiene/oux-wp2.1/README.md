# OUX WP2.1 data hygiene and recovery scripts

These are operator-reviewed SQL artefacts for the WP2.1 campaign-group migration.
They are not migrations. Execute them only under explicit operator
authorisation for the named environment and exact step; the clone rehearsal
used that procedure. They print only aggregates, database identifiers, hashes,
and structural fields; they do not select contact details or person/unit names.

## Scope and safety

- Clone rehearsal has executed `03a` and `03b` forward/rollback/reapply, the
  migration, postflight/probes, schema recovery/ledger repair and the final
  migration reapply under separate operator approvals. Final clone
  postflight/probes are green. The CLI is relinked to normal dev
  `dpnnmkhabysfdogllsyh`; normal dev has not received WP2.1. On 2026-09-13 the
  operator waived normal-dev schema/e2e for this shipment because it is
  thin/noncritical/different; this is a verification gap, not a pass.
  `groups_v2` is not yet introduced and no app consumer reads the new schema. Every
  database mutation was clone-only, and production was never queried or
  touched by the agent.
- Final reviewer verdict: **APPROVE FOR PR/MAIN WITH PRODUCTION DB GATE**.
  Evidence commit, PR and merge are not yet claimed.
- Clone and development mutations require the persistent `_oux_env_marker`
  created by `01_environment_marker.sql`.
- A future production mutation has no persistent marker. The operator must add
  `SET LOCAL oux.env = 'production';` immediately after **every** `BEGIN;` in
  the mutating file, in the same submission. The committed files deliberately
  omit that setting and contain no project reference.
- `00` and `04` are reports. Compare their counts, hashes, H1-H10 output,
  view definitions/reloptions, auto-match exposure, and dynamic OU-dependant
  checksums at every rehearsal point. Their final result set repeats the
  important aggregates/checksums under stable labels so SQL Editor evidence
  does not depend on capturing `RAISE NOTICE`. The substantive organising-unit
  checksum covers every pre-WP2.1 business field except `updated_at` (and
  excludes migration-only `group_id`); a separate stable-label metadata
  checksum records `updated_at` churn. A1 equality applies to shared
  dependant labels; mapping/group helper labels legitimately appear or
  disappear as those stage-specific objects are created or rolled back.
- `_oux_hygiene_log` from WP0.4 must be retained until both WP2.1 cleanup
  rollbacks are no longer needed.
- The mapping files contain no source IDs. The operator populates them from
  reviewed `00` output.
- Persistent helper tables that reference units have stable primary keys so
  dynamic dependant checksums can order them deterministically. Their unit FKs
  use `ON DELETE CASCADE`: these rows are rehearsal/control metadata and cannot
  block a full-mode unit or campaign deletion. In particular, deleting a
  placement-mapping keeper removes that mapping row; it never rewrites
  `keep_ou_id` to NULL (which would mean remove-all).
- SQL Editor and `psql` format multi-result output/notices differently. Capture
  the final labelled result set in either tool; notices remain diagnostics,
  not the only evidence source.

## Reviewed run order

Run each numbered file as a separate submission with stop-on-error enabled:

1. `00_preflight_hazards.sql`
2. `01_environment_marker.sql` — operator adds one same-transaction marker
   setting as instructed in that file; run once on clone/dev only.
3. `02a_h10_canonical_basis_mapping.sql`
4. Populate `_oux_wp21_canonical_basis` from the reviewed H10 chooser output.
5. `02b_placement_mapping.sql`
6. Populate `_oux_wp21_placement_mapping` only for partitions that the
   deterministic rules cannot resolve.
7. `03a_canonicalise_duplicate_bases.sql`
8. `03a_rollback.sql` (rollback rehearsal)
9. `03a_canonicalise_duplicate_bases.sql` (re-apply)
10. `03b_resolve_future_group_conflicts.sql`
11. `03b_rollback.sql` (rollback rehearsal)
12. `03b_resolve_future_group_conflicts.sql` (re-apply)
13. Apply the WP2.1 schema migration through the separately approved `db push`
    workflow. The migration file follows repository convention and has no
    explicit transaction wrapper. Supabase CLI v2.84.4 executes each file as
    one implicit pipelined transaction; the first 55006 failure fully rolled
    back all objects and the ledger, proving atomicity. Production/operator
    execution must use rehearsed `supabase db push` or explicitly
    single-transaction `psql -1 -v ON_ERROR_STOP=1 -f <migration-file>`.
    Plain autocommit `psql -f` is forbidden because the migration's temp
    tables/postconditions require one transaction. Retain the partial-object
    guard as defense in depth. The unit `updated_at` trigger remains enabled: the
    migration reports the count whose timestamp advanced and asserts it equals
    the units whose `group_id` was populated. Immediately after both
    `group_id` backfill updates, the migration executes
    `SET CONSTRAINTS public.campaign_organising_units_group_id_fkey, public.campaign_worker_ou_group_id_fkey IMMEDIATE;`
    before any following `ALTER TABLE` or index DDL. The rehearsed implicit
    pipeline emits 25P01 because it is not an explicit transaction block, but
    the statement still flushed queued deferred RI events: the subsequent
    `ALTER TABLE` succeeded twice. Both constraints remain catalogued
    `DEFERRABLE INITIALLY DEFERRED`.
14. `04_postflight_hazards.sql`
15. `95_role_probes.sql` (always rolls back; it has no environment-marker
    guard, so execute the exact whole file only with stop-on-error)
16. `90_rollback_wp2_1_campaign_groups.sql` (recovery rehearsal only)
17. `04_postflight_hazards.sql`

`03b` intentionally has two transactions. Its first block replaces the
ID-only diagnostic table with the current H9 partitions marked `planned` or
`unresolved`, then raises before the change block if any partition is
unresolved. Block 2 marks planned rows `applied` only in the same transaction
as successful changes. An aborted block 2 therefore remains visibly planned,
never apparently applied. Unresolved or aborted runs are idempotent at the
diagnostic layer: block 1 clears and recomputes current state. A successful
apply is intentionally one-run-per-rollback-cycle; active audit rows stop a
second apply. A successful `03b_rollback` marks the current diagnostic rows
`rolled_back` in the same transaction as data restoration, after which
reapply is allowed. On a future production run, the same-session guard must
be added to both transactions.

## Rollback order

To undo everything, first run the schema recovery script
`90_rollback_wp2_1_campaign_groups.sql`, then:

1. `03b_rollback.sql`
2. `03a_rollback.sql`

The cleanup rollbacks also work while WP2.1 is installed, because WP2.1 has no
unique `(worker_id, group_id)` index. They must not be run after WP2.2
enforcement. `03a_rollback.sql` runs `SET CONSTRAINTS ALL IMMEDIATE` after
restoring audited unit rows and before re-enabling the existing timestamp
trigger, clearing deferred RI events without changing cleanup semantics.

Migration-history repair is a recovery-only follow-up after `90`; it is not
contained in or executed by these files. It requires a fresh, explicit
operator approval for that exact command and target.

The first clone migration attempt failed with PostgreSQL `55006` at the
timestamp-trigger re-enable statement. The root cause was pending deferred FK
update checks from the two `group_id` backfills; trigger re-enable was only the
first `ALTER TABLE` statement to encounter them. The migration transaction
rolled back fully. The operator overrode the earlier timestamp-only diagnosis
and approved the explicit constraint flush above; no trigger suppression,
`session_replication_role`, or existing trigger/function alteration is used.
The corrected migration later applied on the clone with pre/post H9 0/0,
237 expected unit timestamp changes and exit 0, while emitting PostgreSQL
warning 25P01 for `SET CONSTRAINTS`. The CLI uses a pipelined implicit
transaction, not an explicit transaction block, so PostgreSQL warns. The named
statement nevertheless flushed the queued deferred RI events, proven by both
subsequent `ALTER TABLE` paths succeeding. The first 55006 failure's complete
object/ledger rollback proves CLI v2.84.4 migration-file atomicity. Both
catalog FKs remained `DEFERRABLE INITIALLY DEFERRED`; retain 25P01 as
deployment evidence. Postflight and rolled-back role probes succeeded. Schema recovery
and ledger repair then reverted the schema/version while retaining cleanup;
the final guarded reapply, exact `04`, and exact rolled-back `95` subsequently
completed green. Actual clone cleanup diagnostics/forward/rollback/reapply used
Supabase MCP; migration, exact `04`/`95`/`90`, dry-run/push and ledger repair
used the Supabase CLI. Earlier descriptions of MCP as read-only were wrong.

The recovered cleanup script bytes were not re-executed after the external
checkout loss. Static semantic review covers them, but production application
must treat that as a gate; do not call them byte-rehearsed. The recovered
migration, exact `04`, and exact `95` were re-run successfully. This does not
block the operator-directed `develop`/`main` shipment.

For this release, generated types completed exit 0 from the successfully
migrated clone with explicit ref `yqjkuobcawvigsfpgrcm`, never from the
script's production default. Read-only inspection confirmed both new tables,
both group relationships and all three functions, no deferred membership view,
and required generated `campaign_worker_ou.Insert.group_id` (a WP2.2 API/type
handoff). The generated diff also contains a harmless ordering swap of two
`user_profiles_organiser_id_fkey` relationship entries; it is not limited to
WP2.1 symbols. Normal dev may later be refreshed/replaced or migrated separately.
Its exact current `00` ran read-only and clean at 8 units / 111 memberships /
111 placements / F1 residual 0 / H10 residual 0; no schema migration or e2e
ran, so dev is not integrated. The active CLI ref remains normal dev
`dpnnmkhabysfdogllsyh`. Merging code before production migration is compatible because F1
uses legacy columns only and narrows matching, `groups_v2` is not yet introduced, and
the new view/unique enforcement/readers are deferred. Production mutation
remains blocked until the operator runs the current production `00`, supplies
reviewed canonical/placement mappings, runs the rehearsed cleanup, then
applies the migration. `malformed_or_nonpositive_basis_units` must be zero in
production `00` before relying on F1. The agent never accesses production.

## Decision logic

`03a` preserves every unit and every unrelated `unit_basis` key. For each
mapped duplicate basis, the selected canonical unit remains auto-matchable and
only noncanonical units receive top-level `"auto_match": false`.
`_oux_wp21_canonical_basis` has an identity primary key for stable checksum
ordering while its expression unique index remains the logical mapping key.
After applying those flags, `03a` re-runs the F1 exposure query inside the same
transaction. Within each `(campaign_id, fgk, worker_id)` it keeps only matching
units with the maximum count of present recognised basis keys. Thus a both-key
employer/worksite unit outranks an employer-only fallback in the same future
group, while the fallback remains eligible when no specific unit matches.
Equal-maximum ties remain a STOP and roll back all 03a product/log writes; C1
must still disable noncanonical units in an equally specific duplicate basis.

The pre-amendment clone attempt stopped with P0001 at 226 multi-target
partitions and rolled back (239 units, zero `auto_match=false`, zero 03a log
rows). The approved read-only simulation of the amended rule expects 226
pre-specificity partitions / 226 excess targets, 226 fallback targets
suppressed in one campaign, and zero equal-maximum residuals after the 13 C1
mappings.

`03b` resolves each `(campaign, future group, worker)` partition in this order:

1. explicit placement mapping (including `keep_ou_id = NULL` for remove-all);
2. exactly one maximum-specificity current-dimension match, unless another row
   has a live unit rule;
3. no dimension match and exactly one primary;
4. no dimension match/primary, exactly one manual row, and all others are
   unattributed rule-source rows;
5. otherwise stop before deletion.

Current-rule attribution comes only from a live `campaign_unit_rules` row on
the unit. It is never inferred from `assigned_rule_id`. No rule changes
`assignment_source`, and no rule selects by newest ID or timestamp.

`03a` and `04` are STOP gates when any live campaign-universe/future-group
partition still has more than one enabled equal-maximum-specificity F1 target
after C1. They report pre-specificity exposure, fallback suppression and
post-specificity residuals separately. The query applies the application's
planning/active, non-SMS and employer/worksite OR universe predicate to all
current workers; invocation batches and writable campaign filtering can only
reduce execution. `04` also asserts both unit and placement group FKs are
`ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED` and that authenticated has
no helper-table, TRUNCATE, or unintended sequence privileges. Direct group
deletion with surviving units/placements still fails when the deferred
constraints are checked.

The TypeScript matcher derives the same future-group identity from legacy
columns only: fixed types use `kind:<mapped-kind>`; a custom-kind child of a
custom-kind container uses `source:<container-ou-id>`; another custom-kind leaf
uses `type:<ou-type>`; a custom-kind container has no target key. It never
selects migration-only `group_id`, so code can deploy before or after WP2.1.

TypeScript and SQL accept the same positive int4 value domain for values
representable at runtime. Digit strings remain lexically strict. JavaScript
cannot distinguish JSON numeric `1.0` from numeric `1` after parsing, so no
claim of lexical byte-equivalence is made.

The derivation trigger sorts after the existing `trg_cou_enforce_*` BEFORE
triggers so legacy hierarchy fields are normalised first. Leaf-to-container
conversion is not a supported WP2.1 writer flow: a populated custom-kind leaf
conversion is rejected when placement group propagation encounters the
container's NULL group, while other direct conversions are not newly
normalised by WP2.1. No current application writer performing that transition
was identified; structural conversion remains a follow-up writer constraint.

The environment marker, mappings, conflict diagnostics and WP0.4 hygiene log
are persistent rehearsal/control metadata. `90` intentionally removes only
WP2.1 product schema; retain helpers until cleanup rollback evidence is no
longer required, then remove them only under a separately reviewed teardown.

## WP2.2 handoff

WP2.1 creates only a non-unique `(worker_id, group_id)` support index. WP2.2
must replace legacy move/merge/split/copy writers, re-run H9 cleanup, then add
the unique index, duplicate-rejecting trigger check, and
`campaign_group_membership` security-invoker view. Employer placements are
also deferred to WP2.2.
