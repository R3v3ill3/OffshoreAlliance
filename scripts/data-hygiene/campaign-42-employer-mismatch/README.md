# Campaign 42 employer-mismatch diagnostic

Read-only SQL for the Downer EDI campaign (id 42). It lists members whose
global employer is not the campaign's declared employer(s) — the Brendon
Annad / Parrabellum-on-Wheatstone case.

This is **not** a migration. Do not copy it under `supabase/migrations/` or
run it with `supabase db push`. Run the file in the SQL Editor (or
`psql -1 -v ON_ERROR_STOP=1 -f`) as a report. It creates session-local temp
tables only and changes no application data.

## Why these workers appear

Campaign membership uses **OR** matching
(`workerMatchesCampaignUniverse` in `sync-campaign-universe.ts`): a worker
is pulled in if their employer is in `campaign_employers` **or** their
worksite is in `campaign_worksites`. Opening the wall chart re-runs
`POST /api/campaigns/:id/sync-universe-workers`, which is additive only.

Unit auto-placement was tightened to **AND** (WP2.1 F1): a unit that
carries both `employer_id` and `worksite_id` in `unit_basis` now requires
both. Existing placements were never withdrawn. WP2.1/2.2 hygiene only
removed same-group duplicates (H9), not wrong-employer members.

The shared organiser (Jarred) is a correlation: Gorgon LNG and Wheatstone
LNG are multi-employer sites on his patch. Organiser is not a membership
predicate.

## File

| File | Prints |
|---|---|
| `00_identify_wrong_employer_members.sql` | Campaign 42 universe; Brendon Annad lookup; members whose employer is not in `campaign_employers` (and a name-pattern view for “not EDI / Downer / Chevron”); unit placements that fail current F1; employer/worksite/source histograms; the same OR-membership pattern on other live campaigns. |

Default `campaign_id` is 42. Change the `v_campaign_id` assignment at the
top of the file to reuse it.

No delete is included. Removal is still manual (Unassign / Remove from
campaign) until a separately approved mutating script exists.
