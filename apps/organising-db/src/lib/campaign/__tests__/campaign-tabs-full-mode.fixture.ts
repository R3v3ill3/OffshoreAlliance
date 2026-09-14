/**
 * Full mode, transcribed by hand from the JSX rather than derived from the
 * registry, so the two can be compared as independent statements of the same
 * fact. If someone edits a label in `CAMPAIGN_TAB_REGISTRY`, this file
 * disagrees and the test fails.
 *
 * Source: src/app/(dashboard)/campaigns/[id]/page.tsx —
 *   top-level TabsList        448-459
 *   plan cluster TabsList     560-567
 *   outcomes cluster          616-620
 *   workforce cluster         644-652
 *   outreach cluster          798-803
 *
 * The JSX writes `Plan &amp; Execution`, `Who&apos;s in` and
 * `Activists &amp; WOCs`; the strings below are what those render as, which
 * is what the tab bar now passes to React as a JS string.
 */

export const FULL_MODE_TABS: readonly { tab: string; label: string }[] = [
  { tab: "overview", label: "Overview" },
  { tab: "plan", label: "Plan & Execution" },
  { tab: "section-plans", label: "Section Plans" },
  { tab: "workforce", label: "Workforce" },
  { tab: "outcomes", label: "Outcomes" },
  { tab: "outreach", label: "Outreach" },
  { tab: "library", label: "Library" },
  { tab: "bargaining", label: "Bargaining" },
];

export const FULL_MODE_SUBS: readonly { tab: string; sub: string; label: string }[] = [
  { tab: "plan", sub: "strategy", label: "Strategy" },
  { tab: "plan", sub: "workplan", label: "Workplan" },
  { tab: "plan", sub: "actions", label: "Actions" },
  { tab: "plan", sub: "task-lists", label: "Task Lists" },
  { tab: "plan", sub: "pending-review", label: "Pending review" },
  { tab: "plan", sub: "role-check", label: "Role check" },
  { tab: "workforce", sub: "wall-chart", label: "Wall Chart / List" },
  { tab: "workforce", sub: "campaign-units", label: "Campaign Units" },
  { tab: "workforce", sub: "universe", label: "Who's in" },
  { tab: "workforce", sub: "assessments", label: "Assessments" },
  { tab: "workforce", sub: "data-fields", label: "Data fields" },
  { tab: "workforce", sub: "activists", label: "Activists & WOCs" },
  { tab: "workforce", sub: "foundational-readiness", label: "Foundational Readiness" },
  { tab: "outcomes", sub: "reports", label: "Reports" },
  { tab: "outcomes", sub: "results", label: "Results" },
  { tab: "outcomes", sub: "insights", label: "Insights" },
  { tab: "outcomes", sub: "surveys", label: "Surveys & Forms" },
  { tab: "outreach", sub: "comms", label: "Comms" },
  { tab: "outreach", sub: "phone", label: "Phone Ops" },
  { tab: "outreach", sub: "sms", label: "SMS" },
  { tab: "outreach", sub: "soc", label: "SOC" },
];

/** The tab that renders only at `campaigns.current_phase = 'bargaining_to_win'`. */
export const PHASE_GATED_TAB = "bargaining";
export const BARGAINING_PHASE = "bargaining_to_win";
