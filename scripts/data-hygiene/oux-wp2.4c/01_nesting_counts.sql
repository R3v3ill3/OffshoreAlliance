-- OUX WP2.4c — nesting counts, follow-up to 00_nesting_shape.sql (docs/organiser-ux-review/wp/wp2.4c.md §3.2).
--
-- READ-ONLY. One SELECT, ONE result set, so the SQL Editor (which shows only the last result) cannot drop it.
-- Aggregates and group/unit names only: no worker names, no contact details, no writes.
--
-- Why: 00_'s last result set showed the tree SHAPE (campaign 42: 3 nested units under 1 parent; campaign 64: 2 under 1;
-- campaign 57's 143 links are container->member facets, which correctly do NOT nest). What it could not show is how the
-- PLACEMENTS sit, which is what decides whether a repair script is needed (plan NP-b).
--
-- A nesting edge (NE-a as narrowed by the D6 ruling): child.parent_ou_id = parent.ou_id, the parent is not a group
-- container, both carry a group, and the two groups DIFFER (a shift under a worksite). A same-group child of a Split is
-- a sibling, not a child, and is excluded here.
--
-- Read the output as: for each member sitting on a sub-unit,
--   paired      = they also hold the parent unit's own row in the parent's group      (the shape the chart writes)
--   child_only  = they hold NO row in the parent's group at all                        (tolerated; drawn inside the parent)
--   orphan      = they hold a row in the parent's group but on a DIFFERENT parent unit (drawn under their own parent)
-- A large child_only or orphan count is the only thing that would justify a repair script.

with edge as (
  select
    child.ou_id      as child_ou_id,
    child.name       as child_name,
    child.group_id   as child_group_id,
    parent.ou_id     as parent_ou_id,
    parent.name      as parent_name,
    parent.group_id  as parent_group_id,
    parent.campaign_id
  from public.campaign_organising_units as child
  join public.campaign_organising_units as parent
    on parent.ou_id = child.parent_ou_id
  where parent.is_group_container is not true
    and parent.group_id is not null
    and child.group_id is not null
    and parent.group_id <> child.group_id
),
on_sub_unit as (
  -- one row per (member, sub-unit placement)
  select
    e.campaign_id,
    e.parent_name,
    e.child_name,
    p.worker_id,
    e.parent_ou_id,
    e.parent_group_id
  from edge as e
  join public.campaign_worker_ou as p on p.ou_id = e.child_ou_id
  join public.campaign_worker_membership as m
    on m.campaign_id = e.campaign_id and m.worker_id = p.worker_id
),
classified as (
  select
    s.campaign_id,
    s.worker_id,
    s.parent_name,
    s.child_name,
    case
      when exists (
        select 1 from public.campaign_worker_ou as q
        where q.worker_id = s.worker_id and q.ou_id = s.parent_ou_id
      ) then 'paired'
      when exists (
        select 1 from public.campaign_worker_ou as q
        where q.worker_id = s.worker_id and q.group_id = s.parent_group_id
      ) then 'orphan'
      else 'child_only'
    end as class
  from on_sub_unit as s
)
select
  coalesce(campaign_id::text, 'TOTAL')                                as campaign,
  count(*)                                                            as sub_unit_placements,
  count(distinct worker_id)                                           as workers_on_a_sub_unit,
  count(*) filter (where class = 'paired')                            as paired,
  count(*) filter (where class = 'child_only')                        as child_only,
  count(*) filter (where class = 'orphan')                            as orphan,
  string_agg(distinct parent_name || ' > ' || child_name, ', ' order by parent_name || ' > ' || child_name) as nested_units
from classified
group by rollup (campaign_id)
order by (campaign_id is null), campaign_id;
