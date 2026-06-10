# How‑To Videos — Continuation Handoff

**For a new agent picking up the how‑to video work.** This is the single source of truth for current state; the broader plan is in [HOW_TO_VIDEOS_WORKPLAN.md](HOW_TO_VIDEOS_WORKPLAN.md) and per‑clip prompts in [HOW_TO_VIDEOS_AGENT_PROMPTS.template.md](HOW_TO_VIDEOS_AGENT_PROMPTS.template.md). Last updated 2026‑06‑10.

---

## 1. Goal
A library of short (60–180s) how‑to videos for the **manual campaign pathway** (NOT the wizard), surfaced in‑app and exportable. Two anchors: a long **OVERVIEW** and an **interactive hub**. The interactive hub is the in‑app **`/help`** page. AI narration uses an **Australian female neural voice (Natasha)** via a local TTS app. Videos are produced by **automated browser capture (Playwright)** against the **develop** deployment, narrated, and assembled with **ffmpeg**.

## 2. Locked decisions
- **Record on `develop`** (`https://offshore-alliance-git-develop-reveille-strategy.vercel.app`), Supabase DEV. Never local/prod for *recording*.
- **Serve from production** too: media lives in **Supabase Storage** (`help-videos` bucket) in **both** DEV + PROD; the app builds URLs from `NEXT_PUBLIC_SUPABASE_URL` so each env serves its own bucket.
- **Voice:** Natasha `en-AU-NatashaNeural` via the local edge‑tts app.
- **Catalogue:** 18 component clips + OVERVIEW + interactive hub. Clips end with clickable "Up next" cards.

## 3. DONE ✅
**13 videos produced, in storage (both projects) and live in the `/help` hub on develop:**
`OVERVIEW, A1, A2, A4, A5, B1, C1, C2, C3, E1, E2, D1, D2`
- A1 Add employer · A2 Add worksites · A4 Create campaign (manual) · A5 Configure from Settings
- B1 Units/groups explained · C1 Wall chart · C2 Filter/sort · C3 Build & fire a list
- E1 Rating scale · E2 Create assessment
- D1 Email tasking (**intro‑level only**, see §7) · D2 Phone tasking (full New‑Call‑List wizard)
- OVERVIEW (~95s narrated chaptered explainer)

**A3 produced & frame‑verified (2026‑06‑10):** `A3` Import workers from a list (49s, `clips/a3.mjs`). Drives the Worker Import Wizard: open (11‑step rail) → upload `excel_worker_import_dummy_1.xlsx` via Playwright `setInputFiles` on the hidden `input[type=file]` → **Map Columns** (auto‑mapped) → Continue → **Map Values** (membership values resolved to real categories) → ends on the value step with "Select Employer" enabled, narrating the rest (employer → worksites → occupations → review → dedup → import). **Scope note:** intentionally does NOT drive a full import on camera — the employer/worksite/occupation/dedup steps are data‑dependent and **closed the wizard unpredictably when pushed past Map Values** (see `explore-import.mjs`); the clip teaches the mapping workflow + shows the full rail. To deepen later: resolve membership values to real types, pick the employer, accept worksite/occupation fuzzy‑matches, then "Start Import".

**🎉 FULL CATALOGUE COMPLETE — all 18 component clips + OVERVIEW produced.** (HUB = the `/help` page itself.)

**B2 + B3 produced & frame‑verified (2026‑06‑10), pending publish:** Campaign Units tab (`sub=campaign-units`). **B2** Create organising units (38s, `clips/b2.mjs`): "Add unit" opens a single‑screen form (Name / Type / Estimated / Target / Commonality / Anchor → Save); created "Cranes & Rigging (DEMO)" type work_area (DB ou_id 11); also frames the per‑unit rule row (Include/Occupation/contains/value → Add rule) and "New group". **B3** Allocate workers (36s, `clips/b3.mjs`): a unit's "Assign worker" → bulk dialog (search + tick + "Assign selected (N)"); assigned 2 workers to Day Shift (6→8, DB‑verified). **Gotcha:** the assign dialog's row checkboxes are **Radix `[role="checkbox"]` buttons, not `<input type=checkbox>`** — select via `[role="dialog"] table [role="checkbox"]` nth(1+). D3/D4/E3 already published (commit `feat(help): add D3, D4, E3 …`, manifest=16); B2/B3 still need upload + manifest + commit.

**E3 produced & frame‑verified (2026‑06‑10), pending publish:** `E3` Rate workers (36s). `clips/e3.mjs` on the Wall Chart: switch the assessment selector Cumulative → "EBA support check" → click a worker tile's rating badge → `InlineRatingPopover` → `RatingPicker` (Radix Select, "1 — Supportive leader") → Save → tile recolours → back to Cumulative. Verified: Noah (1585) → EBA support check (activity 4) rating 1, `source=staff`. **Unblock that made this possible:** seeded `campaign_worker_membership` for campaign 3 (16 DEMOW workers) — without it the wall‑chart List view / assessments members are empty. Tile selectors: `[data-worker-id="<id>"]` wrapper, quick‑rate trigger = the inner `[role="button"]`; the rating Select lives in `[data-radix-popper-content-wrapper] button[role="combobox"]` (Unassessed is option index 0, so value 1 = `getByRole('option').nth(1)`).

**D4 produced & frame‑verified (2026‑06‑10), pending publish:** `D4` Activist tasking — task lists & the leader webform (57s). `clips/d4.mjs` shows the staff **Leader task lists** tab (seeded list "Day-shift crew — safety check-in (DEMO)") then the **public `/leader/task/[token]` webform**: unlock with password → crew list → open a worker → set a 1–5 rating → submit → rating persists on the assessed list (verified: Olivia rated 2, `source=leader_form`, `activist_assessed`). Seeded via SQL: `campaign_activities` (activity 6, `activist_assessed`) + `campaign_task_lists` (leader Liam 1583) + `campaign_task_list_items` (5 followers DEMOW‑2..6). **Token is minted in the clip's `seed()`** via `POST /api/campaigns/3/task-lists/<id>/token` `{password:"demo1234", expiresInHours:24}` using the logged-in `page.request` (password is staff-chosen; never auto-generated). Gotchas learned: (a) the leader form **reloads to a blank spinner after submit** — end the final step by waiting for the re-rendered "N / M assessed" list, not the transient "Saved" toast; (b) narration must cover the slower two-route flow or the silent video tail lands on the reload-blank. To re-record clean, `delete from campaign_activity_ratings where activity_id=6;` first.

**D3 produced & frame‑verified (2026‑06‑10), pending publish:** `D3` Phone tasking — running a calling session (47s). `clips/d3.mjs` drives the live `CallSessionPage`: dial outcome **Connected** → step the script → set **Overall Support Level = Supporter** → **Positive Outcome** + note → **Save & Phone Next** → next contact loads automatically. Verified in DB (attempt: connected/completed_positive/support=supporter) and on‑screen frames. **No real calls** — only outcome logging. Demo data was **seeded via Supabase SQL** (DEV `dpnnmkhabysfdogllsyh`): call list **"EBA outreach — Day shift (DEMO)"** on campaign 3 (8 pending `call_list_items` = DEMOW‑1..8) + a 4‑section `call_scripts` row ("EBA support — call script (DEMO)", linked via `call_lists.script_id`); the 16 DEMOW workers were given **AU demo mobiles + emails** (needed for the contact card). To re‑record, reset items to `pending` first (clear `claimed_at`/attempts) — see the reset block in the session history. Still needs: upload to both buckets + manifest regen + commit (§6 steps 6‑8).

**Infrastructure (all built & verified):**
- **Capture pipeline** at `scripts/video-pipeline/` — reusable framework + per‑clip specs (see §6, §8).
- **Auth bug FIXED & deployed** (`apps/organising-db/src/lib/supabase/auth-context.tsx`): the app called `supabase.auth.getSession()` at mount, which deadlocked on auth‑js's re‑entrant lock and then nulled a valid session → blank/0‑records UI (the production "connection dropout"). Fix: derive init state from the reliable `INITIAL_SESSION` event; never clear an established session on a timeout. **This was the unlock** — without it, automated sessions (and the prod dropout) break.
- **`/help` hub** — `apps/organising-db/src/app/(dashboard)/help/page.tsx` (searchable catalog grouped by series, player + captions, clickable "Up next", Download/Share, Transcript). "Guides" nav item in `components/layout/sidebar.tsx`. Manifest at `public/help-videos/manifest.json` (committed; media NOT committed — served from storage).
- **Storage migration** — public `help-videos` bucket in DEV (`dpnnmkhabysfdogllsyh`) + PROD (`gteygwfgjvczanmrwgbr`); DEV locked to public‑read/authenticated‑write; PROD writes via service‑role.
- **Demo data seeded** on DEV campaign 3 (see §5).

## 4. Git state (FLUID — the user shares this working tree and commits in parallel; ALWAYS `git fetch` + check branch first)
- Work lands on **`develop`**; the user periodically merges `develop → main` (prod).
- As of last check: `develop` ahead of `main` by a few commits (Overview + D1/D2 manifest + the user's `campaign_list_import` work). The OVERVIEW + D1/D2 reach prod on the next `develop → main` merge — **the PROD storage bucket already has all media**, so prod `/help` works as soon as the code merges.
- **Concurrency rule:** before any checkout/commit/push, `git fetch`; never force‑push; if a push is rejected, `git pull --ff-only` (or rebase) and retry. Don't clobber the user's uncommitted changes.
- **Auth‑fix & /help binaries:** binaries were removed from git (commit `chore(help): serve clips from Supabase Storage…`); the gitignore keeps `apps/organising-db/public/help-videos/*.mp4` out.

## 5. Environment, secrets & demo data
- **DEV demo login:** `troyburton@gmail.com` — password is in the **gitignored** `docs/HOW_TO_VIDEOS_AGENT_PROMPTS.md` (or ask the user). Pass to scripts via env `OA_DEMO_EMAIL` / `OA_DEMO_PASSWORD`. **Login is flaky** (first attempt often stays on /login) — `lib/auth.mjs` retries; this is normal.
- **TTS app:** `cd "/Volumes/DataDrive/cursor_repos/text to voice" && .venv/bin/python main.py` → `http://127.0.0.1:8000`. Voice `en-AU-NatashaNeural`. **It drops intermittently** — before each production run, `curl -s http://127.0.0.1:8000/voices` and restart if needed.
- **Supabase MCP** (tools `mcp__fb46e359-...`): use `execute_sql` with `project_id` = `dpnnmkhabysfdogllsyh` (DEV) or `gteygwfgjvczanmrwgbr` (PROD).
- **PROD service‑role** for storage uploads is read from `apps/organising-db/.env.local` (which points at PROD) by `upload-to-storage.mjs` — never printed.
- **Demo data on DEV (campaign_id 3, "Acme Energy EBA 2026 — DEMO"):** employer 800 `Acme Energy Pty Ltd (DEMO)`, worksite 204 `Acme FPSO Northstar (DEMO)`, 16 workers (`reference_id LIKE 'DEMOW-%'`), 3 organising units (Day/Night Shift, Maintenance), 1 assessment ("EBA support check"), 16 ratings. **Re‑seed** = re‑run the idempotent `DO $$ … $$` block (it deletes prior demo rows first); the working version is in the conversation history / regenerate from the schema. Gotchas: `campaign_activity_ratings.source` ∈ enum (`staff`/`leader_form`/`call_outcome`/…); `rating_phase` ∈ {expected,actual}; membership is via `campaign_worker_ou` (OU allocation), but the **wall‑chart List view + some features query a campaign SCOPE/UNIVERSE that the seed did NOT populate** (see E3 in §7).

## 6. Production recipe (per clip)
```bash
# 0. one-time: pipeline deps
cd scripts/video-pipeline && npm install && npx playwright install chromium
# 1. TTS up?
curl -s http://127.0.0.1:8000/voices >/dev/null || (cd "/Volumes/DataDrive/cursor_repos/text to voice" && nohup .venv/bin/python main.py & sleep 5)
# 2. discover selectors for the flow (writes screenshots+JSON to output/discovery/)
ROUTE='/campaigns/3?tab=...' CLICK="Some Button" READY='text=...' NAME=foo \
  OA_DEMO_EMAIL=... OA_DEMO_PASSWORD=... node discover-route.mjs
# 3. write clips/<id>.mjs (copy an existing one; use runClip from lib/clip.mjs)
# 4. produce
OA_DEMO_EMAIL=... OA_DEMO_PASSWORD=... node clips/<id>.mjs
# 5. VERIFY visually (always): extract a frame and look at it
ffmpeg -y -ss 14 -i output/<ID>/<ID>.mp4 -frames:v 1 /tmp/f.png   # then Read /tmp/f.png
# 6. upload media to BOTH buckets
OA_DEMO_EMAIL=... OA_DEMO_PASSWORD=... TARGET=both node upload-to-storage.mjs
# 7. regenerate the hub manifest (storage paths)
node publish-to-app.mjs
# 8. commit manifest on develop, push (fetch first!)
```
`runClip(spec)` (in `lib/clip.mjs`) handles narration → demo‑row cleanup → record (visible cursor, **absolute‑timeline sync** so actions line up with narration, page‑load lead trimmed) → ffmpeg assemble → manifest. A clip spec = `{ id, title, segments[], steps[] (one per segment), startUrl (string or async({get})=>url), readySelector, cleanup[], upNext[], upNextLabels[], tags[], summary, … }`. Campaign‑scoped `startUrl` resolves the id by name: `get('campaigns?name=eq.<encoded>')`.

## 7. REMAINING work (0 clips — polish only)
Each needs its own discover‑then‑iterate pass (custom components rarely click via plain text selectors). In suggested order:

| Clip | What's needed / blocker |
|---|---|
| ~~**D3** running a call session~~ | ✅ **DONE 2026‑06‑10** (see §3) — seeded a demo call list + script via SQL, drove `CallSessionPage`. Pattern to reuse for the rest: **seed via Supabase MCP `execute_sql`, then a thin clip that records the real UI.** |
| ~~**D4** activist task + leader webform~~ | ✅ **DONE 2026‑06‑10** (see §3). Note: lives on **Plan & Execution → Task Lists** sub‑tab (not Assessments); per‑list action is **"Generate link"** (not "Send to leader"). |
| ~~**E3** rate workers~~ | ✅ **DONE 2026‑06‑10** (see §3). The "scope/universe" table is **`campaign_worker_membership`** (cols `membership_id, campaign_id, worker_id`, unique `(campaign_id, worker_id)`). Seeded the 16 DEMOW workers into it for campaign 3 — the Assessments tab is **distribution‑only**, but the **Wall Chart / List** sub‑tab (`sub=wall-chart`) now lists them. Rating surface: switch the assessment selector from **Cumulative** to a specific assessment (e.g. **"EBA support check"**), then click a tile/row rating chip → `InlineRatingPopover` → `RatingPicker` (a Radix **Select**, options "1 — Supportive leader"…"5 — …", "Unassessed") → **Save**. Cumulative mode instead opens `CumulativeRatingPopover` (pick assessment first). Existing demo ratings live on assessment "EBA support check" (16) + "Site safety vote (DEMO)". **Still TODO:** write `clips/e3.mjs` + record. |
| ~~**B2** create units / **B3** allocate~~ | ✅ **DONE 2026‑06‑10** (see §3). Campaign Units tab; "Add unit" = single‑screen form, per‑unit rule row = the "rule‑based builder"; "Assign worker" = bulk dialog. |
| ~~**A3** import workers~~ | ✅ **DONE 2026‑06‑10** (see §3). Reliable through Map Columns + Map Values; full import deliberately not driven on camera (fragile past Map Values). |

**Polish / known issues:**
- **D1 is intro‑level**: the email composer cards (`/campaigns/3/email/setup/order` "Draft email first"/"Build the list first") **do not respond to any synthetic click in headless** (hydration quirk; `/email/wizard` is empty without the card flow). D1 currently shows the choice + narrates the flow. To deepen: crack that card click (try real‑browser/CDP, or the build‑list→fire‑Email entry).
- **OVERVIEW** is a title‑card explainer; could be upgraded with B‑roll snippets from existing clips.
- Consider adding more series/clips per the original 18‑clip plan (e.g. A3 import was always planned).

## 8. Key files
**Pipeline (`scripts/video-pipeline/`, all untracked/local):**
- `config.mjs` — base URL, viewport, paths, voice (env‑overridable).
- `lib/clip.mjs` — `runClip()` framework (the core).
- `lib/{auth,cursor,tts,ffmpeg,cleanup}.mjs` — login(+retry), visible‑cursor overlay, edge‑tts client + VTT, ffmpeg (cards, narrated cards, buildMain with `trimStart`, concat), Supabase‑auth capture + REST delete.
- `clips/*.mjs` — per‑clip specs (copy these as templates).
- `discover-route.mjs` — generic selector discovery (ROUTE/CLICK/READY/NAME env).
- `publish-to-app.mjs` — writes `public/help-videos/manifest.json` (storage paths; OVERVIEW first; series O/A/B/C/D/E).
- `upload-to-storage.mjs` — `TARGET=dev|prod|both` uploads media to the buckets.
- `output/<ID>/<ID>.{mp4,vtt,transcript.txt,manifest.json}` — produced clips (gitignored).
- Diagnostic one‑offs (safe to ignore/delete): `discover*.mjs`, `probe.mjs`, `poll.mjs`, `diag.mjs`, `*-test.mjs`, `verify2.mjs`, `build-manifest.mjs`.

**App:**
- `apps/organising-db/src/app/(dashboard)/help/page.tsx` — the hub.
- `apps/organising-db/src/components/layout/sidebar.tsx` — "Guides" nav item.
- `apps/organising-db/public/help-videos/manifest.json` — committed catalog.
- `apps/organising-db/src/lib/supabase/auth-context.tsx` — the auth fix.

**Docs/memory:** `docs/HOW_TO_VIDEOS_WORKPLAN.md`, `docs/HOW_TO_VIDEOS_AGENT_PROMPTS.template.md`, and the project memory `how_to_videos_workplan.md` / `tts_app.md` / `deployment_setup.md`.

## 9. Gotchas (learned the hard way)
1. **Auth fix is on `develop`/`main` already** — don't reintroduce a `getSession()`‑at‑mount.
2. **Shared working tree + active user** — fetch before git ops; don't force‑push.
3. **TTS server drops** — re‑check `/voices` before every run.
4. **Custom cards/components often ignore synthetic text‑clicks** — discover the real clickable; some (email cards) resist entirely in headless.
5. **Capture from a FRESH page** after login (same‑tab nav right after login hits a transient that doesn't load data).
6. **Always verify a frame** of every produced clip before publishing — don't trust "DONE".
7. **Storage URLs are env‑aware** via `NEXT_PUBLIC_SUPABASE_URL`; manifest stores object paths (`help-videos/A1.mp4`), the page prefixes them.

## 10. Immediate next step
**All clips done** — D3 ✅, D4 ✅, E3 ✅, B2 ✅, B3 ✅, A3 ✅ (§3). The catalogue (18 + OVERVIEW) is complete and published to the hub manifest (19 clips, media in both storage buckets). **Remaining is polish + prod deploy only:** (a) push `main` / merge `develop → main` so prod `/help` shows all 19; (b) optional deepenings noted in §3 (A3 full import, D1 email card click, OVERVIEW B‑roll). The reusable pattern for any future clip: **seed/verify via Supabase MCP `execute_sql`, thin clip that records the real UI, verify every frame + the DB write.** Use the recipe in §6 and verify every frame. Then publish the rendered‑but‑unpublished clips (D1, D2, D3, OVERVIEW → already in storage for D1/D2/OVERVIEW; D3 still needs upload) and regenerate the manifest. Remind the user to merge `develop → main` to push the latest hub to prod.
