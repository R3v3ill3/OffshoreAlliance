# How‑To Video Library — Standalone Agent Prompts

Ready‑to‑run prompts, one per component clip (18 total). Each is **self‑contained**: hand it to a capture agent as‑is. Strategy, manifest schema and the OVERVIEW/HUB prompts live in [HOW_TO_VIDEOS_WORKPLAN.md](HOW_TO_VIDEOS_WORKPLAN.md).

> **This is the committed TEMPLATE** (placeholders only). The runnable, credential-filled copy is `docs/HOW_TO_VIDEOS_AGENT_PROMPTS.md`, which is **gitignored** — put real credentials only there, never in this file.

## Before you run
1. **Find‑replace credentials** in the working copy: set `{{DEMO_LOGIN_EMAIL}}` and `{{DEMO_LOGIN_PASSWORD}}` to the DEV demo capture account (a DEV login that can create campaigns and write ratings).
2. **Model:** run each clip agent on **Sonnet 4.6**. (Use Opus 4.8 only for the Production Kit, the `OVERVIEW`, and the `HUB` — see the workplan.)
3. **Recording order (data dependencies):** Series **A → B → E → C → D**. A4 creates the demo campaign; A3 seeds the workforce; E2/E3 create the ratings that must exist before the wall‑chart clips (C) show colour. (Learning order shown to users is A→B→C→E→D — that's the journey, not the filming order.)
4. **Environment:** record on the **develop** preview only — `https://offshore-alliance-git-develop-reveille-strategy.vercel.app`. Never local, never production.
5. Within a series the clips are independent → safe to run concurrently.

## Shared demo records (use consistently)
- Employer: **Acme Energy Pty Ltd (DEMO)** — category `Principal_Employer`
- Worksite: **Acme FPSO Northstar (DEMO)** — type `FPSO`, Offshore = on
- Campaign: **Acme Energy EBA 2026 — DEMO** — type Bargaining, status Planning
- Import file: `excel_worker_import_dummy_1.xlsx` (spares `_2`, `_3`)

## Keeping the password out of version control (already set up)
Two copies exist by design:
- **This template** (`…AGENT_PROMPTS.template.md`) — placeholders only, **committed**.
- **The working copy** (`…AGENT_PROMPTS.md`) — credential-filled, **gitignored** (entry added in `.gitignore`).
Work from the gitignored copy; keep this template clean. The credential is for the **DEV/preview** environment only — never reuse it for production, and rotate it if it leaks.

---

# SERIES A — Set up a manual campaign

## A1 — Add an employer

```
You are a technical how-to video producer for the OffshoreAlliance organising
database (Next.js app, apps/organising-db). Produce ONE short how-to video titled
"Add an employer" (target <= 90s). Work fully autonomously: drive the app in a
browser, capture screen + cursor, generate AI voice narration, assemble the clip.

ENVIRONMENT (recording only)
- Base URL: https://offshore-alliance-git-develop-reveille-strategy.vercel.app
  (develop preview, Supabase DEV). NEVER local, NEVER production.
- Log in: {{DEMO_LOGIN_EMAIL}} / {{DEMO_LOGIN_PASSWORD}}
- Viewport 1920x1080. One consistent AI narration voice. Treat all data as demo
  but avoid showing anything resembling real personal info.

PRODUCTION KIT (inherited)
- 3s branded intro + lower-third title "Add an employer"; 2s outro "More guides in
  the how-to hub."
- Callout (arrow/highlight) on every named control, using the EXACT label in quotes.
- Glossary terms used verbatim; define a term the first time it appears.

PREREQUISITE STATE
- Logged in, sitting on /employers. (This clip creates the demo employer.)

STARTING POINT
- Navigate to /employers.

ON-SCREEN ACTIONS (in order; ~1s pause on each key control)
1. Click "Add Employer" — the dialog opens.
2. In "Employer Name" (required, red asterisk) type: Acme Energy Pty Ltd (DEMO).
3. Set "Category" to Principal_Employer.
4. Open the Parent Company selector; show its three modes ("Standalone — no parent
   company" / "Select existing employer as parent" / "Create a new parent
   company"); leave it on "Standalone — no parent company".
5. Optionally fill "Trading Name", "ABN", "State", "Address" with demo values.
6. Click "Save Employer".
7. Show the new employer appearing as a row in the table.

NARRATION (AI voice, timed to actions; <= 90s)
- Hook: "Employers are the companies your campaign organises against — so this is
  where setup begins."
- Context: "We're on the Employers page; one button does it all."
- Steps: one short sentence per action above. Call out that "Save Employer" stays
  disabled until you enter a name, and that an employer can sit under a parent
  company when you map corporate groups.
- Recap: "That's your employer created. Next, add the worksites it operates."

END CARD "UP NEXT" (last 4-6s) — clickable cards to:
- A2 "Add worksites & link them to employers"
- A3 "Import workers from a list"
- A4 "Create a campaign — the manual way"

DELIVERABLES
- A1.mp4 (1080p H.264/AAC, self-contained & shareable) + sidecar A1.vtt captions.
- A1.transcript.txt (full timestamped narration).
- chapter markers for any step > 20s.
- manifest record (JSON):
  {"id":"A1","title":"Add an employer","series":"A","durationSec":<actual>,
   "summary":"Create an employer record, set its category and (optional) parent company.",
   "tags":["employer","company","add employer","parent company","ABN","category","setup"],
   "associatedRoutes":["/employers","/employers/*"],"routeWeight":10,
   "prerequisites":[],"upNext":["A2","A3","A4"],
   "chapters":[{"t":0,"label":"Add Employer"}],
   "transcriptPath":"A1.transcript.txt","videoPath":"A1.mp4","downloadable":true}

CONSTRAINTS
- Manual pathway only. Use EXACT button/label text in quotes on screen and in
  narration. Length is a ceiling — cut anything that doesn't serve the task.
- If a labelled control isn't found, STOP and report (UI may have changed); don't guess.
```

## A2 — Add worksites & link them to employers

```
You are a technical how-to video producer for the OffshoreAlliance organising
database (Next.js app, apps/organising-db). Produce ONE short how-to video titled
"Add worksites & link them to employers" (target <= 120s). Work fully autonomously:
drive the app in a browser, capture screen + cursor, generate AI voice narration,
assemble the clip.

ENVIRONMENT (recording only)
- Base URL: https://offshore-alliance-git-develop-reveille-strategy.vercel.app
  (develop preview, Supabase DEV). NEVER local, NEVER production.
- Log in: {{DEMO_LOGIN_EMAIL}} / {{DEMO_LOGIN_PASSWORD}}
- Viewport 1920x1080. One consistent AI narration voice. Demo data only.

PRODUCTION KIT (inherited)
- 3s intro + lower-third "Add worksites"; 2s outro "More guides in the how-to hub."
- Callout on every named control using the EXACT label in quotes. Glossary verbatim.

PREREQUISITE STATE
- The employer "Acme Energy Pty Ltd (DEMO)" (category Principal_Employer) exists
  (from A1) so it appears in the Principal Employer dropdown.

STARTING POINT
- Navigate to /worksites.

ON-SCREEN ACTIONS (in order)
1. Click "Add Worksite" — the dialog opens.
2. In "Worksite Name" (required) type: Acme FPSO Northstar (DEMO).
3. Set "Type" (required) to FPSO.
4. Set "Principal Employer" to Acme Energy Pty Ltd (DEMO). Note on screen: only
   employers in the Principal_Employer category appear here (the asset owner).
5. Set "Operator" to any employer. Note: the Operator is the company that runs the
   site day to day — often different from the Principal Employer.
6. Leave "Parent Worksite" on "None (standalone)".
7. Optionally fill "Basin", "Location Description", "Latitude", "Longitude".
8. Tick "Offshore"; leave "Active" checked.
9. Click "Save Worksite".
10. Show the new row, then briefly toggle the "Map" view to show the site plotted.

NARRATION (AI voice; <= 120s)
- Hook: "Worksites are where the work actually happens — platforms, FPSOs, plants."
- Context: "One Add Worksite button, and one distinction worth getting right."
- Steps: one sentence per action. Spend an extra beat on Principal Employer (asset
  owner) vs Operator (runs the site) — that's the field people mix up. Note that
  adding latitude/longitude is what places the site on the map.
- Recap: "Worksite created and linked. Next, bring in the workforce."

END CARD "UP NEXT" — clickable cards to:
- A3 "Import workers from a list"
- A1 "Add an employer"
- A4 "Create a campaign — the manual way"

DELIVERABLES
- A2.mp4 + A2.vtt; A2.transcript.txt; chapter markers for steps > 20s.
- manifest record:
  {"id":"A2","title":"Add worksites & link them to employers","series":"A","durationSec":<actual>,
   "summary":"Create a worksite and set its Principal Employer vs Operator; plot it on the map.",
   "tags":["worksite","site","platform","FPSO","principal employer","operator","map","offshore"],
   "associatedRoutes":["/worksites","/worksites/*"],"routeWeight":10,
   "prerequisites":["A1"],"upNext":["A3","A1","A4"],
   "chapters":[{"t":0,"label":"Add Worksite"}],
   "transcriptPath":"A2.transcript.txt","videoPath":"A2.mp4","downloadable":true}

CONSTRAINTS
- Manual pathway only. EXACT labels in quotes. Length is a ceiling.
- If a labelled control isn't found, STOP and report; don't guess.
```

## A3 — Import workers from a list (Excel)

```
You are a technical how-to video producer for the OffshoreAlliance organising
database (Next.js app, apps/organising-db). Produce ONE short how-to video titled
"Import workers from a list" (target <= 180s — the longest clip; add chapters).
Work fully autonomously: drive the app, capture screen + cursor, AI voice narration,
assemble the clip.

ENVIRONMENT (recording only)
- Base URL: https://offshore-alliance-git-develop-reveille-strategy.vercel.app
  (develop preview, Supabase DEV). NEVER local, NEVER production.
- Log in: {{DEMO_LOGIN_EMAIL}} / {{DEMO_LOGIN_PASSWORD}}
- Viewport 1920x1080. One consistent AI narration voice. Demo data only.

PRODUCTION KIT (inherited)
- 3s intro + lower-third "Import workers from a list"; 2s outro "More guides in the
  how-to hub." Callout on every named control (EXACT labels in quotes). Glossary verbatim.

PREREQUISITE STATE
- The demo employer (A1) and worksite (A2) exist. The import file is reachable at
  /excel_worker_import_dummy_1.xlsx. (This import also seeds the demo workforce.)

STARTING POINT
- Navigate to /workers.

ON-SCREEN ACTIONS — walk the 11-step wizard, pausing on each step:
1. Click "Import Workers".
2. UPLOAD: choose excel_worker_import_dummy_1.xlsx.
3. MAP COLUMNS: show columns auto-mapped (e.g. "First Name"->first_name); manually
   override ONE mapping to demonstrate control.
4. MAP VALUES: map a membership-status raw value to a database option.
5. ASSESSMENTS: map an assessment column to a rating (or show how to skip).
6. EMPLOYER: select Acme Energy Pty Ltd (DEMO).
7. WORKSITES: fuzzy-match one worksite name to Acme FPSO Northstar (DEMO).
8. OCCUPATIONS: fuzzy-match one occupation string to a database occupation.
9. REVIEW ROWS: edit one cell inline to show rows are editable.
10. DEDUP: show the update / skip / create choice on a matched row (matched on
    reference ID, email, or phone).
11. CONFIRM: review the create/update counts, then click "Start Import".
12. DONE: show the success screen; navigate back to /workers to show imported rows.

NARRATION (AI voice; <= 180s)
- Hook: "Already have your workforce in a spreadsheet? Import it in one guided pass."
- Context: "From the Workers page, Import Workers walks you through eleven quick steps."
- Steps: one short sentence per step. Emphasise that columns auto-map so you only
  fix exceptions, and that the dedup step protects you from duplicates by matching
  on reference ID, email, or phone.
- Recap: "Your workforce is in. Next, create the campaign that brings them together."

END CARD "UP NEXT" — clickable cards to:
- A4 "Create a campaign — the manual way"
- A2 "Add worksites & link them to employers"
- A5 "Configure a campaign from Settings"

DELIVERABLES
- A3.mp4 + A3.vtt; A3.transcript.txt.
- chapter markers REQUIRED, one per wizard step:
  Upload, Map Columns, Map Values, Assessments, Employer, Worksites, Occupations,
  Review Rows, Dedup, Confirm, Done.
- manifest record:
  {"id":"A3","title":"Import workers from a list","series":"A","durationSec":<actual>,
   "summary":"Run the worker import wizard end to end — upload, map, dedup, import.",
   "tags":["import","workers","excel","spreadsheet","upload","column mapping","dedup","members"],
   "associatedRoutes":["/workers","/workers/*"],"routeWeight":10,
   "prerequisites":["A1","A2"],"upNext":["A4","A2","A5"],
   "chapters":[{"t":0,"label":"Upload"}],
   "transcriptPath":"A3.transcript.txt","videoPath":"A3.mp4","downloadable":true}

CONSTRAINTS
- Manual pathway only. EXACT labels in quotes. Length is a ceiling — keep each step
  to a beat or two. If a labelled control isn't found, STOP and report; don't guess.
```

## A4 — Create a campaign — the manual way

```
You are a technical how-to video producer for the OffshoreAlliance organising
database (Next.js app, apps/organising-db). Produce ONE short how-to video titled
"Create a campaign — the manual way" (target <= 120s). Work fully autonomously:
drive the app, capture screen + cursor, AI voice narration, assemble the clip.

ENVIRONMENT (recording only)
- Base URL: https://offshore-alliance-git-develop-reveille-strategy.vercel.app
  (develop preview, Supabase DEV). NEVER local, NEVER production.
- Log in: {{DEMO_LOGIN_EMAIL}} / {{DEMO_LOGIN_PASSWORD}}
- Viewport 1920x1080. One consistent AI narration voice. Demo data only.

PRODUCTION KIT (inherited)
- 3s intro + lower-third "Create a campaign — the manual way"; 2s outro "More guides
  in the how-to hub." Callout on every named control (EXACT labels). Glossary verbatim.

PREREQUISITE STATE
- Demo employer, worksite, and imported workers exist (A1-A3). No demo campaign yet.
  (This clip creates "Acme Energy EBA 2026 — DEMO".)

STARTING POINT
- Navigate to /campaigns.

ON-SCREEN ACTIONS (in order)
1. Click "Create campaign" — a dialog shows two options.
2. Call out BOTH options ("Campaign wizard" vs "Manual create"), then click
   "Manual create". (Do NOT pick the wizard.)
3. On /campaigns/new/manual, type "Name": Acme Energy EBA 2026 — DEMO.
4. Set "Campaign type" to Bargaining.
5. Set "Status" to Planning.
6. Optionally pick an "Organiser".
7. Click "Create and open settings".
8. Land on /campaigns/[id]/settings; pause on the settings accordion.

NARRATION (AI voice; <= 120s)
- Hook: "Ready to start organising? Create the campaign record in seconds."
- Context: "From the Campaigns page there are two paths — and we're taking the
  manual one."
- Steps: one sentence per action. Be explicit: "This is the manual path — create
  the record now, then configure each section at your own pace. The guided wizard
  is a separate guide." Note "Create and open settings" stays disabled until you
  enter a name.
- Recap: "Campaign created. Next, configure it from the Settings page."

END CARD "UP NEXT" — clickable cards to:
- A5 "Configure a campaign from Settings"
- A3 "Import workers from a list"
- B1 "Organising units, groups & subgroups — explained"

DELIVERABLES
- A4.mp4 + A4.vtt; A4.transcript.txt; chapter markers for steps > 20s.
- manifest record:
  {"id":"A4","title":"Create a campaign — the manual way","series":"A","durationSec":<actual>,
   "summary":"Create a campaign via Manual create (not the wizard) and land in Settings.",
   "tags":["create campaign","manual","new campaign","bargaining","campaign type","status"],
   "associatedRoutes":["/campaigns","/campaigns/new/manual"],"routeWeight":10,
   "prerequisites":["A1","A2","A3"],"upNext":["A5","A3","B1"],
   "chapters":[{"t":0,"label":"Manual create"}],
   "transcriptPath":"A4.transcript.txt","videoPath":"A4.mp4","downloadable":true}

CONSTRAINTS
- Manual pathway only — clearly contrast with the wizard but do not demo it.
- EXACT labels in quotes. Length is a ceiling. If a control isn't found, STOP and report.
```

## A5 — Configure a campaign from Settings

```
You are a technical how-to video producer for the OffshoreAlliance organising
database (Next.js app, apps/organising-db). Produce ONE short how-to video titled
"Configure a campaign from Settings" (target <= 150s). Work fully autonomously:
drive the app, capture screen + cursor, AI voice narration, assemble the clip.

ENVIRONMENT (recording only)
- Base URL: https://offshore-alliance-git-develop-reveille-strategy.vercel.app
  (develop preview, Supabase DEV). NEVER local, NEVER production.
- Log in: {{DEMO_LOGIN_EMAIL}} / {{DEMO_LOGIN_PASSWORD}}
- Viewport 1920x1080. One consistent AI narration voice. Demo data only.

PRODUCTION KIT (inherited)
- 3s intro + lower-third "Configure a campaign from Settings"; 2s outro "More guides
  in the how-to hub." Callout on every named control (EXACT labels). Glossary verbatim.

PREREQUISITE STATE
- The demo campaign "Acme Energy EBA 2026 — DEMO" exists (A4), open at its Settings
  page. Demo employer/worksite/workers exist for attaching.

STARTING POINT
- Navigate to /campaigns/[id]/settings for the demo campaign.

ON-SCREEN ACTIONS (in order)
1. Pan the accordion so all sections are visible: "Basics", "Employers & Worksites",
   "Agreements", "Worker Estimate", "Organising Units", "Workers", "Ambitions".
2. Open "Basics"; set Description, Start Date, and Plan Timeframe; click "Save Basics"
   and show the toast ("Campaign ... saved.").
3. Open "Employers & Worksites"; attach the demo employer and worksite; save.
4. Briefly open "Worker Estimate" and "Ambitions" to show they exist; note that
   "Organising Units" and "Workers" each have their own dedicated guide.

NARRATION (AI voice; <= 150s)
- Hook: "Settings is your campaign's control panel — fill it in any order you like."
- Context: "Every section saves on its own, so you can do a little now and more later."
- Steps: one sentence per action. Reinforce the independent-save model and point at
  Organising Units / Workers as "covered in their own guides."
- Recap: "Your campaign is configured. Next, let's structure the workforce."

END CARD "UP NEXT" — clickable cards to:
- B1 "Organising units, groups & subgroups — explained"
- A4 "Create a campaign — the manual way"
- A3 "Import workers from a list"

DELIVERABLES
- A5.mp4 + A5.vtt; A5.transcript.txt.
- chapter markers: Basics, Employers & Worksites, Other sections.
- manifest record:
  {"id":"A5","title":"Configure a campaign from Settings","series":"A","durationSec":<actual>,
   "summary":"Tour the campaign Settings accordion and fill the core sections; each saves independently.",
   "tags":["campaign settings","configure","accordion","basics","ambitions","worker estimate"],
   "associatedRoutes":["/campaigns/*/settings"],"routeWeight":10,
   "prerequisites":["A4"],"upNext":["B1","A4","A3"],
   "chapters":[{"t":0,"label":"Basics"}],
   "transcriptPath":"A5.transcript.txt","videoPath":"A5.mp4","downloadable":true}

CONSTRAINTS
- Manual pathway only. EXACT labels in quotes. Length is a ceiling.
- If a labelled control isn't found, STOP and report; don't guess.
```

---

# SERIES B — Campaign structure: units, groups, subgroups

## B1 — Organising units, groups & subgroups — explained

```
You are a technical how-to video producer for the OffshoreAlliance organising
database (Next.js app, apps/organising-db). Produce ONE short EXPLAINER video titled
"Organising units, groups & subgroups — explained" (target <= 150s). This is a
concept clip with a light UI tour, not a click-by-click how-to. Work fully
autonomously: drive the app for B-roll, capture screen + cursor, AI voice narration,
assemble the clip. You MAY add simple diagram overlays for the relationships.

ENVIRONMENT (recording only)
- Base URL: https://offshore-alliance-git-develop-reveille-strategy.vercel.app
  (develop preview, Supabase DEV). NEVER local, NEVER production.
- Log in: {{DEMO_LOGIN_EMAIL}} / {{DEMO_LOGIN_PASSWORD}}
- Viewport 1920x1080. One consistent AI narration voice. Demo data only.

PRODUCTION KIT (inherited)
- 3s intro + lower-third "Organising units, groups & subgroups"; 2s outro "More
  guides in the how-to hub." Glossary verbatim — use the exact terms below.

PREREQUISITE STATE
- The demo campaign exists with workers in scope and at least two organising units
  (ideally one group with member units) so the Campaign Units tab and wall chart
  show real content.

STARTING POINT / B-ROLL
- Campaign -> Workforce tab -> "Campaign Units" sub-tab
  (/campaigns/[id]?tab=workforce&sub=campaign-units), and a glance at the wall chart.

TEACHING SCRIPT (this is the narration; <= 150s) — show matching B-roll/diagrams:
- An ORGANISING UNIT (OU) is a defined group of workers you organise as a block —
  by shift, department, worksite, crew rotation, work area, network, ethnic
  community, accommodation, job type, or custom.
- A GROUP CONTAINER is a named header that bundles several units of the SAME type
  (e.g. "Early Shifts"). Workers are NEVER assigned to a group container — only to
  its MEMBER UNITS (the subgroups). Show this with a simple diagram.
- EXCLUSIVITY RULE: a worker can be in only ONE group per unit-type in a campaign
  (you can't be in both Shift A and Shift B). Illustrate.
- Where it lives: the "Campaign Units" sub-tab and the wall chart.
- Close: "Now you know the building blocks — next, let's create some."

END CARD "UP NEXT" — clickable cards to:
- B2 "Create organising units and groups"
- B3 "Allocate workers to units"
- C1 "The wall chart, explained"

DELIVERABLES
- B1.mp4 + B1.vtt; B1.transcript.txt; chapter markers for any segment > 20s.
- manifest record (concept clip — low routeWeight so it informs without crowding):
  {"id":"B1","title":"Organising units, groups & subgroups — explained","series":"B","durationSec":<actual>,
   "summary":"What organising units, group containers and member subgroups are, and how they relate.",
   "tags":["organising unit","OU","group","subgroup","container","shift","department","structure","hierarchy"],
   "associatedRoutes":["/campaigns/*"],"routeWeight":3,
   "prerequisites":[],"upNext":["B2","B3","C1"],
   "chapters":[{"t":0,"label":"What is an organising unit"}],
   "transcriptPath":"B1.transcript.txt","videoPath":"B1.mp4","downloadable":true}

CONSTRAINTS
- Use the EXACT glossary terms (organising unit, group container, member unit/
  subgroup). Length is a ceiling. If the UI you show has changed, STOP and report.
```

## B2 — Create organising units and groups

```
You are a technical how-to video producer for the OffshoreAlliance organising
database (Next.js app, apps/organising-db). Produce ONE short how-to video titled
"Create organising units and groups" (target <= 150s). Work fully autonomously:
drive the app, capture screen + cursor, AI voice narration, assemble the clip.

ENVIRONMENT (recording only)
- Base URL: https://offshore-alliance-git-develop-reveille-strategy.vercel.app
  (develop preview, Supabase DEV). NEVER local, NEVER production.
- Log in: {{DEMO_LOGIN_EMAIL}} / {{DEMO_LOGIN_PASSWORD}}
- Viewport 1920x1080. One consistent AI narration voice. Demo data only.

PRODUCTION KIT (inherited)
- 3s intro + lower-third "Create organising units and groups"; 2s outro "More guides
  in the how-to hub." Callout on every named control (EXACT labels). Glossary verbatim.

PREREQUISITE STATE
- The demo campaign exists with workers in scope.

STARTING POINT
- Campaign -> Workforce tab -> "Campaign Units" sub-tab. Click "Create organising unit".

ON-SCREEN ACTIONS (in order)
1. In the dialog, show the mode toggle: single unit vs group.
2. SINGLE: enter a Name (e.g. "Day Shift"), pick a Type (Shift), set Estimated
   workers, optionally set an Anchor worker; create the unit.
3. Re-open the dialog and switch to GROUP mode.
4. GROUP: enter a Group name (e.g. "Shifts"), pick the Type (Shift), set the number
   of member units, name each member (e.g. "Day", "Night"), choose placement,
   optionally assign workers; review; confirm ("Add group with X units").
5. Show both results on the wall chart: the group renders as a header with its
   member units nested beneath.

NARRATION (AI voice; <= 150s)
- Hook: "Time to give your campaign structure."
- Context: "One dialog creates either a single unit or a whole group of units."
- Steps: one sentence per action. Tie back to the explainer: "Use a single unit for
  a one-off block; use a group when you have several units of the same type."
- Recap: "Units created. Next, put workers into them."

END CARD "UP NEXT" — clickable cards to:
- B3 "Allocate workers to units"
- B1 "Organising units, groups & subgroups — explained"
- C1 "The wall chart, explained"

DELIVERABLES
- B2.mp4 + B2.vtt; B2.transcript.txt.
- chapter markers: Single unit, Group of units.
- manifest record:
  {"id":"B2","title":"Create organising units and groups","series":"B","durationSec":<actual>,
   "summary":"Create a single organising unit and a group with member subunits via the Create organising unit dialog.",
   "tags":["create unit","create group","organising unit","group container","member units","wall chart"],
   "associatedRoutes":["/campaigns/*"],"routeWeight":6,
   "prerequisites":["B1"],"upNext":["B3","B1","C1"],
   "chapters":[{"t":0,"label":"Single unit"}],
   "transcriptPath":"B2.transcript.txt","videoPath":"B2.mp4","downloadable":true}

CONSTRAINTS
- EXACT labels in quotes. Length is a ceiling. If a control isn't found, STOP and report.
```

## B3 — Allocate workers to units

```
You are a technical how-to video producer for the OffshoreAlliance organising
database (Next.js app, apps/organising-db). Produce ONE short how-to video titled
"Allocate workers to units" (target <= 120s). Work fully autonomously: drive the
app, capture screen + cursor, AI voice narration, assemble the clip.

ENVIRONMENT (recording only)
- Base URL: https://offshore-alliance-git-develop-reveille-strategy.vercel.app
  (develop preview, Supabase DEV). NEVER local, NEVER production.
- Log in: {{DEMO_LOGIN_EMAIL}} / {{DEMO_LOGIN_PASSWORD}}
- Viewport 1920x1080. One consistent AI narration voice. Demo data only.

PRODUCTION KIT (inherited)
- 3s intro + lower-third "Allocate workers to units"; 2s outro "More guides in the
  how-to hub." Callout on every named control (EXACT labels). Glossary verbatim.

PREREQUISITE STATE
- The demo campaign has at least two organising units (from B2) and workers in scope.

STARTING POINT
- Open the demo campaign's wall chart (Workforce -> Wall chart), or the Settings
  "Workers" section.

ON-SCREEN ACTIONS (in order)
1. From a unit header choose "Assign workers".
2. Multi-select several workers from the list and confirm — they appear as tiles in
   that unit.
3. For a worker who belongs in more than one unit, mark a "primary" assignment.
4. On the wall chart, DRAG a worker tile into a different unit.
5. SHIFT+DRAG a tile to COPY a worker into a second unit; show the multi-unit
   indicator that appears on the tile.

NARRATION (AI voice; <= 120s)
- Hook: "Units are nothing without people — let's fill them."
- Context: "You can assign in bulk, then fine-tune by dragging on the wall chart."
- Steps: one sentence per action. Explain primary vs additional assignment, and that
  a worker can legitimately live in more than one unit.
- Recap: "Your workforce is structured — now let's read the wall chart."

END CARD "UP NEXT" — clickable cards to:
- C1 "The wall chart, explained"
- B2 "Create organising units and groups"
- B1 "Organising units, groups & subgroups — explained"

DELIVERABLES
- B3.mp4 + B3.vtt; B3.transcript.txt; chapter markers for steps > 20s.
- manifest record:
  {"id":"B3","title":"Allocate workers to units","series":"B","durationSec":<actual>,
   "summary":"Assign workers to organising units in bulk and by drag-and-drop; handle multi-unit workers.",
   "tags":["allocate workers","assign","drag and drop","multi-unit","primary unit"],
   "associatedRoutes":["/campaigns/*"],"routeWeight":6,
   "prerequisites":["B2"],"upNext":["C1","B2","B1"],
   "chapters":[{"t":0,"label":"Assign workers"}],
   "transcriptPath":"B3.transcript.txt","videoPath":"B3.mp4","downloadable":true}

CONSTRAINTS
- EXACT labels in quotes. Length is a ceiling. If a control isn't found, STOP and report.
```

---

# SERIES C — Wall charts  (film AFTER Series E so tiles show colour)

## C1 — The wall chart, explained

```
You are a technical how-to video producer for the OffshoreAlliance organising
database (Next.js app, apps/organising-db). Produce ONE short EXPLAINER/tour video
titled "The wall chart, explained" (target <= 120s). Work fully autonomously: drive
the app, capture screen + cursor, AI voice narration, assemble the clip.

ENVIRONMENT (recording only)
- Base URL: https://offshore-alliance-git-develop-reveille-strategy.vercel.app
  (develop preview, Supabase DEV). NEVER local, NEVER production.
- Log in: {{DEMO_LOGIN_EMAIL}} / {{DEMO_LOGIN_PASSWORD}}
- Viewport 1920x1080. One consistent AI narration voice. Demo data only.

PRODUCTION KIT (inherited)
- 3s intro + lower-third "The wall chart, explained"; 2s outro "More guides in the
  how-to hub." Callout on every element named below (EXACT labels). Glossary verbatim.

PREREQUISITE STATE
- The demo campaign has units, workers, AND some ratings already applied (Series E
  filmed first) so tiles show colour. Include at least one group with a nested
  sub-unit and one unit with an unfilled estimate (to show empty slots).

STARTING POINT
- Campaign -> Workforce -> "Wall chart" sub-tab
  (/campaigns/[id]?tab=workforce&sub=wall-chart).

ON-SCREEN ACTIONS / TOUR (in order)
1. Frame one UNIT CARD; call out its name, type, worker count, and estimate.
2. Zoom a WORKER TILE and decode each element: initials/name; the rating COLOUR;
   the role badge (Contact / Activist / Delegate); a non-OA union badge; the
   multi-unit indicator; the "in build list" check; and the phone/email icons that
   appear on hover.
3. Point out greyed EMPTY SLOTS (unfilled estimate positions).
4. Point out a NESTED SUB-UNIT card under a group.
5. Click a tile to open the worker detail sheet, then close it.

NARRATION (AI voice; <= 120s)
- Hook: "The wall chart is your campaign at a glance."
- Context: "Every column is a unit; every tile is a worker."
- Steps: narrate the tour. Note that colour = rating (covered in its own guide) and
  that grey slots show where you still have people to find.
- Recap: "Now you can read it — next, filter it to answer real questions."

END CARD "UP NEXT" — clickable cards to:
- C2 "Filter, sort & switch views"
- C3 "Build a list and fire it"
- E1 "The rating scale, explained"

DELIVERABLES
- C1.mp4 + C1.vtt; C1.transcript.txt; chapter markers for any segment > 20s.
- manifest record:
  {"id":"C1","title":"The wall chart, explained","series":"C","durationSec":<actual>,
   "summary":"Read the wall chart: unit cards, worker tiles, colours, badges, empty slots and sub-units.",
   "tags":["wall chart","tiles","colours","badges","worker card","unit card","empty slots"],
   "associatedRoutes":["/campaigns/*"],"routeWeight":9,
   "prerequisites":["B1","E1"],"upNext":["C2","C3","E1"],
   "chapters":[{"t":0,"label":"Unit card"}],
   "transcriptPath":"C1.transcript.txt","videoPath":"C1.mp4","downloadable":true}

CONSTRAINTS
- EXACT labels in quotes. Length is a ceiling. If an element isn't found, STOP and report.
```

## C2 — Filter, sort & switch views

```
You are a technical how-to video producer for the OffshoreAlliance organising
database (Next.js app, apps/organising-db). Produce ONE short how-to video titled
"Filter, sort & switch views" (target <= 120s). Work fully autonomously: drive the
app, capture screen + cursor, AI voice narration, assemble the clip.

ENVIRONMENT (recording only)
- Base URL: https://offshore-alliance-git-develop-reveille-strategy.vercel.app
  (develop preview, Supabase DEV). NEVER local, NEVER production.
- Log in: {{DEMO_LOGIN_EMAIL}} / {{DEMO_LOGIN_PASSWORD}}
- Viewport 1920x1080. One consistent AI narration voice. Demo data only.

PRODUCTION KIT (inherited)
- 3s intro + lower-third "Filter, sort & switch views"; 2s outro "More guides in the
  how-to hub." Callout on every named control (EXACT labels). Glossary verbatim.

PREREQUISITE STATE
- Same demo campaign as C1: units, workers, ratings applied, and at least one named
  assessment exists so the assessment selector has something to switch to.

STARTING POINT
- The demo campaign wall chart, with the filter bar visible.

ON-SCREEN ACTIONS (in order)
1. In the filter bar, apply a couple of filters (e.g. worksite + a rating) to narrow
   the chart; show the tile count change.
2. Open the assessment selector; switch between "Cumulative rating" and a specific
   assessment — show tiles recolour and unassessed tiles go grey.
3. Toggle between "Wall chart" and "List" views.
4. Clear the filters to reset.

NARRATION (AI voice; <= 120s)
- Hook: "Filters turn the wall chart into an answer machine."
- Context: "Ask a question — like 'unrated workers on Shift A' — and filter to it."
- Steps: one sentence per action. Explain cumulative rating (overall position)
  vs a single assessment (just that question's ratings).
- Recap: "Found your cohort? Next, build a list from it."

END CARD "UP NEXT" — clickable cards to:
- C3 "Build a list and fire it"
- C1 "The wall chart, explained"
- E2 "Create and configure an assessment"

DELIVERABLES
- C2.mp4 + C2.vtt; C2.transcript.txt; chapter markers for steps > 20s.
- manifest record:
  {"id":"C2","title":"Filter, sort & switch views","series":"C","durationSec":<actual>,
   "summary":"Narrow the wall chart with filters, switch cumulative vs per-assessment view, and toggle list view.",
   "tags":["filter","sort","list view","cumulative rating","assessment view","search workers"],
   "associatedRoutes":["/campaigns/*"],"routeWeight":8,
   "prerequisites":["C1"],"upNext":["C3","C1","E2"],
   "chapters":[{"t":0,"label":"Apply filters"}],
   "transcriptPath":"C2.transcript.txt","videoPath":"C2.mp4","downloadable":true}

CONSTRAINTS
- EXACT labels in quotes. Length is a ceiling. If a control isn't found, STOP and report.
```

## C3 — Build a list and "fire" it

```
You are a technical how-to video producer for the OffshoreAlliance organising
database (Next.js app, apps/organising-db). Produce ONE short how-to video titled
"Build a list and fire it" (target <= 150s). Work fully autonomously: drive the app,
capture screen + cursor, AI voice narration, assemble the clip.

ENVIRONMENT (recording only)
- Base URL: https://offshore-alliance-git-develop-reveille-strategy.vercel.app
  (develop preview, Supabase DEV). NEVER local, NEVER production.
- Log in: {{DEMO_LOGIN_EMAIL}} / {{DEMO_LOGIN_PASSWORD}}
- Viewport 1920x1080. One consistent AI narration voice. Demo data only.

PRODUCTION KIT (inherited)
- 3s intro + lower-third "Build a list and fire it"; 2s outro "More guides in the
  how-to hub." Callout on every named control (EXACT labels). Glossary verbatim.

PREREQUISITE STATE
- A populated demo-campaign wall chart (units, workers).

STARTING POINT
- The demo campaign wall chart.

ON-SCREEN ACTIONS (in order)
1. Open the "Build list" panel (ListPlus icon).
2. Name the list using the placeholder pattern (e.g. "EBA voting push — Day shift").
3. Drag a worker tile into the panel; then drag a UNIT CARD HEADER to add a whole
   unit at once; then SHIFT+DRAG to copy a multi-selection.
4. Set "Purpose" to each option in turn (Email / Phone / Activist task) and read
   the hint; note the leader slot that appears for "Activist task".
5. With a purpose set, click "Fire"; narrate that each purpose routes into a
   different pathway (email composer / call list / activist task) — each its own guide.

NARRATION (AI voice; <= 150s)
- Hook: "This is the hinge — turn what you see into action."
- Context: "Build a list right on the wall chart, then fire it where it needs to go."
- Steps: one sentence per action. Explain that Purpose drives early warnings (e.g.
  missing email/phone) but isn't enforced.
- Recap: "Picked a purpose and fired? You're now in email, phone, or activist
  tasking — let's look at each."

END CARD "UP NEXT" — clickable cards to (note: intentionally cross-series to tasking):
- D1 "Email tasking: fire a list, compose & send"
- D2 "Phone tasking: build a call list & scripts"
- D4 "Activist tasking: task lists & the leader webform"

DELIVERABLES
- C3.mp4 + C3.vtt; C3.transcript.txt; chapter markers for steps > 20s.
- manifest record:
  {"id":"C3","title":"Build a list and fire it","series":"C","durationSec":<actual>,
   "summary":"Build a worker list on the wall chart, set a purpose, and fire it into a tasking pathway.",
   "tags":["build list","fire","drag","purpose","email","phone","activist task","recipients"],
   "associatedRoutes":["/campaigns/*"],"routeWeight":8,
   "prerequisites":["C1"],"upNext":["D1","D2","D4"],
   "chapters":[{"t":0,"label":"Open build list"}],
   "transcriptPath":"C3.transcript.txt","videoPath":"C3.mp4","downloadable":true}

CONSTRAINTS
- EXACT labels in quotes. Length is a ceiling. If a control isn't found, STOP and report.
```

---

# SERIES D — Tasking from Workforce → wall charts

## D1 — Email tasking: fire a list, compose & send

```
You are a technical how-to video producer for the OffshoreAlliance organising
database (Next.js app, apps/organising-db). Produce ONE short how-to video titled
"Email tasking: fire a list, compose & send" (target <= 150s). Work fully
autonomously: drive the app, capture screen + cursor, AI voice narration, assemble
the clip.

ENVIRONMENT (recording only)
- Base URL: https://offshore-alliance-git-develop-reveille-strategy.vercel.app
  (develop preview, Supabase DEV). NEVER local, NEVER production.
- Log in: {{DEMO_LOGIN_EMAIL}} / {{DEMO_LOGIN_PASSWORD}}
- Viewport 1920x1080. One consistent AI narration voice. Demo data only.

PRODUCTION KIT (inherited)
- 3s intro + lower-third "Email tasking"; 2s outro "More guides in the how-to hub."
  Callout on every named control (EXACT labels). Glossary verbatim.

PREREQUISITE STATE
- A populated demo-campaign wall chart where several workers have email addresses.

STARTING POINT
- The demo campaign wall chart with a build list ready (or build a small one live).

ON-SCREEN ACTIONS (in order)
1. From the build list, set Purpose "Email" and click "Fire"; land on the email
   composer (/campaigns/[id]/email/wizard?...&entry_branch=build_list).
2. Show the recipient list already attached (filtered to workers with email).
3. Fill the "Subject"; write the "Body" in the editor.
4. "Preview" the email.
5. "Save as draft", then "Send".
6. Briefly show the alternative manual entry at /campaigns/[id]/email/lists/new.

NARRATION (AI voice; <= 150s)
- Hook: "Reach a whole cohort by email in a couple of clicks."
- Context: "Firing 'Email' from the wall chart carries your selection straight into
  the composer."
- Steps: one sentence per action. Note that workers without an email are dropped —
  that's the early warning.
- Recap: "Recipients sorted, message sent. Phone tasking works similarly."

END CARD "UP NEXT" — clickable cards to:
- D2 "Phone tasking: build a call list & scripts"
- D3 "Phone tasking: running a calling session"
- D4 "Activist tasking: task lists & the leader webform"

DELIVERABLES
- D1.mp4 + D1.vtt; D1.transcript.txt; chapter markers for steps > 20s.
- manifest record:
  {"id":"D1","title":"Email tasking: fire a list, compose & send","series":"D","durationSec":<actual>,
   "summary":"From a fired build list, compose and send a campaign email to the attached recipients.",
   "tags":["email","compose","send","recipients","draft","comms","broadcast"],
   "associatedRoutes":["/campaigns/*/email/*"],"routeWeight":9,
   "prerequisites":["C3"],"upNext":["D2","D3","D4"],
   "chapters":[{"t":0,"label":"Fire Email"}],
   "transcriptPath":"D1.transcript.txt","videoPath":"D1.mp4","downloadable":true}

CONSTRAINTS
- Do NOT send to real addresses — demo data only. EXACT labels in quotes. Length is
  a ceiling. If a control isn't found, STOP and report.
```

## D2 — Phone tasking: build a call list & scripts

```
You are a technical how-to video producer for the OffshoreAlliance organising
database (Next.js app, apps/organising-db). Produce ONE short how-to video titled
"Phone tasking: build a call list & scripts" (target <= 180s). Work fully
autonomously: drive the app, capture screen + cursor, AI voice narration, assemble
the clip.

ENVIRONMENT (recording only)
- Base URL: https://offshore-alliance-git-develop-reveille-strategy.vercel.app
  (develop preview, Supabase DEV). NEVER local, NEVER production.
- Log in: {{DEMO_LOGIN_EMAIL}} / {{DEMO_LOGIN_PASSWORD}}
- Viewport 1920x1080. One consistent AI narration voice. Demo data only.

PRODUCTION KIT (inherited)
- 3s intro + lower-third "Phone tasking: build a call list & scripts"; 2s outro
  "More guides in the how-to hub." Callout on every named control (EXACT labels).
  Glossary verbatim.

PREREQUISITE STATE
- Demo campaign with workers who have phone numbers; at least one phone script
  available (or create one in-flow).

STARTING POINT
- Campaign -> Phone tab (/campaigns/[id]/phone) — the Phone Operations hub.

ON-SCREEN ACTIONS (in order)
1. Tour the hub: the Call Scripts section, the Active Call Lists section (with
   progress bars), and the Report section.
2. Click "New Call List" and walk the 5-step wizard:
   a) LIST DETAILS: name + optional description.
   b) BUILD LIST: apply filters (membership/employer/worksite/roles/occupations/
      rating); show the matching-worker preview count.
   c) CALL ORDER: show the strategies (Sequential / By Rating / By Assessment Rating
      / Least Recently Contacted / Random); pick "By Rating" and drag to reorder the
      rating buckets.
   d) ATTACH SCRIPT: select an existing script (or "Create New Script").
   e) CONFIRM: review name, worker count, script; click "Create & Manage Later".

NARRATION (AI voice; <= 180s)
- Hook: "Phone banking, organised."
- Context: "The Phone hub holds your lists, scripts and call report; new lists are a
  quick five-step build."
- Steps: one sentence per step. Spend a beat on call order — why calling your
  strongest or weakest ratings first can matter.
- Recap: "List and script are ready. Next, let's actually make the calls."

END CARD "UP NEXT" — clickable cards to:
- D3 "Phone tasking: running a calling session"
- D1 "Email tasking: fire a list, compose & send"
- D4 "Activist tasking: task lists & the leader webform"

DELIVERABLES
- D2.mp4 + D2.vtt; D2.transcript.txt.
- chapter markers: Phone hub, List details, Build list, Call order, Attach script, Confirm.
- manifest record:
  {"id":"D2","title":"Phone tasking: build a call list & scripts","series":"D","durationSec":<actual>,
   "summary":"Create a call list in the 5-step wizard, set call order, and attach a script.",
   "tags":["phone","call list","script","call order","priority","dialer setup"],
   "associatedRoutes":["/campaigns/*/phone","/campaigns/*/phone/lists/*","/campaigns/*/phone/scripts/*"],"routeWeight":9,
   "prerequisites":["C3"],"upNext":["D3","D1","D4"],
   "chapters":[{"t":0,"label":"Phone hub"}],
   "transcriptPath":"D2.transcript.txt","videoPath":"D2.mp4","downloadable":true}

CONSTRAINTS
- EXACT labels in quotes. Length is a ceiling. If a control isn't found, STOP and report.
```

## D3 — Phone tasking: running a calling session

```
You are a technical how-to video producer for the OffshoreAlliance organising
database (Next.js app, apps/organising-db). Produce ONE short how-to video titled
"Phone tasking: running a calling session" (target <= 180s). Work fully autonomously:
drive the app, capture screen + cursor, AI voice narration, assemble the clip.

ENVIRONMENT (recording only)
- Base URL: https://offshore-alliance-git-develop-reveille-strategy.vercel.app
  (develop preview, Supabase DEV). NEVER local, NEVER production.
- Log in: {{DEMO_LOGIN_EMAIL}} / {{DEMO_LOGIN_PASSWORD}}
- Viewport 1920x1080. One consistent AI narration voice. Demo data only.

PRODUCTION KIT (inherited)
- 3s intro + lower-third "Running a calling session"; 2s outro "More guides in the
  how-to hub." Callout on every named control (EXACT labels). Glossary verbatim.

PREREQUISITE STATE
- A call list exists (from D2) with contacts and an attached script.

STARTING POINT
- Click "Call" on a list card -> /campaigns/[id]/phone/call/[listId].

ON-SCREEN ACTIONS / TOUR (in order)
1. Frame the CONTACT CARD: name, worksite, shift, phone, current rating.
2. Walk the ConversationStepper through a couple of script sections.
3. Show the DIAL OUTCOME bar options ("No answer" / "Voicemail left" / "Wrong
   number" / "Call back" / "Spoke to ..." / "Messaging"); pick "Spoke to ...".
4. Open the side panels: Script / Objections / Issues.
5. Use the CTA Ratings (and Assessment Ratings) panel to rate the worker on a CTA.
6. Type a quick note in call notes; record the outcome; advance to "Next contact".

NARRATION (AI voice; <= 180s)
- Hook: "Everything you need for the call is on one screen."
- Context: "Open a list, and the dialer guides you contact by contact."
- Steps: narrate one complete call — dial, follow the script, log the outcome, rate
  the CTA, add a note, move on.
- Recap: "Every call is logged — feeding your report and the worker's ratings."

END CARD "UP NEXT" — clickable cards to:
- D4 "Activist tasking: task lists & the leader webform"
- D2 "Phone tasking: build a call list & scripts"
- D1 "Email tasking: fire a list, compose & send"

DELIVERABLES
- D3.mp4 + D3.vtt; D3.transcript.txt.
- chapter markers: Contact card, Script flow, Log outcome, Rate CTA, Next contact.
- manifest record:
  {"id":"D3","title":"Phone tasking: running a calling session","series":"D","durationSec":<actual>,
   "summary":"Use the calling interface: contact card, script stepper, dial outcomes, CTA ratings and notes.",
   "tags":["calling","dialer","call session","outcome","voicemail","CTA rating","notes"],
   "associatedRoutes":["/campaigns/*/phone/call/*","/campaigns/*/phone/live"],"routeWeight":9,
   "prerequisites":["D2"],"upNext":["D4","D2","D1"],
   "chapters":[{"t":0,"label":"Contact card"}],
   "transcriptPath":"D3.transcript.txt","videoPath":"D3.mp4","downloadable":true}

CONSTRAINTS
- Do NOT place real calls — demo data only; simulate the outcome logging. EXACT
  labels in quotes. Length is a ceiling. If a control isn't found, STOP and report.
```

## D4 — Activist tasking: task lists & the leader webform

```
You are a technical how-to video producer for the OffshoreAlliance organising
database (Next.js app, apps/organising-db). Produce ONE short how-to video titled
"Activist tasking: task lists & the leader webform" (target <= 180s). Work fully
autonomously: drive the app, capture screen + cursor, AI voice narration, assemble
the clip.

ENVIRONMENT (recording only)
- Base URL: https://offshore-alliance-git-develop-reveille-strategy.vercel.app
  (develop preview, Supabase DEV). NEVER local, NEVER production.
- Log in: {{DEMO_LOGIN_EMAIL}} / {{DEMO_LOGIN_PASSWORD}}
- Viewport 1920x1080. One consistent AI narration voice. Demo data only.

PRODUCTION KIT (inherited)
- 3s intro + lower-third "Activist tasking"; 2s outro "More guides in the how-to hub."
  Callout on every named control (EXACT labels). Glossary verbatim.

PREREQUISITE STATE
- Demo campaign with workers; an activity/assessment to attach (or create in-flow);
  a worker suitable to act as leader.

STARTING POINT
- Fire "Activist task" from a build list to open CreateTaskListDialog (or open it
  from Plan -> Task Lists -> create).

ON-SCREEN ACTIONS (in order)
1. Walk the 5-step dialog:
   a) ANCHOR: pick an entry point (From leader / From activity / From workers).
   b) LEADER: pick a worker leader (or an organiser).
   c) ACTIVITY: select or create an activity; note that "activist-assessed" means
      the leader rates the workers via the webform.
   d) WORKERS: pick the follower workers.
   e) OPTIONS: tick "Include membership ask"; choose "Activate now".
2. In the Task Lists tab (/campaigns/[id]?tab=plan&sub=task-lists), show the new row
   and click "Send to leader" to generate the share link.
3. Open the leader webform (/leader/task/[token]) and show: the worker rating table,
   the membership column, the "add another worker" option, and the "Submit ratings"
   button.

NARRATION (AI voice; <= 180s)
- Hook: "Turn your best workers into organisers with leader-led tasking."
- Context: "You assign a leader a short list of co-workers to assess or recruit, and
  they complete it on a simple web form."
- Steps: one sentence per action. Explain the activist-assessed model and the
  membership ask.
- Recap: "Ratings the leader submits flow straight back into your campaign."

END CARD "UP NEXT" — clickable cards to:
- D1 "Email tasking: fire a list, compose & send"
- D2 "Phone tasking: build a call list & scripts"
- C3 "Build a list and fire it"

DELIVERABLES
- D4.mp4 + D4.vtt; D4.transcript.txt.
- chapter markers: Anchor, Leader, Activity, Workers, Options, Leader webform.
- manifest record:
  {"id":"D4","title":"Activist tasking: task lists & the leader webform","series":"D","durationSec":<actual>,
   "summary":"Build a leader-led activist task list and show what the leader sees on the webform.",
   "tags":["activist","task list","leader","webform","delegate","membership ask","peer assessment"],
   "associatedRoutes":["/campaigns/*","/leader/task/*"],"routeWeight":8,
   "prerequisites":["C3","E1"],"upNext":["D1","D2","C3"],
   "chapters":[{"t":0,"label":"Anchor"}],
   "transcriptPath":"D4.transcript.txt","videoPath":"D4.mp4","downloadable":true}

CONSTRAINTS
- EXACT labels in quotes. Length is a ceiling. If a control isn't found, STOP and report.
```

---

# SERIES E — Assessments & ratings  (film BEFORE Series C)

## E1 — The rating scale, explained

```
You are a technical how-to video producer for the OffshoreAlliance organising
database (Next.js app, apps/organising-db). Produce ONE short EXPLAINER video titled
"The rating scale, explained" (target <= 90s). This is a concept clip; you MAY use
diagram/colour-swatch overlays plus light wall-chart B-roll. Work fully autonomously:
capture screen, AI voice narration, assemble the clip.

ENVIRONMENT (recording only)
- Base URL: https://offshore-alliance-git-develop-reveille-strategy.vercel.app
  (develop preview, Supabase DEV). NEVER local, NEVER production.
- Log in: {{DEMO_LOGIN_EMAIL}} / {{DEMO_LOGIN_PASSWORD}}
- Viewport 1920x1080. One consistent AI narration voice. Demo data only.

PRODUCTION KIT (inherited)
- 3s intro + lower-third "The rating scale, explained"; 2s outro "More guides in the
  how-to hub." Glossary verbatim — use the exact level labels below.

PREREQUISITE STATE
- A demo-campaign wall chart with a mix of ratings, for illustrative B-roll.

TEACHING SCRIPT (this is the narration; <= 90s) — show a colour swatch per level:
- The scale has SIX states. Show each with its colour:
  0 Unassessed (grey) — no rating yet; an explicit state, not "missing".
  1 Supportive leader (sky blue) — actively brings others along.
  2 Supporter (green) — supports, but isn't organising others.
  3 Neutral (amber) — undecided / not engaged.
  4 Opposed (red) — individually opposed.
  5 Oppositional leader (dark red) — actively organises against.
- Stress that Unassessed is a REAL, visible category — you can't act on what you
  haven't measured.
- Stress that these colours mean the same thing EVERYWHERE in the app (wall chart,
  charts, pickers).
- Close: "Keep these six in mind — next, create an assessment to capture them."

END CARD "UP NEXT" — clickable cards to:
- E2 "Create and configure an assessment"
- E3 "Rate workers (single, bulk, cumulative)"
- C1 "The wall chart, explained"

DELIVERABLES
- E1.mp4 + E1.vtt; E1.transcript.txt; chapter markers for any segment > 20s.
- manifest record (concept clip — low routeWeight):
  {"id":"E1","title":"The rating scale, explained","series":"E","durationSec":<actual>,
   "summary":"The six rating states (1 Supportive leader ... 5 Oppositional leader + Unassessed) and their colours.",
   "tags":["rating","scale","supportive leader","supporter","neutral","opposed","unassessed","colours"],
   "associatedRoutes":["/campaigns/*"],"routeWeight":3,
   "prerequisites":[],"upNext":["E2","E3","C1"],
   "chapters":[{"t":0,"label":"Six states"}],
   "transcriptPath":"E1.transcript.txt","videoPath":"E1.mp4","downloadable":true}

CONSTRAINTS
- Use the EXACT level labels. Length is a ceiling. If the UI shown has changed, STOP
  and report.
```

## E2 — Create and configure an assessment

```
You are a technical how-to video producer for the OffshoreAlliance organising
database (Next.js app, apps/organising-db). Produce ONE short how-to video titled
"Create and configure an assessment" (target <= 150s). Work fully autonomously:
drive the app, capture screen + cursor, AI voice narration, assemble the clip.

ENVIRONMENT (recording only)
- Base URL: https://offshore-alliance-git-develop-reveille-strategy.vercel.app
  (develop preview, Supabase DEV). NEVER local, NEVER production.
- Log in: {{DEMO_LOGIN_EMAIL}} / {{DEMO_LOGIN_PASSWORD}}
- Viewport 1920x1080. One consistent AI narration voice. Demo data only.

PRODUCTION KIT (inherited)
- 3s intro + lower-third "Create and configure an assessment"; 2s outro "More guides
  in the how-to hub." Callout on every named control (EXACT labels). Glossary verbatim.

PREREQUISITE STATE
- The demo campaign exists with workers in scope, open at the Assessments sub-tab.

STARTING POINT
- Campaign -> Workforce -> "Assessments" sub-tab
  (/campaigns/[id]?tab=workforce&sub=assessments).

ON-SCREEN ACTIONS (in order)
1. Click "+ Add assessment".
2. Choose "From template" (or leave Custom); set a "Title" and "Description".
3. Show the "Binary outcome?" toggle: OFF = 1-5 scale; flip it ON to show the binary
   mode (e.g. attended / did not attend) and set the supporter outcome value; then
   set it back to your demo choice.
4. Optionally "link to ambitions" and mark one as primary.
5. Click "Create assessment".
6. Show the new assessment with its rating table and the distribution chart.

NARRATION (AI voice; <= 150s)
- Hook: "An assessment is a snapshot of where your workers stand on one question."
- Context: "Add one from a template or from scratch in a single dialog."
- Steps: one sentence per action. Explain binary vs 1-5 scale, and that linking to
  an ambition lets ratings roll up to your goals.
- Recap: "Assessment created — now let's rate some workers."

END CARD "UP NEXT" — clickable cards to:
- E3 "Rate workers (single, bulk, cumulative)"
- E1 "The rating scale, explained"
- D2 "Phone tasking: build a call list & scripts"

DELIVERABLES
- E2.mp4 + E2.vtt; E2.transcript.txt; chapter markers for steps > 20s.
- manifest record:
  {"id":"E2","title":"Create and configure an assessment","series":"E","durationSec":<actual>,
   "summary":"Create an assessment from a template or custom; choose binary vs 1-5 and link to ambitions.",
   "tags":["assessment","create assessment","template","binary","scale","ambition link","snapshot"],
   "associatedRoutes":["/campaigns/*"],"routeWeight":8,
   "prerequisites":["E1"],"upNext":["E3","E1","D2"],
   "chapters":[{"t":0,"label":"Add assessment"}],
   "transcriptPath":"E2.transcript.txt","videoPath":"E2.mp4","downloadable":true}

CONSTRAINTS
- EXACT labels in quotes. Length is a ceiling. If a control isn't found, STOP and report.
```

## E3 — Rate workers (single, bulk, cumulative)

```
You are a technical how-to video producer for the OffshoreAlliance organising
database (Next.js app, apps/organising-db). Produce ONE short how-to video titled
"Rate workers (single, bulk, cumulative)" (target <= 150s). Work fully autonomously:
drive the app, capture screen + cursor, AI voice narration, assemble the clip.

ENVIRONMENT (recording only)
- Base URL: https://offshore-alliance-git-develop-reveille-strategy.vercel.app
  (develop preview, Supabase DEV). NEVER local, NEVER production.
- Log in: {{DEMO_LOGIN_EMAIL}} / {{DEMO_LOGIN_PASSWORD}}
- Viewport 1920x1080. One consistent AI narration voice. Demo data only.

PRODUCTION KIT (inherited)
- 3s intro + lower-third "Rate workers"; 2s outro "More guides in the how-to hub."
  Callout on every named control (EXACT labels). Glossary verbatim.

PREREQUISITE STATE
- An assessment exists (from E2) with workers available to rate, in the demo campaign.
  (This clip also produces the ratings the wall-chart clips in Series C rely on.)

STARTING POINT
- The assessments table for the demo campaign, plus the wall chart.

ON-SCREEN ACTIONS (in order)
1. In the assessments table, click a worker's rating cell; in the picker choose
   "1 — Supportive leader"; show it saves immediately.
2. Select several workers (checkboxes); use the bulk rating dropdown to apply one
   rating to all.
3. Briefly show "Seed ratings from attributes".
4. Switch to the wall chart: click a tile to open the inline rating popover; set a
   rating; show the tile recolour.
5. Use the assessment selector to compare "Cumulative rating" vs the specific
   assessment.

NARRATION (AI voice; <= 150s)
- Hook: "Ratings power everything — colours, filters, call order, strength snapshots."
- Context: "There are three ways to set them, depending on how many you're doing."
- Steps: one sentence per action. Explain cumulative (overall) vs a single
  assessment.
- Recap: "With ratings in, your wall chart comes alive — see the wall chart guides."

END CARD "UP NEXT" — clickable cards to:
- C1 "The wall chart, explained"
- E2 "Create and configure an assessment"
- C2 "Filter, sort & switch views"

DELIVERABLES
- E3.mp4 + E3.vtt; E3.transcript.txt; chapter markers for steps > 20s.
- manifest record:
  {"id":"E3","title":"Rate workers (single, bulk, cumulative)","series":"E","durationSec":<actual>,
   "summary":"Rate workers inline, in bulk, and on the wall chart; compare cumulative vs per-assessment.",
   "tags":["rate workers","rating","bulk rate","inline","cumulative","assessment ratings","colours"],
   "associatedRoutes":["/campaigns/*"],"routeWeight":8,
   "prerequisites":["E1","E2"],"upNext":["C1","E2","C2"],
   "chapters":[{"t":0,"label":"Rate one worker"}],
   "transcriptPath":"E3.transcript.txt","videoPath":"E3.mp4","downloadable":true}

CONSTRAINTS
- EXACT labels in quotes. Length is a ceiling. If a control isn't found, STOP and report.
```

---

## Anchor pieces (already drafted)
The standalone prompts for the **long overview** (`OVERVIEW`) and the **interactive hub** (`HUB`) are in the workplan — see [HOW_TO_VIDEOS_WORKPLAN.md §4.3 and §4.4](HOW_TO_VIDEOS_WORKPLAN.md). Produce these LAST (after all 18 component clips), on **Opus 4.8**, since the overview must reference the finished clip titles/chapters and the hub is an application feature build.
