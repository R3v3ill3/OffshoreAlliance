-- OUX WP2.4c — which groups stay in the Group selector (plan §3.5 SG-a, stop condition 6). READ-ONLY, one result set.
-- Aggregates and group/unit names only: no worker names, no contact details, no writes.
--
-- Why this last check: 01_ showed campaign 64 nests "constructor" and "Normand" under the EMPLOYER unit
-- "TOTAL MARINE TECHNOLOGY PTY LTD". Under the new rule a group is offered in the selector only if at least one of its
-- units is NOT nested under a unit of another group. If every unit of a group turned out to be nested, that group would
-- vanish from the selector — right for a Shift group (the point of the change), but a surprise if it happened to
-- Worksite. This says, per campaign and group, whether it stays.
--
-- Read the output as: stays_in_selector = false means that group disappears from the Group control for that campaign.
-- Expected: only shift/crew-style groups say false. Any Worksite or Employer group saying false is a stop condition.

with unit as (
  select
    u.ou_id, u.campaign_id, u.group_id, u.name, u.ou_type, u.is_group_container, u.parent_ou_id,
    p.group_id as parent_group_id,
    p.is_group_container as parent_is_container
  from public.campaign_organising_units as u
  left join public.campaign_organising_units as p on p.ou_id = u.parent_ou_id
),
flagged as (
  select
    unit.*,
    (
      unit.parent_ou_id is not null
      and unit.parent_is_container is not true
      and unit.parent_group_id is not null
      and unit.group_id is not null
      and unit.parent_group_id <> unit.group_id
    ) as is_nested
  from unit
)
select
  f.campaign_id                                                    as campaign,
  g.group_id,
  g.kind                                                           as group_kind,
  g.name                                                           as group_name,
  count(*)                                                         as units,
  count(*) filter (where f.is_nested)                              as nested_units,
  bool_or(not f.is_nested)                                         as stays_in_selector,
  string_agg(f.name, ', ' order by f.name) filter (where f.is_nested) as the_nested_ones
from flagged as f
join public.campaign_groups as g
  on g.group_id = f.group_id and g.campaign_id = f.campaign_id
group by f.campaign_id, g.group_id, g.kind, g.name
having count(*) filter (where f.is_nested) > 0
order by f.campaign_id, g.name;
