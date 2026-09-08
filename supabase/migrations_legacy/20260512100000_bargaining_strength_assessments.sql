-- ============================================================
-- Migration: Bargaining strength assessments
--
-- Captures point-in-time snapshots of bargaining strength for
-- a campaign. Each assessment is IMMUTABLE (append-only) — no
-- updated_at column; new assessments add new rows.
--
-- The companion view v_strength_assessment_inputs aggregates
-- live worker rating counts and ambition progress so the UI can
-- pre-populate the capture form without manual data entry.
-- ============================================================

CREATE TABLE IF NOT EXISTS bargaining_strength_assessments (
  assessment_id        SERIAL PRIMARY KEY,
  campaign_id          INT NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  assessed_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Worker count breakdown at capture time
  eligible_count         INT,
  supportive_leader_count INT,
  supporter_count        INT,
  neutral_count          INT,
  opposed_count          INT,
  oppositional_count     INT,
  unassessed_count       INT,

  -- Derived percentages at capture time
  percent_strike_ready   NUMERIC(5,2),
  percent_paid_membership NUMERIC(5,2),

  -- Free-form readiness criteria as JSONB (arbitrary checklist items)
  readiness_criteria   JSONB,

  notes  TEXT,
  outcome TEXT CHECK (outcome IN ('strong','weak','unclear')),

  created_by UUID REFERENCES auth.users(id)
  -- IMMUTABLE: no updated_at; new assessments append rows
);

CREATE INDEX IF NOT EXISTS idx_bsa_campaign_id
  ON bargaining_strength_assessments(campaign_id);

CREATE INDEX IF NOT EXISTS idx_bsa_campaign_assessed_at
  ON bargaining_strength_assessments(campaign_id, assessed_at DESC);

COMMENT ON TABLE bargaining_strength_assessments IS
  'Point-in-time bargaining strength snapshots. Append-only — no UPDATE/DELETE. '
  'Each capture records worker rating distribution and a strong/weak/unclear declaration.';

-- ============================================================
-- View: v_strength_assessment_inputs
--
-- Aggregates live inputs for the strength snapshot form:
--   * worker rating counts from campaign_worker_rating_summary
--   * ambition progress rollup from ambition_progress
-- One row per campaign. Security-invoker so RLS is inherited.
-- ============================================================

CREATE OR REPLACE VIEW v_strength_assessment_inputs
WITH (security_invoker = true)
AS
WITH rating_counts AS (
  SELECT
    campaign_id,
    COUNT(*)                                                         AS eligible_count,
    COUNT(*) FILTER (WHERE cumulative_rating = 1)                    AS supportive_leader_count,
    COUNT(*) FILTER (WHERE cumulative_rating = 2)                    AS supporter_count,
    COUNT(*) FILTER (WHERE cumulative_rating = 3)                    AS neutral_count,
    COUNT(*) FILTER (WHERE cumulative_rating = 4)                    AS opposed_count,
    COUNT(*) FILTER (WHERE cumulative_rating = 5)                    AS oppositional_count,
    COUNT(*) FILTER (WHERE cumulative_rating IS NULL)                 AS unassessed_count
  FROM campaign_worker_rating_summary
  GROUP BY campaign_id
),
ambition_agg AS (
  SELECT
    campaign_id,
    SUM(universe)                                                    AS total_ambition_universe,
    SUM(supportive)                                                  AS total_supportive,
    SUM(unassessed)                                                  AS total_unassessed,
    CASE
      WHEN SUM(universe) > 0
      THEN ROUND(100.0 * SUM(supportive) / SUM(universe), 1)
      ELSE 0
    END                                                              AS overall_supportive_pct
  FROM ambition_progress
  GROUP BY campaign_id
)
SELECT
  rc.campaign_id,
  rc.eligible_count,
  rc.supportive_leader_count,
  rc.supporter_count,
  rc.neutral_count,
  rc.opposed_count,
  rc.oppositional_count,
  rc.unassessed_count,
  aa.total_ambition_universe,
  aa.total_supportive,
  aa.total_unassessed,
  aa.overall_supportive_pct
FROM rating_counts rc
LEFT JOIN ambition_agg aa USING (campaign_id);

GRANT SELECT ON v_strength_assessment_inputs TO authenticated;

COMMENT ON VIEW v_strength_assessment_inputs IS
  'Live pre-population data for the bargaining strength capture form. '
  'Aggregates worker rating counts from campaign_worker_rating_summary '
  'and ambition progress from ambition_progress. Security-invoker so RLS is inherited.';

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE bargaining_strength_assessments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN
    EXECUTE 'CREATE POLICY "Authenticated users can read bargaining_strength_assessments"
      ON bargaining_strength_assessments
      FOR SELECT TO authenticated
      USING (true)';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    EXECUTE 'CREATE POLICY "Admin/User can insert bargaining_strength_assessments"
      ON bargaining_strength_assessments
      FOR INSERT TO authenticated
      WITH CHECK (get_user_role() IN (''admin'',''user''))';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  -- IMMUTABLE: no UPDATE or DELETE policies
END $$;
