-- Per-person initiating message on a P2P chat board.
-- NULL = use the board's shared draft body. Non-null = organiser
-- customised this row (merge fields still resolve at send time).

ALTER TABLE sms_list_items
  ADD COLUMN IF NOT EXISTS body_override TEXT;

COMMENT ON COLUMN sms_list_items.body_override IS
  'P2P chat boards: optional per-item initiating message. NULL uses the '
  'list draft body. Merge tokens ({{first_name}} etc.) still resolve at '
  'send. Unused by blast lists.';
