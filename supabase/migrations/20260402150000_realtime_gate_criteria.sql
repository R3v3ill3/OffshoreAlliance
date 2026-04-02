-- ============================================================
-- Real-Time Gate Criteria System
-- ============================================================
-- Purpose: Automatically populate gate criteria current_value from live
-- database data with trigger-based refresh for real-time updates.
--
-- Supported Criteria:
--   - Membership Density → worker_agreements / workers on agreement scope
--   - Contact Details Verified → workers with phone + email on agreement scope
--   - Active WOCs → (placeholder for future WOC data model)
-- ============================================================

-- Add last_updated tracking to gate_criteria
ALTER TABLE gate_criteria
  ADD COLUMN IF NOT EXISTS last_calculated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS calculation_source TEXT DEFAULT 'manual';

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_gate_criteria_gate_id ON gate_criteria(gate_id);
CREATE INDEX IF NOT EXISTS idx_gate_criteria_last_calculated ON gate_criteria(last_calculated_at);

-- ============================================================
-- GATE CRITERIA CALCULATION FUNCTIONS
-- ============================================================

-- Function to calculate membership density for an agreement
CREATE OR REPLACE FUNCTION calculate_membership_density(p_agreement_id INTEGER)
RETURNS NUMERIC AS $$
DECLARE
  v_member_count NUMERIC;
  v_total_workers NUMERIC;
  v_density NUMERIC;
BEGIN
  -- Count workers with agreements on this agreement
  SELECT COUNT(DISTINCT wa.worker_id)
  INTO v_member_count
  FROM worker_agreements wa
  JOIN workers w ON w.worker_id = wa.worker_id
  JOIN agreements a ON a.agreement_id = wa.agreement_id
  WHERE a.agreement_id = p_agreement_id
    AND w.is_active = true;

  -- Count total workers on agreement scope (via agreement_worksites)
  -- For now, estimate using workers linked to worksites covered by this agreement
  SELECT COUNT(DISTINCT w.worker_id)
  INTO v_total_workers
  FROM workers w
  JOIN agreement_worksites aw ON aw.worksite_id = w.worksite_id
  WHERE aw.agreement_id = p_agreement_id
    AND w.is_active = true;

  IF v_total_workers = 0 THEN
    RETURN NULL;
  END IF;

  v_density := ROUND((v_member_count / v_total_workers) * 100, 2);

  RETURN v_density;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to calculate contact details verified for an agreement
CREATE OR REPLACE FUNCTION calculate_contact_details_verified(p_agreement_id INTEGER)
RETURNS NUMERIC AS $$
DECLARE
  v_total_workers NUMERIC;
  v_verified_count NUMERIC;
  v_percentage NUMERIC;
BEGIN
  -- Count workers on agreement scope
  SELECT COUNT(DISTINCT w.worker_id)
  INTO v_total_workers
  FROM workers w
  JOIN agreement_worksites aw ON aw.worksite_id = w.worksite_id
  WHERE aw.agreement_id = p_agreement_id
    AND w.is_active = true;

  IF v_total_workers = 0 THEN
    RETURN NULL;
  END IF;

  -- Count workers with both phone and email
  SELECT COUNT(DISTINCT w.worker_id)
  INTO v_verified_count
  FROM workers w
  JOIN agreement_worksites aw ON aw.worksite_id = w.worksite_id
  WHERE aw.agreement_id = p_agreement_id
    AND w.is_active = true
    AND w.phone IS NOT NULL
    AND w.email IS NOT NULL
    AND w.phone != ''
    AND w.email != '';

  IF v_total_workers = 0 THEN
    RETURN NULL;
  END IF;

  v_percentage := ROUND((v_verified_count / v_total_workers) * 100, 2);

  RETURN v_percentage;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get active WOC count (placeholder for future WOC data model)
CREATE OR REPLACE FUNCTION calculate_active_wocs(p_agreement_id INTEGER)
RETURNS INTEGER AS $$
BEGIN
  -- TODO: Implement when WOC data model is established
  -- For now, return 0
  RETURN 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Main function to refresh gate criteria for a campaign
CREATE OR REPLACE FUNCTION refresh_gate_criteria_for_campaign(p_campaign_id INTEGER)
RETURNS JSON AS $$
DECLARE
  v_agreement_id INTEGER;
  v_criteria RECORD;
  v_new_value NUMERIC;
  v_updated_count INTEGER := 0;
  v_threshold_met BOOLEAN;
  v_target_value NUMERIC;
BEGIN
  -- Get the agreement_id for this campaign
  SELECT agreement_id INTO v_agreement_id
  FROM campaign_timelines
  WHERE campaign_id = p_campaign_id;

  IF v_agreement_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Campaign has no associated agreement',
      'campaign_id', p_campaign_id
    );
  END IF;

  -- Process each gate criterion
  FOR v_criteria IN
    SELECT gc.*
    FROM gate_criteria gc
    JOIN gate_definitions gd ON gd.gate_id = gc.gate_id
    WHERE gd.campaign_id = p_campaign_id
      AND gc.metric_type IN ('percentage', 'count')
  LOOP
    -- Calculate new value based on criterion name
    CASE v_criteria.criterion_name
      WHEN 'Membership Density' THEN
        v_new_value := calculate_membership_density(v_agreement_id);

      WHEN 'Contact Details Verified' THEN
        v_new_value := calculate_contact_details_verified(v_agreement_id);

      WHEN 'Active WOCs' THEN
        v_new_value := calculate_active_wocs(v_agreement_id);

      ELSE
        -- For other criteria, skip auto-calculation
        CONTINUE;
    END CASE;

    -- Skip if we couldn't calculate a value
    IF v_new_value IS NULL THEN
      CONTINUE;
    END IF;

    -- Parse target value (assuming numeric)
    v_target_value := (NULLIF(regexp_replace(v_criteria.target_value, '[^0-9.]', '', 'g'), ''))::numeric;

    IF v_target_value IS NULL THEN
      CONTINUE;
    END IF;

    -- Check if threshold is met
    IF v_criteria.metric_type = 'percentage' THEN
      v_threshold_met := v_new_value >= v_target_value;
    ELSIF v_criteria.metric_type = 'count' THEN
      v_threshold_met := v_new_value >= v_target_value;
    ELSE
      v_threshold_met := FALSE;
    END IF;

    -- Update the criterion
    UPDATE gate_criteria
    SET current_value = v_new_value::TEXT,
        is_met = v_threshold_met,
        last_calculated_at = NOW(),
        calculation_source = 'auto_refresh'
    WHERE criterion_id = v_criteria.criterion_id;

    v_updated_count := v_updated_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'campaign_id', p_campaign_id,
    'agreement_id', v_agreement_id,
    'updated_count', v_updated_count,
    'refreshed_at', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- TRIGGERS FOR AUTO-REFRESH
-- ============================================================

-- Trigger to refresh gate criteria when workers table changes
CREATE OR REPLACE FUNCTION trigger_refresh_gate_criteria_on_worker_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Find campaigns affected by this worker change
  -- (worker_id appears in JOINs for criteria calculation)
  PERFORM pg_notify(
    'gate_criteria_refresh',
    jsonb_build_object(
      'reason', 'worker_changed',
      'worker_id', NEW.worker_id,
      'changed_at', NOW()
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER refresh_gate_on_worker_insert
  AFTER INSERT ON workers
  FOR EACH ROW
  EXECUTE FUNCTION trigger_refresh_gate_criteria_on_worker_change();

CREATE TRIGGER refresh_gate_on_worker_update
  AFTER UPDATE OF is_active, phone, email ON workers
  FOR EACH ROW
  WHEN (OLD.is_active IS DISTINCT FROM NEW.is_active
    OR OLD.phone IS DISTINCT FROM NEW.phone
    OR OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION trigger_refresh_gate_criteria_on_worker_change();

-- Trigger to refresh gate criteria when worker_agreements change
CREATE OR REPLACE FUNCTION trigger_refresh_gate_criteria_on_worker_agreement_change()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify(
    'gate_criteria_refresh',
    jsonb_build_object(
      'reason', 'worker_agreement_changed',
      'worker_id', NEW.worker_id,
      'agreement_id', NEW.agreement_id,
      'changed_at', NOW()
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER refresh_gate_on_worker_agreement_insert
  AFTER INSERT ON worker_agreements
  FOR EACH ROW
  EXECUTE FUNCTION trigger_refresh_gate_criteria_on_worker_agreement_change();

-- Trigger to refresh gate criteria when campaigns are modified
CREATE OR REPLACE FUNCTION trigger_refresh_gate_criteria_on_campaign_change()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify(
    'gate_criteria_refresh',
    jsonb_build_object(
      'reason', 'campaign_modified',
      'campaign_id', NEW.campaign_id,
      'changed_at', NOW()
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on campaign_stage_plans updates (relevant for gate assessments)
CREATE TRIGGER refresh_gate_on_stage_plan_update
  AFTER UPDATE OF status ON campaign_stage_plans
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION trigger_refresh_gate_criteria_on_campaign_change();

-- ============================================================
-- API ROUTE TO MANUALLY REFRESH CRITERIA
-- ============================================================

-- Function to be called by API route to refresh all pending criteria
CREATE OR REPLACE FUNCTION refresh_all_pending_gate_criteria()
RETURNS JSON AS $$
DECLARE
  v_campaign RECORD;
  v_refreshed_campaigns INTEGER[] := '{}';
  v_failed_campaigns INTEGER[] := '{}';
  v_result JSONB;
BEGIN
  -- Refresh all active campaigns
  FOR v_campaign IN
    SELECT campaign_id
    FROM campaigns
    WHERE status = 'active'
  LOOP
    BEGIN
      -- Use a savepoint to continue on error
      BEGIN
        -- Refresh criteria for this campaign
        PERFORM refresh_gate_criteria_for_campaign(v_campaign.campaign_id);

        v_refreshed_campaigns := array_append(v_refreshed_campaigns, v_campaign.campaign_id);

      EXCEPTION WHEN OTHERS THEN
        -- Log error and continue
        v_failed_campaigns := array_append(v_failed_campaigns, v_campaign.campaign_id);
      END;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'refreshed_campaigns', v_refreshed_campaigns,
    'failed_campaigns', v_failed_campaigns,
    'total_campaigns', array_length(v_refreshed_campaigns) + array_length(v_failed_campaigns),
    'refreshed_at', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION calculate_membership_density TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_contact_details_verified TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_active_wocs TO authenticated;
GRANT EXECUTE ON FUNCTION refresh_gate_criteria_for_campaign TO authenticated;
GRANT EXECUTE ON FUNCTION refresh_all_pending_gate_criteria TO authenticated;
GRANT EXECUTE ON FUNCTION trigger_refresh_gate_criteria_on_worker_change TO authenticated;
GRANT EXECUTE ON FUNCTION trigger_refresh_gate_criteria_on_worker_agreement_change TO authenticated;
GRANT EXECUTE ON FUNCTION trigger_refresh_gate_criteria_on_campaign_change TO authenticated;

-- ============================================================
-- VIEWS FOR CONVENIENCE
-- ============================================================

-- View to see gate criteria with calculation status
CREATE OR REPLACE VIEW gate_criteria_with_status AS
SELECT
  gc.*,
  gd.campaign_id,
  gd.gate_number,
  gd.gate_name,
  c.name as campaign_name,
  CASE
    WHEN gc.last_calculated_at IS NULL THEN 'manual'
    ELSE 'auto'
  END as calculation_mode,
  CASE
    WHEN gc.last_calculated_at < NOW() - INTERVAL '1 hour' THEN 'stale'
    ELSE 'current'
  END as freshness_status
FROM gate_criteria gc
JOIN gate_definitions gd ON gd.gate_id = gc.gate_id
JOIN campaigns c ON c.campaign_id = gd.campaign_id
ORDER BY gd.gate_number, gc.sort_order;

-- Grant select on view
GRANT SELECT ON gate_criteria_with_status TO authenticated;
