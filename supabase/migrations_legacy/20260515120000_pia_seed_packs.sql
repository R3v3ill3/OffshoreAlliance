-- ============================================================
-- Migration: PIA seed-pack functions
--
-- Two helper functions that seed campaign_activities rows for
-- a given campaign following the standard escalating-action
-- ladder patterns for offshore vs shore-based workplaces.
--
-- activity_kind='industrial_action' requires the Wave 3 migration
-- that extended the activity_kind CHECK constraint.
--
-- Both functions are idempotent (ON CONFLICT DO NOTHING on the
-- (campaign_id, template_key) pair). They also insert a row into
-- pia_seed_packs if not already present.
-- ============================================================

-- ── Offshore standard seed pack ────────────────────────────

CREATE OR REPLACE FUNCTION seed_pia_pack_offshore_standard(p_campaign_id INT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Seed the pia_seed_packs metadata row (idempotent)
  INSERT INTO pia_seed_packs (pack_key, label, description, action_types)
  VALUES (
    'offshore_standard',
    'Offshore Standard',
    'Standard escalating ladder for FIFO/swing-roster offshore petroleum workers',
    ARRAY[
      'work_ban_helideck',
      'work_ban_lifting_gear',
      'work_ban_permits',
      'overtime_ban',
      'stoppage_swing_meeting',
      'stoppage_4hr',
      'stoppage_12hr',
      'stoppage_24hr',
      'stoppage_48hr',
      'indefinite_strike'
    ]
  )
  ON CONFLICT (pack_key) DO NOTHING;

  -- Seed campaign_activities rows
  -- Uses template_key as the idempotency key within the campaign.
  -- ON CONFLICT requires a UNIQUE constraint on (campaign_id, template_key).
  -- We use INSERT ... WHERE NOT EXISTS for broader compatibility.

  INSERT INTO campaign_activities
    (campaign_id, title, template_key, activity_kind, is_binary, is_custom)
  SELECT * FROM (VALUES
    (p_campaign_id, 'Bargaining pledge signed',          'bargaining_pledge_signed',    'assessment',        true, false),
    (p_campaign_id, 'PABO pledge: vote yes',             'pabo_pledge_vote_yes',        'industrial_action', true, false),
    (p_campaign_id, 'PABO voted yes',                    'pabo_voted_yes',              'industrial_action', true, false),
    (p_campaign_id, 'Work ban: helideck (expected)',     'work_ban_helideck_expected',  'industrial_action', true, false),
    (p_campaign_id, 'Work ban: helideck (actual)',       'work_ban_helideck',           'industrial_action', true, false),
    (p_campaign_id, 'Work ban: lifting gear (expected)', 'work_ban_lifting_gear_expected', 'industrial_action', true, false),
    (p_campaign_id, 'Work ban: lifting gear (actual)',   'work_ban_lifting_gear',       'industrial_action', true, false),
    (p_campaign_id, 'Work ban: permits (expected)',      'work_ban_permits_expected',   'industrial_action', true, false),
    (p_campaign_id, 'Work ban: permits (actual)',        'work_ban_permits',            'industrial_action', true, false),
    (p_campaign_id, 'Overtime ban (expected)',           'overtime_ban_expected',       'industrial_action', true, false),
    (p_campaign_id, 'Overtime ban (actual)',             'overtime_ban',                'industrial_action', true, false),
    (p_campaign_id, 'Stoppage: swing meeting (expected)','stoppage_swing_meeting_expected', 'industrial_action', true, false),
    (p_campaign_id, 'Stoppage: swing meeting (actual)',  'stoppage_swing_meeting',      'industrial_action', true, false),
    (p_campaign_id, 'Stoppage: 4hr (expected)',          'stoppage_4hr_expected',       'industrial_action', true, false),
    (p_campaign_id, 'Stoppage: 4hr (actual)',            'stoppage_4hr',                'industrial_action', true, false),
    (p_campaign_id, 'Stoppage: 12hr (expected)',         'stoppage_12hr_expected',      'industrial_action', true, false),
    (p_campaign_id, 'Stoppage: 12hr (actual)',           'stoppage_12hr',               'industrial_action', true, false),
    (p_campaign_id, 'Stoppage: 24hr (expected)',         'stoppage_24hr_expected',      'industrial_action', true, false),
    (p_campaign_id, 'Stoppage: 24hr (actual)',           'stoppage_24hr',               'industrial_action', true, false),
    (p_campaign_id, 'Stoppage: 48hr (expected)',         'stoppage_48hr_expected',      'industrial_action', true, false),
    (p_campaign_id, 'Stoppage: 48hr (actual)',           'stoppage_48hr',               'industrial_action', true, false),
    (p_campaign_id, 'Indefinite strike (expected)',      'indefinite_strike_expected',  'industrial_action', true, false),
    (p_campaign_id, 'Indefinite strike (actual)',        'indefinite_strike',           'industrial_action', true, false),
    (p_campaign_id, 'EBA vote yes',                      'eba_vote_yes',                'industrial_action', true, false)
  ) AS v(campaign_id, title, template_key, activity_kind, is_binary, is_custom)
  WHERE NOT EXISTS (
    SELECT 1 FROM campaign_activities ca
    WHERE ca.campaign_id = v.campaign_id
      AND ca.template_key = v.template_key
  );
END;
$$;

-- ── Shore-based standard seed pack ─────────────────────────

CREATE OR REPLACE FUNCTION seed_pia_pack_shore_based_standard(p_campaign_id INT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Seed the pia_seed_packs metadata row (idempotent)
  INSERT INTO pia_seed_packs (pack_key, label, description, action_types)
  VALUES (
    'shore_based_standard',
    'Shore-based Standard',
    'Standard escalating ladder for shore-based workers',
    ARRAY[
      'work_ban',
      'overtime_ban',
      'stoppage_4hr',
      'stoppage_24hr',
      'stoppage_48hr',
      'indefinite_strike',
      'picket_solidarity'
    ]
  )
  ON CONFLICT (pack_key) DO NOTHING;

  -- Seed campaign_activities rows
  INSERT INTO campaign_activities
    (campaign_id, title, template_key, activity_kind, is_binary, is_custom)
  SELECT * FROM (VALUES
    (p_campaign_id, 'Work ban',                   'work_ban',                'industrial_action', true, false),
    (p_campaign_id, 'Overtime ban',               'overtime_ban',            'industrial_action', true, false),
    (p_campaign_id, 'Stoppage: 4hr',              'stoppage_4hr',            'industrial_action', true, false),
    (p_campaign_id, 'Stoppage: 24hr',             'stoppage_24hr',           'industrial_action', true, false),
    (p_campaign_id, 'Stoppage: 48hr',             'stoppage_48hr',           'industrial_action', true, false),
    (p_campaign_id, 'Indefinite strike',          'indefinite_strike',       'industrial_action', true, false),
    (p_campaign_id, 'Picket / solidarity action', 'picket_solidarity',       'industrial_action', true, false)
  ) AS v(campaign_id, title, template_key, activity_kind, is_binary, is_custom)
  WHERE NOT EXISTS (
    SELECT 1 FROM campaign_activities ca
    WHERE ca.campaign_id = v.campaign_id
      AND ca.template_key = v.template_key
  );
END;
$$;

-- Grant execute to authenticated users (organiser staff call these)
GRANT EXECUTE ON FUNCTION seed_pia_pack_offshore_standard(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION seed_pia_pack_shore_based_standard(INT) TO authenticated;
