-- ============================================================
-- AI Caching Infrastructure
-- ============================================================
-- Purpose: Create caching framework for future AI-powered features
-- Includes: cache tables, management functions, admin RPC endpoints
-- Status: DISABLED - Ready for future use when AI features are added
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create AI cache table
CREATE TABLE IF NOT EXISTS ai_response_cache (
  cache_id BIGSERIAL PRIMARY KEY,
  cache_key TEXT NOT NULL UNIQUE,
  prompt_hash TEXT NOT NULL,
  prompt TEXT NOT NULL,
  response JSONB NOT NULL,
  model_name TEXT NOT NULL,
  model_version TEXT,
  tokens_used INTEGER,
  cost_usd NUMERIC(10, 4),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
  access_count INTEGER DEFAULT 1,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create index for fast lookups
CREATE INDEX idx_ai_cache_key ON ai_response_cache(cache_key);
CREATE INDEX idx_ai_cache_prompt_hash ON ai_response_cache(prompt_hash);
CREATE INDEX idx_ai_cache_created_at ON ai_response_cache(created_at DESC);
CREATE INDEX idx_ai_cache_expires_at ON ai_response_cache(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_ai_cache_active ON ai_response_cache(is_active) WHERE is_active = true;

-- Create audit log for cache operations
CREATE TABLE IF NOT EXISTS ai_cache_audit_log (
  audit_id BIGSERIAL PRIMARY KEY,
  cache_id BIGINT REFERENCES ai_response_cache(cache_id) ON DELETE CASCADE,
  operation TEXT NOT NULL, -- 'hit', 'miss', 'store', 'invalidate', 'clear'
  user_id UUID REFERENCES auth.users(id),
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_ai_cache_audit_created_at ON ai_cache_audit_log(created_at DESC);
CREATE INDEX idx_ai_cache_audit_operation ON ai_cache_audit_log(operation);
CREATE INDEX idx_ai_cache_audit_cache_id ON ai_cache_audit_log(cache_id);

-- ============================================================
-- CACHE MANAGEMENT FUNCTIONS
-- ============================================================

-- Generate a cache key from prompt and model
CREATE OR REPLACE FUNCTION generate_ai_cache_key(p_prompt TEXT, p_model_name TEXT)
RETURNS TEXT AS $$
DECLARE
  v_prompt_hash TEXT;
BEGIN
  v_prompt_hash := encode(digest(p_prompt || p_model_name, 'sha256'), 'hex');
  return 'ai:' || p_model_name || ':' || v_prompt_hash;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Store AI response in cache
CREATE OR REPLACE FUNCTION cache_ai_response(
  p_prompt TEXT,
  p_response JSONB,
  p_model_name TEXT,
  p_model_version TEXT DEFAULT NULL,
  p_tokens_used INTEGER DEFAULT NULL,
  p_cost_usd NUMERIC DEFAULT NULL,
  p_ttl_hours INTEGER DEFAULT NULL
)
RETURNS BIGINT AS $$
DECLARE
  v_cache_key TEXT;
  v_cache_id BIGINT;
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- Generate cache key
  v_cache_key := generate_ai_cache_key(p_prompt, p_model_name);

  -- Calculate expiry if TTL provided
  IF p_ttl_hours IS NOT NULL THEN
    v_expires_at := NOW() + (p_ttl_hours || ' hours')::INTERVAL;
  END IF;

  -- Insert or update cache
  INSERT INTO ai_response_cache (
    cache_key,
    prompt_hash,
    prompt,
    response,
    model_name,
    model_version,
    tokens_used,
    cost_usd,
    expires_at
  ) VALUES (
    v_cache_key,
    encode(digest(p_prompt || p_model_name, 'sha256'), 'hex'),
    p_prompt,
    p_response,
    p_model_name,
    p_model_version,
    p_tokens_used,
    p_cost_usd,
    v_expires_at
  )
  ON CONFLICT (cache_key) DO UPDATE SET
    response = EXCLUDED.response,
    tokens_used = EXCLUDED.tokens_used,
    cost_usd = EXCLUDED.cost_usd,
    last_accessed_at = NOW(),
    access_count = ai_response_cache.access_count + 1,
    expires_at = EXCLUDED.expires_at
  RETURNING cache_id INTO v_cache_id;

  -- Log the store operation
  INSERT INTO ai_cache_audit_log (cache_id, operation, metadata)
  VALUES (v_cache_id, 'store', '{"model_name": "' || p_model_name || '"}');

  RETURN v_cache_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Retrieve cached AI response
CREATE OR REPLACE FUNCTION get_cached_ai_response(p_prompt TEXT, p_model_name TEXT)
RETURNS JSONB AS $$
DECLARE
  v_cache_key TEXT;
  v_cached_response ai_response_cache%ROWTYPE;
BEGIN
  v_cache_key := generate_ai_cache_key(p_prompt, p_model_name);

  -- Try to get cached response
  SELECT * INTO v_cached_response
  FROM ai_response_cache
  WHERE cache_key = v_cache_key
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > NOW());

  -- If found, update access stats and log hit
  IF FOUND THEN
    UPDATE ai_response_cache
    SET last_accessed_at = NOW(),
        access_count = access_count + 1
    WHERE cache_id = v_cached_response.cache_id;

    -- Log cache hit
    INSERT INTO ai_cache_audit_log (cache_id, operation, metadata)
    VALUES (v_cached_response.cache_id, 'hit', '{"model_name": "' || p_model_name || '"}');

    RETURN v_cached_response.response;
  END IF;

  -- Log cache miss
  INSERT INTO ai_cache_audit_log (cache_id, operation, metadata)
  VALUES (NULL, 'miss', '{"prompt_length": ' || length(p_prompt) || ', "model_name": "' || p_model_name || '"}');

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Invalidate specific cache entry
CREATE OR REPLACE FUNCTION invalidate_ai_cache(p_cache_key TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_cache_id BIGINT;
BEGIN
  UPDATE ai_response_cache
  SET is_active = false
  WHERE cache_key = p_cache_key
  RETURNING cache_id INTO v_cache_id;

  IF FOUND THEN
    INSERT INTO ai_cache_audit_log (cache_id, operation)
    VALUES (v_cache_id, 'invalidate');

    RETURN true;
  END IF;

  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Clear expired cache entries
CREATE OR REPLACE FUNCTION clear_expired_ai_cache()
RETURNS INTEGER AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM ai_response_cache
  WHERE expires_at IS NOT NULL
    AND expires_at < NOW()
    AND is_active = true;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Clear all AI cache (admin only)
CREATE OR REPLACE FUNCTION clear_all_ai_cache()
RETURNS INTEGER AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  -- Insert audit log before clearing
  INSERT INTO ai_cache_audit_log (cache_id, operation, metadata)
  SELECT cache_id, 'clear', '{"reason": "admin_clear_all"}'
  FROM ai_response_cache
  WHERE is_active = true;

  DELETE FROM ai_response_cache
  WHERE is_active = true;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get cache statistics
CREATE OR REPLACE FUNCTION get_ai_cache_stats()
RETURNS JSONB AS $$
DECLARE
  v_stats JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total_entries', COUNT(*),
    'active_entries', COUNT(*) FILTER (WHERE is_active = true),
    'expired_entries', COUNT(*) FILTER (WHERE is_active = true AND expires_at < NOW()),
    'total_tokens', SUM(tokens_used),
    'total_cost', SUM(cost_usd),
    'avg_access_count', AVG(access_count),
    'cache_hits', (SELECT COUNT(*) FROM ai_cache_audit_log WHERE operation = 'hit'),
    'cache_misses', (SELECT COUNT(*) FROM ai_cache_audit_log WHERE operation = 'miss')
  ) INTO v_stats
  FROM ai_response_cache;

  RETURN v_stats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- Enable RLS
ALTER TABLE ai_response_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_cache_audit_log ENABLE ROW LEVEL SECURITY;

-- Admin-only access to cache
CREATE POLICY "Admin can manage AI cache"
  ON ai_response_cache
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Admin can view AI audit logs"
  ON ai_cache_audit_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- ============================================================
-- GRANTS
-- ============================================================

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT EXECUTE ON FUNCTION generate_ai_cache_key TO authenticated;
GRANT EXECUTE ON FUNCTION cache_ai_response TO authenticated;
GRANT EXECUTE ON FUNCTION get_cached_ai_response TO authenticated;
GRANT EXECUTE ON FUNCTION invalidate_ai_cache TO authenticated;
GRANT EXECUTE ON FUNCTION clear_expired_ai_cache TO authenticated;
GRANT EXECUTE ON FUNCTION clear_all_ai_cache TO authenticated;
GRANT EXECUTE ON FUNCTION get_ai_cache_stats TO authenticated;
