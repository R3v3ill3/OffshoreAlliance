-- ============================================================
-- Mobile dialer redesign — claim attribution, renewal, force-release
--
-- This migration:
--   1. Adds `claimed_by_share_token_id` to `call_list_items` so each soft
--      claim records which `call_share_tokens` row issued the session that
--      placed it (NULL for staff-side claims).
--   2. Extends `claim_next_call_list_item` to accept that token id and to
--      write it on the claim row, while remaining backwards-compatible
--      with the existing callers (NULL defaults).
--   3. Adds `renew_call_list_item_claim` so the mobile dialer can push
--      `claimed_at` forward on active user interaction, preventing the TTL
--      from expiring mid-call.
--   4. Adds `force_release_claims_for_token` so coordinators can release
--      every claim held by sessions that came in via a given share token
--      (used by the revoke flow and the live-action dashboard).
-- ============================================================

ALTER TABLE call_list_items
  ADD COLUMN IF NOT EXISTS claimed_by_share_token_id INTEGER
    REFERENCES call_share_tokens(token_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_call_list_items_claimed_by_share_token
  ON call_list_items(claimed_by_share_token_id)
  WHERE claimed_by_share_token_id IS NOT NULL;

-- Re-declare with the new parameter. The existing 4-arg form is kept as
-- a thin wrapper so existing callers continue to compile.
DROP FUNCTION IF EXISTS claim_next_call_list_item(
  INTEGER, TEXT, INTEGER, INTEGER
);

CREATE OR REPLACE FUNCTION claim_next_call_list_item(
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

-- Renewal — extends the claim TTL when the holder is actively working
-- the contact. Returns a JSON envelope so the client can read the new
-- `claimed_at` (used to drive the on-screen countdown).
CREATE OR REPLACE FUNCTION renew_call_list_item_claim(
  p_item_id INTEGER,
  p_session_label TEXT,
  p_claim_ttl_seconds INTEGER DEFAULT 900
)
RETURNS JSONB AS $$
DECLARE
  v_claimed_at TIMESTAMPTZ;
BEGIN
  UPDATE call_list_items
  SET
    claimed_at = now(),
    updated_at = now()
  WHERE item_id = p_item_id
    AND status = 'in_progress'
    AND claimed_by_session_label = LEFT(p_session_label, 80)
    AND claimed_at IS NOT NULL
    AND claimed_at > now() - make_interval(secs => GREATEST(p_claim_ttl_seconds, 1))
  RETURNING claimed_at INTO v_claimed_at;

  RETURN jsonb_build_object(
    'renewed', v_claimed_at IS NOT NULL,
    'claimed_at', v_claimed_at
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Coordinator-side bulk release for an entire share token.
CREATE OR REPLACE FUNCTION force_release_claims_for_token(
  p_token_id INTEGER
)
RETURNS JSONB AS $$
DECLARE
  v_released_count INTEGER := 0;
BEGIN
  IF p_token_id IS NULL THEN
    RETURN jsonb_build_object('released_count', 0);
  END IF;

  WITH released AS (
    UPDATE call_list_items
    SET
      status = 'pending',
      claimed_at = NULL,
      claimed_by_session_label = NULL,
      claimed_by_worker_id = NULL,
      claimed_by_share_token_id = NULL,
      updated_at = now()
    WHERE status = 'in_progress'
      AND claimed_by_share_token_id = p_token_id
    RETURNING item_id
  )
  SELECT COUNT(*) INTO v_released_count FROM released;

  RETURN jsonb_build_object('released_count', v_released_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
