-- Fix get_workload_dashboard_data return type mismatch
-- PostgreSQL error 42804: column 8 (stage_display_status) returns TEXT from
-- a CASE expression in workload_campaigns_by_stage, but the function declared
-- it as VARCHAR. DROP + CREATE required because return-type changes are not
-- allowed with CREATE OR REPLACE.

DROP FUNCTION IF EXISTS get_workload_dashboard_data;

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
    stage_display_status TEXT,
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
        (p_filter_organiser IS NULL OR wds.created_by = p_filter_organiser)
        AND (p_filter_status IS NULL OR wds.campaign_status = p_filter_status)
        AND (p_filter_days IS NULL OR wds.created_at >= CURRENT_DATE - (p_filter_days || ' days')::INTERVAL)
    ORDER BY
        wds.is_overdue DESC,
        wds.is_due_soon DESC,
        wds.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_workload_dashboard_data TO authenticated;

COMMENT ON FUNCTION get_workload_dashboard_data IS 'Helper function to get filtered workload dashboard data by organiser, status, or time period';
