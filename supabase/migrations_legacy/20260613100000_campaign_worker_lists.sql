-- ============================================================
-- Migration 20260613100000: Campaign Worker Lists (drag-and-drop build list)
--
-- Adds a saved-cohort layer that sits in front of call_lists,
-- campaign_comms_drafts, and campaign_task_lists. Organisers build a
-- cohort visually on the wall chart, then "fire" it into one of the
-- three downstream pathways (phone / email / task) which copy items
-- into the existing pathway-specific table.
--
-- Tables:
--   - campaign_worker_lists        -- list shell (name, purpose, leader)
--   - campaign_worker_list_items   -- worker membership in the list
--
-- Conventions match call_lists / call_list_items (SERIAL ids,
-- VARCHAR + CHECK enums, can_write_to_campaign RLS).
-- ============================================================

-- -------------------------------------------------------
-- 1. campaign_worker_lists
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS campaign_worker_lists (
  list_id              SERIAL PRIMARY KEY,
  campaign_id          INTEGER NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  name                 VARCHAR(300) NOT NULL,
  description          TEXT,
  default_purpose      VARCHAR(20)
    CHECK (default_purpose IS NULL OR default_purpose IN ('email', 'phone', 'task')),
  status               VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'fired', 'archived')),
  leader_worker_id     INTEGER REFERENCES workers(worker_id) ON DELETE SET NULL,
  leader_organiser_id  INTEGER REFERENCES organisers(organiser_id) ON DELETE SET NULL,
  source               VARCHAR(40) NOT NULL DEFAULT 'wall_chart',
  fired_call_list_id   INTEGER,
  fired_draft_id       INTEGER,
  fired_task_list_id   INTEGER,
  fired_at             TIMESTAMPTZ,
  created_by           UUID REFERENCES auth.users(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (leader_worker_id IS NULL OR leader_organiser_id IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_cwl_campaign ON campaign_worker_lists(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_cwl_created_by ON campaign_worker_lists(created_by);

CREATE TRIGGER trg_campaign_worker_lists_updated_at
  BEFORE UPDATE ON campaign_worker_lists
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- -------------------------------------------------------
-- 2. campaign_worker_list_items
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS campaign_worker_list_items (
  id            SERIAL PRIMARY KEY,
  list_id       INTEGER NOT NULL REFERENCES campaign_worker_lists(list_id) ON DELETE CASCADE,
  worker_id     INTEGER NOT NULL REFERENCES workers(worker_id) ON DELETE CASCADE,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  source_ou_id  INTEGER REFERENCES campaign_organising_units(ou_id) ON DELETE SET NULL,
  added_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(list_id, worker_id)
);

CREATE INDEX IF NOT EXISTS idx_cwli_list ON campaign_worker_list_items(list_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_cwli_worker ON campaign_worker_list_items(worker_id);

-- -------------------------------------------------------
-- 3. RLS
-- -------------------------------------------------------
ALTER TABLE campaign_worker_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_worker_list_items ENABLE ROW LEVEL SECURITY;

-- campaign_worker_lists
CREATE POLICY "Authenticated read campaign_worker_lists"
  ON campaign_worker_lists FOR SELECT TO authenticated USING (true);
CREATE POLICY "Campaign writers can insert campaign_worker_lists"
  ON campaign_worker_lists FOR INSERT TO authenticated
  WITH CHECK (can_write_to_campaign(campaign_id));
CREATE POLICY "Campaign writers can update campaign_worker_lists"
  ON campaign_worker_lists FOR UPDATE TO authenticated
  USING (can_write_to_campaign(campaign_id))
  WITH CHECK (can_write_to_campaign(campaign_id));
CREATE POLICY "Campaign writers can delete campaign_worker_lists"
  ON campaign_worker_lists FOR DELETE TO authenticated
  USING (can_write_to_campaign(campaign_id));

-- campaign_worker_list_items: policies follow parent list
CREATE POLICY "Authenticated read campaign_worker_list_items"
  ON campaign_worker_list_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Campaign writers can insert campaign_worker_list_items"
  ON campaign_worker_list_items FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaign_worker_lists cwl
      WHERE cwl.list_id = campaign_worker_list_items.list_id
        AND can_write_to_campaign(cwl.campaign_id)
    )
  );
CREATE POLICY "Campaign writers can update campaign_worker_list_items"
  ON campaign_worker_list_items FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM campaign_worker_lists cwl
      WHERE cwl.list_id = campaign_worker_list_items.list_id
        AND can_write_to_campaign(cwl.campaign_id)
    )
  );
CREATE POLICY "Campaign writers can delete campaign_worker_list_items"
  ON campaign_worker_list_items FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM campaign_worker_lists cwl
      WHERE cwl.list_id = campaign_worker_list_items.list_id
        AND can_write_to_campaign(cwl.campaign_id)
    )
  );

COMMENT ON TABLE  campaign_worker_lists IS 'Saved cohorts built via the wall-chart drag-and-drop builder. Status moves draft -> fired when handed off to phone/email/task pathway.';
COMMENT ON TABLE  campaign_worker_list_items IS 'Workers in a saved cohort, with optional source_ou_id captured at drop time for audit/UX.';
COMMENT ON COLUMN campaign_worker_lists.default_purpose IS 'Drives early UX warnings (missing email/phone) and leader-slot visibility. Not enforced at fire time -- a list with default_purpose=email can still be fired into phone/task.';
COMMENT ON COLUMN campaign_worker_lists.fired_call_list_id IS 'When fired into phone, the call_lists.list_id created from this cohort.';
COMMENT ON COLUMN campaign_worker_lists.fired_draft_id IS 'When fired into email, the campaign_comms_drafts.draft_id created from this cohort.';
COMMENT ON COLUMN campaign_worker_lists.fired_task_list_id IS 'When fired into task, the campaign_task_lists.task_list_id created from this cohort.';
