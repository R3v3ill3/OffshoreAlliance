# Campaign 42 employer-mismatch diagnostic and cleanup

Read-only report plus an optional removal of members whose global employer is
not the campaign employer (the Brendon Annad / Parrabellum-on-Wheatstone
case).

These are **not** migrations. Do not copy them under `supabase/migrations/`
or run them with `supabase db push`.

## Will a delete just add them back?

**Yes, until the AND matcher is deployed.** Opening the wall chart posts
`/api/campaigns/42/sync-universe-workers`, which used to add anyone at
Gorgon / Wheatstone. After this change, default matching is employer
**and** worksite. Sector-wide (the existing “Sector-wide campaign” switch,
also shown under Employers & worksites) keeps employer **or** worksite.

Run order:

1. Merge / deploy this branch so campaign 42 (not sector-wide) uses AND.
2. Confirm the “Include other employers at these sites” switch is **off**.
3. Run `00_…sql` and review the named list.
4. Run `10_…sql` (production: `SET LOCAL oux.env = 'production';` after `BEGIN;`).
5. `11_…sql` only if you need to put the rows back.

`10` refuses if campaign 42 is sector-wide, because OR matching would
re-add the workers on the next wall-chart open.

## Files

| File | Purpose |
|---|---|
| `00_identify_wrong_employer_members.sql` | Read-only: universe, Brendon lookup, named mismatch list, other campaigns. |
| `10_remove_wrong_employer_members.sql` | Delete those memberships + campaign unit placements + this campaign’s list items. Logs to `_oux_hygiene_log`. |
| `11_rollback_remove_wrong_employer_members.sql` | Restore from the hygiene log. |

Default `campaign_id` in `00` is 42 (`oux.diag_campaign_id`).
