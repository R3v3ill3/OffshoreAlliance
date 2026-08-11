# SMS Module — Phase 9 Implementation Plan (Audience building)

**Parent brief:** `docs/SMS_EXPANSION_BRIEF.md` (§C audience building; §5.1 decisions 5, 5b, 6 — SETTLED, not reopened; §6 delivery plan Phase 9)
**Builds on:** Phase 8 (`docs/SMS_MODULE_PHASE8_PLAN.md`) — setup pathway, Build List SMS fire, survey `source_worker_list_id`. Phase 7 reporting polish is unrelated and must not be mixed into this commit.
**Status:** Implemented 2026-08-12 (migration applied DEV+PROD; adversarial fixes landed).
**Git:** primary working directory, no worktrees, single commit at phase end on the currently checked-out branch (`main`), per `CLAUDE.md`. **No agent runs any git command without explicit per-command user approval.**

## Objectives

1. **(§C, decision 6)** Ship a channel-agnostic `<AudiencePicker>` (prop `channel: 'sms' | 'email' | 'phone'`) with SMS contact rules (AU mobile + not opted out). **Wire only SMS** this phase — blast create and survey open replace their thin `<Select>`s. Email/phone keep their existing pickers.
2. **(§C)** Audience modes on parity with email/phone intent: **whole campaign**, **saved worker list**, **manual add** (name + mobile → gated worker create), **CSV/XLSX import** with match-against-campaign-workforce prompt, review, and consent attestation.
3. **(§C, decisions 5 / 5b)** Every recipient is a real `workers` row. Bare numbers without first+last name are rejected. `sms_list_items.worker_id` stays `NOT NULL`.
4. **(§C)** Consent: import/manual paths capture an explicit consent basis and stamp `workers.sms_consent_source` with **`sms_manual_entry` / `sms_import`** (extend the CHECK via migration). No silent import path.
5. **Reuse:** `toE164` (`lib/phone/normalise-phone.ts`), `worker-matching.ts`, SheetJS/`xlsx` as in participation import, participation-import wizard as UX template (parse → match → review → apply).

Out of scope: email/phone migration onto AudiencePicker; chat workspace (Phase 10); source taxonomy / reporting (Phase 12); Phase 7 AI/reporting files already in the dirty tree.

---

## Exact chains

### Chain 1 — blast create (header / no cohort)

`NewBlastSheet` (`InlineSmsOpsPanel.tsx`) → **`<AudiencePicker channel="sms" />`** → value is always a resolved audience `{ type: 'campaign' } | { type: 'worker_list', worker_list_id }` → existing `POST …/sms-lists` unchanged.

When the organiser builds a composed audience (manual and/or import), the picker **materialises a draft `campaign_worker_lists` row** (`source: 'sms_audience_picker'`, `default_purpose: 'sms'`) via `POST …/sms-audience/commit`, adds members, and returns `{ type: 'worker_list', worker_list_id }`. Downstream blast populate/screening is unchanged.

### Chain 2 — survey open

`DraftDetail` in `SmsSurveysPanel.tsx` → same `<AudiencePicker>` → open action still posts `{ type: 'campaign' } | { type: 'worker_list', worker_list_id }` to existing survey `actions` route. Composed audiences commit a worker list first (same commit API).

### Chain 3 — manual entry

AudiencePicker "Add person" → `POST …/sms-audience/manual` → duplicate check on `phone_e164` (reuse matching/normalisation) → create worker (`sms_consent_source: 'sms_manual_entry'`) + `campaign_worker_membership` if needed → return worker summary into the picker's staging set. **Not** written to `sms_list_items` until blast/survey commit.

### Chain 4 — CSV/XLSX import

AudiencePicker import sub-wizard → parse (client or `POST …/sms-audience/import/parse`) → match (`POST …/sms-audience/import/match`, campaign-preferred tiers from `worker-matching.ts`) → review (confirm / pick / create) → consent attestation (required enum) → `POST …/sms-audience/import/apply` creates/updates workers (`sms_consent_source: 'sms_import'` only on **create** or when filling a previously-null phone; never overwrite an existing non-null consent source) + ensures campaign membership → returns worker ids into the staging set → user still hits Commit (or Commit is folded into Apply when the picker is in "import then finish" mode — prefer: apply returns workers into staging, explicit Commit builds the list so blast name/composer stay separate).

---

## Work item 1 — Migration `supabase/migrations/20260812100000_sms_phase9_consent_sources.sql`

Extend `workers.sms_consent_source` CHECK:

```
'import' | 'manual' | 'legacy' | 'sms_manual_entry' | 'sms_import'
```

House idiom: `DROP CONSTRAINT IF EXISTS workers_sms_consent_source_check` then `ADD CONSTRAINT …`. Confirm constraint name on DEV before apply (query `pg_constraint`); if the name differs, drop by discovered name. Column stays `VARCHAR(20)` — both new values fit.

No new tables. No RLS changes. Comment on column updated to list the new values and their SMS audience-picker provenance.

**Apply:** MCP `apply_migration` DEV (`dpnnmkhabysfdogllsyh`) → `get_advisors` security → PROD (`gteygwfgjvczanmrwgbr`) → `pnpm gen:types`.

---

## Work item 2 — Pure lib `src/lib/sms/audience-import.ts` (+ tests)

- Row shape: `{ key, first_name, last_name, phone, email? }`
- `parseAudienceSpreadsheet(buffer | rows)` — require first/last/phone columns (flexible header synonyms); reject rows missing name or non-AU-mobile via `toE164` with per-row reasons
- Consent basis enum for attestation: `membership_form` | `workplace_signup` | `direct_request` | `other` (stored as the consent **source stamp** `sms_import` on the worker; the human-readable basis can live in apply audit notes / response only this phase — do **not** invent a new DB column unless already present)
- Helpers: staging readiness counts (sendable / opted_out / missing — though missing should be zero after parse reject)

Unit tests in `src/lib/sms/__tests__/audience-import.test.ts`.

---

## Work item 3 — API routes under `src/app/api/campaigns/[id]/sms-audience/`

Conventions: Zod validation, `createClient()` user session, `can_write` via RLS / role ≠ viewer (match `create-worker`), `errorResponse` on throw.

| Route | Role |
|-------|------|
| `POST …/manual` | Body: first_name, last_name, phone, consent_attested: true. Validate AU mobile. If phone matches existing worker: ensure campaign membership, return existing (do not change consent). Else create with `sms_consent_source: 'sms_manual_entry'`, `phone` local form + `phone_e164`. |
| `POST …/import/parse` | multipart or base64/xlsx buffer → parsed rows + reject reasons (no DB writes) |
| `POST …/import/match` | Body: rows → load campaign + wider workers → `matchWorkers` → dispositions |
| `POST …/import/apply` | Body: resolutions[] + `consent_basis` + `consent_attested: true`. Creates/updates per resolution; stamps `sms_import` on new phones; ensures membership. Returns `{ workers: { worker_id, … }[] }` |
| `POST …/commit` | Body: `{ name?, worker_ids: number[] }` (≥1). Creates draft `campaign_worker_lists` (`source: 'sms_audience_picker'`, `default_purpose: 'sms'`), inserts items, returns `{ type: 'worker_list', worker_list_id, items_count }`. Deduplicate ids. Reject workers not in campaign membership. |

Rate-limit lightly if siblings do; otherwise match neighbouring campaign routes.

---

## Work item 4 — `<AudiencePicker>` UI

**Path:** `src/components/audience/AudiencePicker.tsx` (+ small subcomponents in same folder: `ManualAddForm`, `AudienceImportDialog`, maybe `AudienceStagingList`).

**Props (sketch):**
```ts
type AudienceValue =
  | { mode: 'campaign' }
  | { mode: 'worker_list'; worker_list_id: number }
  | { mode: 'composed'; worker_ids: number[]; label?: string }

type AudiencePickerProps = {
  channel: 'sms' // email|phone accepted in type but throw/disable if not sms this phase
  campaignId: string | number
  value: AudienceValue
  onChange: (v: AudienceValue) => void
  disabled?: boolean
}
```

**UX:**
- Radio/segmented: Whole campaign | Saved list | Build audience
- Saved list: existing select of worker lists
- Build audience: staging list + Manual add + Import CSV/XLSX + readiness counts (opt-out / no mobile among staged — fetch worker flags)
- When parent needs API audience shape, helper `toApiAudience(value, { commit })` — if composed, call commit first

Blast/survey parents should call commit on submit if `mode === 'composed'`, then pass worker_list to existing APIs. Keep commit out of every keystroke.

---

## Work item 5 — Wire SMS surfaces

1. `NewBlastSheet` — replace Audience `<Select>` with `AudiencePicker`; on Create, resolve composed → commit → `useCreateSmsBlast` with worker_list (or campaign).
2. `SmsSurveysPanel` `DraftDetail` — same; preserve defaulting from `source_worker_list_id` by initialising picker value to that list when present.
3. Invalidate `['worker-lists-for-sms', campaignId]` after commit so the new list appears in Saved list mode.

Do **not** change Build List → SMS → Survey/Blast pathway (already has a cohort).

---

## Work item 6 — Types / docs touch

- Regenerate `@oa/db-types` after migration (consent CHECK alone may not change generated types if it's the same column type — still regenerate for currency).
- Brief note in `SMS_MODULE_HOWTO.md` Blasts/Surveys sections: audience picker supports list / manual / import + consent step. Keep short.

---

## In-phase decisions

1. **Materialise composed audiences as `campaign_worker_lists`**, not a new `sms-lists` audience union type — preserves open/populate invariants and makes the cohort reusable.
2. **Consent basis** is required attestation in the UI/API; DB stamp remains the short CHECK values `sms_manual_entry` / `sms_import` (not the long basis string). Basis is validated as an allow-list in Zod for auditability in logs/response.
3. **Existing worker match on manual/import** does not overwrite `sms_consent_source` or force opt-in.
4. **Email/phone channels** on the component are typed but unimplemented (`channel !== 'sms'` → render disabled message or invariant).

---

## Verification checklist

- [ ] `npx tsc --noEmit` clean in `apps/organising-db`
- [ ] Vitest: audience-import + any matching glue tests green; full suite green
- [ ] eslint clean on touched files
- [ ] Migration applied DEV → advisors (no new findings) → PROD → `pnpm gen:types`
- [ ] Manual smoke: New blast → Build audience → add one person → create blast → items include that worker; import 3-row xlsx with 1 match + 1 create + 1 reject; survey open against committed list; opted-out staged worker excluded at populate/open

## Adversarial focus

- Opt-out cannot be bypassed by import (populate/open still screen; staging should flag)
- Consent attestation required before apply/manual create
- Duplicate phone → link existing, no second worker
- RLS / campaign membership enforced on commit
- No writes on parse/match
- Dirty Phase 7 files left untouched
