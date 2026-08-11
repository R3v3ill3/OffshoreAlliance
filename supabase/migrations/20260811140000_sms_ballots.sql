-- ============================================================
-- SMS module — Phase 5 (indicative ballot mode, brief §4.2/§8.1)
--
-- A ballot IS a survey (purpose = 'indicative_ballot') riding the
-- Phase 4 session machinery, plus integrity extras:
--
--   1. sms_surveys ballot columns —
--      revote_policy: 'locked' (default, §8.1 — "your vote is
--        already recorded") vs 'revote_until_close' (last response
--        wins, supersessions logged);
--      receipt_salt: per-ballot salt for the completion receipt
--        hash (sha256(salt|worker|ordered answers) → short code,
--        recomputed on read, NEVER stored);
--      results_restricted: when true the UI renders no per-member
--        answer surface — vw_sms_ballot_tally is the only
--        reporting surface.
--   2. sms_ballot_roll — the eligibility roll frozen at open
--      (§4.2 "roll first"): exactly the invited audience after
--      consent/phone screening. Turnout reports against this.
--   3. sms_ballot_events — APPEND-ONLY audit log (§4.2): roll
--      frozen, invitations, votes received/superseded/rejected,
--      receipts, open/close, tally. Enforced by grants
--      (authenticated: SELECT only; all inserts service-role).
--      Deliberately NOT a block-update trigger — that would also
--      break the legitimate campaign → surveys → events delete
--      cascade.
--   4. vw_sms_ballot_tally — aggregate vote counts per
--      (question, parsed_value) over COMPLETED sessions only
--      (an abandoned half-vote is not a vote). No worker ids.
--
-- Confidentiality (brief §4.2, accepted §8.1): CONFIDENTIAL, NOT
-- ANONYMOUS. Vote choices live in sms_survey_answers keyed
-- session→worker (and in the member's own SMS history — SMS is
-- not receipt-free). sms_survey_answers RLS stays read USING
-- (true) for authenticated: true choice-level read restriction
-- requires an audit-role model the app does not have. What this
-- phase enforces: the UI/API never render per-member choices for
-- restricted ballots, and event payloads for vote_received /
-- receipt_sent carry neither choices nor receipt codes (a code
-- stored beside worker_id would let staff map code → member,
-- defeating self-verification).
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. sms_surveys ballot columns
-- ─────────────────────────────────────────────────────────────

ALTER TABLE sms_surveys
  ADD COLUMN IF NOT EXISTS revote_policy VARCHAR(20) NOT NULL DEFAULT 'locked';
ALTER TABLE sms_surveys
  ADD COLUMN IF NOT EXISTS receipt_salt UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE sms_surveys
  ADD COLUMN IF NOT EXISTS results_restricted BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  BEGIN
    ALTER TABLE sms_surveys
      ADD CONSTRAINT chk_sms_surveys_revote_policy
      CHECK (revote_policy IN ('locked', 'revote_until_close'));
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 2. sms_ballot_roll
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sms_ballot_roll (
  roll_id SERIAL PRIMARY KEY,
  survey_id INTEGER NOT NULL REFERENCES sms_surveys(survey_id) ON DELETE CASCADE,
  worker_id INTEGER NOT NULL REFERENCES workers(worker_id) ON DELETE CASCADE,
  phone_e164 VARCHAR(16) NOT NULL,
  included_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- How the member landed on the roll. Phase 5 has exactly one
  -- source: the audience freeze at open.
  source VARCHAR(30) NOT NULL DEFAULT 'audience_freeze'
    CHECK (source IN ('audience_freeze')),
  -- Vote-once is by MEMBER, not phone (§4.2 — shared handsets).
  CONSTRAINT uq_sms_ballot_roll_member UNIQUE (survey_id, worker_id)
);

CREATE INDEX IF NOT EXISTS idx_sbr_survey
  ON sms_ballot_roll(survey_id);

-- ─────────────────────────────────────────────────────────────
-- 3. sms_ballot_events (append-only)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sms_ballot_events (
  event_id BIGSERIAL PRIMARY KEY,
  survey_id INTEGER NOT NULL REFERENCES sms_surveys(survey_id) ON DELETE CASCADE,
  event_type VARCHAR(30) NOT NULL
    CHECK (event_type IN ('roll_frozen', 'invitation_sent', 'vote_received',
                          'vote_superseded', 'vote_rejected_locked',
                          'receipt_sent', 'ballot_opened', 'ballot_closed',
                          'tally_generated')),
  worker_id INTEGER REFERENCES workers(worker_id) ON DELETE SET NULL,
  session_id INTEGER REFERENCES sms_survey_sessions(session_id) ON DELETE SET NULL,
  payload JSONB,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sbe_survey_time
  ON sms_ballot_events(survey_id, occurred_at);

-- ─────────────────────────────────────────────────────────────
-- 4. Tally view (aggregate only — no worker ids)
-- ─────────────────────────────────────────────────────────────

-- open_text questions are EXCLUDED: verbatim free texts are not a
-- tally, and aggregating them here would leak them onto the
-- restricted-ballot reporting surface (they stay readable via the
-- existing answer surfaces for unrestricted ballots).
CREATE OR REPLACE VIEW vw_sms_ballot_tally AS
SELECT
  s.survey_id,
  q.question_id,
  q.sort_order,
  q.qtype,
  a.parsed_value,
  COUNT(*)::INT AS vote_count
FROM sms_surveys s
JOIN sms_survey_questions q ON q.survey_id = s.survey_id
JOIN sms_survey_sessions ss
  ON ss.survey_id = s.survey_id AND ss.state = 'completed'
JOIN sms_survey_answers a
  ON a.session_id = ss.session_id
 AND a.question_id = q.question_id
 AND a.parsed_value IS NOT NULL
WHERE s.purpose = 'indicative_ballot'
  AND q.qtype <> 'open_text'
GROUP BY s.survey_id, q.question_id, q.sort_order, q.qtype, a.parsed_value;

-- ─────────────────────────────────────────────────────────────
-- 5. RLS
-- ─────────────────────────────────────────────────────────────

ALTER TABLE sms_ballot_roll ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_ballot_events ENABLE ROW LEVEL SECURITY;

-- Harden survey mutability (Phase 5): open/closed surveys — and
-- especially ballots, whose roll and event log CASCADE from the
-- survey row — must not be staff-mutable or staff-deletable via
-- PostgREST (a delete would destroy the audit trail; an update could
-- rewrite purpose/revote_policy/invitation framing post-open). The
-- Phase 4 UPDATE/DELETE policies are recreated draft-only; the
-- legitimate post-draft transitions (open/close status flips,
-- opened_at/closed_at) run through the SERVICE ROLE in the actions
-- route after its explicit can_write_to_campaign check.
DROP POLICY IF EXISTS "Staff update sms_surveys" ON sms_surveys;
DROP POLICY IF EXISTS "Staff delete sms_surveys" ON sms_surveys;

DO $$
BEGIN
  BEGIN EXECUTE 'CREATE POLICY "Staff update sms_surveys"
    ON sms_surveys FOR UPDATE TO authenticated
    USING (status = ''draft'' AND can_write_to_campaign(campaign_id))
    WITH CHECK (status = ''draft'' AND can_write_to_campaign(campaign_id))';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY "Staff delete sms_surveys"
    ON sms_surveys FOR DELETE TO authenticated
    USING (status = ''draft'' AND can_write_to_campaign(campaign_id))';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

DO $$
BEGIN
  -- Staff read only — every write on both tables is service-role
  -- (the open/close routes after an explicit can_write_to_campaign
  -- check, the webhook, and the timers cron). No INSERT/UPDATE/
  -- DELETE policies or grants for authenticated: the events table
  -- is append-only BY GRANT (see header note re: no trigger).
  BEGIN EXECUTE 'CREATE POLICY "Authenticated read sms_ballot_roll"
    ON sms_ballot_roll FOR SELECT TO authenticated USING (true)';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY "Authenticated read sms_ballot_events"
    ON sms_ballot_events FOR SELECT TO authenticated USING (true)';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 6. Grants
-- ─────────────────────────────────────────────────────────────

REVOKE ALL ON sms_ballot_roll FROM authenticated;
REVOKE ALL ON sms_ballot_events FROM authenticated;
GRANT SELECT ON sms_ballot_roll TO authenticated;
GRANT SELECT ON sms_ballot_events TO authenticated;
GRANT SELECT ON vw_sms_ballot_tally TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 7. Comments
-- ─────────────────────────────────────────────────────────────

COMMENT ON COLUMN sms_surveys.revote_policy IS
  'Ballot revote policy (§4.2): locked = one vote per member '
  '(default, §8.1); revote_until_close = last response wins, '
  'supersessions logged in sms_ballot_events.';
COMMENT ON COLUMN sms_surveys.receipt_salt IS
  'Per-ballot salt for completion receipt hashes — '
  'sha256(salt|worker_id|ordered parsed answers), first 10 hex '
  'chars. Receipts are recomputed on read, never stored.';
COMMENT ON COLUMN sms_surveys.results_restricted IS
  'When true the UI renders no per-member answer surface for this '
  'ballot; vw_sms_ballot_tally is the only reporting surface. '
  'NOTE: sms_survey_answers remains staff-readable (confidential, '
  'not anonymous — brief §4.2, accepted §8.1).';
COMMENT ON TABLE sms_ballot_roll IS
  'Eligibility roll frozen at ballot open (§4.2 roll-first): the '
  'exact invited audience after consent/phone screening. Turnout '
  'reports COUNT(roll) vs completed sessions. Service-role writes '
  'only.';
COMMENT ON TABLE sms_ballot_events IS
  'Append-only ballot audit log (§4.2). Authenticated: SELECT '
  'only; all inserts service-role; no UPDATE/DELETE grants '
  '(append-only by grant — no trigger, to keep campaign delete '
  'cascades working). vote_received/receipt_sent payloads carry '
  'neither choices nor receipt codes.';
COMMENT ON VIEW vw_sms_ballot_tally IS
  'Aggregate ballot tally: vote counts per (question, '
  'parsed_value) over COMPLETED sessions only. No worker ids — '
  'the reporting surface for results_restricted ballots.';
