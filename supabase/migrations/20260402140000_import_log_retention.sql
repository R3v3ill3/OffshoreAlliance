-- ============================================================
-- Import Log Retention System
-- ============================================================
-- Purpose: Implement automated retention for import logs
-- Retention policy:
--   - Logs older than 90 days moved to cold storage (archived)
--   - Logs older than 1 year deleted permanently
-- ============================================================

-- Add archival tracking columns to import_logs
ALTER TABLE import_logs
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_import_logs_archived_at ON import_logs(archived_at) WHERE archived_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_import_logs_imported_at ON import_logs(imported_at);
CREATE INDEX IF NOT EXISTS idx_import_logs_is_archived ON import_logs(is_archived);

-- Create cold storage table for archived logs
CREATE TABLE IF NOT EXISTS import_logs_archive (
  archive_id SERIAL PRIMARY KEY,
  import_id INTEGER NOT NULL,
  file_name VARCHAR(200) NOT NULL,
  import_type VARCHAR(50) NOT NULL,
  records_created INTEGER NOT NULL,
  records_updated INTEGER NOT NULL,
  errors TEXT,
  imported_by UUID,
  imported_at TIMESTAMPTZ NOT NULL,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data JSONB -- Store full original data as JSON
);

-- Index for archive table
CREATE INDEX IF NOT EXISTS idx_import_logs_archive_archived_at ON import_logs_archive(archived_at);
CREATE INDEX IF NOT EXISTS idx_import_logs_archive_imported_at ON import_logs_archive(imported_at);

-- Enable RLS on archive table
ALTER TABLE import_logs_archive ENABLE ROW LEVEL SECURITY;

-- Admins can manage archive
CREATE POLICY "admins_full_archive_access" ON import_logs_archive
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- All authenticated users can read archive
CREATE POLICY "authenticated_read_archive" ON import_logs_archive
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- ============================================================
-- RETENTION FUNCTIONS
-- ============================================================

-- Function to archive old import logs (older than 90 days)
CREATE OR REPLACE FUNCTION archive_old_import_logs()
RETURNS JSON AS $$
DECLARE
  v_archived_count INTEGER;
  v_threshold_days INTEGER := 90;
BEGIN
  -- Archive logs older than threshold that aren't already archived
  WITH logs_to_archive AS (
    SELECT import_id
    FROM import_logs
    WHERE imported_at < NOW() - (v_threshold_days || ' days')::INTERVAL
    AND is_archived = FALSE
    AND archived_at IS NULL
    AND deleted_at IS NULL
  )
  SELECT COUNT(*) INTO v_archived_count FROM logs_to_archive;

  IF v_archived_count > 0 THEN
    -- Insert into archive table
    INSERT INTO import_logs_archive (
      import_id, file_name, import_type, records_created,
      records_updated, errors, imported_by, imported_at,
      data
    )
    SELECT
      il.import_id,
      il.file_name,
      il.import_type,
      il.records_created,
      il.records_updated,
      il.errors,
      il.imported_by,
      il.imported_at,
      to_jsonb(il)
    FROM import_logs il
    WHERE il.import_id IN (SELECT import_id FROM logs_to_archive);

    -- Mark as archived
    UPDATE import_logs
    SET archived_at = NOW(),
        is_archived = TRUE
    WHERE import_id IN (SELECT import_id FROM logs_to_archive);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'archived_count', v_archived_count,
    'threshold_days', v_threshold_days,
    'archived_at', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to delete old archived logs (older than 1 year)
CREATE OR REPLACE FUNCTION delete_old_import_logs()
RETURNS JSON AS $$
DECLARE
  v_deleted_count INTEGER;
  v_retention_days INTEGER := 365; -- 1 year
BEGIN
  -- Delete archived logs older than retention period
  DELETE FROM import_logs_archive
  WHERE archived_at < NOW() - (v_retention_days || ' days')::INTERVAL
  AND archived_at IS NOT NULL;

  GET DIAGNOSTICS v_row_count INTO v_deleted_count;

  -- Also permanently delete from main table (if they're marked archived and old enough)
  DELETE FROM import_logs
  WHERE archived_at IS NOT NULL
  AND archived_at < NOW() - (v_retention_days || ' days')::INTERVAL
  AND is_archived = TRUE;

  GET DIAGNOSTICS v_row_count INTO v_deleted_count;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_count', v_deleted_count,
    'retention_days', v_retention_days,
    'deleted_at', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to run both retention jobs
CREATE OR REPLACE FUNCTION run_import_log_retention()
RETURNS JSON AS $$
DECLARE
  v_archive_result JSONB;
  v_delete_result JSONB;
BEGIN
  -- Run archive job
  SELECT archive_old_import_logs() INTO v_archive_result;

  -- Run delete job
  SELECT delete_old_import_logs() INTO v_delete_result;

  RETURN jsonb_build_object(
    'success', true,
    'archive', v_archive_result,
    'delete', v_delete_result,
    'run_at', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- ADMIN FUNCTIONS
-- ============================================================

-- Function to manually trigger archival
CREATE OR REPLACE FUNCTION manually_archive_import_logs(p_days_ago INTEGER DEFAULT 90)
RETURNS JSON AS $$
DECLARE
  v_archived_count INTEGER;
BEGIN
  -- Archive logs older than specified days
  WITH logs_to_archive AS (
    SELECT import_id
    FROM import_logs
    WHERE imported_at < NOW() - (p_days_ago || ' days')::INTERVAL
    AND is_archived = FALSE
    AND archived_at IS NULL
    AND deleted_at IS NULL
  )
  SELECT COUNT(*) INTO v_archived_count FROM logs_to_archive;

  IF v_archived_count > 0 THEN
    -- Insert into archive table
    INSERT INTO import_logs_archive (
      import_id, file_name, import_type, records_created,
      records_updated, errors, imported_by, imported_at,
      data
    )
    SELECT
      il.import_id,
      il.file_name,
      il.import_type,
      il.records_created,
      il.records_updated,
      il.errors,
      il.imported_by,
      il.imported_at,
      to_jsonb(il)
    FROM import_logs il
    WHERE il.import_id IN (SELECT import_id FROM logs_to_archive);

    -- Mark as archived
    UPDATE import_logs
    SET archived_at = NOW(),
        is_archived = TRUE
    WHERE import_id IN (SELECT import_id FROM logs_to_archive);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'archived_count', v_archived_count,
    'days_ago', p_days_ago,
    'archived_at', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get retention status
CREATE OR REPLACE FUNCTION get_import_log_retention_status()
RETURNS TABLE (
  metric_name TEXT,
  metric_value BIGINT,
  metric_details JSONB
) AS $$
BEGIN
  RETURN QUERY
  -- Count active logs (not archived)
  SELECT
    'active_logs'::TEXT,
    COUNT(*)::BIGINT,
    jsonb_build_object('description', 'Import logs not yet archived')
  FROM import_logs
  WHERE is_archived = FALSE AND archived_at IS NULL AND deleted_at IS NULL

  UNION ALL

  -- Count archived logs
  SELECT
    'archived_logs'::TEXT,
    COUNT(*)::BIGINT,
    jsonb_build_object('description', 'Import logs in cold storage')
  FROM import_logs
  WHERE is_archived = TRUE AND deleted_at IS NULL

  UNION ALL

  -- Count archive table size
  SELECT
    'archive_table_count'::TEXT,
    COUNT(*)::BIGINT,
    jsonb_build_object('description', 'Total records in archive table')
  FROM import_logs_archive

  UNION ALL

  -- Logs ready for archival (>90 days, not yet archived)
  SELECT
    'pending_archival'::TEXT,
    COUNT(*)::BIGINT,
    jsonb_build_object(
      'description', 'Logs older than 90 days pending archival',
      'threshold', '90 days'
    )
  FROM import_logs
  WHERE imported_at < NOW() - '90 days'::INTERVAL
  AND is_archived = FALSE AND archived_at IS NULL AND deleted_at IS NULL

  UNION ALL

  -- Logs ready for deletion (>1 year, already archived)
  SELECT
    'pending_deletion'::TEXT,
    COUNT(*)::BIGINT,
    jsonb_build_object(
      'description', 'Archived logs older than 1 year pending deletion',
      'threshold', '1 year'
    )
  FROM import_logs
  WHERE archived_at IS NOT NULL
  AND archived_at < NOW() - '1 year'::INTERVAL
  AND deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION archive_old_import_logs TO authenticated;
GRANT EXECUTE ON FUNCTION delete_old_import_logs TO authenticated;
GRANT EXECUTE ON FUNCTION run_import_log_retention TO authenticated;
GRANT EXECUTE ON FUNCTION manually_archive_import_logs TO authenticated;
GRANT EXECUTE ON FUNCTION get_import_log_retention_status TO authenticated;

-- Grant select on retention status function
GRANT EXECUTE ON FUNCTION get_import_log_retention_status TO authenticated;
