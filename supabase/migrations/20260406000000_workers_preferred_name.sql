-- Add preferred_name (nickname/known-as) to workers.
-- Populated via import wizard from parenthetical in full name or dedicated spreadsheet column.
ALTER TABLE workers ADD COLUMN IF NOT EXISTS preferred_name VARCHAR(100);
