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

## 7. REMAINING work (6 clips + polish)
Each needs its own discover‑then‑iterate pass (custom components rarely click via plain text selectors). In suggested order:

| Clip | What's needed / blocker |
|---|---|
| **D3** running a call session | Needs a **created call list** first (finish the D2 wizard programmatically, or seed a `phone_call_list` row). Then `/campaigns/3/phone/call/[listId]` → drive `CallSessionPage` (contact card, ConversationStepper, dial‑outcome bar, CTA/Assessment rating panels, notes, next contact). **Never place real calls** — simulate outcome logging. |
| **D4** activist task + leader webform | "Leader task lists" section on the **Assessments** sub‑tab → "New task list" (5‑step: Anchor→Leader→Activity→Workers→Options) → **"Send to leader"** mints a token → capture the public `/leader/task/[token]` webform (rating table, membership column, Submit). Two linked flows. |
| **E3** rate workers | The rating editor is NOT on tile‑click or the Assessments tab (distribution only). The wall‑chart **List view shows 0 records because it queries the campaign SCOPE/UNIVERSE**, which the seed didn't populate. **First find + seed that table** (the seed only did `campaign_worker_ou`); then the inline rating picker (`wall-chart/inline-rating-popover.tsx`, `rating-picker.tsx`). |
| **B2** create units / **B3** allocate | Campaign Units is a **rule‑based builder** (Include/Occupation/contains), not a simple dialog (`create-organising-unit-dialog.tsx`). B3 (allocate) also needs the scope/universe. |
| **A3** import workers | `/workers` → "Import Workers" → **11‑step wizard** with xlsx upload (`public/excel_worker_import_dummy_1.xlsx`). The most complex; self‑contained (creates workers). |

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
Pick up at **§7**: produce **D3** (seed/create a call list, then capture the call session) and **D4** (activist task + leader webform), then **E3** (after seeding the campaign scope), **B2/B3**, **A3**. Use the recipe in §6 and verify every frame. Remind the user to merge `develop → main` to push the latest hub to prod.
