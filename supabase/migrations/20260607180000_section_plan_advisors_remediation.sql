-- ============================================================
-- Section Planning module — Phase 10 of 10 (RLS / advisor remediation)
--
-- Address Supabase advisor findings:
--   - Convert section-planning views to SECURITY INVOKER so callers'
--     RLS policies are enforced.
--   - Pin search_path on trigger / helper functions to prevent
--     search_path-based privilege escalation.
-- ============================================================

ALTER VIEW v_section_plan_summary SET (security_invoker = on);
ALTER VIEW v_section_plan_workforce_mapping SET (security_invoker = on);
ALTER VIEW v_section_plan_soc_recording_grid SET (security_invoker = on);
ALTER VIEW v_section_plan_workplan SET (security_invoker = on);
ALTER VIEW v_campaign_section_stage_coverage SET (security_invoker = on);

CREATE OR REPLACE FUNCTION tg_section_plans_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE OR REPLACE FUNCTION tg_section_situation_snippets_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE OR REPLACE FUNCTION tg_workforce_overrides_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE OR REPLACE FUNCTION tg_section_plan_socs_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE OR REPLACE FUNCTION tg_workplan_targets_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE OR REPLACE FUNCTION section_plan_resolved_agreement_expiry(p_section_plan_id BIGINT)
RETURNS DATE LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT agreement_expiry_override FROM section_plan_situation_snippets WHERE section_plan_id = p_section_plan_id),
    (SELECT MAX(a.expiry_date) FROM section_plans sp JOIN campaign_agreements ca ON ca.campaign_id = sp.campaign_id JOIN agreements a ON a.agreement_id = ca.agreement_id WHERE sp.section_plan_id = p_section_plan_id)
  );
$$;

-- Note: seed_section_situation_snippet remains SECURITY DEFINER for the
-- ON CONFLICT upsert path (which requires elevated rights given the RLS
-- mix), but search_path is already pinned to public in its definition.
-- The function reads/writes only section-scoped rows; RLS on
-- section_plans guards what section_plan_id can be passed in by the
-- caller's session (the function uses authenticated EXECUTE only).
