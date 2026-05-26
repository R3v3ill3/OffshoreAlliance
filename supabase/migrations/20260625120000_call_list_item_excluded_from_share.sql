-- ============================================================
-- Coordinator re-allocation: per-item share-pool exclusion
--
-- Adds `excluded_from_share BOOLEAN` to `call_list_items` so a coordinator
-- can pull a single contact back from the share pool without removing them
-- from the list entirely. The share-link `claim_next_call_list_item` and
-- the share-link `/next` route both honour this flag; staff /next ignores
-- it so the coordinator can still call the worker themselves.
-- ============================================================

ALTER TABLE call_list_items
  ADD COLUMN IF NOT EXISTS excluded_from_share BOOLEAN NOT NULL DEFAULT false;

-- Wrap the existing claim function so share callers skip excluded items.
-- The desktop staff /next path uses the unwrapped function directly.
CREATE OR REPLACE FUNCTION claim_next_call_list_item_for_share(
  p_list_id INTEGER,
  p_session_label TEXT,
  p_session_worker_id INTEGER DEFAULT NULL,
  p_claim_ttl_seconds INTEGER DEFAULT 900,
  p_share_token_id INTEGER DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  v_item_id INTEGER;
BEGIN
  WITH parent_list AS (
    SELECT list_id, priority_strategy
    FROM call_lists
    WHERE list_id = p_list_id
  ),
  candidate AS (
    SELECT cli.item_id
    FROM call_list_items cli
    JOIN parent_list pl ON pl.list_id = cli.list_id
    WHERE cli.list_id = p_list_id
      AND cli.excluded_from_share = false
      AND (
        cli.status = 'pending'
        OR (
          cli.status = 'in_progress'
          AND cli.claimed_at IS NOT NULL
          AND cli.claimed_at < now() - make_interval(secs => GREATEST(p_claim_ttl_seconds, 1))
        )
        OR (
          cli.status = 'deferred'
          AND cli.next_call_at IS NOT NULL
          AND cli.next_call_at <= now()
        )
      )
    ORDER BY
      CASE WHEN pl.priority_strategy = 'priority_score' THEN cli.priority_score END DESC NULLS LAST,
      CASE WHEN pl.priority_strategy = 'least_recently_contacted' THEN cli.last_attempt_at END ASC NULLS FIRST,
      cli.sort_order ASC,
      cli.item_id ASC
    LIMIT 1
    FOR UPDATE OF cli SKIP LOCKED
  )
  UPDATE call_list_items cli
  SET
    status = 'in_progress',
    claimed_at = now(),
    claimed_by_session_label = LEFT(p_session_label, 80),
    claimed_by_worker_id = p_session_worker_id,
    claimed_by_share_token_id = p_share_token_id,
    updated_at = now()
  FROM candidate
  WHERE cli.item_id = candidate.item_id
  RETURNING cli.item_id INTO v_item_id;

  RETURN v_item_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
