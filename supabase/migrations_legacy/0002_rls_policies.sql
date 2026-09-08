-- ============================================================
-- Row Level Security Policies
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE sectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE unions ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_role_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE employers ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisers ENABLE ROW LEVEL SECURITY;
ALTER TABLE worksites ENABLE ROW LEVEL SECURITY;
ALTER TABLE agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE dues_increases ENABLE ROW LEVEL SECURITY;
ALTER TABLE workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE agreement_worksites ENABLE ROW LEVEL SECURITY;
ALTER TABLE agreement_unions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agreement_organisers ENABLE ROW LEVEL SECURITY;
ALTER TABLE agreement_employers ENABLE ROW LEVEL SECURITY;
ALTER TABLE employer_worksite_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE employer_sectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_universes ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_universe_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_action_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE communications_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE organiser_patches ENABLE ROW LEVEL SECURITY;
ALTER TABLE organiser_patch_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE employer_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE worksite_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Helper function to get user role
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.user_profiles WHERE user_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- READ: All authenticated users can read all data
-- ============================================================

-- Macro to create read policies for all tables
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'sectors','unions','member_role_types','employers','organisers',
      'worksites','agreements','dues_increases','workers','worker_history',
      'agreement_worksites','agreement_unions','agreement_organisers',
      'agreement_employers','employer_worksite_roles','employer_sectors',
      'worker_agreements','campaigns','campaign_universes','campaign_universe_rules',
      'campaign_actions','campaign_action_results','documents','communications_log',
      'organiser_patches','organiser_patch_assignments','tags','worker_tags',
      'employer_tags','worksite_tags','import_logs','user_profiles'
    ])
  LOOP
    EXECUTE format(
      'CREATE POLICY "Authenticated users can read %1$s" ON %1$s FOR SELECT TO authenticated USING (true)',
      tbl
    );
  END LOOP;
END $$;

-- ============================================================
-- WRITE: Admin and User roles can insert/update/delete
-- ============================================================

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'sectors','unions','member_role_types','employers','organisers',
      'worksites','agreements','dues_increases','workers','worker_history',
      'agreement_worksites','agreement_unions','agreement_organisers',
      'agreement_employers','employer_worksite_roles','employer_sectors',
      'worker_agreements','campaigns','campaign_universes','campaign_universe_rules',
      'campaign_actions','campaign_action_results','documents','communications_log',
      'organiser_patches','organiser_patch_assignments','tags','worker_tags',
      'employer_tags','worksite_tags','import_logs'
    ])
  LOOP
    EXECUTE format(
      'CREATE POLICY "Admin/User can insert %1$s" ON %1$s FOR INSERT TO authenticated WITH CHECK (get_user_role() IN (''admin'',''user''))',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY "Admin/User can update %1$s" ON %1$s FOR UPDATE TO authenticated USING (get_user_role() IN (''admin'',''user'')) WITH CHECK (get_user_role() IN (''admin'',''user''))',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY "Admin can delete %1$s" ON %1$s FOR DELETE TO authenticated USING (get_user_role() = ''admin'')',
      tbl
    );
  END LOOP;
END $$;

-- Special policies for user_profiles
CREATE POLICY "Users can read own profile" ON user_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON user_profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR get_user_role() = 'admin')
  WITH CHECK (user_id = auth.uid() OR get_user_role() = 'admin');
CREATE POLICY "Admin can insert profiles" ON user_profiles FOR INSERT TO authenticated
  WITH CHECK (get_user_role() = 'admin');

-- ============================================================
-- STORAGE: Document uploads bucket
-- ============================================================

INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can read documents" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'documents');

CREATE POLICY "Admin/User can upload documents" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'documents' AND
    (SELECT role FROM public.user_profiles WHERE user_id = auth.uid()) IN ('admin','user')
  );
