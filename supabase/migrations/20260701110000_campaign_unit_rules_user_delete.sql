-- ============================================================
-- Allow 'user' role to delete campaign_unit_rules.
--
-- The original policy (20260414123000_campaign_unit_rules.sql) restricted
-- DELETE to admins only, while INSERT/UPDATE were allowed for both 'admin'
-- and 'user'. Because a 'user'-role organiser's delete simply matched zero
-- rows under RLS (rather than erroring), removing an assignment rule in the
-- Campaign Units tab appeared to silently do nothing. Align DELETE with
-- INSERT/UPDATE so organisers can manage the rules they are allowed to create.
-- ============================================================

DROP POLICY IF EXISTS "Admin can delete campaign_unit_rules" ON campaign_unit_rules;

DO $$
BEGIN
  BEGIN
    CREATE POLICY "Admin/User can delete campaign_unit_rules"
      ON campaign_unit_rules FOR DELETE TO authenticated
      USING (get_user_role() IN ('admin', 'user'));
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
