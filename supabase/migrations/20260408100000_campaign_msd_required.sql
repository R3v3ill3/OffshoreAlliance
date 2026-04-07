ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS msd_required BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN campaigns.msd_required IS
  'Whether a Majority Support Determination is required for this bargaining campaign';
