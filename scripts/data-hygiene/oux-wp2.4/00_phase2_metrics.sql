-- OUX WP2.4 — phase-2 exit metric (docs/organiser-ux-review/wp/wp2.4.md §3.19, §5;
-- IMPLEMENTATION_ORCHESTRATION_PROMPT.md:160): the share of memberships in at
-- least one unit, and the median unit size.
--
-- READ-ONLY. Two SELECTs and nothing else: no write, no transaction control,
-- no session settings, no environment marker (the guard exists for mutating
-- files only).
-- Safe on any project. Prints aggregates only — no names, no contact details.
-- Run on normal dev by the agent (read is free under the standing notes) and on
-- production by the operator at phase exit; paste both outputs into §9.2.

-- 1. Share of memberships (one row per campaign × worker in
--    campaign_worker_membership) whose worker holds at least one placement on a
--    unit of that campaign. `campaign_worker_ou` carries no campaign_id, so the
--    campaign is reached through the unit.
select
  count(*)                                                         as memberships,
  count(*) filter (where placed.worker_id is not null)             as memberships_in_a_unit,
  round(
    100.0 * count(*) filter (where placed.worker_id is not null)
      / nullif(count(*), 0),
    1
  )                                                                as pct_memberships_in_a_unit
from public.campaign_worker_membership m
left join lateral (
  select p.worker_id
  from public.campaign_worker_ou p
  join public.campaign_organising_units u on u.ou_id = p.ou_id
  where p.worker_id = m.worker_id
    and u.campaign_id = m.campaign_id
  limit 1
) placed on true;

-- 2. Median unit size: placements per unit over every unit (an empty unit
--    counts as 0) and over the non-empty units only. Containers are ordinary
--    units here (the 18 Employer containers hold materialised placements,
--    wp2.2.md "Production step 2"); legacy custom containers hold none and
--    count as empty.
with sizes as (
  select u.ou_id, count(p.id) as placements
  from public.campaign_organising_units u
  left join public.campaign_worker_ou p on p.ou_id = u.ou_id
  group by u.ou_id
)
select
  count(*)                                                                                   as units,
  count(*) filter (where placements > 0)                                                     as units_with_placements,
  percentile_cont(0.5) within group (order by placements)                                    as median_unit_size_all_units,
  percentile_cont(0.5) within group (order by placements) filter (where placements > 0)      as median_unit_size_nonempty_units
from sizes;
