# SMS Module — Phase 0 Implementation Plan (Foundations)

**Parent brief:** `docs/SMS_MODULE_BRIEF.md` (§9 Phase 0)
**Status:** Implemented 2026-08-10 (migration `20260810100000_sms_foundations.sql` pending apply; db-types regeneration deferred until then — hand-written rows in `src/types/sms.ts`). No provider account needed for this phase (mock provider covers all testing; live/sandbox credentials only plug into the admin card at the end).
**Git:** single commit on completion, primary working directory, no worktrees (per CLAUDE.md).

## Objectives

1. Worker-level SMS consent/opt-out (currently nothing exists — Spam Act prerequisite).
2. One canonical phone normalisation module + `workers.phone_e164` backfill (three divergent implementations today).
3. `SmsProvider` abstraction with `MobileMessageProvider` + `MockProvider`.
4. Remove all yabbr code (salvaging E.164 logic and template seeds).
5. `sms_numbers` registry with per-organiser assignment (6-number model, brief §7.0).
6. Mobile Message admin settings card.
7. Schedule the existing-but-unregistered `materialise-sequence-runs` cron.

Everything below follows house conventions: SERIAL PKs, `VARCHAR + CHECK` (no PG enums), `TIMESTAMPTZ DEFAULT now()`, `trg_<t>_updated_at`, idempotent DDL, RLS via `can_write_to_campaign()`/`is_admin()` templates, grants incl. sequence usage.

---

## Work item 1 — Migration: consent, E.164, number registry

New file `supabase/migrations/<ts>_sms_foundations.sql`:

**1a. `workers` consent + normalised phone columns**
- `sms_opt_out BOOLEAN NOT NULL DEFAULT false`
- `sms_opt_out_at TIMESTAMPTZ`, `sms_opt_out_source VARCHAR(20) CHECK IN ('inbound_stop','staff','import')`
- `sms_consent_source VARCHAR(20) CHECK IN ('import','manual','legacy')` — stamped `'legacy'` for existing rows in this migration; the import wizard and worker create/edit paths set `'import'`/`'manual'` from now on (consent is explicit at collection per brief §8.5; this records provenance, it does not gate).
- `phone_e164 VARCHAR(16)` + index `idx_workers_phone_e164`.
- SQL backfill of `phone_e164` from `workers.phone` handling the observed formats (`04…`, `+614…`, `614…`, spaces/dashes/parens); leave NULL where unparseable — surfaced later by the admin data-quality readout (1d). No destructive change to `workers.phone`.
- `BEFORE UPDATE OF phone` trigger `workers_phone_e164_sync` re-deriving `phone_e164` (clone shape of `reset_worker_email_status_on_email_change()`, `20260625130000:64`).

**1b. STOP promotion trigger (works with the already-existing `sms_interactions`)**
- `AFTER INSERT ON sms_interactions` trigger `trg_sms_optout_keyword`: when `direction='inbound'` and `body ~* '^\s*(STOP|UNSUB|UNSUBSCRIBE|OPT ?OUT|QUIT|END)\b'` → set `workers.sms_opt_out = true, sms_opt_out_at = now(), sms_opt_out_source = 'inbound_stop'`. Fires **before** rating semantics matter because `trg_sms_to_rating` ignores keyword bodies anyway (no `activity_id`-scoped CTA match); order is not load-bearing, both triggers are independent. Mobile Message also intercepts STOP platform-side (`unsubscribe` webhook, sends return `blocked`) — this trigger is the belt to that brace, and covers manual/staff-entered interactions.
- Companion: `START|UNSTOP` match clears the flag (`sms_opt_out = false`, source preserved in a log line via `worker_activity_log` insert inside the trigger function).
- Also promote the existing phone-ops signal: one-off UPDATE setting `sms_opt_out` for workers whose latest `call_attempts.dial_disposition = 'do_not_call'` is **not** done in Phase 0 (semantics differ: do-not-call ≠ do-not-text under explicit consent). Deferred; noted for the Phase 2 inbox design instead.

**1c. `sms_numbers` + assignment history**
```
sms_numbers(
  number_id SERIAL PK,
  phone_e164 VARCHAR(16) NOT NULL UNIQUE,
  label VARCHAR(100),
  purpose VARCHAR(20) NOT NULL CHECK IN ('organiser','relay','survey','spare') DEFAULT 'spare',
  organiser_id INT NULL REFERENCES organisers(organiser_id),
  provider VARCHAR(30) NOT NULL DEFAULT 'mobile_message',
  status VARCHAR(20) NOT NULL CHECK IN ('active','retired') DEFAULT 'active',
  notes TEXT, created_at/updated_at + trigger
)
sms_number_assignments(
  assignment_id SERIAL PK,
  number_id INT NOT NULL REFERENCES sms_numbers,
  purpose VARCHAR(20) NOT NULL,
  organiser_id INT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  unassigned_at TIMESTAMPTZ NULL
)
```
- Reassignment RPC `assign_sms_number(number_id, purpose, organiser_id)` (SECURITY DEFINER, admin-gated): closes the open assignment row, opens a new one, updates `sms_numbers` — keeps history append-only.
- RLS: authenticated read `USING (true)` (numbers aren't secret in-app); writes admin-only (`is_admin()`), matching `app_settings` posture.

**1d. `sms_interactions` hardening (pre-work for Phases 1–2)**
- Add `phone_e164 VARCHAR(16)` column + backfill from `phone_number`.
- UNIQUE index on `external_message_id` (`WHERE external_message_id IS NOT NULL`) — webhook idempotency foundation.

**1e. Template seeds**
- INSERT the four salvaged yabbr `DEFAULT_SMS_TEMPLATES` (meeting_invite, action_reminder, membership_check, bargaining_update — from `lib/api/yabbr.ts:107`, converted to `{{var}}` registry names) into `comms_template_library` with `platform='sms'`, guarded by `WHERE NOT EXISTS` on title+platform.

---

## Work item 2 — Unified phone normalisation

New `apps/organising-db/src/lib/phone/normalise-phone.ts`:
- `toE164(raw): string | null` (AU mobile: `+614xxxxxxxx`; accepts `04…`, `+614…`, `614…`, `4…` 9-digit, punctuation/whitespace tolerant; rejects landlines for SMS purposes but expose `toE164Any` for general phones)
- `toLocal(e164): string` (`04xxxxxxxx`) · `toDisplay(e164): string` (`0400 100 014`) · `isAuMobile(raw): boolean`
- Unit-testable pure module; add a small test file if the repo's test harness allows, else a `__fixtures__` table exercised by TestSprite later.

Refactor call sites to consume it:
- `apps/organising-db/src/app/api/worker-import/parse/route.ts:152` — replace local `normalisePhone()`; also **write `phone_e164` on import apply** and stamp `sms_consent_source='import'`.
- `apps/organising-db/src/app/api/membership-import/parse/route.ts` — same.
- `apps/organising-db/src/lib/phone/format-phone-display.ts` — re-export/delegate to `toDisplay` (keep the file as a shim so existing imports don't churn).
- Worker create/edit API route(s) — derive `phone_e164`, stamp `sms_consent_source='manual'` when a phone is first added.

The DB trigger (1a) is the safety net for any path missed.

---

## Work item 3 — `SmsProvider` abstraction

New `apps/organising-db/src/lib/sms/provider/`:
- `types.ts` — modelled on `lib/phone/telephony/types.ts`:
  ```ts
  interface SmsProvider {
    readonly name: string
    readonly capabilities: { mms: boolean }   // brief §8.1 — MMS-optionality from day one
    sendBatch(msgs: OutboundSms[], opts?: { idempotencyKey?: string }): Promise<SendResult[]>
    getMessageStatus(providerMessageId: string): Promise<MessageStatus>
    listSenders(): Promise<SenderId[]>
    getCreditBalance(): Promise<number>
    verifyWebhook(rawBody: string, headers: Record<string,string>): boolean
    parseWebhook(rawBody: string): SmsWebhookEvent   // inbound | unsubscribe | status
  }
  ```
  `OutboundSms` carries `to`, `body`, `sender`, `customRef`, `scheduledFor?`, `media?: null` (reserved).
- `mobile-message-provider.ts` — `POST /v1/messages` (batch ≤10k, Basic auth, `Idempotency-Key` header), `GET /v1/messages`, `GET /v1/senders`, `GET /v1/account`; HMAC verification per `X-MM-Timestamp`/`X-MM-Signature`; maps payloads (incl. `original_message_id`/`original_custom_ref` passthrough on inbound events). Respect the 5-concurrent-request account limit with a simple in-module semaphore; surface per-message `status:'blocked'` (recipient unsubscribed provider-side) as a distinct result code.
- `mock-provider.ts` — in-memory; records sends, can synthesise delivery/inbound events for tests and local dev.
- `index.ts` — `getSmsProvider()`: reads credentials from `app_settings` (keys below) with env fallback (`MOBILE_MESSAGE_API_USERNAME`/`MOBILE_MESSAGE_API_PASSWORD`, `SMS_PROVIDER=mock|mobile_message`), resolving the split-brain pattern that plagued the yabbr card.

No sending UI in Phase 0 — the provider is exercised only by the admin card's balance/senders readout and by tests against the mock.

---

## Work item 4 — Remove yabbr

- Delete `apps/organising-db/src/lib/api/yabbr.ts` (after salvage: E.164 logic already superseded by item 2; templates seeded by 1e).
- Delete `apps/organising-db/src/app/api/yabbr/route.ts` (unauthenticated — must not survive the phase regardless).
- `apps/organising-db/src/app/(dashboard)/administration/page.tsx:1580-1690` — replace the "Yabbr API" card (item 5).
- `apps/organising-db/src/app/api/admin/settings/route.ts` — drop `yabbr_api_key`/`yabbr_api_url` from the allowlist; add the Mobile Message keys.
- Repo-wide grep for `yabbr` to catch stragglers (`campaign_comms_drafts.sent_via` CHECK includes `'yabbr'` — leave the DB value for historical rows; extend the CHECK with `'mobile_message'` in the Phase 1 migration, not now).

## Work item 5 — Admin: Mobile Message card

In `administration/page.tsx` (same slot as the removed card):
- Settings: `mobile_message_api_username`, `mobile_message_api_password` (stored in `app_settings`, admin-only RLS — house pattern), `sms_provider` (`mock`/`mobile_message`).
- Readouts via new authenticated admin route `app/api/admin/sms/status/route.ts` (auth + `is_admin` + `checkRateLimit`): credit balance, registered senders (`listSenders`), and a numbers panel listing `sms_numbers` with purpose/organiser assignment (uses `assign_sms_number`), plus a data-quality line: count of workers with phone but NULL `phone_e164`.

## Work item 6 — Cron registration

- `apps/organising-db/vercel.json`: add `{"path": "/api/cron/materialise-sequence-runs", "schedule": "*/10 * * * *"}` (route already exists and is `CRON_SECRET`-gated; `sms_blast` sequence steps in later phases depend on it).

## Work item 7 — Types & docs

- Regenerate `packages/db-types/generated.ts`.
- Update `docs/SMS_MODULE_BRIEF.md` status line (Phase 0 done) on completion.

---

## Verification checklist (pre-commit)

1. `pnpm typecheck` / build clean; no remaining `yabbr` references outside migrations history and historical enum value.
2. Normaliser unit cases: `0400 100 014` / `+61 400-100-014` / `61400100014` / `400100014` → `+61400100014`; landline `0862345678` rejected by `toE164` (mobile), accepted by `toE164Any`; garbage → null.
3. Migration applied to dev branch DB (Supabase MCP `apply_migration` on a dev branch, not prod): backfill coverage %, spot-check unparseables; STOP trigger fires on an inserted inbound `sms_interactions` row and sets the worker flag; START clears it; `assign_sms_number` closes/opens history rows.
4. Admin card: mock provider selected → balance/senders readouts render mock data; switching to `mobile_message` with dummy creds fails gracefully (no crash, clear error).
5. RLS: non-admin cannot write `sms_numbers`/settings; authenticated can read numbers.
6. `get_advisors` (Supabase MCP) run post-migration for security/performance lints.

## Explicitly out of scope for Phase 0

Sending of any kind, webhook route, `sms_lists`/conversations/surveys/relays, UI beyond the admin card, delegate links, do-not-call ↔ sms_opt_out unification (Phase 2 design question).

## Agent/model notes (per brief §9.2)

Top-tier model for this phase (touches `workers`, triggers, RLS, many import paths). Single implementation agent; adversarial review pass focused on: backfill safety on `workers`, trigger correctness (no interference with `trg_sms_to_rating`), RLS template adherence, and complete yabbr removal. One commit: `feat(sms): Phase 0 foundations — consent, E.164, provider abstraction, number registry`.
