-- ============================================================
-- Migration: Bargaining decision gate definitions
--
-- The existing gate_definitions table supports stage-gates 1–5
-- (CHECK gate_number BETWEEN 1 AND 5) for the Playing-to-Win
-- organising stages. Bargaining-to-Win stages 7–11 require
-- their own gate infrastructure with JSONB criteria.
--
-- This migration creates bargaining_gate_definitions and a
-- helper function to idempotently seed the two standard gates
-- for any campaign entering the bargaining_to_win phase:
--
--   Gate 9 (hard) — Strength Gate
--     Latest strength assessment must be 'strong' before
--     Stage 10 unlocks.
--
--   Gate 10 (hard) — Action Authorisation Gate
--     A PABO must be granted before PIA actions can commence.
-- ============================================================

CREATE TABLE IF NOT EXISTS bargaining_gate_definitions (
  gate_id           SERIAL PRIMARY KEY,
  campaign_id       INT NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  gate_number       INT NOT NULL,
  gate_name         VARCHAR NOT NULL,
  gate_type         VARCHAR NOT NULL DEFAULT 'hard' CHECK (gate_type IN ('hard','soft')),
  enforcement_stage INT NOT NULL,
  gate_criteria     JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (campaign_id, gate_number)
);

CREATE INDEX IF NOT EXISTS idx_bgd_campaign_id
  ON bargaining_gate_definitions(campaign_id);

COMMENT ON TABLE bargaining_gate_definitions IS
  'Stage-gate definitions for Bargaining-to-Win (stages 7–11). '
  'Extends the organising-stage gate model with JSONB criteria and '
  'an enforcement_stage pointer. Seeded via seed_bargaining_gates().';

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE bargaining_gate_definitions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN
    EXECUTE 'CREATE POLICY "Authenticated users can read bargaining_gate_definitions"
      ON bargaining_gate_definitions
      FOR SELECT TO authenticated
      USING (true)';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    EXECUTE 'CREATE POLICY "Admin/User can insert bargaining_gate_definitions"
      ON bargaining_gate_definitions
      FOR INSERT TO authenticated
      WITH CHECK (get_user_role() IN (''admin'',''user''))';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    EXECUTE 'CREATE POLICY "Admin/User can update bargaining_gate_definitions"
      ON bargaining_gate_definitions
      FOR UPDATE TO authenticated
      USING (get_user_role() IN (''admin'',''user''))
      WITH CHECK (get_user_role() IN (''admin'',''user''))';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    EXECUTE 'CREATE POLICY "Admin can delete bargaining_gate_definitions"
      ON bargaining_gate_definitions
      FOR DELETE TO authenticated
      USING (get_user_role() = ''admin'')';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- ============================================================
-- Function: seed_bargaining_gates(p_campaign_id INT)
--
-- Idempotently inserts the two standard bargaining gate rows
-- for a campaign. Safe to call multiple times — existing rows
-- (matched by campaign_id + gate_number) are left untouched.
-- ============================================================

CREATE OR REPLACE FUNCTION seed_bargaining_gates(p_campaign_id INT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Gate 9: Strength Gate (hard)
  INSERT INTO bargaining_gate_definitions (
    campaign_id,
    gate_number,
    gate_name,
    gate_type,
    enforcement_stage,
    gate_criteria
  )
  VALUES (
    p_campaign_id,
    9,
    'Stage 9 Strength Gate',
    'hard',
    9,
    '{"type": "strength_assessment", "required_outcome": "strong", "description": "Latest bargaining strength assessment must be ''strong'' before Stage 10 unlocks"}'::jsonb
  )
  ON CONFLICT (campaign_id, gate_number) DO NOTHING;

  -- Gate 10: Action Authorisation Gate (hard)
  INSERT INTO bargaining_gate_definitions (
    campaign_id,
    gate_number,
    gate_name,
    gate_type,
    enforcement_stage,
    gate_criteria
  )
  VALUES (
    p_campaign_id,
    10,
    'Stage 10 Action Authorisation Gate',
    'hard',
    10,
    '{"type": "pabo_status", "required_status": "granted", "description": "A PABO must be granted before PIA actions can commence"}'::jsonb
  )
  ON CONFLICT (campaign_id, gate_number) DO NOTHING;
END;
$$;

COMMENT ON FUNCTION seed_bargaining_gates(INT) IS
  'Idempotently seeds the two standard bargaining gate definitions '
  '(Stage 9 Strength Gate, Stage 10 Action Authorisation Gate) for a campaign. '
  'Call when a campaign enters the bargaining_to_win phase.';
