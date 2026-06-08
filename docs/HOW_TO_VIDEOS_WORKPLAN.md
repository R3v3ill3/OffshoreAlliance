# How‑To Video Library — Suggested Workplan

**Scope:** A library of short, task‑focused how‑to videos for users **setting up and running _manual_ campaigns** (the manual create pathway — *not* the campaign planner / wizard pathway), plus the wall‑chart, tasking, units, and assessment/rating features they touch.

**Goal:** A comprehensive set of *short* videos that a user can reach **on an as‑needs basis**, surfaced two ways:
1. **Context‑aware** — the app knows what page you're on and offers the relevant clips.
2. **Topic search & select** — the user searches by topic/keyword and picks.

Plus two anchor pieces:
- a **longer overview video** explaining campaign + section logic, workflow and features end‑to‑end, and
- an **interactive video "hub"** — a single overview with clickable links jumping to each component video.

> Status: draft for review. Routes, labels and flows below are taken from the current app (`apps/organising-db`) so the scripts match what users actually see.

---

## 0. Resolved decisions & production setup

These are locked from review and drive the rest of the plan.

| # | Decision | Consequence |
|---|---|---|
| 1 | **Fully automated capture** | Agent drives the browser, captures screen, AI‑voices the narration, assembles the clip (Section 3 tooling note). |
| 1 | **Target the `develop` deployment** | Record against **`https://offshore-alliance-git-develop-reveille-strategy.vercel.app`** (the `develop` branch Vercel Preview, Supabase DEV `dpnnmkhabysfdogllsyh`). **Never** local, **never** `main`/prod (`oa.uconstruct.app`). |
| 2 | **Library lives in‑app (production), videos exportable** | Recorded on **develop**, but the finished library is **served from production** (`https://oa.uconstruct.app`) via a `/help` route reading the manifest — **and** every clip is a downloadable/shareable file (Section 5.5). |
| 3 | **AI‑generated voice narration** | TTS from each clip's script; no human VO needed. Pick one consistent voice in the Production Kit. |
| 4 | **Demo data = the 3 dummy import files** | Use `apps/organising-db/public/excel_worker_import_dummy_1.xlsx` (and `_2`, `_3`) for the import clip and to seed the demo workforce. |
| 5 | **Keep all 18 + end‑card "Up next"** | Each clip ends with clickable shortcuts to logically connected clips (default: the rest of its series), playable from inside the player (Section 5.4). |

### 0.1 Two environments, two roles (read this first)

The two deployments play **different roles** in this project — don't conflate them:

| | **Capture / recording** | **Delivery / hosting** |
|---|---|---|
| Environment | `develop` preview — `https://offshore-alliance-git-develop-reveille-strategy.vercel.app` (Supabase DEV) | **Production** — `https://oa.uconstruct.app` (Supabase PROD) |
| Used for | Filming the screen walkthroughs against safe demo data | Where real users open the library (`/help`), and where finished clips are served/downloaded |
| Never | the place users consume the library | the place we record (no demo campaigns or test ratings in prod) |

**Why this is clean:** the video files are plain `.mp4` assets — environment‑agnostic. They're filmed on develop, stored in object storage, and referenced by `videoPath` in the manifest. The **library feature itself** (the `/help` route, player, context drawer, search) is application code that ships to production through the normal `develop → main` flow. So "record on develop, serve from prod" needs no duplication: finalize the clips → upload assets → merge the library code to `main` → it's live on `oa.uconstruct.app`.

### 0.2 Environment specifics (important)

The DEV database (`dpnnmkhabysfdogllsyh`) was cloned from prod with **base/reference data kept but all campaign data stripped**. Practically:

- **Already present in DEV:** employers, worksites, agreements, workers, occupations, projects, comms templates, planning lookups, and the 11 auth logins.
- **Empty in DEV:** campaigns, campaign plans/tasks, assessments, SOC sessions, call/email/phone activity, operational logs.

So:
- **The recording order doubles as demo seeding.** Series A is recorded first not just for narrative order but because A4 creates the **demo campaign** that every campaign‑scoped clip (B/C/D/E) then uses, and A3's import seeds the demo workforce inside it.
- **Use a dedicated, clearly‑named demo campaign** — `Acme Energy EBA 2026 — DEMO` (realistic on camera, obviously demo) — so recordings are reproducible and re‑runnable. Paired demo records: employer `Acme Energy Pty Ltd (DEMO)` (category Principal_Employer) and worksite `Acme FPSO Northstar (DEMO)` (type FPSO).
- Because base employer/worksite/worker data already exists, the A1/A2 clips **add new demo records** (don't rely on pre‑existing ones being camera‑ready).

### 0.3 Setup prerequisites before any clip is recorded (part of Stage 0)

1. **Develop preview URL (confirmed):** `https://offshore-alliance-git-develop-reveille-strategy.vercel.app`. This is the Vercel branch alias for `develop`, so it stays stable across redeploys — use it as the fixed base URL in every agent prompt.
2. Provision a **dedicated demo login** on DEV for the capture agent (one of the 11 logins, or a new one), with permissions to create campaigns and write ratings.
3. Confirm the 3 dummy xlsx files are reachable at `https://offshore-alliance-git-develop-reveille-strategy.vercel.app/excel_worker_import_dummy_{1,2,3}.xlsx`.
4. Decide the **AI narration voice** and lock it in the Production Kit.

---

## 1. Guiding principles

| Principle | What it means in practice |
|---|---|
| **Micro, not mega** | Each clip targets **60–180s**, one task, one outcome. Short clips are individually searchable and re‑usable; they slot into the context‑aware drawer without overwhelming the user. |
| **One task = one video** | "Add an employer" is its own clip even though it's small. Granularity is the feature, not a bug — it's what makes as‑needs access work. |
| **Real app, demo data** | Record against the live UI using a seeded demo campaign (no real worker PII). Reuse `excel_worker_import_dummy_*.xlsx` for the import clip. |
| **Consistent shell** | Every clip uses the same 3‑second branded intro, lower‑third title, terminology glossary, captions/transcript, and a 2‑second outro pointing to the hub. Defined once (the "Production Kit") and reused. |
| **Manual pathway framing** | Every setup clip explicitly shows the *manual create* choice and notes "this is the manual path; the guided wizard is covered separately." |
| **Built for retrieval** | Each video ships with a metadata record (tags, associated routes, chapter markers, transcript) so the same asset powers context‑aware surfacing, search, and the interactive hub. |

---

## 2. Recommended video catalogue

18 component videos in 5 series, plus the long overview and the interactive hub. IDs are stable handles used by the manifest (Section 5) and the agent prompts (Section 4).

### Series A — Set up a manual campaign (foundations)
| ID | Title | ~Length | Primary route | Outcome |
|---|---|---|---|---|
| `A1` | Add an employer | 90s | `/employers` → **Add Employer** | Create an employer record, set category & parent company |
| `A2` | Add worksites & link them to employers | 120s | `/worksites` → **Add Worksite** | Create a worksite, set Principal Employer vs Operator |
| `A3` | Import workers from a list (Excel) | 180s | `/workers` → **Import Workers** | Run the import wizard end‑to‑end |
| `A4` | Create a campaign — the manual way | 120s | `/campaigns` → **Create campaign** → **Manual create** → `/campaigns/new/manual` | Create the campaign record, land in Settings |
| `A5` | Configure a campaign from Settings | 150s | `/campaigns/[id]/settings` | Tour the settings accordion; fill the core sections |

### Series B — Campaign structure: units, groups, subgroups
| ID | Title | ~Length | Primary route | Outcome |
|---|---|---|---|---|
| `B1` | Organising units, groups & subgroups — explained | 150s | concept + `/campaigns/[id]?tab=workforce&sub=campaign-units` | Understand the model: units vs group containers vs members |
| `B2` | Create organising units and groups | 150s | **Create organising unit** dialog (single & group modes) | Build a unit; build a group with member subunits |
| `B3` | Allocate workers to units | 120s | wall chart / `StepAllocateWorkers` | Assign and reassign workers; handle multi‑unit workers |

### Series C — Wall charts
| ID | Title | ~Length | Primary route | Outcome |
|---|---|---|---|---|
| `C1` | The wall chart, explained | 120s | `/campaigns/[id]?tab=workforce&sub=wall-chart` | Read tiles, colours, badges, empty slots, sub‑units |
| `C2` | Filter, sort & switch views | 120s | wall‑chart filter bar + assessment selector | Narrow the chart; cumulative vs per‑assessment view |
| `C3` | Build a list and "fire" it | 150s | Build‑list panel | Drag workers/units into a list, pick a purpose, fire |

### Series D — Tasking from Workforce → wall charts
| ID | Title | ~Length | Primary route | Outcome |
|---|---|---|---|---|
| `D1` | Email tasking: fire a list, compose & send | 150s | `/campaigns/[id]/email/wizard` | From build list → email composer → send |
| `D2` | Phone tasking: build a call list & scripts | 180s | `/campaigns/[id]/phone`, `/phone/lists/new` | Create a call list, attach a script, set call order |
| `D3` | Phone tasking: running a calling session | 180s | `/campaigns/[id]/phone/call/[listId]` | Use the dialer, record outcomes, rate CTAs |
| `D4` | Activist tasking: task lists & the leader webform | 180s | task‑lists tab + `/leader/task/[token]` | Build an activist task list; what the leader sees |

### Series E — Assessments & ratings
| ID | Title | ~Length | Primary route | Outcome |
|---|---|---|---|---|
| `E1` | The rating scale, explained (1–5 + unassessed) | 90s | concept | Understand the 6 states and their colours |
| `E2` | Create and configure an assessment | 150s | `/campaigns/[id]?tab=workforce&sub=assessments` → **+ Add assessment** | Create from template/custom, binary vs 1–5, link ambitions |
| `E3` | Rate workers (single, bulk, cumulative) | 150s | wall chart + assessments table | Set ratings inline, bulk‑rate, read cumulative vs assessment |

### Anchor pieces
| ID | Title | ~Length | Type | Outcome |
|---|---|---|---|---|
| `OVERVIEW` | OffshoreAlliance campaigns: the big picture | 8–12 min | Long narrated overview | Campaign + section logic, end‑to‑end workflow, how features connect |
| `HUB` | Interactive how‑to map | Interactive | Clickable overview | A single screen that links to every clip above, by journey and by topic |

**Suggested learning path (for the hub's "guided" track):** `A1 → A2 → A3 → A4 → A5 → B1 → B2 → B3 → C1 → C2 → C3 → E1 → E2 → E3 → D1 → D2 → D3 → D4`. Assessments come before tasking because call/leader flows reference ratings.

---

## 3. Workflow management recommendation

**Recommendation: a hybrid "Production Kit + orchestrated fan‑out + synthesis" model — not a single mega‑prompt, and not a naive one‑prompt‑per‑video sweep.**

### Why not the obvious options
- **Single all‑encompassing prompt** ❌ — 18 clips + a long overview + an interactive build is far too much for one context. Quality, consistency and recoverability all collapse; one failure restarts everything.
- **Multiple sequential prompts, hand‑run** ❌ as the *primary* model — workable but slow and drifty: style, terminology and intro/outro conventions diverge clip‑to‑clip when each prompt re‑derives them. Fine as a *fallback*.
- **Pure sub‑agent fan‑out with no shared kit** ❌ — fast but produces 18 inconsistent clips that don't feel like one library.

### The recommended model (three stages)

**Stage 0 — Build the Production Kit once (1 focused session).**
Establish the shared spec every clip inherits: intro/outro, lower‑third style, brand colours, **terminology glossary** (e.g. "organising unit", "group container", the rating labels), demo‑data setup steps, narration tone, output format, caption/transcript requirement, and the **metadata schema** (Section 5). This is the single source of truth; lock it before any clip is produced.

**Stage 1 — Orchestrated fan‑out, one sub‑agent per clip (parallel within a series).**
Each clip is independent once the Kit exists, so spin up one sub‑agent per video. Each agent gets `Production Kit + that clip's spec card` (Section 4) and produces: recorded walkthrough, narration script, captions/transcript, chapter markers, and the metadata JSON record.
- **Sequence the *series*, parallelise *within* a series.** Produce Series A first (later clips reference a set‑up campaign and seeded workers), then B, C, E, then D. Within a series the clips are independent → run them concurrently.
- Each agent returns a structured result (file paths + metadata), so a failed clip re‑runs in isolation without touching the others.

**Stage 2 — Synthesis (1 agent, runs last).**
After all component clips exist, a single synthesis agent:
1. records/produces the **long overview** (`OVERVIEW`) — it can quote the now‑final clip titles and chapter structure;
2. builds the **interactive hub** (`HUB`) from the manifest, wiring clickable links to every clip;
3. validates the manifest (every clip has tags, routes, transcript, chapter markers) and flags gaps.

**Why this wins:** consistency comes from the Kit, speed comes from the fan‑out, the overview/hub are correct because they're built from finished assets, and any single clip is independently re‑runnable.

> **Production mode (decided): fully automated capture against the `develop` deployment.** An agent drives the *real* app in a browser (DOM‑aware navigation — faster/more reliable than pixel clicking), captures screen + cursor, generates **AI voice narration** from the script via TTS, and assembles clip + captions. Record at a fixed viewport (1920×1080). **The recording environment is the `develop` branch Vercel Preview deployment, backed by Supabase DEV (`dpnnmkhabysfdogllsyh`)** — never local, never `main`/production for *capture* (we don't create demo campaigns or test ratings in prod). The *finished* library is a separate concern — it's served from production (`oa.uconstruct.app`); see Section 0.1 for the capture‑vs‑delivery split and Section 0.2 for the consequences of DEV's data state.

---

## 4. Agent prompts

Rather than 18 divergent prompts, use **one master template** + a **per‑video spec card**. The complete prompt for any clip = `MASTER TEMPLATE` with the spec card's fields substituted in. This keeps every clip consistent and makes the library cheap to extend.

> **Ready‑to‑run versions:** all 18 cards are expanded into standalone, copy‑paste agent prompts (template pre‑merged, URL + demo records filled in). Two copies exist: the committed placeholder **[HOW_TO_VIDEOS_AGENT_PROMPTS.template.md](HOW_TO_VIDEOS_AGENT_PROMPTS.template.md)** and the credential‑filled working copy `docs/HOW_TO_VIDEOS_AGENT_PROMPTS.md` (gitignored — holds the DEV login). The template + cards below remain the source of truth if you need to edit or add clips. Recommended model for the clip agents: **Sonnet 4.6**; use **Opus 4.8** for the Production Kit, `OVERVIEW`, and `HUB`.

### 4.1 Master template (applies to every component clip)

```
ROLE
You are a technical how-to video producer for the OffshoreAlliance organising
database (Next.js app at apps/organising-db). You will produce ONE short
how-to video for the task defined in the SPEC CARD below.

INPUTS YOU INHERIT (the Production Kit)
- Brand intro (3s) and outro (2s) bumpers.
- Lower-third title style and on-screen callout style.
- Terminology glossary — use these exact terms; never invent synonyms.
- Demo environment: the `develop` Vercel Preview deployment ONLY (Supabase DEV),
  base URL https://offshore-alliance-git-develop-reveille-strategy.vercel.app .
  Never local, never main/production. Log in with the demo capture account and use
  the demo campaign "Acme Energy EBA 2026 — DEMO". Demo
  workforce comes from /excel_worker_import_dummy_{1,2,3}.xlsx. Treat all data as
  demo, but still avoid showing anything that looks like real personal info.
- One consistent AI narration voice (TTS), set in the Kit.
- Output + metadata spec (see OUTPUT below).

PRODUCTION STEPS
1. Open the app at the SPEC CARD's starting route. Set the browser viewport to
   1920x1080. Confirm you are in the demo workspace.
2. Perform the SPEC CARD's on-screen actions in order, slowly enough to follow.
   Move the cursor deliberately; pause ~1s on each key control before clicking.
3. Record screen + cursor for the whole flow.
4. Produce a narration script timed to the actions (see NARRATION). Keep it to
   the target length. Plain, friendly, instructional. No jargon outside the
   glossary; define a term the first time it appears.
5. Add on-screen callouts (arrows/highlights) for every button or field named
   in the script, using the exact UI label text in quotes.
6. Prepend the intro bumper + lower-third title; append the outro bumper with
   "More guides in the how-to hub."

NARRATION STRUCTURE (hit these beats)
- Hook (1 line): the task and why it matters.
- Context (1 line): where we are and how we got here (name the route/tab).
- Steps: one short sentence per action, matching the cursor.
- Recap (1 line): what was accomplished + the immediate next action.

OUTPUT (deliver all of these)
- video file: {ID}.mp4 — 1080p, H.264/AAC, self-contained and shareable (must
  play standalone outside the app; this is the exportable asset). Provide a
  sidecar {ID}.vtt caption track; a captions-burned-in variant is optional.
- transcript: {ID}.transcript.txt (full narration, timestamped).
- chapter markers: list of {time, label} for any step >20s.
- "Up next" end card: in the LAST 4-6s, show 2-3 clickable cards linking to the
  related clips in {UP_NEXT} (default: the other clips in this series, in path
  order; plus the obvious next-journey step). Render them as on-screen cards AND
  emit them in metadata (upNext) so the in-app player can make them clickable
  even on the burned-in version.
- metadata record (JSON) for the manifest:
  {
    "id": "{ID}",
    "title": "{TITLE}",
    "series": "{SERIES}",
    "durationSec": <actual>,
    "summary": "<1-2 sentences>",
    "tags": [ ... search keywords ... ],
    "associatedRoutes": [ ...glob patterns the app matches for context-aware surfacing... ],
    "prerequisites": [ ...video IDs... ],
    "upNext": [ ...video IDs shown on the end card... ],
    "chapters": [ {"t": 0, "label": "..."} ],
    "transcriptPath": "{ID}.transcript.txt",
    "videoPath": "{ID}.mp4"
  }

CONSTRAINTS
- Target length is a ceiling, not a floor — cut anything that doesn't serve the task.
- Manual pathway only. If the task has a wizard equivalent, say one sentence:
  "This is the manual path; the guided wizard is a separate guide."
- Use the EXACT button/label text from the SPEC CARD, in quotes, on screen and in narration.
- Stop and report if a labelled control isn't found (UI may have changed) instead of guessing.
```

### 4.2 Spec cards (substitute into the master template)

Each card gives the agent the route, the labelled controls, the action sequence, the narration beats, and retrieval metadata. Labels in quotes are the real UI strings.

---

**Spec card — `A1` Add an employer**
- **Start route:** `/employers`
- **Key file (for QA):** `apps/organising-db/src/components/overview/employers-tab.tsx`
- **Actions:** Click **"Add Employer"** → dialog opens. Fill **"Employer Name"** (required, red asterisk). Set **"Category"** (e.g. *Principal_Employer*). Show the **Parent Company** selector's three modes ("Standalone — no parent company" / "Select existing employer as parent" / "Create a new parent company"); pick *Standalone*. Optionally add Trading Name, ABN, State, Address. Click **"Save Employer"**. Show the new row in the table.
- **Narration beats:** Hook = "Employers are the companies your campaign organises against — start here." Call out that **"Save Employer"** stays disabled until a name is entered. Recap = "Next, add the worksites this employer operates."
- **Tags:** `employer, company, add employer, parent company, ABN, category, setup`
- **associatedRoutes:** `["/employers", "/employers/*"]`
- **Prerequisites:** none

---

**Spec card — `A2` Add worksites & link them to employers**
- **Start route:** `/worksites`
- **Key file:** `apps/organising-db/src/app/(dashboard)/worksites/page.tsx`
- **Actions:** Click **"Add Worksite"**. Fill **"Worksite Name"** (required). Pick **"Type"** (required; e.g. *FPSO*). Explain & set **"Principal Employer"** (asset owner — only Principal_Employer category appears) vs **"Operator"** (the running company). Leave **"Parent Worksite"** as *None (standalone)*. Optionally Basin / Location / Lat‑Long; toggle **"Offshore"**; leave **"Active"** checked. Click **"Save Worksite"**. Briefly show the **Map** view toggle.
- **Narration beats:** Distinguish Principal Employer vs Operator clearly — that's the part users get wrong. Note Lat/Long enables the map. Recap = "Now import the workforce."
- **Tags:** `worksite, site, platform, FPSO, principal employer, operator, map, offshore`
- **associatedRoutes:** `["/worksites", "/worksites/*"]`
- **Prerequisites:** `["A1"]`

---

**Spec card — `A3` Import workers from a list (Excel)**
- **Start route:** `/workers` → **"Import Workers"**
- **Key files:** `components/overview/workers-tab.tsx`, `components/import/worker-import-wizard.tsx`
- **Demo data:** three ready files exist — `excel_worker_import_dummy_1.xlsx` (primary, used on camera), `_2.xlsx`, `_3.xlsx` (spares for re‑takes / a second campaign). Record against `develop` so this import also seeds the demo workforce.
- **Actions:** Click **"Import Workers"**. Walk the 11 steps, pausing on each: **Upload** (use `excel_worker_import_dummy_1.xlsx`) → **Map Columns** (show auto‑mapping + one manual override) → **Map Values** (membership status) → **Assessments** (map an assessment column, or skip) → **Employer** (select the A1 employer) → **Worksites** (fuzzy‑match one site) → **Occupations** (fuzzy‑match one) → **Review Rows** (edit one cell inline) → **Dedup** (show update/skip/create) → **Confirm** → click **"Start Import"** → **Done**.
- **Narration beats:** Emphasise that columns auto‑map and the user only fixes exceptions; explain dedup matches on reference ID / email / phone. This is the longest clip — add chapter markers per step. Recap = "Your workforce is in; now create the campaign."
- **Tags:** `import, workers, excel, spreadsheet, upload, column mapping, dedup, members`
- **associatedRoutes:** `["/workers", "/workers/*"]`
- **Prerequisites:** `["A1", "A2"]`

---

**Spec card — `A4` Create a campaign — the manual way**
- **Start route:** `/campaigns`
- **Key files:** `campaigns/page.tsx`, `campaigns/new/manual/page.tsx`
- **Actions:** Click **"Create campaign"** → dialog shows two options. Call out the divergence: choose **"Manual create"** (NOT **"Campaign wizard"**). On `/campaigns/new/manual` fill **"Name"** (e.g. *Acme EBA 2026*), set **"Campaign type"** (*Bargaining*) and **"Status"** (*Planning*), optionally pick an **"Organiser"**. Click **"Create and open settings"** → land on `/campaigns/[id]/settings`.
- **Narration beats:** Explicit: "We're taking the manual path — create the record instantly, then configure each section at your own pace. The guided wizard is a separate guide." Recap = "Next: configure the campaign from Settings."
- **Tags:** `create campaign, manual, new campaign, bargaining, campaign type, status`
- **associatedRoutes:** `["/campaigns", "/campaigns/new/manual"]`
- **Prerequisites:** `["A1", "A2", "A3"]`

---

**Spec card — `A5` Configure a campaign from Settings**
- **Start route:** `/campaigns/[id]/settings`
- **Key file:** `components/campaigns/campaign-settings.tsx`
- **Actions:** Tour the accordion: **Basics**, **Employers & Worksites**, **Agreements**, **Worker Estimate**, **Organising Units**, **Workers**, **Ambitions**. Open **Basics**, set Description / Start Date / Plan Timeframe; **"Save Basics"**. Open **Employers & Worksites**, attach the A1/A2 records. Note each section saves independently (toast "Campaign … saved.").
- **Narration beats:** The mental model — "Settings is your campaign's control panel; fill sections in any order." Point to Organising Units & Workers as "covered in their own guides." Recap = "With the campaign configured, let's structure the workforce."
- **Tags:** `campaign settings, configure, accordion, basics, ambitions, worker estimate`
- **associatedRoutes:** `["/campaigns/*/settings"]`
- **Prerequisites:** `["A4"]`

---

**Spec card — `B1` Organising units, groups & subgroups — explained**
- **Type:** concept + light UI tour. **Route shown:** `/campaigns/[id]?tab=workforce&sub=campaign-units`
- **Backing model (for accuracy):** `campaign_organising_units` (`ou_type`, `is_group_container`, `parent_ou_id`, `ou_group_id`); workers attach via `campaign_worker_ou`.
- **Narration beats (the teaching script):**
  - An **organising unit (OU)** is a defined group of workers you organise as a block — by **shift, department, worksite, crew rotation, work area, network, ethnic community, accommodation, job type, or custom**.
  - A **group container** is a *named header* that bundles several units of the same type (e.g. "Early Shifts"). **Workers are never assigned to a group container** — only to its **member units (subgroups)**.
  - **Exclusivity rule:** a worker can be in only **one group per unit‑type** in a campaign (you can't be in both Shift‑A and Shift‑B). Show this with a simple diagram.
  - Where it lives: the **Campaign Units** sub‑tab and the wall chart.
- **Tags:** `organising unit, OU, group, subgroup, container, shift, department, structure, hierarchy`
- **associatedRoutes:** `["/campaigns/*"]` (concept — low priority weight so it doesn't crowd context surfacing)
- **Prerequisites:** none

---

**Spec card — `B2` Create organising units and groups**
- **Start route:** Campaign → Workforce → **Campaign Units** sub‑tab → **"Create organising unit"**
- **Key file:** `components/campaigns/wall-chart/create-organising-unit-dialog.tsx`
- **Actions:** Open the dialog; show the **single vs group** mode toggle. *Single:* enter Name, pick Type, set Estimated workers, optional Anchor worker → create. *Group:* enter Group name, pick Type, set number of members, name each member unit, choose placement, optionally assign workers → review → **"Add group with X units"**. Show both appear in the wall chart, the group rendered as a header with members nested.
- **Narration beats:** Tie back to B1 — "single unit for a one‑off block; group when you have several units of the same type." Recap = "Next, put workers into these units."
- **Tags:** `create unit, create group, organising unit, group container, member units, wall chart`
- **associatedRoutes:** `["/campaigns/*"]`
- **Prerequisites:** `["B1"]`

---

**Spec card — `B3` Allocate workers to units**
- **Start route:** wall chart / Settings → **Workers** (`StepAllocateWorkers`)
- **Actions:** From a unit header choose **"Assign workers"**; multi‑select workers; mark a **primary** assignment for a worker in multiple units; confirm. Then on the wall chart show **drag** a worker tile to another unit, and **Shift+drag** to copy. Show the multi‑unit indicator on a tile.
- **Narration beats:** Explain primary vs additional assignment, and that a tile can live in multiple units. Recap = "Your workforce is now structured — time to read the wall chart."
- **Tags:** `allocate workers, assign, drag and drop, multi-unit, primary unit`
- **associatedRoutes:** `["/campaigns/*"]`
- **Prerequisites:** `["B2"]`

---

**Spec card — `C1` The wall chart, explained**
- **Start route:** `/campaigns/[id]?tab=workforce&sub=wall-chart`
- **Key files:** `campaign-wall-chart.tsx`, `wall-chart/campaign-unit-card.tsx`, `wall-chart/worker-tile.tsx`
- **Actions / narration:** Tour one **unit card** (name, type, worker count, estimate). Decode a **worker tile**: initials/name, **rating colour**, role badge (Contact/Activist/Delegate), non‑OA union badge, multi‑unit indicator, "in build list" check, hover phone/email icons. Explain **empty/greyed slots** (unfilled estimate) and **nested sub‑unit** cards. Click a tile to open the worker detail sheet.
- **Tags:** `wall chart, tiles, colours, badges, worker card, unit card, empty slots`
- **associatedRoutes:** `["/campaigns/*"]` (high weight when `sub=wall-chart`)
- **Prerequisites:** `["B1", "E1"]` (colours = ratings)

---

**Spec card — `C2` Filter, sort & switch views**
- **Start route:** wall chart filter bar
- **Key files:** `wall-chart/wall-chart-filter-bar.tsx`, `wall-chart/assessment-selector.tsx`
- **Actions:** Apply filters (membership, employer, worksite, roles, occupations, rating). Use the **assessment selector** to switch **"Cumulative rating"** vs a specific assessment (watch tiles recolour; unassessed go grey). Toggle **"Wall chart"** vs **"List"** view.
- **Narration beats:** "Filters answer questions — e.g. 'show me unrated workers on Shift A.'" Explain cumulative vs per‑assessment. Recap = "Once you've found a cohort, build a list from it."
- **Tags:** `filter, sort, list view, cumulative rating, assessment view, search workers`
- **associatedRoutes:** `["/campaigns/*"]`
- **Prerequisites:** `["C1"]`

---

**Spec card — `C3` Build a list and "fire" it**
- **Start route:** wall chart → **Build list** panel (ListPlus icon)
- **Actions:** Open the **"Build list"** panel. Name it (placeholder *"e.g. EBA voting push — Day shift"*). Drag a worker tile in; drag a **unit card header** to add a whole unit; show **Shift+drag** copy. Set **"Purpose"** (Email / Phone / Activist task) and read the hint ("Drives early warnings … not enforced"). Note the leader slot appears for *Activist task*. Click **Fire** — explain each purpose routes to a different pathway (the three Series D videos).
- **Narration beats:** This is the hinge between the wall chart and all tasking. End by pointing to D1/D2/D4. Recap = "Pick a purpose, fire, and you're in the email/phone/activist flow."
- **Tags:** `build list, fire, drag, purpose, email, phone, activist task, recipients`
- **associatedRoutes:** `["/campaigns/*"]`
- **Prerequisites:** `["C1"]`

---

**Spec card — `D1` Email tasking: fire a list, compose & send**
- **Start route:** Fire **"Email"** from build list → `/campaigns/[id]/email/wizard?...&entry_branch=build_list`
- **Key file:** `components/email/composer/EmailComposer`
- **Actions:** Show the recipient list already attached (filtered to workers with email). Fill **Subject** and **Body** in the editor; **Preview**; **Save as draft**; then **Send**. Briefly show creating a list manually at `/campaigns/[id]/email/lists/new` as the alternative entry.
- **Narration beats:** "Firing 'Email' carries your wall‑chart selection straight into the composer." Note workers without an email are dropped (the early warning). Recap = "Recipients sorted, message sent."
- **Tags:** `email, compose, send, recipients, draft, comms, broadcast`
- **associatedRoutes:** `["/campaigns/*/email/*"]`
- **Prerequisites:** `["C3"]`

---

**Spec card — `D2` Phone tasking: build a call list & scripts**
- **Start route:** `/campaigns/[id]/phone` (Phone Operations hub) and `/phone/lists/new`
- **Key files:** `campaigns/[id]/phone/page.tsx`, `phone/lists/new`
- **Actions:** Tour the hub (Call Scripts, Active Call Lists with progress bars, Report). Click **"New Call List"** → 5‑step wizard: **List Details** → **Build List** (filters + preview count) → **Call Order** (Sequential / By Rating / By Assessment Rating / Least Recently Contacted / Random; drag to reorder rating buckets) → **Attach Script** (select existing or **"Create New Script"**) → **Confirm** → **"Create & Start Calling"** or **"Create & Manage Later"**.
- **Narration beats:** Explain call‑order strategy choices and why rating‑ordered calling matters. Recap = "List + script ready — next, make the calls."
- **Tags:** `phone, call list, script, call order, priority, dialer setup`
- **associatedRoutes:** `["/campaigns/*/phone", "/campaigns/*/phone/lists/*", "/campaigns/*/phone/scripts/*"]`
- **Prerequisites:** `["C3"]`

---

**Spec card — `D3` Phone tasking: running a calling session**
- **Start route:** **"Call"** on a list card → `/campaigns/[id]/phone/call/[listId]`
- **Key file:** `components/phone/CallSessionPage.tsx`
- **Actions:** Tour the calling UI: **contact card** (name, worksite, shift, phone, current rating), **ConversationStepper** (script sections), the **dial outcome bar** ("No answer" / "Voicemail left" / "Wrong number" / "Call back" / "Spoke to…" / "Messaging"). Show the **Script / Objections / Issues** side panels, **CTA Ratings** and **Assessment Ratings** panels, **call notes**, then **record outcome** → **next contact**.
- **Narration beats:** Walk one full call: dial → talk through script → log outcome → rate the CTA → notes → next. Recap = "Every call is logged and feeds the report and ratings."
- **Tags:** `calling, dialer, call session, outcome, voicemail, CTA rating, notes`
- **associatedRoutes:** `["/campaigns/*/phone/call/*", "/campaigns/*/phone/live"]`
- **Prerequisites:** `["D2"]`

---

**Spec card — `D4` Activist tasking: task lists & the leader webform**
- **Start route:** Fire **"Activist task"** → `CreateTaskListDialog`; management at `/campaigns/[id]?tab=plan&sub=task-lists`; leader view `/leader/task/[token]`
- **Key files:** `task-lists/create-task-list-dialog.tsx`, `campaign-task-lists.tsx`, `leader/task/[token]/page.tsx`
- **Actions:** Walk the 5‑step dialog: **Anchor** (From leader / activity / workers) → **Leader** (pick a worker leader or organiser) → **Activity** (select or create; note **activist‑assessed** = the leader rates workers) → **Workers** (pick followers) → **Options** ("Include membership ask"; Save as draft / Activate now). Show the task list row + **"Send to leader"**, then switch to the **leader webform**: the worker rating table, membership column, "add another worker", **"Submit ratings"**.
- **Narration beats:** Explain the leader‑led model — you assign a leader a list of co‑workers to assess/recruit, and they complete it on a simple web form. Recap = "Ratings the leader submits flow straight back into the campaign."
- **Tags:** `activist, task list, leader, webform, delegate, membership ask, peer assessment`
- **associatedRoutes:** `["/campaigns/*", "/leader/task/*"]`
- **Prerequisites:** `["C3", "E1"]`

---

**Spec card — `E1` The rating scale, explained**
- **Type:** concept. **Backing model:** `rating_level` table.
- **Narration beats (the teaching script):** Six states —
  - **0 / Unassessed** (grey) — no rating yet; surfaced as an explicit state, not "missing".
  - **1 / Supportive leader** (sky blue) — actively brings others along.
  - **2 / Supporter** (green) — supports but isn't organising others.
  - **3 / Neutral** (amber) — undecided / not engaged.
  - **4 / Opposed** (red) — individually opposed.
  - **5 / Oppositional leader** (dark red) — actively organises against.
  Stress that **Unassessed is a real, visible category** (you can't act on what you haven't measured) and that the same colours mean the same thing everywhere in the app.
- **Tags:** `rating, scale, supportive leader, supporter, neutral, opposed, unassessed, colours`
- **associatedRoutes:** `["/campaigns/*"]` (low weight)
- **Prerequisites:** none

---

**Spec card — `E2` Create and configure an assessment**
- **Start route:** `/campaigns/[id]?tab=workforce&sub=assessments` → **"+ Add assessment"**
- **Key file:** `components/campaigns/campaign-assessments.tsx`
- **Actions:** Click **"+ Add assessment"**. Choose **"From template"** (or Custom). Set **Title** and **Description**. Toggle **Binary outcome?** (off = 1–5 scale; on = e.g. *attended / did not attend*, set **supporter outcome value**). Optionally **link to ambitions** and mark one primary. Optionally set custom rating labels. Click **"Create assessment"**. Show the new assessment with its rating table and distribution chart.
- **Narration beats:** Frame an assessment as "a snapshot of worker support for a specific question or activity." Explain binary vs scale and the ambition link (rollup). Recap = "Assessment created — now rate your workers."
- **Tags:** `assessment, create assessment, template, binary, scale, ambition link, snapshot`
- **associatedRoutes:** `["/campaigns/*"]` (high weight when `sub=assessments`)
- **Prerequisites:** `["E1"]`

---

**Spec card — `E3` Rate workers (single, bulk, cumulative)**
- **Start route:** wall chart (assessment mode) + assessments table
- **Key files:** `wall-chart/inline-rating-popover.tsx`, `rating-picker.tsx`, `assessment-selector.tsx`
- **Actions:** In the assessment table, click a worker's rating cell → picker → choose e.g. **"1 — Supportive leader"** (saves immediately). Select several workers → **bulk rating** dropdown → apply to all. Show **"Seed ratings from attributes"** briefly. Switch to the wall chart: click a tile → **inline rating popover** → set rating (tile recolours). Use the assessment selector to compare **cumulative** vs the specific assessment.
- **Narration beats:** Show the three ways to rate (inline, bulk, on the chart) and how cumulative differs from a single assessment. Recap = "Ratings drive the colours, the filters, the call order, and your strength snapshots."
- **Tags:** `rate workers, rating, bulk rate, inline, cumulative, assessment ratings, colours`
- **associatedRoutes:** `["/campaigns/*"]`
- **Prerequisites:** `["E1", "E2"]`

---

### 4.3 Prompt for the long overview (`OVERVIEW`)

```
ROLE
Produce an 8-12 minute narrated overview of the OffshoreAlliance organising
database for a new organiser, covering campaign + section logic, the end-to-end
workflow, and how the major features connect. This is the "big picture" piece,
not a click-by-click how-to — keep each feature to ~30-60s and link out (verbally
and via on-screen chapter labels) to the detailed clips.

INHERIT the Production Kit (intro/outro, glossary, demo data, metadata spec).

STRUCTURE (chaptered; each chapter becomes a clickable marker in the hub)
1. What a campaign is, and the manual vs wizard paths (we use manual here).
2. The setup spine: employers -> worksites -> import workers -> create campaign
   -> configure in Settings.  (point to A1-A5)
3. Structuring the workforce: organising units, groups, subgroups. (point to B1-B3)
4. The wall chart as the campaign's operational picture. (point to C1-C3)
5. Assessing support: the rating scale + assessments. (point to E1-E3)
6. Turning the picture into action: building lists and firing Email / Phone /
   Activist tasking. (point to D1-D4)
7. How it all loops: ratings from tasking flow back to the wall chart and
   strength snapshots.

REQUIREMENTS
- Use the FINAL titles and chapter labels of the component clips (produced first).
- Emit chapter markers {t, label, linkedVideoId} so the hub can deep-link.
- Deliver video + timestamped transcript + metadata record (series "OVERVIEW").
```

### 4.4 Prompt for the interactive hub (`HUB`)

```
ROLE
Build an interactive "how-to hub": a single screen the user opens from the app
that maps the whole video library and lets them jump to any clip.

INPUTS
- The video manifest (all component clips + OVERVIEW), each with id, title,
  series, summary, tags, durationSec, chapters, associatedRoutes, prerequisites.

REQUIREMENTS
1. Two organising views the user can switch between:
   a) "By journey" — the guided path A->B->C->E->D as a numbered flow, each node
      a clickable card that plays the clip in place.
   b) "By topic" — a searchable, tag-faceted grid (search box filters on
      title + tags + transcript text).
2. Embed the OVERVIEW video at the top with its chapter list; each chapter is a
   clickable link that deep-links to the corresponding component clip.
3. Every card shows title, length, one-line summary, and prerequisites (as links).
4. Respect context: accept an optional ?route= param; when present, sort/elevate
   clips whose associatedRoutes match (this is the same matching the in-app
   context-aware drawer uses — see Section 5).
5. Keep it self-contained and data-driven: render entirely from the manifest so
   adding a clip = adding a manifest entry, no hand-editing.
6. Accessible: keyboard navigable, captions on, transcripts linked.
7. Player must render each clip's "Up next" end card (from manifest `upNext`) as
   clickable cards that load the next clip in place.
8. Every clip and the OVERVIEW expose a "Download / Share" action that serves the
   standalone exportable .mp4 (Section 5.5).

DELIVERABLE
- The hub implementation (route/page or standalone) + a short note on where it
  reads the manifest from.
```

---

## 5. Delivery & accessibility architecture

All three access modes are powered by **one artefact: the video manifest** (an array of the metadata records each agent emits). Build it once; everything reads from it.

### 5.1 Manifest record (per video)
```jsonc
{
  "id": "A3",
  "title": "Import workers from a list (Excel)",
  "series": "A",
  "durationSec": 178,
  "summary": "Run the worker import wizard end to end — upload, map, dedup, import.",
  "tags": ["import","workers","excel","upload","column mapping","dedup"],
  "associatedRoutes": ["/workers", "/workers/*"],
  "routeWeight": 10,            // higher = surface more strongly on a route match
  "prerequisites": ["A1","A2"],
  "upNext": ["A4","A2","A1"],   // end-card links: next-journey step, then rest of series
  "chapters": [ { "t": 0, "label": "Upload the file" }, ... ],
  "transcriptPath": "A3.transcript.txt",
  "videoPath": "A3.mp4",
  "downloadable": true          // exportable/shareable standalone (Section 5.5)
}
```

### 5.2 Context‑aware surfacing
A small **help drawer** in the app reads the **current route** and matches it against each video's `associatedRoutes` (glob match), ranks by `routeWeight`, and shows the top few "Guides for this page." Example: on `/workers` it elevates `A3`; on a campaign's `sub=wall-chart` it elevates `C1`/`C2`/`C3`. Concept clips (B1, E1) get low weight so they inform without crowding. This reuses the exact matching the hub's `?route=` mode uses, so behaviour is consistent.

### 5.3 Topic search & select
Index `title + summary + tags + transcript` for each record. A search box (in the drawer and in the hub's "By topic" view) returns ranked clips. Transcripts make search find a clip even when the user's words differ from the title (e.g. searching "spreadsheet" finds the Excel import clip).

### 5.4 End‑card "Up next" & related videos
Every clip ends (last 4–6s) with **clickable "Up next" cards**, driven by the `upNext` list in the manifest. Default logic: **the next step in the guided journey, then the rest of the same series** (so an "A" clip surfaces the other "A" clips). The in‑app player renders these as real, clickable overlays that load the next clip without leaving the page; on the exported standalone file they appear as a visual end card (and the player makes them clickable when played in‑app). This is what lets a user stay in flow — finish "Add an employer" and jump straight to "Add worksites." `upNext` is editable per clip, so a video can point somewhere non‑obvious when it makes sense (e.g. `C3` → `D1`/`D2`/`D4`).

### 5.5 In‑app library **and** exportable videos
- **In‑app (production):** a `/help` (or "Guides") route in `apps/organising-db` renders the library from the manifest — the hub view, the context‑aware drawer, and an embedded player. This is the primary home, and it is **live to users on production (`https://oa.uconstruct.app`)**. The route also exists on `develop` for testing, but production is where users consume it.
- **Promotion flow (record on develop → serve on prod):** the clips are filmed on develop, but the assets and the library code reach prod the normal way — (1) finalize clips, (2) upload the `.mp4`/`.vtt` assets to the shared object‑storage bucket, (3) commit the manifest + library code, (4) merge `develop → main` so it deploys to `oa.uconstruct.app`. Because the videos are environment‑agnostic files referenced by URL, **no re‑recording or per‑environment duplication is needed** — both deployments read the same manifest/bucket.
- **Storage:** keep master files in object storage (e.g. a Supabase Storage bucket) referenced by `videoPath`; serve the same URLs from both environments so a clip recorded on develop plays unchanged on prod.
- **Exportable/shareable:** each `{ID}.mp4` is a **self‑contained 1080p H.264 file that plays anywhere** (with its `.vtt` captions), so a user can download a clip and send it directly (email, chat) without app access. The library UI exposes a **"Download / Share"** action per clip (and per the `OVERVIEW`); the Download action serves the same stored file the player streams.

### 5.6 Interactive hub
The `HUB` deliverable (Section 4.4) renders the manifest as the "By journey" flow + "By topic" grid, with the embedded `OVERVIEW` whose chapter markers deep‑link into component clips.

---

## 6. Phasing / rollout

| Phase | What | Output |
|---|---|---|
| **0. Production Kit** | Lock intro/outro, glossary, demo data, output + manifest spec | The Kit + empty manifest schema |
| **1. Series A** | A1–A5 (setup spine; needed by later clips) | 5 clips + records |
| **2. Series B & E concepts** | B1–B3, E1–E3 (structure + ratings; referenced by C/D) | 6 clips + records |
| **3. Series C** | C1–C3 (wall chart) | 3 clips + records |
| **4. Series D** | D1–D4 (tasking) | 4 clips + records |
| **5. Synthesis** | `OVERVIEW` + `HUB`, manifest validation | Overview video, interactive hub, complete manifest |
| **6. In‑app wiring** | `/help` route + player (clickable end cards), context drawer, search index, Download/Share action — all reading the manifest. Built/tested on `develop` | As‑needs access working on develop + exportable clips |
| **7. Promote to production** | Upload assets to the storage bucket; merge `develop → main` so the library deploys to `oa.uconstruct.app` (Section 5.5) | Library **live to real users on production** |

**Definition of done for the library:** every component clip ≤ its length ceiling; every clip has tags, `associatedRoutes`, `upNext`, chapter markers and a transcript; each `.mp4` plays standalone and is downloadable; the manifest validates; the hub deep‑links every clip; the player renders clickable "Up next" end cards; the context drawer surfaces the right clips on each mapped route.

---

## 7. Decisions — resolved

All five review decisions are locked; see **Section 0** for detail and consequences.

1. **Production tooling** → Fully automated capture against the **`develop`** deployment.
2. **Where the library lives** → **In‑app** (`/help` route) **and** every clip **exportable/shareable** (Section 5.5).
3. **Voice** → **AI‑generated** narration (one consistent TTS voice).
4. **Demo data** → the **3 dummy import files** in `apps/organising-db/public`; recording order seeds the rest (Section 0.2).
5. **Catalogue size** → **Keep all 18**, plus **end‑card "Up next"** related‑clip shortcuts in the player (Section 5.4).

Capture happens on **develop**; the finished library is served from **production** (`oa.uconstruct.app`) — see Section 0.1. Remaining setup items to confirm before Stage 0 are listed in **Section 0.3** (demo login chiefly; URL and files already confirmed).
