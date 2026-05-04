-- ============================================================
-- Migration 20260518100000: Fix situation analysis type alignment
--
-- 1. Backfill worker_support_estimate rows stored as a plain JSON number
--    (written by the step-7 wizard before the WorkerSupportEstimate JSONB
--    object shape was enforced). Converts { value: 65 } → { percent_supportive_estimated: 65 }.
--
-- 2. Rename key_disputes[*].issue_label → topic to align with the canonical
--    field name used by the Phase 2 wizard, db-types, and the DB schema comment.
--    Without this rename, disputes saved via wizard step 7 render as blank in
--    SituationAnalysisCard (which reads d.topic).
-- ============================================================

-- ── 1. Backfill worker_support_estimate plain-number → object ─────────────────
UPDATE campaign_situation_analyses
SET worker_support_estimate = jsonb_build_object(
  'percent_supportive_estimated', (worker_support_estimate::text)::numeric
)
WHERE worker_support_estimate IS NOT NULL
  AND jsonb_typeof(worker_support_estimate) = 'number';

-- ── 2. Rename key_disputes[*].issue_label → topic ────────────────────────────
UPDATE campaign_situation_analyses
SET key_disputes = (
  SELECT jsonb_agg(
    CASE
      WHEN item ? 'issue_label'
      THEN item - 'issue_label' || jsonb_build_object('topic', item->>'issue_label')
      ELSE item
    END
  )
  FROM jsonb_array_elements(key_disputes) AS item
)
WHERE key_disputes != '[]'::jsonb
  AND key_disputes IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(key_disputes) AS item WHERE item ? 'issue_label'
  );
