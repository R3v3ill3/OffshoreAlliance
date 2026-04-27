-- ============================================================
-- Phase 5 of campaigns review plan: persist P2W step overrides.
--
-- Today the per-step "Mark complete / Still in progress" overrides
-- on the stage planning page live in browser localStorage
-- (`useP2wStepOverrides`). That means a different organiser opening
-- the same campaign sees no override; switching machines loses
-- the state. This migration moves the overrides onto
-- campaign_stage_plans so they persist server-side and sync
-- across users + browsers.
--
-- Shape: { ambitions?: 'auto'|'force-complete'|'force-incomplete',
--          'where-to-play'?: ..., theory?: ..., capacities?: ...,
--          management?: ... }. Missing keys mean 'auto'.
-- ============================================================

ALTER TABLE campaign_stage_plans
  ADD COLUMN IF NOT EXISTS step_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN campaign_stage_plans.step_overrides IS
  'Per-stage map of P2W step id (ambitions / where-to-play / theory / capacities / management) → override (auto | force-complete | force-incomplete). Missing keys imply auto. Persists organiser overrides across browsers and users; replaces the prior localStorage-only useP2wStepOverrides hook.';
