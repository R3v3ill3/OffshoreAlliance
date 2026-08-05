# Action Network Participation Import — Implementation Plan

**Status:** PROPOSED — awaiting answers to the clarifying questions at the end before implementation.

**Goal:** From `Campaigns → [campaign] → Workforce → Wall Chart / List`, let a user import
participation and support data for an Action Network (AN) action (survey, form, petition,
event) and record it against a campaign assessment — updating worker participation and 1–5
ratings on the wall chart — with worker matching on email / phone / name and a
confirm/override review step for edge cases.

---

## 1. Current-state findings (code review)

### 1.1 Wall chart & ratings model

- Route: `/campaigns/[id]?tab=workforce&sub=wall-chart&view=wall-chart|list`
  (`src/app/(dashboard)/campaigns/[id]/page.tsx:580-706` → `workforce/workforce-board.tsx`
  → `campaign-wall-chart.tsx` / `workforce/workforce-list-view.tsx`).
- Assessments are `campaign_activities` rows (`activity_kind` includes `email_survey`,
  `sms_survey`, `assessment`, etc.; `is_binary`, `supporter_outcome_value`,
  `rating_labels JSONB`).
- Ratings live in `campaign_activity_ratings`: `rating INT 1-5` **or** `binary_value`,
  unique on `(activity_id, worker_id, rating_phase, event_id) NULLS NOT DISTINCT`.
  Provenance via `source` CHECK (currently `staff`, `leader_form`, `sms`, `email`,
  `petition`, `meeting`, phone values, task values — see
  `20260613110000_outcome_model.sql:51-69`).
- **Rating direction:** 1 = supportive leader, 2 = supporter, 3 = neutral, 4 = opposed,
  5 = oppositional leader (`rating_level` lookup, `20260423120000_rating_level_lookup.sql`).
  Supportive = rating ≤ 2 or `binary_value = supporter_outcome_value`.
- Server-side validated upsert already exists:
  `record_assessment_event(p_activity_id, p_worker_id, p_rating, p_binary_value,
  p_rating_phase, p_event_id, p_source, p_notes, p_actor_id)`
  (`20260425110000_record_assessment_event_rpc.sql`). This is the write path the importer
  should use.
- Wall chart/list render only workers present in `campaign_worker_membership`; UI reads via
  react-query keys `campaign-rating-summary`, `campaign-activity-ratings`,
  `campaign-activity-ratings-dist`, `worker-activity-ratings`, `campaign-assessments-rated`.

### 1.2 Worker identity & matching infrastructure

- `workers` identity columns: `email`, `phone` (single column — no separate mobile),
  `first_name`, `last_name`, `preferred_name`, `reference_id`, `action_network_id`.
- Existing import wizards (campaign/worker/membership) dedup with **exact-match** passes
  `reference_id → email → phone` only. There is **no name matching and no phone
  normalisation** anywhere today — both are new work.
- There is **no participation/ratings importer** today; all importers create/update worker
  and reference records.

### 1.3 Action Network integration

- Existing integration is **push/tag only** (person signup helper, taggings, message
  stats). No code reads submissions/responses/signatures/attendances.
- Client (`src/lib/api/action-network.ts`) gaps that block read-side work:
  - **No pagination traversal** (every read is page 1 → caps at 25 records).
  - **No rate limiting / 429 retry** (AN limit ≈ 4 req/s).
  - API key is `process.env.ACTION_NETWORK_API_KEY` read in 5 duplicated route helpers;
    the `app_settings.action_network_api_key` row + admin UI exist but are **never read**.
  - `GET/POST /api/action-network` passthrough has **no auth check** (pre-existing gap;
    should be fixed while we're expanding AN surface).
- Known AN read-lag behaviour (docs/AN_TAGGING_LAG_PLAN.md): collection endpoints lag;
  per-person endpoints are fresher. Any sync UI must set expectations accordingly.

### 1.4 Action Network API capability (verified against AN docs, Aug 2026)

| Need | AN API answer |
|---|---|
| List actions | `GET /forms`, `/surveys`, `/petitions`, `/events` — filterable by `title`, `created_date`, `modified_date` |
| Who participated | Action records per action: forms→`submissions`, surveys→`responses`, petitions→`signatures`, events→`attendances`. Each links `osdi:person` + `action_network:person_id`, has `created_date`/`modified_date`, filterable by date, paginated 25/page |
| **Answer values** | **NOT in action records.** Survey/form question answers are only available (a) as person `custom_fields` *if* the AN question is configured to save to a custom field, or (b) via the **CSV report export from the AN admin UI** — reports are not API-accessible |
| Person identity | `GET /people/{id}` → `email_addresses[]`, `phone_numbers[]`, `given_name`, `family_name`, `custom_fields` |
| Dedup | One submission/response per person per action (resubmission overwrites) |

**Consequence:** the feature needs two source modes —
- **API sync** answers *“who did it”* → participation / binary / fixed-rating marking.
- **CSV report upload** answers *“what did they say”* → response-value → rating mapping.

---

## 2. Proposed design

### 2.1 Entry point & UX shape

A **“Import participation”** button in the `WorkforceBoard` header (next to the
Wall chart / List toggle, `canWrite`-gated) opening a full-screen wizard dialog —
same pattern as `campaign-import-wizard.tsx`. Available identically from both the
Wall Chart and List sub-views.

### 2.2 Wizard steps

**Step 1 — Source**
- Card A: *“Sync from Action Network”* — browse/search the group’s forms, surveys,
  petitions and events (title, created date, total participation count, browser link).
- Card B: *“Upload an Action Network report (CSV/XLSX)”* — for when answer values are
  needed, with inline help text explaining how to export the report from AN.

**Step 2 — Target assessment**
- Pick an existing `campaign_activities` assessment **or create a new one inline**
  (title, `activity_kind` — defaults to `email_survey`/`assessment` per source type,
  binary vs 1–5, `supporter_outcome_value`, optional custom `rating_labels`).
- Defaults: `rating_phase = 'actual'`, `event_id = null` (advanced disclosure to attach
  to an `activity_events` row, e.g. a vote).

**Step 3 — Response mapping**
- *CSV mode:* pick the response column; the wizard lists its **distinct values with
  counts**; user maps each value → a rating 1–5 (shown with the `rating_level` /
  `rating_labels` labels and colours to prevent scale-inversion mistakes) or a binary
  value, or “ignore”. Identity columns (email / mobile / first / last name) auto-mapped
  via header heuristics (reusing/extending `autoMapCampaignHeader`), user-adjustable.
- *API mode:* participation is binary by nature — default “record `binary_value = yes`”
  (binary assessment) or a single chosen rating for all participants (e.g. 2 Supporter).
  Optional (Phase 3): map an AN person custom field as the answer column.
- Option: **non-responders** — “also record ‹no / a chosen value› for workforce members
  not in this import” (off by default).
- Option: **conflict policy** — “update existing ratings on this assessment” (default)
  vs “only fill blanks”.

**Step 4 — Match workers (review & override)**
Server-side matching of each source row against the campaign workforce (and optionally
the full worker DB) using a new shared matcher:

| Tier | Rule | Disposition |
|---|---|---|
| 1 | Email exact (case-insensitive; all AN emails checked) | Auto-matched |
| 2 | Phone exact after AU normalisation (`+61 4…` ≡ `04…`, strip spaces/punct) | Auto-matched |
| 3 | First + last name (case-insensitive, incl. `preferred_name`) with **exactly one** candidate in the workforce | Needs confirmation |
| 4 | Name matches multiple candidates, or nothing | Manual review |

Review UI groups rows into **Matched / Needs confirmation / Unmatched** with per-row
candidate picker, worker search, and actions: *confirm*, *pick other worker*,
*create worker + add to workforce*, *skip*. Bulk “accept all auto-matched”.
Matched rows with an AN person id also **backfill `workers.action_network_id`**.

**Step 5 — Preview & apply**
Summary counts (to create / to update / skipped / unmatched), then apply. Server writes
via `record_assessment_event` per row (batched), logs an import batch, invalidates the
five wall-chart query keys client-side, and shows a result screen with an “unmatched
rows” CSV download.

### 2.3 Data model changes (one migration)

```sql
-- Link an assessment to its AN action for display + re-sync
ALTER TABLE campaign_activities
  ADD COLUMN an_resource_type VARCHAR(20)
    CHECK (an_resource_type IN ('form','survey','petition','event')),
  ADD COLUMN an_resource_id VARCHAR(100),
  ADD COLUMN an_last_synced_at TIMESTAMPTZ;

-- Provenance values for imported ratings
--   widen campaign_activity_ratings.source CHECK with: 'an_sync', 'an_report_import'

-- Audit / undo
CREATE TABLE participation_import_batches (
  batch_id SERIAL PRIMARY KEY,
  campaign_id INT NOT NULL REFERENCES campaigns ON DELETE CASCADE,
  activity_id INT NOT NULL REFERENCES campaign_activities ON DELETE CASCADE,
  source_kind VARCHAR(20) NOT NULL CHECK (source_kind IN ('an_api','an_report_csv')),
  an_resource_type VARCHAR(20), an_resource_id VARCHAR(100), file_name VARCHAR(300),
  mapping JSONB,               -- column map + value→rating map, for audit/repeat
  rows_total INT, rows_matched INT, rows_created INT, rows_updated INT, rows_skipped INT,
  created_by UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE campaign_activity_ratings ADD COLUMN import_batch_id INT
  REFERENCES participation_import_batches(batch_id) ON DELETE SET NULL;
```

(RLS on the new table mirroring `an_tag_sync_log`; `record_assessment_event` gains an
optional `p_import_batch_id` parameter.)

### 2.4 API routes (all auth + non-viewer role gated)

| Route | Purpose |
|---|---|
| `GET /api/campaigns/[id]/an-actions?type=&q=&page=` | List AN forms/surveys/petitions/events with participation totals |
| `POST /api/campaigns/[id]/participation-import/fetch-an` | `{resource_type, resource_id, since?}` → walk action records (full pagination), batch-fetch people → normalized rows `{an_person_id, emails[], phones[], given_name, family_name, responded_at, custom_fields}` |
| `POST /api/campaigns/[id]/participation-import/parse` | CSV/XLSX upload → headers, sample rows, distinct values per column (reuses `xlsx` like existing importers) |
| `POST /api/campaigns/[id]/participation-import/match` | rows → `{worker_id?, matched_on, candidates[]}` per row |
| `POST /api/campaigns/[id]/participation-import/apply` | activity spec (existing id or new), resolved rows with rating/binary, options → RPC writes, AN-id backfill, batch log |

### 2.5 AN client upgrades (`src/lib/api/action-network.ts`)

- `fetchAllPages<T>(endpoint, opts)` following `_links.next` / `total_pages`, with a
  simple limiter (≤4 req/s) and 429/5xx retry with backoff.
- New methods: `getSurveys`, `getSurveyResponses`, `getPetitions`,
  `getPetitionSignatures`, plus reuse of `getForms/getFormSubmissions/getEvents/
  getEventAttendances`; `getPersonsBatch(hrefs)` with concurrency cap.
- Shared `getAnClient()` helper (single definition; env var now, optional
  `app_settings` fallback later) replacing the 5 duplicated copies.
- Add auth check to `GET/POST /api/action-network` passthrough (pre-existing hole).

### 2.6 New shared libs / components

- `src/lib/import/worker-matching.ts` — email/phone normalisers + tiered matcher
  (reusable later by the other import wizards).
- `src/components/campaigns/wall-chart/participation-import/` — wizard dialog + 5 step
  components + react-query mutations with the correct invalidations.
- Re-sync affordance: assessments linked to an AN action show a “Sync from Action
  Network” button (assessment selector / assessments tab) that replays the API path
  with `since = an_last_synced_at`, skipping straight to the review step.

---

## 3. Workflow step-through (organiser’s view)

> **Scenario:** organiser ran an AN survey *“EBA Priorities 2026”* with question
> *“Would you take protected action?”* (Yes / Maybe / No). They exported the AN report
> CSV. On the wall chart they want a new assessment coloured by support.

1. Campaign → Workforce → Wall Chart → **Import participation**.
2. **Source:** chooses *Upload an Action Network report*, drops `eba-survey-report.csv`.
3. **Assessment:** *Create new* → “EBA Survey — PIA willingness”, 1–5 scale.
4. **Mapping:** wizard auto-detects `email`, `mobile_number`, `first_name`, `last_name`;
   organiser picks column `would_you_take_protected_action`. Distinct values appear:
   `Yes (84)`, `Maybe (31)`, `No (12)`, `(blank) (9)`. Maps Yes → 2 Supporter,
   Maybe → 3 Neutral, No → 4 Opposed, blank → ignore. Leaves conflict policy at
   “update existing”, non-responders untouched.
5. **Match:** 118 auto-matched on email, 5 on phone, 3 need confirmation (name-only —
   organiser confirms 2, re-picks 1), 10 unmatched (7 skipped, 3 “create worker + add
   to workforce”). Accepts all.
6. **Apply:** preview “126 ratings will be written (9 update existing)”. Applies.
   Wall chart re-renders with the new assessment selectable; tiles colour by the
   imported ratings; participation metrics update; unmatched CSV downloadable.
7. Two weeks later, more responses arrive: for API-linked assessments a **Re-sync**
   pulls only new records since last sync and jumps straight to review.

*API-mode variant:* petition → Source = “Sync from Action Network”, pick the petition,
assessment defaults to binary with `supporter_outcome_value = yes`; all signatories →
`yes`; done in three clicks.

---

## 4. Phasing

| Phase | Scope |
|---|---|
| **1 — CSV report import** (core value) | Migration, matcher lib, wizard (source/assessment/mapping/match/apply), parse+match+apply routes, invalidations, batch audit |
| **2 — AN API sync** | Client pagination/rate-limit/new resources, `an-actions` + `fetch-an` routes, AN link columns on assessments, re-sync button, `action_network_id` backfill, passthrough auth fix, shared `getAnClient()` |
| **3 — Later** | Person custom-field answer mapping (API mode), scheduled re-sync, batch undo, admin-settings-stored API key |

---

## 5. Open questions (blocking implementation)

See the accompanying discussion — decisions needed on: participation-only rating default,
matching scope (workforce-only vs whole DB vs create-new), conflict policy default,
non-responder marking, v1 action types, dialog-vs-page, key storage, and phasing order.
