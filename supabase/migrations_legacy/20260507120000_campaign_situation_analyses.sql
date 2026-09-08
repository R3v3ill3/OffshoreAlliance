-- ============================================================
-- Situation Analysis: structured campaign context that sits
-- between the wizard universe (employers/worksites/units/workers)
-- and ambition setting.
--
-- Captures four blocks (mirroring the SOC Field Guide §2 strategic
-- context structure):
--   1. State of play   — employer interaction state, ballot history
--   2. Forces/terrain  — top issues with heat, workforce changes,
--                        inter-employer relationships, HR posture,
--                        workforce union history
--   3. Predicted moves — company playbook, used as feedstock for
--                        downstream inoculation lines
--   4. Leverage        — vote arithmetic, regulatory window, timing
--
-- The analysis is auto-injected into existing AI features (Theory
-- of Winning, comms drafts, phone/email wizards) so predicted
-- employer playbook moves become inoculation items, top issues
-- become agitation hooks, and population segmentation drives
-- audience pacing — the explicit SOC pay-off.
--
-- Versioned (one row per (campaign, version), one current row per
-- campaign) so the analysis can be refreshed mid-campaign without
-- losing history. Append-only revisions table mirrors
-- plan_revision_notes.
-- ============================================================

CREATE TABLE IF NOT EXISTS campaign_situation_analyses (
  situation_id SERIAL PRIMARY KEY,
  campaign_id INT NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  version INT NOT NULL DEFAULT 1,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,

  -- ── 1. State of play ──────────────────────────────────────
  -- Closed vocabulary (mirrored in
  -- apps/organising-db/src/lib/situation-analysis/constants.ts).
  -- 'agreement_balloted' uses balloted_count; 'other' uses
  -- employer_state_notes for the free-text describe.
  employer_interaction_state VARCHAR(40)
    CHECK (employer_interaction_state IN (
      'no_engagement',
      'preemptive_setup',
      'bargaining_underway',
      'agreement_balloted',
      'employer_delaying',
      'industrial_action_phase',
      'post_settlement',
      'other'
    )),
  employer_state_notes TEXT,
  balloted_count INT,

  -- ── 2. Forces / terrain ───────────────────────────────────
  -- top_issues:                  [{label, heat (1..5), notes}]
  -- upcoming_workforce_changes:  [{event_type, label, expected_date, scale, notes}]
  -- employer_relationships:      [{related_employer_id, relationship_type, recent_behaviour, notes}]
  -- hr_posture:                  {sentiment, contacts:[{name, role, posture, notes}], notes}
  -- union_history:               {prior_eba_count, prior_ballot_outcomes, prior_campaigns, delegate_structure, notes}
  top_issues JSONB NOT NULL DEFAULT '[]'::jsonb,
  upcoming_workforce_changes JSONB NOT NULL DEFAULT '[]'::jsonb,
  employer_relationships JSONB NOT NULL DEFAULT '[]'::jsonb,
  hr_posture JSONB NOT NULL DEFAULT '{}'::jsonb,
  union_history JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- ── 3. Predicted moves + 4. Leverage (narrative blocks) ───
  -- Populated either by hand or by the AI assist (Phase 2/3).
  -- company_playbook:        [{move, why, disruption_point}]
  -- workforce_populations:   [{name, approx_size, source_of_evidence, soc_emphasis}]
  -- leverage_and_maths:      {timing_constraints, vote_arithmetic, regulatory_window}
  -- information_gaps:        [{question, why_it_matters}]
  strategic_context_summary TEXT,
  company_playbook JSONB NOT NULL DEFAULT '[]'::jsonb,
  workforce_populations JSONB NOT NULL DEFAULT '[]'::jsonb,
  leverage_and_maths JSONB NOT NULL DEFAULT '{}'::jsonb,
  information_gaps JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- ── Audit ─────────────────────────────────────────────────
  ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
  ai_model VARCHAR(80),
  ai_prompt_snapshot JSONB,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (campaign_id, version)
);

CREATE INDEX IF NOT EXISTS idx_csa_campaign
  ON campaign_situation_analyses(campaign_id);

-- One current row per campaign — partial unique index.
CREATE UNIQUE INDEX IF NOT EXISTS idx_csa_campaign_current
  ON campaign_situation_analyses(campaign_id)
  WHERE is_current;

CREATE OR REPLACE TRIGGER trg_csa_updated_at
  BEFORE UPDATE ON campaign_situation_analyses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE campaign_situation_analyses IS
  'Structured campaign situation analysis (SOC Field Guide §2 structure). One current row per campaign; older versions retained for history. Auto-injected into Theory of Winning + comms drafts so predicted employer moves become inoculation lines and top issues become agitation hooks.';

COMMENT ON COLUMN campaign_situation_analyses.is_current IS
  'TRUE for the active version; older versions are kept for history. Enforced unique by partial index idx_csa_campaign_current.';

COMMENT ON COLUMN campaign_situation_analyses.top_issues IS
  'JSONB array of {label, heat (1..5), notes}. Heat is organiser-assessed.';

COMMENT ON COLUMN campaign_situation_analyses.company_playbook IS
  'Predicted employer moves [{move, why, disruption_point}]. Feeds inoculation copy in downstream comms drafts.';

COMMENT ON COLUMN campaign_situation_analyses.information_gaps IS
  'AI guardrail output: facts the model declined to invent. Surface to the organiser for follow-up.';

-- ============================================================
-- Append-only revisions audit (mirrors plan_revision_notes
-- from 20260506110000_plan_revision_notes.sql).
-- ============================================================

CREATE TABLE IF NOT EXISTS campaign_situation_revisions (
  revision_id SERIAL PRIMARY KEY,
  situation_id INT NOT NULL REFERENCES campaign_situation_analyses(situation_id) ON DELETE CASCADE,
  campaign_id INT NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  revision_type VARCHAR(40) NOT NULL CHECK (revision_type IN (
    'survey_update',
    'narrative_edit',
    'ai_apply',
    'version_bump',
    'other'
  )),
  diff JSONB,
  notes TEXT,
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_csr_situation
  ON campaign_situation_revisions(situation_id);
CREATE INDEX IF NOT EXISTS idx_csr_campaign
  ON campaign_situation_revisions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_csr_changed_at
  ON campaign_situation_revisions(changed_at DESC);

COMMENT ON TABLE campaign_situation_revisions IS
  'Append-only audit of edits to campaign_situation_analyses. Lightweight alternative to versioning every JSONB field.';

-- ============================================================
-- RLS — same pattern as other campaign_* tables (campaign_ambitions,
-- plan_revision_notes). All authenticated users can read; admins +
-- writers can insert/update; only admins can delete.
-- ============================================================

ALTER TABLE campaign_situation_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_situation_revisions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN
    EXECUTE 'CREATE POLICY "Authenticated users can read campaign_situation_analyses" ON campaign_situation_analyses FOR SELECT TO authenticated USING (true)';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    EXECUTE 'CREATE POLICY "Admin/User can insert campaign_situation_analyses" ON campaign_situation_analyses FOR INSERT TO authenticated WITH CHECK (get_user_role() IN (''admin'',''user''))';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    EXECUTE 'CREATE POLICY "Admin/User can update campaign_situation_analyses" ON campaign_situation_analyses FOR UPDATE TO authenticated USING (get_user_role() IN (''admin'',''user'')) WITH CHECK (get_user_role() IN (''admin'',''user''))';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    EXECUTE 'CREATE POLICY "Admin can delete campaign_situation_analyses" ON campaign_situation_analyses FOR DELETE TO authenticated USING (get_user_role() = ''admin'')';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    EXECUTE 'CREATE POLICY "Authenticated users can read campaign_situation_revisions" ON campaign_situation_revisions FOR SELECT TO authenticated USING (true)';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    EXECUTE 'CREATE POLICY "Admin/User can insert campaign_situation_revisions" ON campaign_situation_revisions FOR INSERT TO authenticated WITH CHECK (get_user_role() IN (''admin'',''user''))';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  -- Revisions are append-only — no UPDATE / DELETE policies.
END $$;
