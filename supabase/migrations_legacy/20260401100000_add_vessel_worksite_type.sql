-- Add 'Vessel' to the worksite_type CHECK constraint
ALTER TABLE worksites
  DROP CONSTRAINT IF EXISTS worksites_worksite_type_check;

ALTER TABLE worksites
  ADD CONSTRAINT worksites_worksite_type_check
  CHECK (worksite_type IN (
    'FPSO', 'FPU', 'FLNG', 'Platform', 'Onshore_LNG', 'Gas_Plant',
    'Vessel', 'Drill_Centre', 'Region', 'Heliport', 'Pipeline',
    'Airfield', 'Onshore_Facilities', 'CPF', 'Gas_Field', 'Other'
  ));
