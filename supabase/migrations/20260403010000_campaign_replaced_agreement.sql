-- Add replaced_agreement_id to campaigns table
-- Supports the "replacement EA" subtype: tracks which agreement this campaign is replacing.

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS replaced_agreement_id INT
    REFERENCES agreements(agreement_id) ON DELETE SET NULL;

COMMENT ON COLUMN campaigns.replaced_agreement_id IS
  'For replacement EA bargaining campaigns: the existing enterprise agreement being superseded by this campaign.';
