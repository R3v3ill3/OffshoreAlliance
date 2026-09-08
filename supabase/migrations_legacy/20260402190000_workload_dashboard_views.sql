-- ============================================================
-- Workload Dashboard Views and Functions
-- ============================================================
-- Purpose: Provide optimized queries for the Organiser Workload Dashboard
-- Metrics: Campaigns by Stage, Progress Towards Ambitions, Worksites/Employers/Workers per Campaign, Campaign Activities Underway
-- ============================================================

-- ============================================================
-- VIEW 1: Campaigns by Stage Summary
-- ============================================================
-- Shows the count of campaigns in each stage
CREATE OR REPLACE VIEW workload_campaigns_by_stage AS
SELECT
    c.campaign_id,
    c.name as campaign_name,
    c.status as campaign_status,
    c.campaign_type,
    c.created_by,
    COALESCE(csp.stage_number, 0) as current_stage_number,
    COALESCE(csp.stage_name, 'Not Started') as current_stage_name,
    COALESCE(csp.status, 'none') as stage_status,
    csp.planned_start_date,
    csp.planned_end_date,
    CASE
        WHEN csp.status = 'active' THEN 'Active'
        WHEN csp.status = 'completed' THEN 'Completed'
        WHEN csp.status = 'draft' THEN 'Planning'
        WHEN csp.status = 'blocked' THEN 'Blocked'
        ELSE 'Not Started'
    END as stage_display_status,
    -- Calculate if stage is overdue
    CASE
        WHEN csp.planned_end_date IS NOT NULL
         AND csp.planned_end_date < CURRENT_DATE
         AND csp.status NOT IN ('completed', 'blocked')
        THEN true
        ELSE false
    END as is_overdue,
    -- Calculate if stage is due soon (within 7 days)
    CASE
        WHEN csp.planned_end_date IS NOT NULL
         AND csp.planned_end_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '7 days')
         AND csp.status NOT IN ('completed', 'blocked')
        THEN true
        ELSE false
    END as is_due_soon
FROM campaigns c
LEFT JOIN campaign_stage_plans csp
    ON c.campaign_id = csp.campaign_id
    AND csp.stage_number = (
        -- Get the highest active stage, or the highest stage if none active
        SELECT COALESCE(
            MAX(stage_number),
            0
        )
        FROM campaign_stage_plans
        WHERE campaign_id = c.campaign_id
          AND status IN ('active', 'completed')
    )
WHERE c.status IN ('active', 'planning');

-- Grant access
GRANT SELECT ON workload_campaigns_by_stage TO authenticated;

-- ============================================================
-- VIEW 2: Campaign Progress Summary
-- ============================================================
-- Shows progress towards gate criteria for each campaign
CREATE OR REPLACE VIEW workload_campaign_progress AS
WITH campaign_criteria AS (
    SELECT
        gd.campaign_id,
        gd.gate_id,
        gd.gate_number,
        gd.gate_name,
        COUNT(*) as total_criteria,
        SUM(CASE WHEN gc.is_met THEN 1 ELSE 0 END) as met_criteria,
        ROUND(
            (SUM(CASE WHEN gc.is_met THEN 1 ELSE 0 END)::NUMERIC / COUNT(*)) * 100,
            2
        ) as progress_percentage,
        -- Count pending assessments
        (
            SELECT COUNT(*)
            FROM gate_assessments ga
            WHERE ga.gate_id = gd.gate_id
              AND ga.outcome = 'pending'
        ) as pending_assessments,
        -- Check if gate has any overdue criteria
        MAX(
            CASE
                WHEN gc.last_calculated_at IS NOT NULL
                 AND gc.last_calculated_at < NOW() - INTERVAL '1 hour'
                THEN 1
                ELSE 0
            END
        ) as has_stale_criteria
    FROM gate_definitions gd
    LEFT JOIN gate_criteria gc
        ON gd.gate_id = gc.gate_id
    WHERE gd.is_active = true
    GROUP BY
        gd.gate_id,
        gd.campaign_id,
        gd.gate_number,
        gd.gate_name
)
SELECT
    c.campaign_id,
    c.name as campaign_name,
    c.status as campaign_status,
    c.campaign_type,
    COALESCE(SUM(cc.total_criteria), 0) as total_criteria,
    COALESCE(SUM(cc.met_criteria), 0) as met_criteria,
    CASE
        WHEN SUM(cc.total_criteria) > 0 THEN
            ROUND((SUM(cc.met_criteria)::NUMERIC / SUM(cc.total_criteria)) * 100, 2)
        ELSE 0
    END as overall_progress_percentage,
    COALESCE(SUM(cc.pending_assessments), 0) as pending_assessments,
    -- Get the most recent gate info
    (
        SELECT json_agg(json_build_object(
            'gate_number', gate_number,
            'gate_name', gate_name,
            'progress_percentage', progress_percentage,
            'total_criteria', total_criteria,
            'met_criteria', met_criteria,
            'pending_assessments', pending_assessments
        ) ORDER BY gate_number)
        FROM campaign_criteria cc2
        WHERE cc2.campaign_id = c.campaign_id
    ) as gate_progress_details
FROM campaigns c
LEFT JOIN campaign_criteria cc
    ON c.campaign_id = cc.campaign_id
WHERE c.status IN ('active', 'planning')
GROUP BY
    c.campaign_id,
    c.name,
    c.status,
    c.campaign_type;

-- Grant access
GRANT SELECT ON workload_campaign_progress TO authenticated;

-- ============================================================
-- VIEW 3: Campaign Entities Summary
-- ============================================================
-- Shows counts of worksites, employers, and workers per campaign
CREATE OR REPLACE VIEW workload_campaign_entities AS
SELECT
    c.campaign_id,
    c.name as campaign_name,
    c.status as campaign_status,
    c.campaign_type,
    -- Count worksites
    (
        SELECT COUNT(DISTINCT cw.worksite_id)
        FROM campaign_worksites cw
        WHERE cw.campaign_id = c.campaign_id
    ) as worksite_count,
    -- Count employers (via agreements)
    (
        SELECT COUNT(DISTINCT a.employer_id)
        FROM agreements a
        JOIN campaign_timelines ct
            ON ct.agreement_id = a.agreement_id
        WHERE ct.campaign_id = c.campaign_id
    ) as employer_count,
    -- Count workers with agreements on this campaign
    (
        SELECT COUNT(DISTINCT w.worker_id)
        FROM workers w
        JOIN worker_agreements wa
            ON w.worker_id = wa.worker_id
        JOIN agreements a
            ON wa.agreement_id = a.agreement_id
        JOIN campaign_timelines ct
            ON ct.agreement_id = a.agreement_id
        WHERE ct.campaign_id = c.campaign_id
          AND w.is_active = true
    ) as worker_count,
    -- Distinct OA leaders from campaign_task_lists (worker vs organiser IDs namespaced)
    (
        SELECT COUNT(DISTINCT lid)::bigint
        FROM (
            SELECT 'w:' || ctl.leader_worker_id::text AS lid
            FROM campaign_task_lists ctl
            WHERE ctl.campaign_id = c.campaign_id
              AND ctl.leader_worker_id IS NOT NULL
            UNION
            SELECT 'o:' || ctl.leader_organiser_id::text
            FROM campaign_task_lists ctl
            WHERE ctl.campaign_id = c.campaign_id
              AND ctl.leader_organiser_id IS NOT NULL
        ) leader_ids
    ) as leader_count
FROM campaigns c
WHERE c.status IN ('active', 'planning');

-- Grant access
GRANT SELECT ON workload_campaign_entities TO authenticated;

-- ============================================================
-- VIEW 4: Campaign Activities Summary
-- ============================================================
-- Shows all activities underway for campaigns
CREATE OR REPLACE VIEW workload_campaign_activities AS
SELECT
    c.campaign_id,
    c.name as campaign_name,
    c.status as campaign_status,
    c.campaign_type,
    -- Count in-progress actions
    (
        SELECT COUNT(*)
        FROM campaign_actions ca
        WHERE ca.campaign_id = c.campaign_id
          AND ca.status = 'in_progress'
    ) as in_progress_actions,
    -- Count pending gate assessments
    (
        SELECT COUNT(*)
        FROM gate_assessments ga
        JOIN gate_definitions gd
            ON ga.gate_id = gd.gate_id
        WHERE gd.campaign_id = c.campaign_id
          AND ga.outcome = 'pending'
    ) as pending_gate_assessments,
    -- Count active stage plans
    (
        SELECT COUNT(*)
        FROM campaign_stage_plans csp
        WHERE csp.campaign_id = c.campaign_id
          AND csp.status = 'active'
    ) as active_stage_plans,
    -- Total activities underway
    (
        SELECT COUNT(*)
        FROM campaign_actions ca
        WHERE ca.campaign_id = c.campaign_id
          AND ca.status = 'in_progress'
    ) +
    (
        SELECT COUNT(*)
        FROM gate_assessments ga
        JOIN gate_definitions gd
            ON ga.gate_id = gd.gate_id
        WHERE gd.campaign_id = c.campaign_id
          AND ga.outcome = 'pending'
    ) +
    (
        SELECT COUNT(*)
        FROM campaign_stage_plans csp
        WHERE csp.campaign_id = c.campaign_id
          AND csp.status = 'active'
    ) as total_activities_underway,
    -- Get recent actions
    (
        SELECT json_agg(json_build_object(
            'action_id', ca.action_id,
            'action_name', COALESCE(ca.title, ca.action_type),
            'status', ca.status,
            'due_date', ca.due_date,
            'assigned_to', ca.assigned_organiser_id
        ) ORDER BY ca.due_date NULLS LAST)
        FROM (
            SELECT ca.action_id, ca.title, ca.action_type, ca.status, ca.due_date, ca.assigned_organiser_id
            FROM campaign_actions ca
            WHERE ca.campaign_id = c.campaign_id
              AND ca.status = 'in_progress'
            LIMIT 5
        ) ca
    ) as recent_actions
FROM campaigns c
WHERE c.status IN ('active', 'planning');

-- Grant access
GRANT SELECT ON workload_campaign_activities TO authenticated;

-- ============================================================
-- AGGREGATE VIEW: Workload Dashboard Summary
-- ============================================================
-- Combines all metrics for easy dashboard querying
CREATE OR REPLACE VIEW workload_dashboard_summary AS
SELECT
    c.campaign_id,
    c.name as campaign_name,
    c.status as campaign_status,
    c.campaign_type,
    c.created_by,
    c.created_at,
    -- Stage info
    COALESCE(cbs.current_stage_number, 0) as current_stage_number,
    COALESCE(cbs.current_stage_name, 'Not Started') as current_stage_name,
    COALESCE(cbs.stage_display_status, 'Not Started') as stage_display_status,
    cbs.is_overdue,
    cbs.is_due_soon,
    -- Progress info
    COALESCE(cp.overall_progress_percentage, 0) as overall_progress_percentage,
    COALESCE(cp.total_criteria, 0) as total_criteria,
    COALESCE(cp.met_criteria, 0) as met_criteria,
    COALESCE(cp.pending_assessments, 0) as pending_assessments,
    -- Entity counts
    COALESCE(ce.worksite_count, 0) as worksite_count,
    COALESCE(ce.employer_count, 0) as employer_count,
    COALESCE(ce.worker_count, 0) as worker_count,
    COALESCE(ce.leader_count, 0) as leader_count,
    -- Activity counts
    COALESCE(ca.total_activities_underway, 0) as total_activities_underway,
    COALESCE(ca.in_progress_actions, 0) as in_progress_actions,
    COALESCE(ca.pending_gate_assessments, 0) as pending_gate_assessments,
    COALESCE(ca.active_stage_plans, 0) as active_stage_plans
FROM campaigns c
LEFT JOIN workload_campaigns_by_stage cbs
    ON c.campaign_id = cbs.campaign_id
LEFT JOIN workload_campaign_progress cp
    ON c.campaign_id = cp.campaign_id
LEFT JOIN workload_campaign_entities ce
    ON c.campaign_id = ce.campaign_id
LEFT JOIN workload_campaign_activities ca
    ON c.campaign_id = ca.campaign_id
WHERE c.status IN ('active', 'planning');

-- Grant access
GRANT SELECT ON workload_dashboard_summary TO authenticated;

-- ============================================================
-- HELPER FUNCTION: Get filtered workload data
-- ============================================================
CREATE OR REPLACE FUNCTION get_workload_dashboard_data(
    p_filter_organiser UUID DEFAULT NULL,
    p_filter_status VARCHAR DEFAULT NULL,
    p_filter_days INTEGER DEFAULT NULL
)
RETURNS TABLE (
    campaign_id INTEGER,
    campaign_name VARCHAR,
    campaign_status VARCHAR,
    campaign_type VARCHAR,
    created_by UUID,
    current_stage_number INTEGER,
    current_stage_name VARCHAR,
    stage_display_status VARCHAR,
    is_overdue BOOLEAN,
    is_due_soon BOOLEAN,
    overall_progress_percentage NUMERIC,
    total_criteria INTEGER,
    met_criteria INTEGER,
    pending_assessments INTEGER,
    worksite_count INTEGER,
    employer_count INTEGER,
    worker_count INTEGER,
    leader_count INTEGER,
    total_activities_underway INTEGER,
    in_progress_actions INTEGER,
    pending_gate_assessments INTEGER,
    active_stage_plans INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        wds.campaign_id,
        wds.campaign_name,
        wds.campaign_status,
        wds.campaign_type,
        wds.created_by,
        wds.current_stage_number,
        wds.current_stage_name,
        wds.stage_display_status,
        wds.is_overdue,
        wds.is_due_soon,
        wds.overall_progress_percentage,
        wds.total_criteria,
        wds.met_criteria,
        wds.pending_assessments,
        wds.worksite_count,
        wds.employer_count,
        wds.worker_count,
        wds.leader_count::integer,
        wds.total_activities_underway,
        wds.in_progress_actions,
        wds.pending_gate_assessments,
        wds.active_stage_plans
    FROM workload_dashboard_summary wds
    WHERE
        -- Filter by organiser if specified
        (p_filter_organiser IS NULL OR wds.created_by = p_filter_organiser)
        -- Filter by status if specified
        AND (p_filter_status IS NULL OR wds.campaign_status = p_filter_status)
        -- Filter by time period if specified
        AND (p_filter_days IS NULL OR wds.created_at >= CURRENT_DATE - (p_filter_days || ' days')::INTERVAL)
    ORDER BY
        wds.is_overdue DESC,
        wds.is_due_soon DESC,
        wds.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute on function
GRANT EXECUTE ON FUNCTION get_workload_dashboard_data TO authenticated;

-- NOTE: Indexes cannot be created on plain views in PostgreSQL. Add indexes on
-- underlying tables (e.g. campaigns, campaign_stage_plans) if query plans need them.

-- ============================================================
-- COMMENT documentation
-- ============================================================
COMMENT ON VIEW workload_dashboard_summary IS 'Summary view for Organiser Workload Dashboard combining all key metrics';
COMMENT ON VIEW workload_campaigns_by_stage IS 'Shows campaigns grouped by their current stage with overdue/due soon indicators';
COMMENT ON VIEW workload_campaign_progress IS 'Shows progress towards gate criteria for each campaign';
COMMENT ON VIEW workload_campaign_entities IS 'Shows counts of worksites, employers, workers, and leaders per campaign';
COMMENT ON VIEW workload_campaign_activities IS 'Shows all activities underway for campaigns (actions, gate assessments, stage plans)';
COMMENT ON FUNCTION get_workload_dashboard_data IS 'Helper function to get filtered workload dashboard data by organiser, status, or time period';
