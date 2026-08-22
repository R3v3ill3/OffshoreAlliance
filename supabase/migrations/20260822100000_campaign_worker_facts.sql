-- ============================================================
-- Campaign worker facts (non-assessment data)
--
-- Queryable per-worker attributes that are NOT organising ratings:
-- claim rankings, compliance witnesses, and similar survey answers.
-- campaign_activity_ratings stays the 1–5 / binary wall-chart scale.
--
--   campaign_data_fieldsets  — optional grouping ("August claims log")
--   campaign_data_fields     — catalogue (typed, filterable)
--   worker_campaign_facts    — latest-wins (campaign, worker, field)
--   worker_campaign_fact_history — previous values on update/delete
--   record_campaign_fact()   — single write RPC (mirrors
--                              record_assessment_event)
--
-- SMS: sms_survey_questions.write_fact + field_id so a parsed answer
-- can land here without becoming a rating.
-- ============================================================

-- -----------------------------------------------------------
-- 1. Fieldsets
-- -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS campaign_data_fieldsets (
  fieldset_id SERIAL PRIMARY KEY,
  campaign_id INT NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  category VARCHAR(20) NOT NULL DEFAULT 'other'
    CHECK (category IN ('claims', 'compliance', 'other')),
  sort_order INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cdata_fieldsets_campaign
  ON campaign_data_fieldsets(campaign_id, sort_order);

DROP TRIGGER IF EXISTS trg_campaign_data_fieldsets_updated_at ON campaign_data_fieldsets;
CREATE TRIGGER trg_campaign_data_fieldsets_updated_at
  BEFORE UPDATE ON campaign_data_fieldsets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE campaign_data_fieldsets IS
  'Optional grouping of campaign_data_fields (one survey / claims log).';

-- -----------------------------------------------------------
-- 2. Fields
-- -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS campaign_data_fields (
  field_id SERIAL PRIMARY KEY,
  campaign_id INT NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  fieldset_id INT REFERENCES campaign_data_fieldsets(fieldset_id) ON DELETE SET NULL,
  key VARCHAR(80) NOT NULL,
  label VARCHAR(200) NOT NULL,
  category VARCHAR(20) NOT NULL DEFAULT 'other'
    CHECK (category IN ('claims', 'compliance', 'other')),
  value_type VARCHAR(20) NOT NULL
    CHECK (value_type IN ('boolean', 'enum', 'integer', 'scale', 'text', 'multi_enum')),
  enum_options JSONB,
  scale_min INT,
  scale_max INT,
  filterable BOOLEAN NOT NULL DEFAULT true,
  sortable BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_campaign_data_fields_key UNIQUE (campaign_id, key),
  CONSTRAINT chk_cdf_scale_range CHECK (
    scale_min IS NULL OR scale_max IS NULL OR scale_min < scale_max
  )
);

CREATE INDEX IF NOT EXISTS idx_cdata_fields_campaign
  ON campaign_data_fields(campaign_id, category, sort_order);
CREATE INDEX IF NOT EXISTS idx_cdata_fields_fieldset
  ON campaign_data_fields(fieldset_id)
  WHERE fieldset_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_campaign_data_fields_updated_at ON campaign_data_fields;
CREATE TRIGGER trg_campaign_data_fields_updated_at
  BEFORE UPDATE ON campaign_data_fields
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE campaign_data_fields IS
  'Campaign-scoped catalogue of non-assessment worker facts '
  '(claim ranks, compliance witnesses, etc.).';
COMMENT ON COLUMN campaign_data_fields.key IS
  'Stable slug unique per campaign, e.g. claim.fatigue_rank.';
COMMENT ON COLUMN campaign_data_fields.enum_options IS
  'JSON array of strings or {value, label} objects. Required for enum/multi_enum.';

-- -----------------------------------------------------------
-- 3. Latest-wins facts
-- -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS worker_campaign_facts (
  fact_id SERIAL PRIMARY KEY,
  campaign_id INT NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  worker_id INT NOT NULL REFERENCES workers(worker_id) ON DELETE CASCADE,
  field_id INT NOT NULL REFERENCES campaign_data_fields(field_id) ON DELETE CASCADE,
  value_bool BOOLEAN,
  value_int INT,
  value_text TEXT,
  value_enum VARCHAR(200),
  value_json JSONB,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source VARCHAR(20) NOT NULL DEFAULT 'staff'
    CHECK (source IN ('sms_survey', 'an_csv', 'email', 'phone', 'staff')),
  source_ref TEXT,
  notes TEXT,
  recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_worker_campaign_facts UNIQUE (campaign_id, worker_id, field_id),
  CONSTRAINT chk_wcf_has_value CHECK (
    value_bool IS NOT NULL
    OR value_int IS NOT NULL
    OR value_text IS NOT NULL
    OR value_enum IS NOT NULL
    OR value_json IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_wcf_campaign_field
  ON worker_campaign_facts(campaign_id, field_id);
CREATE INDEX IF NOT EXISTS idx_wcf_campaign_worker
  ON worker_campaign_facts(campaign_id, worker_id);
CREATE INDEX IF NOT EXISTS idx_wcf_worker
  ON worker_campaign_facts(worker_id);

DROP TRIGGER IF EXISTS trg_worker_campaign_facts_updated_at ON worker_campaign_facts;
CREATE TRIGGER trg_worker_campaign_facts_updated_at
  BEFORE UPDATE ON worker_campaign_facts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE worker_campaign_facts IS
  'Latest value of a campaign data field for a worker. History is in '
  'worker_campaign_fact_history. Not an organising rating.';

-- -----------------------------------------------------------
-- 4. History
-- -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS worker_campaign_fact_history (
  history_id SERIAL PRIMARY KEY,
  fact_id INT,
  campaign_id INT NOT NULL,
  worker_id INT NOT NULL,
  field_id INT NOT NULL,
  value_bool BOOLEAN,
  value_int INT,
  value_text TEXT,
  value_enum VARCHAR(200),
  value_json JSONB,
  collected_at TIMESTAMPTZ,
  source VARCHAR(20),
  source_ref TEXT,
  notes TEXT,
  recorded_by UUID,
  replaced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wcfh_worker_field
  ON worker_campaign_fact_history(worker_id, field_id, replaced_at DESC);
CREATE INDEX IF NOT EXISTS idx_wcfh_campaign
  ON worker_campaign_fact_history(campaign_id, field_id);

COMMENT ON TABLE worker_campaign_fact_history IS
  'Previous worker_campaign_facts rows, written by trigger on UPDATE/DELETE.';

CREATE OR REPLACE FUNCTION fn_worker_campaign_fact_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    INSERT INTO worker_campaign_fact_history (
      fact_id, campaign_id, worker_id, field_id,
      value_bool, value_int, value_text, value_enum, value_json,
      collected_at, source, source_ref, notes, recorded_by, replaced_at
    ) VALUES (
      OLD.fact_id, OLD.campaign_id, OLD.worker_id, OLD.field_id,
      OLD.value_bool, OLD.value_int, OLD.value_text, OLD.value_enum, OLD.value_json,
      OLD.collected_at, OLD.source, OLD.source_ref, OLD.notes, OLD.recorded_by, now()
    );
    RETURN NEW;
  END IF;

  INSERT INTO worker_campaign_fact_history (
    fact_id, campaign_id, worker_id, field_id,
    value_bool, value_int, value_text, value_enum, value_json,
    collected_at, source, source_ref, notes, recorded_by, replaced_at
  ) VALUES (
    OLD.fact_id, OLD.campaign_id, OLD.worker_id, OLD.field_id,
    OLD.value_bool, OLD.value_int, OLD.value_text, OLD.value_enum, OLD.value_json,
    OLD.collected_at, OLD.source, OLD.source_ref, OLD.notes, OLD.recorded_by, now()
  );
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_worker_campaign_fact_history ON worker_campaign_facts;
CREATE TRIGGER trg_worker_campaign_fact_history
  AFTER UPDATE OR DELETE ON worker_campaign_facts
  FOR EACH ROW EXECUTE FUNCTION fn_worker_campaign_fact_history();

-- -----------------------------------------------------------
-- 5. Enum option helper
-- -----------------------------------------------------------

CREATE OR REPLACE FUNCTION campaign_fact_enum_values(p_options JSONB)
RETURNS TEXT[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_vals TEXT[] := ARRAY[]::TEXT[];
  v_el JSONB;
BEGIN
  IF p_options IS NULL OR jsonb_typeof(p_options) <> 'array' THEN
    RETURN v_vals;
  END IF;
  FOR v_el IN SELECT jsonb_array_elements(p_options)
  LOOP
    IF jsonb_typeof(v_el) = 'string' THEN
      v_vals := array_append(v_vals, v_el #>> '{}');
    ELSIF jsonb_typeof(v_el) = 'object' AND v_el ? 'value' THEN
      v_vals := array_append(v_vals, v_el->>'value');
    END IF;
  END LOOP;
  RETURN v_vals;
END;
$$;

-- -----------------------------------------------------------
-- 6. record_campaign_fact
-- -----------------------------------------------------------

CREATE OR REPLACE FUNCTION record_campaign_fact(
  p_field_id INT,
  p_worker_id INT,
  p_campaign_id INT,
  p_value_bool BOOLEAN DEFAULT NULL,
  p_value_int INT DEFAULT NULL,
  p_value_text TEXT DEFAULT NULL,
  p_value_enum VARCHAR DEFAULT NULL,
  p_value_json JSONB DEFAULT NULL,
  p_source VARCHAR DEFAULT 'staff',
  p_source_ref TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_actor_id UUID DEFAULT NULL,
  p_clear BOOLEAN DEFAULT FALSE
) RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_field campaign_data_fields%ROWTYPE;
  v_fact_id INT;
  v_allowed TEXT[];
  v_json_el JSONB;
  v_enum TEXT;
  v_bool BOOLEAN := p_value_bool;
  v_int INT := p_value_int;
  v_text TEXT := p_value_text;
  v_enum_val VARCHAR := p_value_enum;
  v_json JSONB := p_value_json;
BEGIN
  -- Authenticated callers need campaign write (or admin). Service-role SMS
  -- inbound has auth.uid() IS NULL and is allowed through.
  IF auth.uid() IS NOT NULL AND NOT (can_write_to_campaign(p_campaign_id) OR is_admin()) THEN
    RAISE EXCEPTION 'record_campaign_fact: permission denied for campaign %', p_campaign_id
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_field
  FROM campaign_data_fields
  WHERE field_id = p_field_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'record_campaign_fact: field % not found', p_field_id;
  END IF;

  IF v_field.campaign_id <> p_campaign_id THEN
    RAISE EXCEPTION
      'record_campaign_fact: field % belongs to campaign %, not %',
      p_field_id, v_field.campaign_id, p_campaign_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM workers WHERE worker_id = p_worker_id) THEN
    RAISE EXCEPTION 'record_campaign_fact: worker % not found', p_worker_id;
  END IF;

  IF p_source IS NULL OR p_source NOT IN ('sms_survey', 'an_csv', 'email', 'phone', 'staff') THEN
    RAISE EXCEPTION 'record_campaign_fact: invalid source %', p_source;
  END IF;

  IF p_clear THEN
    DELETE FROM worker_campaign_facts
    WHERE campaign_id = p_campaign_id
      AND worker_id = p_worker_id
      AND field_id = p_field_id
    RETURNING fact_id INTO v_fact_id;
    RETURN COALESCE(v_fact_id, 0);
  END IF;

  -- Type-specific validation; unused columns are forced NULL.
  IF v_field.value_type = 'boolean' THEN
    IF v_bool IS NULL THEN
      RAISE EXCEPTION 'record_campaign_fact: boolean field % requires value_bool', p_field_id;
    END IF;
    v_int := NULL;
    v_text := NULL;
    v_enum_val := NULL;
    v_json := NULL;
  ELSIF v_field.value_type IN ('integer', 'scale') THEN
    IF v_int IS NULL THEN
      RAISE EXCEPTION 'record_campaign_fact: % field % requires value_int', v_field.value_type, p_field_id;
    END IF;
    IF v_field.scale_min IS NOT NULL AND v_int < v_field.scale_min THEN
      RAISE EXCEPTION 'record_campaign_fact: value_int % below scale_min %', v_int, v_field.scale_min;
    END IF;
    IF v_field.scale_max IS NOT NULL AND v_int > v_field.scale_max THEN
      RAISE EXCEPTION 'record_campaign_fact: value_int % above scale_max %', v_int, v_field.scale_max;
    END IF;
    v_bool := NULL;
    v_text := NULL;
    v_enum_val := NULL;
    v_json := NULL;
  ELSIF v_field.value_type = 'text' THEN
    IF v_text IS NULL OR btrim(v_text) = '' THEN
      RAISE EXCEPTION 'record_campaign_fact: text field % requires value_text', p_field_id;
    END IF;
    v_text := left(v_text, 4000);
    v_bool := NULL;
    v_int := NULL;
    v_enum_val := NULL;
    v_json := NULL;
  ELSIF v_field.value_type = 'enum' THEN
    IF v_enum_val IS NULL OR btrim(v_enum_val) = '' THEN
      RAISE EXCEPTION 'record_campaign_fact: enum field % requires value_enum', p_field_id;
    END IF;
    v_allowed := campaign_fact_enum_values(v_field.enum_options);
    IF array_length(v_allowed, 1) IS NULL OR NOT (v_enum_val = ANY (v_allowed)) THEN
      RAISE EXCEPTION 'record_campaign_fact: % is not an allowed value for field %', v_enum_val, p_field_id;
    END IF;
    v_bool := NULL;
    v_int := NULL;
    v_text := NULL;
    v_json := NULL;
  ELSIF v_field.value_type = 'multi_enum' THEN
    IF v_json IS NULL OR jsonb_typeof(v_json) <> 'array' OR jsonb_array_length(v_json) = 0 THEN
      RAISE EXCEPTION 'record_campaign_fact: multi_enum field % requires a non-empty JSON array', p_field_id;
    END IF;
    v_allowed := campaign_fact_enum_values(v_field.enum_options);
    FOR v_json_el IN SELECT jsonb_array_elements(v_json)
    LOOP
      IF jsonb_typeof(v_json_el) <> 'string' THEN
        RAISE EXCEPTION 'record_campaign_fact: multi_enum values must be strings';
      END IF;
      v_enum := v_json_el #>> '{}';
      IF array_length(v_allowed, 1) IS NULL OR NOT (v_enum = ANY (v_allowed)) THEN
        RAISE EXCEPTION 'record_campaign_fact: % is not an allowed value for field %', v_enum, p_field_id;
      END IF;
    END LOOP;
    v_bool := NULL;
    v_int := NULL;
    v_text := NULL;
    v_enum_val := NULL;
  ELSE
    RAISE EXCEPTION 'record_campaign_fact: unknown value_type %', v_field.value_type;
  END IF;

  INSERT INTO worker_campaign_facts (
    campaign_id, worker_id, field_id,
    value_bool, value_int, value_text, value_enum, value_json,
    collected_at, source, source_ref, notes, recorded_by
  ) VALUES (
    p_campaign_id, p_worker_id, p_field_id,
    v_bool, v_int, v_text, v_enum_val, v_json,
    now(), p_source, p_source_ref, p_notes, COALESCE(p_actor_id, auth.uid())
  )
  ON CONFLICT (campaign_id, worker_id, field_id) DO UPDATE SET
    value_bool = EXCLUDED.value_bool,
    value_int = EXCLUDED.value_int,
    value_text = EXCLUDED.value_text,
    value_enum = EXCLUDED.value_enum,
    value_json = EXCLUDED.value_json,
    collected_at = EXCLUDED.collected_at,
    source = EXCLUDED.source,
    source_ref = EXCLUDED.source_ref,
    notes = COALESCE(EXCLUDED.notes, worker_campaign_facts.notes),
    recorded_by = COALESCE(EXCLUDED.recorded_by, worker_campaign_facts.recorded_by)
  RETURNING fact_id INTO v_fact_id;

  RETURN v_fact_id;
END;
$$;

GRANT EXECUTE ON FUNCTION record_campaign_fact TO authenticated;
GRANT EXECUTE ON FUNCTION record_campaign_fact TO service_role;
GRANT EXECUTE ON FUNCTION campaign_fact_enum_values TO authenticated;

COMMENT ON FUNCTION record_campaign_fact IS
  'Upsert (or clear) a worker_campaign_facts row after type + permission checks. '
  'Authenticated callers need campaign write (or admin). Service-role SMS inbound '
  'may write when auth.uid() is null. Returns fact_id, or 0 when clear finds nothing.';

-- -----------------------------------------------------------
-- 7. SMS survey write_fact
-- -----------------------------------------------------------

ALTER TABLE sms_survey_questions
  ADD COLUMN IF NOT EXISTS write_fact BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE sms_survey_questions
  ADD COLUMN IF NOT EXISTS field_id INTEGER
    REFERENCES campaign_data_fields(field_id) ON DELETE SET NULL;

COMMENT ON COLUMN sms_survey_questions.write_fact IS
  'When true (and field_id set), a parsed answer writes a campaign fact '
  'via record_campaign_fact. Independent of write_rating.';
COMMENT ON COLUMN sms_survey_questions.field_id IS
  'Target campaign_data_fields row. Campaign coherence is enforced in '
  'the SMS survey routes, not by a CHECK.';

CREATE INDEX IF NOT EXISTS idx_ssq_field
  ON sms_survey_questions(field_id)
  WHERE field_id IS NOT NULL;

-- -----------------------------------------------------------
-- 8. RLS
-- -----------------------------------------------------------

ALTER TABLE campaign_data_fieldsets ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_data_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_campaign_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_campaign_fact_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN EXECUTE $p$
    CREATE POLICY "Authenticated read campaign_data_fieldsets"
      ON campaign_data_fieldsets FOR SELECT TO authenticated USING (true)
  $p$; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE $p$
    CREATE POLICY "Writers insert campaign_data_fieldsets"
      ON campaign_data_fieldsets FOR INSERT TO authenticated
      WITH CHECK (can_write_to_campaign(campaign_id) OR is_admin())
  $p$; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE $p$
    CREATE POLICY "Writers update campaign_data_fieldsets"
      ON campaign_data_fieldsets FOR UPDATE TO authenticated
      USING (can_write_to_campaign(campaign_id) OR is_admin())
      WITH CHECK (can_write_to_campaign(campaign_id) OR is_admin())
  $p$; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE $p$
    CREATE POLICY "Writers delete campaign_data_fieldsets"
      ON campaign_data_fieldsets FOR DELETE TO authenticated
      USING (can_write_to_campaign(campaign_id) OR is_admin())
  $p$; EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN EXECUTE $p$
    CREATE POLICY "Authenticated read campaign_data_fields"
      ON campaign_data_fields FOR SELECT TO authenticated USING (true)
  $p$; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE $p$
    CREATE POLICY "Writers insert campaign_data_fields"
      ON campaign_data_fields FOR INSERT TO authenticated
      WITH CHECK (can_write_to_campaign(campaign_id) OR is_admin())
  $p$; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE $p$
    CREATE POLICY "Writers update campaign_data_fields"
      ON campaign_data_fields FOR UPDATE TO authenticated
      USING (can_write_to_campaign(campaign_id) OR is_admin())
      WITH CHECK (can_write_to_campaign(campaign_id) OR is_admin())
  $p$; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE $p$
    CREATE POLICY "Writers delete campaign_data_fields"
      ON campaign_data_fields FOR DELETE TO authenticated
      USING (can_write_to_campaign(campaign_id) OR is_admin())
  $p$; EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN EXECUTE $p$
    CREATE POLICY "Authenticated read worker_campaign_facts"
      ON worker_campaign_facts FOR SELECT TO authenticated USING (true)
  $p$; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE $p$
    CREATE POLICY "Writers insert worker_campaign_facts"
      ON worker_campaign_facts FOR INSERT TO authenticated
      WITH CHECK (can_write_to_campaign(campaign_id) OR is_admin())
  $p$; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE $p$
    CREATE POLICY "Writers update worker_campaign_facts"
      ON worker_campaign_facts FOR UPDATE TO authenticated
      USING (can_write_to_campaign(campaign_id) OR is_admin())
      WITH CHECK (can_write_to_campaign(campaign_id) OR is_admin())
  $p$; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE $p$
    CREATE POLICY "Writers delete worker_campaign_facts"
      ON worker_campaign_facts FOR DELETE TO authenticated
      USING (can_write_to_campaign(campaign_id) OR is_admin())
  $p$; EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN EXECUTE $p$
    CREATE POLICY "Authenticated read worker_campaign_fact_history"
      ON worker_campaign_fact_history FOR SELECT TO authenticated USING (true)
  $p$; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON campaign_data_fieldsets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON campaign_data_fields TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON worker_campaign_facts TO authenticated;
GRANT SELECT ON worker_campaign_fact_history TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE campaign_data_fieldsets_fieldset_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE campaign_data_fields_field_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE worker_campaign_facts_fact_id_seq TO authenticated;
