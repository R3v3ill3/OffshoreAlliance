-- ============================================================
-- SMS module — Phase 0 (foundations)
--
--   1. workers consent + normalised phone columns: sms_opt_out /
--      sms_opt_out_at / sms_opt_out_source / sms_consent_source /
--      phone_e164 (+ conservative AU-mobile backfill and a sync
--      trigger so phone edits keep phone_e164 fresh).
--   2. STOP/START keyword promotion on inbound sms_interactions —
--      independent of trg_sms_to_rating (both AFTER INSERT; this
--      one never raises).
--   3. sms_numbers registry + append-only assignment history and
--      the admin-gated assign_sms_number() RPC (brief §7.0 —
--      one number per organiser + spares).
--   4. sms_interactions hardening: phone_e164 + unique
--      external_message_id (webhook idempotency foundation).
--   5. SMS template seeds salvaged from the removed yabbr client.
--
-- The backfill never modifies workers.phone; phone_e164 is set
-- only where the cleaned digits unambiguously form an AU mobile.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. workers: consent + phone_e164
-- ─────────────────────────────────────────────────────────────

ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS sms_opt_out BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_opt_out_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sms_opt_out_source VARCHAR(20)
    CHECK (sms_opt_out_source IS NULL OR sms_opt_out_source IN ('inbound_stop', 'staff', 'import')),
  ADD COLUMN IF NOT EXISTS sms_consent_source VARCHAR(20)
    CHECK (sms_consent_source IS NULL OR sms_consent_source IN ('import', 'manual', 'legacy')),
  ADD COLUMN IF NOT EXISTS phone_e164 VARCHAR(16);

CREATE INDEX IF NOT EXISTS idx_workers_phone_e164 ON workers(phone_e164)
  WHERE phone_e164 IS NOT NULL;

-- Provenance stamp for rows that existed before consent-source capture.
UPDATE workers
SET sms_consent_source = 'legacy'
WHERE phone IS NOT NULL AND sms_consent_source IS NULL;

-- Conservative E.164 derivation: only unambiguous AU mobiles
-- (04XXXXXXXX / 614XXXXXXXX / +614XXXXXXXX / 9-digit 4XXXXXXXX /
-- 61-0-4 dialled form); anything else stays NULL and is surfaced
-- by the admin data-quality readout.
CREATE OR REPLACE FUNCTION derive_au_mobile_e164(p_raw TEXT)
RETURNS VARCHAR(16)
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN d ~ '^04\d{8}$' THEN '+61' || substr(d, 2)
    WHEN d ~ '^614\d{8}$' THEN '+' || d
    WHEN d ~ '^4\d{8}$' THEN '+61' || d
    WHEN d ~ '^6104\d{8}$' THEN '+61' || substr(d, 4)
    ELSE NULL
  END
  FROM (SELECT regexp_replace(COALESCE(p_raw, ''), '\D', '', 'g') AS d) x;
$$;

UPDATE workers
SET phone_e164 = derive_au_mobile_e164(phone)
WHERE phone IS NOT NULL
  AND phone_e164 IS NULL
  AND derive_au_mobile_e164(phone) IS NOT NULL;

-- Keep phone_e164 in sync when phone changes (shape of
-- reset_worker_email_status_on_email_change). Also derives on
-- INSERT when the writing path didn't supply phone_e164 itself —
-- the safety net for any code path missed by the app-side stamps.
CREATE OR REPLACE FUNCTION sync_worker_phone_e164()
RETURNS trigger
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.phone_e164 IS NULL AND NEW.phone IS NOT NULL THEN
      NEW.phone_e164 := derive_au_mobile_e164(NEW.phone);
    END IF;
  ELSIF NEW.phone IS DISTINCT FROM OLD.phone THEN
    NEW.phone_e164 := derive_au_mobile_e164(NEW.phone);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS workers_phone_e164_sync ON workers;
CREATE TRIGGER workers_phone_e164_sync
  BEFORE INSERT OR UPDATE OF phone ON workers
  FOR EACH ROW EXECUTE FUNCTION sync_worker_phone_e164();

-- ─────────────────────────────────────────────────────────────
-- 2. STOP / START keyword promotion
-- ─────────────────────────────────────────────────────────────

-- Belt to Mobile Message's platform-side STOP brace; also covers
-- manually entered interactions. Independent of trg_sms_to_rating
-- (keyword bodies carry no CTA mapping, so that trigger no-ops on
-- them); wrapped so it can never block the triggering insert.
-- NOTE: PG regex word boundary is \y, not \b.
CREATE OR REPLACE FUNCTION fn_sms_optout_keyword()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_connection_id BIGINT;
BEGIN
  IF NEW.direction <> 'inbound' OR NEW.body IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.body ~* '^\s*(STOP|UNSUB|UNSUBSCRIBE|OPT ?OUT|QUIT|END)\y' THEN
    UPDATE workers
    SET sms_opt_out = true,
        sms_opt_out_at = now(),
        sms_opt_out_source = 'inbound_stop'
    WHERE worker_id = NEW.worker_id;

    -- Nested block: a failed log insert must never roll back the
    -- opt-out flag update above (compliance-critical).
    BEGIN
      IF NEW.campaign_id IS NOT NULL THEN
        SELECT connection_id INTO v_connection_id
        FROM worker_campaign_connections
        WHERE worker_id = NEW.worker_id AND campaign_id = NEW.campaign_id;
        IF v_connection_id IS NOT NULL THEN
          INSERT INTO worker_activity_log (connection_id, activity_type, contact_method, description)
          VALUES (v_connection_id, 'other', 'sms', 'SMS opt-out (STOP keyword)');
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  ELSIF NEW.body ~* '^\s*(START|UNSTOP)\y' THEN
    -- Clears the flag; sms_opt_out_at/source preserved as the record
    -- of the prior opt-out. The activity log line records the re-subscribe.
    UPDATE workers
    SET sms_opt_out = false
    WHERE worker_id = NEW.worker_id AND sms_opt_out = true;

    BEGIN
      IF NEW.campaign_id IS NOT NULL THEN
        SELECT connection_id INTO v_connection_id
        FROM worker_campaign_connections
        WHERE worker_id = NEW.worker_id AND campaign_id = NEW.campaign_id;
        IF v_connection_id IS NOT NULL THEN
          INSERT INTO worker_activity_log (connection_id, activity_type, contact_method, description)
          VALUES (v_connection_id, 'other', 'sms', 'SMS opt-in restored (START keyword)');
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sms_optout_keyword ON sms_interactions;
CREATE TRIGGER trg_sms_optout_keyword
  AFTER INSERT ON sms_interactions
  FOR EACH ROW EXECUTE FUNCTION fn_sms_optout_keyword();

-- Trigger functions run with definition-time privileges; direct
-- EXECUTE would let any authenticated user flip consent flags.
REVOKE EXECUTE ON FUNCTION fn_sms_optout_keyword() FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 3. sms_numbers registry + assignment history
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sms_numbers (
  number_id SERIAL PRIMARY KEY,
  phone_e164 VARCHAR(16) NOT NULL UNIQUE,
  label VARCHAR(100),
  purpose VARCHAR(20) NOT NULL DEFAULT 'spare'
    CHECK (purpose IN ('organiser', 'relay', 'survey', 'spare')),
  organiser_id INT REFERENCES organisers(organiser_id) ON DELETE SET NULL,
  provider VARCHAR(30) NOT NULL DEFAULT 'mobile_message',
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'retired')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_numbers_organiser ON sms_numbers(organiser_id)
  WHERE organiser_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_sms_numbers_updated_at ON sms_numbers;
CREATE TRIGGER trg_sms_numbers_updated_at
  BEFORE UPDATE ON sms_numbers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS sms_number_assignments (
  assignment_id SERIAL PRIMARY KEY,
  number_id INT NOT NULL REFERENCES sms_numbers(number_id) ON DELETE CASCADE,
  purpose VARCHAR(20) NOT NULL
    CHECK (purpose IN ('organiser', 'relay', 'survey', 'spare')),
  organiser_id INT REFERENCES organisers(organiser_id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  unassigned_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sms_number_assignments_number
  ON sms_number_assignments(number_id, assigned_at DESC);

ALTER TABLE sms_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_number_assignments ENABLE ROW LEVEL SECURITY;

-- Numbers aren't secret in-app: authenticated read, admin-only
-- writes (matching the app_settings posture). Assignment history is
-- written only via assign_sms_number() (SECURITY DEFINER).
DO $$
BEGIN
  BEGIN EXECUTE 'CREATE POLICY sms_numbers_read ON sms_numbers FOR SELECT TO authenticated USING (true)'; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY sms_numbers_write ON sms_numbers FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin())'; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'CREATE POLICY sms_number_assignments_read ON sms_number_assignments FOR SELECT TO authenticated USING (true)'; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON sms_numbers TO authenticated;
GRANT SELECT ON sms_number_assignments TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE sms_numbers_number_id_seq TO authenticated;

-- Reassignment RPC: closes the open history row, opens a new one,
-- updates the registry — history stays append-only.
CREATE OR REPLACE FUNCTION assign_sms_number(
  p_number_id INT,
  p_purpose VARCHAR,
  p_organiser_id INT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'assign_sms_number: admin role required';
  END IF;
  IF p_purpose NOT IN ('organiser', 'relay', 'survey', 'spare') THEN
    RAISE EXCEPTION 'assign_sms_number: invalid purpose %', p_purpose;
  END IF;
  IF p_purpose = 'organiser' AND p_organiser_id IS NULL THEN
    RAISE EXCEPTION 'assign_sms_number: organiser purpose requires an organiser_id';
  END IF;
  -- Row lock serialises concurrent reassignments; retired numbers
  -- are not assignable.
  PERFORM 1 FROM sms_numbers WHERE number_id = p_number_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'assign_sms_number: number % not found or retired', p_number_id;
  END IF;

  UPDATE sms_number_assignments
  SET unassigned_at = now()
  WHERE number_id = p_number_id AND unassigned_at IS NULL;

  INSERT INTO sms_number_assignments (number_id, purpose, organiser_id)
  VALUES (
    p_number_id,
    p_purpose,
    CASE WHEN p_purpose = 'organiser' THEN p_organiser_id ELSE NULL END
  );

  UPDATE sms_numbers
  SET purpose = p_purpose,
      organiser_id = CASE WHEN p_purpose = 'organiser' THEN p_organiser_id ELSE NULL END
  WHERE number_id = p_number_id;
END;
$$;

-- Callable by authenticated users but gated inside on is_admin()
-- (pattern of 20260717110000_activist_fn_grants).
REVOKE EXECUTE ON FUNCTION assign_sms_number(INT, VARCHAR, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION assign_sms_number(INT, VARCHAR, INT) TO authenticated;

COMMENT ON FUNCTION assign_sms_number IS
  'Admin-only reassignment of a dedicated SMS number: closes the open '
  'sms_number_assignments row, opens a new one, updates sms_numbers.';

-- ─────────────────────────────────────────────────────────────
-- 4. sms_interactions hardening
-- ─────────────────────────────────────────────────────────────

ALTER TABLE sms_interactions
  ADD COLUMN IF NOT EXISTS phone_e164 VARCHAR(16);

UPDATE sms_interactions
SET phone_e164 = derive_au_mobile_e164(phone_number)
WHERE phone_number IS NOT NULL
  AND phone_e164 IS NULL
  AND derive_au_mobile_e164(phone_number) IS NOT NULL;

-- Webhook idempotency foundation (Mobile Message delivers
-- at-least-once, out of order).
CREATE UNIQUE INDEX IF NOT EXISTS uq_sms_interactions_external_message_id
  ON sms_interactions(external_message_id)
  WHERE external_message_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 5. Template seeds (salvaged from the removed yabbr client)
-- ─────────────────────────────────────────────────────────────

INSERT INTO comms_template_library (title, body_text, platform, variables, is_active)
SELECT * FROM (VALUES
  (
    'Meeting Invitation',
    'Hi {{first_name}}, you are invited to a {{campaign_name}} meeting on {{date}}. Reply YES to confirm. - Offshore Alliance',
    'sms',
    '["first_name", "campaign_name", "date"]'::jsonb,
    true
  ),
  (
    'Action Reminder',
    'Hi {{first_name}}, reminder: {{action_title}} is happening on {{date}}. Details: {{description}} - Offshore Alliance',
    'sms',
    '["first_name", "action_title", "date", "description"]'::jsonb,
    true
  ),
  (
    'Membership Check-in',
    'Hi {{first_name}}, this is {{organiser_name}} from the Offshore Alliance. Can we chat about your EBA? Reply or call back when convenient.',
    'sms',
    '["first_name", "organiser_name"]'::jsonb,
    true
  ),
  (
    'Bargaining Update',
    'Hi {{first_name}}, update on your {{agreement_name}} bargaining: {{update}}. - Offshore Alliance',
    'sms',
    '["first_name", "agreement_name", "update"]'::jsonb,
    true
  )
) AS seed(title, body_text, platform, variables, is_active)
WHERE NOT EXISTS (
  SELECT 1 FROM comms_template_library ctl
  WHERE ctl.title = seed.title AND ctl.platform = seed.platform
);

-- ─────────────────────────────────────────────────────────────
-- 6. app_settings: Mobile Message keys replace the yabbr pair
-- ─────────────────────────────────────────────────────────────

INSERT INTO app_settings (key, value)
VALUES
  ('mobile_message_api_username', ''),
  ('mobile_message_api_password', ''),
  ('sms_provider', '')
ON CONFLICT (key) DO NOTHING;

DELETE FROM app_settings WHERE key IN ('yabbr_api_key', 'yabbr_api_url');
