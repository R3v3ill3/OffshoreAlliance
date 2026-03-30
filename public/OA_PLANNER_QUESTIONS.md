# OA Planner Integration — Open Questions

This document captures questions that need to be answered before the full integration between the **Offshore Alliance Organising Database** and the **OAPlanning** app (`oaplanner.uconstruct.app`) can be completed. Some items are blocking for specific features; others affect design decisions that will shape the integration architecture.

Please add your answers directly below each question, or flag items that are not yet decided.

---

## 1. Deployment & URL

**Q1.1** — What is the confirmed production URL for OAPlanner?
> The plan assumes `https://oaplanner.uconstruct.app`. Is this correct, or is there a different domain/subdomain?

**Q1.2** — Is OAPlanner deployed on Vercel? Does it use the same Vercel team/org as the Organising DB?
> This affects whether a shared top-level navigation can be deployed as a shared Vercel Edge Middleware layer.

**Q1.3** — Does OAPlanner have a staging/preview URL?
> Integration work should be tested against a preview URL, not production.

---

## 2. Campaign Ownership — Which App Creates the `campaigns` Row?

**Q2.1** — Is the Organising DB the definitive place to create campaigns, with OAPlanner consuming them? Or can OAPlanner also create new `campaigns` rows independently?
> The current OAPlanning wizard inserts into `campaigns` directly. If both apps create campaigns, deduplication and ownership need to be clarified.

**Q2.2** — Should the OAPlanner wizard (`/campaigns/new`) always require an existing Organising DB campaign to link to (i.e. only accessible via deep link from this app), or can it stand alone?
> This determines whether the OAPlanner wizard needs to be gated or changed.

**Q2.3** — Is the `campaign_type = 'bargaining'` field in the Organising DB campaigns table the intended signal for triggering OAPlanner integration, or is a separate linking mechanism needed?
> Currently the plan gates the "Open in OAPlanner" CTA on `campaign_type === 'bargaining'`. Should organising or mobilisation campaigns ever have OAPlanner plans?

---

## 3. Agreement Linking

**Q3.1** — Does every OAPlanning campaign correspond to exactly one agreement? Or can there be OAPlanning campaigns without an agreement link (e.g. greenfield)?
> `campaign_timelines.agreement_id` is nullable in OAPlanning. The deep link will pass `?agreement_id=` but only if an agreement is known.

**Q3.2** — In the Organising DB, a campaign links to employers/worksites directly (via `campaign_employers`, `campaign_worksites`). OAPlanning links via `agreements` → `agreement_employers` / `agreement_worksites`. Are these always consistent? Could a campaign have employers not covered by any agreement?
> This affects whether employer/worksite names fetched from the agreements path will match what the organiser expects in OAPlanner.

**Q3.3** — Should the Organising DB campaign wizard collect an `agreement_id` directly (Step 1, for bargaining campaigns) so it can pass it to OAPlanner on completion? Or is the agreement selected separately after campaign creation?

---

## 4. Authentication & Session Sharing

**Q4.1** — Both apps use the same `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Has cross-origin session sharing been tested? When a user navigates from `uconstruct.app` to `oaplanner.uconstruct.app`, does the Supabase session cookie follow?
> Supabase `@supabase/ssr` uses `HttpOnly` cookies scoped to the domain. If the apps are on different domains (not subdomains of the same parent), the session will **not** be shared automatically and the user will be prompted to re-login.

**Q4.2** — Are both apps on the same parent domain (e.g. both under `*.uconstruct.app`)?
> If yes, cookie sharing works. If they are on different top-level domains, an explicit cross-app auth handshake (e.g. OAuth redirect, magic link, or shared token param) is needed.

**Q4.3** — Is there an intention to use Supabase's OAuth PKCE flow to support cross-app SSO, or is the shared-cookie approach sufficient given the domain setup?

---

## 5. RLS & Access Control

**Q5.1** — The OAPlanning `is_assigned_to_campaign()` RLS helper has a known oversharing bug (documented in `PLATFORM_CONTEXT.md` section 9). Is this known and accepted for now, or should it be fixed before integration goes live?
> The bug means any organiser assigned to any agreement in the system may pass the check for any campaign. This affects what planning data the Organising DB will be able to read when displaying the Campaign Plan tab.

**Q5.2** — Should organisers who are assigned to a campaign in the Organising DB (via `campaign_worker_membership` or `campaign_employers`) automatically get read access to that campaign's OAPlanning data? Or is OAPlanning access controlled separately?

**Q5.3** — The Organising DB's own RLS model uses `user_profiles.role` (`admin`/`user`/`viewer`) and `canWrite`. Does this role model need to be reconciled with OAPlanning's role model (`admin`, `lead_organiser`, `assigned organiser`) for the shared data queries?

---

## 6. WOC (Workplace Organising Committee) Data

**Q6.1** — How is WOC membership tracked in the Organising DB? Is there a `woc_members` table, a role flag on `campaign_worker_membership`, or is it tracked via `oa_leader_role = 'delegate'`?
> OAPlanning gate criteria reference "WOC establishment" (Gate 2) and "Active WOCs" (Gate 3). Auto-populating gate criteria requires knowing how this data is stored.

**Q6.2** — Is the `oa_leader_role` field on `campaign_worker_membership` (values: `delegate`, `activist`, `contact`) the intended representation of WOC structure? If so, what is the threshold for a gate criterion like "WOC established" — a minimum number of delegates per worksite, or another measure?

**Q6.3** — Are there any existing views or functions in the Organising DB that already compute engagement density or WOC coverage per agreement/campaign that OAPlanning could reference?

---

## 7. Gate Criteria Auto-Population

**Q7.1** — Which gate criteria in OAPlanning are candidates for automatic population from Organising DB data? Please confirm or adjust this list:

| Gate | Criterion | Proposed source in Organising DB |
|------|-----------|----------------------------------|
| Gate 1 | Contact details verified | `workers` where `phone IS NOT NULL AND email IS NOT NULL` for campaign scope |
| Gate 1 | Member engagement threshold | `campaign_activity_ratings` aggregated by campaign |
| Gate 2 | WOC established | `campaign_worker_membership` where `oa_leader_role = 'delegate'` per worksite |
| Gate 3 | Membership density | `campaign_worker_membership` count / `total_worker_estimate` |
| Gate 3 | Log of Claims survey participation | External survey tool — no Organising DB data? |

**Q7.2** — Should auto-population happen in real time (live query on page load in OAPlanning) or via a scheduled job that writes to `gate_criteria.current_value`? The latter is more reliable for reporting but less responsive.

---

## 8. Navigation & UX Design

**Q8.1** — What should the cross-app navigation look like? Options:
- (A) A simple external link in the sidebar ("OAPlanner →") with an external link icon
- (B) A top banner present in both apps showing "Organising DB | OAPlanner" as a tab switcher
- (C) A fully shared nav component (requires a shared npm package or monorepo setup)

**Q8.2** — When a user navigates from the Organising DB campaign detail to OAPlanner, should they land on the OAPlanner campaign detail page for that campaign, or on the OAPlanner dashboard?

**Q8.3** — On the OAPlanning side, when a user is viewing a campaign plan, should there be a "View in Organising DB" link back to `/campaigns/[id]` in the Organising DB? If so, what is the Organising DB's production URL?

---

## 9. Agreement Expiry Warning

**Q9.1** — Where should the expiry warning ("Agreement expiring with no campaign plan") appear?
- (A) On the `/agreements` list page as a banner or highlighted row
- (B) On the `/dashboard` page as an alert card
- (C) On the agreement detail page
- (D) All of the above

**Q9.2** — What is the threshold for surfacing the warning? The plan uses 12 months. Should this be configurable, or is 12 months (with a secondary threshold at 6 months for urgency escalation) appropriate?

**Q9.3** — Should the warning be dismissible (per-user, per-agreement) and remembered across sessions? If so, a `dismissed_warnings` table or user preference key in `user_profiles` would be needed.

---

## 10. OAPlanner Wizard — Pre-fill Parameters

**Q10.1** — Confirm the query parameters the OAPlanner wizard (`/campaigns/new`) currently accepts or should be updated to accept:
- `?campaign_id=` — link to existing Organising DB campaign (skip campaign creation in OAPlanner)
- `?agreement_id=` — pre-fill the agreement field
- `?expiry_date=` — pre-fill the expiry date
- `?organiser_id=` — pre-fill the lead organiser

Does OAPlanner's wizard currently support any of these, or do they all need to be implemented on the OAPlanning side?

**Q10.2** — If `?campaign_id=` is passed to OAPlanner, should the wizard skip creating a new `campaigns` row (since it already exists in the Organising DB) and instead only create the `campaign_stage_plans`, `gate_definitions`, etc. rows for that campaign?

---

## 11. Data Consistency & Dual-Write Risk

**Q11.1** — OAPlanning's wizard creates a `campaigns` row. The Organising DB's wizard also creates a `campaigns` row. Is there a risk of duplicate campaign records for the same bargaining campaign? What is the intended workflow to prevent this?

**Q11.2** — Should OAPlanning be modified to only accept `campaign_id` as input (linking to an existing Organising DB campaign) rather than creating its own `campaigns` rows? Or is the current separate creation flow acceptable?

**Q11.3** — Are there any existing campaigns in the Organising DB that already have OAPlanning data (i.e. `campaign_stage_plans` rows)? If so, are the `campaign_id` values consistent (did OAPlanning create its own campaigns rows or reference existing ones)?

---

## 12. Reporting & Snapshots

**Q12.1** — The OAPlanning cron job generates weekly `reporting_snapshots`. Should the Organising DB's `/reports` page surface any of this snapshot data (e.g. stage progress across all campaigns as a planning health metric)?

**Q12.2** — Is there a requirement for a unified cross-app report combining Organising DB metrics (member density, action results) with OAPlanning metrics (stage progress, gate pass rates)?

---

## 13. Long-Term Architecture

**Q13.1** — Is there an intention to eventually merge both apps into a single Next.js application? If so, what is the timeline, and should integration work be designed to be easily collapsed into a monorepo later?

**Q13.2** — If remaining as separate apps, should shared UI components (e.g. the cross-app nav banner) be extracted into a private `@offshore-alliance/ui` npm package?

**Q13.3** — Are there plans to add additional apps to the `uconstruct.app` ecosystem that would also connect to the same Supabase project? The integration architecture should scale to N apps if so.

---

*Document created: 2026-03-30. Please add answers or comments inline and return this file.*
