-- ============================================================
-- Fix: reset call_list_items stuck as in_progress with no claim
--
-- Before the call-share migration, the staff /next route set items
-- to in_progress without writing claimed_at.  Those items now have
-- status='in_progress' AND claimed_at IS NULL, so claim_next_call_list_item
-- will never pick them up (it only reclaims in_progress rows where
-- claimed_at < now() - TTL).  Return them to 'pending'.
-- ============================================================

UPDATE call_list_items
SET
  status = 'pending',
  updated_at = now()
WHERE
  status = 'in_progress'
  AND claimed_at IS NULL;
