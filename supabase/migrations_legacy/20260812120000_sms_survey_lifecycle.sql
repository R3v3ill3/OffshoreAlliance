-- SMS survey lifecycle: test flag, pause modes, archive, definition versions.
-- Supports pause/edit/resume, promote-to-launch, and versioned question snapshots.

-- ─────────────────────────────────────────────────────────────
-- 1. sms_surveys columns + status
-- ─────────────────────────────────────────────────────────────

ALTER TABLE sms_surveys
  DROP CONSTRAINT IF EXISTS sms_surveys_status_check;

ALTER TABLE sms_surveys
  ADD CONSTRAINT sms_surveys_status_check
  CHECK (status IN ('draft', 'open', 'paused', 'closed'));

ALTER TABLE sms_surveys
  ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pause_mode VARCHAR(10)
    CHECK (pause_mode IS NULL OR pause_mode IN ('soft', 'hard')),
  ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

COMMENT ON COLUMN sms_surveys.is_test IS
  'True for trusted-group test surveys (default). Promote clones to a non-test launch survey.';
COMMENT ON COLUMN sms_surveys.pause_mode IS
  'soft = hold prompts but accept answers; hard = hold prompts and freeze inbound.';

CREATE INDEX IF NOT EXISTS idx_ssurveys_status_open_paused
  ON sms_surveys(status) WHERE status IN ('open', 'paused');

-- ─────────────────────────────────────────────────────────────
-- 2. Definition version snapshots (sessions pin survey_version)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sms_survey_definition_versions (
  survey_id INTEGER NOT NULL REFERENCES sms_surveys(survey_id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  questions JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (survey_id, version)
);

ALTER TABLE sms_survey_definition_versions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN EXECUTE 'CREATE POLICY "Authenticated read sms_survey_definition_versions"
    ON sms_survey_definition_versions FOR SELECT TO authenticated USING (true)';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

GRANT SELECT ON sms_survey_definition_versions TO authenticated;
-- Writes are service-role only (open / paused-edit paths).

COMMENT ON TABLE sms_survey_definition_versions IS
  'Immutable question snapshots keyed by survey version; live sessions load by survey_version.';

-- Soft-retire questions that already have answers when an edit removes them
-- (hard DELETE would CASCADE-wipe answers).
ALTER TABLE sms_survey_questions
  ADD COLUMN IF NOT EXISTS retired_at TIMESTAMPTZ;

COMMENT ON COLUMN sms_survey_questions.retired_at IS
  'Set when a post-open edit removes a question that already has answers; excluded from live prompts.';

-- Backfill version 1 snapshots for already-open/closed surveys that have questions.
INSERT INTO sms_survey_definition_versions (survey_id, version, questions)
SELECT
  s.survey_id,
  s.version,
  COALESCE(
    (
      SELECT jsonb_agg(to_jsonb(q) ORDER BY q.sort_order, q.question_id)
      FROM sms_survey_questions q
      WHERE q.survey_id = s.survey_id
    ),
    '[]'::jsonb
  )
FROM sms_surveys s
WHERE s.status IN ('open', 'closed', 'paused')
ON CONFLICT DO NOTHING;

-- Pre-lifecycle surveys that already launched were real sends, not tests.
UPDATE sms_surveys
SET is_test = false
WHERE status IN ('open', 'closed')
  AND opened_at IS NOT NULL;
