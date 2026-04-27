-- ============================================================
-- Phase 1 of campaigns review plan: multi-agreement support.
--
-- Today campaigns can only point at ONE replaced agreement via
-- campaigns.replaced_agreement_id. This migration introduces a
-- proper M:N junction so a campaign can attach multiple
-- agreements with explicit roles (replaced / new / related).
--
-- The legacy column campaigns.replaced_agreement_id is retained
-- and kept in sync via trigger so existing reads (universe
-- section, planner wizard, agreement detail page) continue to
-- work unchanged. New code should write to campaign_agreements
-- and read its rows directly when role/multiplicity matter.
-- ============================================================

CREATE TABLE IF NOT EXISTS campaign_agreements (
  id SERIAL PRIMARY KEY,
  campaign_id INT NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  agreement_id INT NOT NULL REFERENCES agreements(agreement_id) ON DELETE CASCADE,
  relationship_type VARCHAR(20) NOT NULL DEFAULT 'related'
    CHECK (relationship_type IN ('replaced', 'new', 'related')),
  is_primary BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, agreement_id)
);

CREATE INDEX IF NOT EXISTS idx_ca_campaign ON campaign_agreements(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ca_agreement ON campaign_agreements(agreement_id);

-- A campaign has at most one *primary* replaced agreement. Keeps the legacy
-- single-FK semantics representable in the junction table.
CREATE UNIQUE INDEX IF NOT EXISTS campaign_agreements_one_primary_replaced_uq
  ON campaign_agreements (campaign_id)
  WHERE relationship_type = 'replaced' AND is_primary = true;

CREATE OR REPLACE TRIGGER trg_campaign_agreements_updated_at
  BEFORE UPDATE ON campaign_agreements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Backfill: every campaigns.replaced_agreement_id becomes a primary 'replaced' row.
INSERT INTO campaign_agreements (campaign_id, agreement_id, relationship_type, is_primary, sort_order)
SELECT campaign_id, replaced_agreement_id, 'replaced', true, 0
FROM campaigns
WHERE replaced_agreement_id IS NOT NULL
ON CONFLICT (campaign_id, agreement_id) DO NOTHING;

-- Keep campaigns.replaced_agreement_id mirrored from the primary 'replaced' row
-- so existing read paths (campaign-universe-section, planner-wizard,
-- agreements/[id]/page) keep working until they migrate to read the junction.
CREATE OR REPLACE FUNCTION sync_campaign_replaced_agreement()
RETURNS TRIGGER AS $$
DECLARE
  cid INT;
  primary_aid INT;
BEGIN
  cid := COALESCE(NEW.campaign_id, OLD.campaign_id);

  SELECT agreement_id INTO primary_aid
  FROM campaign_agreements
  WHERE campaign_id = cid
    AND relationship_type = 'replaced'
    AND is_primary = true
  LIMIT 1;

  UPDATE campaigns
  SET replaced_agreement_id = primary_aid
  WHERE campaign_id = cid
    AND replaced_agreement_id IS DISTINCT FROM primary_aid;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_campaign_replaced_agreement ON campaign_agreements;
CREATE TRIGGER trg_sync_campaign_replaced_agreement
  AFTER INSERT OR UPDATE OR DELETE ON campaign_agreements
  FOR EACH ROW EXECUTE FUNCTION sync_campaign_replaced_agreement();

-- RLS: same pattern as the rest of the campaign_* tables.
ALTER TABLE campaign_agreements ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN
    EXECUTE 'CREATE POLICY "Authenticated users can read campaign_agreements" ON campaign_agreements FOR SELECT TO authenticated USING (true)';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    EXECUTE 'CREATE POLICY "Admin/User can insert campaign_agreements" ON campaign_agreements FOR INSERT TO authenticated WITH CHECK (get_user_role() IN (''admin'',''user''))';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    EXECUTE 'CREATE POLICY "Admin/User can update campaign_agreements" ON campaign_agreements FOR UPDATE TO authenticated USING (get_user_role() IN (''admin'',''user'')) WITH CHECK (get_user_role() IN (''admin'',''user''))';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    EXECUTE 'CREATE POLICY "Admin can delete campaign_agreements" ON campaign_agreements FOR DELETE TO authenticated USING (get_user_role() = ''admin'')';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

COMMENT ON TABLE campaign_agreements IS
  'M:N: campaigns ↔ agreements. relationship_type: replaced (existing EA superseded), new (EA being made), related (in scope but not central). At most one (relationship_type=replaced AND is_primary) per campaign — the value campaigns.replaced_agreement_id mirrors.';

COMMENT ON COLUMN campaign_agreements.is_primary IS
  'True for the canonical agreement of its relationship_type for the campaign. Currently enforced unique only for replaced + true so legacy single-FK behaviour is preserved.';
