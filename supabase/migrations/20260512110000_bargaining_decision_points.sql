-- ============================================================
-- Migration: Bargaining decision points
--
-- Records the key decision moments in a bargaining campaign —
-- when a scenario arises (good offer / drags on / employer
-- launches proposal), what the member vote was, what the
-- strength assessment said, and how it was resolved.
-- ============================================================

CREATE TABLE IF NOT EXISTS bargaining_decision_points (
  decision_id          SERIAL PRIMARY KEY,
  campaign_id          INT NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  triggered_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Which of the three bargaining scenarios triggered this decision
  scenario TEXT CHECK (scenario IN (
    'good_offer',
    'drags_on',
    'employer_launches_proposal'
  )),

  -- Result of any member vote at the time of the decision
  member_vote_outcome TEXT CHECK (member_vote_outcome IN (
    'yes',
    'no',
    'not_yet',
    'n_a'
  )),

  -- FK to the strength assessment used to inform this decision
  strength_assessment_id INT REFERENCES bargaining_strength_assessments(assessment_id),

  -- Strength outcome at decision time (may differ from assessment.outcome
  -- if overridden or if no formal assessment was done)
  strength_outcome TEXT CHECK (strength_outcome IN (
    'strong',
    'weak',
    'unclear',
    'n_a'
  )),

  -- How the decision was resolved
  resolution TEXT CHECK (resolution IN (
    'settled',
    'route_to_pabo',
    'route_to_capacity_building',
    'route_to_ratification',
    'pending'
  )),

  notes       TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bdp_campaign_id
  ON bargaining_decision_points(campaign_id);

CREATE INDEX IF NOT EXISTS idx_bdp_campaign_triggered_at
  ON bargaining_decision_points(campaign_id, triggered_at DESC);

COMMENT ON TABLE bargaining_decision_points IS
  'Chronological log of key bargaining decision moments. Each row captures '
  'the scenario, member vote outcome, associated strength assessment, and '
  'how the decision was resolved (settled, PABO, capacity building, ratification, pending).';

COMMENT ON COLUMN bargaining_decision_points.scenario IS
  'Triggering scenario: good_offer / drags_on / employer_launches_proposal.';

COMMENT ON COLUMN bargaining_decision_points.strength_assessment_id IS
  'Optional FK to the bargaining_strength_assessments row used at decision time.';

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE bargaining_decision_points ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN
    EXECUTE 'CREATE POLICY "Authenticated users can read bargaining_decision_points"
      ON bargaining_decision_points
      FOR SELECT TO authenticated
      USING (true)';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    EXECUTE 'CREATE POLICY "Admin/User can insert bargaining_decision_points"
      ON bargaining_decision_points
      FOR INSERT TO authenticated
      WITH CHECK (get_user_role() IN (''admin'',''user''))';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    EXECUTE 'CREATE POLICY "Admin/User can update bargaining_decision_points"
      ON bargaining_decision_points
      FOR UPDATE TO authenticated
      USING (get_user_role() IN (''admin'',''user''))
      WITH CHECK (get_user_role() IN (''admin'',''user''))';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    EXECUTE 'CREATE POLICY "Admin can delete bargaining_decision_points"
      ON bargaining_decision_points
      FOR DELETE TO authenticated
      USING (get_user_role() = ''admin'')';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
