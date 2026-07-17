-- Lock down the Activists & WOCs SECURITY DEFINER helpers.
--
-- Trigger functions execute with the privileges established at
-- trigger definition, not via caller EXECUTE, so nothing needs these
-- grants — and fn_ensure_activist_profile called directly would let
-- any authenticated user bypass can_write_to_campaign() to insert
-- register rows. Revoke the default PUBLIC/anon/authenticated EXECUTE.

REVOKE EXECUTE ON FUNCTION fn_ensure_activist_profile(INT, INT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION fn_role_type_is_activist_like(INT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION fn_activist_profile_on_rating() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION fn_activist_profile_on_task_list() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION fn_activist_profile_on_activist_task() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION fn_activist_profile_on_woc_member() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION fn_activist_profile_on_role_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION fn_activist_profile_on_membership() FROM PUBLIC, anon, authenticated;
