-- ============================================================
-- Campaign unit rules + assignment source tracking
-- Supports rule-based assignment and multi-unit reporting flags.
-- ============================================================

-- 1) Track assignment provenance on worker-to-unit links
ALTER TABLE campaign_worker_ou
  ADD COLUMN IF NOT EXISTS assignment_source VARCHAR(20) NOT NULL DEFAULT 'manual'
    CHECK (assignment_source IN ('manual', 'rule')),
  ADD COLUMN IF NOT EXISTS assigned_rule_id INT NULL;

ALTER TABLE campaign_worker_ou
  DROP CONSTRAINT IF EXISTS campaign_worker_ou_assigned_rule_id_fkey;

-- rule table is created below; FK added after creation

CREATE INDEX IF NOT EXISTS idx_cwo_assignment_source
  ON campaign_worker_ou(assignment_source);

-- 2) Rule definitions for each unit
CREATE TABLE IF NOT EXISTS campaign_unit_rules (
  rule_id SERIAL PRIMARY KEY,
  campaign_id INT NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  ou_id INT NOT NULL REFERENCES campaign_organising_units(ou_id) ON DELETE CASCADE,
  include BOOLEAN NOT NULL DEFAULT true,
  dimension_type VARCHAR(32) NOT NULL
    CHECK (dimension_type IN (
      'employer',
      'worksite',
      'occupation',
      'occupation_grouping',
      'shift',
      'work_area',
      'relational'
    )),
  operator VARCHAR(16) NOT NULL DEFAULT 'contains'
    CHECK (operator IN ('equals', 'contains')),
  value_int INT NULL,
  value_text TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (value_int IS NOT NULL OR value_text IS NOT NULL)
);

CREATE OR REPLACE TRIGGER trg_campaign_unit_rules_updated_at
  BEFORE UPDATE ON campaign_unit_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_cur_campaign ON campaign_unit_rules(campaign_id);
CREATE INDEX IF NOT EXISTS idx_cur_ou ON campaign_unit_rules(ou_id);
CREATE INDEX IF NOT EXISTS idx_cur_dimension ON campaign_unit_rules(dimension_type);

ALTER TABLE campaign_worker_ou
  ADD CONSTRAINT campaign_worker_ou_assigned_rule_id_fkey
  FOREIGN KEY (assigned_rule_id) REFERENCES campaign_unit_rules(rule_id) ON DELETE SET NULL;

-- 3) Reporting view for multi-unit flags and distinct counts
CREATE OR REPLACE VIEW campaign_worker_unit_membership_summary
WITH (security_invoker = true)
AS
SELECT
  cwm.campaign_id,
  cwm.worker_id,
  COUNT(DISTINCT cwou.ou_id) AS unit_count,
  (COUNT(DISTINCT cwou.ou_id) > 1) AS is_multi_unit_member
FROM campaign_worker_membership cwm
LEFT JOIN campaign_organising_units cou
  ON cou.campaign_id = cwm.campaign_id
LEFT JOIN campaign_worker_ou cwou
  ON cwou.ou_id = cou.ou_id
 AND cwou.worker_id = cwm.worker_id
GROUP BY cwm.campaign_id, cwm.worker_id;

GRANT SELECT ON campaign_worker_unit_membership_summary TO authenticated;

-- 4) RLS
ALTER TABLE campaign_unit_rules ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN
    CREATE POLICY "Authenticated users can read campaign_unit_rules"
      ON campaign_unit_rules FOR SELECT TO authenticated USING (true);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    CREATE POLICY "Admin/User can insert campaign_unit_rules"
      ON campaign_unit_rules FOR INSERT TO authenticated
      WITH CHECK (get_user_role() IN ('admin', 'user'));
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    CREATE POLICY "Admin/User can update campaign_unit_rules"
      ON campaign_unit_rules FOR UPDATE TO authenticated
      USING (get_user_role() IN ('admin', 'user'))
      WITH CHECK (get_user_role() IN ('admin', 'user'));
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    CREATE POLICY "Admin can delete campaign_unit_rules"
      ON campaign_unit_rules FOR DELETE TO authenticated
      USING (get_user_role() = 'admin');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
