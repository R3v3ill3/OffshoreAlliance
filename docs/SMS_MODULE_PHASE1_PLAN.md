# SMS Module — Phase 1 Implementation Plan (Broadcast)

**Parent brief:** `docs/SMS_MODULE_BRIEF.md` (§9 Phase 1)
**Builds on:** Phase 0 (`docs/SMS_MODULE_PHASE0_PLAN.md`, migration `20260810100000_sms_foundations.sql` — applied; generated types include the Phase 0 schema).
**Status:** Implemented 2026-08-10; adversarial review fixes applied same day (atomic queued→'sending' item claims + `claimed_at` + stale-claim recovery in the dispatcher, provider fetch timeout, paused-list edit restrictions + dispatch-time compliance re-check, count-query recounts + paged audience reads, webhook 500-on-event-insert-failure + constant-time token compare, timezone validation, `[TEST]` prefix on test sends). Migration `20260810120000_sms_broadcast.sql` pending apply; db-types regeneration deferred until then — hand-written rows extended in `src/types/sms.ts`.
**Git:** single commit on completion, primary working directory, no worktrees (per CLAUDE.md).

## Objectives

1. `sms_lists` / `sms_list_items` / `sms_send_log` / `sms_delivery_events` cloned from the email-list + email-engagement shapes.
2. Fourth `fire/sms` sibling for saved worker lists; fourth `'sms'` branch in `vw_campaign_worker_list_activity`; `vw_sms_campaign_summary` reporting view.
3. Plain-text SMS composer with live GSM-7/UCS-2 segment counter, worst-case merge-field expansion, mandatory org-name + opt-out validation, test-send-to-self, sender-number select, blackout override (recorded), optional schedule.
4. Send pipeline: queue action (stamps `send_before` per blackout window) → `dispatch-sms-queue` cron (opt-out re-check at send time, window enforcement, `sendBatch` with idempotency key, per-item results, `sms_send_log` upserts, counters).
5. Delivery/inbound webhook leg at `/api/sms/webhook` (HMAC when configured, shared-token fallback; idempotent via the `sms_delivery_events` unique constraint; STOP promotion via `sms_interactions` so the Phase 0 trigger fires).
6. Outreach → SMS sub-tab rendering `InlineSmsOpsPanel` (overview cards, blast list, list detail drawer).

Out of scope (later phases): inbox/conversations (2), in-chat assessment (3), surveys (4), ballots (5), relay (6), AI drafting (7).

---

## Work item 1 — Migration `supabase/migrations/20260810120000_sms_broadcast.sql`

House style: idempotent DDL, `VARCHAR + CHECK`, `can_write_to_campaign()` RLS template, grants incl. sequences, `update_updated_at` triggers.

- **`sms_lists`** (clone `email_lists`): `list_id SERIAL`, `campaign_id` FK, `draft_id → campaign_comms_drafts` (SET NULL), `name`, `description`, `status` `draft|queued|sending|sent|paused|cancelled`, `source_filters JSONB`, `sender_number_id → sms_numbers` (SET NULL), `timezone TEXT DEFAULT 'Australia/Perth'`, `blackout_override BOOLEAN DEFAULT false`, `blackout_override_reason TEXT`, `scheduled_for TIMESTAMPTZ`, counters `total_items/sent_items/delivered_items/failed_items`, `created_by`, timestamps + trigger.
- **`sms_list_items`**: `item_id SERIAL`, `list_id` FK CASCADE, `worker_id` FK CASCADE, `phone_e164`, `sort_order`, `status` `pending|queued|sent|delivered|failed|skipped|opted_out|blocked`, `provider_message_id`, `failure_reason`, `sent_at`, `delivered_at`, `send_before TIMESTAMPTZ`, timestamps + trigger, `UNIQUE(list_id, worker_id)`; indexes on `(list_id, sort_order)`, `(list_id, status)`, `worker_id`, partial on `provider_message_id`.
- **`sms_send_log`** (clone `email_send_log`): `send_id BIGSERIAL`, `UNIQUE(draft_id, worker_id)`, `campaign_id`, `list_id → sms_lists` (SET NULL), `phone_e164`, `provider_message_id`, `segments INT`, `cost NUMERIC(8,4)`, `status` `queued|sent|delivered|failed|blocked`, `sent_at/delivered_at/failed_at`, `failure_reason`, `reply_count DEFAULT 0`, `first_reply_at`. RLS: authenticated read only (writes service-role, matching `email_send_log`).
- **`sms_delivery_events`**: `event_id BIGSERIAL`, `provider_message_id NOT NULL`, `event_type` `queued|sent|delivered|failed|replied|opted_out`, `part_number INT NOT NULL DEFAULT 0`, `payload JSONB`, `occurred_at`; `UNIQUE(provider_message_id, event_type, part_number)` = webhook idempotency. **No user policies — service role only** (RLS enabled, no grants).
- **`campaign_worker_lists`**: add `fired_sms_list_id → sms_lists` (SET NULL); drop + re-add `default_purpose` CHECK to include `'sms'`.
- **`campaign_comms_drafts`**: drop + re-add `sent_via` CHECK adding `'mobile_message'` (keep `'yabbr'` for historical rows); add `sms_list_id → sms_lists` (SET NULL) + partial index.
- **`vw_campaign_worker_list_activity`**: replace with the 4-branch version (add `'sms'` UNION from `sms_list_items JOIN sms_lists`; remove the "intentionally absent" comment).
- **`vw_sms_campaign_summary`** (shape of `call_campaign_summary`): per (campaign, list) — status, timezone, schedule, counters, per-item-status counts, delivery-rate %; `GRANT SELECT TO authenticated`.
- **`app_settings`**: seed `sms_webhook_token` with a random hex value when absent (webhook shared-secret fallback; rotatable via the admin settings route allowlist).

## Work item 2 — Pure libs (unit-tested)

- `apps/organising-db/src/lib/sms/segments.ts` — GSM-7 basic + extended set detection (extended chars = 2 septets), UCS-2 fallback (surrogate pairs = 2 code units), 160/153 vs 70/67 part math; `countSegments(body)`; `expandMergeFieldsWorstCase(body)` using per-key worst-case widths (SAMPLE_DATA-informed) for a pre-send worst-case estimate.
- `apps/organising-db/src/lib/sms/blackout.ts` — default window 09:00–20:00 in the list's IANA timezone (`Australia/Perth` default) via `Intl.DateTimeFormat`; `isWithinSendWindow`, `nextWindowOpen`, `computeSendBefore` (= close of the window the message should go out in).
- `apps/organising-db/src/lib/sms/compliance.ts` — `validateSmsBody`: must contain "Offshore Alliance" and an opt-out phrase (`(reply|txt|text)? stop` or "opt out"); returns structured errors; shared by composer (client) and queue route (server re-check).
- Tests: `src/lib/sms/__tests__/{segments,blackout,compliance}.test.ts`.

## Work item 3 — Server routes

- **`POST /api/campaigns/[id]/worker-lists/[listId]/fire/sms`** — clone of `fire/email`: draft shell (`platform='sms'`, `entry_branch='build_list'`), `sms_lists` row, items from worker-list members joined to `workers(phone_e164, sms_opt_out)`; opted-out → status `'opted_out'`, no `phone_e164` → `'skipped'`, rest `'pending'`; `total_items` = pending count; link draft (`sms_list_id`), mark worker list fired (`fired_sms_list_id`); `redirect_to` the Outreach → SMS sub-tab with `?sms_list=` to open the composer.
- **`GET/POST /api/campaigns/[id]/sms-lists`** — list (rows + summary view merged) / create blast: draft + list + items from audience `{type:'worker_list'}` or `{type:'campaign'}` (via `campaign_worker_membership`), same skip/opt-out stamping.
- **`GET/PATCH /api/campaigns/[id]/sms-lists/[listId]`** — detail (list + draft body + items with worker names) / edit while `draft` (body, sender, timezone, blackout override + reason, schedule, name).
- **`POST /api/campaigns/[id]/sms-lists/[listId]/actions`** — `{action}`: `queue` (server-side compliance re-check + sender check, pending→queued with `send_before` stamped, list `queued`, draft `approved` + `sent_via='mobile_message'`), `pause`, `resume`, `cancel` (queued/pending → `skipped`).
- **`GET /api/sms/senders`** — active `sms_numbers` with organiser labels + `is_mine` (organiser email = user email) for the composer default.
- **`POST /api/campaigns/[id]/sms/test-send`** — rate-limited test-send-to-self: resolves merge fields with SAMPLE_DATA, sends one message via `getSmsProvider()`.
- **`POST /api/sms/webhook`** — raw body via `req.text()`; auth = provider HMAC (`verifyWebhook`) when the configured provider is `mobile_message`, else/fallback shared `?token=` vs `app_settings.sms_webhook_token`; dispatch via `provider.parseWebhook`:
  - `status` → insert `sms_delivery_events` (upsert `ignoreDuplicates` on the unique key; side effects only when the event row is new), monotonic item/send-log transitions (`sent → delivered|failed`; never downgrade `delivered`), recount list counters (idempotent).
  - `unsubscribe` → match workers on `toE164(from)`; set `sms_opt_out` (+at/source) directly for all matches **and** insert an `sms_interactions` row (`direction='inbound'`, body `'STOP'`, `phone_e164`, upsert-safe on `external_message_id`) so the Phase 0 trigger/audit trail fires; `opted_out` event row when a provider message id is present.
  - `inbound` → Phase 1 minimal: insert `sms_interactions` (worker matched by `phone_e164`; skipped when unmatched — triage is Phase 2), `replied` event row + `sms_send_log.reply_count`/`first_reply_at` bump via `original_custom_ref` (= send_id) or `original_message_id`, guarded by event-row insertion for idempotency.
  - Unhandled/unknown types → `200 {ok:true}`. All writes via `createAdminClient()`.
- **`GET /api/cron/dispatch-sms-queue`** — `CRON_SECRET` auth (clone `materialise-sequence-runs`); drains `queued` items (batch cap 500/run): per eligible list (status `queued|sending`, `scheduled_for` due, window open in `sms_lists.timezone` unless `blackout_override`) — mark `sending`, re-check `workers.sms_opt_out` (→ `opted_out`) and `phone_e164` (→ `skipped`) at send time, resolve merge fields per worker (base context via `loadCampaignEmailContext` + worker fields), upsert `sms_send_log` (custom_ref = send_id), `sendBatch` with sender = list number's E.164 digits without `+` and per-batch idempotency key, write per-item results (`sent`/`blocked`/`failed`), recount counters, complete list to `sent` when drained. Registered in `vercel.json` at `*/5 * * * *`.

## Work item 4 — UI

- `apps/organising-db/src/app/(dashboard)/campaigns/[id]/page.tsx` — 4th Outreach sub-tab trigger `SMS` rendering `InlineSmsOpsPanel` (note added in `lib/campaign-tabs.ts`; `outreach` default sub unchanged).
- `components/sms/InlineSmsOpsPanel.tsx` — overview cards (recipients / sent / delivered / failed / opt-outs from the summary), "New SMS blast" (Sheet with composer), blast table (status badge, progress, queue/pause/resume/cancel actions), list detail drawer (per-item status + failure reasons), auto-opens a list arriving via `?sms_list=` (fire redirect).
- `components/sms/SmsComposer.tsx` — plain-text textarea (no TipTap) with merge-field chip buttons from the shared registry, template picker (`comms_template_library` `platform='sms'`), live segment counter (chars, encoding, parts, worst-case-with-merge, UCS-2 warning), compliance checklist that blocks queueing, sender select (defaults to the user's organiser number), blackout override toggle + required reason + warning copy, optional schedule datetime, test-send-to-self.
- `lib/hooks/useSmsBroadcast.ts` — TanStack Query hooks over the routes above (+ sender + template queries); toasts via sonner in the components.

## Work item 5 — Types

- Extend `apps/organising-db/src/types/sms.ts` with hand-written rows for `sms_lists`, `sms_list_items`, `sms_send_log`, `sms_delivery_events`, `vw_sms_campaign_summary` (TODO: replace after migration apply + regen). `generated.ts` is NOT regenerated in this phase (migration not applied). Server routes use the untyped server/admin clients, so no schema-cast hacks are needed.

## Verification checklist

1. `npx tsc --noEmit` clean from `apps/organising-db`.
2. `npx vitest run` — segments (GSM-7 boundaries 160/161, 306/307; UCS-2 70/71, 134/135; extended-char septet cost; merge worst-case), blackout (Perth/Sydney, before/inside/after window, send_before), compliance (org name + STOP phrasing variants).
3. ESLint on touched files (pre-existing errors ignored).
4. Not done in this phase (deferred to apply-time): migration apply, `get_advisors`, live sandbox send.

## Agent/model notes

Adversarial review should focus on: webhook idempotency + auth fallback, opt-out enforcement at fire/queue/dispatch, RLS template adherence for the two user-facing tables vs service-role-only event/log tables, blackout math around midnight/DST, and the drop/re-add CHECK constraint pattern.
