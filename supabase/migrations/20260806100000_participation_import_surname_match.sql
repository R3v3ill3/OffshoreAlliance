-- ============================================================
-- Migration: surname-only candidate lookup for participation import
--
-- Exact email/phone/full-name matching misses workers with no email
-- and name variants ("Steve" vs "Stephen"). Adding a surname-key
-- input lets the match step surface last-name candidates for the
-- user to confirm, instead of silently creating a duplicate worker.
--
-- The 3-arg signature is dropped first: PostgREST cannot disambiguate
-- overloads that differ only by defaulted parameters.
-- ============================================================

DROP FUNCTION IF EXISTS match_workers_for_import(TEXT[], TEXT[], TEXT[]);

CREATE FUNCTION match_workers_for_import(
  p_emails TEXT[] DEFAULT '{}',
  p_phones TEXT[] DEFAULT '{}',
  p_name_keys TEXT[] DEFAULT '{}',
  p_last_names TEXT[] DEFAULT '{}'
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
      END AS preferred_key,
      regexp_replace(lower(btrim(w.last_name)), '\s+', ' ', 'g') AS last_key
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
    ))
  UNION
  -- Surname-only candidates, capped so common surnames can't flood the
  -- response. These are suggestions for user confirmation, never
  -- auto-matches.
  SELECT s.worker_id, s.first_name, s.last_name, s.preferred_name, s.email, s.phone
  FROM (
    SELECT w.worker_id, w.first_name, w.last_name, w.preferred_name, w.email, w.phone
    FROM workers w
    JOIN name_norm n ON n.worker_id = w.worker_id
    WHERE cardinality(p_last_names) > 0 AND n.last_key = ANY (p_last_names)
    LIMIT 500
  ) s;
$$;

GRANT EXECUTE ON FUNCTION match_workers_for_import TO authenticated;
