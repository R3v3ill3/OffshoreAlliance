-- ============================================================
-- Offshore Alliance Campaign Database - Complete Schema
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. REFERENCE TABLES
-- ============================================================

CREATE TABLE sectors (
  sector_id SERIAL PRIMARY KEY,
  sector_name VARCHAR(50) NOT NULL UNIQUE,
  description VARCHAR(200)
);

CREATE TABLE unions (
  union_id SERIAL PRIMARY KEY,
  union_code VARCHAR(20) NOT NULL UNIQUE,
  union_name VARCHAR(200) NOT NULL,
  is_oa_member BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE member_role_types (
  role_type_id SERIAL PRIMARY KEY,
  role_name VARCHAR(50) NOT NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0
);

-- ============================================================
-- 2. CORE ENTITY TABLES
-- ============================================================

CREATE TABLE employers (
  employer_id SERIAL PRIMARY KEY,
  employer_name VARCHAR(200) NOT NULL,
  trading_name VARCHAR(100),
  abn VARCHAR(20),
  employer_category VARCHAR(30) CHECK (employer_category IN ('Producer','Major_Contractor','Subcontractor','Labour_Hire','Specialist')),
  parent_company VARCHAR(200),
  website VARCHAR(300),
  phone VARCHAR(30),
  email VARCHAR(200),
  address TEXT,
  state VARCHAR(10),
  postcode VARCHAR(10),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE organisers (
  organiser_id SERIAL PRIMARY KEY,
  organiser_name VARCHAR(100) NOT NULL,
  email VARCHAR(200),
  phone VARCHAR(30),
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE worksites (
  worksite_id SERIAL PRIMARY KEY,
  worksite_name VARCHAR(100) NOT NULL,
  worksite_type VARCHAR(30) NOT NULL CHECK (worksite_type IN (
    'FPSO','FLNG','Platform','Onshore_LNG','Gas_Plant','Hub',
    'Drill_Centre','Region','Heliport','Pipeline','Airfield',
    'Onshore_Facilities','CPF','Gas_Field','Other'
  )),
  operator_id INT REFERENCES employers(employer_id),
  location_description VARCHAR(200),
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  basin VARCHAR(100),
  is_offshore BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE agreements (
  agreement_id SERIAL PRIMARY KEY,
  decision_no VARCHAR(20) NOT NULL UNIQUE,
  agreement_name VARCHAR(300) NOT NULL,
  short_name VARCHAR(100),
  sector_id INT REFERENCES sectors(sector_id),
  employer_id INT REFERENCES employers(employer_id),
  industry_classification VARCHAR(100),
  date_of_decision DATE,
  commencement_date DATE,
  expiry_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'Current' CHECK (status IN ('Current','Expired','Under_Negotiation','Terminated')),
  is_greenfield BOOLEAN NOT NULL DEFAULT false,
  is_variation BOOLEAN NOT NULL DEFAULT false,
  fwc_link VARCHAR(500),
  supersedes_id INT REFERENCES agreements(agreement_id),
  variation_of_id INT REFERENCES agreements(agreement_id),
  notes TEXT,
  source_sheet VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE dues_increases (
  increase_id SERIAL PRIMARY KEY,
  agreement_id INT NOT NULL REFERENCES agreements(agreement_id) ON DELETE CASCADE,
  increase_number INT NOT NULL,
  effective_date DATE,
  increase_type VARCHAR(20) CHECK (increase_type IN ('Fixed','WPI','CPI','FWC','Other')),
  percentage DECIMAL(5,2),
  minimum_pct DECIMAL(5,2),
  maximum_pct DECIMAL(5,2),
  raw_description VARCHAR(200)
);

CREATE TABLE workers (
  worker_id SERIAL PRIMARY KEY,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(200),
  phone VARCHAR(30),
  address TEXT,
  suburb VARCHAR(100),
  state VARCHAR(10),
  postcode VARCHAR(10),
  date_of_birth DATE,
  gender VARCHAR(20),
  occupation VARCHAR(100),
  classification VARCHAR(100),
  employer_id INT REFERENCES employers(employer_id),
  worksite_id INT REFERENCES worksites(worksite_id),
  member_role_type_id INT REFERENCES member_role_types(role_type_id),
  union_id INT REFERENCES unions(union_id),
  member_number VARCHAR(50),
  join_date DATE,
  resignation_date DATE,
  engagement_score INT NOT NULL DEFAULT 0,
  engagement_level VARCHAR(30) NOT NULL DEFAULT 'contact',
  action_network_id VARCHAR(100),
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE worker_history (
  history_id SERIAL PRIMARY KEY,
  worker_id INT NOT NULL REFERENCES workers(worker_id) ON DELETE CASCADE,
  change_type VARCHAR(50) NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_by UUID,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 3. JUNCTION / RELATIONSHIP TABLES
-- ============================================================

CREATE TABLE agreement_worksites (
  id SERIAL PRIMARY KEY,
  agreement_id INT NOT NULL REFERENCES agreements(agreement_id) ON DELETE CASCADE,
  worksite_id INT NOT NULL REFERENCES worksites(worksite_id) ON DELETE CASCADE,
  notes VARCHAR(200),
  UNIQUE(agreement_id, worksite_id)
);

CREATE TABLE agreement_unions (
  id SERIAL PRIMARY KEY,
  agreement_id INT NOT NULL REFERENCES agreements(agreement_id) ON DELETE CASCADE,
  union_id INT NOT NULL REFERENCES unions(union_id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(agreement_id, union_id)
);

CREATE TABLE agreement_organisers (
  id SERIAL PRIMARY KEY,
  agreement_id INT NOT NULL REFERENCES agreements(agreement_id) ON DELETE CASCADE,
  organiser_id INT NOT NULL REFERENCES organisers(organiser_id) ON DELETE CASCADE,
  UNIQUE(agreement_id, organiser_id)
);

CREATE TABLE agreement_employers (
  id SERIAL PRIMARY KEY,
  agreement_id INT NOT NULL REFERENCES agreements(agreement_id) ON DELETE CASCADE,
  employer_id INT NOT NULL REFERENCES employers(employer_id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(agreement_id, employer_id)
);

CREATE TABLE employer_worksite_roles (
  id SERIAL PRIMARY KEY,
  employer_id INT NOT NULL REFERENCES employers(employer_id) ON DELETE CASCADE,
  worksite_id INT NOT NULL REFERENCES worksites(worksite_id) ON DELETE CASCADE,
  role_type VARCHAR(30) NOT NULL CHECK (role_type IN (
    'Owner','Operator','Principal_Contractor','Subcontractor','Labour_Hire',
    'Catering','Maintenance','Drilling','ROV','Inspection','Transport',
    'Decommissioning','Aviation','Other'
  )),
  is_current BOOLEAN NOT NULL DEFAULT true,
  start_date DATE,
  end_date DATE,
  notes TEXT
);

CREATE TABLE employer_sectors (
  id SERIAL PRIMARY KEY,
  employer_id INT NOT NULL REFERENCES employers(employer_id) ON DELETE CASCADE,
  sector_id INT NOT NULL REFERENCES sectors(sector_id) ON DELETE CASCADE,
  UNIQUE(employer_id, sector_id)
);

CREATE TABLE worker_agreements (
  id SERIAL PRIMARY KEY,
  worker_id INT NOT NULL REFERENCES workers(worker_id) ON DELETE CASCADE,
  agreement_id INT NOT NULL REFERENCES agreements(agreement_id) ON DELETE CASCADE,
  UNIQUE(worker_id, agreement_id)
);

-- ============================================================
-- 4. CAMPAIGN TABLES
-- ============================================================

CREATE TABLE campaigns (
  campaign_id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  campaign_type VARCHAR(20) NOT NULL CHECK (campaign_type IN ('bargaining','organising','mobilisation','political')),
  status VARCHAR(20) NOT NULL DEFAULT 'planning' CHECK (status IN ('planning','active','completed','suspended')),
  start_date DATE,
  end_date DATE,
  organiser_id INT REFERENCES organisers(organiser_id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE campaign_universes (
  universe_id SERIAL PRIMARY KEY,
  campaign_id INT NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  description TEXT
);

CREATE TABLE campaign_universe_rules (
  rule_id SERIAL PRIMARY KEY,
  universe_id INT NOT NULL REFERENCES campaign_universes(universe_id) ON DELETE CASCADE,
  rule_type VARCHAR(20) NOT NULL CHECK (rule_type IN ('agreement','worksite','employer','member_role','sector')),
  rule_entity_id INT NOT NULL,
  include BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE campaign_actions (
  action_id SERIAL PRIMARY KEY,
  campaign_id INT NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  action_type VARCHAR(30) NOT NULL CHECK (action_type IN (
    'door_knock','phone_call','text_blast','meeting','petition',
    'rally','worksite_visit','sign_up','survey','custom'
  )),
  title VARCHAR(200) NOT NULL,
  description TEXT,
  due_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  universe_id INT REFERENCES campaign_universes(universe_id),
  assigned_organiser_id INT REFERENCES organisers(organiser_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE campaign_action_results (
  result_id SERIAL PRIMARY KEY,
  action_id INT NOT NULL REFERENCES campaign_actions(action_id) ON DELETE CASCADE,
  worker_id INT NOT NULL REFERENCES workers(worker_id) ON DELETE CASCADE,
  organiser_id INT REFERENCES organisers(organiser_id),
  result_type VARCHAR(20) NOT NULL CHECK (result_type IN (
    'contacted','not_home','refused','signed','attended',
    'left_message','wrong_number','moved','other'
  )),
  notes TEXT,
  action_date TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 5. DOCUMENTS & COMMUNICATION
-- ============================================================

CREATE TABLE documents (
  document_id SERIAL PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  document_type VARCHAR(50) NOT NULL DEFAULT 'other',
  file_path TEXT NOT NULL,
  agreement_id INT REFERENCES agreements(agreement_id),
  employer_id INT REFERENCES employers(employer_id),
  uploaded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE communications_log (
  log_id SERIAL PRIMARY KEY,
  worker_id INT NOT NULL REFERENCES workers(worker_id) ON DELETE CASCADE,
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('sms','email','phone','in_person')),
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound','outbound')),
  content TEXT,
  yabbr_message_id VARCHAR(100),
  action_network_id VARCHAR(100),
  sent_by INT REFERENCES organisers(organiser_id),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 6. ORGANISER PATCHES
-- ============================================================

CREATE TABLE organiser_patches (
  patch_id SERIAL PRIMARY KEY,
  organiser_id INT NOT NULL REFERENCES organisers(organiser_id),
  patch_name VARCHAR(100) NOT NULL,
  description TEXT
);

CREATE TABLE organiser_patch_assignments (
  assignment_id SERIAL PRIMARY KEY,
  patch_id INT NOT NULL REFERENCES organiser_patches(patch_id) ON DELETE CASCADE,
  entity_type VARCHAR(20) NOT NULL CHECK (entity_type IN ('worksite','employer','agreement')),
  entity_id INT NOT NULL
);

-- ============================================================
-- 7. TAGS
-- ============================================================

CREATE TABLE tags (
  tag_id SERIAL PRIMARY KEY,
  tag_name VARCHAR(50) NOT NULL UNIQUE,
  tag_category VARCHAR(50),
  color VARCHAR(20)
);

CREATE TABLE worker_tags (
  id SERIAL PRIMARY KEY,
  worker_id INT NOT NULL REFERENCES workers(worker_id) ON DELETE CASCADE,
  tag_id INT NOT NULL REFERENCES tags(tag_id) ON DELETE CASCADE,
  UNIQUE(worker_id, tag_id)
);

CREATE TABLE employer_tags (
  id SERIAL PRIMARY KEY,
  employer_id INT NOT NULL REFERENCES employers(employer_id) ON DELETE CASCADE,
  tag_id INT NOT NULL REFERENCES tags(tag_id) ON DELETE CASCADE,
  UNIQUE(employer_id, tag_id)
);

CREATE TABLE worksite_tags (
  id SERIAL PRIMARY KEY,
  worksite_id INT NOT NULL REFERENCES worksites(worksite_id) ON DELETE CASCADE,
  tag_id INT NOT NULL REFERENCES tags(tag_id) ON DELETE CASCADE,
  UNIQUE(worksite_id, tag_id)
);

-- ============================================================
-- 8. IMPORT LOGS
-- ============================================================

CREATE TABLE import_logs (
  import_id SERIAL PRIMARY KEY,
  file_name VARCHAR(200) NOT NULL,
  import_type VARCHAR(50) NOT NULL,
  records_created INT NOT NULL DEFAULT 0,
  records_updated INT NOT NULL DEFAULT 0,
  errors TEXT,
  imported_by UUID,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 9. USER PROFILES (extends Supabase Auth)
-- ============================================================

CREATE TABLE user_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role VARCHAR(10) NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin','user','viewer')),
  display_name VARCHAR(100) NOT NULL DEFAULT '',
  organiser_id INT REFERENCES organisers(organiser_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 10. INDEXES
-- ============================================================

CREATE INDEX idx_agreements_status ON agreements(status);
CREATE INDEX idx_agreements_expiry ON agreements(expiry_date);
CREATE INDEX idx_agreements_sector ON agreements(sector_id);
CREATE INDEX idx_agreements_employer ON agreements(employer_id);
CREATE INDEX idx_workers_employer ON workers(employer_id);
CREATE INDEX idx_workers_worksite ON workers(worksite_id);
CREATE INDEX idx_workers_role ON workers(member_role_type_id);
CREATE INDEX idx_workers_active ON workers(is_active);
CREATE INDEX idx_employer_worksite_roles_employer ON employer_worksite_roles(employer_id);
CREATE INDEX idx_employer_worksite_roles_worksite ON employer_worksite_roles(worksite_id);
CREATE INDEX idx_campaigns_status ON campaigns(status);
CREATE INDEX idx_campaign_actions_campaign ON campaign_actions(campaign_id);
CREATE INDEX idx_campaign_action_results_action ON campaign_action_results(action_id);
CREATE INDEX idx_campaign_action_results_worker ON campaign_action_results(worker_id);
CREATE INDEX idx_communications_worker ON communications_log(worker_id);
CREATE INDEX idx_worksites_operator ON worksites(operator_id);

-- ============================================================
-- 11. UPDATED_AT TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_employers_updated_at BEFORE UPDATE ON employers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_worksites_updated_at BEFORE UPDATE ON worksites FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_agreements_updated_at BEFORE UPDATE ON agreements FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_workers_updated_at BEFORE UPDATE ON workers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_campaigns_updated_at BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_user_profiles_updated_at BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 12. AUTO-CREATE USER PROFILE ON SIGNUP
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id, role, display_name)
  VALUES (NEW.id, 'viewer', COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
