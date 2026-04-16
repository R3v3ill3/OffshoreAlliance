-- ============================================================
-- Migration: rating_level lookup
--
-- Canonical 1..5 rating scale with semantic labels and display
-- colours, shared across all assessment surfaces.
--
-- Existing integer rating columns
-- (campaign_activity_ratings.rating, campaign_prospective_workers.rating)
-- continue to store the numeric 1..5 value. NULL rating in
-- campaign_activity_ratings = unassessed; this table adds a row
-- with value=0 so rollup views can LEFT JOIN and surface the
-- unassessed bucket as a first-class state.
--
-- Intended replacement for the drifting SupportLevel varchar
-- enum ('strong_supporter', 'supporter', 'neutral', 'unsupportive',
-- 'hostile') used on call_attempts. Phase 6 will align those
-- records via a separate migration; this migration only defines
-- the source of truth.
-- ============================================================

CREATE TABLE IF NOT EXISTS rating_level (
  value INT PRIMARY KEY,
  code VARCHAR(32) NOT NULL UNIQUE,
  label VARCHAR(80) NOT NULL,
  short_label VARCHAR(24) NOT NULL,
  description TEXT,
  is_supportive BOOLEAN NOT NULL DEFAULT FALSE,
  -- Tailwind background class used by the wall chart / rating chips
  tailwind_bg_class VARCHAR(80) NOT NULL,
  -- Semantic colour token (sky, emerald, amber, red, red-dark, zinc)
  colour_token VARCHAR(20) NOT NULL,
  sort_order INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE rating_level IS
  'Canonical 1..5 + 0 (unassessed) rating scale. Source of truth for '
  'UI labels and colours across assessments, wall-chart, call outcomes.';

INSERT INTO rating_level
  (value, code, label, short_label, description, is_supportive, tailwind_bg_class, colour_token, sort_order)
VALUES
  (0, 'unassessed', 'Unassessed', 'Unassessed',
   'No assessment recorded yet for this worker on this activity / ambition.',
   FALSE, 'bg-zinc-300/80 dark:bg-zinc-600/80', 'zinc', 0),
  (1, 'supportive_leader', 'Supportive leader', 'Leader',
   'Actively encourages other workers to engage; takes on asks.',
   TRUE, 'bg-sky-600/35', 'sky', 1),
  (2, 'supporter', 'Supporter', 'Supporter',
   'Supports the campaign / position but not actively organising others.',
   TRUE, 'bg-emerald-600/35', 'emerald', 2),
  (3, 'neutral', 'Neutral', 'Neutral',
   'Undecided; not yet engaged with the campaign.',
   FALSE, 'bg-amber-600/35', 'amber', 3),
  (4, 'opposed', 'Opposed', 'Opposed',
   'Individually opposes the campaign / position.',
   FALSE, 'bg-red-600/35', 'red', 4),
  (5, 'oppositional_leader', 'Oppositional leader', 'Opp. leader',
   'Actively encourages other workers to oppose or disengage.',
   FALSE, 'bg-red-700/50', 'red-dark', 5)
ON CONFLICT (value) DO UPDATE SET
  code = EXCLUDED.code,
  label = EXCLUDED.label,
  short_label = EXCLUDED.short_label,
  description = EXCLUDED.description,
  is_supportive = EXCLUDED.is_supportive,
  tailwind_bg_class = EXCLUDED.tailwind_bg_class,
  colour_token = EXCLUDED.colour_token,
  sort_order = EXCLUDED.sort_order;

-- RLS: public read, admin-only writes (this is reference data)
ALTER TABLE rating_level ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read rating_level"
  ON rating_level FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin can insert rating_level"
  ON rating_level FOR INSERT TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "Admin can update rating_level"
  ON rating_level FOR UPDATE TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Admin can delete rating_level"
  ON rating_level FOR DELETE TO authenticated
  USING (is_admin());

GRANT SELECT ON rating_level TO authenticated;
