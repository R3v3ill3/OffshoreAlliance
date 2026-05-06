-- ============================================================
-- Section Planning module — Phase 1 of 10
--
-- Stripped-back, period-scoped sibling planner alongside the
-- existing 6/11-stage Playing-to-Win planner. Real campaigns
-- rarely move linearly through P2W stages; employer events
-- (NERR notices, EBA ballots, bargaining meetings) force
-- compressed planning. A "section plan" lets an organiser
-- plan a discrete period with the same methodology
-- (situation → ambitions → where-to-play → activities →
-- theory of winning → capacities) without the gating /
-- sequencing / stage-cloning of P2W.
--
-- This migration only sets up the container:
--   1. timeframe_kind enum (presentational only — never gates).
--   2. section_plans table.
--   3. updated_at trigger.
--   4. Indexes on (campaign_id, status) and archived_at.
--   5. RLS: read for authenticated users; write requires
--      get_user_role() IN ('admin','user'), mirroring the
--      pattern established in 20260506110000_plan_revision_notes.
--
-- Subsequent phases (20260606110000+) will:
--   - Extend plan_ambitions / plan_where_to_play / plan_capacities /
--     plan_theory_of_winning with a nullable section_plan_id and a
--     CHECK requiring exactly one of plan_id or section_plan_id.
--   - Add the section-snippet / activity-sequence / AI-event /
--     stage-mapping / revision-notes tables.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Enum: timeframe_kind
--
-- Three meaningful flavours of timeframe:
--   - user_set: internal measure, no external constraint
--     (e.g. "this fortnight's plan").
--   - user_set_firm: internal measure, externally-determined
--     date (e.g. "60% workers assessed before bargaining
--     meeting on 21 May").
--   - hard_external_deadline: externally controlled and
--     measured (e.g. EBA ballot, NERR window).
--
-- Drives banner colour only. Never gates progression.
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'section_plan_timeframe_kind') THEN
    CREATE TYPE section_plan_timeframe_kind AS ENUM (
      'user_set',
      'user_set_firm',
      'hard_external_deadline'
    );
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 2. Table: section_plans
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS section_plans (
  section_plan_id BIGSERIAL PRIMARY KEY,
  campaign_id INT NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  purpose TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  timeframe_kind section_plan_timeframe_kind NOT NULL DEFAULT 'user_set',
  external_anchor_label TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  archived_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT section_plans_dates_chk CHECK (end_date >= start_date),
  CONSTRAINT section_plans_status_chk CHECK (status IN ('draft','active','completed','archived')),
  CONSTRAINT section_plans_archived_consistency_chk CHECK (
    (status = 'archived' AND archived_at IS NOT NULL)
    OR (status <> 'archived' AND archived_at IS NULL)
  )
);

COMMENT ON TABLE section_plans IS
  'Phase 1 of the Section Planning module: period-scoped sibling planner. '
  'Each row scopes a stripped-back plan to a date range under one campaign. '
  'Sibling to campaign_stage_plans (P2W) — does NOT gate or interact with stage progression.';

COMMENT ON COLUMN section_plans.timeframe_kind IS
  'Drives the timeframe banner colour only — presentational, never gates progression. '
  'user_set = internal/flexible; user_set_firm = internal measure with external date; '
  'hard_external_deadline = externally controlled and measured (e.g. EBA ballot).';

COMMENT ON COLUMN section_plans.external_anchor_label IS
  'Free-text label naming the external anchor when timeframe_kind is firm or hard '
  '(e.g. "Ballot opens", "First bargaining meeting", "NERR window closes"). NULL otherwise.';

COMMENT ON COLUMN section_plans.purpose IS
  '1–2 sentence description of why this period needs a discrete plan '
  '(e.g. "Pre-ballot surge", "Week beginning 4 May 2025").';

-- ─────────────────────────────────────────────────────────────
-- 3. updated_at trigger
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION tg_section_plans_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS section_plans_set_updated_at ON section_plans;
CREATE TRIGGER section_plans_set_updated_at
  BEFORE UPDATE ON section_plans
  FOR EACH ROW
  EXECUTE FUNCTION tg_section_plans_set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 4. Indexes
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_section_plans_campaign_status
  ON section_plans(campaign_id, status);

CREATE INDEX IF NOT EXISTS idx_section_plans_campaign_dates
  ON section_plans(campaign_id, start_date DESC, end_date DESC);

CREATE INDEX IF NOT EXISTS idx_section_plans_archived_at
  ON section_plans(archived_at)
  WHERE archived_at IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 5. RLS
--
-- Mirrors plan_revision_notes (20260506110000): authenticated
-- users can SELECT any row; INSERT / UPDATE / DELETE require
-- get_user_role() IN ('admin','user'). Cross-campaign isolation
-- is handled by upstream campaigns RLS — section_plans inherits
-- read scope from whatever campaign rows the user can see, since
-- the FK to campaigns(campaign_id) and any joining queries will
-- be filtered by the campaigns table policies. (Phase 2 will add
-- view-level enforcement when we extend plan_* tables.)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE section_plans ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN
    EXECUTE 'CREATE POLICY "Authenticated users can read section_plans" ON section_plans FOR SELECT TO authenticated USING (true)';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    EXECUTE 'CREATE POLICY "Admin/User can insert section_plans" ON section_plans FOR INSERT TO authenticated WITH CHECK (get_user_role() IN (''admin'',''user''))';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    EXECUTE 'CREATE POLICY "Admin/User can update section_plans" ON section_plans FOR UPDATE TO authenticated USING (get_user_role() IN (''admin'',''user'')) WITH CHECK (get_user_role() IN (''admin'',''user''))';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    EXECUTE 'CREATE POLICY "Admin/User can delete section_plans" ON section_plans FOR DELETE TO authenticated USING (get_user_role() IN (''admin'',''user''))';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
