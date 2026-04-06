-- Ordered campaign deletion with auth: admin or lead organiser only.
-- Removes planning/gate/timeline/snapshot rows that lack ON DELETE CASCADE from campaigns,
-- then deletes the campaign row (remaining children cascade).

CREATE OR REPLACE FUNCTION public.delete_campaign(p_campaign_id integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF NOT (public.is_admin() OR public.is_lead_organiser_for_campaign(p_campaign_id)) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM campaigns WHERE campaign_id = p_campaign_id) THEN
    RAISE EXCEPTION 'campaign_not_found';
  END IF;

  DELETE FROM gate_assessments ga
  USING gate_definitions gd
  WHERE ga.gate_id = gd.gate_id AND gd.campaign_id = p_campaign_id;

  DELETE FROM gate_definitions WHERE campaign_id = p_campaign_id;

  DELETE FROM campaign_stage_plans WHERE campaign_id = p_campaign_id;

  DELETE FROM reporting_snapshots WHERE campaign_id = p_campaign_id;

  DELETE FROM campaign_timelines WHERE campaign_id = p_campaign_id;

  DELETE FROM campaigns WHERE campaign_id = p_campaign_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_campaign(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_campaign(integer) TO authenticated;

COMMENT ON FUNCTION public.delete_campaign(integer) IS
  'Deletes a campaign and dependent planning data. Allowed for admins and lead organisers only.';
