-- ============================================================
-- Migration 20260410000000: Email Import Pipeline
--
-- Adds:
--   - email_imports: raw inbound emails received via Resend webhook
--   - Extends comms_template_library with source_import_id, an_template_id, design_metadata
-- ============================================================

-- -------------------------------------------------------
-- 1. email_imports
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_imports (
  import_id SERIAL PRIMARY KEY,
  resend_email_id VARCHAR(200) UNIQUE,
  from_address VARCHAR(500),
  to_address VARCHAR(500),
  subject VARCHAR(1000) NOT NULL,
  subject_tag VARCHAR(200),
  body_html TEXT,
  body_text TEXT,
  attachments JSONB DEFAULT '[]',
  raw_headers JSONB,
  ai_analysis JSONB,
  analysis_status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (analysis_status IN ('pending', 'analysed', 'reviewed', 'imported', 'failed')),
  imported_template_id INTEGER REFERENCES comms_template_library(template_id),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ei_status ON email_imports(analysis_status);
CREATE INDEX IF NOT EXISTS idx_ei_resend_id ON email_imports(resend_email_id);

CREATE TRIGGER trg_email_imports_updated_at
  BEFORE UPDATE ON email_imports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- -------------------------------------------------------
-- 2. Extend comms_template_library
-- -------------------------------------------------------
ALTER TABLE comms_template_library
  ADD COLUMN IF NOT EXISTS source_import_id INTEGER REFERENCES email_imports(import_id),
  ADD COLUMN IF NOT EXISTS an_template_id VARCHAR(200),
  ADD COLUMN IF NOT EXISTS design_metadata JSONB;

-- -------------------------------------------------------
-- 3. RLS policies
-- -------------------------------------------------------
ALTER TABLE email_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read email_imports"
  ON email_imports FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin/User can insert email_imports"
  ON email_imports FOR INSERT TO authenticated
  WITH CHECK (get_user_role() IN ('admin', 'user'));

CREATE POLICY "Admin/User can update email_imports"
  ON email_imports FOR UPDATE TO authenticated
  USING (get_user_role() IN ('admin', 'user'))
  WITH CHECK (get_user_role() IN ('admin', 'user'));

CREATE POLICY "Admin can delete email_imports"
  ON email_imports FOR DELETE TO authenticated
  USING (get_user_role() = 'admin');

-- Service-role insert policy for the webhook (unauthenticated server context)
CREATE POLICY "Service role can insert email_imports"
  ON email_imports FOR INSERT TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update email_imports"
  ON email_imports FOR UPDATE TO service_role
  USING (true) WITH CHECK (true);
