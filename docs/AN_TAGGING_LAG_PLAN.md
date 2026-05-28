# Action Network Tagging Lag — Three-Phase Mitigation Plan

## Context

The campaign Push-to-Action-Network flow works correctly server-side:

- Tag is created in AN
- People are upserted into AN (Person Signup Helper)
- Tag is applied per-person (explicit `POST /tags/{id}/taggings`)
- AN's write primary acknowledges all writes (`write_confirmed_count === pushedCount`)

**But** AN's read endpoints have significant eventual-consistency lag — the tag-detail page in their UI can show "0 activists" for minutes to hours after a push, even though the tagging has actually succeeded server-side. Reproducibly observed in production: a push of 4 recipients showed the tag with 0 activists in AN's tag-detail view AND in single-tag reports, but a multi-tag filter immediately showed all 4 recipients carrying the tag. After the multi-tag filter ran, the tag-detail view caught up.

This is a documented characteristic of AN's platform, not a bug in our code. AN has at least three read paths with different lag characteristics:

- **Tag-detail page** — slowest, minutes to hours
- **Per-person taggings** (`/people/{id}/taggings`) — fast, usually up-to-date
- **Multi-tag filter / report queries** — fast, and the act of running one appears to trigger AN's tag-detail index to refresh

Current UX inappropriately panics the user: the verification check reports "0 activists" and the warning text says "the tag will populate within 1–2 minutes" which is wildly optimistic.

This plan ships three improvements to make the AN-push experience trustworthy:

| Phase | What | Effort |
|---|---|---|
| A | Warm-up call: fire `/people/{id}/taggings` for first 3 tagged workers after push | ~30 min |
| B | Updated messaging: replace optimistic "1–2 min" copy with accurate AN behaviour | ~30 min |
| C | Verify-with-AN button: in-app endpoint + UI to manually confirm tagging | ~2–3 hrs |

All three target the same root cause; A and B reduce immediate user panic. C gives the user an in-app verification path so they don't have to leave for AN's web UI.

## Phase A — AN read-index warm-up

After the tagging loop completes in `push-list/route.ts`, fire `getPersonTaggings` against the first 3 tagged people. Based on observed AN behaviour, this cross-endpoint read seems to nudge AN's tag-detail index to refresh.

### Implementation

In `apps/organising-db/src/app/api/campaigns/[id]/push-list/route.ts`, after the existing `getTaggingsDetailed` retry block (the verification section that runs after the worker loop), add:

```ts
// AN read-replica warm-up. Production observation: querying
// /people/{id}/taggings on freshly-tagged people nudges AN's
// tag-detail index to refresh — the activist count in the AN UI
// catches up faster than without this. Fire-and-forget; the push
// is already complete by the time we hit this.
const samplePeople = pushedAnIds.slice(0, 3)
try {
  await Promise.allSettled(
    samplePeople.map((id) => anClient.getPersonTaggings(id))
  )
} catch {
  // never fail the push because of warm-up
}
```

Place it AFTER the verification retry block but BEFORE the final `NextResponse.json`.

**Files**: `apps/organising-db/src/app/api/campaigns/[id]/push-list/route.ts` only.

## Phase B — Updated verification messaging

Replace optimistic "1–2 minutes" copy with accurate guidance and an explicit pointer to the multi-tag-filter workaround.

### Implementation

Two locations:

1. **Server-side** warning text in `push-list/route.ts`. Find the block that produces `verificationWarning` when `(verifiedTagCount ?? 0) < writeConfirmedCount`. Replace the current copy with:

```ts
verificationWarning =
  `Action Network confirmed all ${writeConfirmedCount} tagging writes. ` +
  `The activists may take several minutes (occasionally longer) to appear ` +
  `on AN's tag-detail page — this is normal AN read-replica behaviour, not ` +
  `a failure. Your message can target this tag immediately and will reach ` +
  `all ${writeConfirmedCount} recipients. To confirm membership now: open ` +
  `the tag in AN, then run a multi-tag filter (Activists → Filter → Tags) ` +
  `including this tag and one other — that query path is faster than the ` +
  `tag-detail page.${
    tagBrowserUrlVerified ? ` Open it directly: ${tagBrowserUrlVerified}` : ''
  }`
```

2. **Client-side** toast in `EmailComposer.tsx` `handlePushList`. The current code triggers `toast.info` when `isReadLag` is true. Keep that branch but update the body:

```ts
toast.info(
  `${writeConfirmed} taggings confirmed on AN. AN's tag-detail page may ` +
  `still show ${data.verified_tag_count ?? 0} for several minutes — this ` +
  `is normal AN behaviour. The targeting will work immediately.`,
  { duration: 8000 },
)
```

**Files**:
- `apps/organising-db/src/app/api/campaigns/[id]/push-list/route.ts` (warning string)
- `apps/organising-db/src/components/email/composer/EmailComposer.tsx` (toast text + duration)

## Phase C — Verify-with-AN button

A new lightweight endpoint + composer button that re-checks tag membership from within the app, so the user doesn't have to leave for AN's web UI.

### New endpoint

**File**: `apps/organising-db/src/app/api/campaigns/[id]/verify-an-tag/route.ts`

- `GET`, takes `tagId` (query) and `sampleAnIds` (comma-separated query, the worker AN IDs we expect to find on the tag).
- Server calls in parallel:
  - `anClient.getTaggingsDetailed(tagId)` — AN's current view of the tag's members
  - For each of the first 3 sample IDs: `anClient.getPersonTaggings(id)` — AN's view of that person's tags
- Returns:

```ts
{
  success: true,
  tag_total: number,            // verified_tag_count, AN's official count
  expected_total: number,       // sampleAnIds.length
  matched_in_tag: number,       // how many expected IDs we found on the tag
  matched_per_person: number,   // how many expected IDs have the tag from their /taggings endpoint
  consistent: boolean,          // matched_per_person === expected_total
  tag_browser_url: string | null,
}
```

If `matched_per_person > matched_in_tag`, that's smoking-gun proof AN's tag-detail view is lagging behind its person-taggings view. UI surfaces this distinction clearly.

The endpoint should reuse `ActionNetworkClient` from `apps/organising-db/src/lib/api/action-network.ts` — `getTaggingsDetailed` and `getPersonTaggings` already exist there, no client changes needed.

### UI button + state

In `apps/organising-db/src/components/email/composer/SendActions.tsx`, next to the existing "Open tag in AN" link in the prepared-tag status badge, add a "Verify with AN" button.

On click:

- POSTs / GETs the new endpoint with the current `preparedTag.tag_id` and the worker AN IDs
- Replaces the existing tag-status text with the result:
  - `consistent: true` AND `tag_total === expected_total` → green "✓ Verified: N activists on tag"
  - `consistent: true` AND `tag_total < expected_total` → blue "Tagging confirmed (N/N from person view). AN's tag list still shows {tag_total}, will catch up."
  - `matched_per_person < expected_total` → amber "Only X of N confirmed on AN — investigate worker results"
- Show a loading spinner during the fetch (typically <2s).

### preparedTag type extension

`preparedTag` in `EmailComposer.tsx` needs to include the AN IDs of pushed workers — currently it has count fields but not the per-worker IDs. Extend:

```ts
const [preparedTag, setPreparedTag] = useState<{
  tag_id: string
  tag_href: string
  tag_browser_url?: string | null
  tag_name: string
  contacts_tagged: number
  contacts_created: number
  write_confirmed_count?: number | null
  verified_tag_count?: number | null
  verification_warning?: string | null
  worker_an_ids: string[]       // ← NEW: derived from data.worker_results
} | null>(null)
```

And populate it from `data.worker_results` when setting state, filtering on `status === 'tagged' || status === 'created'` and mapping to `r.an_id`.

Plumb `preparedTag.worker_an_ids` down to `SendActions` so the Verify button has the IDs to send to the endpoint.

### Files

**New:**
- `apps/organising-db/src/app/api/campaigns/[id]/verify-an-tag/route.ts`

**Modified:**
- `apps/organising-db/src/components/email/composer/EmailComposer.tsx` — extend `preparedTag` shape with `worker_an_ids`, populate from `data.worker_results`, pass through to SendActions
- `apps/organising-db/src/components/email/composer/SendActions.tsx` — Verify button, click handler, verification-result state, updated status badge rendering

## Critical files (summary)

**New:**
- `apps/organising-db/src/app/api/campaigns/[id]/verify-an-tag/route.ts`

**Modified:**
- `apps/organising-db/src/app/api/campaigns/[id]/push-list/route.ts` (Phase A warm-up + Phase B warning text)
- `apps/organising-db/src/components/email/composer/EmailComposer.tsx` (Phase B toast + Phase C preparedTag extension)
- `apps/organising-db/src/components/email/composer/SendActions.tsx` (Phase C button + handler)

**Unchanged but referenced:**
- `apps/organising-db/src/lib/api/action-network.ts` — `getTaggingsDetailed`, `getPersonTaggings` already exist

## Verification

1. **Phase A** — Trigger a push to AN. Note response time (~500ms slower than baseline due to warm-up calls). Open the AN tag-detail page within 1 minute and observe activists appearing sooner than baseline. Exact timing depends on AN's internal cache, but should be reproducibly faster than without the warm-up.

2. **Phase B** — Trigger a push where AN's read replicas haven't caught up (the normal case). Confirm:
   - The toast shows the new copy mentioning "several minutes" and "AN's tag-detail page"
   - The toast duration is 8 seconds (not the default)
   - The tag status badge in the footer reflects the updated `verification_warning` server-side text

3. **Phase C** — Push to AN. Click "Verify with AN" in the composer immediately. Confirm within 2 seconds:
   - Status updates with one of the three result variants
   - When AN's tag-detail view still shows 0 but per-person taggings confirm N, the badge shows blue "Tagging confirmed (N/N from person view). AN's tag list still shows 0, will catch up."
   - Re-clicking several minutes later shows AN has caught up and turns green
   - When `matched_per_person < expected_total`, badge shows amber and lists the gap

## Future work (deferred, separate concern)

The Supabase auth-client `lock_timeout` cascade observed during tab-switches is a separate issue from AN tagging. The right fix lives in `apps/organising-db/src/lib/supabase/connection-monitor.ts`:

1. Maintain an `inFlightSession: Promise<Session> | null` ref shared across heartbeat + visibility handlers
2. Reuse the in-flight promise rather than issuing concurrent `getSession()` calls
3. On lock timeout, call `supabase.auth.refreshSession()` explicitly to clear the stuck lock

That fix is independent of AN and can ship in its own PR. Defer until the AN UX is settled.
