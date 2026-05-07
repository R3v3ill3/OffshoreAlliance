-- ============================================================
-- Section Planning module — Phase 3 of 10
--
-- (a) section_plan_situation_snippets — per-section situation
--     summary mirroring the OA Field Plan Template's "Current
--     Situation" subsections (Status, Key event, Agreement expiry
--     override, Strategic context, Workforce summary, Notes).
--
-- (b) v_section_plan_workforce_mapping — auto-derived per-worksite
--     worker / member / density rows for the Workforce Mapping
--     table (artefact A).
--
-- (c) section_plan_workforce_mapping_overrides — per-section
--     hand-corrections that don't mutate campaign-level data.
--
-- (d) seed_section_situation_snippet RPC — pulls latest current
--     campaign_situation_analyses + campaign_agreements expiry +
--     v_campaign_foundational_readiness counts to pre-fill the
--     section snippet.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- (a) section_plan_situation_snippets
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS section_plan_situation_snippets (
  snippet_id BIGSERIAL PRIMARY KEY,
  section_plan_id BIGINT NOT NULL UNIQUE
    REFERENCES section_plans(section_plan_id) ON DELETE CASCADE,
  status_summary TEXT,
  key_event TEXT,
  agreement_expiry_override DATE,
  strategic_context TEXT,
  workforce_summary TEXT,
  notes TEXT,
  derived_from_campaign_situation BOOLEAN NOT NULL DEFAULT FALSE,
  ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE section_plan_situation_snippets IS
  'Per-section situation summary. Maps to the OA Field Plan Template '
  '"Current Situation" subsections plus a workforce summary intro. '
  'agreement_expiry_override exists as a date override; the default surfaced '
  'in the UI is the most recent campaign_agreements join.';

CREATE OR REPLACE FUNCTION tg_section_situation_snippets_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS section_situation_snippets_set_updated_at
  ON section_plan_situation_snippets;
CREATE TRIGGER section_situation_snippets_set_updated_at
  BEFORE UPDATE ON section_plan_situation_snippets
  FOR EACH ROW EXECUTE FUNCTION tg_section_situation_snippets_set_updated_at();

ALTER TABLE section_plan_situation_snippets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN
    EXECUTE 'CREATE POLICY section_situation_snippets_read ON section_plan_situation_snippets FOR SELECT TO authenticated USING (true)';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    EXECUTE 'CREATE POLICY section_situation_snippets_write ON section_plan_situation_snippets FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM section_plans sp WHERE sp.section_plan_id = section_plan_situation_snippets.section_plan_id AND can_write_to_campaign(sp.campaign_id)))';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- ─────────────────────────────────────────────────────────────
-- (b) v_section_plan_workforce_mapping
--
-- Per-worksite aggregation. Membership signal:
--   workers.member_role_type_id IS NOT NULL
-- (i.e. any assigned union role — delegate / bargaining_rep /
-- activist / contact). Workers without a role are non-members.
--
-- Worksite OUs are filtered by ou_type='worksite'. Worker-OU links
-- via campaign_worker_ou. Workforce count uses DISTINCT worker_id
-- to avoid double-counting workers with multiple OU links.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_section_plan_workforce_mapping AS
SELECT
  ou.campaign_id,
  ou.ou_id AS worksite_ou_id,
  ou.name  AS worksite_name,
  ou.total_workers_estimated,
  COUNT(DISTINCT cwo.worker_id)::INT AS workers_count,
  COUNT(DISTINCT CASE WHEN w.member_role_type_id IS NOT NULL THEN cwo.worker_id END)::INT AS members_count,
  CASE
    WHEN COUNT(DISTINCT cwo.worker_id) = 0 THEN NULL
    ELSE ROUND(
      100.0 * COUNT(DISTINCT CASE WHEN w.member_role_type_id IS NOT NULL THEN cwo.worker_id END)
            / COUNT(DISTINCT cwo.worker_id),
      1
    )
  END AS density_pct,
  COUNT(DISTINCT CASE WHEN w.member_role_type_id IS NULL THEN cwo.worker_id END)::INT AS non_member_count,
  COUNT(DISTINCT CASE WHEN cwrs.cumulative_rating IS NULL THEN cwo.worker_id END)::INT AS unrated_count
FROM campaign_organising_units ou
LEFT JOIN campaign_worker_ou cwo ON cwo.ou_id = ou.ou_id
LEFT JOIN workers w ON w.worker_id = cwo.worker_id
LEFT JOIN campaign_worker_rating_summary cwrs
  ON cwrs.campaign_id = ou.campaign_id AND cwrs.worker_id = cwo.worker_id
WHERE ou.ou_type = 'worksite'
GROUP BY ou.campaign_id, ou.ou_id, ou.name, ou.total_workers_estimated;

COMMENT ON VIEW v_section_plan_workforce_mapping IS
  'Per-worksite worker / member / density / non-member / unrated counts '
  'for one campaign. Membership = workers.member_role_type_id IS NOT NULL. '
  'Joined to a section plan via the section''s campaign_id.';

-- ─────────────────────────────────────────────────────────────
-- (c) section_plan_workforce_mapping_overrides
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS section_plan_workforce_mapping_overrides (
  override_id BIGSERIAL PRIMARY KEY,
  section_plan_id BIGINT NOT NULL
    REFERENCES section_plans(section_plan_id) ON DELETE CASCADE,
  worksite_ou_id INT NOT NULL
    REFERENCES campaign_organising_units(ou_id) ON DELETE CASCADE,
  workers_override INT,
  members_override INT,
  density_override NUMERIC(5,2),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (section_plan_id, worksite_ou_id),
  CONSTRAINT workforce_override_density_chk
    CHECK (density_override IS NULL OR (density_override >= 0 AND density_override <= 100))
);

CREATE INDEX IF NOT EXISTS idx_workforce_overrides_section
  ON section_plan_workforce_mapping_overrides(section_plan_id);

CREATE OR REPLACE FUNCTION tg_workforce_overrides_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workforce_overrides_set_updated_at
  ON section_plan_workforce_mapping_overrides;
CREATE TRIGGER workforce_overrides_set_updated_at
  BEFORE UPDATE ON section_plan_workforce_mapping_overrides
  FOR EACH ROW EXECUTE FUNCTION tg_workforce_overrides_set_updated_at();

ALTER TABLE section_plan_workforce_mapping_overrides ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN
    EXECUTE 'CREATE POLICY workforce_overrides_read ON section_plan_workforce_mapping_overrides FOR SELECT TO authenticated USING (true)';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    EXECUTE 'CREATE POLICY workforce_overrides_write ON section_plan_workforce_mapping_overrides FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM section_plans sp WHERE sp.section_plan_id = section_plan_workforce_mapping_overrides.section_plan_id AND can_write_to_campaign(sp.campaign_id)))';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- ─────────────────────────────────────────────────────────────
-- (d) seed_section_situation_snippet RPC
--
-- Pulls from the most recent current campaign_situation_analyses
-- row + campaign_agreements (latest non-NULL expiry_date) +
-- v_campaign_foundational_readiness for the workforce_summary.
-- Idempotent — UPSERTs by section_plan_id.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION seed_section_situation_snippet(p_section_plan_id BIGINT)
RETURNS section_plan_situation_snippets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign_id INT;
  v_csa RECORD;
  v_expiry DATE;
  v_workforce TEXT;
  v_status TEXT;
  v_key_event TEXT;
  v_strategic TEXT;
  v_result section_plan_situation_snippets;
BEGIN
  SELECT campaign_id INTO v_campaign_id
  FROM section_plans WHERE section_plan_id = p_section_plan_id;

  IF v_campaign_id IS NULL THEN
    RAISE EXCEPTION 'Section plan % not found', p_section_plan_id;
  END IF;

  -- Most-recent current situation analysis
  SELECT employer_state_notes, strategic_context_summary,
         bargaining_phase_state, employer_ballot_intent,
         nerr_status, nerr_issued_at
    INTO v_csa
  FROM campaign_situation_analyses
  WHERE campaign_id = v_campaign_id
    AND COALESCE(is_current, true) = true
  ORDER BY version DESC NULLS LAST, created_at DESC
  LIMIT 1;

  v_status := COALESCE(NULLIF(v_csa.employer_state_notes, ''), '');
  v_strategic := COALESCE(NULLIF(v_csa.strategic_context_summary, ''), '');

  -- Build a one-line key_event hint from bargaining state + NERR
  v_key_event := NULLIF(
    TRIM(BOTH ' · ' FROM
      CONCAT_WS(' · ',
        NULLIF(v_csa.bargaining_phase_state, ''),
        NULLIF(v_csa.employer_ballot_intent, ''),
        CASE WHEN v_csa.nerr_status IS NOT NULL AND v_csa.nerr_status <> ''
             THEN 'NERR: ' || v_csa.nerr_status
                  || COALESCE(' (' || v_csa.nerr_issued_at::TEXT || ')', '')
             ELSE NULL END
      )
    ), '');

  -- Most recent agreement expiry
  SELECT MAX(a.expiry_date) INTO v_expiry
  FROM campaign_agreements ca
  JOIN agreements a ON a.agreement_id = ca.agreement_id
  WHERE ca.campaign_id = v_campaign_id;

  -- Workforce summary one-liner from foundational readiness counts
  SELECT FORMAT(
    '%s workers in scope · %s allocated · %s with contact · %s rated · %s OUs missing leaders',
    universe_size, workers_allocated, workers_with_contact, workers_with_rating, ous_missing_leaders
  )
  INTO v_workforce
  FROM v_campaign_foundational_readiness
  WHERE campaign_id = v_campaign_id;

  INSERT INTO section_plan_situation_snippets (
    section_plan_id, status_summary, key_event,
    agreement_expiry_override, strategic_context,
    workforce_summary, derived_from_campaign_situation
  )
  VALUES (
    p_section_plan_id, v_status, v_key_event,
    NULL, v_strategic, v_workforce, TRUE
  )
  ON CONFLICT (section_plan_id) DO UPDATE
    SET status_summary    = COALESCE(EXCLUDED.status_summary, section_plan_situation_snippets.status_summary),
        key_event         = COALESCE(EXCLUDED.key_event, section_plan_situation_snippets.key_event),
        strategic_context = COALESCE(EXCLUDED.strategic_context, section_plan_situation_snippets.strategic_context),
        workforce_summary = COALESCE(EXCLUDED.workforce_summary, section_plan_situation_snippets.workforce_summary),
        derived_from_campaign_situation = TRUE,
        updated_at        = now()
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION seed_section_situation_snippet(BIGINT) TO authenticated;

-- Convenience read fn that joins the live agreement expiry without an override.
CREATE OR REPLACE FUNCTION section_plan_resolved_agreement_expiry(p_section_plan_id BIGINT)
RETURNS DATE
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (SELECT agreement_expiry_override
       FROM section_plan_situation_snippets
       WHERE section_plan_id = p_section_plan_id),
    (SELECT MAX(a.expiry_date)
       FROM section_plans sp
       JOIN campaign_agreements ca ON ca.campaign_id = sp.campaign_id
       JOIN agreements a ON a.agreement_id = ca.agreement_id
       WHERE sp.section_plan_id = p_section_plan_id)
  );
$$;

GRANT EXECUTE ON FUNCTION section_plan_resolved_agreement_expiry(BIGINT) TO authenticated;
