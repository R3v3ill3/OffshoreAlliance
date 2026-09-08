-- ============================================================
-- Phase F: Library tab — campaign_id on documents + campaign-documents bucket
--
-- 1. Add campaign_id FK to documents (nullable — existing rows unaffected).
-- 2. Add composite index for efficient per-campaign queries.
-- 3. Add CHECK constraint on document_type covering all UI-exposed values.
-- 4. Create campaign-documents Storage bucket with RLS policies.
--
-- Membership table note:
--   No campaign_members / campaign_member_roles table exists in the schema.
--   RLS is scoped to authenticated users (same pattern as every other table
--   in this schema — see 0002_rls_policies.sql which uses "authenticated users
--   can read" for all tables and "admin/user role can write").
-- ============================================================

-- 1. Add campaign_id FK
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS campaign_id INTEGER
    REFERENCES campaigns(campaign_id) ON DELETE CASCADE;

-- 2. Composite index for Library tab queries
CREATE INDEX IF NOT EXISTS idx_documents_campaign_type_date
  ON documents (campaign_id, document_type, created_at DESC);

-- 3. CHECK constraint on document_type (NOT VALID avoids re-scanning existing rows)
ALTER TABLE documents
  ADD CONSTRAINT documents_type_check
    CHECK (document_type IN (
      'flyer',
      'social',
      'legal-correspondence',
      'company-correspondence',
      'media-article',
      'research',
      'other'
    )) NOT VALID;

-- 4. campaign-documents Storage bucket (private)
INSERT INTO storage.buckets (id, name, public)
  VALUES ('campaign-documents', 'campaign-documents', false)
ON CONFLICT (id) DO NOTHING;

-- SELECT: all authenticated users (no campaign_members table exists —
--   same permissive fallback used for the existing 'documents' bucket in 0002).
CREATE POLICY "Authenticated users can read campaign-documents"
  ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'campaign-documents');

-- INSERT: authenticated users with admin or user role
CREATE POLICY "Admin/User can upload campaign-documents"
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'campaign-documents'
    AND (SELECT role FROM public.user_profiles WHERE user_id = auth.uid())
          IN ('admin', 'user')
  );

-- UPDATE: same role guard
CREATE POLICY "Admin/User can update campaign-documents"
  ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'campaign-documents'
    AND (SELECT role FROM public.user_profiles WHERE user_id = auth.uid())
          IN ('admin', 'user')
  );

-- DELETE: admin only (mirrors table-level delete policy pattern)
CREATE POLICY "Admin can delete campaign-documents"
  ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'campaign-documents'
    AND (SELECT role FROM public.user_profiles WHERE user_id = auth.uid()) = 'admin'
  );
