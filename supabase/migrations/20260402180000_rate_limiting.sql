-- ============================================================
-- Per-User Rate Limiting System
-- ============================================================
-- Purpose: Track API usage per user and allow configurable rate limits
-- Features: Per-user limits, admin-configurable, no default limits
-- ============================================================

-- Create rate_limit_config table for per-user limits
CREATE TABLE IF NOT EXISTS rate_limit_config (
  config_id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Rate limit settings
  requests_per_minute INTEGER,
  requests_per_hour INTEGER,
  requests_per_day INTEGER,

  -- Advanced settings
  burst_allowance INTEGER,
  cost_per_request DECIMAL(5, 2) DEFAULT 0, -- For tracking API costs

  -- Exemptions
  is_exempt BOOLEAN DEFAULT false,

  -- Audit
  configured_by UUID REFERENCES auth.users(id),
  configured_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,

  UNIQUE(user_id)
);

-- Create rate_limit_usage table for tracking requests
CREATE TABLE IF NOT EXISTS rate_limit_usage (
  usage_id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER,

  -- Request metadata
  ip_address INET,
  user_agent TEXT,
  request_path TEXT,

  -- Timing
  requested_at TIMESTAMPTZ DEFAULT NOW(),

  -- Cost tracking
  estimated_cost DECIMAL(10, 4) DEFAULT 0
);

-- Create indexes
CREATE INDEX idx_rlc_user_id ON rate_limit_config(user_id);
CREATE INDEX idx_rlu_user_id ON rate_limit_usage(user_id);
CREATE INDEX idx_rlu_requested_at ON rate_limit_usage(requested_at DESC);
CREATE INDEX idx_rlu_endpoint ON rate_limit_usage(endpoint);
CREATE INDEX idx_rlu_user_minute ON rate_limit_usage(user_id, requested_at)
  WHERE requested_at > NOW() - INTERVAL '1 minute';
CREATE INDEX idx_rlu_user_hour ON rate_limit_usage(user_id, requested_at)
  WHERE requested_at > NOW() - INTERVAL '1 hour';
CREATE INDEX idx_rlu_user_day ON rate_limit_usage(user_id, requested_at)
  WHERE requested_at > NOW() - INTERVAL '1 day';

-- ============================================================
-- RATE LIMITING FUNCTIONS
-- ============================================================

-- Check if user is rate limited
CREATE OR REPLACE FUNCTION check_rate_limit(p_user_id UUID, p_endpoint TEXT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
  v_config RECORD;
  v_minute_count INTEGER;
  v_hour_count INTEGER;
  v_day_count INTEGER;
  v_is_limited BOOLEAN := false;
  v_limit_reason TEXT := NULL;
BEGIN
  -- Get user's rate limit config
  SELECT * INTO v_config
  FROM rate_limit_config
  WHERE user_id = p_user_id;

  -- If no config or exempt, allow
  IF NOT FOUND OR v_config.is_exempt THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'limit', NULL,
      'remaining', NULL,
      'reset_at', NULL
    );
  END IF;

  -- Count requests in each window
  SELECT COUNT(*) INTO v_minute_count
  FROM rate_limit_usage
  WHERE user_id = p_user_id
    AND requested_at > NOW() - INTERVAL '1 minute';

  SELECT COUNT(*) INTO v_hour_count
  FROM rate_limit_usage
  WHERE user_id = p_user_id
    AND requested_at > NOW() - INTERVAL '1 hour';

  SELECT COUNT(*) INTO v_day_count
  FROM rate_limit_usage
  WHERE user_id = p_user_id
    AND requested_at > NOW() - INTERVAL '1 day';

  -- Check per-minute limit
  IF v_config.requests_per_minute IS NOT NULL AND v_minute_count >= v_config.requests_per_minute THEN
    v_is_limited := true;
    v_limit_reason := 'Rate limit exceeded: ' || v_minute_count || ' requests per minute (limit: ' || v_config.requests_per_minute || ')';
    RETURN jsonb_build_object(
      'allowed', false,
      'limit', v_config.requests_per_minute,
      'remaining', 0,
      'reset_at', EXTRACT(EPOCH FROM (NOW() + INTERVAL '1 minute')),
      'reason', v_limit_reason,
      'window', 'minute'
    );
  END IF;

  -- Check per-hour limit
  IF v_config.requests_per_hour IS NOT NULL AND v_hour_count >= v_config.requests_per_hour THEN
    v_is_limited := true;
    v_limit_reason := 'Rate limit exceeded: ' || v_hour_count || ' requests per hour (limit: ' || v_config.requests_per_hour || ')';
    RETURN jsonb_build_object(
      'allowed', false,
      'limit', v_config.requests_per_hour,
      'remaining', 0,
      'reset_at', EXTRACT(EPOCH FROM (NOW() + INTERVAL '1 hour')),
      'reason', v_limit_reason,
      'window', 'hour'
    );
  END IF;

  -- Check per-day limit
  IF v_config.requests_per_day IS NOT NULL AND v_day_count >= v_config.requests_per_day THEN
    v_is_limited := true;
    v_limit_reason := 'Rate limit exceeded: ' || v_day_count || ' requests per day (limit: ' || v_config.requests_per_day || ')';
    RETURN jsonb_build_object(
      'allowed', false,
      'limit', v_config.requests_per_day,
      'remaining', 0,
      'reset_at', EXTRACT(EPOCH FROM (DATE_TRUNC('day', NOW() + INTERVAL '1 day'))),
      'reason', v_limit_reason,
      'window', 'day'
    );
  END IF;

  -- Calculate remaining requests for the most restrictive limit
  v_limit_reason := NULL;
  RETURN jsonb_build_object(
    'allowed', true,
    'remaining_per_minute', CASE
      WHEN v_config.requests_per_minute IS NOT NULL THEN v_config.requests_per_minute - v_minute_count
      ELSE NULL
    END,
    'remaining_per_hour', CASE
      WHEN v_config.requests_per_hour IS NOT NULL THEN v_config.requests_per_hour - v_hour_count
      ELSE NULL
    END,
    'remaining_per_day', CASE
      WHEN v_config.requests_per_day IS NOT NULL THEN v_config.requests_per_day - v_day_count
      ELSE NULL
    END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Log a request for rate limiting
CREATE OR REPLACE FUNCTION log_rate_limit_request(
  p_user_id UUID,
  p_endpoint TEXT,
  p_method TEXT,
  p_status_code INTEGER,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_request_path TEXT DEFAULT NULL
)
RETURNS BIGINT AS $$
DECLARE
  v_usage_id BIGINT;
  v_config RECORD;
BEGIN
  -- Get user's config for cost estimation
  SELECT * INTO v_config
  FROM rate_limit_config
  WHERE user_id = p_user_id;

  -- Insert usage record
  INSERT INTO rate_limit_usage (
    user_id,
    endpoint,
    method,
    status_code,
    ip_address,
    user_agent,
    request_path,
    estimated_cost
  ) VALUES (
    p_user_id,
    p_endpoint,
    p_method,
    p_status_code,
    p_ip_address,
    p_user_agent,
    p_request_path,
    COALESCE(v_config.cost_per_request, 0)
  )
  RETURNING usage_id INTO v_usage_id;

  RETURN v_usage_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get user's current usage statistics
CREATE OR REPLACE FUNCTION get_user_rate_limit_stats(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_config RECORD;
  v_minute_count INTEGER;
  v_hour_count INTEGER;
  v_day_count INTEGER;
  v_total_cost DECIMAL(10, 4);
BEGIN
  -- Get config
  SELECT * INTO v_config
  FROM rate_limit_config
  WHERE user_id = p_user_id;

  -- Count usage
  SELECT COUNT(*) INTO v_minute_count
  FROM rate_limit_usage
  WHERE user_id = p_user_id
    AND requested_at > NOW() - INTERVAL '1 minute';

  SELECT COUNT(*) INTO v_hour_count
  FROM rate_limit_usage
  WHERE user_id = p_user_id
    AND requested_at > NOW() - INTERVAL '1 hour';

  SELECT COUNT(*) INTO v_day_count
  FROM rate_limit_usage
  WHERE user_id = p_user_id
    AND requested_at > NOW() - INTERVAL '1 day';

  SELECT COALESCE(SUM(estimated_cost), 0) INTO v_total_cost
  FROM rate_limit_usage
  WHERE user_id = p_user_id
    AND requested_at > NOW() - INTERVAL '30 days';

  RETURN jsonb_build_object(
    'config', CASE
      WHEN v_config.user_id IS NOT NULL THEN jsonb_build_object(
        'requests_per_minute', v_config.requests_per_minute,
        'requests_per_hour', v_config.requests_per_hour,
        'requests_per_day', v_config.requests_per_day,
        'is_exempt', v_config.is_exempt,
        'cost_per_request', v_config.cost_per_request
      )
      ELSE NULL
    END,
    'usage', jsonb_build_object(
      'requests_last_minute', v_minute_count,
      'requests_last_hour', v_hour_count,
      'requests_last_day', v_day_count
    ),
    'total_cost_30days', v_total_cost
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_rate_limit_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_rlc_updated_at
  BEFORE UPDATE ON rate_limit_config
  FOR EACH ROW
  EXECUTE FUNCTION update_rate_limit_config_updated_at();

-- ============================================================
-- CLEANUP FUNCTION
-- ============================================================

-- Clean up old usage records (keep last 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_rate_limit_usage()
RETURNS INTEGER AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM rate_limit_usage
  WHERE requested_at < NOW() - INTERVAL '90 days';

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- RLS POLICIES
-- ============================================================

ALTER TABLE rate_limit_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_usage ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage rate limit config"
  ON rate_limit_config
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
  );

CREATE POLICY "Admins can view all rate limit usage"
  ON rate_limit_usage
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
  );

-- Users can view their own config
CREATE POLICY "Users can view own rate limit config"
  ON rate_limit_config
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can view their own usage
CREATE POLICY "Users can view own rate limit usage"
  ON rate_limit_usage
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- GRANTS
-- ============================================================

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON rate_limit_config TO authenticated;
GRANT SELECT ON rate_limit_usage TO authenticated;
GRANT EXECUTE ON FUNCTION check_rate_limit TO authenticated;
GRANT EXECUTE ON FUNCTION log_rate_limit_request TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_rate_limit_stats TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_old_rate_limit_usage TO authenticated;
