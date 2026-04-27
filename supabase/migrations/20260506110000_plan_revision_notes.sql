-- ============================================================
-- Phase 6 of campaigns review plan: lightweight revision audit
-- for active / completed stages.
--
-- The strategic plan is iterative — organisers refine ambitions,
-- shift dates, swap capacities mid-campaign. We don't want a full
-- versioning matrix on every plan_* table (that was an explicit
-- decision in the locked-decisions section), but we DO want a
-- written record when a stage that's already started gets edited:
-- what changed, why, and whether it pushes downstream stages out.
--
-- The UI (PlanRefinementDialog) prompts for these on edits to
-- stages with status = 'active' or 'completed'. Edits to draft
-- stages do not surface the prompt.
-- ============================================================

CREATE TABLE IF NOT EXISTS plan_revision_notes (
  revision_id SERIAL PRIMARY KEY,
  campaign_id INT NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  stage_number_affected INT NOT NULL CHECK (stage_number_affected BETWEEN 1 AND 6),
  revision_type VARCHAR(40) NOT NULL CHECK (revision_type IN (
    'schedule_change',
    'scope_change',
    'ambition_change',
    'capacity_change',
    'management_change',
    'where_to_play_change',
    'theory_change',
    'other'
  )),
  notes TEXT NOT NULL,
  triggers_downstream_shift BOOLEAN NOT NULL DEFAULT FALSE,
  revised_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  revised_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prn_campaign
  ON plan_revision_notes(campaign_id);
CREATE INDEX IF NOT EXISTS idx_prn_campaign_stage
  ON plan_revision_notes(campaign_id, stage_number_affected);
CREATE INDEX IF NOT EXISTS idx_prn_revised_at
  ON plan_revision_notes(revised_at DESC);

COMMENT ON TABLE plan_revision_notes IS
  'Phase 6: free-text audit trail of edits made to active or completed stages. Captures what changed and why; lightweight alternative to versioning every plan_* table.';

ALTER TABLE plan_revision_notes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN
    EXECUTE 'CREATE POLICY "Authenticated users can read plan_revision_notes" ON plan_revision_notes FOR SELECT TO authenticated USING (true)';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    EXECUTE 'CREATE POLICY "Admin/User can insert plan_revision_notes" ON plan_revision_notes FOR INSERT TO authenticated WITH CHECK (get_user_role() IN (''admin'',''user''))';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  -- Revisions are append-only by design — no UPDATE / DELETE policies.
  -- If you need to correct an entry, write a new one referencing the original.
END $$;
