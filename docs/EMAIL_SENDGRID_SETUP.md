# On-platform email sending via SendGrid (offshore-alliance.au)

Ops runbook + architecture reference for the platform email module. This is the
email counterpart of the SMS module (see `docs/SMS_MODULE_BRIEF.md`) — same
provider-abstraction / queued-list / dispatch-cron / signed-webhook shape,
sending through SendGrid from the **offshore-alliance.au** domain instead of
round-tripping through Action Network.

The Action Network push path is untouched and remains available; platform
sending runs alongside it until proven, after which AN deprecation is a
separate decision.

> **Domain spelling check:** the registered domain is assumed to be
> `offshore-alliance.au`. Verify the exact spelling in your GoDaddy account
> before creating DNS records — if it differs, use the registered spelling
> everywhere this document says `offshore-alliance.au`.

---

## 0. SendGrid account & plan

- **Account:** sign up / log in with `troy@reveille.net.au`. That is fine —
  the SendGrid **account login identity is independent of the sending
  domain**. One account can authenticate any number of domains; we will
  authenticate `offshore-alliance.au` in it.
- **Plan:** **Email API — Essentials, US$19.95/month for 50,000 emails/month**
  is the right tier for the pilot and current volumes (a 200-email pilot plus
  regular blasts sit comfortably inside 50k). Two Essentials caveats to know:
  - Essentials uses **shared IPs** — fine at this volume; no IP warm-up
    needed. A dedicated IP requires the Pro tier and is not needed now.
  - Everything this module uses — Mail Send API, domain authentication, link
    branding, **Event Webhook** and **Inbound Parse** — is included on
    Essentials.
- **Important — do NOT reuse the reveille.net.au domain authentication.** The
  `reveille.net.au` DKIM/`_domainkey` CNAMEs already in that DNS zone belong
  to a different email setup. Leave them untouched. We authenticate the new
  `offshore-alliance.au` domain instead; the two coexist without conflict
  (they live in different DNS zones entirely).

## 1. One-time SendGrid setup (ops checklist, no code)

Work through these in order in the SendGrid account. All DNS records below
are created at **GoDaddy** (the registrar and DNS host for
`offshore-alliance.au`).

### 1.1 Domain authentication (required before any live send)

SendGrid → Settings → Sender Authentication → **Authenticate Your Domain**:

- Domain: `offshore-alliance.au`
- Use automated security (rotating DKIM) — yes.
- SendGrid issues **3 CNAME records** (2 × DKIM `s1._domainkey` /
  `s2._domainkey` + 1 return-path — SendGrid auto-assigned ours as
  `em823.offshore-alliance.au`; the `em###` prefix is random per account and
  not choosable). Add them in GoDaddy → DNS for `offshore-alliance.au`, then
  click Verify. (GoDaddy tip: enter only the host part, e.g. `s1._domainkey`
  or `em823`, not the full name — GoDaddy appends the domain automatically.)
- **Single Sender Verification is NOT needed.** Domain authentication covers
  every address at the domain (including `organise@`); ignore any SendGrid
  prompt to "verify a single sender".

Without this, mail goes out `via sendgrid.net` and fails DMARC alignment.

**DMARC record (`_dmarc` TXT):** GoDaddy pre-creates one on new domains
(`v=DMARC1; p=quarantine; adkim=r; aspf=r; rua=mailto:dmarc_rua@onsecureserver.net;`)
and SendGrid's wizard asks for the same record under its fully-qualified
name `_dmarc.offshore-alliance.au` — they are the SAME record, not a
conflict (GoDaddy appends the domain to the `_dmarc` host). **Keep exactly
one** `_dmarc` TXT record; publishing two is invalid and breaks DMARC at
receivers. Edit the existing record in place:

- `p=quarantine` → `p=none` for the pilot period (a brand-new domain with
  `quarantine` sends any alignment hiccup to spam while the setup is still
  being proven). Tighten back to `p=quarantine` once the pilot shows clean
  `d=offshore-alliance.au` DKIM alignment.
- `rua=mailto:dmarc_rua@onsecureserver.net` → a mailbox we actually read,
  e.g. `rua=mailto:organise@offshore-alliance.au`, so the aggregate
  reports come to us rather than GoDaddy.

Pilot-period record:
`v=DMARC1; p=none; adkim=r; aspf=r; rua=mailto:organise@offshore-alliance.au;`

### 1.2 Link branding (recommended)

SendGrid → Settings → Sender Authentication → **Brand Your Links**:

- Subdomain suggestion: `link.offshore-alliance.au` (2 more CNAMEs).
- This makes SendGrid's click/open tracking URLs resolve on our domain rather
  than `sendgrid.net` — better deliverability and less alarming to recipients.

### 1.3 Purpose-built mailbox (the From / Reply-To identity)

Create a **real mailbox** on the new domain, e.g.
`organise@offshore-alliance.au`. This is:

- the From address on every platform send, and
- the Reply-To address — replies land in the real mailbox (authoritative copy).

**GoDaddy Microsoft 365 Email Essentials is sufficient** (and is what we
use; the provisioned account is `organise@offshore-alliance.au`). The
mailbox only receives replies and sends occasional 1:1 mail — SendGrid does
all bulk sending — so the cheapest real-mailbox tier (10 GB Exchange Online,
webmail) covers it. Access the mailbox at outlook.office.com (or GoDaddy's
email sign-in) with the account password from the GoDaddy Email & Office
dashboard — webmail is sufficient; the §1.4 forwarding rule is created in
Outlook on the web (Settings → Mail → Rules). Desktop Outlook is optional.
Notes:

- Adding the mailbox lets GoDaddy auto-configure the root MX + SPF
  (`include:spf.protection.outlook.com`). That coexists fine with SendGrid:
  the bounce/return-path domain is the `em…` CNAME (§1.1) and Inbound Parse
  uses only the `parse.` subdomain MX (§1.4) — root mail DNS is untouched.
- The §1.4 forwarding rule is a standard Outlook-on-the-web inbox rule
  ("forward a copy to"). BUT Microsoft 365 blocks automatic forwarding to
  external addresses by default, and `parse.offshore-alliance.au` counts as
  external (it is not an accepted domain in the tenant). If forwarded copies
  bounce with `5.7.520 … external forwarding is disabled`, enable outbound
  forwarding via the GoDaddy Email & Office dashboard / GoDaddy support
  (GoDaddy-managed tenants restrict direct Exchange admin access). This is a
  one-time settings change, not an ongoing limitation.

**Alternatives without the forwarding block** (mailbox host is swappable —
the platform only needs the from/reply-to address in Administration →
Settings; only root MX/SPF records differ per provider):

- **Google Workspace Business Starter** (~US$8.40/user/mo) — most robust:
  the Admin console routing setting ("deliver to additional recipient")
  duplicates every incoming message to the parse address with no external-
  forwarding block and no destination verification, and users can't
  accidentally turn it off.
- **Zoho Mail Lite** (~US$1/user/mo) — cheapest: forwarding allowed but Zoho
  emails a verification code to the destination. Not a dead end here: the
  code lands in the in-app inbox (`/email/inbox`, triage) via Inbound Parse
  — just make sure the §1.4 MX + webhook are live BEFORE setting up the
  forward.
- **Fastmail** (~US$5/mo) — rules-based forwarding without an M365-style
  block.

Record the final address + display name in Administration → Settings (see §3).

### 1.4 Hybrid inbox wiring (Inbound Parse)

Inbound Parse needs an MX record pointed at SendGrid, which cannot be the root
domain (the real mailbox owns the root MX). So:

1. GoDaddy DNS: add `parse.offshore-alliance.au` **MX 10 `mx.sendgrid.net`**.
   Field-by-field in GoDaddy: Type = `MX`, Name = `parse` (host part only —
   GoDaddy appends the domain), Priority = `10`, Value = `mx.sendgrid.net`,
   TTL = default. This MX only affects mail to `…@parse.offshore-alliance.au`;
   the root domain's MX (the M365 mailbox) is untouched.
2. SendGrid → Settings → **Inbound Parse** → Add Host & URL:
   - Receiving domain: `parse.offshore-alliance.au`
   - Destination URL:
     `https://oa.uconstruct.app/api/email/inbound?token=<email_inbound_token>`
     (the token is seeded into `app_settings.email_inbound_token` by the
     migration; read it via Administration → Settings or SQL).
   - Leave "POST the raw, full MIME message" **unchecked** (we consume the
     parsed multipart fields).
3. On the real mailbox (`organise@offshore-alliance.au`), add a **forwarding
   rule** that forwards a copy of every incoming message to
   `inbox@parse.offshore-alliance.au`.

Result: replies land in **both** the real mailbox and the in-app inbox
(`/email/inbox`).

### 1.5 API key

SendGrid → Settings → API Keys → Create API Key:

- Name: `oa-platform-send`
- Restricted access: **Mail Send** (full) + **Suppressions** (read). Nothing
  else.
- Paste the key into Administration → Settings → "Platform email (SendGrid)"
  (stored in `app_settings.sendgrid_api_key`; `SENDGRID_API_KEY` env var is
  the fallback).

### 1.6 Event Webhook (delivery / bounce / open / click / unsubscribe)

SendGrid → Settings → Mail Settings → **Event Webhook**:

- HTTP POST URL:
  `https://oa.uconstruct.app/api/email/webhook?token=<email_webhook_token>`
  (token seeded into `app_settings.email_webhook_token` by the migration; the
  query-param token is the fallback auth when signature verification is not
  configured).
- Events to POST: Delivered, Bounced, Dropped, Spam Reports, Unsubscribes,
  Opened, Clicked.
- **Signed Event Webhook: enable it.** Copy the verification key (a base64
  public key) into Administration → Settings → "Webhook verification key"
  (`app_settings.sendgrid_webhook_public_key`).

### 1.7 Tracking settings

SendGrid → Settings → Tracking:

- **Click Tracking: on** (uses the branded link subdomain from §1.2).
- **Open Tracking: on.**
- **Subscription Tracking: OFF.** Unsubscribe is ours: the platform injects a
  per-recipient unsubscribe link + `List-Unsubscribe` headers and consent
  lives in `workers.email_opt_out`, not SendGrid ASM groups.

---

## 2. Architecture (what the code does)

```
list building (wall chart fire / list builder / AudiencePicker / CSV import)
      → email_lists / email_list_items            (queued status machine)
composer draft + wrapper pick
      → "Queue platform send" (SendActions)       sets list status 'queued'
      → /api/cron/dispatch-email-queue (5 min)    claim → merge → wrap → send
      → SendGrid v3 Mail Send                     custom_args.send_id correlation
      → /api/email/webhook                        signed events → email_delivery_events
                                                  → email_send_log / email_list_items
                                                  → workers.email_status / email_opt_out
recipient reply → organise@offshore-alliance.au (real mailbox, authoritative)
      → forwarding rule → inbox@parse.offshore-alliance.au
      → /api/email/inbound (Inbound Parse)        → email_conversations / email_messages
      → /email/inbox                              staff reply goes back out via SendGrid
unsubscribe link → /u/[token]                     → workers.email_opt_out = true
```

Key modules:

| Piece | Path |
| --- | --- |
| Provider abstraction | `apps/organising-db/src/lib/email/provider/` (`getEmailProvider()`: `app_settings` first, env fallback, mock for dev) |
| Wrapper application + validation | `apps/organising-db/src/lib/email/wrapper.ts` |
| Dispatch cron (every 5 min) | `apps/organising-db/src/app/api/cron/dispatch-email-queue/route.ts` |
| Event webhook | `apps/organising-db/src/app/api/email/webhook/route.ts` |
| Inbound Parse webhook | `apps/organising-db/src/app/api/email/inbound/route.ts` |
| Unsubscribe page | `apps/organising-db/src/app/u/[token]/route.ts` |
| Wrapper CRUD | `/email/wrappers` UI + `/api/email/wrappers` |
| In-app inbox | `/email/inbox` UI + `/api/email/conversations` |
| Queue + test-send routes | `/api/campaigns/[id]/emails/[draftId]/{queue-platform-send,send-test-via-platform,platform-stats}` |
| Audience CSV upload | `/campaigns/[id]/email/import` UI + `/api/campaigns/[id]/email-audience/import` (consent attestation required) |
| Migration | `supabase/migrations/20260820100000_sendgrid_email_platform.sql` |

### Settings / secrets

`app_settings` keys (admin UI first, env fallback):

| Key | Env fallback | Purpose |
| --- | --- | --- |
| `email_provider` | `EMAIL_PROVIDER` | `sendgrid` \| `mock` (empty = mock) |
| `sendgrid_api_key` | `SENDGRID_API_KEY` | Mail Send key (§1.5) |
| `sendgrid_webhook_public_key` | `SENDGRID_WEBHOOK_PUBLIC_KEY` | Signed Event Webhook verification key (§1.6) |
| `email_from_address` | `EMAIL_FROM_ADDRESS` | e.g. `organise@offshore-alliance.au` |
| `email_from_name` | `EMAIL_FROM_NAME` | e.g. `Offshore Alliance` |
| `email_reply_to` | `EMAIL_REPLY_TO` | Defaults to the from address |
| `email_webhook_token` | — | Query-param fallback auth for `/api/email/webhook` (seeded random) |
| `email_inbound_token` | — | Query-param auth for `/api/email/inbound` (seeded random) |

`NEXT_PUBLIC_APP_URL` must be set (unsubscribe links are absolute URLs).

### Consent model (Spam Act 2003)

- `workers.email_opt_out` (+ `_at`, `_source ∈ unsubscribe_link | spam_report |
  staff | import`) is the consent flag. `workers.email_status = 'invalid'`
  (existing) stays a deliverability flag — the two are independent.
- Every platform send is wrapped in an `email_wrappers` row whose footer must
  contain the `{{unsubscribe_url}}` placeholder; the dispatcher **hard-fails
  (pauses the list)** if the resolved HTML has no unsubscribe link.
- `List-Unsubscribe` (mailto + https) and `List-Unsubscribe-Post` headers are
  set on every send; `/u/[token]` honours both GET (confirmation page) and
  POST (one-click).
- Opt-out is re-checked at **send time** in the dispatcher, not just at
  audience build time.

---

## 3. Go-live: the 200-email pilot

Preconditions: §1.1 (domain auth for `offshore-alliance.au`) verified, §1.5
key + §1.6 webhook configured, `email_provider` set to `sendgrid`, from
address configured, default wrapper reviewed at `/email/wrappers`.

Note on sequencing: the §1.4 forwarding rule (and the M365 external-
forwarding block) does NOT gate test sends — outbound goes app → SendGrid →
recipient and never touches the mailbox. Forwarding only feeds the in-app
inbox leg; until it works, replies sit in the real mailbox only. It is not
retroactive, so enable it before sends whose replies you want in
`/email/inbox`.

1. **Test send to self.** In the composer: "Send test…" → "via platform".
   Confirm: DKIM pass (`d=offshore-alliance.au` in headers), wrapper + footer
   rendered, unsubscribe link resolves, reply lands in the real mailbox AND
   `/email/inbox`.
2. **Internal send (~10 staff).** Build a small list, queue it, watch
   `/api/cron/dispatch-email-queue` drain it. Verify delivered events arrive
   in the stats panel, click a tracked link, unsubscribe one address and
   confirm `workers.email_opt_out` flips and the next queue screens it out.
3. **The 200 send.** Build the list internally (wall chart / list builder)
   or upload it at `/campaigns/[id]/email/import` (consent attestation
   required; matched addresses link to existing workers, new ones create
   workers with `email_consent_source = 'import'`). Queue it from the
   composer's "Platform email" menu inside the send window.
   200 fits in a single cron batch; no IP warm-up needed at this volume on
   shared IPs. Monitor: bounce rate (< 2% healthy), spam reports (0 expected),
   delivered ≥ 97%. Note the domain is **brand new** with no sending history —
   expect slightly softer inbox placement on the first sends; it improves as
   positive engagement accrues.
4. **Scale-up gate.** Only after the pilot: review bounce/spam/unsubscribe
   rates before larger lists. AN push stays available throughout.

---

## 4. Troubleshooting

- **Everything "sent" but no delivered events** → Event Webhook URL/token wrong
  (§1.6), or signature key mismatch. Check `email_delivery_events` — empty
  table means the webhook never lands.
- **401 from webhook** → signed verification failing AND token mismatch. The
  webhook accepts either a valid ECDSA signature or the `?token=` param.
- **Replies not in the in-app inbox but in the mailbox** → forwarding rule
  (§1.4.3) missing, or Inbound Parse host/URL misconfigured.
- **Sends pause with "non-compliant"** → wrapper footer lost its
  `{{unsubscribe_url}}` placeholder; fix the wrapper at `/email/wrappers`.
- **Mail lands in spam** → confirm §1.1 CNAMEs verify in GoDaddy, check the
  single `_dmarc` record matches the §1.1 pilot-period value (and that a
  duplicate wasn't created), and check link branding (§1.2). New domains
  take a few weeks to build reputation.
- **DNS records not verifying** → GoDaddy auto-appends the domain: enter host
  parts only (`s1._domainkey`, not `s1._domainkey.offshore-alliance.au`).
