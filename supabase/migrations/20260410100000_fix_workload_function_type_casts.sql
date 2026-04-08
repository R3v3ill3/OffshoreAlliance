-- Fix get_workload_dashboard_data type mismatches (42804)
--
-- The workload_dashboard_summary view returns:
--   total_criteria, met_criteria, pending_assessments → numeric (from SUM/COALESCE)
--   worksite_count, employer_count, worker_count, leader_count → bigint (from COUNT)
--   total_activities_underway, in_progress_actions, pending_gate_assessments, active_stage_plans → bigint
--
-- The function declares all of these as INTEGER. The previous fix only cast
-- leader_count; this fix casts all mismatched columns.

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
        wds.total_criteria::integer,
        wds.met_criteria::integer,
        wds.pending_assessments::integer,
        wds.worksite_count::integer,
        wds.employer_count::integer,
        wds.worker_count::integer,
        wds.leader_count::integer,
        wds.total_activities_underway::integer,
        wds.in_progress_actions::integer,
        wds.pending_gate_assessments::integer,
        wds.active_stage_plans::integer
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
