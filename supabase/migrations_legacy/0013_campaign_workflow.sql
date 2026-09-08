-- ============================================================
-- Migration 00013: Campaign workflow (EA scope, memberships,
-- activities/ratings, organising units, task lists, leader tokens)
-- ============================================================

-- 1. Extend campaigns
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS enterprise_agreement_subtype VARCHAR(30)
    CHECK (
      enterprise_agreement_subtype IS NULL
      OR enterprise_agreement_subtype IN ('new', 'replacement', 'boss_initiated')
    ),
  ADD COLUMN IF NOT EXISTS campaign_scope VARCHAR(40)
    CHECK (
      campaign_scope IS NULL
      OR campaign_scope IN (
        'single_employer_single_site',
        'single_employer_multi_site',
        'multi_employer_single_site',
        'multi_employer_multi_site'
      )
    ),
  ADD COLUMN IF NOT EXISTS total_worker_estimate INT
    CHECK (total_worker_estimate IS NULL OR total_worker_estimate >= 0),
  ADD COLUMN IF NOT EXISTS sector_wide BOOLEAN NOT NULL DEFAULT false;

-- 2. Campaign employers / worksites
CREATE TABLE IF NOT EXISTS campaign_employers (
  id SERIAL PRIMARY KEY,
  campaign_id INT NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  employer_id INT NOT NULL REFERENCES employers(employer_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, employer_id)
);

CREATE TABLE IF NOT EXISTS campaign_worksites (
  id SERIAL PRIMARY KEY,
  campaign_id INT NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  worksite_id INT REFERENCES worksites(worksite_id) ON DELETE CASCADE,
  sector_wide BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (sector_wide = true OR worksite_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS campaign_worksites_campaign_worksite_uq
  ON campaign_worksites (campaign_id, worksite_id)
  WHERE worksite_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS campaign_worksites_campaign_sector_uq
  ON campaign_worksites (campaign_id)
  WHERE sector_wide = true;

-- 3. Worker membership in campaign (dedupe source for reporting)
CREATE TABLE IF NOT EXISTS campaign_worker_membership (
  membership_id SERIAL PRIMARY KEY,
  campaign_id INT NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  worker_id INT NOT NULL REFERENCES workers(worker_id) ON DELETE CASCADE,
  oa_leader_role VARCHAR(20)
    CHECK (
      oa_leader_role IS NULL
      OR oa_leader_role IN ('delegate', 'activist', 'contact')
    ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, worker_id)
);

CREATE TRIGGER trg_campaign_worker_membership_updated_at
  BEFORE UPDATE ON campaign_worker_membership
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_cwm_campaign ON campaign_worker_membership(campaign_id);
CREATE INDEX IF NOT EXISTS idx_cwm_worker ON campaign_worker_membership(worker_id);

-- 4. Activities & ratings
CREATE TABLE IF NOT EXISTS campaign_activities (
  activity_id SERIAL PRIMARY KEY,
  campaign_id INT NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  title VARCHAR(300) NOT NULL,
  description TEXT,
  template_key VARCHAR(80),
  activity_kind VARCHAR(20) NOT NULL DEFAULT 'task'
    CHECK (activity_kind IN ('task', 'assessment')),
  is_binary BOOLEAN NOT NULL DEFAULT false,
  supporter_outcome_value VARCHAR(30),
  is_custom BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_activities_campaign ON campaign_activities(campaign_id);

CREATE TABLE IF NOT EXISTS campaign_activity_ratings (
  rating_id SERIAL PRIMARY KEY,
  activity_id INT NOT NULL REFERENCES campaign_activities(activity_id) ON DELETE CASCADE,
  worker_id INT NOT NULL REFERENCES workers(worker_id) ON DELETE CASCADE,
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  binary_value VARCHAR(30),
  notes TEXT,
  rated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source VARCHAR(20) NOT NULL DEFAULT 'staff'
    CHECK (source IN ('staff', 'leader_form')),
  rated_by_user_id UUID,
  UNIQUE (activity_id, worker_id)
);

CREATE INDEX IF NOT EXISTS idx_car_activity ON campaign_activity_ratings(activity_id);
CREATE INDEX IF NOT EXISTS idx_car_worker ON campaign_activity_ratings(worker_id);

-- 5. Organising units
CREATE TABLE IF NOT EXISTS campaign_organising_units (
  ou_id SERIAL PRIMARY KEY,
  campaign_id INT NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  ou_type VARCHAR(30) NOT NULL
    CHECK (ou_type IN ('shift', 'department', 'network', 'job_type', 'worksite')),
  name VARCHAR(200) NOT NULL,
  total_workers_estimated INT CHECK (total_workers_estimated IS NULL OR total_workers_estimated >= 0),
  source_metadata JSONB,
  anchor_worker_id INT REFERENCES workers(worker_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_campaign_organising_units_updated_at
  BEFORE UPDATE ON campaign_organising_units
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_cou_campaign ON campaign_organising_units(campaign_id);

CREATE TABLE IF NOT EXISTS campaign_worker_ou (
  id SERIAL PRIMARY KEY,
  ou_id INT NOT NULL REFERENCES campaign_organising_units(ou_id) ON DELETE CASCADE,
  worker_id INT NOT NULL REFERENCES workers(worker_id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ou_id, worker_id)
);

CREATE INDEX IF NOT EXISTS idx_cwo_ou ON campaign_worker_ou(ou_id);
CREATE INDEX IF NOT EXISTS idx_cwo_worker ON campaign_worker_ou(worker_id);

-- 6. Task lists & leader tokens
CREATE TABLE IF NOT EXISTS campaign_task_lists (
  task_list_id SERIAL PRIMARY KEY,
  campaign_id INT NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  activity_id INT NOT NULL REFERENCES campaign_activities(activity_id) ON DELETE CASCADE,
  leader_worker_id INT REFERENCES workers(worker_id) ON DELETE SET NULL,
  leader_organiser_id INT REFERENCES organisers(organiser_id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'completed')),
  title VARCHAR(300),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (leader_worker_id IS NOT NULL OR leader_organiser_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_ctl_campaign ON campaign_task_lists(campaign_id);

CREATE TABLE IF NOT EXISTS campaign_task_list_items (
  id SERIAL PRIMARY KEY,
  task_list_id INT NOT NULL REFERENCES campaign_task_lists(task_list_id) ON DELETE CASCADE,
  worker_id INT REFERENCES workers(worker_id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS campaign_task_list_items_worker_uq
  ON campaign_task_list_items (task_list_id, worker_id)
  WHERE worker_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ctli_task_list ON campaign_task_list_items(task_list_id);

CREATE TABLE IF NOT EXISTS campaign_leader_tokens (
  token_id SERIAL PRIMARY KEY,
  task_list_id INT NOT NULL REFERENCES campaign_task_lists(task_list_id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clt_task_list ON campaign_leader_tokens(task_list_id);

-- 7. Prospective workers (leader form / staging)
CREATE TABLE IF NOT EXISTS campaign_prospective_workers (
  prospective_id SERIAL PRIMARY KEY,
  campaign_id INT NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  task_list_id INT REFERENCES campaign_task_lists(task_list_id) ON DELETE SET NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(200),
  phone VARCHAR(30),
  notes TEXT,
  rating INT CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  merged_worker_id INT REFERENCES workers(worker_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cpw_campaign ON campaign_prospective_workers(campaign_id);

-- 8. Rating summary view (cumulative = rounded avg; last = latest rated_at in campaign)
CREATE OR REPLACE VIEW campaign_worker_rating_summary
WITH (security_invoker = true)
AS
SELECT
  m.campaign_id,
  m.worker_id,
  CASE
    WHEN COUNT(r.rating_id) FILTER (WHERE a.campaign_id = m.campaign_id) > 0 THEN
      ROUND(
        AVG(r.rating::numeric) FILTER (WHERE a.campaign_id = m.campaign_id)
      )::int
    ELSE NULL
  END AS cumulative_rating,
  (
    SELECT r2.rating
    FROM campaign_activity_ratings r2
    INNER JOIN campaign_activities a2 ON a2.activity_id = r2.activity_id
    WHERE a2.campaign_id = m.campaign_id
      AND r2.worker_id = m.worker_id
    ORDER BY r2.rated_at DESC NULLS LAST
    LIMIT 1
  ) AS last_activity_rating
FROM campaign_worker_membership m
LEFT JOIN campaign_activity_ratings r ON r.worker_id = m.worker_id
LEFT JOIN campaign_activities a ON a.activity_id = r.activity_id AND a.campaign_id = m.campaign_id
GROUP BY m.campaign_id, m.worker_id;

-- 9. RLS
ALTER TABLE campaign_employers ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_worksites ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_worker_membership ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_activity_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_organising_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_worker_ou ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_task_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_task_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_leader_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_prospective_workers ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'campaign_employers',
      'campaign_worksites',
      'campaign_worker_membership',
      'campaign_activities',
      'campaign_activity_ratings',
      'campaign_organising_units',
      'campaign_worker_ou',
      'campaign_task_lists',
      'campaign_task_list_items',
      'campaign_leader_tokens',
      'campaign_prospective_workers'
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

-- View inherits underlying table RLS in Postgres when security_invoker - default is definer for views in PG15+
-- Grant select on view to authenticated
GRANT SELECT ON campaign_worker_rating_summary TO authenticated;
