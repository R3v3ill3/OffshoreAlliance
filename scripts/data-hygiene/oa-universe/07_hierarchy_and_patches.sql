-- 07 · Campaign universes, groups, units and patches (read-only)
SELECT c.campaign_id, c.name, c.campaign_type, c.status, c.sector_wide, c.is_standing, c.parent_campaign_id,
       (SELECT string_agg(e.employer_name, '; ' ORDER BY e.employer_name) FROM campaign_employers ce JOIN employers e ON e.employer_id = ce.employer_id WHERE ce.campaign_id = c.campaign_id) AS universe_employers,
       (SELECT count(*) FROM campaign_worksites cw WHERE cw.campaign_id = c.campaign_id) AS universe_worksites,
       (SELECT count(*) FROM campaign_worker_membership m WHERE m.campaign_id = c.campaign_id) AS members,
       (SELECT string_agg(g.kind||':'||g.name, ', ' ORDER BY g.display_order) FROM campaign_groups g WHERE g.campaign_id = c.campaign_id) AS groups,
       (SELECT count(*) FROM campaign_organising_units u WHERE u.campaign_id = c.campaign_id) AS units
FROM campaigns c WHERE c.is_sms_episode IS NOT TRUE ORDER BY c.campaign_id;

-- Unit bases: which catalogue keys units are built on
SELECT ou_type, count(*) AS units,
       count(*) FILTER (WHERE unit_basis ? 'employer_id') AS with_employer,
       count(*) FILTER (WHERE unit_basis ? 'worksite_id') AS with_worksite,
       count(*) FILTER (WHERE unit_basis ? 'custom') AS custom
FROM campaign_organising_units GROUP BY 1 ORDER BY 2 DESC;

-- Organiser patches as they stand
SELECT p.patch_id, p.patch_name, p.organiser_id, pa.entity_type, pa.entity_id,
       CASE pa.entity_type WHEN 'worksite' THEN (SELECT worksite_name FROM worksites WHERE worksite_id = pa.entity_id)
                           WHEN 'employer' THEN (SELECT employer_name FROM employers WHERE employer_id = pa.entity_id)
                           WHEN 'agreement' THEN (SELECT coalesce(short_name, agreement_name) FROM agreements WHERE agreement_id = pa.entity_id) END AS entity
FROM organiser_patches p JOIN organisers o ON o.organiser_id = p.organiser_id
LEFT JOIN organiser_patch_assignments pa ON pa.patch_id = p.patch_id
ORDER BY p.patch_id, pa.entity_type, pa.entity_id;
