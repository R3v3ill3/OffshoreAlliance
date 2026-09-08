-- ============================================================
-- Campaign leader ↔ worker links
-- Explicit organising relationships so the wallchart can show who
-- leads whom, independent of organising-unit membership.
-- ============================================================

CREATE TABLE IF NOT EXISTS campaign_leader_worker_links (
  link_id            BIGSERIAL PRIMARY KEY,
  campaign_id        INT NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  leader_worker_id   INT NOT NULL REFERENCES workers(worker_id) ON DELETE CASCADE,
  follower_worker_id INT NOT NULL REFERENCES workers(worker_id) ON DELETE CASCADE,
  notes              TEXT,
  created_by         UUID REFERENCES auth.users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT no_self_link CHECK (leader_worker_id <> follower_worker_id),
  CONSTRAINT uniq_campaign_leader_follower UNIQUE (campaign_id, leader_worker_id, follower_worker_id)
);

CREATE INDEX IF NOT EXISTS idx_clwl_campaign_leader
  ON campaign_leader_worker_links(campaign_id, leader_worker_id);

CREATE INDEX IF NOT EXISTS idx_clwl_campaign_follower
  ON campaign_leader_worker_links(campaign_id, follower_worker_id);

-- Keep updated_at fresh on row edits.
CREATE OR REPLACE FUNCTION set_campaign_leader_worker_links_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_clwl_updated_at ON campaign_leader_worker_links;
CREATE TRIGGER trg_clwl_updated_at
  BEFORE UPDATE ON campaign_leader_worker_links
  FOR EACH ROW EXECUTE FUNCTION set_campaign_leader_worker_links_updated_at();

-- RLS mirrors other campaign-scoped tables.
ALTER TABLE campaign_leader_worker_links ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN
    CREATE POLICY "Authenticated users can read campaign_leader_worker_links"
      ON campaign_leader_worker_links FOR SELECT TO authenticated USING (true);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    CREATE POLICY "Admin/User can insert campaign_leader_worker_links"
      ON campaign_leader_worker_links FOR INSERT TO authenticated
      WITH CHECK (get_user_role() IN ('admin', 'user'));
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    CREATE POLICY "Admin/User can update campaign_leader_worker_links"
      ON campaign_leader_worker_links FOR UPDATE TO authenticated
      USING (get_user_role() IN ('admin', 'user'))
      WITH CHECK (get_user_role() IN ('admin', 'user'));
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    CREATE POLICY "Admin can delete campaign_leader_worker_links"
      ON campaign_leader_worker_links FOR DELETE TO authenticated
      USING (get_user_role() = 'admin');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

COMMENT ON TABLE campaign_leader_worker_links IS
  'Explicit leader→follower organising relationships within a campaign. '
  'Links are campaign-scoped; cross-unit relationships are supported '
  '(no ou_id on the link itself).';
