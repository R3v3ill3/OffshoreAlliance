-- Phase 9 (audience building): extend workers.sms_consent_source CHECK
-- to allow 'sms_manual_entry' and 'sms_import' alongside the existing
-- 'import', 'manual', 'legacy' values.

ALTER TABLE workers
  DROP CONSTRAINT IF EXISTS workers_sms_consent_source_check;

ALTER TABLE workers
  ADD CONSTRAINT workers_sms_consent_source_check
  CHECK (
    sms_consent_source IS NULL
    OR sms_consent_source IN (
      'import',
      'manual',
      'legacy',
      'sms_manual_entry',
      'sms_import'
    )
  );

COMMENT ON COLUMN workers.sms_consent_source IS
  'How SMS consent was established. Values: import (bulk worker import), '
  'manual (wall-chart create-worker), legacy (pre-SMS-module backfill), '
  'sms_manual_entry (AudiencePicker manual add, Phase 9), '
  'sms_import (AudiencePicker CSV/XLSX import, Phase 9).';
