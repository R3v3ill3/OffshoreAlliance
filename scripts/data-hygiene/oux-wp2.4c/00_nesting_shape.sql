-- OUX WP2.4c — the nesting shape of every campaign
-- (docs/organiser-ux-review/wp/wp2.4c.md §3.2, §5; the NP finding).
--
-- READ-ONLY. Four SELECTs and nothing else: no write, no transaction control,
-- no session settings, no environment marker (the guard exists for mutating
-- files only). Safe on any project.
-- Prints aggregates and structure names only — no worker names, no contact
-- details, no worker ids.
-- Run on normal dev by the agent (read is free under the standing notes) and on
-- production by the operator; paste the four outputs into wp2.4c.md §9.2. The
-- counts settle NP-b (a repair script) and stop condition 6 (§8.4).
--
-- Definitions, matching `lib/campaign/groups/derive-group-tree.ts` exactly:
--   * a NESTING EDGE (NE-a, as narrowed by ruling 1) is a `parent_ou_id` link
--     whose parent exists, is NOT a group container, carries a `group_id`, and
--     whose group DIFFERS from the child's. Two links are therefore facets and
--     never nest: a link to a container (the Employer container -> worksite
--     link) and a link to a parent in the child's own group (the same-kind
--     Split child, which is a sibling unit of that group).
--   * so every count below is a count over CROSS-GROUP children by
--     construction, not by a filter: a same-group parent can never hold the
--     worker beside the child (one unit per group, wp2.2.md C-a / WP2.2b), so
--     the parent+child pair this file counts cannot exist there at all.

-- (a) Sub-unit-only groups: a group with at least one unit, every unit of
--     which is nested (NE-a) under a unit of ANOTHER group. These are the
--     groups WP2.4c stops offering as a primary group (B2, SG-a). A campaign
--     whose Worksite group appears here is stop condition 6 (§8.4): its
--     worksites hang off a plain employer unit, not a container (§3.11).
with unit_edges as (
  select
    u.ou_id,
    u.campaign_id,
    u.group_id,
    case
      when p.ou_id is not null
       and coalesce(p.is_group_container, false) = false
       and p.group_id is not null
       and p.group_id is distinct from u.group_id
      then p.ou_id
    end as nesting_parent_ou_id
  from public.campaign_organising_units u
  left join public.campaign_organising_units p on p.ou_id = u.parent_ou_id
)
select
  g.campaign_id,
  g.group_id,
  g.kind                                                            as group_kind,
  g.name                                                            as group_name,
  count(e.ou_id)                                                    as units,
  count(e.ou_id) filter (where e.nesting_parent_ou_id is not null)  as nested_units
from public.campaign_groups g
join unit_edges e on e.group_id = g.group_id
group by g.campaign_id, g.group_id, g.kind, g.name
having count(e.ou_id) > 0
   and count(e.ou_id) = count(e.ou_id) filter (where e.nesting_parent_ou_id is not null)
order by g.campaign_id, g.group_id;

-- (b) (c) (d) Placements on a NESTED sub-unit (a child whose group differs
--     from its plain parent's — the only shape that nests), per campaign,
--     split by what the worker holds in the PARENT's group:
--       paired_placements      — the parent's own unit (the shape every
--                                wall-chart writer intends);
--       child_only_placements  — nothing in the parent's group (the view says
--                                NULL there; the tree infers the root, NP-a);
--       orphan_child_placements— a DIFFERENT unit of the parent's group (the
--                                worker is drawn under that other unit and the
--                                sub-unit placement is not drawn at all, NC-a).
with child_placements as (
  select
    u.campaign_id,
    p.worker_id,
    p.ou_id                as child_ou_id,
    parent.ou_id           as parent_ou_id,
    parent.group_id        as parent_group_id
  from public.campaign_worker_ou p
  join public.campaign_organising_units u on u.ou_id = p.ou_id
  join public.campaign_organising_units parent on parent.ou_id = u.parent_ou_id
  where coalesce(parent.is_group_container, false) = false
    and parent.group_id is not null
    and u.group_id is distinct from parent.group_id
),
classified as (
  select
    c.campaign_id,
    held.ou_id is not null                        as has_row_in_parent_group,
    coalesce(held.ou_id = c.parent_ou_id, false)  as on_the_parent
  from child_placements c
  left join public.campaign_worker_ou held
    on held.worker_id = c.worker_id
   and held.group_id = c.parent_group_id
)
select
  campaign_id,
  count(*)                                                                     as sub_unit_placements,
  count(*) filter (where on_the_parent)                                        as paired_placements,
  count(*) filter (where not has_row_in_parent_group)                          as child_only_placements,
  count(*) filter (where has_row_in_parent_group and not on_the_parent)        as orphan_child_placements
from classified
group by campaign_id
order by campaign_id;

-- (e) The same three counts per (campaign, parent group), so the operator can
--     see which grouping the divergence sits in (Worksite on campaign 42).
with child_placements as (
  select
    u.campaign_id,
    p.worker_id,
    parent.ou_id     as parent_ou_id,
    parent.group_id  as parent_group_id
  from public.campaign_worker_ou p
  join public.campaign_organising_units u on u.ou_id = p.ou_id
  join public.campaign_organising_units parent on parent.ou_id = u.parent_ou_id
  where coalesce(parent.is_group_container, false) = false
    and parent.group_id is not null
    and u.group_id is distinct from parent.group_id
),
classified as (
  select
    c.campaign_id,
    c.parent_group_id,
    held.ou_id is not null                        as has_row_in_parent_group,
    coalesce(held.ou_id = c.parent_ou_id, false)  as on_the_parent
  from child_placements c
  left join public.campaign_worker_ou held
    on held.worker_id = c.worker_id
   and held.group_id = c.parent_group_id
)
select
  c.campaign_id,
  c.parent_group_id,
  g.name                                                                 as parent_group_name,
  count(*)                                                               as sub_unit_placements,
  count(*) filter (where c.on_the_parent)                                as paired_placements,
  count(*) filter (where not c.has_row_in_parent_group)                  as child_only_placements,
  count(*) filter (where c.has_row_in_parent_group and not c.on_the_parent) as orphan_child_placements
from classified c
left join public.campaign_groups g on g.group_id = c.parent_group_id
group by c.campaign_id, c.parent_group_id, g.name
order by c.campaign_id, c.parent_group_id;

-- (f) The nesting edges themselves, per campaign: how many units nest, how many
--     parents hold children, and how many `parent_ou_id` links are facets
--     rather than nesting (a container parent, or a parent in the unit's own
--     group — the C-k sibling shape). A campaign with zero nested units
--     renders exactly as WP2.4 left it.
select
  u.campaign_id,
  count(*) filter (
    where p.ou_id is not null
      and coalesce(p.is_group_container, false) = false
      and p.group_id is not null
      and p.group_id is distinct from u.group_id
  )                                                                      as nested_units,
  count(distinct p.ou_id) filter (
    where coalesce(p.is_group_container, false) = false
      and p.group_id is not null
      and p.group_id is distinct from u.group_id
  )                                                                      as parents_with_children,
  count(*) filter (
    where p.ou_id is not null
      and (coalesce(p.is_group_container, false)
           or p.group_id is null
           or p.group_id is not distinct from u.group_id)
  )                                                                      as facet_links_not_nested,
  count(*)                                                               as units
from public.campaign_organising_units u
left join public.campaign_organising_units p on p.ou_id = u.parent_ou_id
group by u.campaign_id
order by u.campaign_id;
