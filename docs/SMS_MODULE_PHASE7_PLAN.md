# SMS module — Phase 7 plan: AI assist, reporting & polish

**Brief:** `docs/SMS_MODULE_BRIEF.md` §8.2 (AI reply drafting), §9 Phase 7
(reporting, "list from responders", exports, docs), §3.1 item 11 (metrics —
delivered as the response-rate denominator, per-sender reply latency).

**Status:** implemented 2026-08-11. Final phase of the planned SMS build.

---

## 1. Existing patterns reused (found, not invented)

- **AI calls:** the app's AI panels (`AiBriefPanel` → `/api/generate-draft`)
  call the Anthropic SDK **directly inside the route** with
  `process.env.ANTHROPIC_API_KEY`, a model constant from
  `src/lib/ai/models.ts` (`AI_MODEL`), a `{system, user}` prompt-builder in
  `src/lib/prompts/*`, and fence-tolerant JSON parsing. The client uses
  `fetchApi(..., { timeoutMs: API_FETCH_TIMEOUT_LLM_MS })`. Phase 7 mirrors
  all of it; the only deliberate difference is that a **missing API key
  returns 503** (clear degradation, per phase spec) where `/api/generate-draft`
  returns 500.
- **Route shape:** auth → `checkRateLimit` → load conversation →
  `can_write_to_campaign` RPC when campaign-scoped → explicit opt-out check —
  exactly the `POST …/conversations/[id]/assessments` / `…/messages` pattern.
- **CSV export:** `GET /api/campaigns/[id]/phone/attempts/export` — CSV
  string, `text/csv; charset=utf-8`, `Content-Disposition: attachment`.
  The escaping helper is lifted into `src/lib/api/csv.ts` so the two new
  exports share it.
- **Worker-list creation:** `POST /api/campaigns/[id]/worker-lists` insert
  shape (`campaign_worker_lists` + `campaign_worker_list_items`, RLS-gated
  by `can_write_to_campaign`); cohort lists use `source:
  'sms_blast_cohort' | 'sms_survey_cohort'` and `default_purpose: null`
  so they are usable by every channel.
- **Views:** house style of `vw_sms_campaign_summary` / `vw_sms_survey_funnel`
  (CREATE OR REPLACE VIEW, `GRANT SELECT … TO authenticated`, no
  `security_invoker` — consistent with every existing SMS view).

## 2. Migration `20260811190000_sms_ai_reporting.sql`

> Timestamp deviation: the phase spec named `…180000`, but the working tree
> already contains `20260811180000_sms_phase8_survey_targets.sql`, so this
> migration takes the next slot.

1. `ALTER TABLE sms_messages ADD COLUMN IF NOT EXISTS ai_assisted BOOLEAN
   NOT NULL DEFAULT false` — §8.2 "log that a draft was AI-assisted on the
   message row".
2. `vw_sms_sender_stats` — per `(campaign_id, sender_user_id)` over outbound
   `sms_messages` joined to `sms_conversations`: `replies_sent`,
   `conversations` (distinct), `ai_assisted_count`, and
   `median_reply_latency_seconds` via
   `percentile_cont(0.5) WITHIN GROUP … FILTER (WHERE prev_direction =
   'inbound')` over a `LAG()` window per conversation (an outbound whose
   immediately-preceding message is inbound = a reply; latency measured from
   the most recent inbound). `campaign_id` may be NULL (org-wide threads).
3. `vw_sms_campaign_rollup` — one row per campaign across blasts /
   conversations / surveys: sends (dispatched = sent+delivered+failed),
   delivered, failed, `delivery_rate_pct` (delivered / dispatched — the §3.1
   item 11 convention), inbound replies, conversations-with-reply,
   `reply_rate_pct` (**conversations-with-reply / delivered** — delivered as
   denominator; cross-source approximation, documented in the view comment),
   active conversations (`needs_response`/`convo`), opt-outs surfaced
   (blast items `opted_out`+`blocked` + survey sessions `opted_out` —
   suppressions and STOPs attributable to campaign sends), surveys and
   completed sessions.

Both views: `GRANT SELECT TO authenticated` (same exposure as every other
SMS view — underlying tables are staff-readable anyway).

## 3. AI reply drafting (§8.2)

- **`src/lib/prompts/sms-reply-prompts.ts`** — pure, unit-tested:
  `buildSmsReplyPrompt(ctx)` → `{system, user}` and
  `parseDraftReplyCandidates(text)` (fence-tolerant JSON → validated,
  phone-number-sanitised candidates). System prompt guardrails: never invent
  commitments/dates/meetings/figures; **no industrial or legal advice** —
  the escalation candidate acknowledges and hands off; ≤2 SMS segments
  preferred; plain Australian English; never include any phone number; never
  reveal AI involvement; strict JSON output of up to 3 candidates
  (`reply`, `reply_and_advance`, `escalate_tone`).
- **`POST /api/sms/conversations/[id]/draft-reply`** — auth + rate limit +
  campaign write gate (campaign-scoped threads) + **403 when the worker has
  opted out**; 503 when `ANTHROPIC_API_KEY` is unset. Server-side context:
  last 20 messages, worker profile (name/occupation/employer/opt-out),
  recent `campaign_activity_ratings` for the attached campaign (joined to
  activity titles), the attached activity (title/description/kind/binary/
  supporter outcome — the CTA), active canned replies (campaign + org-wide,
  tone reference), campaign name and the requesting organiser's display
  name. Model = `AI_MODEL`. Returns `{candidates: [{kind, label, body,
  segments}]}` — **never auto-sent**.
- **UI (`SmsThreadView`)** — "Draft reply" button in the composer → up to 3
  candidate cards (label + body + segment count) → "Use" loads the text into
  the composer (fully editable). A draft-derived reply sends
  `ai_assisted: true` through `useSendSmsReply` → `POST …/messages` (new
  optional body param, default false) → stamped on the `sms_messages` row.
  The flag resets when the composer is emptied or the thread changes.

## 4. Reporting & polish

- **`GET /api/campaigns/[id]/sms-reporting`** — rollup row + sender stats
  rows (+ display names) for the campaign; rendered in the Blasts tab of
  `InlineSmsOpsPanel` as campaign rollup cards + a per-sender table
  (replies, conversations, median reply latency, AI-assisted count).
- **Create list from responders** (closes the organising loop, §3.1 item 11):
  - `POST /api/campaigns/[id]/sms-lists/[listId]/worker-list`
    `{cohort: 'replied' | 'delivered_not_replied' | 'failed', name?}` —
    "replied" = the item's worker has any conversation inbound
    (`last_inbound_at`) at/after the item's `sent_at`.
  - `POST /api/campaigns/[id]/sms-surveys/[surveyId]/worker-list`
    `{cohort: 'completed' | 'started_not_completed' | 'non_responders',
    name?}` — over the survey's frozen sessions; `non_responders` excludes
    `opted_out` sessions (they responded — with STOP).
  - Both: auth + rate limit + `can_write_to_campaign`; cohort math is pure
    (`src/lib/sms/reporting-cohorts.ts`, unit-tested); creates a draft
    `campaign_worker_list` (+items) usable by phone/email/task/SMS; buttons
    on the blast detail sheet and the survey funnel report.
- **CSV exports** (mirror the phone attempts export):
  - `GET /api/campaigns/[id]/sms-lists/[listId]/export` — one row per
    recipient (name, phone, status, failure reason, sent/delivered at).
  - `GET /api/campaigns/[id]/sms-surveys/[surveyId]/export` — long format,
    one row per (session, answered question) plus answerless session rows;
    **403 for results-restricted ballots** (the aggregate tally is their
    only reporting surface — matches the Phase 5 UI rule).
- **Docs:** `docs/SMS_MODULE_HOWTO.md` — operator guide (blasts, inbox,
  assessments, surveys, ballots, relays, AI drafting, reporting), sandbox
  testing (mock provider, `/v1/test-inbound`, 000-failure numbers) and the
  go-live checklist (real creds, claim the 6 numbers, webhook URL + token,
  provider flip, purge test data).

## 5. Types

`packages` types stay generated-only; the hand shims in
`src/types/sms.ts` gain `ai_assisted` on `SmsMessageRow`,
`VwSmsSenderStatsRow`, and `VwSmsCampaignRollupRow` (same TODO note —
replace after `pnpm gen:types` post-apply).

## 6. Out of scope (unchanged from brief)

§8.2 stretch items (open-text categorisation, next-best-action), Phase 8
delegate share links, XLSX export variants.
