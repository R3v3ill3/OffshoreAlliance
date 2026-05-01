/**
 * Closed vocabularies for the campaign Situation Analysis step.
 *
 * These IDs are duplicated as CHECK constraints / inline checks in
 * supabase/migrations/20260507120000_campaign_situation_analyses.sql
 * and as the closed-vocabulary anchor in
 * apps/organising-db/src/lib/prompts/situation-analysis-prompts.ts —
 * keep all three in sync.
 */

export const EMPLOYER_INTERACTION_STATES = [
  {
    id: "no_engagement",
    label: "No employer engagement",
    description:
      "We have not yet had any substantive contact with the employer about this campaign.",
  },
  {
    id: "preemptive_setup",
    label: "Suspect employer preparing pre-emptive bargaining",
    description:
      "Signals (e.g. legal advice retained, HR moves, communications drafted) suggest the employer is preparing a pre-emptive bargaining play.",
  },
  {
    id: "bargaining_underway",
    label: "Bargaining underway",
    description: "Formal bargaining sessions are in progress.",
  },
  {
    id: "agreement_balloted",
    label: "Agreement has been balloted",
    description:
      "The employer has put a proposed agreement to a vote. Use the count field to record how many times.",
  },
  {
    id: "employer_delaying",
    label: "Employer delaying / refusing to initiate bargaining",
    description:
      "The employer is using delay or procedural tactics to avoid commencing bargaining.",
  },
  {
    id: "industrial_action_phase",
    label: "Industrial action phase",
    description:
      "Protected (or unprotected) industrial action is being organised, balloted, or under way.",
  },
  {
    id: "post_settlement",
    label: "Post-settlement / implementation",
    description:
      "Bargaining has concluded and the campaign is now focused on implementation, monitoring, or compliance.",
  },
  {
    id: "other",
    label: "Other (describe)",
    description:
      "None of the above. Use the free-text field to describe what is happening.",
  },
] as const;

export type EmployerInteractionState =
  (typeof EMPLOYER_INTERACTION_STATES)[number]["id"];

export const WORKFORCE_EVENT_TYPES = [
  { id: "scheduled_shutdown", label: "Scheduled shutdown / maintenance" },
  { id: "project_mobilisation", label: "Project mobilisation" },
  { id: "project_demobilisation", label: "Project demobilisation" },
  { id: "redundancy_round", label: "Redundancy round" },
  { id: "scope_opening", label: "New scope of work opening" },
  { id: "scope_closing", label: "Scope of work closing" },
  { id: "contractor_change", label: "Change of contractor" },
  { id: "restructure", label: "Restructure" },
  { id: "other", label: "Other" },
] as const;

export type WorkforceEventType = (typeof WORKFORCE_EVENT_TYPES)[number]["id"];

export const WORKFORCE_EVENT_SCALES = [
  { id: "small", label: "Small (<10% of workforce)" },
  { id: "medium", label: "Medium (10–50%)" },
  { id: "large", label: "Large (>50%)" },
] as const;

export type WorkforceEventScale = (typeof WORKFORCE_EVENT_SCALES)[number]["id"];

export const EMPLOYER_RELATIONSHIP_TYPES = [
  { id: "parent_company", label: "Parent company" },
  { id: "subsidiary", label: "Subsidiary" },
  { id: "tier_one_client", label: "Tier-one client" },
  { id: "sub_contractor", label: "Sub-contractor" },
  { id: "sister_site", label: "Sister site (same employer, different site)" },
  { id: "industry_peer", label: "Industry peer / benchmark" },
  { id: "joint_venture", label: "Joint venture partner" },
  { id: "other", label: "Other" },
] as const;

export type EmployerRelationshipType =
  (typeof EMPLOYER_RELATIONSHIP_TYPES)[number]["id"];

export const HR_SENTIMENT_SCALE = [
  { id: "hostile", label: "Hostile", colour: "red" },
  { id: "guarded", label: "Guarded", colour: "amber" },
  { id: "neutral", label: "Neutral", colour: "zinc" },
  { id: "cooperative", label: "Cooperative", colour: "emerald" },
  { id: "collaborative", label: "Collaborative", colour: "sky" },
] as const;

export type HrSentiment = (typeof HR_SENTIMENT_SCALE)[number]["id"];

/** 1..5 heat scale for top issues. */
export const ISSUE_HEAT_LEVELS = [
  { value: 1, label: "Cold" },
  { value: 2, label: "Cool" },
  { value: 3, label: "Warm" },
  { value: 4, label: "Hot" },
  { value: 5, label: "Burning" },
] as const;

export type IssueHeat = 1 | 2 | 3 | 4 | 5;

/** Coarse bargaining stage captured in wizard step 1. */
export type WizardBargainingTriage = 'not_started' | 'underway' | 'advanced';

/**
 * Maps the wizard bargaining triage value to the most-likely
 * `employer_interaction_state` default for step 7.
 *
 * Used to pre-suggest a starting state in the situation analysis picker when
 * the organiser has already indicated how far along bargaining is. The
 * organiser can always override the suggestion.
 */
export const TRIAGE_TO_INTERACTION_STATE_DEFAULTS: Record<
  WizardBargainingTriage,
  EmployerInteractionState
> = {
  not_started: 'no_engagement',
  underway: 'bargaining_underway',
  advanced: 'agreement_balloted',
} as const;
