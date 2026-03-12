-- Work roles and reporting hierarchy for user_profiles
ALTER TABLE user_profiles
  ADD COLUMN work_role VARCHAR(30)
    CHECK (work_role IN (
      'coordinator',
      'lead_organiser',
      'organiser',
      'industrial_officer',
      'industrial_coordinator',
      'specialist'
    )),
  ADD COLUMN reports_to UUID REFERENCES user_profiles(user_id);

-- Enhance agreement_organisers with primary flag and role distinction
ALTER TABLE agreement_organisers
  ADD COLUMN is_primary BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN agreement_role VARCHAR(20) NOT NULL DEFAULT 'organiser'
    CHECK (agreement_role IN ('organiser', 'lead', 'industrial_officer'));

-- Enforce at most one primary organiser per agreement
CREATE UNIQUE INDEX agreement_organisers_one_primary
  ON agreement_organisers (agreement_id)
  WHERE is_primary = true;
