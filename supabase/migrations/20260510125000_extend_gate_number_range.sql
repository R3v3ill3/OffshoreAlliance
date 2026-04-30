-- Extend gate_definitions gate_number CHECK from 1-5 to 1-10
-- Required for Phase 2 bargaining gates (9 = Strength Gate, 10 = PABO Authorisation Gate)

DO $$
BEGIN
  -- Drop old constraint if it exists
  ALTER TABLE gate_definitions DROP CONSTRAINT IF EXISTS gate_definitions_gate_number_check;
  -- Add new constraint allowing 1-10
  ALTER TABLE gate_definitions ADD CONSTRAINT gate_definitions_gate_number_check
    CHECK (gate_number BETWEEN 1 AND 10);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not update gate_number constraint: %', SQLERRM;
END;
$$;
