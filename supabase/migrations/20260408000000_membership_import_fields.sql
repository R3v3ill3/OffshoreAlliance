-- Add fields required by the monthly membership import wizard.

ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS reference_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS rejoin_date DATE,
  ADD COLUMN IF NOT EXISTS resignation_reason TEXT;

-- Unique partial index so reference_id collisions are caught at DB level.
CREATE UNIQUE INDEX IF NOT EXISTS workers_reference_id_unique
  ON workers (reference_id) WHERE reference_id IS NOT NULL;
