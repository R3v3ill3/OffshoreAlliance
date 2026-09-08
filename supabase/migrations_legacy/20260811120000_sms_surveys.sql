-- ============================================================
-- SMS module — Phase 4 (survey engine)
--
--   1. sms_surveys — survey definitions (brief §4.1): campaign-
--      scoped, optional activity target for rating writes,
--      purpose ('survey' now; 'indicative_ballot' allowed ahead
--      of Phase 5), evidence-based default settings (retry limit
--      2, question timeout 4h + one nudge, session TTL 72h,
--      max-2 reminder offsets), blackout settings for the bulk-
--      adjacent sends (invitations/nudges/reminders — in-session
--      Q↔A replies are conversational and never blocked).
--   2. sms_survey_questions — linear list with optional
--      per-answer branching overrides; write_rating marks
--      answers that flow to campaign_activity_ratings via the
--      EXISTING sms_interactions → trg_sms_to_rating pipeline
--      (brief §5.1 — no new rating plumbing).
--   3. sms_survey_sessions — per-recipient state machine:
--      queued → invited → active → completed | expired |
--      opted_out | handed_off | undeliverable.
--      UNIQUE(survey_id, worker_id); PARTIAL UNIQUE on
--      phone_e164 WHERE state IN ('invited','active') — many
--      queued sessions may exist for a phone but only ONE may be
--      live; the index doubles as the race guard for the cron's
--      queued→invited claims (23505 = defer).
--   4. sms_survey_answers — one row per (session, question),
--      UPSERT-OVERWRITE semantics (re-answers replace; the
--      append-only audit trail is sms_messages). parsed_value
--      NULL = unparsed capture (freetext-on-choice / handoff);
--      invalid_attempts powers the invalid-reply-rate report.
--   5. Funnel / per-question reporting views.
--
-- RLS: surveys/questions are staff-authored (campaign-gated
-- writes); sessions/answers are read-only to staff — every
-- write comes from the webhook/cron/open-close routes through
-- the service role (after an explicit can_write_to_campaign
-- check in the route where user-initiated).
--
-- NOTE: activity_sequence_triggers.event_kind is free-text
-- (no CHECK — 20260607130000), so no extension is needed for
-- 'sms_reply' authoring. Firing such triggers requires an
-- activity_events ingestion path whose event_kind CHECK does
-- not yet allow 'sms_reply' — deferred (see Phase 4 plan).
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. sms_surveys
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sms_surveys (
  survey_id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  -- Ratings target: answers on write_rating questions upsert
  -- campaign_activity_ratings against this activity.
  activity_id INTEGER REFERENCES campaign_activities(activity_id) ON DELETE SET NULL,
  title VARCHAR(200) NOT NULL,
  -- 'indicative_ballot' is reserved for Phase 5 (ballot mode);
  -- the column ships now so ballot rows need no migration.
  purpose VARCHAR(20) NOT NULL DEFAULT 'survey'
    CHECK (purpose IN ('survey', 'indicative_ballot')),
  status VARCHAR(10) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'open', 'closed')),
  -- Definitions are versioned; sessions pin the version they
  -- started on (Phase 4 keeps definitions immutable once open,
  -- so this stays 1 until a later phase allows re-editing).
  version INTEGER NOT NULL DEFAULT 1,
  -- §4.1 evidence-based defaults.
  retry_limit INTEGER NOT NULL DEFAULT 2 CHECK (retry_limit BETWEEN 0 AND 5),
  question_timeout_minutes INTEGER NOT NULL DEFAULT 240
    CHECK (question_timeout_minutes BETWEEN 10 AND 10080),
  session_ttl_hours INTEGER NOT NULL DEFAULT 72
    CHECK (session_ttl_hours BETWEEN 1 AND 720),
  -- Minutes after invitation for each reminder (max 2 per §4.1).
  reminder_offsets JSONB NOT NULL DEFAULT '[1440, 2880]'::jsonb,
  -- Handoff destination: escalate the conversation to this user
  -- when the retry ladder exhausts (NULL = unassigned handoff).
  handoff_escalate_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_number_id INTEGER REFERENCES sms_numbers(number_id),
  timezone VARCHAR(50) NOT NULL DEFAULT 'Australia/Perth',
  blackout_override BOOLEAN NOT NULL DEFAULT false,
  blackout_override_reason TEXT,
  -- The first outbound (combined with question 1 in one send);
  -- must pass validateSmsBody compliance (org name + opt-out).
  invitation_body TEXT,
  completion_body TEXT,
  opened_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ssurveys_campaign
  ON sms_surveys(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ssurveys_status
  ON sms_surveys(status) WHERE status = 'open';

DROP TRIGGER IF EXISTS trg_sms_surveys_updated_at ON sms_surveys;
CREATE TRIGGER trg_sms_surveys_updated_at
  BEFORE UPDATE ON sms_surveys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 2. sms_survey_questions
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sms_survey_questions (
  question_id SERIAL PRIMARY KEY,
  survey_id INTEGER NOT NULL REFERENCES sms_surveys(survey_id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  prompt TEXT NOT NULL,
  qtype VARCHAR(20) NOT NULL
    CHECK (qtype IN ('choice', 'yes_no', 'scale', 'open_text')),
  -- choice: [{"value": "yes", "label": "Yes I will", "synonyms": ["yep"]}]
  -- scale:  {"min": 1, "max": 5}
  options JSONB,
  -- Per-answer next-question overrides:
  --   {"<parsed value>": <question_id> | "end"}
  -- Absent/unknown values fall through to sort_order.
  branching JSONB,
  -- When true (and the survey has an activity target) a parsed
  -- answer writes a rating via sms_interactions maps_to_* and
  -- the existing trg_sms_to_rating trigger.
  write_rating BOOLEAN NOT NULL DEFAULT false,
  -- Optional copy overrides for the retry ladder / nudge timer.
  invalid_prompt TEXT,
  nudge_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ssq_survey
  ON sms_survey_questions(survey_id, sort_order);

DROP TRIGGER IF EXISTS trg_sms_survey_questions_updated_at ON sms_survey_questions;
CREATE TRIGGER trg_sms_survey_questions_updated_at
  BEFORE UPDATE ON sms_survey_questions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 3. sms_survey_sessions
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sms_survey_sessions (
  session_id SERIAL PRIMARY KEY,
  survey_id INTEGER NOT NULL REFERENCES sms_surveys(survey_id) ON DELETE CASCADE,
  survey_version INTEGER NOT NULL DEFAULT 1,
  worker_id INTEGER NOT NULL REFERENCES workers(worker_id) ON DELETE CASCADE,
  phone_e164 VARCHAR(16) NOT NULL,
  -- The inbox thread carrying the full survey exchange (created/
  -- attached at invitation so a handoff arrives with transcript).
  conversation_id INTEGER REFERENCES sms_conversations(conversation_id) ON DELETE SET NULL,
  state VARCHAR(20) NOT NULL DEFAULT 'queued'
    CHECK (state IN ('queued', 'invited', 'active', 'completed', 'expired',
                     'opted_out', 'handed_off', 'undeliverable')),
  current_question_id INTEGER REFERENCES sms_survey_questions(question_id) ON DELETE SET NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  -- One nudge per question (reset when the session advances).
  nudged BOOLEAN NOT NULL DEFAULT false,
  reminders_sent INTEGER NOT NULL DEFAULT 0,
  -- Timer anchor: when the current prompt (invitation, question,
  -- re-prompt, nudge or reminder) last went out.
  last_prompt_at TIMESTAMPTZ,
  invited_at TIMESTAMPTZ,
  first_answer_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_sms_survey_sessions_member UNIQUE (survey_id, worker_id)
);

-- §4.1 session model: any number of queued sessions per phone,
-- but at most ONE live ('invited'/'active') — the webhook's
-- survey-precedence lookup relies on this, and the invitation
-- cron treats a 23505 here as "phone busy, defer".
CREATE UNIQUE INDEX IF NOT EXISTS uq_sms_survey_sessions_live_phone
  ON sms_survey_sessions(phone_e164)
  WHERE state IN ('invited', 'active');

CREATE INDEX IF NOT EXISTS idx_sss_survey_state
  ON sms_survey_sessions(survey_id, state);
CREATE INDEX IF NOT EXISTS idx_sss_phone
  ON sms_survey_sessions(phone_e164);
CREATE INDEX IF NOT EXISTS idx_sss_worker
  ON sms_survey_sessions(worker_id);

DROP TRIGGER IF EXISTS trg_sms_survey_sessions_updated_at ON sms_survey_sessions;
CREATE TRIGGER trg_sms_survey_sessions_updated_at
  BEFORE UPDATE ON sms_survey_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 4. sms_survey_answers
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sms_survey_answers (
  answer_id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES sms_survey_sessions(session_id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES sms_survey_questions(question_id) ON DELETE CASCADE,
  raw_body TEXT,
  -- NULL = unparsed capture (freetext-on-choice or handoff);
  -- open_text values are clamped to 50 chars here (verbatim in
  -- raw_body and the sms_messages thread).
  parsed_value VARCHAR(50),
  -- Invalid replies burned against this question (retry ladder);
  -- powers the §4.1 invalid-reply-rate report (>10-15% = rewrite).
  invalid_attempts INTEGER NOT NULL DEFAULT 0,
  provider_message_id VARCHAR(100),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Upsert-overwrite: re-answers replace (latest wins); the
  -- append-only audit of every raw inbound is sms_messages.
  CONSTRAINT uq_sms_survey_answers_question UNIQUE (session_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_ssa_question
  ON sms_survey_answers(question_id);

-- ─────────────────────────────────────────────────────────────
-- 5. Reporting views
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW vw_sms_survey_funnel AS
SELECT
  s.survey_id,
  s.campaign_id,
  COUNT(ss.session_id)::INT AS total_sessions,
  COUNT(ss.session_id) FILTER (WHERE ss.state = 'queued')::INT AS queued_count,
  COUNT(ss.session_id) FILTER (WHERE ss.state = 'invited')::INT AS invited_count,
  COUNT(ss.session_id) FILTER (WHERE ss.state = 'active')::INT AS active_count,
  COUNT(ss.session_id) FILTER (WHERE ss.state = 'completed')::INT AS completed_count,
  COUNT(ss.session_id) FILTER (WHERE ss.state = 'expired')::INT AS expired_count,
  COUNT(ss.session_id) FILTER (WHERE ss.state = 'opted_out')::INT AS opted_out_count,
  COUNT(ss.session_id) FILTER (WHERE ss.state = 'handed_off')::INT AS handed_off_count,
  COUNT(ss.session_id) FILTER (WHERE ss.state = 'undeliverable')::INT AS undeliverable_count,
  COUNT(ss.session_id) FILTER (WHERE ss.invited_at IS NOT NULL)::INT AS ever_invited_count,
  COUNT(ss.session_id) FILTER (WHERE ss.first_answer_at IS NOT NULL)::INT AS started_count
FROM sms_surveys s
LEFT JOIN sms_survey_sessions ss ON ss.survey_id = s.survey_id
GROUP BY s.survey_id, s.campaign_id;

CREATE OR REPLACE VIEW vw_sms_survey_question_stats AS
SELECT
  q.survey_id,
  q.question_id,
  q.sort_order,
  q.qtype,
  COUNT(a.answer_id) FILTER (WHERE a.parsed_value IS NOT NULL)::INT AS answered_count,
  COUNT(a.answer_id) FILTER (WHERE a.parsed_value IS NULL)::INT AS unparsed_count,
  COALESCE(SUM(a.invalid_attempts), 0)::INT AS invalid_attempts
FROM sms_survey_questions q
LEFT JOIN sms_survey_answers a ON a.question_id = q.question_id
GROUP BY q.survey_id, q.question_id, q.sort_order, q.qtype;

-- ─────────────────────────────────────────────────────────────
-- 6. RLS
-- ─────────────────────────────────────────────────────────────

ALTER TABLE sms_surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_survey_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_survey_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_survey_answers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- sms_surveys: read all staff; writes campaign-gated.
  BEGIN EXECUTE 'CREATE POLICY "Authenticated read sms_surveys"
    ON sms_surveys FOR SELECT TO authenticated USING (true)';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY "Staff insert sms_surveys"
    ON sms_surveys FOR INSERT TO authenticated
    WITH CHECK (can_write_to_campaign(campaign_id))';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY "Staff update sms_surveys"
    ON sms_surveys FOR UPDATE TO authenticated
    USING (can_write_to_campaign(campaign_id))
    WITH CHECK (can_write_to_campaign(campaign_id))';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY "Staff delete sms_surveys"
    ON sms_surveys FOR DELETE TO authenticated
    USING (can_write_to_campaign(campaign_id))';
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  -- sms_survey_questions: gate through the parent survey.
  BEGIN EXECUTE 'CREATE POLICY "Authenticated read sms_survey_questions"
    ON sms_survey_questions FOR SELECT TO authenticated USING (true)';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY "Staff insert sms_survey_questions"
    ON sms_survey_questions FOR INSERT TO authenticated
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM sms_surveys s
        WHERE s.survey_id = sms_survey_questions.survey_id
          AND can_write_to_campaign(s.campaign_id)
      )
    )';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY "Staff update sms_survey_questions"
    ON sms_survey_questions FOR UPDATE TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM sms_surveys s
        WHERE s.survey_id = sms_survey_questions.survey_id
          AND can_write_to_campaign(s.campaign_id)
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM sms_surveys s
        WHERE s.survey_id = sms_survey_questions.survey_id
          AND can_write_to_campaign(s.campaign_id)
      )
    )';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY "Staff delete sms_survey_questions"
    ON sms_survey_questions FOR DELETE TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM sms_surveys s
        WHERE s.survey_id = sms_survey_questions.survey_id
          AND can_write_to_campaign(s.campaign_id)
      )
    )';
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  -- sms_survey_sessions / sms_survey_answers: staff read only.
  -- All writes are service-role (webhook, timers cron, and the
  -- open/close routes after an explicit can_write_to_campaign
  -- check) — no INSERT/UPDATE/DELETE policies for authenticated.
  BEGIN EXECUTE 'CREATE POLICY "Authenticated read sms_survey_sessions"
    ON sms_survey_sessions FOR SELECT TO authenticated USING (true)';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY "Authenticated read sms_survey_answers"
    ON sms_survey_answers FOR SELECT TO authenticated USING (true)';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 7. Grants
-- ─────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON sms_surveys TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON sms_survey_questions TO authenticated;
GRANT SELECT ON sms_survey_sessions TO authenticated;
GRANT SELECT ON sms_survey_answers TO authenticated;
GRANT SELECT ON vw_sms_survey_funnel TO authenticated;
GRANT SELECT ON vw_sms_survey_question_stats TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE sms_surveys_survey_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE sms_survey_questions_question_id_seq TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 8. Comments
-- ─────────────────────────────────────────────────────────────

COMMENT ON TABLE sms_surveys IS
  'Reply-native SMS survey definitions (brief §4.1). purpose '
  '''indicative_ballot'' is reserved for Phase 5 ballot mode. '
  'Definitions are immutable once opened; sessions pin version.';
COMMENT ON TABLE sms_survey_questions IS
  'Linear question list with optional per-answer branching '
  '({"<value>": question_id | "end"}). write_rating routes parsed '
  'answers to campaign_activity_ratings via sms_interactions + '
  'trg_sms_to_rating (no new rating plumbing).';
COMMENT ON TABLE sms_survey_sessions IS
  'Per-recipient survey session state machine. UNIQUE(survey, '
  'worker); partial unique on phone for live states — at most one '
  'invited/active session per phone (webhook routing precedence).';
COMMENT ON TABLE sms_survey_answers IS
  'One row per (session, question), upsert-overwrite (latest '
  'answer wins). parsed_value NULL = unparsed capture; the '
  'append-only audit trail is sms_messages.';
