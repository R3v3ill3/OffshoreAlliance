-- Add vessel sub-types to the worksite_type CHECK constraint.
--
-- Offshore member lists distinguish supply vessels, accommodation vessels and a
-- catch-all "vessel - other" beyond the generic 'Vessel'. These let the worksite
-- "Type" field (and the campaign-list import) classify OSVs accurately.
ALTER TABLE worksites
  DROP CONSTRAINT IF EXISTS worksites_worksite_type_check;

ALTER TABLE worksites
  ADD CONSTRAINT worksites_worksite_type_check
  CHECK (worksite_type IN (
    'FPSO', 'FPU', 'FLNG', 'Platform', 'Onshore_LNG', 'Gas_Plant',
    'Vessel', 'Supply_Vessel', 'Accommodation_Vessel', 'Vessel_Other',
    'Drill_Centre', 'Region', 'Heliport', 'Pipeline',
    'Airfield', 'Onshore_Facilities', 'CPF', 'Gas_Field', 'Other'
  ));
