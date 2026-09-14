/**
 * The campaign page's surface inventory, hand-written from
 * docs/organiser-ux-review/appendix-D-navigation-roles.md §3.2 — not derived
 * from the registry, so it is a genuine second opinion about what exists.
 *
 * The appendix counts "8 top-level tabs; 20 second-level sub-tabs (6 + 7 + 3
 * + 4); 16 third-level tabs/toggles (Comms 3, SMS 4, Activists 4, Library 3,
 * Workforce view toggle 2) → ≈44 distinct surfaces" (appendix line 166).
 *
 * It undercounts by one. `InlineSmsOpsPanel.tsx:224` declares
 * `SMS_VIEWS = ['blasts', 'inbox', 'surveys', 'relays', 'chats']` and the
 * TabsList renders five triggers — Blasts, Inbox, Surveys, Chats **and
 * Relays**. The appendix's citation (`InlineSmsOpsPanel.tsx:292-304`) stops
 * one trigger short. Relays is the relay-with-attribution feature the SMS
 * module brief locked in, so it is a real surface, not a stale one.
 *
 * This fixture therefore held 45 rows: the 44 the appendix enumerates plus
 * Relays, flagged in its `appendix` field so the discrepancy is visible in
 * the data rather than only in a comment. A 46th — Outcomes › Surveys &
 * Forms, the Action Network survey importer — was added after the appendix
 * was written and is flagged the same way.
 */

export interface SurfaceFixtureRow {
  /** Stable id, e.g. "outreach/sms#relays". */
  id: string;
  level: 1 | 2 | 3;
  /** The ?tab= value. */
  tab: string;
  /** The ?sub= value, or null for a level-1 row. */
  sub: string | null;
  /** Level 3 only: the component-internal tab value. */
  third: string | null;
  label: string;
  /** Where appendix D 3.2 records it, or "not counted (see wp1.4 §2.3)". */
  appendix: string;
}

const NOT_COUNTED = "not counted (see wp1.4 §2.3)";

export const CAMPAIGN_SURFACES: readonly SurfaceFixtureRow[] = [
  // ── level 1: the eight top-level tabs (appendix §3.2 table, rows 1-8) ──
  { id: "overview", level: 1, tab: "overview", sub: null, third: null, label: "Overview", appendix: "3.2 table row 1" },
  { id: "plan", level: 1, tab: "plan", sub: null, third: null, label: "Plan & Execution", appendix: "3.2 table row 2" },
  { id: "section-plans", level: 1, tab: "section-plans", sub: null, third: null, label: "Section Plans", appendix: "3.2 table row 3" },
  { id: "workforce", level: 1, tab: "workforce", sub: null, third: null, label: "Workforce", appendix: "3.2 table row 4" },
  { id: "outcomes", level: 1, tab: "outcomes", sub: null, third: null, label: "Outcomes", appendix: "3.2 table row 5" },
  { id: "outreach", level: 1, tab: "outreach", sub: null, third: null, label: "Outreach", appendix: "3.2 table row 6" },
  { id: "library", level: 1, tab: "library", sub: null, third: null, label: "Library", appendix: "3.2 table row 7" },
  { id: "bargaining", level: 1, tab: "bargaining", sub: null, third: null, label: "Bargaining", appendix: "3.2 table row 8 (phase-gated)" },

  // ── level 2: the twenty sub-tabs (6 + 7 + 3 + 4) ──────────────────────
  { id: "plan/strategy", level: 2, tab: "plan", sub: "strategy", third: null, label: "Strategy", appendix: "3.2 table row 2" },
  { id: "plan/workplan", level: 2, tab: "plan", sub: "workplan", third: null, label: "Workplan", appendix: "3.2 table row 2" },
  { id: "plan/actions", level: 2, tab: "plan", sub: "actions", third: null, label: "Actions", appendix: "3.2 table row 2" },
  { id: "plan/task-lists", level: 2, tab: "plan", sub: "task-lists", third: null, label: "Task Lists", appendix: "3.2 table row 2" },
  { id: "plan/pending-review", level: 2, tab: "plan", sub: "pending-review", third: null, label: "Pending review", appendix: "3.2 table row 2" },
  { id: "plan/role-check", level: 2, tab: "plan", sub: "role-check", third: null, label: "Role check", appendix: "3.2 table row 2" },

  { id: "workforce/wall-chart", level: 2, tab: "workforce", sub: "wall-chart", third: null, label: "Wall Chart / List", appendix: "3.2 table row 4" },
  { id: "workforce/campaign-units", level: 2, tab: "workforce", sub: "campaign-units", third: null, label: "Campaign Units", appendix: "3.2 table row 4" },
  { id: "workforce/universe", level: 2, tab: "workforce", sub: "universe", third: null, label: "Who's in", appendix: "3.2 table row 4 (recorded there as \"Scope\")" },
  { id: "workforce/assessments", level: 2, tab: "workforce", sub: "assessments", third: null, label: "Assessments", appendix: "3.2 table row 4" },
  { id: "workforce/data-fields", level: 2, tab: "workforce", sub: "data-fields", third: null, label: "Data fields", appendix: "3.2 table row 4" },
  { id: "workforce/activists", level: 2, tab: "workforce", sub: "activists", third: null, label: "Activists & WOCs", appendix: "3.2 table row 4" },
  { id: "workforce/foundational-readiness", level: 2, tab: "workforce", sub: "foundational-readiness", third: null, label: "Foundational Readiness", appendix: "3.2 table row 4" },

  { id: "outcomes/reports", level: 2, tab: "outcomes", sub: "reports", third: null, label: "Reports", appendix: "3.2 table row 5" },
  { id: "outcomes/results", level: 2, tab: "outcomes", sub: "results", third: null, label: "Results", appendix: "3.2 table row 5" },
  { id: "outcomes/insights", level: 2, tab: "outcomes", sub: "insights", third: null, label: "Insights", appendix: "3.2 table row 5" },
  // Added after appendix D: the Action Network survey/form importer's
  // campaign-scoped list, under Outcomes.
  { id: "outcomes/surveys", level: 2, tab: "outcomes", sub: "surveys", third: null, label: "Surveys & Forms", appendix: NOT_COUNTED },

  { id: "outreach/comms", level: 2, tab: "outreach", sub: "comms", third: null, label: "Comms", appendix: "3.2 table row 6" },
  { id: "outreach/phone", level: 2, tab: "outreach", sub: "phone", third: null, label: "Phone Ops", appendix: "3.2 table row 6" },
  { id: "outreach/sms", level: 2, tab: "outreach", sub: "sms", third: null, label: "SMS", appendix: "3.2 table row 6" },
  { id: "outreach/soc", level: 2, tab: "outreach", sub: "soc", third: null, label: "SOC", appendix: "3.2 table row 6" },

  // ── level 3: 16 counted + Relays ──────────────────────────────────────
  // Comms 3 — campaign-comms-section.tsx:89-91; ?email_view=inbox addresses one.
  { id: "outreach/comms#drafts", level: 3, tab: "outreach", sub: "comms", third: "drafts", label: "Drafts & Send", appendix: "3.2 counts line (Comms 3)" },
  { id: "outreach/comms#list-builder", level: 3, tab: "outreach", sub: "comms", third: "list-builder", label: "List Builder", appendix: "3.2 counts line (Comms 3)" },
  { id: "outreach/comms#inbox", level: 3, tab: "outreach", sub: "comms", third: "inbox", label: "Inbox", appendix: "3.2 counts line (Comms 3)" },

  // SMS 4 counted + Relays — InlineSmsOpsPanel.tsx:224, 290-312.
  { id: "outreach/sms#blasts", level: 3, tab: "outreach", sub: "sms", third: "blasts", label: "Blasts", appendix: "3.2 counts line (SMS 4)" },
  { id: "outreach/sms#inbox", level: 3, tab: "outreach", sub: "sms", third: "inbox", label: "Inbox", appendix: "3.2 counts line (SMS 4)" },
  { id: "outreach/sms#surveys", level: 3, tab: "outreach", sub: "sms", third: "surveys", label: "Surveys", appendix: "3.2 counts line (SMS 4)" },
  { id: "outreach/sms#chats", level: 3, tab: "outreach", sub: "sms", third: "chats", label: "Chats", appendix: "3.2 counts line (SMS 4)" },
  { id: "outreach/sms#relays", level: 3, tab: "outreach", sub: "sms", third: "relays", label: "Relays", appendix: NOT_COUNTED },

  // Activists 4 — activists-wocs-section.tsx:26, 59-62; addressable via ?view=.
  { id: "workforce/activists#register", level: 3, tab: "workforce", sub: "activists", third: "register", label: "Register", appendix: "3.2 counts line (Activists 4)" },
  { id: "workforce/activists#tasking", level: 3, tab: "workforce", sub: "activists", third: "tasking", label: "4A Tasking", appendix: "3.2 counts line (Activists 4)" },
  { id: "workforce/activists#wocs", level: 3, tab: "workforce", sub: "activists", third: "wocs", label: "WOCs", appendix: "3.2 counts line (Activists 4)" },
  { id: "workforce/activists#structure-tests", level: 3, tab: "workforce", sub: "activists", third: "structure-tests", label: "Structure Tests", appendix: "3.2 counts line (Activists 4)" },

  // Library 3 — library/campaign-library.tsx:30-32; local useState, not addressable.
  { id: "library#documents", level: 3, tab: "library", sub: null, third: "documents", label: "Documents", appendix: "3.2 counts line (Library 3)" },
  { id: "library#agreements", level: 3, tab: "library", sub: null, third: "agreements", label: "Agreements", appendix: "3.2 counts line (Library 3)" },
  { id: "library#offers", level: 3, tab: "library", sub: null, third: "offers", label: "Offers", appendix: "3.2 counts line (Library 3)" },

  // Workforce view toggle 2 — workforce-board.tsx:33-49, workforce-view.ts:19-25.
  { id: "workforce/wall-chart#wall-chart", level: 3, tab: "workforce", sub: "wall-chart", third: "wall-chart", label: "Wall chart", appendix: "3.2 counts line (Workforce view toggle 2)" },
  { id: "workforce/wall-chart#list", level: 3, tab: "workforce", sub: "wall-chart", third: "list", label: "List", appendix: "3.2 counts line (Workforce view toggle 2)" },
];

/** 8 + 20 + 16, appendix-D-navigation-roles.md:166. */
export const APPENDIX_D_COUNT = 44;

/** The parent `(tab, sub)` pair a fixture row is reached through. */
export function surfaceOf(row: SurfaceFixtureRow): { tab: string; sub: string | null } {
  return { tab: row.tab, sub: row.sub };
}
