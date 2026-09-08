-- ============================================================
-- OA Campaign Strategic Planner — New Tables
-- Phase 1: Options / Defaults Tables
-- ============================================================

-- Ambition options — pre-loaded defaults, user-addable
CREATE TABLE ambition_options (
    option_id SERIAL PRIMARY KEY,
    stage_number INTEGER NOT NULL CHECK (stage_number BETWEEN 1 AND 6),
    category VARCHAR NOT NULL,
    option_text TEXT NOT NULL,
    has_variable BOOLEAN DEFAULT FALSE,
    variable_label VARCHAR,
    variable_type VARCHAR, -- 'number', 'percentage', 'text', 'date'
    is_system_default BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES auth.users(id),
    use_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Where to Play categories
CREATE TABLE wtp_categories (
    category_id SERIAL PRIMARY KEY,
    category_name VARCHAR NOT NULL,
    description TEXT,
    applies_to_stages INTEGER[],
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
    option_text VARCHAR NOT NULL,
    description TEXT,
    linked_wtp_categories INTEGER[],
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
    option_text VARCHAR NOT NULL,
    description TEXT,
    default_frequency VARCHAR,
    is_system_default BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES auth.users(id),
    use_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Phase 2: Planning Tables
-- ============================================================

-- Core planning container — one plan per campaign per stage
CREATE TABLE campaign_stage_plans (
    plan_id SERIAL PRIMARY KEY,
    campaign_id INTEGER NOT NULL REFERENCES campaigns(campaign_id),
    stage_number INTEGER NOT NULL CHECK (stage_number BETWEEN 1 AND 6),
    stage_name VARCHAR NOT NULL,
    status VARCHAR NOT NULL DEFAULT 'draft', -- draft, active, completed, blocked
    planned_start_date DATE,
    planned_end_date DATE,
    actual_start_date DATE,
    actual_end_date DATE,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(campaign_id, stage_number)
);

-- Playing to Win Step 1: Ambitions
CREATE TABLE plan_ambitions (
    ambition_id SERIAL PRIMARY KEY,
    plan_id INTEGER NOT NULL REFERENCES campaign_stage_plans(plan_id) ON DELETE CASCADE,
    ambition_option_id INTEGER REFERENCES ambition_options(option_id),
    custom_text TEXT,
    target_value VARCHAR,
    target_unit VARCHAR,
    target_date DATE,
    is_achieved BOOLEAN DEFAULT FALSE,
    achieved_date DATE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Playing to Win Step 2: Where to Play choices
CREATE TABLE plan_where_to_play (
    wtp_id SERIAL PRIMARY KEY,
    plan_id INTEGER NOT NULL REFERENCES campaign_stage_plans(plan_id) ON DELETE CASCADE,
    wtp_category_id INTEGER NOT NULL REFERENCES wtp_categories(category_id),
    wtp_option_id INTEGER REFERENCES wtp_options(option_id),
    custom_text TEXT,
    rationale TEXT,
    is_exclusion BOOLEAN DEFAULT FALSE,
    priority INTEGER DEFAULT 2 CHECK (priority BETWEEN 1 AND 3), -- 1=high, 2=medium, 3=low
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Playing to Win Step 3: Theory of Winning
CREATE TABLE plan_theory_of_winning (
    theory_id SERIAL PRIMARY KEY,
    plan_id INTEGER NOT NULL REFERENCES campaign_stage_plans(plan_id) ON DELETE CASCADE,
    if_then_statement TEXT NOT NULL,
    ai_generated BOOLEAN DEFAULT FALSE,
    ai_model VARCHAR,
    ai_prompt_snapshot JSONB,
    gap_analysis JSONB,
    risk_assessment JSONB,
    critical_dependency TEXT,
    contingency_plan TEXT,
    member_agency_assessment TEXT,
    employer_response_plan TEXT,
    is_current BOOLEAN DEFAULT TRUE,
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
    status VARCHAR NOT NULL DEFAULT 'needed', -- needed, available, gap, in_progress
    assigned_to INTEGER REFERENCES organisers(organiser_id),
    gap_description TEXT,
    resolution_plan TEXT,
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
    frequency VARCHAR, -- daily, weekly, fortnightly, monthly, as_needed
    responsible_organiser_id INTEGER REFERENCES organisers(organiser_id),
    description TEXT,
    metrics JSONB,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Phase 3: Gate Tables
-- ============================================================

-- Gate definitions — configurable thresholds per campaign
CREATE TABLE gate_definitions (
    gate_id SERIAL PRIMARY KEY,
    campaign_id INTEGER NOT NULL REFERENCES campaigns(campaign_id),
    gate_number INTEGER NOT NULL CHECK (gate_number BETWEEN 1 AND 5),
    gate_name VARCHAR NOT NULL,
    enforcement_type VARCHAR NOT NULL DEFAULT 'soft', -- 'hard' | 'soft'
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
    metric_type VARCHAR NOT NULL, -- 'percentage', 'count', 'boolean', 'date'
    target_value VARCHAR NOT NULL,
    current_value VARCHAR,
    is_met BOOLEAN DEFAULT FALSE,
    is_hard_gate BOOLEAN DEFAULT FALSE,
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
    outcome VARCHAR NOT NULL, -- 'passed', 'failed', 'override_approved', 'deferred'
    override_justification TEXT,
    assessed_by UUID REFERENCES auth.users(id),
    approved_by UUID REFERENCES auth.users(id),
    notes TEXT,
    snapshot JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Phase 4: Timeline & Reporting Tables
-- ============================================================

-- Campaign timeline — auto-calculated from agreement expiry dates
CREATE TABLE campaign_timelines (
    timeline_id SERIAL PRIMARY KEY,
    campaign_id INTEGER NOT NULL REFERENCES campaigns(campaign_id) UNIQUE,
    agreement_id INTEGER REFERENCES agreements(agreement_id),
    agreement_expiry_date DATE,
    pabo_available_date DATE, -- 30 days before expiry
    peak_engagement_target_date DATE,
    working_backwards BOOLEAN DEFAULT FALSE,
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
    is_on_track BOOLEAN DEFAULT TRUE,
    variance_days INTEGER DEFAULT 0,
    notes TEXT,
    UNIQUE(timeline_id, stage_number)
);

-- Reporting snapshots — periodic state captures for dashboards
CREATE TABLE reporting_snapshots (
    snapshot_id SERIAL PRIMARY KEY,
    campaign_id INTEGER NOT NULL REFERENCES campaigns(campaign_id),
    snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
    snapshot_type VARCHAR NOT NULL DEFAULT 'weekly', -- 'daily', 'weekly', 'gate_review', 'manual'
    data JSONB NOT NULL,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Indexes for performance
-- ============================================================

CREATE INDEX idx_campaign_stage_plans_campaign_id ON campaign_stage_plans(campaign_id);
CREATE INDEX idx_plan_ambitions_plan_id ON plan_ambitions(plan_id);
CREATE INDEX idx_plan_where_to_play_plan_id ON plan_where_to_play(plan_id);
CREATE INDEX idx_plan_theory_of_winning_plan_id ON plan_theory_of_winning(plan_id);
CREATE INDEX idx_plan_capacities_plan_id ON plan_capacities(plan_id);
CREATE INDEX idx_plan_management_systems_plan_id ON plan_management_systems(plan_id);
CREATE INDEX idx_gate_definitions_campaign_id ON gate_definitions(campaign_id);
CREATE INDEX idx_gate_criteria_gate_id ON gate_criteria(gate_id);
CREATE INDEX idx_gate_assessments_gate_id ON gate_assessments(gate_id);
CREATE INDEX idx_reporting_snapshots_campaign_id ON reporting_snapshots(campaign_id);
CREATE INDEX idx_ambition_options_stage_number ON ambition_options(stage_number);
CREATE INDEX idx_capacity_options_stage_number ON capacity_options(stage_number);
CREATE INDEX idx_management_system_options_stage_number ON management_system_options(stage_number);
