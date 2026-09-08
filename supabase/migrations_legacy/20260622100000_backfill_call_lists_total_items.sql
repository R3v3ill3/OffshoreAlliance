-- Backfill call_lists.total_items for lists where items were inserted but the
-- denormalized counter was never updated (e.g. Build List → Fire to Phone before
-- the fire/phone route was patched to set total_items after bulk insert).

UPDATE call_lists cl
SET total_items = sub.cnt
FROM (
  SELECT list_id, COUNT(*)::int AS cnt
  FROM call_list_items
  GROUP BY list_id
) sub
WHERE cl.list_id = sub.list_id
  AND cl.total_items = 0
  AND sub.cnt > 0;
