/**
 * campaign-tabs.ts
 *
 * Central registry for campaign detail page tab routing.
 *
 * Phase A — Foundation:
 *   - REDIRECT_MAP: maps every legacy ?tab= value to a new {tab, sub} pair so
 *     old bookmarked URLs are automatically rewritten to the clustered structure.
 *   - resolveTabParams: apply the redirect map and return a normalised {tab, sub}.
 *
 * A campaign URL that carries no (or an unknown) ?tab= opens on
 * Workforce › Wall chart — see DEFAULT_CAMPAIGN_TAB / DEFAULT_CAMPAIGN_SUB.
 * Overview is still reachable, but only as an explicit ?tab=overview.
 *
 * WP1.4 adds CAMPAIGN_TAB_REGISTRY: the labels and workspace module ids of
 * the eight tabs and twenty-one sub-tabs, as data. The import of
 * `WorkspaceModuleId` below is type-only, so it is erased at build time and
 * this file keeps zero runtime dependencies — the node-environment test at
 * src/lib/__tests__/campaign-tabs.test.ts still imports it directly.
 */

import type { WorkspaceModuleId } from "@/lib/workspace/modules";

/** The full set of top-level tab identifiers (current + future cluster names). */
export const VALID_TABS = [
  "overview",
  "campaign-plan",
  "workplan",
  "universe",
  "assessments",
  "reporting",
  "insights",
  "wall",
  "tasklists",
  "comms",
  "phone",
  "actions",
  "results",
  "bargaining",
  // Future cluster tabs (added by Phases B–E):
  "plan",
  "workforce",
  "outreach",
  "outcomes",
  // Phase F:
  "library",
  // Section Planning module — Phase 1:
  // Stripped-back, period-scoped sibling planner. Distinct from "plan"
  // (the P2W stage planner cluster). Has no sub-tabs at present.
  "section-plans",
] as const;

export type ValidTab = (typeof VALID_TABS)[number];

/**
 * Default sub-tab for each top-level cluster tab.
 *
 * Outreach sub-tabs: comms | phone | sms | soc. The "sms" sub-tab
 * (SMS module Phase 1) renders InlineSmsOpsPanel and is the landing
 * target of the worker-list fire/sms redirect
 * (?tab=outreach&sub=sms&sms_list=<id>).
 */
export const DEFAULT_SUB: Partial<Record<ValidTab, string>> = {
  plan: "strategy",
  workforce: "wall-chart",
  outreach: "comms",
  outcomes: "reports",
};

interface ResolvedTabParams {
  tab: string;
  sub: string | null;
}

/**
 * REDIRECT_MAP
 *
 * Maps legacy ?tab= values to their new clustered {tab, sub} equivalents.
 * Keys are the old tab values; values are the canonical {tab, sub} pairs.
 *
 * Legacy key     →  new tab      new sub
 * ─────────────────────────────────────────
 * campaign-plan  →  plan         strategy
 * workplan       →  plan         workplan
 * actions        →  plan         actions
 * tasklists      →  plan         task-lists
 * universe       →  workforce    universe
 * assessments    →  workforce    assessments
 * wall           →  workforce    wall-chart
 * comms          →  outreach     comms
 * phone          →  outreach     phone
 * reporting      →  outcomes     reports
 * insights       →  outcomes     insights
 * results        →  outcomes     results
 */
export const REDIRECT_MAP: Record<string, { tab: string; sub: string }> = {
  "campaign-plan": { tab: "plan", sub: "strategy" },
  workplan: { tab: "plan", sub: "workplan" },
  actions: { tab: "plan", sub: "actions" },
  tasklists: { tab: "plan", sub: "task-lists" },
  universe: { tab: "workforce", sub: "universe" },
  assessments: { tab: "workforce", sub: "assessments" },
  wall: { tab: "workforce", sub: "wall-chart" },
  comms: { tab: "outreach", sub: "comms" },
  phone: { tab: "outreach", sub: "phone" },
  reporting: { tab: "outcomes", sub: "reports" },
  insights: { tab: "outcomes", sub: "insights" },
  results: { tab: "outcomes", sub: "results" },
};

/** The tab a campaign opens on when the URL carries no (or an unknown) ?tab=. */
export const DEFAULT_CAMPAIGN_TAB = "workforce";
/** The sub-tab that pairs with DEFAULT_CAMPAIGN_TAB. Must match DEFAULT_SUB. */
export const DEFAULT_CAMPAIGN_SUB = "wall-chart";

/**
 * resolveTabParams
 *
 * Given the raw ?tab= and ?sub= values from the URL, returns the canonical
 * {tab, sub} pair after:
 *   1. Falling back to the campaign default (Workforce › Wall chart) when
 *      ?tab= is absent or unknown. An explicit ?sub= is still honoured.
 *   2. Applying REDIRECT_MAP for legacy tab values.
 *   3. Falling back to the default sub-tab for known cluster tabs when ?sub= is absent.
 *
 * Returns null for `sub` when the resolved tab has no sub-tabs.
 */
export function resolveTabParams(
  tab: string | null,
  sub: string | null
): ResolvedTabParams {
  if (!tab) {
    return { tab: DEFAULT_CAMPAIGN_TAB, sub: sub ?? DEFAULT_CAMPAIGN_SUB };
  }

  // Apply legacy redirect if applicable.
  const redirect = REDIRECT_MAP[tab];
  if (redirect) {
    return {
      tab: redirect.tab,
      // Honor an explicit ?sub= even after a tab redirect (future-proof).
      sub: sub ?? redirect.sub,
    };
  }

  // Known cluster tab with no explicit sub — apply default.
  const defaultSub = DEFAULT_SUB[tab as ValidTab];
  if (defaultSub !== undefined) {
    return { tab, sub: sub ?? defaultSub };
  }

  // Ordinary tab (overview, campaign-plan, bargaining, etc.) — no sub.
  return { tab, sub: null };
}

/**
 * needsRedirect
 *
 * Returns true when the raw URL params differ from the resolved params,
 * meaning a router.replace() is needed to rewrite the URL.
 */
export function needsRedirect(
  rawTab: string | null,
  rawSub: string | null,
  resolved: ResolvedTabParams
): boolean {
  return rawTab !== resolved.tab || rawSub !== resolved.sub;
}

// ── WP1.4: the tab registry, with labels and module ids ─────────────────
//
// Appendix D 3.1 recorded that "the registry holds no labels, no components,
// no gating — those live inline in the page". This is the part that changes:
// labels and workspace module ids move here so one pure resolver
// (src/lib/campaign/workspace-tabs.ts) can decide what a given user sees.
//
// Every `label` below is copied character for character from the rendered
// text of the corresponding TabsTrigger in
// src/app/(dashboard)/campaigns/[id]/page.tsx. The JSX entities there
// (&amp;, &apos;) are written as the characters they render, because the
// tab bar renders these labels as JS strings and React escapes them again.
// Full-mode labels are frozen: renaming one is WP2.7/WP3.3 work, not this
// registry's.
//
// Workspace mode is presentation, never permission: a module id here only
// decides where a surface appears in the organiser-mode menu. Every
// ?tab=&sub= pair still resolves and renders in both modes.

/** One addressable second-level surface: a ?sub= value under a cluster tab. */
export interface CampaignSubTabDef {
  /** The ?sub= value; the URL contract, never derived from the label. */
  sub: string;
  /** Exactly today's TabsTrigger text. */
  label: string;
  module: WorkspaceModuleId;
  /** Extra query params this surface needs, written on navigation. */
  params?: Readonly<Record<string, string>>;
}

/** One top-level ?tab= value. */
export interface CampaignTabDef {
  tab: string;
  label: string;
  module: WorkspaceModuleId;
  subs: readonly CampaignSubTabDef[];
  /** Non-null only for Bargaining: rendered only at this campaigns.current_phase. */
  requiresPhase?: string;
}

/**
 * The eight tabs and twenty-one sub-tabs the campaign page renders today, in
 * render order (the twenty WP1.4 pinned plus Outcomes › Surveys & Forms). `subs[0].sub` is DEFAULT_SUB[tab] for every cluster tab —
 * asserted by the registry-integrity test.
 *
 * Module assignments follow the WP1.4 plan §2.1.2 and the orchestrator's
 * approval of its open question Q1: `pending-review` is `strategic_plan`
 * (it reviews plan ambitions) and `role-check` is `wall_chart_people`
 * (it is about workers).
 */
export const CAMPAIGN_TAB_REGISTRY: readonly CampaignTabDef[] = [
  {
    tab: "overview",
    label: "Overview",
    // Five of Overview's six panels are reporting panels, which is exactly
    // the plan-5.2 Insights row ("reports, results, campaign progress,
    // facts report"). `insights` is muted when off, so an organiser sees
    // "Overview — Ask an admin to enable" rather than nothing.
    module: "insights",
    subs: [],
  },
  {
    tab: "plan",
    label: "Plan & Execution",
    module: "strategic_plan",
    subs: [
      { sub: "strategy", label: "Strategy", module: "strategic_plan" },
      { sub: "workplan", label: "Workplan", module: "strategic_plan" },
      { sub: "actions", label: "Actions", module: "actions" },
      { sub: "task-lists", label: "Task Lists", module: "actions" },
      { sub: "pending-review", label: "Pending review", module: "strategic_plan" },
      { sub: "role-check", label: "Role check", module: "wall_chart_people" },
    ],
  },
  {
    tab: "section-plans",
    label: "Section Plans",
    module: "strategic_plan",
    subs: [],
  },
  {
    tab: "workforce",
    label: "Workforce",
    module: "wall_chart_people",
    subs: [
      { sub: "wall-chart", label: "Wall Chart / List", module: "wall_chart_people" },
      { sub: "campaign-units", label: "Campaign Units", module: "setup" },
      { sub: "universe", label: "Who's in", module: "setup" },
      { sub: "assessments", label: "Assessments", module: "wall_chart_people" },
      { sub: "data-fields", label: "Data fields", module: "data_fields" },
      { sub: "activists", label: "Activists & WOCs", module: "activists_wocs" },
      {
        sub: "foundational-readiness",
        label: "Foundational Readiness",
        module: "strategic_plan",
      },
    ],
  },
  {
    tab: "outcomes",
    label: "Outcomes",
    module: "insights",
    subs: [
      { sub: "reports", label: "Reports", module: "insights" },
      { sub: "results", label: "Results", module: "insights" },
      { sub: "insights", label: "Insights", module: "insights" },
      // Action Network survey/form imports scoped to this campaign.
      { sub: "surveys", label: "Surveys & Forms", module: "surveys_forms" },
    ],
  },
  {
    tab: "outreach",
    label: "Outreach",
    module: "actions",
    subs: [
      { sub: "comms", label: "Comms", module: "actions" },
      { sub: "phone", label: "Phone Ops", module: "actions" },
      { sub: "sms", label: "SMS", module: "actions" },
      { sub: "soc", label: "SOC", module: "actions" },
    ],
  },
  {
    tab: "library",
    label: "Library",
    module: "library",
    subs: [],
  },
  {
    tab: "bargaining",
    label: "Bargaining",
    module: "bargaining",
    subs: [],
    // page.tsx renders this trigger only at that phase; the gate is
    // mode-independent and this package does not change it.
    requiresPhase: "bargaining_to_win",
  },
];
