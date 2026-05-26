# Email Engagement Tracking — Implementation Plan

Per-recipient email send logging, Microsoft Graph reply detection, conversation thread surfacing, bounce scanning with editable recovery, and click-through tracking. Builds directly on top of the Outlook OAuth integration already shipped (see `docs/OUTLOOK_OAUTH_SETUP.md`).

## Context

The OffshoreAlliance email composer already supports four send paths: Action Network push, Save-to-Outlook (personalised drafts), Save-to-Outlook (shared BCC draft), `mailto:` for small lists, and `.eml` download for larger ones. Microsoft Graph access is wired via `Mail.ReadWrite` scope (`apps/organising-db/src/lib/integrations/microsoft-graph.ts`), with per-user encrypted refresh tokens in `user_oauth_connections`.

Today there's no per-recipient ledger of what was sent, no engagement tracking, and no surface for organiser–worker conversation threads. This plan adds five capabilities sharing two new core tables (`email_send_log`, `email_engagement_events`):

1. **Per-recipient send log + "Emailed" tag** — auto-attached when an email is saved to Outlook / pushed to AN / sent via mail client.
2. **Reply tracking** — Microsoft Graph poll every 10 min detects replies, tags worker as `Replied`, surfaces first reply as a note.
3. **Conversation thread view** — worker profile section + Outlook deep-link to jump to the thread in their own mailbox.
4. **Bounce scanning** — detect DSN messages, tag worker as `Email bounced`, mark email as invalid, auto-skip in recipient selection. Editing the email address clears the flag.
5. **Click tracking** — outbound link rewriter + redirector that logs CTR per worker. Outlook send paths only; AN handles its own clicks.

## Resolved architecture decisions

| Decision | Choice |
|---|---|
| Polling frequency | **Every 10 minutes** via Vercel cron |
| Bounce handling | **Skip-by-default on send** — `workers.email_status='invalid'` auto-excludes from recipient selection. A Postgres trigger resets `email_status` to `NULL` whenever `workers.email` is updated, so fixing a typo automatically un-skips the worker. Worker profile shows a "Bounced — edit email to retry" affordance. |
| Click tracking scope | **Outlook send paths only**. AN handles its own click tracking in its dashboard; rewriting AN-path links would duplicate. |
| Reply tracking depth | **Count all replies; persist details for first reply only.** First reply auto-writes a `worker_notes` row with the snippet. Subsequent replies bump `reply_count` and update `latest_reply_message_id` for the deep-link, but don't create more notes. |
| Outlook deep-link for multi-reply threads | **Yes — Outlook web automatically shows the conversation view when you open any message in the thread.** Worker profile surfaces a "Open thread in Outlook" link that points to `https://outlook.office.com/mail/inbox/id/{messageId}` using the latest reply's message ID, so the organiser lands on the most recent reply with full context visible. |
| Webhooks | **Deferred.** Polling at 10 min is the v1 path. Webhook subscription / renewal infrastructure is documented as a follow-up phase but not built. |

## Schema

**Migration**: `supabase/migrations/20260625130000_email_engagement_tracking.sql`

```sql
-- One row per (draft, worker) at send time. Single source of truth for
-- "did this worker get this email?" across all four send paths.
CREATE TABLE email_send_log (
  send_id                  bigserial PRIMARY KEY,
  draft_id                 bigint NOT NULL REFERENCES campaign_comms_drafts(draft_id) ON DELETE CASCADE,
  campaign_id              bigint NOT NULL,
  worker_id                bigint NOT NULL REFERENCES workers(worker_id) ON DELETE CASCADE,
  recipient_email          text NOT NULL,
  -- 'outlook_personalised' | 'outlook_bcc' | 'action_network' | 'mailto' | 'eml'
  send_method              text NOT NULL,
  -- Graph conversationId from POST /me/messages. NULL for AN / mailto / eml paths.
  conversation_id          text,
  -- Graph message ID of the created draft (for cross-referencing / audit).
  external_message_id      text,
  user_id                  uuid REFERENCES auth.users(id),
  created_at               timestamptz NOT NULL DEFAULT now(),
  -- Materialised engagement signals (updated by poll cron + click redirector).
  replied_at               timestamptz,                 -- first reply timestamp only
  reply_snippet            text,                        -- first reply snippet only
  first_reply_message_id   text,                        -- Graph id of first reply
  latest_reply_message_id  text,                        -- Graph id of most recent reply (for deep-link on multi-reply threads)
  reply_count              int NOT NULL DEFAULT 0,      -- count of all replies received
  bounced_at               timestamptz,
  bounce_reason            text,
  first_click_at           timestamptz,
  click_count              int NOT NULL DEFAULT 0
);
CREATE INDEX email_send_log_worker_idx          ON email_send_log (worker_id, created_at DESC);
CREATE INDEX email_send_log_draft_idx           ON email_send_log (draft_id);
CREATE INDEX email_send_log_conversation_idx    ON email_send_log (conversation_id) WHERE conversation_id IS NOT NULL;

-- Granular event audit log.
CREATE TABLE email_engagement_events (
  event_id     bigserial PRIMARY KEY,
  send_id      bigint NOT NULL REFERENCES email_send_log(send_id) ON DELETE CASCADE,
  event_type   text NOT NULL CHECK (event_type IN ('replied','bounced','clicked','forwarded')),
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  payload      jsonb
);
CREATE INDEX email_engagement_events_send_idx ON email_engagement_events (send_id, occurred_at DESC);

-- Click-tracking tokens. One row per (send, original_url).
CREATE TABLE email_click_tokens (
  token        text PRIMARY KEY,                -- 22-char URL-safe random
  send_id      bigint NOT NULL REFERENCES email_send_log(send_id) ON DELETE CASCADE,
  target_url   text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  hits         int NOT NULL DEFAULT 0
);
CREATE INDEX email_click_tokens_send_idx ON email_click_tokens (send_id);

-- Worker email validity flag — set by bounce phase, auto-cleared on email edit.
ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS email_status text
    CHECK (email_status IN ('valid','invalid','unverified')) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS email_status_updated_at timestamptz;

-- Trigger: editing workers.email clears email_status so a corrected address
-- becomes eligible for sending again. The composer's recipient selection
-- filter joins on email_status; NULL = eligible, 'invalid' = skipped.
CREATE OR REPLACE FUNCTION reset_worker_email_status_on_email_change()
RETURNS trigger AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    NEW.email_status := NULL;
    NEW.email_status_updated_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS workers_email_status_reset ON workers;
CREATE TRIGGER workers_email_status_reset
  BEFORE UPDATE OF email ON workers
  FOR EACH ROW EXECUTE FUNCTION reset_worker_email_status_on_email_change();

-- Per-user mailbox poll cursor.
ALTER TABLE user_oauth_connections
  ADD COLUMN IF NOT EXISTS last_polled_at timestamptz;

-- Seed engagement tags.
INSERT INTO tags (tag_name, tag_category, color) VALUES
  ('Emailed',       'email', '#6366f1'),
  ('Replied',       'email', '#10b981'),
  ('Email bounced', 'email', '#ef4444'),
  ('Clicked link',  'email', '#0ea5e9')
ON CONFLICT (tag_name) DO NOTHING;

-- RLS
ALTER TABLE email_send_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_engagement_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_click_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY email_send_log_read ON email_send_log
  FOR SELECT TO authenticated USING (true);
CREATE POLICY email_engagement_events_read ON email_engagement_events
  FOR SELECT TO authenticated USING (true);
-- email_click_tokens: no user policy → server-only via service role.
```

## Phase 0 — Shared infrastructure

**Files**:
- `supabase/migrations/20260625130000_email_engagement_tracking.sql` (schema above)
- `apps/organising-db/src/lib/comms/send-log.ts` — helper module exporting:
  - `recordEmailSend(input)` — idempotent insert into `email_send_log` keyed by `(draft_id, worker_id)`.
  - `tagWorkerEmailed(workerId)` — attaches the seed tag, idempotent.
  - `tagWorkerReplied(workerId)`, `tagWorkerBounced(workerId)`, `tagWorkerClicked(workerId)` — same pattern.
  - `markEmailBounced(workerId, reason)` — updates `workers.email_status='invalid'` plus tag.

Effort: 1 day.

## Phase 1 — Sent log + "Emailed" tag

Wire `recordEmailSend` + `tagWorkerEmailed` into every send path. Add a worker profile section showing email history.

**Modified**:
- `apps/organising-db/src/app/api/campaigns/[id]/emails/[draftId]/save-to-outlook/route.ts`
  - Personalised mode: after each successful `createDraft`, record send with `sendMethod: 'outlook_personalised'`, capture `conversationId` + `id` from Graph response.
  - BCC mode: record one send per BCC recipient with `sendMethod: 'outlook_bcc'`, shared `conversationId`.
- `apps/organising-db/src/app/api/campaigns/[id]/push-list/route.ts` — record one send per worker on success, `sendMethod: 'action_network'`.
- `apps/organising-db/src/components/email/composer/SendActions.tsx` — fire-and-forget POST to the new local-send-record endpoint when mailto/eml dispatched.

**New**:
- `apps/organising-db/src/app/api/campaigns/[id]/emails/[draftId]/record-local-send/route.ts` — POST `{ worker_ids: number[], method: 'mailto'|'eml' }` → calls `recordEmailSend` per worker.
- `apps/organising-db/src/components/workers/profile/EmailHistorySection.tsx` — table of past sends per worker, joined to draft subjects + campaign name, with status badges (replied / bounced / clicked) and "View thread" link.
- Mount in `apps/organising-db/src/app/(dashboard)/workers/[id]/page.tsx`.

Effort: 2 days.

## Phase 2 — Reply tracking

**New**:
- `apps/organising-db/src/app/api/cron/poll-mailbox-events/route.ts`
  - Guarded by `Authorization: Bearer ${CRON_SECRET}` (Vercel sets this for scheduled runs).
  - For each active `user_oauth_connections` row:
    - Compute window: `last_polled_at - 1 minute` (skew safety) to now. First poll = last 24h.
    - `getMicrosoftAccessToken(userId)` → refresh-aware.
    - `GET /me/messages?$filter=receivedDateTime ge {window} and isDraft eq false&$select=id,conversationId,from,toRecipients,receivedDateTime,bodyPreview,subject&$top=100&$orderby=receivedDateTime asc` (paginate with `@odata.nextLink` until exhausted or 500 messages).
    - For each message:
      - Look up `email_send_log` by `conversation_id`. Skip if no match.
      - If sender is the organiser themselves → skip (own outgoing message in same thread).
      - If `replied_at IS NULL` on the matched row: set `replied_at = receivedDateTime, reply_snippet = bodyPreview[:280], first_reply_message_id = id, latest_reply_message_id = id, reply_count = 1`. Insert `email_engagement_events('replied')`. Call `tagWorkerReplied(workerId)`. Write a `worker_notes` row with snippet + Outlook deep-link.
      - Else (already replied to once): increment `reply_count`, update `latest_reply_message_id = id`. Insert `email_engagement_events('replied')`. **Do NOT** add another worker note.
    - Update `user_oauth_connections.last_polled_at = now()`.
- `apps/organising-db/vercel.json` — add cron entry:
  ```json
  { "path": "/api/cron/poll-mailbox-events", "schedule": "*/10 * * * *" }
  ```

Effort: 3 days.

## Phase 3 — Conversation thread surface

**New**:
- `apps/organising-db/src/app/api/conversations/[conversationId]/route.ts` — GET
  - Verify the current user owns the connection associated with this `conversation_id` (join via `email_send_log.user_id`).
  - Call `GET /me/messages?$filter=conversationId eq '{id}'&$select=id,from,toRecipients,receivedDateTime,subject,body&$orderby=receivedDateTime asc`.
  - Return JSON. Do not persist message bodies.
- `apps/organising-db/src/components/workers/profile/ConversationThreadDialog.tsx` — opened from "View thread" link in `EmailHistorySection`. Renders messages chronologically; body in sandboxed iframe (same pattern as `EmailPreviewPane`). Footer link "Reply in Outlook" → `https://outlook.office.com/mail/deeplink/compose?inReplyTo={lastMessageId}`.
- For workers with `reply_count > 1`, the email history row shows "X replies" with a direct "Open latest in Outlook →" link to `https://outlook.office.com/mail/inbox/id/{encodeURIComponent(latest_reply_message_id)}` so the organiser jumps to the most recent reply with the full threaded view.

Effort: 1 day.

## Phase 4 — Bounce scanning

Piggy-backs on the Phase 2 poll. In the same message loop:

- DSN detection: `from.emailAddress.address` matches `/^(postmaster|mailer-daemon|noreply.*microsoft)@/i` OR `subject` matches `/(undelivered|delivery (status|failure)|returned mail|bounce)/i`.
- Parse the body for the failed recipient — Microsoft DSN format includes `Original-Recipient: rfc822; addr@host` or `Final-Recipient:`. Fallback: regex any email address in the body and match against recent `email_send_log.recipient_email`.
- For each parsed failed address:
  - Find `email_send_log` row where `recipient_email = parsed_addr AND bounced_at IS NULL AND replied_at IS NULL AND created_at > now() - interval '14 days'`. (Most recent send wins.)
  - Update: `bounced_at = receivedDateTime, bounce_reason = parsed_diagnostic_or_subject[:280]`.
  - Insert `email_engagement_events('bounced')`.
  - Call `markEmailBounced(workerId, reason)` which:
    - Sets `workers.email_status = 'invalid'` + `email_status_updated_at = now()`.
    - Attaches the "Email bounced" tag.

**Composer recipient filtering**:
- `apps/organising-db/src/components/email/composer/RecipientPanel.tsx` — the recipient query joins on `workers.email_status`. By default, workers with `email_status = 'invalid'` are **excluded** from the recipient table.
- An "Include workers with bounced emails" toggle (off by default) re-includes them for cases where the organiser wants to manually correct the address. When a worker is in this state, the row shows the email in red with an inline edit affordance: clicking the email value opens an inline editor that updates `workers.email`. The trigger automatically resets `email_status` to NULL → worker becomes eligible again.

**Worker profile**:
- `EmailHistorySection` shows a red "bounced — Reason: …" badge on bounced sends.
- A persistent banner on the worker profile when `email_status = 'invalid'`: "This worker's email address bounced on {date}. Edit the email field to retry."

Effort: 1.5 days.

## Phase 5 — Click tracking redirector

**New**:
- `apps/organising-db/src/lib/comms/click-tracker.ts`
  - `rewriteLinks(html: string, sendId: number): Promise<{ html: string, tokens: Array<{token, targetUrl}> }>` — parses HTML, rewrites `<a href>` attributes through `https://oa.uconstruct.app/r/{token}`, returns the modified HTML + tokens for batch insert into `email_click_tokens`. Skip rewriting for `mailto:`, `tel:`, `#anchor`, and unsubscribe links.
- `apps/organising-db/src/app/r/[token]/route.ts` — GET
  - Service-role lookup of `email_click_tokens` by token.
  - Increment `hits`. If `email_send_log.first_click_at IS NULL`, set it. Increment `click_count`.
  - Insert `email_engagement_events('clicked')`. Call `tagWorkerClicked(workerId)`.
  - 302 to `target_url`. Token not found → 302 to `/` or a generic 404 page. Latency target <100 ms.

**Modified**:
- `apps/organising-db/src/app/api/campaigns/[id]/emails/[draftId]/save-to-outlook/route.ts` — after building each recipient's resolved HTML (personalised) or the shared HTML (BCC), pass through `rewriteLinks(html, sendId)`, batch-insert tokens, then send the rewritten HTML to Graph. Skip if no links present.

**Not modified**: Action Network push path. AN provides its own click tracking in its dashboard.

Effort: 2.5 days.

## Critical files

**New**:
- `supabase/migrations/20260625130000_email_engagement_tracking.sql`
- `apps/organising-db/src/lib/comms/send-log.ts`
- `apps/organising-db/src/lib/comms/click-tracker.ts`
- `apps/organising-db/src/app/api/cron/poll-mailbox-events/route.ts`
- `apps/organising-db/src/app/api/campaigns/[id]/emails/[draftId]/record-local-send/route.ts`
- `apps/organising-db/src/app/api/conversations/[conversationId]/route.ts`
- `apps/organising-db/src/app/r/[token]/route.ts`
- `apps/organising-db/src/components/workers/profile/EmailHistorySection.tsx`
- `apps/organising-db/src/components/workers/profile/ConversationThreadDialog.tsx`

**Modified**:
- `apps/organising-db/src/app/api/campaigns/[id]/emails/[draftId]/save-to-outlook/route.ts`
- `apps/organising-db/src/app/api/campaigns/[id]/push-list/route.ts`
- `apps/organising-db/src/components/email/composer/SendActions.tsx`
- `apps/organising-db/src/components/email/composer/RecipientPanel.tsx`
- `apps/organising-db/src/app/(dashboard)/workers/[id]/page.tsx`
- `apps/organising-db/vercel.json`
- `apps/organising-db/.env.example` — document `CRON_SECRET`

## Verification

1. **Phase 0 + 1** — Save a draft to Outlook from the composer. Confirm `email_send_log` rows exist per recipient with `conversation_id` populated; workers receive the "Emailed" tag; worker profile shows the email in history. Repeat for the AN push, mailto, and .eml paths — confirm log rows recorded for each method.
2. **Phase 2** — Send a real email via Outlook to a test worker; reply from the test inbox. Wait up to 10 min for cron. Confirm: `replied_at`, `reply_snippet`, `first_reply_message_id` populated. Worker tagged "Replied". `worker_notes` row created with snippet + Outlook deep-link. Reply again — confirm `reply_count` increments, `latest_reply_message_id` updates, but no new worker note.
3. **Phase 3** — Click "View thread" on the replied row in worker profile. Dialog shows the full exchange. "Open latest in Outlook" link opens the message in Outlook web with conversation view.
4. **Phase 4** — Send a draft to an intentionally invalid address (e.g. `fake@nonexistent.invalid`). Wait for DSN (usually <2 min from Microsoft). After cron picks it up: worker tagged "Email bounced", `workers.email_status='invalid'`, recipient panel auto-excludes them on next compose, worker profile shows banner. Edit the worker's email in the worker profile → confirm `email_status` resets to NULL via trigger, banner disappears, worker re-eligible.
5. **Phase 5** — Write a draft with a link, save personalised drafts to Outlook, send, click the link in the received email. Confirm redirector lands at original URL. `email_send_log.first_click_at` + `click_count` updated. Worker tagged "Clicked link". Engagement event recorded.

## Effort summary

| Phase | What | Estimate |
|---|---|---|
| 0 | Schema + helper module | 1 day |
| 1 | Send log + Emailed tag + worker history UI | 2 days |
| 2 | Reply tracking via Graph poll | 3 days |
| 3 | Conversation thread surface | 1 day |
| 4 | Bounce scanning + recipient skip + edit-to-clear | 1.5 days |
| 5 | Click tracking redirector | 2.5 days |
| | **Total** | **~11 days** |

## Deferred for future iterations

- **Webhooks** — Graph change-notification subscriptions for sub-second latency. Requires public webhook endpoint + subscription renewal cron every 2–3 days + validation handshake on creation. Cost vs benefit not worth it until polling latency becomes a user complaint.
- **Open tracking** — pixel-based open detection is largely broken in 2026 due to Apple Mail Privacy Protection and Gmail image proxying. Skipped intentionally.
- **Forward detection** — Graph doesn't reliably expose forwards; skipped.
- **AN-side click tracking integration** — pulling AN's tracking data into `email_engagement_events` for unified reporting. Out of scope for v1.
