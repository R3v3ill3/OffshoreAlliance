-- ============================================================
-- Migration 20260509100000: SOC as default capacity in every stage
--
-- Makes "Structured Organising Conversation" a default capacity in
-- every stage's Capacities tab in the campaign planner. The user can
-- delete the row to deselect it; once removed, it stays removed (no
-- auto-resurrection).
--
-- Three things:
--   1. Extend the capacity_options seed from 20260508100000 to cover
--      stages 1 and 6 (was only 2-5). Now SOC is an option for every
--      one of the 6 stages.
--   2. Backfill plan_capacities: for every existing campaign_stage_plan
--      that doesn't already have a SOC capacity row, insert one with
--      status='needed'. Existing campaigns retroactively get the
--      default.
--   3. Trigger: AFTER INSERT on campaign_stage_plans, auto-add a SOC
--      plan_capacities row. Ensures every new campaign also gets the
--      default. Only fires on INSERT, so once a user deletes the row
--      it stays deleted.
-- ============================================================


-- 1. Extend SOC capacity_options to stages 1 and 6
INSERT INTO capacity_options (stage_number, category, option_text, description, is_system_default, is_active)
SELECT s, 'organising_conversation', 'Structured Organising Conversation',
       'Build a coach-guided 8-stage SOC for this stage. Use the SOC wizard to draft and refine each stage with AI coaching, then export to phone, email, or SMS.',
       TRUE, TRUE
FROM (VALUES (1), (6)) AS t(s)
WHERE NOT EXISTS (
    SELECT 1 FROM capacity_options
    WHERE stage_number = t.s
      AND option_text = 'Structured Organising Conversation'
);


-- 2. Backfill: add SOC capacity to every existing stage_plan that doesn't
--    already have one. Detection is generous — matches both the seeded
--    capacity_option (by option_id) AND any custom_text someone may have
--    entered manually for the same concept.
INSERT INTO plan_capacities (plan_id, capacity_option_id, status, custom_text, sort_order)
SELECT csp.plan_id, co.option_id, 'needed', NULL,
       COALESCE((SELECT MAX(sort_order) + 1 FROM plan_capacities WHERE plan_id = csp.plan_id), 0)
FROM campaign_stage_plans csp
JOIN capacity_options co
  ON co.stage_number = csp.stage_number
 AND co.option_text  = 'Structured Organising Conversation'
 AND co.is_active    = TRUE
WHERE NOT EXISTS (
    SELECT 1 FROM plan_capacities pc
    WHERE pc.plan_id = csp.plan_id
      AND (
        pc.capacity_option_id = co.option_id
        OR (pc.custom_text IS NOT NULL AND pc.custom_text ILIKE '%structured organising conversation%')
      )
);


-- 3. Trigger: auto-add SOC capacity on new campaign_stage_plans insert.
--    Only fires on INSERT, so user deletions are sticky.
CREATE OR REPLACE FUNCTION auto_add_soc_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    soc_option_id INTEGER;
BEGIN
    SELECT option_id INTO soc_option_id
    FROM capacity_options
    WHERE stage_number = NEW.stage_number
      AND option_text  = 'Structured Organising Conversation'
      AND is_active    = TRUE
    LIMIT 1;

    IF soc_option_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Don't duplicate if a row already exists for this plan + option (e.g.
    -- created in the same transaction by an explicit insert).
    IF EXISTS (
        SELECT 1 FROM plan_capacities
        WHERE plan_id = NEW.plan_id
          AND capacity_option_id = soc_option_id
    ) THEN
        RETURN NEW;
    END IF;

    INSERT INTO plan_capacities (plan_id, capacity_option_id, status, sort_order)
    VALUES (
        NEW.plan_id,
        soc_option_id,
        'needed',
        COALESCE((SELECT MAX(sort_order) + 1 FROM plan_capacities WHERE plan_id = NEW.plan_id), 0)
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_campaign_stage_plans_auto_soc ON campaign_stage_plans;
CREATE TRIGGER trg_campaign_stage_plans_auto_soc
    AFTER INSERT ON campaign_stage_plans
    FOR EACH ROW
    EXECUTE FUNCTION auto_add_soc_capacity();
