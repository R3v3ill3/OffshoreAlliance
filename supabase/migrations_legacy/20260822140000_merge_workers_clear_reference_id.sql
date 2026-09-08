-- Clear the duplicate's reference_id before copying it onto the kept
-- worker. The previous both-not-null check left a unique violation when
-- only the duplicate had a membership reference id.

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

    UPDATE workers SET reference_id = NULL WHERE worker_id = v_victim;

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

REVOKE ALL ON FUNCTION merge_workers(INT, INT[], INT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION merge_workers(INT, INT[], INT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION merge_workers(INT, INT[], INT, UUID) TO authenticated;
