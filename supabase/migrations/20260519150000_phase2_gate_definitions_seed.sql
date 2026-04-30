-- ============================================================
-- Migration: Phase 2 gate definitions seed
--
-- Extends gate_definitions to support global (campaign-agnostic)
-- template gate rows for Bargaining-to-Win stages 7–11, then
-- seeds four template gate definitions.
--
-- Schema changes:
--   • Make campaign_id nullable (existing rows unaffected — they
--     retain their campaign_id value).
--   • Add stage_number INT column (nullable; used by global rows).
--   • Add name VARCHAR column (alias for gate_name; global rows
--     populate name instead of gate_name).
--   • Add description TEXT column.
--   • Add gate_type VARCHAR column (mirrors enforcement_type;
--     global rows use 'hard' / 'soft').
--   • Add partial unique index on (stage_number, gate_number)
--     WHERE campaign_id IS NULL for idempotent seeding.
--
-- Seed rows (global template — campaign_id IS NULL):
--   Stage 7 / Gate 7  — Bargaining Commenced (hard)
--   Stage 7 / Gate 8  — Situation Analysis Updated (soft)
--   Stage 9 / Gate 9  — Strength Assessment (hard)
--   Stage 10 / Gate 10 — PABO Authorisation (hard)
-- ============================================================

-- ── 1. Schema extensions ──────────────────────────────────────────────────────

-- Allow campaign_id to be NULL (for global template rows).
ALTER TABLE gate_definitions
  ALTER COLUMN campaign_id DROP NOT NULL;

-- Add stage_number — used by template rows to indicate which B2W stage.
ALTER TABLE gate_definitions
  ADD COLUMN IF NOT EXISTS stage_number INTEGER;

-- Add human-readable name column for template rows.
ALTER TABLE gate_definitions
  ADD COLUMN IF NOT EXISTS name VARCHAR;

-- Add long-form description.
ALTER TABLE gate_definitions
  ADD COLUMN IF NOT EXISTS description TEXT;

-- Add gate_type column (hard / soft) — parallel to enforcement_type.
ALTER TABLE gate_definitions
  ADD COLUMN IF NOT EXISTS gate_type VARCHAR
    CHECK (gate_type IN ('hard', 'soft'));

-- ── 2. Partial unique index for template rows ─────────────────────────────────

-- Enables ON CONFLICT (stage_number, gate_number) WHERE campaign_id IS NULL.
CREATE UNIQUE INDEX IF NOT EXISTS idx_gate_definitions_template_stage_gate
  ON gate_definitions (stage_number, gate_number)
  WHERE campaign_id IS NULL;

-- ── 3. Seed Phase 2 template gate definitions ─────────────────────────────────

-- Stage 7 / Gate 7 — Bargaining Commenced (hard)
INSERT INTO gate_definitions (stage_number, gate_number, gate_type, name, description)
VALUES (
  7,
  7,
  'hard',
  'Bargaining Commenced',
  'Bargaining formally commenced and bargaining commencement date recorded'
)
ON CONFLICT (stage_number, gate_number)
  WHERE campaign_id IS NULL
  DO NOTHING;

-- Stage 7 / Gate 8 — Situation Analysis Updated (soft)
INSERT INTO gate_definitions (stage_number, gate_number, gate_type, name, description)
VALUES (
  7,
  8,
  'soft',
  'Situation Analysis Updated',
  'Situation analysis updated with current bargaining context, NERR status, and employer behaviour assessment'
)
ON CONFLICT (stage_number, gate_number)
  WHERE campaign_id IS NULL
  DO NOTHING;

-- Stage 9 / Gate 9 — Strength Assessment (hard)
INSERT INTO gate_definitions (stage_number, gate_number, gate_type, name, description)
VALUES (
  9,
  9,
  'hard',
  'Strength Assessment',
  'Minimum one bargaining strength assessment completed with strength verdict recorded'
)
ON CONFLICT (stage_number, gate_number)
  WHERE campaign_id IS NULL
  DO NOTHING;

-- Stage 10 / Gate 10 — PABO Authorisation (hard)
INSERT INTO gate_definitions (stage_number, gate_number, gate_type, name, description)
VALUES (
  10,
  10,
  'hard',
  'PABO Authorisation',
  'PABO application granted by Fair Work Commission'
)
ON CONFLICT (stage_number, gate_number)
  WHERE campaign_id IS NULL
  DO NOTHING;

COMMENT ON COLUMN gate_definitions.stage_number IS
  'Stage number (1–11) this gate belongs to. Populated for global template rows (campaign_id IS NULL).';
COMMENT ON COLUMN gate_definitions.name IS
  'Human-readable gate name for template rows. Campaign-specific rows use gate_name.';
COMMENT ON COLUMN gate_definitions.description IS
  'Description of what this gate requires, for display in the UI.';
COMMENT ON COLUMN gate_definitions.gate_type IS
  'Gate enforcement type for template rows: hard (blocks progression) or soft (advisory).';
