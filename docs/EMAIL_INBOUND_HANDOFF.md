# Handoff: Platform email — inbound reply forwarding not working

Date: 21 August 2026
Status: unresolved. This document records what was built, what has been
verified working, and the precise problem encountered. It deliberately
contains no diagnosis or proposed solutions.

---

## 1. Background

The app (production: `oa.uconstruct.app`, Vercel project `offshore-alliance`)
was extended with an on-platform email capability using SendGrid, replacing
Action Network sends over time. Domain: `offshore-alliance.au` (registered
at GoDaddy ~18–20 Aug 2026). Mailbox: `organise@offshore-alliance.au` on
Microsoft 365 via GoDaddy's "Email Essentials" package.

The reply design is a hybrid inbox: replies go to the real mailbox
(`organise@`), and a forwarding rule sends a copy to
`inbox@parse.offshore-alliance.au`, whose MX points at SendGrid Inbound
Parse, which POSTs the parsed message to the app, which stores it and shows
it in an in-app inbox at `/email/inbox`.

## 2. What was built (all deployed to production, branch `main`)

- **DB migration** `supabase/migrations/20260820100000_sendgrid_email_platform.sql`
  (applied to the production Supabase project `gteygwfgjvczanmrwgbr`):
  worker email consent fields, email list queue fields,
  `email_delivery_events`, `email_wrappers`, `email_unsubscribe_tokens`,
  `email_conversations`, `email_messages`, plus `app_settings` seeds
  including `email_webhook_token` and `email_inbound_token`.
- **Provider layer** `apps/organising-db/src/lib/email/provider/`
  (SendGrid + mock, credentials from `app_settings` with env fallbacks).
- **Send pipeline**: queue action, cron `/api/cron/dispatch-email-queue`
  (every 5 min), test-send route, per-draft stats route, composer UI
  (`PlatformSendControls` in the email composer).
- **Wrappers**: CRUD UI at `/email/wrappers`, default "OA Standard" wrapper
  seeded in production, images at `/email-assets/oa-banner.png`,
  `oa-fight.png`, `oa-qr.png`.
- **Compliance**: public unsubscribe route `/u/[token]`, `List-Unsubscribe`
  headers, opt-out fields on workers.
- **Event webhook** `/api/email/webhook?token=<email_webhook_token>` —
  for SendGrid Event Webhook (delivered/bounce/open/click/spam/unsub);
  verifies the signed-webhook ECDSA signature.
- **Inbound parse webhook** `/api/email/inbound?token=<email_inbound_token>` —
  for SendGrid Inbound Parse (multipart form posts); creates/updates
  `email_conversations` / `email_messages`.
- **In-app inbox** at `/email/inbox` (also linked in the sidebar).
- Both webhook URLs (with tokens) are displayed read-only in
  Administration → Settings → "Platform email (SendGrid)".

## 3. Configuration state (as verified today)

DNS (checked via `dig` 21 Aug):

- `offshore-alliance.au` MX → `offshorealliance-au02b.mail.protection.outlook.com` (Microsoft 365).
- `parse.offshore-alliance.au` MX 10 → `mx.sendgrid.net`.
- SendGrid domain authentication and link branding on
  `offshore-alliance.au` are verified (DKIM `s1`/`s2`, subdomain `em823`).

SendGrid:

- Inbound Parse host `parse.offshore-alliance.au` → app inbound URL:
  confirmed working today (see §4).
- Event Webhook: observed POSTing JSON event batches to the **inbound**
  URL (`/api/email/inbound`) rather than `/api/email/webhook`. The user
  was asked to re-point it; as of ~11:31 AEST JSON events were still
  arriving at the inbound URL. Current state unconfirmed.
  `/api/email/webhook` had received zero requests in the prior 24h.

Microsoft 365 mailbox (`organise@`):

- Receives mail normally (test messages arrive in the Outlook inbox).
- Outlook web → Settings → Mail → Forwarding shows: forwarding enabled,
  destination `inbox@parse.offshore-alliance.au`, "keep a copy" ticked.
- The user reports the anti-spam outbound policy setting "Automatic
  forwarding rules" shows "On — Forwarding is enabled".
- The user has **no admin access** to the tenant: admin.microsoft.com /
  Exchange admin center return "You don't have access to this app. Only
  admins can manage Teams and Microsoft 365." (GoDaddy holds tenant
  admin under the Email Essentials package.) Therefore no message trace
  has been run.
- Earlier in setup, the Outlook web "Rules" settings page was reported
  as not available on this mailbox.

## 4. What has been verified working (with evidence)

- **Outbound sends** via the composer's test-send deliver successfully.
  Received headers (Outlook copy) show `spf=pass`
  (`smtp.mailfrom=em823.offshore-alliance.au`), `dkim=pass`
  (`d=offshore-alliance.au`), `dmarc=pass`, `compauth=pass`.
  Gmail delivery observed (one address inboxed after delay, one landed
  in junk — consistent with a new domain; not part of the open problem).
- **Inbound parse path**: an email sent directly to
  `inbox@parse.offshore-alliance.au` at 11:33 AEST was POSTed by SendGrid
  as multipart, returned HTTP 200, and appears as conversation #1 /
  message #1 (`from_email=troy@reveille.net.au`, subject "Test parse",
  state `needs_response`) in `email_conversations` / `email_messages`
  and in the `/email/inbox` UI.
- A parsing bug in `/api/email/inbound` (strict `formData()` rejecting
  payload Content-Types) was fixed and deployed today (commit `902c51b`);
  the route now recovers the multipart boundary itself and logs the
  Content-Type and body prefix on failure.

## 5. The problem (unresolved)

An email sent to `organise@offshore-alliance.au` arrives in the Outlook
mailbox but **its forwarded copy never reaches SendGrid**:

- Vercel production logs show **no multipart POST** to
  `/api/email/inbound` corresponding to any forwarded message (the only
  multipart POST ever received is the direct-to-parse test in §4; all
  other traffic to that route is Event Webhook JSON).
- Consequently no conversation/message is created and nothing appears
  in the app inbox for mail addressed to `organise@`.

Facts around it:

- The forwarding hop is Outlook/Exchange mailbox forwarding
  (`organise@` → `inbox@parse.offshore-alliance.au`), configured as
  described in §3, destination address confirmed correct.
- The destination address itself is proven reachable and functional
  when emailed directly (§4).
- Whether the original sender received a bounce/NDR for the forwarded
  copy has not been established.
- No Exchange message trace has been possible (no tenant admin access).

## 6. Secondary open items

1. **Event Webhook URL**: confirm it is re-pointed in SendGrid to
   `/api/email/webhook?token=<email_webhook_token>` (value shown in
   Administration → Settings), and that Signed Event Webhook is enabled
   with the verification key matching the "Event webhook verification
   key" field in admin settings. Until then, delivery/open/click stats
   do not populate (`email_delivery_events` is empty).
2. Today's 200-recipient campaign email was decided to be sent via the
   existing Action Network path (augmented by SMS), not the platform.
3. The production database password used during setup on 20 Aug should
   be rotated.

## 7. Key artefacts

- Runbook: `docs/EMAIL_SENDGRID_SETUP.md`
- Inbound route: `apps/organising-db/src/app/api/email/inbound/route.ts`
- Event webhook route: `apps/organising-db/src/app/api/email/webhook/route.ts`
- Vercel project: `offshore-alliance` (team ReveilleStrategy) — runtime
  logs for `/api/email/inbound` show the request history described above.
- Production Supabase project: `gteygwfgjvczanmrwgbr`.
