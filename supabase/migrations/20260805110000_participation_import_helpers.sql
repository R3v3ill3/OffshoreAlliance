-- ============================================================
-- Migration: participation import helper functions
--
--   * normalise_phone_au  — SQL twin of the TS normalisePhone in
--     src/lib/import/worker-matching.ts (keep the two in sync).
--   * match_workers_for_import — candidate lookup for the import
--     wizard's match step: one round trip instead of paging the
--     whole workers table through the API route.
--   * apply_participation_import — set-based wrapper that funnels
--     every imported row through record_assessment_event in a
--     single round trip.
-- ============================================================

-- -----------------------------------------------------------
-- 1. AU phone normalisation (immutable, index-friendly)
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION normalise_phone_au(p TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN digits = '' THEN NULL
    WHEN length(digits) = 9 THEN '0' || digits
    WHEN length(digits) = 10 AND digits LIKE '0%' THEN digits
    WHEN length(digits) = 11 AND digits LIKE '61%' THEN '0' || substr(digits, 3)
    WHEN length(digits) = 12 AND digits LIKE '610%' THEN '0' || substr(digits, 4)
    ELSE digits
  END
  FROM (SELECT regexp_replace(coalesce(p, ''), '\D', '', 'g') AS digits) d;
$$;

-- -----------------------------------------------------------
-- 2. Candidate lookup for the match step.
--    Inputs are pre-normalised by the caller:
--      p_emails    — lower-cased email addresses
--      p_phones    — normalise_phone_au() outputs
--      p_name_keys — lower(first) || '||' || lower(last), single-spaced
--    SECURITY INVOKER: workers RLS applies to the calling user.
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION match_workers_for_import(
  p_emails TEXT[] DEFAULT '{}',
  p_phones TEXT[] DEFAULT '{}',
  p_name_keys TEXT[] DEFAULT '{}'
) RETURNS TABLE (
  worker_id INT,
  first_name VARCHAR,
  last_name VARCHAR,
  preferred_name VARCHAR,
  email VARCHAR,
  phone VARCHAR
)
LANGUAGE sql STABLE AS $$
  WITH name_norm AS (
    SELECT
      w.worker_id,
      regexp_replace(lower(btrim(w.first_name)), '\s+', ' ', 'g') || '||' ||
        regexp_replace(lower(btrim(w.last_name)), '\s+', ' ', 'g') AS name_key,
      CASE WHEN w.preferred_name IS NOT NULL AND btrim(w.preferred_name) <> '' THEN
        regexp_replace(lower(btrim(w.preferred_name)), '\s+', ' ', 'g') || '||' ||
          regexp_replace(lower(btrim(w.last_name)), '\s+', ' ', 'g')
      END AS preferred_key
    FROM workers w
  )
  SELECT DISTINCT w.worker_id, w.first_name, w.last_name, w.preferred_name, w.email, w.phone
  FROM workers w
  LEFT JOIN name_norm n ON n.worker_id = w.worker_id
  WHERE
    (cardinality(p_emails) > 0 AND lower(btrim(coalesce(w.email, ''))) = ANY (p_emails))
    OR (cardinality(p_phones) > 0 AND normalise_phone_au(w.phone) = ANY (p_phones))
    OR (cardinality(p_name_keys) > 0 AND (
      n.name_key = ANY (p_name_keys)
      OR n.preferred_key = ANY (p_name_keys)
    ));
$$;

GRANT EXECUTE ON FUNCTION match_workers_for_import TO authenticated;

-- -----------------------------------------------------------
-- 3. Set-based apply: one round trip for the whole batch.
--    p_rows: [{"worker_id":1,"rating":2,"binary_value":null,"notes":null}, …]
--    Each row funnels through record_assessment_event (SECURITY
--    DEFINER) so validation + COALESCE-merge semantics stay in
--    one place. Returns the number of rows applied.
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION apply_participation_import(
  p_activity_id INT,
  p_rows JSONB,
  p_source VARCHAR DEFAULT 'an_report_import',
  p_rating_phase VARCHAR DEFAULT 'actual',
  p_actor_id UUID DEFAULT NULL,
  p_import_batch_id INT DEFAULT NULL
) RETURNS INT
LANGUAGE plpgsql AS $$
DECLARE
  r RECORD;
  v_count INT := 0;
BEGIN
  FOR r IN
    SELECT * FROM jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb))
      AS x(worker_id INT, rating INT, binary_value TEXT, notes TEXT)
  LOOP
    IF r.worker_id IS NULL THEN
      CONTINUE;
    END IF;
    PERFORM record_assessment_event(
      p_activity_id := p_activity_id,
      p_worker_id := r.worker_id,
      p_rating := r.rating,
      p_binary_value := r.binary_value,
      p_rating_phase := p_rating_phase,
      p_event_id := NULL,
      p_source := p_source,
      p_notes := r.notes,
      p_actor_id := p_actor_id,
      p_import_batch_id := p_import_batch_id
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION apply_participation_import TO authenticated;
