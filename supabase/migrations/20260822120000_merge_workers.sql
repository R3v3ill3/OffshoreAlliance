-- Merge duplicate worker records: remap every FK pointing at workers,
-- then delete the victim rows. Conflict rows on unique (campaign, worker)
-- style indexes are dropped so the survivor's row is kept.

CREATE OR REPLACE FUNCTION remap_worker_id(p_from INT, p_to INT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  idx RECORD;
  other_cols TEXT[];
  join_pred TEXT;
  col TEXT;
  i INT;
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_from = p_to THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT n.nspname AS nsp, c.relname AS tbl, a.attname AS col
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN unnest(con.conkey) WITH ORDINALITY AS ck(attnum, ord) ON true
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ck.attnum
    WHERE con.confrelid = 'public.workers'::regclass
      AND con.contype = 'f'
      AND n.nspname = 'public'
  LOOP
    FOR idx IN
      SELECT array_agg(att.attname ORDER BY x.n) FILTER (WHERE x.attnum > 0) AS cols
      FROM pg_index ix
      JOIN pg_class t ON t.oid = ix.indrelid
      JOIN pg_namespace nsp ON nsp.oid = t.relnamespace
      JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS x(attnum, n) ON true
      JOIN pg_attribute att ON att.attrelid = t.oid AND att.attnum = x.attnum
      WHERE nsp.nspname = r.nsp
        AND t.relname = r.tbl
        AND ix.indisunique
      GROUP BY ix.indexrelid
      HAVING bool_or(att.attname = r.col)
    LOOP
      IF idx.cols IS NULL THEN
        CONTINUE;
      END IF;
      other_cols := ARRAY(
        SELECT c FROM unnest(idx.cols) AS c WHERE c <> r.col
      );
      IF coalesce(array_length(other_cols, 1), 0) = 0 THEN
        -- Unique on worker_id alone: drop the duplicate only when the
        -- survivor already has a row. Otherwise remap so victim-only
        -- 1:1 data is kept.
        EXECUTE format(
          'DELETE FROM %I.%I WHERE %I = $1 AND EXISTS (SELECT 1 FROM %I.%I s WHERE s.%I = $2)',
          r.nsp, r.tbl, r.col, r.nsp, r.tbl, r.col
        ) USING p_from, p_to;
      ELSE
        join_pred := '';
        i := 1;
        FOREACH col IN ARRAY other_cols
        LOOP
          IF i > 1 THEN
            join_pred := join_pred || ' AND ';
          END IF;
          join_pred := join_pred || format('v.%I IS NOT DISTINCT FROM s.%I', col, col);
          i := i + 1;
        END LOOP;
        EXECUTE format(
          'DELETE FROM %I.%I v USING %I.%I s WHERE v.%I = $1 AND s.%I = $2 AND %s',
          r.nsp, r.tbl, r.nsp, r.tbl, r.col, r.col, join_pred
        ) USING p_from, p_to;
      END IF;
    END LOOP;

    EXECUTE format(
      'UPDATE %I.%I SET %I = $2 WHERE %I = $1',
      r.nsp, r.tbl, r.col, r.col
    ) USING p_from, p_to;
  END LOOP;

  IF to_regclass('public.worker_campaign_fact_history') IS NOT NULL THEN
    UPDATE worker_campaign_fact_history
    SET worker_id = p_to
    WHERE worker_id = p_from;
  END IF;

  DELETE FROM campaign_leader_worker_links
  WHERE leader_worker_id = follower_worker_id;
END;
$$;

CREATE OR REPLACE FUNCTION merge_workers(
  p_survivor_id INT,
  p_victim_ids INT[],
  p_campaign_id INT DEFAULT NULL,
  p_actor_id UUID DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_victim INT;
  v_from workers%ROWTYPE;
  v_to workers%ROWTYPE;
  v_merged INT := 0;
  v_note TEXT;
BEGIN
  IF p_survivor_id IS NULL OR p_victim_ids IS NULL OR cardinality(p_victim_ids) < 1 THEN
    RAISE EXCEPTION 'merge_workers: survivor and at least one duplicate are required';
  END IF;

  IF auth.uid() IS NULL THEN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'merge_workers: permission denied'
        USING ERRCODE = '42501';
    END IF;
  ELSIF NOT (
    is_admin() OR (p_campaign_id IS NOT NULL AND can_write_to_campaign(p_campaign_id))
  ) THEN
    RAISE EXCEPTION 'merge_workers: permission denied'
      USING ERRCODE = '42501';
  END IF;

  IF p_campaign_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM campaign_worker_membership
      WHERE campaign_id = p_campaign_id AND worker_id = p_survivor_id
    ) THEN
      RAISE EXCEPTION 'merge_workers: keep record % is not in this campaign', p_survivor_id;
    END IF;
    IF EXISTS (
      SELECT 1 FROM unnest(p_victim_ids) AS v(id)
      WHERE id <> p_survivor_id
        AND NOT EXISTS (
          SELECT 1 FROM campaign_worker_membership
          WHERE campaign_id = p_campaign_id AND worker_id = v.id
        )
    ) THEN
      RAISE EXCEPTION 'merge_workers: every duplicate must be in this campaign';
    END IF;
  END IF;

  SELECT * INTO v_to FROM workers WHERE worker_id = p_survivor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'merge_workers: worker % not found', p_survivor_id;
  END IF;

  FOREACH v_victim IN ARRAY p_victim_ids
  LOOP
    IF v_victim = p_survivor_id THEN
      CONTINUE;
    END IF;
    SELECT * INTO v_from FROM workers WHERE worker_id = v_victim;
    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    IF v_to.reference_id IS NOT NULL AND v_from.reference_id IS NOT NULL THEN
      UPDATE workers SET reference_id = NULL WHERE worker_id = v_victim;
    END IF;

    UPDATE workers SET
      email = COALESCE(NULLIF(btrim(email), ''), NULLIF(btrim(v_from.email), '')),
      phone = COALESCE(NULLIF(btrim(phone), ''), NULLIF(btrim(v_from.phone), '')),
      phone_e164 = COALESCE(phone_e164, v_from.phone_e164),
      preferred_name = COALESCE(NULLIF(btrim(preferred_name), ''), NULLIF(btrim(v_from.preferred_name), '')),
      address = COALESCE(NULLIF(btrim(address), ''), NULLIF(btrim(v_from.address), '')),
      suburb = COALESCE(NULLIF(btrim(suburb), ''), NULLIF(btrim(v_from.suburb), '')),
      state = COALESCE(NULLIF(btrim(state), ''), NULLIF(btrim(v_from.state), '')),
      postcode = COALESCE(NULLIF(btrim(postcode), ''), NULLIF(btrim(v_from.postcode), '')),
      date_of_birth = COALESCE(date_of_birth, v_from.date_of_birth),
      occupation = COALESCE(NULLIF(btrim(occupation), ''), NULLIF(btrim(v_from.occupation), '')),
      canonical_occupation_id = COALESCE(canonical_occupation_id, v_from.canonical_occupation_id),
      employer_id = COALESCE(employer_id, v_from.employer_id),
      worksite_id = COALESCE(worksite_id, v_from.worksite_id),
      member_role_type_id = COALESCE(member_role_type_id, v_from.member_role_type_id),
      union_membership_type_id = COALESCE(union_membership_type_id, v_from.union_membership_type_id),
      action_network_id = COALESCE(action_network_id, v_from.action_network_id),
      reference_id = COALESCE(reference_id, v_from.reference_id),
      is_hsr = COALESCE(is_hsr, false) OR COALESCE(v_from.is_hsr, false),
      is_bargaining_rep = COALESCE(is_bargaining_rep, false) OR COALESCE(v_from.is_bargaining_rep, false),
      notes = CASE
        WHEN notes IS NULL OR btrim(notes) = '' THEN v_from.notes
        WHEN v_from.notes IS NULL OR btrim(v_from.notes) = '' THEN notes
        ELSE notes || E'\n\n' || v_from.notes
      END
    WHERE worker_id = p_survivor_id;

    SELECT * INTO v_to FROM workers WHERE worker_id = p_survivor_id;

    PERFORM remap_worker_id(v_victim, p_survivor_id);
    DELETE FROM workers WHERE worker_id = v_victim;
    v_merged := v_merged + 1;
  END LOOP;

  IF v_merged = 0 THEN
    RETURN 0;
  END IF;

  v_note := format(
    'Merged duplicate worker record(s) %s into this worker.',
    array_to_string(p_victim_ids, ', ')
  );
  INSERT INTO worker_notes (worker_id, campaign_id, note_text, created_by)
  VALUES (
    p_survivor_id,
    p_campaign_id,
    v_note,
    COALESCE(p_actor_id, auth.uid())
  );

  RETURN v_merged;
END;
$$;

REVOKE ALL ON FUNCTION remap_worker_id(INT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION remap_worker_id(INT, INT) FROM anon, authenticated;
REVOKE ALL ON FUNCTION merge_workers(INT, INT[], INT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION merge_workers(INT, INT[], INT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION merge_workers(INT, INT[], INT, UUID) TO authenticated;

COMMENT ON FUNCTION merge_workers IS
  'Collapse duplicate workers into a survivor: remap FKs, copy blank identity fields, delete victims.';
