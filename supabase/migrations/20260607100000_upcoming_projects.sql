-- ============================================================
-- Upcoming projects (regulator-scraped) + employer matching
-- ============================================================
-- Stores activity/project records pulled from external regulators
-- (initially NOPSEMA; extensible to WA/NT government sources via
-- the `source` column). Each scraped record gets a corresponding
-- entry in `upcoming_project_employers` with a fuzzy-matched
-- employer link and a `match_status` lifecycle so admins can
-- confirm, override, or reject the auto-proposed match.
--
-- Writes happen exclusively via the service role from the Railway
-- scraper service. Authenticated users may SELECT; admins may
-- update match decisions only via the SECURITY DEFINER RPC
-- `confirm_upcoming_project_match`.
-- ============================================================

-- ============================================================
-- 1. upcoming_projects
-- ============================================================

CREATE TABLE upcoming_projects (
  id                        BIGSERIAL PRIMARY KEY,
  source                    TEXT NOT NULL CHECK (source IN ('nopsema')),
  external_id               TEXT NOT NULL,
  title                     TEXT,
  activity_type             TEXT,
  lifecycle_classification  TEXT,
  project_name              TEXT,
  associated_project        TEXT,
  organisation              TEXT,
  region_code               TEXT,
  jurisdiction              TEXT CHECK (jurisdiction IN ('WA', 'NT')),
  location_text             TEXT,
  latitude                  NUMERIC(9, 6),
  longitude                 NUMERIC(9, 6),
  start_date                DATE,
  end_date                  DATE,
  status                    TEXT,
  source_url                TEXT NOT NULL,
  raw_payload               JSONB NOT NULL,
  first_seen_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_changed_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active                 BOOLEAN NOT NULL DEFAULT true,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source, external_id)
);

CREATE INDEX idx_upcoming_projects_jurisdiction ON upcoming_projects (jurisdiction);
CREATE INDEX idx_upcoming_projects_organisation ON upcoming_projects (organisation);
CREATE INDEX idx_upcoming_projects_lifecycle   ON upcoming_projects (lifecycle_classification);
CREATE INDEX idx_upcoming_projects_start_date  ON upcoming_projects (start_date);
CREATE INDEX idx_upcoming_projects_active      ON upcoming_projects (is_active) WHERE is_active;

CREATE TRIGGER trg_upcoming_projects_updated_at
  BEFORE UPDATE ON upcoming_projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 2. upcoming_projects_scrape_runs
-- ============================================================

CREATE TABLE upcoming_projects_scrape_runs (
  id                    BIGSERIAL PRIMARY KEY,
  source                TEXT NOT NULL,
  started_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at           TIMESTAMPTZ,
  status                TEXT NOT NULL DEFAULT 'running'
                          CHECK (status IN ('running', 'success', 'partial', 'failed')),
  records_seen          INT NOT NULL DEFAULT 0,
  records_inserted      INT NOT NULL DEFAULT 0,
  records_updated       INT NOT NULL DEFAULT 0,
  records_deactivated   INT NOT NULL DEFAULT 0,
  auto_matched          INT NOT NULL DEFAULT 0,
  needs_review          INT NOT NULL DEFAULT 0,
  unmatched             INT NOT NULL DEFAULT 0,
  error_message         TEXT,
  triggered_by          TEXT NOT NULL DEFAULT 'cron'
);

CREATE INDEX idx_scrape_runs_started_at ON upcoming_projects_scrape_runs (started_at DESC);

-- ============================================================
-- 3. upcoming_project_employers (junction with match metadata)
-- ============================================================

CREATE TABLE upcoming_project_employers (
  id                    BIGSERIAL PRIMARY KEY,
  upcoming_project_id   BIGINT NOT NULL REFERENCES upcoming_projects(id) ON DELETE CASCADE,
  employer_id           INT REFERENCES employers(employer_id) ON DELETE SET NULL,
  role_type             VARCHAR(30) NOT NULL DEFAULT 'Operator'
                          CHECK (role_type IN (
                            'Owner','Operator','Principal_Contractor','Subcontractor',
                            'Labour_Hire','Catering','Maintenance','Drilling',
                            'ROV','Inspection','Transport','Decommissioning','Aviation','Other'
                          )),
  is_primary            BOOLEAN NOT NULL DEFAULT true,
  match_status          TEXT NOT NULL
                          CHECK (match_status IN (
                            'auto','needs_review','confirmed','overridden','rejected','unmatched'
                          )),
  match_score           NUMERIC(4, 3),
  match_method          TEXT CHECK (match_method IN ('exact','fuzzy','manual','created')),
  candidate_proposals   JSONB NOT NULL DEFAULT '[]'::jsonb,
  confirmed_by          UUID REFERENCES auth.users(id),
  confirmed_at          TIMESTAMPTZ,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_upcoming_project_employer_role
  ON upcoming_project_employers (upcoming_project_id, employer_id, role_type)
  WHERE employer_id IS NOT NULL;

CREATE UNIQUE INDEX uq_upcoming_project_primary
  ON upcoming_project_employers (upcoming_project_id)
  WHERE is_primary;

CREATE INDEX idx_upe_match_status ON upcoming_project_employers (match_status);
CREATE INDEX idx_upe_employer     ON upcoming_project_employers (employer_id) WHERE employer_id IS NOT NULL;

CREATE TRIGGER trg_upcoming_project_employers_updated_at
  BEFORE UPDATE ON upcoming_project_employers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 4. RLS — read for authenticated, writes via service role only
-- ============================================================

ALTER TABLE upcoming_projects                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE upcoming_projects_scrape_runs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE upcoming_project_employers        ENABLE ROW LEVEL SECURITY;

CREATE POLICY upcoming_projects_select_authed
  ON upcoming_projects FOR SELECT TO authenticated USING (true);

CREATE POLICY upcoming_scrape_runs_select_authed
  ON upcoming_projects_scrape_runs FOR SELECT TO authenticated USING (true);

CREATE POLICY upcoming_project_employers_select_authed
  ON upcoming_project_employers FOR SELECT TO authenticated USING (true);

-- No INSERT/UPDATE/DELETE policies for authenticated. The Railway
-- scraper writes via the service role (which bypasses RLS); admin
-- match decisions go through the RPC below.

-- ============================================================
-- 5. RPC — confirm_upcoming_project_match (admins only)
-- ============================================================

CREATE OR REPLACE FUNCTION confirm_upcoming_project_match(payload JSONB)
RETURNS upcoming_project_employers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id           BIGINT;
  v_action       TEXT;
  v_employer_id  INT;
  v_notes        TEXT;
  v_row          upcoming_project_employers;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only admins may confirm upcoming-project matches';
  END IF;

  v_id          := (payload->>'id')::BIGINT;
  v_action      := payload->>'action';
  v_employer_id := NULLIF(payload->>'employer_id', '')::INT;
  v_notes       := payload->>'notes';

  IF v_id IS NULL OR v_action IS NULL THEN
    RAISE EXCEPTION 'payload must include id and action';
  END IF;

  IF v_action NOT IN ('confirm', 'override', 'create_link', 'reject', 'reopen') THEN
    RAISE EXCEPTION 'unsupported action: %', v_action;
  END IF;

  -- confirm = accept the auto/needs_review candidate as-is or specified employer
  -- override = admin chose a different existing employer (manual pick)
  -- create_link = a brand-new employer was created via apply_employer_wizard_changes
  --                and we now link it (match_method='created')
  -- reject = mark as unmatchable
  -- reopen = clear admin decision, return to needs_review

  IF v_action = 'confirm' THEN
    UPDATE upcoming_project_employers
       SET employer_id   = COALESCE(v_employer_id, employer_id),
           match_status  = 'confirmed',
           match_method  = COALESCE(match_method, 'fuzzy'),
           confirmed_by  = auth.uid(),
           confirmed_at  = now(),
           notes         = v_notes
     WHERE id = v_id
     RETURNING * INTO v_row;

  ELSIF v_action = 'override' THEN
    IF v_employer_id IS NULL THEN
      RAISE EXCEPTION 'override requires employer_id';
    END IF;
    UPDATE upcoming_project_employers
       SET employer_id   = v_employer_id,
           match_status  = 'overridden',
           match_method  = 'manual',
           match_score   = NULL,
           confirmed_by  = auth.uid(),
           confirmed_at  = now(),
           notes         = v_notes
     WHERE id = v_id
     RETURNING * INTO v_row;

  ELSIF v_action = 'create_link' THEN
    IF v_employer_id IS NULL THEN
      RAISE EXCEPTION 'create_link requires employer_id of newly created employer';
    END IF;
    UPDATE upcoming_project_employers
       SET employer_id   = v_employer_id,
           match_status  = 'confirmed',
           match_method  = 'created',
           match_score   = NULL,
           confirmed_by  = auth.uid(),
           confirmed_at  = now(),
           notes         = v_notes
     WHERE id = v_id
     RETURNING * INTO v_row;

  ELSIF v_action = 'reject' THEN
    UPDATE upcoming_project_employers
       SET employer_id   = NULL,
           match_status  = 'rejected',
           match_method  = NULL,
           match_score   = NULL,
           confirmed_by  = auth.uid(),
           confirmed_at  = now(),
           notes         = v_notes
     WHERE id = v_id
     RETURNING * INTO v_row;

  ELSIF v_action = 'reopen' THEN
    UPDATE upcoming_project_employers
       SET match_status  = CASE
                              WHEN candidate_proposals = '[]'::jsonb THEN 'unmatched'
                              ELSE 'needs_review'
                            END,
           confirmed_by  = NULL,
           confirmed_at  = NULL
     WHERE id = v_id
     RETURNING * INTO v_row;
  END IF;

  IF v_row IS NULL THEN
    RAISE EXCEPTION 'upcoming_project_employers row % not found', v_id;
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION confirm_upcoming_project_match(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION confirm_upcoming_project_match(JSONB) TO authenticated;
