-- ============================================================
-- Hidden per-episode campaigns for standalone SMS
-- (blast / survey / chat marked "not part of a campaign").
--
-- Each standalone session is a real campaigns row so existing
-- NOT NULL FKs, RLS (can_write_to_campaign via created_by), and
-- conversation uniqueness (our_number, phone, campaign_id) keep
-- working. Distinct from is_standing (the single shared phone
-- catch-all). Do not null campaign_id on sms_lists / sms_surveys.
-- ============================================================

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS is_sms_episode BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN campaigns.is_sms_episode IS
  'When TRUE this campaign is a hidden per-episode container for a '
  'standalone SMS blast, survey, or chat that is not part of a visible '
  'organising campaign. Hidden from the campaigns list and campaign '
  'chrome (assessments, wall chart, plan). Distinct from is_standing.';

CREATE INDEX IF NOT EXISTS idx_campaigns_is_sms_episode
  ON campaigns(is_sms_episode)
  WHERE is_sms_episode = TRUE;
