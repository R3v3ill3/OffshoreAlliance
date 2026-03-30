# Offshore Alliance Campaign Strategic Planner — Development Brief

> **Purpose**: This document is both a human-readable development brief and a structured prompt for a Cursor multi-agent build session. It specifies a webapp that applies the "Playing to Win" 5-step strategic planning methodology to each stage of the Offshore Alliance Enterprise Bargaining Campaign model. The app connects to an existing Supabase campaign database and is deployed on Vercel.

---

## 1. PROJECT OVERVIEW

### 1.1 What This App Does

The **OA Campaign Strategic Planner** is a web application used by a team of ~20 organisers in the Western Australian offshore oil and gas sector. It guides organisers through structured strategic planning for enterprise bargaining campaigns by combining two frameworks:

1. **The OA Bargaining Model** — A stage-and-gate organising model with 5 stages (Contact ID & Mapping → Intro Comms & Education → Member Mobilisation → Develop Claims/MSD → Endorsement & Commence Bargaining) followed by a Bargaining to Win phase. Each stage is separated by a gate with specific thresholds that must be met before progressing.

2. **The Playing to Win Strategic Planning Methodology** — A 5-step decision framework applied at EACH stage of the bargaining model:
   - **Step 1: Ambition** — Define measurable success for this stage
   - **Step 2: Where to Play** — Choose where to concentrate effort (and where not to)
   - **Step 3: Theory of Winning** — AI-assisted causal logic chain linking choices to ambitions
   - **Step 4: Capacities & Resources** — What's needed vs what's available
   - **Step 5: Management Systems** — Planning rhythms, reporting, accountability

At each stage, the organiser works through all 5 Playing to Win steps, producing a structured campaign plan that feeds into reporting and tracking systems. The app provides default selectable options (sorted by popularity) with the ability to add custom options. An AI-powered "Theory of Winning" generator analyses the organiser's Where to Play choices against their Ambitions and produces an if/then hypothesis with gap analysis.

### 1.2 Context of Use

The Offshore Alliance is a joint initiative between the AWU and the MUA operating in WA's oil and gas sector. The organising model is:

- **High intensity, highly structured** — relies on structured contact networks with monitorable worker-to-worker and organiser-to-worker 2-way communication
- **Stage and gate** — if key benchmarks are not met, progress to next stage may not occur
- **Time-sensitive** — in early stages (up to bargaining initiation) the OA can generally control timeframes, but if an existing agreement is in place, they work backwards from the expiry date to be peak-engagement-ready 30 days prior to expiry (when protected industrial action becomes available)
- **Member-driven** — "shared responsibility" principle throughout; the model builds member agency rather than relying on organiser-driven activity
- **Contested ground** — employer opposition is a constant; the model explicitly prepares for it

### 1.3 Users and Roles

The app connects to existing Supabase Auth. Current user_profiles roles:

| Role | Work Role | Access Level |
|------|-----------|--------------|
| admin | coordinator | Full access — all campaigns, all teams, system config |
| admin | industrial_coordinator | Full access — all campaigns, all teams |
| admin | lead_organiser | Full access to their team's campaigns, read access to others |
| user | organiser | Read/write access to campaigns they're assigned to |
| admin | (null) | System admin |

Teams: Up to 3 teams, ~4 organisers per team, plus lead organisers, coordinators, and admin support (~20 users total).

### 1.4 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14+ (App Router), TypeScript, Tailwind CSS, shadcn/ui |
| Backend | Next.js API Routes + Supabase Edge Functions where needed |
| Database | Supabase (PostgreSQL) — existing instance `gteygwfgjvczanmrwgbr` in `ap-southeast-2` |
| Auth | Supabase Auth (already configured with user_profiles table) |
| AI | Anthropic Claude API (claude-sonnet-4-20250514 for Theory of Winning generation) |
| Hosting | Vercel |
| State | React Query (TanStack Query) for server state, Zustand for client state |

### 1.5 Supabase Project Details

- **Project ID**: `gteygwfgjvczanmrwgbr`
- **Project Name**: OffshoreAlliance
- **Region**: ap-southeast-2
- **Database Version**: PostgreSQL 17
- **RLS**: Enabled on all tables

---

## 2. EXISTING DATABASE SCHEMA (DO NOT MODIFY)

The following tables already exist and must be READ from (and in some cases linked to) but NOT modified by this build. The new planning tool tables will be ADDED alongside them.

### 2.1 Core Entities (Read/Link)

**agreements** (135 rows) — Enterprise bargaining agreements
- Key fields: `agreement_id`, `agreement_name`, `short_name`, `employer_id`, `sector_id`, `expiry_date`, `status`, `commencement_date`
- Status values include: 'Current', 'Expired', 'Under_Negotiation', 'Terminated'
- Links to: employers, sectors, worksites (via agreement_worksites), unions (via agreement_unions), organisers (via agreement_organisers)

**employers** (106 rows) — Companies in the sector
- Key fields: `employer_id`, `employer_name`, `employer_category`, `parent_employer_id`
- Hierarchical (parent_employer_id self-reference)
- Links to: worksites (via employer_worksite_roles), agreements, sectors

**worksites** (40 rows) — Offshore platforms, onshore facilities, vessels
- Key fields: `worksite_id`, `worksite_name`, `worksite_type`, `is_offshore`, `basin`, `principal_employer_id`, `parent_worksite_id`
- Hierarchical (parent_worksite_id self-reference)

**workers** (0 rows — to be populated) — Individual worker contacts
- Key fields: `worker_id`, `first_name`, `last_name`, `email`, `phone`, `employer_id`, `worksite_id`, `union_id`, `member_role_type_id`, `engagement_score`, `engagement_level`, `project_id`

**organisers** (2 rows) — OA organising staff
- Key fields: `organiser_id`, `organiser_name`, `email`, `phone`, `is_active`

**campaigns** (0 rows — to be populated) — Campaign records
- Key fields: `campaign_id`, `name`, `description`, `campaign_type`, `status`, `start_date`, `end_date`, `organiser_id`

**campaign_universes** (0 rows) — Target groups within campaigns
- Key fields: `universe_id`, `campaign_id`, `name`, `description`

**campaign_actions** (0 rows) — Planned campaign actions
- Key fields: `action_id`, `campaign_id`, `action_type`, `title`, `due_date`, `status`, `universe_id`, `assigned_organiser_id`

**campaign_action_results** (0 rows) — Action outcomes
- Key fields: `result_id`, `action_id`, `worker_id`, `organiser_id`, `result_type`, `notes`, `action_date`

### 2.2 Supporting Entities (Read)

**sectors** (16 rows): Production, Maintenance, Catering, Marine - Deck Officers, Marine - Engineers, Drilling, ROV, Decommissioning, Offshore Construction, Aircraft Maintenance, Inspection, Dredging, Hydrographics, Chemists, Supply, Helicopter Engineers

**unions** (6 rows): Includes AWU, MUA and others with `is_oa_member` flag

**member_role_types** (7 rows): member, member_other_union, contact, bargaining_rep, non_member, resigned_member, delegate

**work_scopes** (22 rows): Hierarchical — top-level: Brownfields, Specialist. Sub-scopes include Maintenance, Operations, Electrical, Mechanical, PFP, Catering, Marine, ROV, Helicopter Transport, etc.

**projects** (7 rows): Project-level tracking linked to worksites

**user_profiles** (10 rows): Auth-linked user records with `role`, `work_role`, `organiser_id`, `reports_to`

### 2.3 Key Existing Views (Use These)

**organising_universe_view** — Joins worksites → employers → projects → agreements → sectors with worker counts. This is the primary view for understanding the organising landscape and should be used to populate "Where to Play" options.

**worksite_employer_eba_status** — Categorises each employer-worksite combination by EBA status:
- `expiry_lt_6m` — agreement expires within 6 months
- `expiry_6_12m` — expires in 6-12 months
- `expiry_12_24m` — expires in 12-24 months
- `expiry_gt_24m` — expires in 24+ months
- `first_bargaining` — first-time bargaining (no prior EBA)
- `expired_eba` — has expired agreement or is in bargaining
- `no_eba_no_bargaining` — no agreement history

This view is critical for campaign timeline planning — it tells the organiser how much time they have before the 30-day protected action window opens.

### 2.4 Existing Communications & Tracking

**communications_log** — Tracks worker communications (channel, direction, content, yabbr/action_network IDs)
**documents** — Uploaded files linked to agreements/employers
**organiser_patches** / **organiser_patch_assignments** — Organiser territory assignments

---

## 3. NEW DATABASE TABLES (TO BE CREATED)

All new tables should use Supabase migrations, have RLS enabled, and follow the existing naming conventions (snake_case, descriptive names, integer PKs with sequences).

### 3.1 Campaign Plan Tables

```sql
-- The core planning container — one plan per campaign per stage
CREATE TABLE campaign_stage_plans (
    plan_id SERIAL PRIMARY KEY,
    campaign_id INTEGER NOT NULL REFERENCES campaigns(campaign_id),
    stage_number INTEGER NOT NULL CHECK (stage_number BETWEEN 1 AND 6),
    -- Stage 1: Contact ID & Mapping
    -- Stage 2: Intro Comms & Education
    -- Stage 3: Member Mobilisation
    -- Stage 4: Develop Claims / MSD
    -- Stage 5: Endorsement & Commence Bargaining
    -- Stage 6: Bargaining to Win
    stage_name VARCHAR NOT NULL,
    status VARCHAR NOT NULL DEFAULT 'draft',
    -- draft, active, completed, blocked
    planned_start_date DATE,
    planned_end_date DATE,
    actual_start_date DATE,
    actual_end_date DATE,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(campaign_id, stage_number)
);

-- Playing to Win Step 1: Ambitions for each stage plan
CREATE TABLE plan_ambitions (
    ambition_id SERIAL PRIMARY KEY,
    plan_id INTEGER NOT NULL REFERENCES campaign_stage_plans(plan_id) ON DELETE CASCADE,
    ambition_option_id INTEGER REFERENCES ambition_options(option_id),
    -- NULL if custom
    custom_text TEXT,
    -- Used if ambition_option_id is NULL (user-created)
    target_value VARCHAR,
    -- e.g., "50", "80%", "100"
    target_unit VARCHAR,
    -- e.g., "contacts", "percent", "members"
    target_date DATE,
    is_achieved BOOLEAN DEFAULT FALSE,
    achieved_date DATE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Playing to Win Step 2: Where to Play choices for each stage plan
CREATE TABLE plan_where_to_play (
    wtp_id SERIAL PRIMARY KEY,
    plan_id INTEGER NOT NULL REFERENCES campaign_stage_plans(plan_id) ON DELETE CASCADE,
    wtp_category_id INTEGER NOT NULL REFERENCES wtp_categories(category_id),
    wtp_option_id INTEGER REFERENCES wtp_options(option_id),
    -- NULL if custom
    custom_text TEXT,
    rationale TEXT,
    -- Why this choice
    is_exclusion BOOLEAN DEFAULT FALSE,
    -- TRUE = "where we WON'T play"
    priority INTEGER DEFAULT 2 CHECK (priority BETWEEN 1 AND 3),
    -- 1=high, 2=medium, 3=low
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Playing to Win Step 3: Theory of Winning
CREATE TABLE plan_theory_of_winning (
    theory_id SERIAL PRIMARY KEY,
    plan_id INTEGER NOT NULL REFERENCES campaign_stage_plans(plan_id) ON DELETE CASCADE,
    if_then_statement TEXT NOT NULL,
    -- AI-generated or manually written
    ai_generated BOOLEAN DEFAULT FALSE,
    ai_model VARCHAR,
    -- e.g. 'claude-sonnet-4-20250514'
    ai_prompt_snapshot JSONB,
    -- Store the input that generated this
    gap_analysis JSONB,
    -- AI-identified gaps/risks
    -- Structure: [{gap_type, description, severity, recommendation}]
    risk_assessment JSONB,
    -- AI-identified risks
    -- Structure: [{risk, likelihood, impact, mitigation}]
    critical_dependency TEXT,
    contingency_plan TEXT,
    member_agency_assessment TEXT,
    -- How this builds member ownership
    employer_response_plan TEXT,
    -- Response to employer opposition scenarios
    is_current BOOLEAN DEFAULT TRUE,
    -- Allow versioning — only one current per plan
    version INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Playing to Win Step 4: Capacities & Resources
CREATE TABLE plan_capacities (
    capacity_id SERIAL PRIMARY KEY,
    plan_id INTEGER NOT NULL REFERENCES campaign_stage_plans(plan_id) ON DELETE CASCADE,
    capacity_option_id INTEGER REFERENCES capacity_options(option_id),
    custom_text TEXT,
    status VARCHAR NOT NULL DEFAULT 'needed',
    -- needed, available, gap, in_progress
    assigned_to INTEGER REFERENCES organisers(organiser_id),
    gap_description TEXT,
    -- If status='gap', what's missing?
    resolution_plan TEXT,
    -- How to close the gap
    resolution_date DATE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Playing to Win Step 5: Management Systems
CREATE TABLE plan_management_systems (
    system_id SERIAL PRIMARY KEY,
    plan_id INTEGER NOT NULL REFERENCES campaign_stage_plans(plan_id) ON DELETE CASCADE,
    system_option_id INTEGER REFERENCES management_system_options(option_id),
    custom_text TEXT,
    frequency VARCHAR,
    -- daily, weekly, fortnightly, monthly, as_needed
    responsible_organiser_id INTEGER REFERENCES organisers(organiser_id),
    description TEXT,
    -- Details of how this system works
    metrics JSONB,
    -- What gets measured
    -- Structure: [{metric_name, target, current_value, last_updated}]
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.2 Options / Defaults Tables (Selectable Options with Popularity Sorting)

```sql
-- Ambition options — pre-loaded defaults, user-addable
CREATE TABLE ambition_options (
    option_id SERIAL PRIMARY KEY,
    stage_number INTEGER NOT NULL CHECK (stage_number BETWEEN 1 AND 6),
    category VARCHAR NOT NULL,
    -- e.g., 'contact_targets', 'membership_growth', 'engagement', 'action_readiness'
    option_text TEXT NOT NULL,
    -- e.g., 'Identify {target_value} potential contacts'
    has_variable BOOLEAN DEFAULT FALSE,
    -- TRUE if contains placeholder like {target_value}
    variable_label VARCHAR,
    -- e.g., 'Number of contacts'
    variable_type VARCHAR,
    -- 'number', 'percentage', 'text'
    is_system_default BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES auth.users(id),
    use_count INTEGER DEFAULT 0,
    -- Incremented each time selected; used for popularity sorting
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Where to Play categories
CREATE TABLE wtp_categories (
    category_id SERIAL PRIMARY KEY,
    category_name VARCHAR NOT NULL,
    -- e.g., 'Potential Contacts', 'Narrative & Tone', 'Communication Platforms', 'Geographic Focus', 'Work Groups'
    description TEXT,
    applies_to_stages INTEGER[],
    -- Which stages this category is relevant for, e.g., {1,2,3}
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Where to Play options within categories
CREATE TABLE wtp_options (
    option_id SERIAL PRIMARY KEY,
    category_id INTEGER NOT NULL REFERENCES wtp_categories(category_id),
    option_text VARCHAR NOT NULL,
    description TEXT,
    is_system_default BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES auth.users(id),
    use_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Capacity & Resource options
CREATE TABLE capacity_options (
    option_id SERIAL PRIMARY KEY,
    stage_number INTEGER NOT NULL CHECK (stage_number BETWEEN 1 AND 6),
    category VARCHAR NOT NULL,
    -- e.g., 'organiser_skills', 'data_systems', 'comms_tools', 'member_platforms', 'materials', 'time'
    option_text VARCHAR NOT NULL,
    description TEXT,
    linked_wtp_categories INTEGER[],
    -- Which WTP categories this capacity supports
    is_system_default BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES auth.users(id),
    use_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Management System options
CREATE TABLE management_system_options (
    option_id SERIAL PRIMARY KEY,
    stage_number INTEGER NOT NULL CHECK (stage_number BETWEEN 1 AND 6),
    category VARCHAR NOT NULL,
    -- e.g., 'meeting_rhythms', 'reporting_tools', 'tracking_systems', 'communication_schedules', 'accountability'
    option_text VARCHAR NOT NULL,
    description TEXT,
    default_frequency VARCHAR,
    is_system_default BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES auth.users(id),
    use_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.3 Gate Configuration & Assessment Tables

```sql
-- Gate definitions — configurable thresholds per campaign
CREATE TABLE gate_definitions (
    gate_id SERIAL PRIMARY KEY,
    campaign_id INTEGER NOT NULL REFERENCES campaigns(campaign_id),
    gate_number INTEGER NOT NULL CHECK (gate_number BETWEEN 1 AND 5),
    -- Gate 1: Between Stage 1→2 (Member Engagement Threshold)
    -- Gate 2: Between Stage 2→3 (Engagement Ready Assessment)
    -- Gate 3: Between Stage 3→4 (Log of Claims Survey Participation)
    -- Gate 4: Between Stage 4→5 (Ready for Bargaining)
    -- Gate 5: Bargaining to Win entry (Strike Ready)
    gate_name VARCHAR NOT NULL,
    enforcement_type VARCHAR NOT NULL DEFAULT 'soft',
    -- 'hard' = blocks progression, 'soft' = warns but allows with justification
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(campaign_id, gate_number)
);

-- Individual criteria within each gate
CREATE TABLE gate_criteria (
    criterion_id SERIAL PRIMARY KEY,
    gate_id INTEGER NOT NULL REFERENCES gate_definitions(gate_id) ON DELETE CASCADE,
    criterion_name VARCHAR NOT NULL,
    description TEXT,
    metric_type VARCHAR NOT NULL,
    -- 'percentage', 'count', 'boolean', 'date'
    target_value VARCHAR NOT NULL,
    -- e.g., '80', '50', 'true', '2026-06-01'
    current_value VARCHAR,
    is_met BOOLEAN DEFAULT FALSE,
    is_hard_gate BOOLEAN DEFAULT FALSE,
    -- Overrides parent enforcement_type — e.g., MSD 50%+ is ALWAYS hard
    evidence_notes TEXT,
    assessed_by UUID REFERENCES auth.users(id),
    assessed_at TIMESTAMPTZ,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Gate assessment records — audit trail of gate reviews
CREATE TABLE gate_assessments (
    assessment_id SERIAL PRIMARY KEY,
    gate_id INTEGER NOT NULL REFERENCES gate_definitions(gate_id),
    assessment_date TIMESTAMPTZ DEFAULT NOW(),
    outcome VARCHAR NOT NULL,
    -- 'passed', 'failed', 'override_approved', 'deferred'
    override_justification TEXT,
    -- Required if outcome = 'override_approved'
    assessed_by UUID REFERENCES auth.users(id),
    approved_by UUID REFERENCES auth.users(id),
    -- For overrides, who approved
    notes TEXT,
    snapshot JSONB,
    -- Snapshot of all criteria values at time of assessment
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.4 Timeline & Reporting Tables

```sql
-- Campaign timeline — auto-calculated from agreement expiry dates
CREATE TABLE campaign_timelines (
    timeline_id SERIAL PRIMARY KEY,
    campaign_id INTEGER NOT NULL REFERENCES campaigns(campaign_id) UNIQUE,
    agreement_id INTEGER REFERENCES agreements(agreement_id),
    agreement_expiry_date DATE,
    -- Pulled from agreements table
    pabo_available_date DATE,
    -- 30 days before expiry (calculated)
    peak_engagement_target_date DATE,
    -- = pabo_available_date
    working_backwards BOOLEAN DEFAULT FALSE,
    -- TRUE if constrained by expiry date
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stage timeline targets — planned dates for each stage
CREATE TABLE stage_timeline_targets (
    target_id SERIAL PRIMARY KEY,
    timeline_id INTEGER NOT NULL REFERENCES campaign_timelines(timeline_id) ON DELETE CASCADE,
    stage_number INTEGER NOT NULL CHECK (stage_number BETWEEN 1 AND 6),
    planned_start DATE,
    planned_end DATE,
    actual_start DATE,
    actual_end DATE,
    duration_weeks INTEGER,
    -- Planned duration
    is_on_track BOOLEAN DEFAULT TRUE,
    variance_days INTEGER DEFAULT 0,
    -- Positive = behind, negative = ahead
    notes TEXT,
    UNIQUE(timeline_id, stage_number)
);

-- Reporting snapshots — periodic state captures for dashboards
CREATE TABLE reporting_snapshots (
    snapshot_id SERIAL PRIMARY KEY,
    campaign_id INTEGER NOT NULL REFERENCES campaigns(campaign_id),
    snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
    snapshot_type VARCHAR NOT NULL DEFAULT 'weekly',
    -- 'daily', 'weekly', 'gate_review', 'manual'
    data JSONB NOT NULL,
    -- Flexible snapshot of campaign state
    -- Structure: {stage, ambitions_progress, gate_status, contact_counts, engagement_metrics, ...}
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 4. PLAYING TO WIN × OA BARGAINING MODEL — COMPLETE MAPPING

This section defines exactly what each Playing to Win step looks like at each stage of the bargaining model. This is the core logic of the application.

### 4.1 Stage 1: Contact ID & Mapping

**Gate Entry**: None (campaign start)
**Gate Exit**: Gate 1 — Member Engagement Threshold

#### Step 1: Ambitions (Stage 1)
Default ambition options (pre-loaded in `ambition_options` where `stage_number = 1`):

| Category | Option Text | Variable | Variable Type |
|----------|-------------|----------|---------------|
| contact_targets | Identify {target_value} potential contacts on site | Number of contacts | number |
| contact_targets | Contact {target_value}% of known members on site | Percentage | percentage |
| contact_targets | Obtain verified name, phone and email for {target_value}% of identified contacts | Percentage | percentage |
| membership_growth | Identify {target_value} non-members for recruitment conversations | Number | number |
| mapping | Complete workplace map for {target_value} worksites/vessels | Number | number |
| mapping | Map all crew rotations and swing patterns for target worksite | — | — |
| mapping | Identify key informal leaders in {target_value} work groups | Number | number |
| engagement | Achieve {target_value}% response rate to initial contact communication | Percentage | percentage |
| engagement | Conduct 1-on-1 structured conversations with {target_value}% of identified contacts | Percentage | percentage |
| timeline | Complete Stage 1 within {target_value} weeks | Weeks | number |

#### Step 2: Where to Play (Stage 1)
Default WTP categories and options:

**Category: Potential Contacts** (`applies_to_stages: [1,2,3,4,5]`)
- Existing members (current financial members)
- Members of other unions (AWU members on MUA site or vice versa)
- Lapsed members (resigned within last 2 years)
- Non-members — known contacts
- Non-members — unknown (identified through mapping)
- All workers on agreement scope
- All marine workers
- All catering workers
- Bargaining representatives
- HSRs (Health & Safety Representatives)
- Delegates

**Category: Geographic / Worksite Focus** (`applies_to_stages: [1,2,3,4,5]`)
- Options dynamically populated from `worksites` table (filtered by campaign agreement's worksite links)
- Include: Specific platform/vessel names, Onshore facilities, Specific basins (e.g., North West Shelf, Browse, Carnarvon)

**Category: Employer Focus** (`applies_to_stages: [1,2,3,4,5]`)
- Options dynamically populated from `employers` table (filtered by campaign agreement's employer links)
- Include: Principal employer, Subcontractors, Labour hire companies

**Category: Work Group / Sector Focus** (`applies_to_stages: [1,2,3,4,5]`)
- Options dynamically populated from `sectors` and `work_scopes` tables
- e.g., Production crews, Maintenance — Mechanical, Maintenance — Electrical, Catering, Marine — Deck Officers

**Category: Narrative & Tone** (`applies_to_stages: [1,2,3,4,5,6]`)
- Informative — explain the process, build understanding
- Urgency — agreement expiry approaching, time to act
- Shared responsibility — "your agreement, your fight"
- Success story — reference previous wins
- Solidarity — collective power messaging
- Fairness — same job same pay, no blacklists
- Worker voice — expanded delegate rights
- Job security — no visa workers, no blacklists

**Category: Communication Platforms** (`applies_to_stages: [1,2,3,4,5,6]`)
- Email (Action Network)
- SMS (Yabbr)
- Phone calls (1-on-1)
- Face-to-face onsite visits
- Group chat (platform TBD)
- WhatsApp groups
- Workplace noticeboard
- Online meetings/webinars
- Structured organising conversations (SOC)
- WOC (Workplace Organising Committee) meetings

**Category: Contact Method Priority** (`applies_to_stages: [1,2]`)
- Cold outreach — email first, then SMS, then call
- Warm referral — existing member introduces organiser
- Peer-to-peer — member-to-member contact
- Onsite visit — face-to-face during crew change
- Delegate/HSR introduction pathway

#### Step 3: Theory of Winning (Stage 1)
AI generates an if/then statement. Example:

> "If we contact existing members via email and SMS within the first 2 weeks, then conduct structured organising conversations with 80% of respondents by week 4, and use peer-to-peer referrals to identify non-members in each work group, then we will have identified 150+ contacts with verified details and mapped all crew rotations — meeting the Gate 1 member engagement threshold by week 6."

**Gap Analysis** the AI should check for:
- Are narrative/tone choices selected? (If no → gap: "No narrative framework selected for initial contact — risk of inconsistent messaging")
- Is there a contact list source? (If no members/contacts selected → gap: "No identified contact pool — ambition to contact X people cannot be met without a source")
- Are communication platforms selected? (If no → gap: "No communication channels identified — cannot execute contact strategy")
- Do the where-to-play choices cover enough workers to meet the contact target ambitions?
- Is there a face-to-face / peer-to-peer element? (The OA model relies on structured contact networks — purely digital may be flagged as a risk)

#### Step 4: Capacities & Resources (Stage 1)
Default options:

| Category | Option | Linked WTP Categories |
|----------|--------|----------------------|
| data_systems | Membership database access | Potential Contacts |
| data_systems | Contact tracking spreadsheet/system | Potential Contacts |
| data_systems | Workplace mapping template | Geographic/Worksite Focus |
| comms_tools | Action Network (email) account & templates | Communication Platforms |
| comms_tools | Yabbr (SMS) account & templates | Communication Platforms |
| comms_tools | Phone/call capacity | Communication Platforms |
| organiser_skills | Structured Organising Conversation training | Contact Method Priority |
| organiser_skills | Workplace mapping skills | Geographic/Worksite Focus |
| organiser_skills | 1-on-1 conversation skills | Potential Contacts |
| materials | First contact email template | Communication Platforms |
| materials | Initial information pack / FAQ | Narrative & Tone |
| materials | Crew rotation schedules | Geographic/Worksite Focus |
| time | Organiser hours available per week | — |
| time | Estimated time for onsite visits | Geographic/Worksite Focus |

The app should **auto-suggest** capacities based on WTP selections. If the organiser selects "Email (Action Network)" as a communication platform, the app should surface "Action Network account & templates" as a suggested capacity. If it's not marked as 'available', it appears as a gap.

#### Step 5: Management Systems (Stage 1)
Default options:

| Category | Option | Default Frequency |
|----------|--------|-------------------|
| meeting_rhythms | Team check-in meeting | weekly |
| meeting_rhythms | Lead organiser review | fortnightly |
| meeting_rhythms | Coordinator campaign review | monthly |
| reporting_tools | Contact tracking report | weekly |
| reporting_tools | Mapping progress report | weekly |
| reporting_tools | Gate 1 readiness dashboard | weekly |
| tracking_systems | Conversation log/report | daily |
| tracking_systems | New contact register | daily |
| communication_schedules | Member update/bulletin | fortnightly |
| accountability | Task allocation register (WOC-style) | weekly |
| accountability | Organiser activity log | daily |

---

### 4.2 Stage 2: Intro Comms & Education

**Gate Entry**: Gate 1 — Member Engagement Threshold met
**Gate Exit**: Gate 2 — Engagement Ready Assessment

#### Step 1: Ambitions (Stage 2)
| Category | Option Text | Variable | Type |
|----------|-------------|----------|------|
| engagement | Achieve {target_value}% open rate on intro comms | Percentage | percentage |
| engagement | Conduct education sessions with {target_value}% of contacts | Percentage | percentage |
| engagement | Get {target_value}% of contacts to confirm shared responsibility commitment | Percentage | percentage |
| recruitment | Recruit {target_value} new members from non-member contacts | Number | number |
| education | Run {target_value} online or onsite information sessions | Number | number |
| education | Brief {target_value}% of contacts on EBA process and timeline | Percentage | percentage |
| structure | Identify {target_value} potential WOC/delegate candidates | Number | number |
| structure | Establish WOC on {target_value} worksites | Number | number |
| timeline | Complete Stage 2 within {target_value} weeks | Weeks | number |

#### Step 2: Where to Play (Stage 2)
Uses same categories as Stage 1 plus:

**Category: Education Content Focus** (`applies_to_stages: [2,3]`)
- EBA process overview — what happens and when
- Rights at work — right to organise, right to information
- Shared responsibility framework — "want more, do more"
- History of previous EBA outcomes
- Current agreement conditions vs industry benchmarks
- Industrial action rights and PABO process
- Role of bargaining reps and delegates

**Category: Engagement Intensity** (`applies_to_stages: [2,3,4]`)
- High touch — multiple 1-on-1s, onsite presence every swing
- Medium touch — regular comms + targeted 1-on-1s with key contacts
- Low touch — broadcast comms with targeted follow-up for non-responders

#### Steps 3-5: Follow same pattern as Stage 1 with stage-appropriate defaults

---

### 4.3 Stage 3: Member Mobilisation

**Gate Entry**: Gate 2 — Engagement Ready Assessment passed
**Gate Exit**: Gate 3 — Log of Claims Survey Participation

#### Step 1: Ambitions (Stage 3)
| Category | Option Text | Variable | Type |
|----------|-------------|----------|------|
| mobilisation | Achieve {target_value}% participation in Log of Claims survey | Percentage | percentage |
| mobilisation | Get {target_value}% of members to complete a specific action/task | Percentage | percentage |
| leadership | Establish {target_value} active WOCs across worksites | Number | number |
| leadership | Train {target_value} members in structured organising conversations | Number | number |
| action_readiness | {target_value}% of members indicate willingness to take industrial action | Percentage | percentage |
| recruitment | Achieve {target_value}% membership density on target agreement scope | Percentage | percentage |
| timeline | Complete Stage 3 within {target_value} weeks | Weeks | number |

#### Step 2: Where to Play (Stage 3)
Adds:

**Category: Mobilisation Tactics** (`applies_to_stages: [3,4,5,6]`)
- Petition / open letter to employer
- Worksite meetings (shift-by-shift)
- Online survey / consultation
- Member-to-member phone tree
- Delegate-led crew conversations
- Social media campaign
- Community/media engagement
- Solidarity actions with other OA campaigns

---

### 4.4 Stage 4: Develop Claims / MSD

**Gate Entry**: Gate 3 — Log of Claims Survey Participation threshold met
**Gate Exit**: Gate 4 — Ready for Bargaining

If MSD (Majority Support Determination) is in play, the 50%+ threshold is a **hard gate** — this must be enforced regardless of campaign-level gate configuration.

#### Step 1: Ambitions (Stage 4)
| Category | Option Text | Variable | Type |
|----------|-------------|----------|------|
| claims | Develop and endorse Log of Claims with {target_value}% member participation | Percentage | percentage |
| claims | Achieve {target_value}% member endorsement of final claims | Percentage | percentage |
| msd | Achieve MSD with {target_value}%+ support (HARD GATE: minimum 50%) | Percentage | percentage |
| bargaining_prep | Nominate {target_value} bargaining representatives | Number | number |
| bargaining_prep | Brief all bargaining reps on claims, strategy and process | — | — |
| action_readiness | Achieve strike-ready assessment score of {target_value}% | Percentage | percentage |
| timeline | Complete Stage 4 within {target_value} weeks | Weeks | number |

---

### 4.5 Stage 5: Endorsement & Commence Bargaining

**Gate Entry**: Gate 4 — Ready for Bargaining assessment passed
**Gate Exit**: Gate 5 — Strike Ready (entry to Bargaining to Win)

#### Step 1: Ambitions (Stage 5)
| Category | Option Text | Variable | Type |
|----------|-------------|----------|------|
| bargaining | Commence formal bargaining within {target_value} weeks of Gate 4 | Weeks | number |
| bargaining | Issue NERR (Notice of Employee Representational Rights) by {target_value} | Date | date |
| engagement | Maintain {target_value}% member engagement through bargaining commencement | Percentage | percentage |
| action_readiness | Confirm strike readiness at {target_value}% | Percentage | percentage |
| timeline | Complete Stage 5 within {target_value} weeks | Weeks | number |

---

### 4.6 Stage 6: Bargaining to Win

This stage follows a different flow (see slide 12). The plan should accommodate multiple pathways:

**Pathway A: Good Offer (rare)** → Vote Yes → Settle & celebrate
**Pathway B: Bargaining drags on** → If Strong (strike ready) → PABO → Protected action
**Pathway C: Bargaining drags on** → If Weak → Return to bargaining / exit
**Pathway D: Employer Launch** → Vote → If No → Continue organising

#### Step 1: Ambitions (Stage 6)
| Category | Option Text | Variable | Type |
|----------|-------------|----------|------|
| outcome | Achieve agreement with CPI+ wage increase | — | — |
| outcome | Achieve benchmark pay conditions for this agreement | — | — |
| outcome | Close gap to benchmark EBA to within {target_value}% | Percentage | percentage |
| action | Maintain strike readiness at {target_value}% throughout bargaining | Percentage | percentage |
| action | Complete PABO application within {target_value} days of No vote | Days | number |
| engagement | Maintain {target_value}% member engagement through full bargaining period | Percentage | percentage |
| protection | Avoid intractable bargaining trap (9-month limit awareness) | — | — |
| timeline | Target agreement settlement within {target_value} weeks of commencing bargaining | Weeks | number |

---

## 5. AI INTEGRATION — THEORY OF WINNING GENERATOR

### 5.1 Architecture

Use the Anthropic Claude API (claude-sonnet-4-20250514) via a Next.js API route. The API key should be stored as a Vercel environment variable (`ANTHROPIC_API_KEY`).

```
POST /api/theory-of-winning
```

### 5.2 Input

The API route receives the current plan state:

```typescript
interface TheoryOfWinningRequest {
  campaign_id: number;
  stage_number: number;
  stage_name: string;
  ambitions: {
    text: string;
    target_value?: string;
    target_unit?: string;
    category: string;
  }[];
  where_to_play: {
    category: string;
    option_text: string;
    is_exclusion: boolean;
    priority: number;
    rationale?: string;
  }[];
  capacities: {
    category: string;
    option_text: string;
    status: string; // 'needed' | 'available' | 'gap' | 'in_progress'
  }[];
  campaign_context: {
    employer_name: string;
    worksite_names: string[];
    agreement_name: string;
    agreement_expiry?: string;
    sector: string;
    is_greenfield: boolean;
    days_to_pabo?: number;
  };
  previous_stage_theory?: string; // Theory from the previous stage for continuity
}
```

### 5.3 System Prompt

```
You are a strategic planning analyst for the Offshore Alliance, a joint union initiative
(AWU + MUA) operating in Western Australia's offshore oil and gas sector. You are helping
organisers develop their "Theory of Winning" — a causal logic chain that connects their
strategic choices to their campaign ambitions.

CONTEXT:
The Offshore Alliance uses a highly structured, high-intensity organising model focused on:
- Structured contact networks with monitorable 2-way communication
- Member-driven, shared-responsibility approach
- Stage-and-gate progression model for enterprise bargaining campaigns
- Rapid mobilisation to action capability

TASK:
Given the organiser's Ambitions (what they want to achieve) and Where to Play choices
(where they'll focus effort), generate:

1. AN IF/THEN STATEMENT: A clear causal logic chain connecting the Where to Play choices
   to the Ambitions. Format: "If we [specific actions derived from Where to Play choices],
   then [specific outcomes linked to Ambitions], because [causal reasoning]."

2. GAP ANALYSIS: Identify any gaps where:
   - Ambitions exist without corresponding Where to Play choices to support them
   - Where to Play choices don't connect to any stated Ambition
   - Critical elements of the OA model are missing (e.g., no structured contact network,
     no narrative/tone selection, no face-to-face element, no member-to-member communication)
   - Contact targets exceed the identified contact pool
   - No communication platform is selected for a communication-dependent ambition
   - No member leadership development element when mobilisation is an ambition

3. RISK ASSESSMENT: Identify risks including:
   - Employer opposition scenarios relevant to this stage
   - Timeline risks (especially if working backwards from agreement expiry)
   - Dependency risks (single points of failure)
   - Over-reliance on organiser-driven vs member-driven activity
   - The 9-month intractable bargaining trap (for Stage 6)

4. MEMBER AGENCY CHECK: Assess whether the plan builds member ownership and
   shared responsibility, or whether it risks being too organiser-dependent.

Respond in JSON format:
{
  "if_then_statement": "string",
  "gap_analysis": [
    {
      "gap_type": "missing_wtp" | "unsupported_ambition" | "model_gap" | "capacity_gap",
      "description": "string",
      "severity": "high" | "medium" | "low",
      "recommendation": "string"
    }
  ],
  "risk_assessment": [
    {
      "risk": "string",
      "likelihood": "high" | "medium" | "low",
      "impact": "high" | "medium" | "low",
      "mitigation": "string"
    }
  ],
  "member_agency_assessment": "string",
  "employer_response_considerations": "string"
}
```

### 5.4 UI Behaviour

- The "Generate Theory of Winning" button appears after at least 1 Ambition and 1 Where to Play choice have been made
- Show a loading state with "Analysing your strategic choices..." messaging
- Display the if/then statement prominently
- Show gap analysis as colour-coded cards (red = high severity, amber = medium, green = low)
- Show risk assessment as a collapsible section
- Allow the organiser to edit the AI-generated theory manually
- Allow regeneration with updated inputs
- Store version history — each generation is a new version, the organiser marks one as "current"

---

## 6. GATE SYSTEM — CONFIGURABLE ENFORCEMENT

### 6.1 Default Gate Configuration

When a new campaign is created, auto-generate these gate definitions:

| Gate | Name | Default Enforcement | Default Criteria |
|------|------|-------------------|-----------------|
| Gate 1 | Member Engagement Threshold | soft | Contact rate ≥ 60%, Response rate ≥ 40% |
| Gate 2 | Engagement Ready Assessment | soft | Education session attendance ≥ 50%, Shared responsibility commitment ≥ 40% |
| Gate 3 | Log of Claims Survey Participation | soft | Survey completion ≥ 60%, Membership density ≥ 50% |
| Gate 4 | Ready for Bargaining | configurable | Claims endorsed ≥ 70%, Bargaining reps nominated, MSD achieved if required (HARD — always) |
| Gate 5 | Strike Ready | soft | Strike readiness assessment ≥ 70%, Active WOCs on all key sites, Communication network tested |

### 6.2 Gate Assessment Workflow

1. Lead organiser or coordinator initiates gate assessment
2. System auto-populates current values from campaign data where available
3. Assessor reviews each criterion, confirms or updates values
4. System calculates pass/fail
5. If passed → next stage unlocked
6. If failed (soft gate) → warning displayed, option to proceed with written justification (logged)
7. If failed (hard gate) → progression blocked, shows what needs to happen
8. All assessments logged in `gate_assessments` with full audit trail

### 6.3 MSD Hard Gate

If the campaign's agreement requires a Majority Support Determination, the MSD criterion in Gate 4 is ALWAYS a hard gate regardless of the gate's overall enforcement setting. The UI should prominently display this as non-negotiable. The `is_hard_gate` flag on the MSD criterion overrides the parent gate's `enforcement_type`.

---

## 7. UI/UX — PAGE STRUCTURE AND FLOWS

### 7.1 Application Layout

**Navigation**: Left sidebar with:
- Dashboard (home)
- Campaigns (list + create)
- Reports
- Settings (admin only)

**Top bar**: User name, team, current campaign selector

### 7.2 Key Pages

#### Dashboard (`/dashboard`)
- Campaign overview cards showing each active campaign with:
  - Current stage (visual progress bar showing stages 1-6)
  - Days until agreement expiry (if applicable, with colour coding: green > 12mo, amber 6-12mo, red < 6mo)
  - Next gate status
  - Recent activity feed
- Quick links to "Create New Campaign" and "My Campaigns"

#### Campaign List (`/campaigns`)
- Table/card view of all campaigns the user has access to
- Filterable by: status, organiser, agreement, employer
- Sortable by: name, start date, expiry date, current stage

#### Campaign Detail (`/campaigns/[id]`)
- Campaign header: name, employer, agreement, expiry date, assigned organiser(s)
- **Timeline view**: Horizontal visual showing all 6 stages with:
  - Planned vs actual dates
  - Current stage highlighted
  - Gates between stages (green = passed, amber = pending, red = blocked, grey = future)
  - PABO availability date marker (if working backwards from expiry)
- **Stage cards**: Clickable cards for each stage, showing completion status of each P2W step

#### Stage Plan (`/campaigns/[id]/stage/[stage_number]`)
This is the core working page. It has 5 tabs or sections (one per Playing to Win step):

**Tab 1: Ambitions**
- List of selected ambitions with target values
- "Add Ambition" button showing options sorted by use_count (most popular first)
- Custom ambition input
- Target value inputs (number/percentage/date depending on variable_type)
- Target date for each ambition
- Progress indicator (achieved/not achieved)

**Tab 2: Where to Play**
- Organised by category (accordion/collapsible sections)
- Each category shows its options as selectable chips/cards, sorted by use_count
- Selected options highlighted with priority indicator (high/medium/low)
- "Not playing here" section for exclusions
- Rationale text field for each selection
- Dynamic options from database (worksites, employers, sectors) mixed with static defaults
- "Add Custom Option" within each category

**Tab 3: Theory of Winning**
- If no ambitions or WTP choices → prompt to complete Steps 1 & 2 first
- "Generate Theory" button
- Displays:
  - If/then statement (editable text area)
  - Gap analysis cards (colour-coded)
  - Risk assessment (collapsible)
  - Member agency assessment
  - Employer response considerations
- Version history sidebar
- "Regenerate" and "Edit Manually" buttons

**Tab 4: Capacities & Resources**
- Auto-suggested based on WTP selections (with smart linking via `linked_wtp_categories`)
- Status selector for each: Available ✓ | Gap ⚠ | In Progress → | Needed ?
- Gap items highlighted with fields for: gap description, resolution plan, target resolution date
- Assigned organiser selector
- "Add Resource" button with options sorted by use_count

**Tab 5: Management Systems**
- Meeting rhythms configuration
- Reporting tools and schedules
- Tracking system assignments
- Accountability structures
- Each item has: responsible person, frequency, description
- Calendar-style view of upcoming reporting/meeting commitments

#### Gate Assessment (`/campaigns/[id]/gate/[gate_number]`)
- List of criteria with current vs target values
- Visual pass/fail for each criterion
- Hard gate indicators (locked icon, prominent warning)
- "Assess Gate" button (lead organiser / coordinator only)
- Override workflow for soft gates (justification required)
- Historical assessments log

#### Reports (`/reports`)
- Campaign progress summary (all campaigns)
- Stage completion times (benchmarking)
- Gate pass rates
- Organiser activity reports
- Timeline variance reports (planned vs actual)
- Exportable to PDF/CSV

### 7.3 Option Selection Pattern (Reusable Component)

Build a reusable `<OptionSelector>` component used across all P2W steps:

```typescript
interface OptionSelectorProps {
  options: Option[];           // Pre-loaded + user-created options
  selectedOptions: Selected[]; // Currently selected
  onSelect: (option: Option) => void;
  onDeselect: (optionId: number) => void;
  onAddCustom: (text: string) => void;
  sortBy: 'use_count' | 'alphabetical' | 'category';
  allowCustom: boolean;
  showCategories: boolean;     // Group by category
  multiSelect: boolean;
}
```

- Options sorted by `use_count` DESC by default (most commonly selected first)
- Search/filter input at top
- Category grouping with collapsible sections
- Selected items pinned to top with checkmark
- "Add custom" input at bottom of list
- When a custom option is added, it's created in the relevant options table with `is_system_default = false`
- When ANY option is selected, increment `use_count` on that option (decrement on deselect)

---

## 8. SEED DATA — WA OFFSHORE SPECIFIC DEFAULTS

On initial deployment, run a seed script that populates all option tables with the defaults specified in Section 4. Additionally:

### 8.1 Gate Criteria Templates

Pre-load gate criteria templates that get copied when a new campaign creates its gate definitions:

```json
{
  "gate_1": {
    "criteria": [
      {"name": "Contact Rate", "metric_type": "percentage", "target": "60", "description": "Percentage of identified contacts successfully reached"},
      {"name": "Response Rate", "metric_type": "percentage", "target": "40", "description": "Percentage of contacted workers who responded/engaged"},
      {"name": "Mapping Completion", "metric_type": "percentage", "target": "80", "description": "Percentage of worksite/crew mapping completed"},
      {"name": "Contact Details Verified", "metric_type": "percentage", "target": "50", "description": "Percentage of contacts with verified name, phone, email"}
    ]
  },
  "gate_2": {
    "criteria": [
      {"name": "Education Participation", "metric_type": "percentage", "target": "50", "description": "Percentage of contacts who attended an education/info session"},
      {"name": "Shared Responsibility Commitment", "metric_type": "percentage", "target": "40", "description": "Percentage of engaged contacts who've confirmed shared responsibility"},
      {"name": "WOC Established", "metric_type": "boolean", "target": "true", "description": "At least one WOC established on a key worksite"},
      {"name": "Engagement Quality Score", "metric_type": "percentage", "target": "60", "description": "Percentage of contacts rated as actively engaged (not just contacted)"}
    ]
  },
  "gate_3": {
    "criteria": [
      {"name": "Log of Claims Survey Completion", "metric_type": "percentage", "target": "60", "description": "Percentage of members who completed the Log of Claims survey"},
      {"name": "Membership Density", "metric_type": "percentage", "target": "50", "description": "Union membership as percentage of workers on agreement scope"},
      {"name": "Active WOCs", "metric_type": "count", "target": "2", "description": "Number of active WOCs across worksites"},
      {"name": "Delegate Coverage", "metric_type": "percentage", "target": "50", "description": "Percentage of mapped areas with an active member contact"}
    ]
  },
  "gate_4": {
    "criteria": [
      {"name": "Claims Endorsement", "metric_type": "percentage", "target": "70", "description": "Percentage of members who endorsed the final Log of Claims"},
      {"name": "Bargaining Reps Nominated", "metric_type": "boolean", "target": "true", "description": "Bargaining representatives formally nominated"},
      {"name": "MSD Achieved (if required)", "metric_type": "percentage", "target": "50", "is_hard_gate": true, "description": "Majority Support Determination — 50%+ is NON-NEGOTIABLE if MSD is required"},
      {"name": "Strike Readiness Indicator", "metric_type": "percentage", "target": "60", "description": "Percentage of members indicating willingness to take protected action if needed"}
    ]
  },
  "gate_5": {
    "criteria": [
      {"name": "Strike Readiness Assessment", "metric_type": "percentage", "target": "70", "description": "Formal strike readiness assessment score"},
      {"name": "Communication Network Tested", "metric_type": "boolean", "target": "true", "description": "2-way communication network tested and functional"},
      {"name": "WOC Coverage", "metric_type": "percentage", "target": "80", "description": "Percentage of key worksites with active WOC"},
      {"name": "PABO Preparation Complete", "metric_type": "boolean", "target": "true", "description": "PABO application materials prepared and ready to file"}
    ]
  }
}
```

---

## 9. CAMPAIGN CREATION WORKFLOW

### 9.1 New Campaign Flow

1. **Select Agreement**: Choose from `agreements` table (filtered to Current or Expired status). Auto-populates:
   - Employer name(s) from agreement_employers / agreements.employer_id
   - Worksite(s) from agreement_worksites
   - Sector from agreements.sector_id
   - Expiry date from agreements.expiry_date
   - EBA status from worksite_employer_eba_status view

2. **Set Campaign Parameters**:
   - Campaign name (default: "{employer_short_name} EBA {year}")
   - Campaign type (default: "enterprise_bargaining")
   - Assigned lead organiser (from organisers table)
   - MSD required? (yes/no — if yes, activates hard gate on Gate 4)

3. **Configure Timeline**:
   - If agreement has expiry date → auto-calculate PABO date (expiry - 30 days)
   - Show: "You have X weeks until PABO becomes available"
   - Working backwards mode: suggest stage durations to fit timeline
   - If no expiry (greenfield) → organiser sets their own timeline
   - Visual timeline generator showing proposed stage dates

4. **Configure Gates**:
   - Pre-populate from gate criteria templates
   - Allow adjustment of thresholds
   - Allow switching enforcement type (soft/hard) per gate
   - MSD hard gate locked if MSD required

5. **Create**: Generates campaign record, campaign_stage_plans for all 6 stages, gate_definitions, campaign_timeline, and stage_timeline_targets.

### 9.2 Campaign Linking

When a campaign is created, it should link to the existing `campaigns` table and populate:
- `campaigns.campaign_type` = 'enterprise_bargaining'
- `campaigns.organiser_id` = lead organiser
- The `campaign_timelines` table links to the agreement for expiry date tracking

This means the existing `campaigns_view`, `campaign_actions`, and `campaign_universes` tables continue to work alongside the new planning tables.

---

## 10. REPORTING & MANAGEMENT SYSTEMS

### 10.1 Dashboard Metrics

The dashboard should pull live data from both the new planning tables and the existing campaign database:

- **Campaign Progress**: Visual stage progress for each active campaign
- **Gate Status**: Traffic light indicators for upcoming gates
- **Timeline Health**: Variance between planned and actual dates
- **Ambition Tracking**: Progress toward ambition targets (per stage, per campaign)
- **Resource Gaps**: Outstanding capacity gaps across all campaigns
- **Upcoming Deadlines**: Next gate assessments, agreement expiry dates, reporting due dates

### 10.2 Reporting Snapshots

The `reporting_snapshots` table captures periodic state for historical tracking. Implement:

- **Auto-weekly snapshots**: Cron job (Vercel cron or Supabase pg_cron) that captures campaign state every Monday
- **Gate review snapshots**: Automatically captured when a gate assessment is performed
- **Manual snapshots**: "Take Snapshot" button for ad-hoc state capture

### 10.3 Exportable Reports

- Campaign plan summary (PDF) — full Playing to Win plan for a campaign stage
- Gate assessment report (PDF) — criteria, outcomes, evidence
- Campaign progress report (CSV/PDF) — timeline, ambition progress, resource status
- Activity report by organiser (CSV) — actions taken, conversations logged, outcomes

---

## 11. ROW LEVEL SECURITY (RLS) POLICIES

All new tables must have RLS enabled. Follow the pattern established in the existing database:

```sql
-- Example for campaign_stage_plans
ALTER TABLE campaign_stage_plans ENABLE ROW LEVEL SECURITY;

-- Admins (coordinator, industrial_coordinator) see everything
CREATE POLICY "Admins full access" ON campaign_stage_plans
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Lead organisers see their team's campaigns
CREATE POLICY "Lead organisers team access" ON campaign_stage_plans
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM user_profiles up
    JOIN campaigns c ON c.campaign_id = campaign_stage_plans.campaign_id
    WHERE up.user_id = auth.uid()
    AND up.work_role = 'lead_organiser'
    AND (c.organiser_id = up.organiser_id OR
         c.organiser_id IN (
           SELECT up2.organiser_id FROM user_profiles up2
           WHERE up2.reports_to = up.user_id
         ))
  )
);

-- Organisers see campaigns they're assigned to
CREATE POLICY "Organisers assigned campaigns" ON campaign_stage_plans
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM user_profiles up
    JOIN agreement_organisers ao ON ao.organiser_id = up.organiser_id
    JOIN campaigns c ON c.campaign_id = campaign_stage_plans.campaign_id
    WHERE up.user_id = auth.uid()
  )
);
```

Apply equivalent policies to ALL new tables. The key principle: organisers see campaigns they're assigned to, lead organisers see their team's campaigns, admins see everything.

---

## 12. FILE STRUCTURE (NEXT.JS APP ROUTER)

```
src/
├── app/
│   ├── layout.tsx                    # Root layout with sidebar nav
│   ├── page.tsx                      # Redirect to /dashboard
│   ├── dashboard/
│   │   └── page.tsx                  # Dashboard with campaign cards
│   ├── campaigns/
│   │   ├── page.tsx                  # Campaign list
│   │   ├── new/
│   │   │   └── page.tsx              # Campaign creation wizard
│   │   └── [id]/
│   │       ├── page.tsx              # Campaign detail + timeline
│   │       ├── stage/
│   │       │   └── [stageNumber]/
│   │       │       └── page.tsx      # Stage plan (5 P2W tabs)
│   │       └── gate/
│   │           └── [gateNumber]/
│   │               └── page.tsx      # Gate assessment
│   ├── reports/
│   │   └── page.tsx                  # Reporting dashboard
│   ├── settings/
│   │   └── page.tsx                  # Admin settings
│   └── api/
│       ├── theory-of-winning/
│       │   └── route.ts              # Claude API integration
│       └── snapshots/
│           └── route.ts              # Reporting snapshot generation
├── components/
│   ├── ui/                           # shadcn/ui components
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   ├── TopBar.tsx
│   │   └── CampaignSelector.tsx
│   ├── campaign/
│   │   ├── CampaignCard.tsx
│   │   ├── CampaignTimeline.tsx
│   │   ├── StageProgressBar.tsx
│   │   └── CampaignCreationWizard.tsx
│   ├── planning/
│   │   ├── OptionSelector.tsx        # REUSABLE — the core selection component
│   │   ├── AmbitionPanel.tsx
│   │   ├── WhereToPlayPanel.tsx
│   │   ├── TheoryOfWinningPanel.tsx
│   │   ├── CapacitiesPanel.tsx
│   │   └── ManagementSystemsPanel.tsx
│   ├── gates/
│   │   ├── GateAssessment.tsx
│   │   ├── GateCriterionRow.tsx
│   │   └── GateOverrideModal.tsx
│   └── reports/
│       ├── DashboardMetrics.tsx
│       ├── TimelineChart.tsx
│       └── AmbitionTracker.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts                 # Supabase browser client
│   │   ├── server.ts                 # Supabase server client
│   │   └── types.ts                  # Generated TypeScript types
│   ├── api/
│   │   └── anthropic.ts              # Claude API helper
│   ├── hooks/
│   │   ├── useCampaign.ts
│   │   ├── useStagePlan.ts
│   │   ├── useOptions.ts
│   │   ├── useGateAssessment.ts
│   │   └── useTheoryOfWinning.ts
│   └── utils/
│       ├── timeline.ts               # Date/timeline calculation helpers
│       ├── gate-logic.ts             # Gate pass/fail evaluation
│       └── option-sorting.ts         # Popularity-based sorting
└── types/
    └── index.ts                      # Shared TypeScript types
```

---

## 13. ENVIRONMENT VARIABLES

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://gteygwfgjvczanmrwgbr.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# Anthropic
ANTHROPIC_API_KEY=<anthropic-api-key>

# App
NEXT_PUBLIC_APP_URL=<vercel-deployment-url>
```

---

## 14. BUILD SEQUENCE (FOR CURSOR MULTI-AGENT)

Execute in this order to manage dependencies:

### Phase 1: Foundation
1. Initialize Next.js 14 project with TypeScript, Tailwind, shadcn/ui
2. Configure Supabase client (browser + server)
3. Set up authentication flow (using existing Supabase Auth + user_profiles)
4. Create database migration for all new tables (Section 3)
5. Generate TypeScript types from Supabase schema
6. Run seed script for default options (Section 4 + Section 8)

### Phase 2: Core Data Layer
7. Build Supabase query hooks (useCampaign, useStagePlan, useOptions, etc.)
8. Build the `OptionSelector` reusable component
9. Build campaign creation wizard (Section 9)

### Phase 3: Planning Interface
10. Build the Stage Plan page with 5 P2W tabs
11. Build AmbitionPanel with option selection + target values
12. Build WhereToPlayPanel with categorised options + dynamic DB options
13. Build TheoryOfWinningPanel with Claude API integration
14. Build CapacitiesPanel with auto-suggestion from WTP
15. Build ManagementSystemsPanel

### Phase 4: Gates & Timeline
16. Build gate definition management
17. Build gate assessment workflow
18. Build campaign timeline visualisation
19. Build timeline calculation logic (working backwards from expiry)

### Phase 5: Dashboard & Reporting
20. Build dashboard with campaign cards and metrics
21. Build reporting snapshot system
22. Build exportable reports

### Phase 6: Polish & Deploy
23. Implement RLS policies on all new tables
24. Add loading states, error handling, empty states
25. Responsive design pass
26. Deploy to Vercel

---

## 15. KEY DESIGN PRINCIPLES

1. **Popularity sorting everywhere** — Options are always sorted by `use_count` DESC so the most commonly used choices appear first. This creates an emergent "best practice" effect over time.

2. **Structured but flexible** — Every step has sensible defaults but allows custom additions. The system learns from user behaviour.

3. **Data-connected** — Where to Play options pull live data from the existing campaign database (worksites, employers, sectors, workers) rather than being purely static lists.

4. **AI-augmented, not AI-dependent** — The Theory of Winning AI is a tool to help organisers think, not a replacement for strategic judgement. All AI output is editable and versionable.

5. **Audit trail** — Every gate assessment, theory version, and plan change is logged. This supports the transparency principle of the OA model.

6. **Time-aware** — The system always knows how many days until agreement expiry and PABO availability, and surfaces timeline pressure in the UI.

7. **Member-centric** — The AI gap analysis specifically checks for member agency and shared responsibility, reinforcing the OA model's core principle that this is member-driven organising, not organiser-driven.

---

*End of Development Brief*
