-- ============================================================
-- Designated caller on call share tokens
--
-- Adds an optional designated_worker_id to call_share_tokens so
-- that when an organiser issues a link specifically for one person,
-- the mobile gate can pre-identify them and skip the lottery list.
-- ============================================================

ALTER TABLE call_share_tokens
  ADD COLUMN IF NOT EXISTS designated_worker_id INTEGER
    REFERENCES workers(worker_id) ON DELETE SET NULL;

COMMENT ON COLUMN call_share_tokens.designated_worker_id IS
  'Optional worker this link was issued for. When set the mobile gate'
  ' pre-selects this worker so they do not have to search for themselves.';
