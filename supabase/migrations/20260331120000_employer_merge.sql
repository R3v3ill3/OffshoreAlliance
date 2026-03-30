-- ============================================================
-- Employer merge: aliases table, audit table, merge_employers RPC
-- ============================================================

-- 1. Alternate names for matching / display (survivor employer only)
CREATE TABLE employer_name_aliases (
  id              SERIAL PRIMARY KEY,
  employer_id     INT NOT NULL REFERENCES employers(employer_id) ON DELETE CASCADE,
  alias_name      VARCHAR(200) NOT NULL,
  source          VARCHAR(20) NOT NULL DEFAULT 'manual'
    CHECK (source IN ('merge', 'manual')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX employer_name_aliases_employer_lower_alias
  ON employer_name_aliases (employer_id, (lower(trim(alias_name))));

CREATE INDEX idx_employer_name_aliases_employer ON employer_name_aliases(employer_id);

COMMENT ON TABLE employer_name_aliases IS
  'Additional recognised names for an employer (e.g. after merging duplicate rows).';

-- 2. Audit trail for merges
CREATE TABLE employer_merge_events (
  id                  SERIAL PRIMARY KEY,
  survivor_employer_id INT REFERENCES employers(employer_id) ON DELETE SET NULL,
  victim_employer_ids  INT[] NOT NULL,
  performed_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  payload             JSONB NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_employer_merge_events_survivor ON employer_merge_events(survivor_employer_id);

-- 3. RLS (align with core tables)
ALTER TABLE employer_name_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE employer_merge_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read employer_name_aliases"
  ON employer_name_aliases FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/User can insert employer_name_aliases"
  ON employer_name_aliases FOR INSERT TO authenticated
  WITH CHECK (get_user_role() IN ('admin', 'user'));
CREATE POLICY "Admin/User can update employer_name_aliases"
  ON employer_name_aliases FOR UPDATE TO authenticated
  USING (get_user_role() IN ('admin', 'user'))
  WITH CHECK (get_user_role() IN ('admin', 'user'));
CREATE POLICY "Admin can delete employer_name_aliases"
  ON employer_name_aliases FOR DELETE TO authenticated
  USING (get_user_role() = 'admin');

CREATE POLICY "Authenticated users can read employer_merge_events"
  ON employer_merge_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/User can insert employer_merge_events"
  ON employer_merge_events FOR INSERT TO authenticated
  WITH CHECK (get_user_role() IN ('admin', 'user'));

-- 4. merge_employers RPC
CREATE OR REPLACE FUNCTION merge_employers(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_survivor_id         INT;
  v_victim_ids          INT[];
  v_canonical           TEXT;
  v_extra_aliases       TEXT[];
  v_alias_names         TEXT[];
  v_expected_ts         TIMESTAMPTZ;
  v_admin_user_id       UUID;
  v_actual_ts           TIMESTAMPTZ;
  v_cur                 INT;
  v_victim_count        INT;
  v_workers_updated     INT := 0;
  v_agreements_updated  INT := 0;
  v_aliases_inserted    INT := 0;
  v_warnings            JSONB := '[]'::JSONB;
  v_name                TEXT;
  v_trading             TEXT;
  v_rec                 RECORD;
  v_merged_ids          INT[];
BEGIN
  v_survivor_id := (payload->>'survivor_employer_id')::INT;
  v_admin_user_id := NULLIF(payload->>'admin_user_id', '')::UUID;

  SELECT COALESCE(
    ARRAY(
      SELECT DISTINCT j::INT
      FROM jsonb_array_elements_text(COALESCE(payload->'victim_employer_ids', '[]'::JSONB)) AS e(j)
      WHERE j ~ '^\d+$'
      ORDER BY 1
    ),
    ARRAY[]::INT[]
  )
  INTO v_victim_ids;

  IF v_survivor_id IS NULL OR v_victim_ids IS NULL OR cardinality(v_victim_ids) < 1 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'invalid_input',
      'message', 'survivor_employer_id and at least one victim_employer_ids entry are required.'
    );
  END IF;

  IF v_survivor_id = ANY(v_victim_ids) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'invalid_input',
      'message', 'Survivor cannot be included in victim_employer_ids.'
    );
  END IF;

  SELECT COUNT(*) INTO v_victim_count FROM employers e WHERE e.employer_id = ANY(v_victim_ids);
  IF v_victim_count <> cardinality(v_victim_ids) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'not_found',
      'message', 'One or more victim employer IDs do not exist.'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM employers WHERE employer_id = v_survivor_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'not_found',
      'message', 'Survivor employer does not exist.'
    );
  END IF;

  -- Ancestor guard: no victim may appear on the parent chain from survivor
  v_cur := (SELECT parent_employer_id FROM employers WHERE employer_id = v_survivor_id);
  WHILE v_cur IS NOT NULL LOOP
    IF v_cur = ANY(v_victim_ids) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'parent_child_conflict',
        'message', 'A victim is an ancestor of the survivor on parent_employer_id. Choose a different canonical employer (e.g. the parent row) or unmerge parent/child subsidiaries first.'
      );
    END IF;
    v_cur := (SELECT parent_employer_id FROM employers WHERE employer_id = v_cur);
  END LOOP;

  IF payload->>'expected_survivor_updated_at' IS NOT NULL THEN
    v_expected_ts := (payload->>'expected_survivor_updated_at')::TIMESTAMPTZ;
    SELECT updated_at INTO v_actual_ts FROM employers WHERE employer_id = v_survivor_id;
    IF v_actual_ts IS NOT NULL AND v_expected_ts IS NOT NULL AND v_actual_ts <> v_expected_ts THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'stale_data',
        'message', 'Survivor employer was modified since loaded. Refresh and try again.',
        'expected', v_expected_ts,
        'actual', v_actual_ts
      );
    END IF;
  END IF;

  v_merged_ids := ARRAY[v_survivor_id] || v_victim_ids;

  -- Canonical name
  IF payload ? 'canonical_employer_name' AND NULLIF(trim(payload->>'canonical_employer_name'), '') IS NOT NULL THEN
    v_canonical := trim(payload->>'canonical_employer_name');
  ELSE
    SELECT employer_name INTO v_canonical FROM employers WHERE employer_id = v_survivor_id;
  END IF;

  IF v_canonical IS NULL OR length(v_canonical) = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'invalid_input',
      'message', 'canonical_employer_name is empty.'
    );
  END IF;

  -- Alias list: explicit from UI, or build from merged rows + extra_aliases
  IF jsonb_typeof(payload->'alias_names') = 'array'
     AND jsonb_array_length(COALESCE(payload->'alias_names', '[]'::JSONB)) > 0 THEN
    SELECT COALESCE(
      ARRAY(
        SELECT trim(both FROM e.elem)
        FROM jsonb_array_elements_text(payload->'alias_names') AS e(elem)
        WHERE length(trim(both FROM e.elem)) > 0
      ),
      ARRAY[]::TEXT[]
    )
    INTO v_alias_names;
  ELSE
    v_alias_names := ARRAY[]::TEXT[];
    FOR v_rec IN
      SELECT employer_id, employer_name, trading_name
      FROM employers
      WHERE employer_id = ANY(v_merged_ids)
      ORDER BY CASE WHEN employer_id = v_survivor_id THEN 0 ELSE 1 END, employer_id
    LOOP
      IF lower(trim(v_rec.employer_name)) <> lower(trim(v_canonical)) THEN
        v_alias_names := array_append(v_alias_names, trim(v_rec.employer_name));
      END IF;
      IF v_rec.trading_name IS NOT NULL AND length(trim(v_rec.trading_name)) > 0 THEN
        v_alias_names := array_append(v_alias_names, trim(v_rec.trading_name));
      END IF;
    END LOOP;
    IF jsonb_typeof(payload->'extra_aliases') = 'array' THEN
      FOR v_name IN
        SELECT trim(both FROM ex.elem)
        FROM jsonb_array_elements_text(payload->'extra_aliases') AS ex(elem)
      LOOP
        IF length(v_name) > 0 THEN
          v_alias_names := array_append(v_alias_names, v_name);
        END IF;
      END LOOP;
    END IF;
  END IF;

  -- Repoint survivor.parent if it points at a victim
  UPDATE employers s
  SET parent_employer_id = p.parent_employer_id,
      updated_at = now()
  FROM employers p
  WHERE s.employer_id = v_survivor_id
    AND s.parent_employer_id = p.employer_id
    AND p.employer_id = ANY(v_victim_ids);

  -- Other employers that pointed at victims now point at survivor
  UPDATE employers
  SET parent_employer_id = v_survivor_id,
      updated_at = now()
  WHERE parent_employer_id = ANY(v_victim_ids)
    AND employer_id <> v_survivor_id;

  UPDATE worksites
  SET operator_id = v_survivor_id,
      updated_at = now()
  WHERE operator_id = ANY(v_victim_ids);

  UPDATE worksites
  SET principal_employer_id = v_survivor_id,
      updated_at = now()
  WHERE principal_employer_id = ANY(v_victim_ids);

  UPDATE agreements
  SET employer_id = v_survivor_id,
      updated_at = now()
  WHERE employer_id = ANY(v_victim_ids);
  GET DIAGNOSTICS v_agreements_updated = ROW_COUNT;

  UPDATE workers
  SET employer_id = v_survivor_id,
      updated_at = now()
  WHERE employer_id = ANY(v_victim_ids);
  GET DIAGNOSTICS v_workers_updated = ROW_COUNT;

  UPDATE documents
  SET employer_id = v_survivor_id
  WHERE employer_id = ANY(v_victim_ids);

  UPDATE worksite_scopes
  SET employer_id = v_survivor_id
  WHERE employer_id = ANY(v_victim_ids);

  UPDATE employer_scopes
  SET employer_id = v_survivor_id
  WHERE employer_id = ANY(v_victim_ids);

  UPDATE agreement_employers
  SET employer_id = v_survivor_id
  WHERE employer_id = ANY(v_victim_ids);

  UPDATE employer_worksite_roles
  SET employer_id = v_survivor_id
  WHERE employer_id = ANY(v_victim_ids);

  UPDATE employer_sectors
  SET employer_id = v_survivor_id
  WHERE employer_id = ANY(v_victim_ids);

  UPDATE employer_tags
  SET employer_id = v_survivor_id
  WHERE employer_id = ANY(v_victim_ids);

  UPDATE project_employers
  SET employer_id = v_survivor_id
  WHERE employer_id = ANY(v_victim_ids);

  UPDATE campaign_employers
  SET employer_id = v_survivor_id
  WHERE employer_id = ANY(v_victim_ids);

  -- Dedupe agreement_employers: align is_primary then delete extra rows
  UPDATE agreement_employers ae
  SET is_primary = s.mx
  FROM (
    SELECT agreement_id, BOOL_OR(is_primary) AS mx
    FROM agreement_employers
    WHERE employer_id = v_survivor_id
    GROUP BY agreement_id
  ) s
  WHERE ae.employer_id = v_survivor_id
    AND ae.agreement_id = s.agreement_id;

  DELETE FROM agreement_employers ae
  WHERE ae.employer_id = v_survivor_id
    AND ae.id IN (
      SELECT id
      FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY agreement_id, employer_id
                 ORDER BY is_primary DESC, id
               ) AS rn
        FROM agreement_employers
        WHERE employer_id = v_survivor_id
      ) x
      WHERE rn > 1
    );

  -- employer_sectors
  DELETE FROM employer_sectors es
  WHERE es.id IN (
    SELECT id FROM (
      SELECT id,
             ROW_NUMBER() OVER (PARTITION BY employer_id, sector_id ORDER BY id) AS rn
      FROM employer_sectors
      WHERE employer_id = v_survivor_id
    ) x WHERE rn > 1
  );

  -- employer_tags
  DELETE FROM employer_tags et
  WHERE et.id IN (
    SELECT id FROM (
      SELECT id,
             ROW_NUMBER() OVER (PARTITION BY employer_id, tag_id ORDER BY id) AS rn
      FROM employer_tags
      WHERE employer_id = v_survivor_id
    ) x WHERE rn > 1
  );

  -- employer_scopes
  DELETE FROM employer_scopes es
  WHERE es.id IN (
    SELECT id FROM (
      SELECT id,
             ROW_NUMBER() OVER (
               PARTITION BY employer_id, scope_id
               ORDER BY CASE WHEN source = 'manual' THEN 0 ELSE 1 END, id
             ) AS rn
      FROM employer_scopes
      WHERE employer_id = v_survivor_id
    ) x WHERE rn > 1
  );

  -- campaign_employers
  DELETE FROM campaign_employers ce
  WHERE ce.id IN (
    SELECT id FROM (
      SELECT id,
             ROW_NUMBER() OVER (PARTITION BY campaign_id, employer_id ORDER BY id) AS rn
      FROM campaign_employers
      WHERE employer_id = v_survivor_id
    ) x WHERE rn > 1
  );

  -- project_employers
  DELETE FROM project_employers pe
  WHERE pe.id IN (
    SELECT id FROM (
      SELECT id,
             ROW_NUMBER() OVER (
               PARTITION BY project_id, employer_id, role_type
               ORDER BY id
             ) AS rn
      FROM project_employers
      WHERE employer_id = v_survivor_id
    ) x WHERE rn > 1
  );

  -- worksite_scopes
  DELETE FROM worksite_scopes ws
  WHERE ws.id IN (
    SELECT id FROM (
      SELECT id,
             ROW_NUMBER() OVER (
               PARTITION BY worksite_id, scope_id, employer_id
               ORDER BY
                 CASE WHEN engagement_type IS NOT NULL THEN 0 ELSE 1 END,
                 id
             ) AS rn
      FROM worksite_scopes
      WHERE employer_id = v_survivor_id
    ) x WHERE rn > 1
  );

  -- employer_worksite_roles (no unique constraint — thin duplicates)
  DELETE FROM employer_worksite_roles ewr
  WHERE ewr.id IN (
    SELECT id FROM (
      SELECT id,
             ROW_NUMBER() OVER (
               PARTITION BY employer_id, worksite_id, role_type, is_current
               ORDER BY length(COALESCE(notes, '')), id
             ) AS rn
      FROM employer_worksite_roles
      WHERE employer_id = v_survivor_id
    ) x WHERE rn > 1
  );

  -- Fill null scalar fields on survivor from victims (ascending victim id)
  FOREACH v_cur IN ARRAY v_victim_ids
  LOOP
    UPDATE employers surv
    SET
      trading_name = COALESCE(surv.trading_name, v.trading_name),
      abn = COALESCE(surv.abn, v.abn),
      employer_category = COALESCE(surv.employer_category, v.employer_category),
      parent_company = COALESCE(surv.parent_company, v.parent_company),
      website = COALESCE(surv.website, v.website),
      phone = COALESCE(surv.phone, v.phone),
      email = COALESCE(surv.email, v.email),
      address = COALESCE(surv.address, v.address),
      state = COALESCE(surv.state, v.state),
      postcode = COALESCE(surv.postcode, v.postcode),
      updated_at = now()
    FROM employers v
    WHERE surv.employer_id = v_survivor_id
      AND v.employer_id = v_cur;
  END LOOP;

  UPDATE employers
  SET employer_name = v_canonical,
      updated_at = now()
  WHERE employer_id = v_survivor_id;

  -- Insert aliases (dedupe case-insensitive, skip canonical)
  FOR v_rec IN
    SELECT DISTINCT ON (lower(trim(both FROM t.x))) trim(both FROM t.x) AS nm
    FROM unnest(v_alias_names) AS t(x)
    WHERE length(trim(both FROM t.x)) > 0
    ORDER BY lower(trim(both FROM t.x))
  LOOP
    v_name := v_rec.nm;
    IF lower(trim(v_name)) = lower(trim(v_canonical)) THEN
      CONTINUE;
    END IF;
    BEGIN
      INSERT INTO employer_name_aliases (employer_id, alias_name, source, created_by)
      VALUES (v_survivor_id, v_name, 'merge', v_admin_user_id);
      v_aliases_inserted := v_aliases_inserted + 1;
    EXCEPTION
      WHEN unique_violation THEN
        NULL;
    END;
  END LOOP;

  DELETE FROM employers WHERE employer_id = ANY(v_victim_ids);

  INSERT INTO employer_merge_events (
    survivor_employer_id,
    victim_employer_ids,
    performed_by,
    payload
  ) VALUES (
    v_survivor_id,
    v_victim_ids,
    v_admin_user_id,
    jsonb_build_object(
      'canonical_employer_name', v_canonical,
      'alias_names', to_jsonb(v_alias_names),
      'workers_updated', v_workers_updated
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'survivor_employer_id', v_survivor_id,
    'victims_merged', cardinality(v_victim_ids),
    'workers_updated', v_workers_updated,
    'agreement_rows_updated', v_agreements_updated,
    'aliases_inserted', v_aliases_inserted,
    'warnings', v_warnings
  );
END;
$$;

COMMENT ON FUNCTION merge_employers(JSONB) IS
  'Admin-only via API: merge victim employers into survivor, repoint FKs, dedupe junctions, add aliases.';

GRANT EXECUTE ON FUNCTION merge_employers(JSONB) TO service_role;
