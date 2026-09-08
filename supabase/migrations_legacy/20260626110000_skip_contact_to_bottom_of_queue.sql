-- ============================================================
-- Skip-to-bottom: deprioritise skipped contacts in the share queue
--
-- When a mobile caller skips a contact, the contact should move to
-- the back of the queue so they don't come back immediately. This
-- migration adds:
--   1. skip_count INTEGER on call_list_items (for reporting / ordering)
--   2. skip_call_list_item_for_share RPC — atomically releases any
--      in-progress claim held by this session, increments skip_count,
--      and bumps sort_order to MAX(sort_order)+1 for the list so the
--      contact appears at the back under all sequential strategies.
-- ============================================================

ALTER TABLE call_list_items
  ADD COLUMN IF NOT EXISTS skip_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN call_list_items.skip_count IS
  'Number of times a mobile share caller has skipped this contact. '
  'Used for reporting and tiebreak ordering.';

-- ── RPC ────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION skip_call_list_item_for_share(
  p_item_id     INTEGER,
  p_list_id     INTEGER,
  p_session_label TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_max_sort INTEGER;
  v_updated  BOOLEAN;
BEGIN
  -- Snapshot the current highest sort_order in the list so we can push
  -- the skipped contact behind all currently-queued contacts.
  SELECT COALESCE(MAX(sort_order), 0)
  INTO   v_max_sort
  FROM   call_list_items
  WHERE  list_id = p_list_id;

  -- Update the target item:
  --   • If it is in_progress and claimed by this session  → release + deprioritise
  --   • If it is already pending (claim cleared by a prior recordAttempt) → deprioritise only
  -- Items that are completed, deferred, or claimed by someone else are left untouched.
  UPDATE call_list_items SET
    status                   = 'pending',
    claimed_at               = NULL,
    claimed_by_session_label = NULL,
    claimed_by_worker_id     = NULL,
    claimed_by_share_token_id = NULL,
    skip_count               = skip_count + 1,
    sort_order               = v_max_sort + 1,
    updated_at               = now()
  WHERE item_id  = p_item_id
    AND list_id  = p_list_id
    AND (
      -- Pre-call skip: item is still in_progress with our claim
      (status = 'in_progress' AND claimed_by_session_label = p_session_label)
      OR
      -- Post-attempt skip: recordAttempt already set status=pending/cleared claim
      status = 'pending'
    )
  RETURNING true
  INTO v_updated;

  RETURN COALESCE(v_updated, false);
END;
$$;

REVOKE ALL ON FUNCTION skip_call_list_item_for_share(INTEGER, INTEGER, TEXT) FROM PUBLIC;
