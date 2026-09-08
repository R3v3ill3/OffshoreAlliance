-- ============================================================
-- Activists & WOCs module — Phase 1 of 7 (schema)
--
-- Digitises the OA Activist & WOC Tracker as first-class data:
--
--   1. campaign_activist_profiles — the Activist Register row for a
--      (campaign, worker): activation fields (ladder rung, 4A stage),
--      identification/recruitment provenance, SKAB notes, contact
--      cadence. rating_level stays the single assessment currency —
--      this table deliberately carries NO rating column.
--   2. activist_tasks — the 4A tasking cycle (assess → assign →
--      assist → acknowledge), one row per task cycle per activist.
--   3. campaign_wocs / woc_scope_units / woc_members /
--      woc_committee_meetings — Workplace Organising Committees as a
--      first-class entity: declared scope (a group OU and/or a unit
--      set), roster with development roles, and a meeting log built
--      on the standard five-item agenda. Meetings OPTIONALLY link to
--      a campaign_activities row (+ activity_event) when the
--      organiser wants to track commitments (expected ratings) and
--      attendance (actual) — early-stage units; mature units just
--      log the meeting.
--      NOTE: namespaced apart from the bargaining 'woc_meeting'
--      activity kind / woc_meeting_details, which record
--      endorsement-vote outcomes on a single activity.
--   4. structure_tests / structure_test_results — escalating
--      collective actions with per-OU eligible/participated/pass.
--   5. campaign_ou_coverage — the thin editable layer of the
--      Coverage Map (named leader, second-in-line, 48-hr
--      reachability, priority action); everything else is derived.
--
-- Auto-provisioning: a register profile is created automatically for
-- any worker who (a) is rated 1 on any activity, (b) becomes an
-- active task-list leader or receives an activist task, (c) joins a
-- WOC, or (d) holds/gains a contact / activist / delegate role while
-- in a planning/active campaign. Backfill included.
--
-- Views: v_campaign_activist_register, v_campaign_coverage_map,
-- v_campaign_coverage_summary, v_woc_unit_representation.
--
-- Also rewires the calculate_active_wocs() gate-criteria placeholder
-- (20260402150000) to count real committees.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. campaign_activist_profiles
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS campaign_activist_profiles (
  profile_id BIGSERIAL PRIMARY KEY,
  campaign_id INT NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  worker_id INT NOT NULL REFERENCES workers(worker_id) ON DELETE CASCADE,
  -- How the row came to exist. 'manual' = curated by an organiser;
  -- auto_* rows are provisioned by triggers and flagged in the UI
  -- until an organiser edits them (which flips source to 'manual').
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'auto_rating', 'auto_task', 'auto_role', 'auto_woc')),
  is_archived BOOLEAN NOT NULL DEFAULT false,
  identified_via TEXT
    CHECK (identified_via IS NULL OR identified_via IN
      ('workmate_rec', 'office_call', 'outreach', 'event', 'observed', 'other')),
  recruited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  recruited_by_text TEXT,
  recruited_at DATE,
  domain TEXT
    CHECK (domain IS NULL OR domain IN
      ('recruitment', 'comms', 'mobilisation', 'representation')),
  followers_evidence TEXT,
  skab_notes TEXT,
  -- Tasking ladder: 1 private/low-risk · 2 peer-to-peer · 3 semi-public
  -- · 4 structure test · 5 leading others.
  current_rung SMALLINT CHECK (current_rung IS NULL OR current_rung BETWEEN 1 AND 5),
  four_a_stage TEXT NOT NULL DEFAULT 'assess'
    CHECK (four_a_stage IN ('assess', 'assign', 'assist', 'acknowledge')),
  last_contact_date DATE,
  next_contact_date DATE,
  notes TEXT,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, worker_id)
);

CREATE INDEX IF NOT EXISTS idx_cap_campaign ON campaign_activist_profiles(campaign_id);
CREATE INDEX IF NOT EXISTS idx_cap_worker ON campaign_activist_profiles(worker_id);
CREATE INDEX IF NOT EXISTS idx_cap_next_contact
  ON campaign_activist_profiles(campaign_id, next_contact_date)
  WHERE next_contact_date IS NOT NULL AND is_archived = false;

DROP TRIGGER IF EXISTS trg_campaign_activist_profiles_updated_at ON campaign_activist_profiles;
CREATE TRIGGER trg_campaign_activist_profiles_updated_at
  BEFORE UPDATE ON campaign_activist_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE campaign_activist_profiles ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  BEGIN EXECUTE 'CREATE POLICY campaign_activist_profiles_read ON campaign_activist_profiles FOR SELECT TO authenticated USING (true)'; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY campaign_activist_profiles_write ON campaign_activist_profiles FOR ALL TO authenticated USING (can_write_to_campaign(campaign_id))'; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 2. WOC committees, scope, roster, meetings
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS campaign_wocs (
  woc_id BIGSERIAL PRIMARY KEY,
  campaign_id INT NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  -- Declared scope: typically a group container OU; representation is
  -- derived over its descendant units (plus woc_scope_units extras).
  scope_ou_id INT REFERENCES campaign_organising_units(ou_id) ON DELETE SET NULL,
  cadence TEXT,
  format TEXT
    CHECK (format IS NULL OR format IN ('in_person', 'video', 'split_swing', 'mixed')),
  status TEXT NOT NULL DEFAULT 'forming'
    CHECK (status IN ('forming', 'active', 'paused', 'disbanded')),
  notes TEXT,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_wocs_campaign ON campaign_wocs(campaign_id);

DROP TRIGGER IF EXISTS trg_campaign_wocs_updated_at ON campaign_wocs;
CREATE TRIGGER trg_campaign_wocs_updated_at
  BEFORE UPDATE ON campaign_wocs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS woc_scope_units (
  woc_id BIGINT NOT NULL REFERENCES campaign_wocs(woc_id) ON DELETE CASCADE,
  ou_id INT NOT NULL REFERENCES campaign_organising_units(ou_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (woc_id, ou_id)
);

CREATE TABLE IF NOT EXISTS woc_members (
  woc_member_id BIGSERIAL PRIMARY KEY,
  woc_id BIGINT NOT NULL REFERENCES campaign_wocs(woc_id) ON DELETE CASCADE,
  worker_id INT NOT NULL REFERENCES workers(worker_id) ON DELETE CASCADE,
  -- Every roster role is itself a development assignment.
  woc_role TEXT NOT NULL DEFAULT 'member'
    CHECK (woc_role IN ('chair', 'mapper', 'comms_steward', 'recruitment_lead', 'member')),
  joined_on DATE NOT NULL DEFAULT CURRENT_DATE,
  left_on DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (woc_id, worker_id)
);

CREATE INDEX IF NOT EXISTS idx_woc_members_woc ON woc_members(woc_id);
CREATE INDEX IF NOT EXISTS idx_woc_members_worker ON woc_members(worker_id);

DROP TRIGGER IF EXISTS trg_woc_members_updated_at ON woc_members;
CREATE TRIGGER trg_woc_members_updated_at
  BEFORE UPDATE ON woc_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS woc_committee_meetings (
  meeting_id BIGSERIAL PRIMARY KEY,
  woc_id BIGINT NOT NULL REFERENCES campaign_wocs(woc_id) ON DELETE CASCADE,
  meeting_date DATE NOT NULL,
  format TEXT
    CHECK (format IS NULL OR format IN ('in_person', 'video', 'split_swing', 'mixed')),
  chair_worker_id INT REFERENCES workers(worker_id) ON DELETE SET NULL,
  -- Optional commitments/attendance tracking: when the organiser
  -- toggles it on, the UI creates a campaign_activities row (+ an
  -- activity_event for the date) and links them here; commitments are
  -- recorded as 'expected' ratings and attendance as 'actual'
  -- (meeting_attendance). NULL for mature units that just log.
  activity_id INT REFERENCES campaign_activities(activity_id) ON DELETE SET NULL,
  event_id INT REFERENCES activity_events(event_id) ON DELETE SET NULL,
  -- Five-item agenda outcomes.
  whats_new TEXT,
  recognition_notes TEXT,
  new_tasks_summary TEXT,
  -- Snapshots taken at save time so the log stays honest as the OU
  -- tree and roster change later. Arrays of {ou_id, name} / worker_id.
  crews_represented_snapshot JSONB,
  crews_missing_snapshot JSONB,
  attendees_snapshot JSONB,
  next_meeting_date DATE,
  next_chair_worker_id INT REFERENCES workers(worker_id) ON DELETE SET NULL,
  notes TEXT,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wcm_woc_date ON woc_committee_meetings(woc_id, meeting_date DESC);
CREATE INDEX IF NOT EXISTS idx_wcm_activity ON woc_committee_meetings(activity_id)
  WHERE activity_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_woc_committee_meetings_updated_at ON woc_committee_meetings;
CREATE TRIGGER trg_woc_committee_meetings_updated_at
  BEFORE UPDATE ON woc_committee_meetings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE campaign_wocs ENABLE ROW LEVEL SECURITY;
ALTER TABLE woc_scope_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE woc_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE woc_committee_meetings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN EXECUTE 'CREATE POLICY campaign_wocs_read ON campaign_wocs FOR SELECT TO authenticated USING (true)'; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY campaign_wocs_write ON campaign_wocs FOR ALL TO authenticated USING (can_write_to_campaign(campaign_id))'; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY woc_scope_units_read ON woc_scope_units FOR SELECT TO authenticated USING (true)'; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY woc_scope_units_write ON woc_scope_units FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM campaign_wocs cw WHERE cw.woc_id = woc_scope_units.woc_id AND can_write_to_campaign(cw.campaign_id)))'; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY woc_members_read ON woc_members FOR SELECT TO authenticated USING (true)'; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY woc_members_write ON woc_members FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM campaign_wocs cw WHERE cw.woc_id = woc_members.woc_id AND can_write_to_campaign(cw.campaign_id)))'; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY woc_committee_meetings_read ON woc_committee_meetings FOR SELECT TO authenticated USING (true)'; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY woc_committee_meetings_write ON woc_committee_meetings FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM campaign_wocs cw WHERE cw.woc_id = woc_committee_meetings.woc_id AND can_write_to_campaign(cw.campaign_id)))'; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 3. activist_tasks — the 4A cycle
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS activist_tasks (
  activist_task_id BIGSERIAL PRIMARY KEY,
  campaign_id INT NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  worker_id INT NOT NULL REFERENCES workers(worker_id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'assigned', 'in_progress', 'complete', 'cancelled')),
  -- Assign: responsibility not errand.
  responsibility TEXT NOT NULL,
  why_it_matters TEXT,
  campaign_moment TEXT,
  rung SMALLINT CHECK (rung IS NULL OR rung BETWEEN 1 AND 5),
  resources_provided TEXT,
  commitment TEXT,
  assigned_at DATE,
  due_date DATE,
  -- Assist.
  walkthrough_plan TEXT,
  inoculation TEXT,
  checkin_dates JSONB,
  -- Six conditions for learning (4A worksheet): object of six boolean
  -- keys — asked, can_say_why, size_ok, walked_through,
  -- follow_up_booked, recognition_planned.
  six_conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Acknowledge (completed after the task).
  outcome TEXT CHECK (outcome IS NULL OR outcome IN ('done', 'partly', 'not_done')),
  outcome_notes TEXT,
  debrief_date DATE,
  acknowledgement TEXT,
  reassessment_notes TEXT,
  next_task_id BIGINT REFERENCES activist_tasks(activist_task_id) ON DELETE SET NULL,
  -- Optional bridges into existing machinery.
  task_list_id INT REFERENCES campaign_task_lists(task_list_id) ON DELETE SET NULL,
  activity_id INT REFERENCES campaign_activities(activity_id) ON DELETE SET NULL,
  set_in_woc_meeting_id BIGINT REFERENCES woc_committee_meetings(meeting_id) ON DELETE SET NULL,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activist_tasks_campaign_worker
  ON activist_tasks(campaign_id, worker_id);
CREATE INDEX IF NOT EXISTS idx_activist_tasks_status
  ON activist_tasks(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_activist_tasks_woc_meeting
  ON activist_tasks(set_in_woc_meeting_id)
  WHERE set_in_woc_meeting_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_activist_tasks_updated_at ON activist_tasks;
CREATE TRIGGER trg_activist_tasks_updated_at
  BEFORE UPDATE ON activist_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE activist_tasks ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  BEGIN EXECUTE 'CREATE POLICY activist_tasks_read ON activist_tasks FOR SELECT TO authenticated USING (true)'; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY activist_tasks_write ON activist_tasks FOR ALL TO authenticated USING (can_write_to_campaign(campaign_id))'; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 4. Structure tests
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS structure_tests (
  structure_test_id BIGSERIAL PRIMARY KEY,
  campaign_id INT NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  test_number INT,
  test_date DATE,
  title TEXT NOT NULL,
  description TEXT,
  target_description TEXT,
  pass_threshold_pct NUMERIC(5, 2)
    CHECK (pass_threshold_pct IS NULL OR (pass_threshold_pct >= 0 AND pass_threshold_pct <= 100)),
  -- Optional backing binary activity so participation feeds ratings
  -- and the assessment charts.
  activity_id INT REFERENCES campaign_activities(activity_id) ON DELETE SET NULL,
  event_id INT REFERENCES activity_events(event_id) ON DELETE SET NULL,
  learnings TEXT,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_structure_tests_campaign
  ON structure_tests(campaign_id, test_date DESC);

DROP TRIGGER IF EXISTS trg_structure_tests_updated_at ON structure_tests;
CREATE TRIGGER trg_structure_tests_updated_at
  BEFORE UPDATE ON structure_tests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS structure_test_results (
  result_id BIGSERIAL PRIMARY KEY,
  structure_test_id BIGINT NOT NULL REFERENCES structure_tests(structure_test_id) ON DELETE CASCADE,
  ou_id INT NOT NULL REFERENCES campaign_organising_units(ou_id) ON DELETE CASCADE,
  eligible INT CHECK (eligible IS NULL OR eligible >= 0),
  participated INT CHECK (participated IS NULL OR participated >= 0),
  passed BOOLEAN,
  leader_worker_id INT REFERENCES workers(worker_id) ON DELETE SET NULL,
  learnings TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (structure_test_id, ou_id)
);

CREATE INDEX IF NOT EXISTS idx_str_results_test ON structure_test_results(structure_test_id);
CREATE INDEX IF NOT EXISTS idx_str_results_ou ON structure_test_results(ou_id);

DROP TRIGGER IF EXISTS trg_structure_test_results_updated_at ON structure_test_results;
CREATE TRIGGER trg_structure_test_results_updated_at
  BEFORE UPDATE ON structure_test_results
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE structure_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE structure_test_results ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  BEGIN EXECUTE 'CREATE POLICY structure_tests_read ON structure_tests FOR SELECT TO authenticated USING (true)'; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY structure_tests_write ON structure_tests FOR ALL TO authenticated USING (can_write_to_campaign(campaign_id))'; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY structure_test_results_read ON structure_test_results FOR SELECT TO authenticated USING (true)'; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY structure_test_results_write ON structure_test_results FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM structure_tests st WHERE st.structure_test_id = structure_test_results.structure_test_id AND can_write_to_campaign(st.campaign_id)))'; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 5. campaign_ou_coverage — editable layer of the Coverage Map
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS campaign_ou_coverage (
  coverage_id BIGSERIAL PRIMARY KEY,
  ou_id INT NOT NULL UNIQUE REFERENCES campaign_organising_units(ou_id) ON DELETE CASCADE,
  leader_worker_id INT REFERENCES workers(worker_id) ON DELETE SET NULL,
  second_worker_id INT REFERENCES workers(worker_id) ON DELETE SET NULL,
  reachable_48h BOOLEAN,
  priority_action TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_campaign_ou_coverage_updated_at ON campaign_ou_coverage;
CREATE TRIGGER trg_campaign_ou_coverage_updated_at
  BEFORE UPDATE ON campaign_ou_coverage
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE campaign_ou_coverage ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  BEGIN EXECUTE 'CREATE POLICY campaign_ou_coverage_read ON campaign_ou_coverage FOR SELECT TO authenticated USING (true)'; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY campaign_ou_coverage_write ON campaign_ou_coverage FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM campaign_organising_units cou WHERE cou.ou_id = campaign_ou_coverage.ou_id AND can_write_to_campaign(cou.campaign_id)))'; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 6. Auto-provisioning of register profiles
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_ensure_activist_profile(
  p_campaign_id INT,
  p_worker_id INT,
  p_source TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_campaign_id IS NULL OR p_worker_id IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO campaign_activist_profiles (campaign_id, worker_id, source)
  VALUES (p_campaign_id, p_worker_id, p_source)
  ON CONFLICT (campaign_id, worker_id) DO NOTHING;
EXCEPTION WHEN OTHERS THEN
  -- Auto-provisioning must never block the triggering write.
  NULL;
END;
$$;

CREATE OR REPLACE FUNCTION fn_role_type_is_activist_like(p_role_type_id INT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM member_role_types
    WHERE role_type_id = p_role_type_id
      AND lower(role_name) IN ('contact', 'activist', 'delegate')
  );
$$;

-- (a) Rated 1 (supportive leader) on any activity.
CREATE OR REPLACE FUNCTION fn_activist_profile_on_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign_id INT;
BEGIN
  IF NEW.rating IS DISTINCT FROM 1 THEN
    RETURN NEW;
  END IF;
  SELECT campaign_id INTO v_campaign_id
  FROM campaign_activities WHERE activity_id = NEW.activity_id;
  PERFORM fn_ensure_activist_profile(v_campaign_id, NEW.worker_id, 'auto_rating');
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_activist_profile_on_rating ON campaign_activity_ratings;
CREATE TRIGGER trg_activist_profile_on_rating
  AFTER INSERT OR UPDATE OF rating ON campaign_activity_ratings
  FOR EACH ROW EXECUTE FUNCTION fn_activist_profile_on_rating();

-- (b) Active task-list leader.
CREATE OR REPLACE FUNCTION fn_activist_profile_on_task_list()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'active' AND NEW.leader_worker_id IS NOT NULL THEN
    PERFORM fn_ensure_activist_profile(NEW.campaign_id, NEW.leader_worker_id, 'auto_task');
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_activist_profile_on_task_list ON campaign_task_lists;
CREATE TRIGGER trg_activist_profile_on_task_list
  AFTER INSERT OR UPDATE OF status, leader_worker_id ON campaign_task_lists
  FOR EACH ROW EXECUTE FUNCTION fn_activist_profile_on_task_list();

-- (c) Given a 4A task.
CREATE OR REPLACE FUNCTION fn_activist_profile_on_activist_task()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM fn_ensure_activist_profile(NEW.campaign_id, NEW.worker_id, 'auto_task');
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_activist_profile_on_activist_task ON activist_tasks;
CREATE TRIGGER trg_activist_profile_on_activist_task
  AFTER INSERT ON activist_tasks
  FOR EACH ROW EXECUTE FUNCTION fn_activist_profile_on_activist_task();

-- (d) Joins a WOC.
CREATE OR REPLACE FUNCTION fn_activist_profile_on_woc_member()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign_id INT;
BEGIN
  SELECT campaign_id INTO v_campaign_id FROM campaign_wocs WHERE woc_id = NEW.woc_id;
  PERFORM fn_ensure_activist_profile(v_campaign_id, NEW.worker_id, 'auto_woc');
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_activist_profile_on_woc_member ON woc_members;
CREATE TRIGGER trg_activist_profile_on_woc_member
  AFTER INSERT ON woc_members
  FOR EACH ROW EXECUTE FUNCTION fn_activist_profile_on_woc_member();

-- (e) Global role becomes contact / activist / delegate: provision a
-- profile in every planning/active campaign the worker belongs to.
CREATE OR REPLACE FUNCTION fn_activist_profile_on_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  IF NOT fn_role_type_is_activist_like(NEW.member_role_type_id) THEN
    RETURN NEW;
  END IF;
  FOR r IN
    SELECT cwm.campaign_id
    FROM campaign_worker_membership cwm
    JOIN campaigns c ON c.campaign_id = cwm.campaign_id
    WHERE cwm.worker_id = NEW.worker_id
      AND c.status IN ('planning', 'active')
  LOOP
    PERFORM fn_ensure_activist_profile(r.campaign_id, NEW.worker_id, 'auto_role');
  END LOOP;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_activist_profile_on_role_change ON workers;
CREATE TRIGGER trg_activist_profile_on_role_change
  AFTER UPDATE OF member_role_type_id ON workers
  FOR EACH ROW EXECUTE FUNCTION fn_activist_profile_on_role_change();

-- (f) Worker with a qualifying role joins a campaign.
CREATE OR REPLACE FUNCTION fn_activist_profile_on_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_type_id INT;
  v_status TEXT;
BEGIN
  SELECT member_role_type_id INTO v_role_type_id
  FROM workers WHERE worker_id = NEW.worker_id;
  IF NOT fn_role_type_is_activist_like(v_role_type_id) THEN
    RETURN NEW;
  END IF;
  SELECT status INTO v_status FROM campaigns WHERE campaign_id = NEW.campaign_id;
  IF v_status IN ('planning', 'active') THEN
    PERFORM fn_ensure_activist_profile(NEW.campaign_id, NEW.worker_id, 'auto_role');
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_activist_profile_on_membership ON campaign_worker_membership;
CREATE TRIGGER trg_activist_profile_on_membership
  AFTER INSERT ON campaign_worker_membership
  FOR EACH ROW EXECUTE FUNCTION fn_activist_profile_on_membership();

-- ─────────────────────────────────────────────────────────────
-- 7. Backfill (planning/active campaigns only)
-- ─────────────────────────────────────────────────────────────

-- Qualifying roles first (weakest signal), then task leaders, then
-- rated-1 workers — later inserts hit ON CONFLICT DO NOTHING, so the
-- recorded source reflects the first matching rule in this order.
INSERT INTO campaign_activist_profiles (campaign_id, worker_id, source)
SELECT DISTINCT cwm.campaign_id, cwm.worker_id, 'auto_role'
FROM campaign_worker_membership cwm
JOIN campaigns c ON c.campaign_id = cwm.campaign_id
JOIN workers w ON w.worker_id = cwm.worker_id
WHERE c.status IN ('planning', 'active')
  AND fn_role_type_is_activist_like(w.member_role_type_id)
ON CONFLICT (campaign_id, worker_id) DO NOTHING;

INSERT INTO campaign_activist_profiles (campaign_id, worker_id, source)
SELECT DISTINCT ctl.campaign_id, ctl.leader_worker_id, 'auto_task'
FROM campaign_task_lists ctl
JOIN campaigns c ON c.campaign_id = ctl.campaign_id
WHERE c.status IN ('planning', 'active')
  AND ctl.leader_worker_id IS NOT NULL
  AND ctl.status IN ('active', 'completed')
ON CONFLICT (campaign_id, worker_id) DO NOTHING;

INSERT INTO campaign_activist_profiles (campaign_id, worker_id, source)
SELECT DISTINCT ca.campaign_id, car.worker_id, 'auto_rating'
FROM campaign_activity_ratings car
JOIN campaign_activities ca ON ca.activity_id = car.activity_id
JOIN campaigns c ON c.campaign_id = ca.campaign_id
WHERE c.status IN ('planning', 'active')
  AND car.rating = 1
ON CONFLICT (campaign_id, worker_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 8. Views
-- ─────────────────────────────────────────────────────────────

-- The Activist Register grid: one row per non-archived profile with
-- worker identity, role, membership, current cumulative rating, the
-- most recent open 4A task, and current WOC membership.
CREATE OR REPLACE VIEW v_campaign_activist_register
WITH (security_invoker = true) AS
SELECT
  p.profile_id,
  p.campaign_id,
  p.worker_id,
  w.first_name || ' ' || w.last_name AS worker_name,
  w.member_role_type_id,
  mrt.role_name,
  mrt.display_name AS role_display_name,
  umt.type_name AS union_membership_type,
  w.is_hsr,
  w.is_bargaining_rep,
  cwrs.cumulative_rating AS current_rating,
  p.source,
  p.is_archived,
  p.identified_via,
  p.recruited_by,
  p.recruited_by_text,
  p.recruited_at,
  p.domain,
  p.followers_evidence,
  p.skab_notes,
  p.current_rung,
  p.four_a_stage,
  p.last_contact_date,
  p.next_contact_date,
  p.notes,
  p.created_at,
  p.updated_at,
  t.activist_task_id AS current_task_id,
  t.responsibility AS current_task_responsibility,
  t.rung AS current_task_rung,
  t.due_date AS current_task_due,
  t.status AS current_task_status,
  wm.woc_ids,
  wm.woc_names
FROM campaign_activist_profiles p
JOIN workers w ON w.worker_id = p.worker_id
LEFT JOIN member_role_types mrt ON mrt.role_type_id = w.member_role_type_id
LEFT JOIN union_membership_types umt ON umt.union_membership_type_id = w.union_membership_type_id
LEFT JOIN campaign_worker_rating_summary cwrs
  ON cwrs.campaign_id = p.campaign_id AND cwrs.worker_id = p.worker_id
LEFT JOIN LATERAL (
  SELECT activist_task_id, responsibility, rung, due_date, status
  FROM activist_tasks
  WHERE campaign_id = p.campaign_id
    AND worker_id = p.worker_id
    AND status IN ('draft', 'assigned', 'in_progress')
  ORDER BY COALESCE(assigned_at, created_at::date) DESC, activist_task_id DESC
  LIMIT 1
) t ON TRUE
LEFT JOIN LATERAL (
  SELECT array_agg(cw.woc_id) AS woc_ids, array_agg(cw.name) AS woc_names
  FROM woc_members m
  JOIN campaign_wocs cw ON cw.woc_id = m.woc_id
  WHERE m.worker_id = p.worker_id
    AND cw.campaign_id = p.campaign_id
    AND m.left_on IS NULL
) wm ON TRUE;

COMMENT ON VIEW v_campaign_activist_register IS
  'Activist Register grid: per-profile worker identity, role, membership, '
  'cumulative rating, latest open 4A task and current WOC membership.';

-- Coverage Map: one row per OU with assigned/member counts, density,
-- the editable coverage layer, the leader''s cumulative rating and the
-- derived status (gap / leader_no_second / covered).
CREATE OR REPLACE VIEW v_campaign_coverage_map
WITH (security_invoker = true) AS
SELECT
  cou.campaign_id,
  cou.ou_id,
  cou.name AS ou_name,
  cou.ou_type,
  cou.parent_ou_id,
  COALESCE(cou.is_group_container, false) AS is_group_container,
  cou.total_workers_estimated,
  counts.assigned_workers,
  counts.member_count,
  CASE
    WHEN COALESCE(counts.assigned_workers, 0) = 0 THEN NULL
    ELSE ROUND(counts.member_count::numeric / counts.assigned_workers, 3)
  END AS density,
  cov.leader_worker_id,
  lw.first_name || ' ' || lw.last_name AS leader_name,
  leader_rating.cumulative_rating AS leader_rating,
  cov.second_worker_id,
  sw.first_name || ' ' || sw.last_name AS second_name,
  cov.reachable_48h,
  cov.priority_action,
  CASE
    WHEN cov.leader_worker_id IS NULL THEN 'gap'
    WHEN cov.second_worker_id IS NULL THEN 'leader_no_second'
    ELSE 'covered'
  END AS coverage_status
FROM campaign_organising_units cou
LEFT JOIN campaign_ou_coverage cov ON cov.ou_id = cou.ou_id
LEFT JOIN workers lw ON lw.worker_id = cov.leader_worker_id
LEFT JOIN workers sw ON sw.worker_id = cov.second_worker_id
LEFT JOIN campaign_worker_rating_summary leader_rating
  ON leader_rating.campaign_id = cou.campaign_id
  AND leader_rating.worker_id = cov.leader_worker_id
LEFT JOIN LATERAL (
  SELECT
    COUNT(DISTINCT cwo.worker_id) AS assigned_workers,
    COUNT(DISTINCT cwo.worker_id) FILTER (
      WHERE umt.type_name IN ('financial_member', 'member_pending')
    ) AS member_count
  FROM campaign_worker_ou cwo
  JOIN workers w ON w.worker_id = cwo.worker_id
  LEFT JOIN union_membership_types umt
    ON umt.union_membership_type_id = w.union_membership_type_id
  WHERE cwo.ou_id = cou.ou_id
) counts ON TRUE;

COMMENT ON VIEW v_campaign_coverage_map IS
  'Coverage Map: per-OU worker/member counts, density, editable leader/'
  'second/48h layer and derived gap / leader_no_second / covered status. '
  'Group containers included (flagged) — coverage status is meaningful '
  'for leaf/child units.';

-- Tracker "Coverage summary" block, per campaign, over real (non-
-- container) units.
CREATE OR REPLACE VIEW v_campaign_coverage_summary
WITH (security_invoker = true) AS
SELECT
  m.campaign_id,
  COUNT(*) AS units_mapped,
  COUNT(*) FILTER (WHERE m.coverage_status = 'covered') AS units_covered,
  COUNT(*) FILTER (WHERE m.coverage_status = 'leader_no_second') AS units_leader_no_second,
  COUNT(*) FILTER (WHERE m.coverage_status = 'gap') AS units_gap,
  SUM(COALESCE(m.assigned_workers, 0)) AS workers_mapped,
  SUM(COALESCE(m.member_count, 0)) AS members,
  CASE
    WHEN SUM(COALESCE(m.assigned_workers, 0)) = 0 THEN NULL
    ELSE ROUND(SUM(COALESCE(m.member_count, 0))::numeric
               / SUM(COALESCE(m.assigned_workers, 0)), 3)
  END AS overall_density
FROM v_campaign_coverage_map m
WHERE m.is_group_container = false
GROUP BY m.campaign_id;

COMMENT ON VIEW v_campaign_coverage_summary IS
  'Per-campaign rollup of v_campaign_coverage_map over non-container units.';

-- WOC representation: for each WOC, every non-container unit in its
-- declared scope (scope_ou_id subtree ∪ woc_scope_units subtrees),
-- with whether at least one current member is assigned to it.
CREATE OR REPLACE VIEW v_woc_unit_representation
WITH (security_invoker = true) AS
WITH RECURSIVE scope AS (
  SELECT cw.woc_id, cw.scope_ou_id AS ou_id
  FROM campaign_wocs cw
  WHERE cw.scope_ou_id IS NOT NULL
  UNION
  SELECT wsu.woc_id, wsu.ou_id
  FROM woc_scope_units wsu
  UNION
  SELECT s.woc_id, child.ou_id
  FROM scope s
  JOIN campaign_organising_units child ON child.parent_ou_id = s.ou_id
)
SELECT
  s.woc_id,
  cw.campaign_id,
  s.ou_id,
  cou.name AS ou_name,
  cou.parent_ou_id,
  EXISTS (
    SELECT 1
    FROM woc_members m
    JOIN campaign_worker_ou cwo
      ON cwo.worker_id = m.worker_id AND cwo.ou_id = s.ou_id
    WHERE m.woc_id = s.woc_id AND m.left_on IS NULL
  ) AS represented,
  (
    SELECT COUNT(DISTINCT m.worker_id)
    FROM woc_members m
    JOIN campaign_worker_ou cwo
      ON cwo.worker_id = m.worker_id AND cwo.ou_id = s.ou_id
    WHERE m.woc_id = s.woc_id AND m.left_on IS NULL
  ) AS member_count
FROM scope s
JOIN campaign_wocs cw ON cw.woc_id = s.woc_id
JOIN campaign_organising_units cou ON cou.ou_id = s.ou_id
WHERE COALESCE(cou.is_group_container, false) = false;

COMMENT ON VIEW v_woc_unit_representation IS
  'Per-WOC, per-unit representation: a unit is represented when at least '
  'one current WOC member is assigned to it. Scope = scope_ou_id subtree '
  'plus woc_scope_units subtrees, non-container units only.';

GRANT SELECT ON v_campaign_activist_register TO authenticated;
GRANT SELECT ON v_campaign_coverage_map TO authenticated;
GRANT SELECT ON v_campaign_coverage_summary TO authenticated;
GRANT SELECT ON v_woc_unit_representation TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 9. Real calculate_active_wocs()
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION calculate_active_wocs(p_agreement_id INTEGER)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM campaign_wocs cw
  JOIN campaign_timelines ct ON ct.campaign_id = cw.campaign_id
  WHERE ct.agreement_id = p_agreement_id
    AND cw.status = 'active';
  RETURN COALESCE(v_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
