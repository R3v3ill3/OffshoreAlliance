-- Ambition-driven gates: extra fields on plan_ambitions (mirror OAPlanning)
ALTER TABLE plan_ambitions
  ADD COLUMN IF NOT EXISTS is_hard_gate BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS current_value VARCHAR,
  ADD COLUMN IF NOT EXISTS evidence_notes TEXT,
  ADD COLUMN IF NOT EXISTS metric_type VARCHAR,
  ADD COLUMN IF NOT EXISTS target_value_max VARCHAR,
  ADD COLUMN IF NOT EXISTS target_date_user_overridden BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_system_default BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN plan_ambitions.metric_type IS 'Override: percentage, count, boolean, date, range, text';
COMMENT ON COLUMN plan_ambitions.target_value_max IS 'Upper bound when metric_type is range';
