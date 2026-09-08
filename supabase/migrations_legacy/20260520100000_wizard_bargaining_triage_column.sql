-- Phase 1: Add wizard_bargaining_triage column to campaigns.
--
-- Captures the organiser's coarse read on how far along bargaining is at the
-- point of campaign creation. Drives step 7 form shape (bargaining context
-- section) and step 9 routing (OA Planner vs Bargaining to Win setup).
--
-- Nullable — no backfill. Existing rows implicitly treat NULL as 'not_started'
-- for routing purposes (unchanged behaviour).

ALTER TABLE campaigns
  ADD COLUMN wizard_bargaining_triage TEXT
    CHECK (wizard_bargaining_triage IN ('not_started', 'underway', 'advanced'));
