# Dropbox Integration — Research Brief & Recommendations

**Status:** Research only (2026-09-03, updated the same day after clarification of the Dropbox team topology, see §2.2). No code, schema, or Dropbox content was changed in this phase.
**Scope:** Bring the Offshore Alliance team's Dropbox filing system into the organising app (`apps/organising-db`) so that files are found, filed and shared from inside the campaign context the team already works in.
**Audience:** Troy (product owner), and the Claude Code agents that will implement the phases in §9.
**Companion docs:** `docs/DEVELOPMENT_WORKFLOW.md` (branch/env rules), `docs/OUTLOOK_OAUTH_SETUP.md` (the OAuth pattern this reuses), `CLAUDE.md`.

---

## 1. Executive summary

The team files in Dropbox but the app currently knows nothing about it: there is not a single reference to Dropbox in the codebase, the app's own document upload feature (campaign Library → Documents, backed by Supabase Storage) has **zero rows in production**, and every export the app produces (CSV, XLSX, Word survey, phone/SMS/activist exports, snapshots) downloads to the organiser's laptop and is filed by hand, if at all. The Agreement page has a "Documents" tab that is still a placeholder. In short, files are the one part of campaign work the app does not hold, and the low-Dropbox-literacy team is left to bridge that gap on their own.

The recommendation is **not** to build a file manager and **not** to mirror Dropbox into Supabase. It is to make the app the place where the team *encounters* Dropbox, so that the folder structure becomes something the app enforces rather than something people have to remember:

1. **Dropbox stays the system of record for files.** The app stores folder and file *identifiers* only, never file bodies.
2. **Every campaign, employer and agreement gets a bound Dropbox folder**, created by the app from a standard template, and shown in context (a campaign's files appear on the campaign page).
3. **Filing is done by the app, not the user.** Drag a file onto a campaign, pick what it is (flyer, employer letter, PABO application), and the app puts it in the right subfolder with a consistent name. "Save to Dropbox" sits beside every "Download".
4. **Access follows Dropbox permissions**, using per-user OAuth exactly the way the existing Outlook connection works (`user_oauth_connections`, encrypted tokens, PKCE routes). A team-level connection is added later only for background provisioning and indexing. The Offshore Alliance has its own Dropbox team; Troy reaches its folders as an external collaborator from his Reveille account, so the app must address folders by id and never assume two users see the same path (§2.2, §8.4).
5. **The folder structure is campaign-first and mirrors the app's entity model** (§7), so the two systems describe the world the same way.

This can be delivered in four phases (§9). Phase 0 is a Dropbox-side tidy-up and folder standard that needs no code; Phase 1 gives the team a working "campaign folder in the app" within one development cycle; Phases 2–4 extend to filing app outputs, bargaining attachments, activity feeds, search, file requests and AI-assisted filing.

**One thing I could not do:** the Dropbox folder tree on your Mac is not reachable from this environment (§2 lists exactly what to send so the structure recommendations in §7 can be reconciled with what exists today).

---

## 2. What I could and could not see

### 2.1 Reviewed

- The full monorepo (`apps/organising-db`, `apps/scraper`, `packages/*`, `supabase/migrations`, `docs/*`), including navigation, the campaign page and its Library tab, entity detail pages, import wizards, export utilities, the Outlook OAuth integration, cron jobs and the admin area.
- The **production Supabase project** (`gteygwfgjvczanmrwgbr`) via the Supabase MCP: table inventory and row counts, storage buckets, the `documents` table shape, `user_oauth_connections`, `app_settings`, campaign/employer/agreement columns, user roles.
- Dropbox's current developer documentation (OAuth guide, Team Files guide, Chooser, Saver, Embedder, file requests) to confirm what the API can and cannot do for a Business team space in 2026.

### 2.2 Not reachable: the Dropbox folder itself

This session runs in a remote container; `/Users/troyburton/Reveille Dropbox/Troy Burton` does not exist here and no Dropbox connector is attached. Everything in §7 about the *existing* structure is therefore inferred from the app's data model and from how Dropbox teams are laid out, not from your folders.

**Team topology (clarified by Troy).** The Offshore Alliance has its own Dropbox Business team. Every organiser is a member of that team only, so for them the OA structure *is* their team space: on their Macs it appears at `/[OA team name] Dropbox/...`. Troy is a member of a different team (Reveille), and one Dropbox account can belong to only one team, so the OA folders reach him as an **external share** mounted inside his Reveille member folder (`/Reveille Dropbox/Troy Burton/...`). Three consequences run through the rest of this brief:

- The same folder has a different `path_display` for Troy than for an OA member, and a different local path. The app must bind and address folders by **id**, and render local paths per connection (§8.4).
- Dropbox does not let a team folder itself be shared outside the team, only subfolders within it. Whatever Troy sees as "the OA folder" is therefore either a shared folder owned by an OA member, or a subfolder of an OA team folder shared out to him. Which one it is decides how the standard in §7 is applied (§7.4).
- Anything that needs an OA **team admin** (the team-linked app in Phase 4, team-folder creation, subfolder permissions) cannot be done from Troy's Reveille account. Either an OA member who is a team admin performs those steps, or Troy holds a second, OA-team account for admin work.

### 2.3 What to send so the structure analysis can be completed

Run these in Terminal on the Mac and send the two text files plus the answers:

```bash
# 1. Directory tree of the OA folder, four levels deep (no file names, no dot-folders)
cd "/Users/troyburton/Reveille Dropbox/Troy Burton"     # Troy's external mount; an organiser would use "/Users/<name>/<OA team> Dropbox"
find "<OA folder name>" -type d -not -path '*/.*' -maxdepth 4 | sort > ~/Desktop/oa-dropbox-tree.txt

# 2. Where the files actually are: file count per folder, busiest first
find "<OA folder name>" -type f -not -name '.*' | sed 's|/[^/]*$||' | sort | uniq -c | sort -rn | head -80 > ~/Desktop/oa-dropbox-counts.txt

# 3. File types in use (helps preview/filing rules)
find "<OA folder name>" -type f -not -name '.*' | sed -n 's/.*\.\([A-Za-z0-9]*\)$/\1/p' | tr 'A-Z' 'a-z' | sort | uniq -c | sort -rn | head -30
```

And answer, from the Dropbox web app / admin console:

1. In the **OA team's** admin console (Content), is the structure a **team folder** or a **shared folder** owned by a member, and which folder(s) exactly are shared out to Troy's Reveille account?
2. Which Dropbox plan is the OA team on (Standard / Advanced / Business Plus / Enterprise), and who are its **team admins**? Does Troy have, or want, a separate OA-team account for admin tasks?
3. Who is on the OA Dropbox team, and does it map 1:1 to the app's 13 users? Are there other external collaborators (AWU/MUA staff, lawyers, designers)?
4. Are there folders that must stay restricted (legal advice, HR, member data), and who may see them?
5. Any naming conventions already in use, even informal ones (e.g. how a campaign folder is named today).
6. Roughly how many files and how much data (Admin console → Content, or Finder "Get Info" on the folder).
7. The exact team name as it appears in the desktop path on an organiser's Mac (`/[Team name] Dropbox/`), so the app can render the path organisers actually see.

---

## 3. Current state: how the app handles files today

| Area | What exists | Evidence | Assessment |
|---|---|---|---|
| Campaign Library → Documents | Upload to Supabase Storage bucket `campaign-documents`, 7 doc types, download via 60-second signed URL, delete = admin only | `src/components/campaigns/library/campaign-library-documents.tsx`; migration `20260521010000_library_campaign_documents.sql` | **Unused: `documents` has 0 rows in prod.** Duplicates Dropbox; should be replaced by the Dropbox folder view. |
| `documents` table | `title, document_type, file_path, agreement_id, employer_id, campaign_id, uploaded_by` | `0001_initial_schema.sql` | Shape is fine as a *link* record but `file_path` assumes Supabase Storage. Retire or repurpose (§8). |
| Storage buckets | `documents` (private, unused), `campaign-documents` (private, unused), `help-videos` (public, in use) | `storage.buckets` | Only `help-videos` should remain load-bearing. |
| Agreement page → Documents tab | Placeholder text "Upload and manage documents here." | `src/app/(dashboard)/agreements/[id]/page.tsx` ~line 1309 | Obvious slot for the agreement's Dropbox folder. |
| Employer / Worksite / Worker pages | No document surface at all | tab lists in each `[id]/page.tsx` | Employer needs one; worksite optional; worker should **not** get one (PII, see §10). |
| Bargaining records | `member_endorsement_votes.proposal_document_url` is a free-text URL; `agreements.fwc_link` likewise | migrations `20260513100000`, `0001` | Existing "paste a link" pattern; should become a Dropbox file link (§6.3). |
| Inbound email | `email_messages.attachments` and `email_imports.attachments` JSONB hold attachment metadata from SendGrid inbound parse | `20260820100000_sendgrid_email_platform.sql` | Attachments are never filed anywhere. Prime "file this to the campaign" candidate. |
| App outputs | CSV/XLSX exports (`src/lib/utils/export.ts`, `src/lib/api/csv.ts`), Word survey (`.../sms-surveys/[surveyId]/document/route.ts`), phone attempts / SMS list / activist exports, weekly JSON snapshots | routes under `src/app/api/campaigns/[id]/**/export` | All download to the local machine. Every one is a "Save to Dropbox" candidate. |
| App inputs | Worker, membership, reference-data, campaign, participation, SMS/email audience imports all use a local `<input type="file">` | `src/components/import/*`, `.../participation-import/step-source.tsx` | "Pick from Dropbox" is a natural second source. |
| OAuth integration pattern | Microsoft: PKCE `start/callback/status/disconnect` routes, AES-256-GCM token storage, `useOutlookConnection` hook, `OutlookConnectionCard` (card + inline variants) | `src/app/api/oauth/microsoft/*`, `src/lib/security/oauth-tokens.ts`, `src/lib/integrations/microsoft-*.ts` | **Directly reusable.** `user_oauth_connections.provider` CHECK currently allows only `microsoft`/`google`. |
| Admin configuration | `app_settings` key/value (admin-only writes); Administration page has System / Data / Settings / Monitoring tabs | `app_settings` | Home for Dropbox root folder id, template, feature flag. |
| Navigation | Sidebar: Campaigns, Dashboard, Overview, Worksites, Upcoming Projects, Email Inbox, SMS Tools, SMS Inbox, Reports, Guides (+ admin items) | `src/components/layout/sidebar.tsx` | Files should live *inside* campaigns first; an org-wide "Files" entry comes later (§5.4). |
| Learning surface | Guides page driven by `public/help-videos/manifest.json`, clips produced by agent prompts | `src/app/(dashboard)/help/page.tsx`, `docs/HOW_TO_VIDEOS_*` | Add "Where do files go?" and "File something to a campaign" clips. |
| Users | 13 profiles: 11 `admin`, 2 `user`; work roles coordinator, lead organiser, organiser, industrial officer/co-ordinator | `user_profiles` | Almost everyone is an app admin, so **Dropbox permissions, not app roles, must be the access boundary for sensitive files.** |
| Background jobs | Vercel cron (`vercel.json`); no Supabase edge functions | `apps/organising-db/vercel.json` | A `/api/cron/dropbox-sync` job fits the existing pattern. |

---

## 4. Dropbox capabilities that shape the design (verified against current docs)

| Capability | What it gives us | Notes |
|---|---|---|
| **Scoped OAuth 2 with PKCE and refresh tokens** | Same flow as the Outlook integration. `token_access_type=offline` returns a long-lived refresh token that does not rotate; short-lived access tokens are refreshed on demand. | Scopes needed: `account_info.read`, `files.metadata.read`, `files.content.read`, `files.content.write`, `sharing.read`, `sharing.write`, later `file_requests.write`. Access type must be **Full Dropbox** (App-folder apps cannot see existing content). |
| **Team space addressing** | `/2/users/get_current_account` returns `root_namespace_id` vs `home_namespace_id`. Sending `Dropbox-API-Path-Root: {".tag":"root","root":"<root_namespace_id>"}` makes calls operate on the *team space* so team folders resolve at `/<team folder>/...`. | Without the header, calls default to the member's home folder and team folders are invisible. Teams still on the legacy layout use `/2/team/team_folder/list` instead; the guide is explicit that only one of the two applies. For an external collaborator such as Troy the OA folders are mounted shared folders inside *his* root, so the same header rule (root = that user's own `root_namespace_id`) plus **id-based addressing** works uniformly for both kinds of user. |
| **Team-linked apps** | With the `team_data.member` scope, a team token plus `Dropbox-API-Select-User: <member_id>` acts as a member; `Dropbox-API-Select-Admin` bypasses per-member permissions. | Powerful and broad. Use only for provisioning and indexing (Phase 4), never for user-facing browsing. Needs a team admin to authorise. |
| **Listing, metadata, cursors** | `/2/files/list_folder` (+ `/continue`, `/longpoll`), `get_metadata`, `search_v2` scoped to a path. | Folder and file **ids** are stable across renames and moves; store ids, cache `path_display`. |
| **Downloads and previews** | `get_temporary_link` (4-hour direct link, no token exposure), `get_thumbnail_v2` (images, PDFs, Office docs), `get_preview` (PDF/HTML preview of Office docs). | Enough for in-app preview without a shared link. |
| **Uploads** | `/2/files/upload` (≤150 MB), `upload_session/*` for larger; `create_folder_v2`, `move_v2`, `copy_v2`. | Server-side only (tokens never reach the browser). Keep `move`/`delete` out of v1. |
| **Shared links** | `sharing/create_shared_link_with_settings` with `audience: team` (team-only), optional password/expiry; `list_shared_links` to reuse. | Prefer team-audience links for anything shown outside the app; never create public links from the app by default. |
| **Drop-ins (dropins.js, app key only)** | *Chooser* (pick files, returns preview/direct links, optional folder select), *Saver* (save a URL into a user-chosen Dropbox folder), *Embedder* (embed a file **or folder** from a shared link; folder view list/grid). | Zero-backend options useful for Phase 0 and as fallbacks. Embedder needs a shared link and a whitelisted domain; team-audience links require the viewer to be signed in to Dropbox. |
| **File requests** | `/2/file_requests/create` with title, destination folder, deadline (Business plans), open/close. | Lets delegates or members upload into a campaign folder without a Dropbox account. |
| **Change notifications** | App webhooks (per linked user) and `list_folder/longpoll`. | Feed the "recently changed" surfaces and an index cache without polling every page load. |
| **App status** | Apps in *Development* status are limited to 50 linked users; *Production* status is a short review. | 13 users fits development status; apply for production before rollout anyway. |

### Integration modes compared

| Mode | Who authorises | Access model | Pros | Cons | Recommendation |
|---|---|---|---|---|---|
| A. Links only (no API) | Nobody | Paste Dropbox web links onto entities; Embedder for folder previews | Days to ship; no tokens | No filing, no upload, manual link hygiene, previews need shared links | **Phase 0 stop-gap** while the folder standard is agreed |
| B. Per-user OAuth (like Outlook) | Each organiser once | Dropbox enforces each person's own permissions; every action attributable | Safe by construction; reuses existing code; no admin approval to start | Each person must connect; offline jobs can only act as users who connected | **Primary mode (Phases 1–3)** |
| C. Team-linked app | Team admin once | App acts as any member (`Select-User`) or as admin | Provisioning, indexing, governance checks independent of who is logged in | Broad credential; audit attribution needs care; requires team-admin consent and plan support | **Add in Phase 4** for provisioning, sync and governance only |
| D. Mirror files into Supabase Storage | n/a | Copy of every file in the DB | App fully self-contained | Doubles PII footprint, cost, and creates two sources of truth | **Rejected** |

---

## 5. Recommended UX integration

### 5.1 Principles for this team

- **Context, not a file manager.** Nobody should open a "Dropbox" screen to find a campaign's files; they open the campaign. The folder shows up where the work is.
- **The app knows the structure so people don't have to.** Uploads ask *what* the file is, never *where* it goes. The subfolder and file name are derived.
- **Bridge to Finder, not away from it.** Users who live in Finder get a copyable local path (`[OA team] Dropbox/OA Files/01 Campaigns/UGL – Varanus – 2026/3 Comms`) and an "Open in Dropbox" button. The path is rendered per connection, so Troy sees his Reveille mount path while organisers see the team-space path. On a phone, the same button opens the Dropbox app.
- **Read first, write carefully.** Browsing, previewing, downloading and uploading in v1. No moving, renaming or deleting from the app until the team trusts it.
- **Same words everywhere.** Folder names, app doc types and filing guide use one vocabulary (§7.3).
- **Guardrails over training.** A file dropped in the wrong place is nudged, not blocked; the app's "unfiled" list is the teaching tool.

### 5.2 Surface by surface

**Campaign page → Library tab (replace the Documents sub-tab)**

- Header: campaign folder name, "Open in Dropbox", "Copy path", connection state ("Connected as troy@…" or a one-click *Connect Dropbox*).
- Left: the standard subfolders (Plan, Workforce, Comms, Bargaining, Legal & Correspondence, Media, Archive) with counts. Right: file list for the selected subfolder (name, kind icon, modified, who, size), sorted newest first, with quick preview (thumbnail / PDF preview in a sheet) and download (temporary link).
- **Drop zone** across the whole tab: drop a file → small sheet asks "What is this?" (doc type chips) → app names and files it → toast "Filed to 3 Comms as 2026-09-03 Flyer – Roster fatigue.pdf".
- "Recently changed" strip at the top (last 10 changes anywhere in the campaign folder) so teammates' work is visible.
- Empty state for an unbound campaign: "This campaign has no Dropbox folder yet. *Create the standard folder* (creates `01 Campaigns/<name>` with the subfolders)". Admin can instead *Link an existing folder* (folder picker limited to `01 Campaigns`).

**Campaign creation wizard (step 1 → 2)**

- After the campaign is created, create and bind its Dropbox folder automatically (fire-and-forget, with a retry button on the Library tab if it fails or the creator has no connection).

**Agreement page → Documents tab (fill the placeholder)**

- Same component bound to `02 Employers/<Employer>/Agreements/<EA short name>`. Shows the signed EA, FWC decision, variations. `fwc_link` stays as is.

**Employer page → new Documents tab**

- Bound to `02 Employers/<Employer>`. Corporate info, contacts, correspondence that outlives a campaign.

**Bargaining pages (votes, PABO, decisions, actions)**

- Replace the `proposal_document_url` text box with an *Attach from Dropbox* control (in-app picker scoped to the campaign's `4 Bargaining` folder, or an upload that files there). Renders as a file chip with preview.

**Exports and generated documents (everywhere there is a Download)**

- Add *Save to Dropbox* beside *Download*. Saves to the campaign folder's matching subfolder with the standard name (e.g. `2 Workforce/2026-09-03 Phone attempts – Round 2.csv`). For org-wide reports, saves to `05 Sector & Research/Reports`.

**Email inbox (campaign scoped)**

- Attachment chips get *File to campaign*; the app pulls the attachment bytes from the stored email and uploads them into `5 Legal & Correspondence` (or the type chosen).

**Import wizards**

- Source step gains *Choose from Dropbox* (in-app picker limited to spreadsheet types). Keeps the local upload path.

**Administration → Settings**

- Dropbox card: connection status for the current admin, root folder binding (`Offshore Alliance` team folder id), template version, feature flag, health (last sync, last error), "Re-provision missing subfolders" action.

**Guides**

- Two clips: "Where do files go?" (the structure, 60 s) and "File something to a campaign" (drop zone, 60 s).

### 5.3 Mobile

The app already has a mobile device context. On mobile the Library tab collapses to the file list; *Open in Dropbox* deep-links into the Dropbox app via the web URL; upload uses the phone's file/photo picker so a photo from a site visit can be filed to `6 Media` on the spot.

### 5.4 Later: an org-wide Files entry

Once campaigns, employers and agreements are bound, a sidebar *Files* page (search across the OA folder, "changed this week", "unfiled" list) becomes useful. It is deliberately not in Phase 1: the team should meet Dropbox inside campaigns first.

---

## 6. Extensions beyond basic filing

Ordered roughly by value ÷ effort. Items marked **(structure)** depend on the folder standard in §7.

1. **Auto-provisioned folders (structure).** Creating a campaign/employer/agreement creates its folder from a template stored in `app_settings`. Closing a campaign offers "Move to 9 Archive" (an explicit admin action, never automatic).
2. **Filing assistant.** Doc-type → subfolder + naming rules in a pure module (`lib/dropbox/filing.ts`) so it is unit-tested and shared by uploads, "Save to Dropbox", and email filing.
3. **Unfiled / misfiled nudges (structure).** A cron lists files sitting directly in a campaign root or in `Archive` with recent activity, and the Library tab shows "3 files need filing" with one-click moves (the first write-beyond-upload we should allow, because it only moves files the app can see are misplaced).
4. **Activity feed.** "Files changed this week" on the campaign Overview and the Dashboard, built from an index cache refreshed by webhook/cron rather than live listing.
5. **Search within a campaign** using `search_v2` scoped to the bound folder; later org-wide.
6. **File requests for delegates and members.** From the leader task page or call-share page, generate a Dropbox file request into `6 Media` or `2 Workforce/Petitions` so photos, signed petitions or forms arrive without a Dropbox account. Deadlines close the request automatically.
7. **AI-assisted filing.** On upload, Claude reads the first page (via `get_preview` text or the uploaded bytes) and proposes doc type, subject line and whether it belongs to a different campaign; the user confirms. Uses the existing `@anthropic-ai/sdk` route pattern and rate-limit middleware.
8. **Comms artefacts as files.** When a comms draft is sent (email/SMS), optionally file the rendered artefact as PDF/HTML into `3 Comms/Sent` so the campaign folder is a complete record. (Structure: needs a `Sent` subfolder.)
9. **Snapshots and reports to Dropbox.** The weekly reporting snapshot cron writes a PDF/CSV summary into `05 Sector & Research/Reports/<campaign>` so leadership can read it without the app.
10. **Employer and agreement documents cross-linked.** A campaign folder gets a *shortcut* card to the employer folder and primary agreement folder (links, not duplicated files).
11. **Governance dashboard (team-linked, Phase 4).** Which folders exist without a bound entity, which entities lack a folder, permission drift on restricted folders, total size, stale campaigns.
12. **Worker-level attachments are deliberately excluded.** Anything personal about an individual (membership forms, medical, disputes) should live in a restricted `08 Membership data` area governed by Dropbox permissions, not surfaced on worker profiles in an app where 11 of 13 users are admins.

---

## 7. Recommended Dropbox folder structure

### 7.1 Design intent

- **One team folder** in the OA team space (working name `OA Files`; the team name already says "Offshore Alliance") holding the numbered areas as subfolders. Every OA member then sees the identical path (`[OA team] Dropbox/OA Files/...`), restricted areas are handled with subfolder permissions, and external collaborators such as Troy can be given the specific subfolders they need (team folders cannot be shared externally as a whole, subfolders can). The alternative, one team folder per numbered area, gives cleaner per-area permissions but makes external sharing and the app's root binding fiddlier; choose it only if the plan lacks subfolder permissions.
- **Campaign-first**, because that is how the app and the team think. Things that outlive a campaign (employer, agreement) get their own home so they are not buried in whichever campaign happened first.
- **Shallow and numbered at the top level only.** Numbers order Finder and the Dropbox web list the way the team should read them (start here, then campaigns); inside a campaign the single-digit prefixes do the same for the workflow order.
- **Names come from the app.** A campaign folder is named exactly like the app campaign; the app records the folder id so a rename on either side does not break the link.

### 7.2 Proposed tree

```text
[OA team] Dropbox/                         ← the OA team space, as every organiser sees it
└── OA Files/                              ← one team folder; Troy sees its subfolders mounted in Reveille Dropbox/Troy Burton/
    ├── 00 Start here/                     README, filing guide, naming rules, this brief
    ├── 01 Campaigns/
    │   ├── UGL – Varanus – 2026/          ← one folder per app campaign (app creates & binds)
    │   │   ├── 1 Plan/                    P2W exports, section plans, situation analysis
    │   │   ├── 2 Workforce/               worker lists, wall-chart exports, phone rounds  (PII: restricted to the campaign's organisers)
    │   │   ├── 3 Comms/                   flyers, emails, SMS scripts, social;  3 Comms/Sent for records
    │   │   ├── 4 Bargaining/              log of claims, employer proposals, PABO, ballots, EA drafts
    │   │   ├── 5 Legal & Correspondence/  FWC filings, legal advice, company letters
    │   │   ├── 6 Media/                   articles, photos, video
    │   │   └── 9 Archive/                 superseded versions (never deleted from here by the app)
    │   ├── ESS – Woodside – 2026/
    │   └── Deck Officers & Engineers – Sector – 2026/
    ├── 02 Employers/
    │   └── UGL/                           ← one per app employer that has documents
    │       ├── Corporate & contacts/
    │       ├── Correspondence/            employer-level letters not tied to a campaign
    │       └── Agreements/
    │           └── UGL Varanus EA 2023/   ← one per app agreement: signed EA, FWC decision, variations
    ├── 03 Worksites & Projects/           site maps, inductions, project scopes (optional; bound only when used)
    ├── 04 Sector & Research/
    │   ├── Research/
    │   ├── Upcoming projects/
    │   └── Reports/                       app snapshots and exported reports
    ├── 05 Templates & Brand/              flyer templates, letterheads, SOC Field Guide, logos
    ├── 06 Team & Operations/              meeting notes, rosters, workload  (HR subfolders restricted)
    └── 08 Membership data (restricted)/   membership exports, forms, anything about individuals
```

Mapping to the app's doc types (`campaign-library-documents.tsx`): flyer/social → `3 Comms`; company-correspondence and legal-correspondence → `5 Legal & Correspondence`; media-article → `6 Media`; research → `1 Plan` (or `04 Sector & Research` when not campaign-specific); other → prompt for a subfolder. Add `bargaining` and `workforce` as first-class types.

### 7.3 Naming rules (put in `00 Start here/Filing guide`)

- **Campaign folder:** `<Employer> – <Client or site> – <Year started>`, matching the app's campaign name. Sector campaigns use `– Sector –`.
- **File:** `YYYY-MM-DD <Type> – <Subject> v<n>.<ext>`, e.g. `2026-09-03 Flyer – Roster fatigue v2.pdf`, `2026-08-14 Employer letter – Response to log of claims.pdf`. The app generates this for anything it files; humans are asked to follow it and the "unfiled" nudge flags files without a date prefix.
- **Versions:** newer versions replace in place (Dropbox keeps history); superseded files that must be kept go to `9 Archive`.
- **No personal names in campaign folders.** Individual member matters go to `08 Membership data`.

### 7.4 Migrating from what exists today

Without the tree (§2.3) this can only be sketched, but the likely steps are:

1. **Make the root a team folder in the OA team space** if it is currently a shared folder owned by a member (Admin console → Content → convert, or create the team folder and move; an OA team admin must do this). Then re-share the subfolders Troy needs to his Reveille account. This is the single biggest UX improvement for organisers because the path becomes identical for everyone on the team and no longer depends on one member's account.
2. **Map existing top-level folders** to the tree above. Expect most content to be employer- or campaign-named already; the reconciliation table (old path → new path) is a Phase 0 deliverable and is executed by a person in Finder or the Dropbox web app, never by an agent.
3. **Bind, don't move, where possible.** Existing campaign folders can be linked to app campaigns by id and only *subfolders* added, so nothing breaks for people with local shortcuts.
4. **Restricted folders** (`2 Workforce`, `08 Membership data`, HR) need subfolder permissions. Confirm the Reveille plan supports team-folder subfolder permissions (Business plans generally do; verify in the admin console before relying on it).
5. Publish the filing guide in `00 Start here` and as a Guides clip.

---

## 8. Architecture and data model (proposed, for the implementation phases)

### 8.1 Server modules (mirroring the Microsoft integration)

```text
src/lib/integrations/dropbox.ts            OAuth URLs, token exchange/refresh, typed API client (fetch-based, no SDK needed)
src/lib/integrations/dropbox-connection.ts getDropboxAccessToken(userId) — decrypt, refresh, persist (clone of microsoft-connection.ts)
src/lib/dropbox/filing.ts                  pure: docType → subfolder, file naming, campaign folder naming   (vitest)
src/lib/dropbox/paths.ts                   pure: local-path rendering, path root header builder            (vitest)
src/lib/dropbox/template.ts                folder template (versioned JSON) + provisioning diff
src/app/api/oauth/dropbox/{start,callback,status,disconnect}/route.ts
src/app/api/dropbox/folders/[binding]/list|upload|temporary-link|thumbnail/route.ts
src/app/api/dropbox/bindings/route.ts      create/link/unlink a folder binding for an entity
src/app/api/cron/dropbox-sync/route.ts     index refresh + unfiled detection (Phase 3)
src/lib/hooks/useDropboxConnection.ts      clone of useOutlookConnection
src/components/dropbox/DropboxConnectionCard.tsx, DropboxFolderPanel.tsx, DropboxDropZone.tsx, DropboxFilePicker.tsx, SaveToDropboxButton.tsx
```

### 8.2 Schema (one migration per phase, timestamped, dev first)

```sql
-- Phase 1
ALTER TABLE user_oauth_connections DROP CONSTRAINT IF EXISTS user_oauth_connections_provider_check;
ALTER TABLE user_oauth_connections ADD CONSTRAINT user_oauth_connections_provider_check
  CHECK (provider IN ('microsoft','google','dropbox'));
-- Per-connection view of the OA root: namespaces and where the OA root is mounted for *this* user
-- (team-space path for OA members; "/Troy Burton/<shared folder>" style mount for an external collaborator).
CREATE TABLE dropbox_connection_roots (
  connection_id     BIGINT PRIMARY KEY REFERENCES user_oauth_connections(connection_id) ON DELETE CASCADE,
  root_namespace_id VARCHAR(40) NOT NULL,
  home_namespace_id VARCHAR(40) NOT NULL,
  is_oa_team_member BOOLEAN NOT NULL,          -- false for external collaborators (Reveille account)
  oa_root_mount_path TEXT,                     -- path_display of the OA root as seen by this user
  desktop_prefix    TEXT,                      -- e.g. "Offshore Alliance Dropbox" or "Reveille Dropbox/Troy Burton"
  resolved_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE dropbox_folder_bindings (
  binding_id      SERIAL PRIMARY KEY,
  entity_type     VARCHAR(20) NOT NULL CHECK (entity_type IN ('campaign','employer','agreement','worksite','program','org')),
  entity_id       INTEGER NOT NULL,                 -- 0 for 'org' (the root binding)
  dropbox_folder_id VARCHAR(80) NOT NULL,           -- "id:..." stable across renames
  path_display    TEXT NOT NULL,                    -- cached for display / local path
  namespace_id    VARCHAR(40),                      -- team space root namespace
  template_version INTEGER NOT NULL DEFAULT 1,
  status          VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','missing','archived')),
  -- path_display above is the OA-team view; external users get their own view from dropbox_connection_roots.
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id)
);

-- Phase 2
CREATE TABLE dropbox_file_links (                   -- "this record points at that file"
  link_id         SERIAL PRIMARY KEY,
  entity_type     VARCHAR(40) NOT NULL,             -- 'endorsement_vote','pabo_application','decision_point','campaign_activity',...
  entity_id       INTEGER NOT NULL,
  purpose         VARCHAR(40),                      -- 'proposal_document', 'ballot_paper', ...
  dropbox_file_id VARCHAR(80) NOT NULL,
  name            TEXT NOT NULL,
  path_display    TEXT NOT NULL,
  rev             VARCHAR(40),
  size_bytes      BIGINT,
  added_by        UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Phase 3
CREATE TABLE dropbox_index (                        -- cache of file metadata per bound folder for feeds/search/unfiled
  dropbox_file_id VARCHAR(80) PRIMARY KEY,
  binding_id      INTEGER REFERENCES dropbox_folder_bindings(binding_id) ON DELETE CASCADE,
  name TEXT, path_lower TEXT, path_display TEXT, subfolder VARCHAR(60),
  size_bytes BIGINT, server_modified TIMESTAMPTZ, modified_by_email TEXT, is_unfiled BOOLEAN DEFAULT false,
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE dropbox_sync_cursors (binding_id INTEGER PRIMARY KEY REFERENCES dropbox_folder_bindings(binding_id) ON DELETE CASCADE, cursor TEXT, synced_at TIMESTAMPTZ);
```

RLS follows the house pattern (authenticated read; writes via `can_write_to_campaign()` / `is_admin()`; token columns never selectable by clients). The legacy `documents` table and the `documents`/`campaign-documents` buckets are left in place in Phase 1 and dropped in a later cleanup migration once the Library tab no longer references them.

### 8.3 Configuration

| Where | Key | Purpose |
|---|---|---|
| Env (Vercel, per environment) | `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET`, `DROPBOX_REDIRECT_URI` | OAuth app credentials (add to `turbo.json` `env` list) |
| Env | `NEXT_PUBLIC_DROPBOX_APP_KEY` | Only if drop-ins (Chooser/Saver/Embedder) are used; the app key is public by design |
| Env | `OAUTH_TOKEN_ENCRYPTION_KEY` | Already exists; reused |
| DEV sandbox | a folder Troy owns in his Reveille account, shared to the dev test accounts, bound by id as the DEV `dropbox_root_folder_id` | Keeps development entirely out of the OA team space; nothing in the app depends on which team owns the root |
| `app_settings` | `dropbox_enabled`, `dropbox_root_folder_id`, `dropbox_root_namespace_id`, `dropbox_template_version`, `dropbox_team_token_ct` (Phase 4 only) | Runtime configuration, admin-editable |

### 8.4 Security posture

- **Address by id, never by path.** Bindings store `id:` values; `path_display` is a per-user cache. The same folder has different paths for OA members and for Troy's external mount, and paths change on rename. Every files/sharing call sends `Dropbox-API-Path-Root` with the *calling user's* `root_namespace_id`.
- Tokens are server-only, encrypted with the existing AES-256-GCM helper; API routes never return them; drop-ins only ever see the public app key.
- All Dropbox calls go through the server with the *acting user's* token, so Dropbox's own permissions are the ceiling. The app adds its usual `canWrite` gate on top.
- Uploads are validated (size ≤150 MB via single upload; MIME allow-list) and named by the filing module; user-supplied names are sanitised.
- No `delete` endpoint is ever called by the app. `move_v2` is limited to the "unfiled → subfolder" nudge in Phase 3 and always logged to `worker_activity_log`-style audit (a `dropbox_audit` table or reuse of `oauth_send_batches` pattern).
- Shared links, if created, default to `audience: team`.
- The Phase 4 team token is a break-glass credential: stored encrypted in `app_settings`, used only by cron and admin actions, with `Dropbox-API-Select-User` set to the acting admin's member id so Dropbox's audit log still shows a person. It must be authorised by an **OA team admin account**; Troy's Reveille account cannot grant it.

---

## 9. Implementation plan

| Phase | Goal | Code? | Depends on | Effort (one agent) |
|---|---|---|---|---|
| **0. Standard & tidy-up** | Agree the tree (§7), convert to a team folder, reconcile existing folders, publish filing guide, register the Dropbox app | No app code | §2.3 inputs, Troy as Dropbox admin | 1–2 days human + 1 agent session for the reconciliation table |
| **1. Connect & bind** | Per-user Dropbox connection; campaign folder binding + auto-provisioning; Library tab shows the campaign folder (browse, preview, download, drag-drop upload with filing) | Yes | Phase 0 app registration, env vars | 1 cycle |
| **2. File everything** | Save-to-Dropbox on exports/generated docs; email attachment filing; bargaining file links; agreement and employer folders; Dropbox as an import source | Yes | Phase 1 | 1 cycle |
| **3. Awareness** | Index cache + cron/webhook; recently-changed feeds; unfiled nudges with one-click move; search within campaign; Guides clips | Yes | Phase 2 | 1 cycle |
| **4. Extensions** | File requests for delegates; AI filing suggestions; team-linked provisioning/governance; snapshots to Dropbox; org-wide Files page | Yes | Phase 3, team admin consent | 1–2 cycles, pick by value |

### Phase 0 — Standard and tidy-up (no code)

Deliverables: `docs/DROPBOX_FOLDER_STANDARD.md` (final tree + naming), a reconciliation table (old → new) produced from the tree export, the `00 Start here` guide, a registered Dropbox app (scoped, Full Dropbox, redirect URIs for prod, develop preview and localhost, domain whitelist for drop-ins), and env vars set in Vercel for both environments. Acceptance: every current app campaign with files has a folder in `01 Campaigns` named as §7.3; the path is identical for two different team members.

### Phase 1 — Connect and bind

Work items:
1. Migration: provider CHECK extension; `dropbox_folder_bindings`; `app_settings` keys.
2. `lib/integrations/dropbox*.ts`, OAuth routes cloned from Microsoft (cookies scoped to `/api/oauth/dropbox`), `useDropboxConnection`, `DropboxConnectionCard` on Administration → Settings and inline in the Library tab empty state.
3. `lib/dropbox/filing.ts` + `paths.ts` + `template.ts` with vitest coverage.
4. Bindings API: create-from-template, link-existing (folder picker constrained to `01 Campaigns`), unlink (admin).
5. `DropboxFolderPanel` in the Library tab replacing `CampaignLibraryDocuments`; list, subfolder rail, preview sheet (thumbnail/PDF preview), download via temporary link, "Open in Dropbox", "Copy path".
6. `DropboxDropZone` upload with doc-type sheet; uploads go through `/api/dropbox/.../upload` with the acting user's token.
7. Campaign wizard: provision folder after create (non-blocking, retryable).
8. Feature flag `dropbox_enabled` so the old Documents sub-tab can be shown until Phase 0 is done in an environment.

Acceptance: an organiser connects once, opens any bound campaign and sees its Dropbox files, drops a PDF, chooses "Flyer", and the file appears in `3 Comms` in Finder within seconds with the standard name; a viewer-role user can browse but not upload; disconnecting removes only the local row.

### Phase 2 — File everything

Save-to-Dropbox component wrapping every export route (server-side: generate → upload → return path); email attachment filing from the campaign inbox; `dropbox_file_links` and the *Attach from Dropbox* control on votes/PABO/decisions; agreement Documents tab and employer Documents tab bound to `02 Employers/...`; import wizard "Choose from Dropbox" source. Acceptance: no Download button in a campaign lacks a Save-to-Dropbox twin; a proposal document on a vote opens a preview rather than an external URL.

### Phase 3 — Awareness

`dropbox_index` + cursors, `/api/cron/dropbox-sync` (every 10 minutes, registered in `vercel.json`), optional webhook endpoint; "Recently changed" on Library and Overview; "Files changed this week" tile on Dashboard; unfiled detection and one-click move (logged); `search_v2` within the campaign; two Guides clips using the existing how-to pipeline. Acceptance: a file added in Finder shows in the app within one cron interval; a file dropped in the campaign root appears in "needs filing".

### Phase 4 — Extensions (choose by value)

File requests from leader/call-share pages; AI filing suggestion on upload; team-linked app + governance dashboard; snapshots/reports to `04 Sector & Research/Reports`; org-wide Files page; archive-on-close.

### Workflow for every code phase

Follows `docs/DEVELOPMENT_WORKFLOW.md` Workflow B: build on `develop` (or a short feature branch off it), migration applied to DEV first, types regenerated from DEV, test on the develop preview with the *dev* Dropbox app credentials pointed at a **sandbox folder** (`Offshore Alliance (DEV)`, owned by Troy in Reveille and shared to the test accounts, never inside the OA team space), then promote. One commit per completed phase, no worktrees, per `CLAUDE.md`.

---

## 10. Agent instructions

### 10.1 Global guardrails (paste into every Dropbox phase prompt)

```text
You are implementing the Dropbox integration for the Offshore Alliance organising app.
Read first: CLAUDE.md, docs/DEVELOPMENT_WORKFLOW.md, docs/DROPBOX_INTEGRATION_BRIEF.md (§7–§9),
docs/OUTLOOK_OAUTH_SETUP.md, and the Microsoft integration you are mirroring:
  src/app/api/oauth/microsoft/*, src/lib/integrations/microsoft-*.ts,
  src/lib/security/oauth-tokens.ts, src/lib/hooks/useOutlookConnection.ts,
  src/components/email/composer/OutlookConnectionCard.tsx.

Non-negotiables
- Dropbox is the system of record. Store folder/file ids and cached display paths only; never store file bodies in Supabase.
- Never call files/delete_v2 or permanently_delete. Do not call move_v2 or copy_v2 unless the phase plan names the exact use.
- Never rename or restructure existing Dropbox folders. Create new folders only under the bound parent named in the plan.
- Tokens are server-only: encrypt with lib/security/oauth-tokens.ts, never log them, never return them from an API route,
  never call Dropbox from client components.
- Send Dropbox-API-Path-Root with the *calling user's* root_namespace_id on every files/* and sharing/* call so team folders resolve.
- Address every folder and file by its Dropbox id. Never persist a path as the key, never compare paths between users:
  the OA team members see the team-space path, Troy (Reveille account, external collaborator) sees a mount inside his member folder.
  Render local paths from dropbox_connection_roots for the current user.
- All user-facing Dropbox calls use the acting user's token (per-user OAuth). No team token until Phase 4.
- Every upload goes through lib/dropbox/filing.ts for subfolder + name. Never trust a client-supplied path.
- Point every test at the sandbox folder (app_settings.dropbox_root_folder_id in DEV = "Offshore Alliance (DEV)", a Reveille-owned shared folder);
  never at the OA team's folders.
- Feature-flag new surfaces behind app_settings.dropbox_enabled; leave the legacy Documents sub-tab reachable until told to remove it.

House conventions
- Migrations: new timestamped file under supabase/migrations, idempotent DDL, VARCHAR + CHECK (no enums), TIMESTAMPTZ DEFAULT now(),
  RLS with the existing helper functions, grants incl. sequence usage. Apply to DEV first, regenerate types
  (SUPABASE_PROJECT_REF=dpnnmkhabysfdogllsyh pnpm gen:types). Never edit an applied migration.
- API routes: createClient() + auth.getUser() guard, errorResponse() helper, fetchApi() on the client with the right timeout constant.
- Pure logic in src/lib/** with vitest tests in __tests__ (pnpm --filter organising-db test). Run pnpm --filter organising-db lint.
- Reuse shadcn/ui primitives and existing patterns (Card, Sheet, Tabs, DataTable, sonner toasts, lucide icons).
- Copy for users: plain organiser language ("Filed to 3 Comms"), never API terms.
- One commit per completed phase on the current branch, no worktrees, no PR unless asked. Commit message: feat(dropbox): <phase> — <summary>.
- Do not touch the RLS-disabled archive tables or unrelated modules.

Report at the end: what shipped, the migration file name, what was tested (with the sandbox path), what is behind the flag,
and anything you deliberately left out.
```

### 10.2 Phase prompts

**Phase 0 (analysis agent, read-only on the repo, no Dropbox writes)**

```text
Task: produce docs/DROPBOX_FOLDER_STANDARD.md and a reconciliation table for the existing Dropbox tree.
Inputs: docs/DROPBOX_INTEGRATION_BRIEF.md §7; the tree/count exports attached (oa-dropbox-tree.txt, oa-dropbox-counts.txt);
the app's campaigns, employers and agreements (query via the Supabase MCP, read-only).
Output: (1) the final tree with any deviations from §7 justified; (2) a table old path → new path → action (keep / rename / move / merge / restrict)
with counts per row; (3) a list of app campaigns with no obvious folder and folders with no obvious campaign; (4) the text for
00 Start here/Filing guide.md. Do not run any commands against Dropbox and do not change code.
```

**Phase 1 (implementation agent)**

```text
Implement Phase 1 of docs/DROPBOX_INTEGRATION_BRIEF.md (§9, "Connect and bind") under the global guardrails.
Deliver: migration (provider CHECK + dropbox_folder_bindings + app_settings keys); lib/integrations/dropbox.ts + dropbox-connection.ts;
/api/oauth/dropbox/{start,callback,status,disconnect}; useDropboxConnection + DropboxConnectionCard (Administration → Settings, and inline);
lib/dropbox/{filing,paths,template}.ts with tests; /api/dropbox/bindings (create-from-template, link-existing, unlink) and
/api/dropbox/folders/[bindingId]/{list,upload,temporary-link,thumbnail}; DropboxFolderPanel + DropboxDropZone replacing
CampaignLibraryDocuments in src/components/campaigns/library/campaign-library.tsx when dropbox_enabled is true; campaign wizard
post-create provisioning (non-blocking, retry from the Library tab).
Verify against the DEV sandbox folder: connect, bind, list, preview, download, upload "Flyer" → lands in 3 Comms with the standard name.
Do not implement move, delete, shared links, search, or any org-wide page.
```

**Phase 2 (implementation agent)**

```text
Implement Phase 2 ("File everything"). Add SaveToDropboxButton next to every Download in campaign routes under
src/app/api/campaigns/[id]/**/export and the survey document route, generating server-side and uploading via filing.ts.
Add dropbox_file_links + the Attach-from-Dropbox control (DropboxFilePicker scoped to the campaign's 4 Bargaining folder) on
endorsement votes, PABO applications and decision points; migrate proposal_document_url display to the link chip (keep the column).
Bind agreements and employers to 02 Employers/<Employer>/Agreements/<EA short name> and 02 Employers/<Employer>; fill the Agreement
Documents tab and add an Employer Documents tab using DropboxFolderPanel. Add "Choose from Dropbox" to the import wizards' source step
(spreadsheet types only). Add "File to campaign" on email attachment chips in the campaign inbox.
```

**Phase 3 (implementation agent)**

```text
Implement Phase 3 ("Awareness"). Add dropbox_index + dropbox_sync_cursors; /api/cron/dropbox-sync registered in vercel.json (*/10);
"Recently changed" on the Library tab and campaign Overview; "Files changed this week" tile on the Dashboard; unfiled detection
(files directly in a bound campaign root, or lacking a YYYY-MM-DD prefix) with a one-click "File to…" that is the only permitted
move_v2 call, audited; search_v2 scoped to the binding; two Guides clips via the docs/HOW_TO_VIDEOS pipeline.
```

**Phase 4 (one prompt per extension, chosen by Troy)** — file requests, AI filing, team-linked governance, snapshots to Dropbox, org-wide Files page, archive-on-close. Each is scoped as its own brief section before an agent is started.

### 10.3 How to run the phases

Use the same pattern as the SMS module: a phase plan doc (`docs/DROPBOX_PHASE<n>_PLAN.md`) is produced first by a planning agent from this brief, reviewed by Troy, then handed to an implementation agent with the global guardrails and the phase prompt. Plans, not this brief, are the source of truth for exact schema and route names once a phase starts.

---

## 11. Risks, open questions and decisions needed

| # | Item | Why it matters | Proposed resolution |
|---|---|---|---|
| 1 | **Team folder vs shared folder in the OA team** | Determines whether every organiser has the same local path and whether the root survives a member leaving | Make the root a team folder in the OA team space in Phase 0 (OA team admin action); re-share subfolders to Troy |
| 1b | **Troy is external to the OA Dropbox team** | Paths differ per user; team-admin actions and the Phase 4 team token need an OA admin account | Id-based addressing and per-connection roots (§8); decide whether Troy gets an OA-team account or an OA admin performs admin steps |
| 2 | **Dropbox plan features** (subfolder permissions on team folders, file-request deadlines, team-linked API) | Restricted `2 Workforce` / `08 Membership data` and Phase 4 depend on them | Confirm plan in the admin console (§2.3 Q2) |
| 3 | **PII in Dropbox** | Worker lists and membership data are personal information; Dropbox folders are easy to over-share | Restricted subfolders, app never files worker-level data outside `2 Workforce` / `08`, no worker-profile document surface |
| 4 | **Who connects** | Per-user OAuth means an unconnected user sees an empty Library tab | Inline connect prompt; admin can see who has connected; consider Phase 4 team token for read-only fallback |
| 5 | **Two apps, two environments** | Dev preview must never write into the OA team's folders | Separate Dropbox app for DEV, sandbox folder `Offshore Alliance (DEV)` owned in Reveille, root id per environment in `app_settings` |
| 6 | **Rename drift** | A campaign renamed in the app will not rename its folder (by design) | Show both names; offer an admin "Rename folder to match" action in Phase 3 |
| 7 | **Rate limits and cold starts** | Listing on every page view is slow on Vercel functions | Cache in `dropbox_index` from Phase 3; in Phase 1 list only the selected subfolder with a 60 s React Query stale time |
| 8 | **Legacy `documents` table and buckets** | Dead code paths confuse future agents | Drop in a cleanup migration after Phase 2 |
| 9 | **Existing security advisory** | Supabase reports RLS disabled on `employer_state_bargaining_phase_map` and three `_archive_*` tables | Unrelated to Dropbox; the Supabase advisor's remediation SQL is `ALTER TABLE … ENABLE ROW LEVEL SECURITY` for each, with policies decided first. Flagged for a separate task. |
| 10 | **Team habit change** | The integration only helps if uploads go through the app or into the standard folders | Guides clips, "unfiled" nudges, and Save-to-Dropbox on every output so the easy path is the right path |

Decisions needed from Troy before Phase 0 starts: (a) answers to §2.3; (b) approval of the §7 tree and naming; (c) whether the OA team is comfortable with per-user Dropbox connections as the primary mode; (d) who acts as OA Dropbox team admin for Phase 0 and Phase 4 steps; (e) which Phase 4 extensions matter most.

---

## Appendix — Sources checked

- Dropbox OAuth guide: https://developers.dropbox.com/oauth-guide
- Dropbox Team Files guide (team space, `Dropbox-API-Path-Root`, `Select-User`/`Select-Admin`): https://developers.dropbox.com/dbx-team-files-guide
- Chooser, Saver, Embedder drop-ins: https://www.dropbox.com/developers/chooser · https://www.dropbox.com/developers/saver · https://www.dropbox.com/developers/embedder
- Team folders and the team space: https://help.dropbox.com/organize/team-folders · https://help.dropbox.com/organize/team-space-overview · https://help.dropbox.com/plans/business-team-changes
- Business API overview: https://help.dropbox.com/installs-integrations/third-party/business-api
- File requests (Python SDK reference for parameters): https://dropbox-sdk-python.readthedocs.io/en/latest/api/file_requests.html
