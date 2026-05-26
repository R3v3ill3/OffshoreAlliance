# Mobile Dialer — Design system & telephony provider interface

> Generated: May 2026.
> Companion to [`PHONE_CALL_AUDIT.md`](PHONE_CALL_AUDIT.md) and
> [`PHONE_CALL_OUTCOME_SPLIT_BRAIN_DEEPDIVE.md`](PHONE_CALL_OUTCOME_SPLIT_BRAIN_DEEPDIVE.md).

This document describes the mobile-first, shareable-link dialer at
`/call/[token]` and the shared dialer core it sits on top of. Read it
alongside the audit if you're changing dialer behaviour on either the
mobile or desktop surface — they consume the same hooks, taxonomy, and
APIs by design.

---

## 1. Goals

1. A volunteer with a phone, a link, and a password can dial through a
   campaign list with no training — and every CTA rating, objection,
   issue, callback, and outcome they capture flows into the same
   reporting pipeline the staff dialer uses.
2. A coordinator can fan a single call action across up to 20
   volunteers and 200 contacts without double-dialling, with live
   visibility per caller and per share token, and with mid-action
   redistribution.
3. The mobile surface feels purpose-built for one-handed use, but
   looks and feels like the same product as the desktop tracker.

Telephony stays on `tel:` deep links today. The architecture leaves
room for a Twilio Voice / WebRTC provider to drop in later.

---

## 2. High-level architecture

```mermaid
flowchart LR
  subgraph clients [Clients]
    Mobile[/call/token<br/>Mobile dialer]
    Staff[CallSessionPage<br/>Desktop tracker]
    Coord[/campaigns/id/phone/live<br/>Coordinator dashboard]
  end
  subgraph shared [Shared dialer core]
    Hooks[lib/phone/session/*<br/>useShareBootstrap, useClaimAutoRenew,<br/>useScriptVariables, ...]
    Telephony[lib/phone/telephony/*<br/>TelephonyProvider]
    Outcome[lib/phone/outcome-model.ts<br/>OUTCOME_META + derive...]
    Tokens[lib/ui/dialer-tokens.ts<br/>tokens.{layout,type,buttons,...}]
  end
  subgraph api [API canonical]
    Share[/api/call-share/token/*]
    Calls[/api/calls/*]
    Report[/api/campaigns/id/phone/live<br/>/phone/attempts<br/>/phone/attempts/export]
  end
  subgraph db [Postgres]
    Items[call_list_items + claims]
    Attempts[call_attempts + outcome_classification]
    Events[call_share_form_events]
    RPC[claim_next_call_list_item*<br/>record_call_attempt<br/>force_release_claims_for_token<br/>renew_call_list_item_claim]
  end
  Mobile --> Hooks
  Staff --> Hooks
  Mobile --> Telephony
  Staff --> Telephony
  Mobile --> Tokens
  Staff --> Tokens
  Hooks --> Share
  Hooks --> Calls
  Coord --> Report
  Share --> RPC
  Calls --> RPC
  Report --> Items
  Report --> Attempts
  Report --> Events
```

Everything below `shared/` is consumed by **both** the mobile and the
desktop surface — that is the whole point of the rebuild. New
dialer features should live there.

---

## 3. Mobile component tree

`apps/organising-db/src/components/phone/mobile/` replaces the old
`CallSessionView`. The top-level `MobileDialer` is mounted by
`app/call/[token]/page.tsx`; everything below it is a screen, a
primitive, or an in-call panel.

```
mobile/
├── MobileDialer.tsx               Orchestrator + screen state machine
├── MobileInstallPrompt.tsx        beforeinstallprompt UI
├── MobileOfflineBanner.tsx        navigator.onLine + SW message bus
├── MobileServiceWorkerBootstrap.tsx
├── primitives/
│   ├── MobileBottomSheet.tsx      Pull-up sheet w/ focus trap + Esc
│   ├── MobileCallButton.tsx       Oversized green call CTA
│   ├── MobileHeader.tsx           Sticky top bar w/ claim countdown
│   ├── MobileNotesField.tsx       Auto-growing textarea + voice
│   └── MobileProgressBar.tsx      List + caller progress
├── screens/
│   ├── MobileWelcome.tsx
│   ├── MobilePasswordGate.tsx
│   ├── MobileQueue.tsx
│   ├── MobileContact.tsx
│   ├── MobileCallSession.tsx      In-call orchestrator
│   ├── MobileWrapUp.tsx
│   ├── MobileLostClaim.tsx
│   └── MobileError.tsx
└── in-call/
    ├── MobileDialOutcomeBar.tsx
    ├── MobileConversationStepper.tsx
    ├── MobileCtaPanel.tsx
    ├── MobileAssessmentPanel.tsx
    ├── MobileObjectionsSheet.tsx
    ├── MobileIssuesSheet.tsx
    ├── MobileOutcomeWheel.tsx
    └── MobileCallbackPicker.tsx
```

Screen-flow state machine (inside `MobileDialer`):

```
bootstrap → loading | password_required | locked | error | ready
ready     → queue → contact → in_call → wrap_up
any       → lost_claim
```

The in-call screen has its own reducer (`callFlowReducer`) for
dial / connected / not-reached / in-script phases. See
`lib/phone/call-flow-state.ts` and the vitest coverage in
`src/lib/phone/__tests__/call-flow-state.test.ts`.

---

## 4. Design tokens

All visual decisions live in `apps/organising-db/src/lib/ui/dialer-tokens.ts`:

- `tokens.layout.*` — full-viewport mobile shell with safe-area
  insets, sticky thumb-zone action bar, card surface.
- `tokens.type.*` — type ramp; minimum 14 px body, generous
  line-heights for outdoor/dim use.
- `tokens.buttons.*` — `callPrimary` (64 px tall green pill),
  `actionPrimary` (56 px), `actionSecondary` (48 px), `chip`. Every
  primary action exceeds the WCAG 2.5.5 44 px tap target.
- `tokens.sentiment.*` — colour pairs for the four outcome
  sentiments (positive, neutral, negative, operational). Used by
  both the mobile outcome wheel and the coordinator rollup card so a
  red outcome reads as red everywhere.
- `tokens.status.*` — lifecycle pills (idle, ringing, connected,
  completing).
- `outcomeSentimentClass(classification)` — convenience helper for
  badge / chip background and text colours.

When desktop and mobile diverge, prefer adding a new token over
forking a className string. The two surfaces should look like the
same product.

---

## 5. Telephony provider interface

`apps/organising-db/src/lib/phone/telephony/` defines the contract:

```ts
export interface TelephonyProvider {
  placeCall(opts: PlaceCallOptions): Promise<PlaceCallResult>;
  endCall?(): Promise<void>;
  onCallEvent?(handler: (event: CallEvent) => void): () => void;
}

export interface PlaceCallOptions {
  phoneNumber: string;
  contactLabel?: string;
  /** `share_link` from the mobile dialer, `staff` from CallSessionPage. */
  surface: "share_link" | "staff";
}
```

Today the only implementation is `TelLinkProvider`, which builds a
`tel:` URL and navigates to it (the OS dialer takes over). The hook
`useTelephony()` returns a provider instance.

To swap in WebRTC / Twilio Voice later:

1. Add a new file under `lib/phone/telephony/`, e.g. `twilio-voice-provider.ts`.
2. Implement the interface — `placeCall` becomes an actual call
   start, `endCall` / `onCallEvent` light up.
3. Wire selection in `lib/phone/telephony/use-telephony.ts`. A
   feature flag (PostHog) is the cleanest way to roll it out.
4. No component imports `tel:` directly, so no further UI changes
   are required.

---

## 6. Outcome model (single source of truth)

`apps/organising-db/src/lib/phone/outcome-model.ts` exports:

- `OUTCOME_CLASSIFICATIONS` — the 14-value tuple persisted on
  `call_attempts.outcome_classification`.
- `OUTCOME_META` — display label, sentiment, terminal flag, and
  callback flag for each value.
- `deriveOutcomeClassification(input)` — derives one classification
  from dial disposition + call disposition + support level + CTA
  signal + membership. Both surfaces and the share API call this so
  the persisted value matches what reports surface.

Adding a new outcome:

1. Append the value to `OUTCOME_CLASSIFICATIONS`.
2. Add the metadata to `OUTCOME_META`.
3. Extend `deriveOutcomeClassification` so the new value is reachable
   from at least one input combination.
4. If the column constraint on the DB enumerates values, ship a
   migration to add it.
5. The vitest suite in
   `src/lib/phone/__tests__/outcome-model.test.ts` covers the
   taxonomy invariants — any new value gets caught by
   `OUTCOME_OPTIONS.map((o) => o.value).toEqual(...)`.

---

## 7. Multi-caller coordination

| Concern | Solution |
| --- | --- |
| Staff-vs-staff race | `/api/calls/lists/[listId]/next` claims via `claim_next_call_list_item` with `staff:{user.id}` as the session label. |
| Share-vs-share race | `claim_next_call_list_item_for_share` enforces `FOR UPDATE SKIP LOCKED` plus the `excluded_from_share` filter. |
| Claim expiry mid-call | `useClaimAutoRenew` (in `lib/phone/session/`) renews via `/api/call-share/[token]/renew` on user interaction and on a polling cadence. |
| Coordinator revoke | `force_release_claims_for_token(token_id)` releases all in-flight claims for a token. Wired into share-token revoke and the live action dashboard. |
| Cross-list dedup | `vw_campaign_worker_call_status` and `get_campaign_worker_call_status` provide the "called recently on List B by Alice" hint. Surfaced on the mobile contact card and the staff contact card. |
| Coordinator hand-off | `/api/campaigns/[id]/call-lists/[listId]/items/[itemId]/realloc` supports `requeue`, `exclude_from_share`, and `include_in_share`. |

---

## 8. PWA + offline resilience

Three small pieces, all scoped tightly to `/call/`:

- [`public/call-manifest.webmanifest`](../apps/organising-db/public/call-manifest.webmanifest) —
  web app manifest; `start_url`/`scope` are pinned to `/call/`.
- [`public/call-dialer-sw.js`](../apps/organising-db/public/call-dialer-sw.js) —
  service worker registered by
  `MobileServiceWorkerBootstrap`. Caches the dialer shell, caches
  the most recent share bootstrap + contact + script payload, and
  queues a single attempt locally if the network drops mid-submit
  (replayed via Background Sync or `replay-now` postMessage).
- `MobileInstallPrompt` listens for `beforeinstallprompt` and renders
  a low-key install affordance. iOS Safari users can still install
  via the share-sheet "Add to Home Screen" action.

`MobileOfflineBanner` listens to `online` / `offline` events plus
service-worker postMessages so callers see a sync banner instead of a
silent black hole when offline submissions queue.

---

## 9. Accessibility

- Tap targets: every interactive control exceeds 44 px (WCAG 2.5.5).
  Enforced by `tokens.buttons.*` and the chip sizes.
- Focus traps: `MobileBottomSheet` traps Tab and Shift+Tab inside
  the sheet while open and restores focus on close.
- Motion: every animation uses `motion-reduce:animate-none` /
  `motion-reduce:transition-none`. Haptics also respect
  `prefers-reduced-motion`.
- Screen reader labels: every icon button has either `aria-label`
  or an accessible name; decorative icons are marked `aria-hidden`.
  `Loader2` spinners live inside `aria-live="polite"` regions.
- Radio groupings: dial outcome bar and outcome wheel use
  `role="radiogroup"` with `aria-checked` for chip selection.

---

## 10. Telemetry

`apps/organising-db/src/lib/phone/telemetry.ts` exposes
`dialerTelemetry`, a typed wrapper around `posthog.capture` that:

- never throws (telemetry must never break the dialer);
- is safe to call before PostHog has booted;
- is safe to call when PostHog is disabled;
- namespaces every event with `mobile_dialer_`.

The current funnel events:

```
mobile_dialer_opened
  → mobile_dialer_password_attempted
  → mobile_dialer_password_success / mobile_dialer_authenticated
  → mobile_dialer_queue_viewed
  → mobile_dialer_claim_acquired
  → mobile_dialer_call_placed
  → mobile_dialer_dial_outcome_selected
  → mobile_dialer_objection_logged / mobile_dialer_issue_logged /
    mobile_dialer_cta_rated / mobile_dialer_assessment_rated /
    mobile_dialer_outcome_selected
  → mobile_dialer_attempt_recorded
mobile_dialer_skip_used / mobile_dialer_hand_back / mobile_dialer_claim_lost
mobile_dialer_attempt_queued_offline (offline path)
mobile_dialer_install_prompt_shown / install_accepted / install_dismissed
mobile_dialer_wrap_up_shown
```

A PostHog funnel insight stitched from these events surfaces drop-off
between bootstrap and first attempt — the most common operational
question for coordinators.

---

## 11. Testing

Three layers:

| Layer | Tool | Location |
| --- | --- | --- |
| Unit | vitest | `apps/organising-db/src/lib/phone/__tests__/` |
| Integration / e2e | Playwright (scaffold) | `apps/organising-db/tests/e2e/mobile-dialer.spec.ts` |
| Load / concurrency | tsx script | `apps/organising-db/tests/load/claim-concurrency.ts` |

Run the unit suite with `pnpm --filter organising-db test`. The
Playwright spec and load script document the next iterations — they
are checked in as starting points and pull config from env vars to
avoid leaking secrets into the repo.

---

## 12. Adding a new feature

Rough checklist when adding a dialer feature:

1. Does the feature live in the shared dialer core (a hook, the
   telephony provider, the outcome taxonomy, a token)? If so add it
   there first.
2. Surface it in both `CallSessionPage` (desktop) and the mobile
   screen tree, using existing tokens / primitives.
3. If the data write changes, update the relevant API route, the
   Zod schema in `lib/validation/call-share.ts`, and the RPC.
4. Regenerate or hand-update `packages/db-types/generated.ts` if
   you touched the RPC signature or a table.
5. Wire telemetry: add an event constant to `dialerTelemetry` and
   call it from the new control or screen.
6. Add unit coverage. If it's UI behaviour worth Playwright,
   extend the e2e spec.
7. Run `pnpm --filter organising-db test` and `pnpm --filter
   organising-db lint`.
