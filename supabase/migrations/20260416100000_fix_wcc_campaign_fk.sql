-- ============================================================
-- Migration 20260416100000: Fix worker_campaign_connections FK
--
-- The worker_campaign_connections.campaign_id column was
-- referencing campaign_timelines(campaign_id) instead of
-- campaigns(campaign_id). This caused the record_call_attempt
-- RPC to fail with a FK violation for any campaign that does
-- not have a campaign_timelines row set up, which is a common
-- scenario for newly created campaigns.
--
-- Connections belong to campaigns, not to campaign timelines,
-- so the FK should point to campaigns(campaign_id).
-- ============================================================

ALTER TABLE worker_campaign_connections
  DROP CONSTRAINT IF EXISTS worker_campaign_connections_campaign_id_fkey;

ALTER TABLE worker_campaign_connections
  ADD CONSTRAINT worker_campaign_connections_campaign_id_fkey
  FOREIGN KEY (campaign_id)
  REFERENCES campaigns(campaign_id)
  ON DELETE CASCADE;
