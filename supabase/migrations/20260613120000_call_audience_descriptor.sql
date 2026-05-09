-- Phase E — Versioned audience_descriptor on call_scripts
-- Bidirectional mapping with call_lists.source_filters.

-- E1. Add audience_descriptor column to call_scripts
ALTER TABLE call_scripts
  ADD COLUMN IF NOT EXISTS audience_descriptor JSONB;

-- Enforce version field when descriptor is present
ALTER TABLE call_scripts
  ADD CONSTRAINT call_scripts_audience_descriptor_version_check
  CHECK (
    audience_descriptor IS NULL
    OR (audience_descriptor ? 'version' AND (audience_descriptor->>'version') IS NOT NULL)
  );

COMMENT ON COLUMN call_scripts.audience_descriptor IS
  'Versioned descriptor capturing the intended audience for this script (tone, segment filters, priority order). Version field required when present. Round-trips with call_lists.source_filters.';

-- Index for queries filtering by descriptor fields
CREATE INDEX IF NOT EXISTS idx_call_scripts_audience_descriptor
  ON call_scripts USING gin(audience_descriptor)
  WHERE audience_descriptor IS NOT NULL;
