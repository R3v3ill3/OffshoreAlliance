-- Phase F — phone_call_actions lifecycle
-- F1. Replace list_ids INTEGER[] array with a proper FK join table.
--     The list_ids column is retained temporarily (dropped in Phase J).

CREATE TABLE IF NOT EXISTS phone_call_action_lists (
  action_id  INTEGER NOT NULL REFERENCES phone_call_actions(action_id) ON DELETE CASCADE,
  list_id    INTEGER NOT NULL REFERENCES call_lists(list_id) ON DELETE CASCADE,
  position   INTEGER NOT NULL DEFAULT 0,
  linked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (action_id, list_id)
);

COMMENT ON TABLE phone_call_action_lists IS
  'Join table linking a phone_call_actions session to its call_lists. Replaces the deprecated list_ids INTEGER[] array on phone_call_actions.';

CREATE INDEX IF NOT EXISTS idx_pcal_list ON phone_call_action_lists(list_id);

ALTER TABLE phone_call_action_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read phone_call_action_lists"
  ON phone_call_action_lists FOR SELECT TO authenticated USING (true);

CREATE POLICY "Campaign writers can insert phone_call_action_lists"
  ON phone_call_action_lists FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM phone_call_actions pca
      JOIN campaigns c ON c.campaign_id = pca.campaign_id
      WHERE pca.action_id = phone_call_action_lists.action_id
        AND can_write_to_campaign(c.campaign_id)
    )
  );

-- Backfill from the existing list_ids array — only for list_ids that still exist
INSERT INTO phone_call_action_lists (action_id, list_id, position)
SELECT
  pca.action_id,
  lid,
  ordinality - 1 AS position
FROM phone_call_actions pca,
     UNNEST(COALESCE(pca.list_ids, '{}'::INTEGER[])) WITH ORDINALITY AS t(lid, ordinality)
WHERE pca.list_ids IS NOT NULL
  AND array_length(pca.list_ids, 1) > 0
  AND EXISTS (SELECT 1 FROM call_lists cl WHERE cl.list_id = lid)
  AND NOT EXISTS (
    SELECT 1 FROM phone_call_action_lists pcal
    WHERE pcal.action_id = pca.action_id AND pcal.list_id = lid
  );

-- list_ids column kept for backward compat; will be dropped in Phase J
COMMENT ON COLUMN phone_call_actions.list_ids IS
  '@deprecated: Use phone_call_action_lists join table instead. Column will be dropped in Phase J.';
