-- ============================================================
-- Migration 20260409100000: Communication Draft Generation & Contact List System
--
-- Adds tables for:
--   - comms_template_library: reusable comms templates (email, SMS, phone script)
--   - campaign_comms_drafts: AI-generated or hand-written drafts tied to a campaign stage
--   - worker_an_tags: lightweight Action Network engagement tag cache per worker
--   - an_tag_sync_log: audit trail for AN tag push/pull operations
-- ============================================================

-- -------------------------------------------------------
-- 1. comms_template_library
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS comms_template_library (
  template_id SERIAL PRIMARY KEY,
  title VARCHAR(300) NOT NULL,
  subject_line VARCHAR(500),
  body_html TEXT,
  body_text TEXT NOT NULL,
  stage_number INTEGER CHECK (stage_number BETWEEN 1 AND 6),
  activity_type VARCHAR(80),
  tone_tags TEXT[],
  audience_segment VARCHAR(200),
  platform VARCHAR(20) NOT NULL CHECK (platform IN ('email', 'sms', 'phone_script')),
  variables JSONB DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ctl_platform_stage ON comms_template_library(platform, stage_number);
CREATE INDEX IF NOT EXISTS idx_ctl_is_active ON comms_template_library(is_active);

CREATE TRIGGER trg_comms_template_library_updated_at
  BEFORE UPDATE ON comms_template_library
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- -------------------------------------------------------
-- 2. campaign_comms_drafts
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS campaign_comms_drafts (
  draft_id SERIAL PRIMARY KEY,
  campaign_id INT NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  stage_number INTEGER NOT NULL CHECK (stage_number BETWEEN 1 AND 6),
  platform VARCHAR(20) NOT NULL CHECK (platform IN ('email', 'sms', 'phone_script')),
  title VARCHAR(300),
  subject VARCHAR(500),
  body TEXT NOT NULL,
  body_html TEXT,
  tone VARCHAR(200),
  audience_segment VARCHAR(200),
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('generating', 'draft', 'approved', 'sent', 'failed')),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  sent_via VARCHAR(20) CHECK (sent_via IN ('action_network', 'yabbr', 'manual')),
  external_message_id VARCHAR(200),
  send_stats JSONB,
  ai_model_used VARCHAR(100),
  ai_prompt_hash VARCHAR(64),
  source_template_ids INTEGER[],
  wtp_context_snapshot JSONB,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ccd_campaign_stage ON campaign_comms_drafts(campaign_id, stage_number);
CREATE INDEX IF NOT EXISTS idx_ccd_campaign_status ON campaign_comms_drafts(campaign_id, status);

CREATE TRIGGER trg_campaign_comms_drafts_updated_at
  BEFORE UPDATE ON campaign_comms_drafts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- -------------------------------------------------------
-- 3. worker_an_tags (Action Network engagement tag cache)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS worker_an_tags (
  id SERIAL PRIMARY KEY,
  worker_id INT NOT NULL REFERENCES workers(worker_id) ON DELETE CASCADE,
  an_tag_id VARCHAR(200) NOT NULL,
  an_tag_name VARCHAR(300) NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (worker_id, an_tag_id)
);

CREATE INDEX IF NOT EXISTS idx_wat_worker ON worker_an_tags(worker_id);
CREATE INDEX IF NOT EXISTS idx_wat_an_tag ON worker_an_tags(an_tag_id);

-- -------------------------------------------------------
-- 4. an_tag_sync_log
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS an_tag_sync_log (
  sync_id SERIAL PRIMARY KEY,
  campaign_id INT NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  an_tag_id VARCHAR(200),
  an_tag_name VARCHAR(300),
  sync_direction VARCHAR(10) NOT NULL CHECK (sync_direction IN ('push', 'pull')),
  workers_affected INTEGER NOT NULL DEFAULT 0,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  synced_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_atsl_campaign ON an_tag_sync_log(campaign_id);

-- -------------------------------------------------------
-- 5. RLS policies
-- -------------------------------------------------------
ALTER TABLE comms_template_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_comms_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_an_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE an_tag_sync_log ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'comms_template_library',
      'campaign_comms_drafts',
      'worker_an_tags',
      'an_tag_sync_log'
    ])
  LOOP
    EXECUTE format(
      'CREATE POLICY "Authenticated users can read %1$s" ON %1$s FOR SELECT TO authenticated USING (true)',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY "Admin/User can insert %1$s" ON %1$s FOR INSERT TO authenticated WITH CHECK (get_user_role() IN (''admin'',''user''))',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY "Admin/User can update %1$s" ON %1$s FOR UPDATE TO authenticated USING (get_user_role() IN (''admin'',''user'')) WITH CHECK (get_user_role() IN (''admin'',''user''))',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY "Admin can delete %1$s" ON %1$s FOR DELETE TO authenticated USING (get_user_role() = ''admin'')',
      tbl
    );
  END LOOP;
END $$;
