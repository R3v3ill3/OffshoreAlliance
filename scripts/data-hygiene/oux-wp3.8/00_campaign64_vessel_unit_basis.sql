-- OUX WP3.8 — operator task 2: the current unit_basis of the units nested under
-- the Total Marine Technology unit (ou_id 653) in campaign 64 "ROV sector wide"
-- (docs/organiser-ux-review/PROGRESS.md human tasks, 2026-09-17).
--
-- READ-ONLY. One SELECT and nothing else: no write, no transaction control, no
-- session settings, no environment marker (the guard exists for mutating files
-- only). Safe on any project. Prints unit rows and placement counts only — no
-- worker names, no contact details, no worker ids.
--
-- WHY: a vessel unit in a sector campaign keyed only {worksite_id} is matched by
-- the F1 matcher to any member on that vessel whatever their employer
-- (apps/organising-db/src/lib/workers/sync-campaign-universe.ts:156–162); the safe
-- basis is both keys {employer_id: 84, worksite_id: …}, which the matcher already
-- ranks above an employer-only unit (:164–186). The operator runs this on
-- production and pastes the rows; if has_worksite_key is true and
-- has_employer_key is false on a nested row, the basis is corrected through the
-- editor or a later run sheet. Nothing here decides or changes anything.
--
-- Rehearsed read-only on the realistic data set (yqjkuobcawvigsfpgrcm, 12 Sep
-- snapshot) on 2026-09-17: returns the TMT row alone (unit 653, employer basis
-- {employer_id: 84}, 33 placements), because the two vessel units were nested on
-- production after the snapshot.

SELECT c.ou_id,
       c.name,
       c.ou_type,
       c.group_id,
       g.name                              AS group_name,
       c.parent_ou_id,
       c.ou_group_id,
       c.is_group_container,
       c.unit_basis,
       (c.unit_basis ? 'employer_id')      AS has_employer_key,
       (c.unit_basis ? 'worksite_id')      AS has_worksite_key,
       (SELECT count(*) FROM campaign_worker_ou p WHERE p.ou_id = c.ou_id) AS placements
FROM campaign_organising_units c
LEFT JOIN campaign_groups g ON g.group_id = c.group_id
WHERE c.campaign_id = 64
  AND (c.ou_id = 653 OR c.parent_ou_id = 653)
ORDER BY c.parent_ou_id NULLS FIRST, c.ou_id;
