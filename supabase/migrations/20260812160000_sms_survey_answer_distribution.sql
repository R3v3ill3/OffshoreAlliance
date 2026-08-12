-- ============================================================
-- SMS survey visual report: answer distribution + live updates.
--
--   1. vw_sms_survey_answer_distribution — aggregate answer counts
--      per (question, parsed_value). Aggregate only, no worker ids
--      and no raw bodies, so it carries the same privacy class as
--      vw_sms_ballot_tally and is safe to read for restricted
--      ballots. Two counts are exposed: every session that answered
--      (the survey reading — a partial response still tells you
--      what that member said) and completed sessions only (the
--      ballot reading — an abandoned half-vote is not a vote).
--      open_text is excluded: free-text values are unbounded and
--      belong in the CSV export, not a pie chart.
--   2. Realtime: sessions + answers added to the supabase_realtime
--      publication so the visual dashboard can invalidate on change
--      instead of polling hard.
-- ============================================================

CREATE OR REPLACE VIEW vw_sms_survey_answer_distribution AS
SELECT
  q.survey_id,
  q.question_id,
  q.sort_order,
  q.qtype,
  a.parsed_value,
  COUNT(*)::INT AS answer_count,
  COUNT(*) FILTER (WHERE ss.state = 'completed')::INT AS completed_answer_count
FROM sms_survey_questions q
JOIN sms_survey_answers a
  ON a.question_id = q.question_id
 AND a.parsed_value IS NOT NULL
JOIN sms_survey_sessions ss
  ON ss.session_id = a.session_id
WHERE q.qtype <> 'open_text'
GROUP BY q.survey_id, q.question_id, q.sort_order, q.qtype, a.parsed_value;

GRANT SELECT ON vw_sms_survey_answer_distribution TO authenticated;

COMMENT ON VIEW vw_sms_survey_answer_distribution IS
  'Aggregate answer counts per (question, parsed_value) for the '
  'visual survey report. answer_count = every session that '
  'answered (survey reading); completed_answer_count = completed '
  'sessions only (ballot reading). No worker ids, no raw bodies — '
  'same privacy class as vw_sms_ballot_tally. Excludes open_text.';

-- Answers are looked up by (question_id, session_id) when building
-- the distribution; the existing idx_ssa_question covers the join
-- side, this covers the session side of the same read.
CREATE INDEX IF NOT EXISTS idx_ssa_session
  ON sms_survey_answers(session_id);

-- Live dashboard: without these the subscriptions are silent
-- no-ops and the poll interval still keeps the report fresh.
-- Tolerates an absent publication (CI shadow DB) and re-runs.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE sms_survey_sessions;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE sms_survey_answers;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
