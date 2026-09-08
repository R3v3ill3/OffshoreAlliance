-- Phase J1 — Rebuild reporting views for historical script accuracy
--
-- Both views previously joined call_scripts via call_lists.script_id.
-- This produced incorrect results when a list's linked script changed
-- after some calls were recorded. The fix uses COALESCE(ca.script_id,
-- cl.script_id) so each attempt resolves to the script active when it
-- was recorded (Phase D added script_id to call_attempts).
--
-- Also adds section_plan_id context from Phase G (call_lists.section_plan_id).

-- Drop both views first so column order can change safely
DROP VIEW IF EXISTS call_section_funnel;
DROP VIEW IF EXISTS vw_call_action_report;

-- ─────────────────────────────────────────────────────────────
-- call_section_funnel — section-level reach rates per list wave
-- ─────────────────────────────────────────────────────────────
CREATE VIEW call_section_funnel AS
SELECT
  cl.campaign_id,
  cl.list_id,
  cl.section_plan_id,
  -- Script resolved per attempt for historical accuracy
  COALESCE(ca.script_id, cl.script_id) AS resolved_script_id,
  css.section_id,
  css.sort_order,
  css.section_type,
  css.title AS section_title,
  COUNT(DISTINCT ca.attempt_id) FILTER (WHERE ca.dial_disposition = 'connected') AS total_connected_calls,
  COUNT(DISTINCT cso.attempt_id) FILTER (WHERE cso.reached = true) AS reached_count,
  CASE
    WHEN COUNT(DISTINCT ca.attempt_id) FILTER (WHERE ca.dial_disposition = 'connected') > 0
    THEN ROUND(
      100.0 * COUNT(DISTINCT cso.attempt_id) FILTER (WHERE cso.reached = true)
      / COUNT(DISTINCT ca.attempt_id) FILTER (WHERE ca.dial_disposition = 'connected'),
      1
    )
    ELSE 0
  END AS reach_rate_pct
FROM call_lists cl
LEFT JOIN call_list_items cli ON cli.list_id = cl.list_id
LEFT JOIN call_attempts ca ON ca.list_item_id = cli.item_id
-- Join sections via the attempt's script when available, otherwise the list's script
JOIN call_script_sections css ON css.script_id = COALESCE(ca.script_id, cl.script_id)
LEFT JOIN call_step_outcomes cso ON cso.attempt_id = ca.attempt_id AND cso.section_id = css.section_id
GROUP BY
  cl.campaign_id, cl.list_id, cl.section_plan_id,
  COALESCE(ca.script_id, cl.script_id),
  css.section_id, css.sort_order, css.section_type, css.title
ORDER BY cl.campaign_id, cl.list_id, css.sort_order;

COMMENT ON VIEW call_section_funnel IS
  'Section-level call progression rates. Uses COALESCE(attempt.script_id, list.script_id) for historical accuracy — attempts reflect the script version active at call time, not the current list configuration.';

GRANT SELECT ON call_section_funnel TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- vw_call_action_report — flat attempt-level reporting view
-- ─────────────────────────────────────────────────────────────
CREATE VIEW vw_call_action_report AS
SELECT
  cl.campaign_id,
  cl.list_id,
  cl.name AS list_name,
  cl.section_plan_id,
  -- Historical script — use the script recorded on the attempt if available
  COALESCE(ca.script_id, cl.script_id) AS script_id,
  cs.title AS script_title,
  ca.attempt_id,
  ca.started_at,
  ca.dial_disposition,
  ca.call_disposition,
  ca.outcome_classification,
  ca.cta_response,
  ca.support_level_assessed,
  cli.worker_id,
  CASE
    WHEN umt.type_name = 'member_pending' THEN 'member_pending'
    WHEN umt.type_name IN ('financial_member', 'non_oa_member') THEN 'member'
    WHEN umt.type_name = 'resigned_member' THEN 'lapsed'
    ELSE 'non_member'
  END AS membership_status,
  w.worksite_id,
  ws.worksite_name,
  cwou.ou_id AS campaign_unit_id,
  cou.name AS campaign_unit_name,
  (SELECT COUNT(*) FROM call_attempt_objections o WHERE o.attempt_id = ca.attempt_id) AS objection_count,
  (SELECT COUNT(*) FROM call_issue_observations i WHERE i.attempt_id = ca.attempt_id) AS issue_count
FROM call_lists cl
JOIN call_list_items cli ON cli.list_id = cl.list_id
LEFT JOIN call_attempts ca ON ca.list_item_id = cli.item_id
-- Join script on the attempt's recorded script_id for historical accuracy
LEFT JOIN call_scripts cs ON cs.script_id = COALESCE(ca.script_id, cl.script_id)
JOIN workers w ON w.worker_id = cli.worker_id
LEFT JOIN union_membership_types umt ON umt.union_membership_type_id = w.union_membership_type_id
LEFT JOIN worksites ws ON ws.worksite_id = w.worksite_id
LEFT JOIN campaign_organising_units cou ON cou.campaign_id = cl.campaign_id
LEFT JOIN campaign_worker_ou cwou ON cwou.ou_id = cou.ou_id AND cwou.worker_id = w.worker_id;

COMMENT ON VIEW vw_call_action_report IS
  'Flat reporting view joining call attempts with worker membership status, worksite, and campaign unit. Uses COALESCE(attempt.script_id, list.script_id) for historical script accuracy. outcome_classification is the per-call overall outcome (Phase D).';

GRANT SELECT ON vw_call_action_report TO authenticated;
