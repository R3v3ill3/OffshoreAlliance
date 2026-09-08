-- Allow non-admin writers (role "user") to delete employer_scopes and worksite_scopes
-- rows, matching INSERT/UPDATE policies on those tables.

DROP POLICY IF EXISTS "Admin can delete employer_scopes" ON employer_scopes;
CREATE POLICY "Admin/User can delete employer_scopes"
  ON employer_scopes
  FOR DELETE
  TO authenticated
  USING (get_user_role() IN ('admin', 'user'));

DROP POLICY IF EXISTS "Admin can delete worksite_scopes" ON worksite_scopes;
CREATE POLICY "Admin/User can delete worksite_scopes"
  ON worksite_scopes
  FOR DELETE
  TO authenticated
  USING (get_user_role() IN ('admin', 'user'));
