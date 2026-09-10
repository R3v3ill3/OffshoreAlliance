/**
 * The twelve campaign header actions, transcribed from
 * docs/organiser-ux-review/appendix-D-navigation-roles.md §3.3, plus where
 * each one lives in organiser mode.
 *
 * Decision 7 was amended to "no creation path is retired; visibility and
 * prominence are reduced instead". That promise is only worth something if
 * it is checkable, so it is a test: every row below must have a non-empty
 * organiser-mode destination, and the two objects must cover exactly the
 * same twelve ids.
 *
 * `line` is the appendix's own citation into
 * src/components/campaigns/campaign-detail-header-bar.tsx. The working tree
 * has drifted two or three lines since the appendix was written (WP1.6 added
 * imports above the block), so treat these as the appendix's numbers, not as
 * a live assertion about the file.
 */

export interface HeaderActionRow {
  id: string;
  label: string;
  gate: "canWrite" | "none";
  target: string;
  line: string;
}

export const CAMPAIGN_HEADER_ACTIONS: readonly HeaderActionRow[] = [
  { id: "back", label: "Back to campaigns", gate: "none", target: "/campaigns", line: "238-246" },
  { id: "edit-basics", label: "Edit campaign basics", gate: "canWrite", target: "CampaignBasicsEditSheet", line: "258-268, 297-303" },
  { id: "build-list", label: "Build list", gate: "canWrite", target: "?buildList=1 (forces tab=workforce&sub=wall-chart)", line: "85-104, 148-158" },
  { id: "import-workers", label: "Import worker list", gate: "canWrite", target: "WorkerImportWizard", line: "160-163, 318-328" },
  { id: "add-assessment", label: "Add assessment", gate: "canWrite", target: "CreateAssessmentDialog", line: "164-166, 304-317" },
  { id: "task-management", label: "Task management", gate: "canWrite", target: "?tab=plan&sub=task-lists&from=header", line: "167-171" },
  { id: "create-phone-call", label: "Create Phone Call", gate: "canWrite", target: "CreatePhoneCallOrchestrator", line: "174-182" },
  { id: "create-email", label: "Create Email", gate: "canWrite", target: "CreateEmailOrchestrator", line: "183-191" },
  { id: "create-sms", label: "Create SMS", gate: "canWrite", target: "CreateSmsOrchestrator", line: "192-200" },
  { id: "rerun-wizard", label: "Re-run wizard", gate: "canWrite", target: "/campaigns/new?cid=&edit=1", line: "209-214" },
  { id: "all-settings", label: "All settings", gate: "canWrite", target: "/campaigns/[id]/settings", line: "215-220" },
  { id: "view-full-plan", label: "View full plan", gate: "canWrite", target: "/campaigns/[id]/plan", line: "221-223" },
];

/**
 * Where each action goes when the resolved workspace mode is `organiser`.
 * Nothing is removed; five actions are demoted into the ⋯ overflow and are
 * additionally reachable from the Setup tab's link cards.
 */
export const ORGANISER_ACTION_DESTINATIONS: Readonly<Record<string, string>> = {
  back: "Header — unchanged, the back arrow left of the campaign name",
  "edit-basics": "Header — unchanged, the pencil beside the campaign name",
  "build-list": 'Header — the "Build list" toggle button (promoted out of the Build ▾ menu)',
  "import-workers": '⋯ overflow, and the Setup tab\'s "Import worker list" card',
  "add-assessment": "New action ▾ → Assessment",
  "task-management":
    "⋯ overflow (the link to ?tab=plan&sub=task-lists&from=header); the create half is New action ▾ → Task list",
  "create-phone-call": "New action ▾ → Call list",
  "create-email": "New action ▾ → Email",
  "create-sms": "New action ▾ → SMS",
  "rerun-wizard": '⋯ overflow, and the Setup tab\'s "Re-run wizard" card',
  "all-settings": '⋯ overflow, and the Setup tab\'s "Basics & all settings" card',
  "view-full-plan":
    '⋯ overflow, the Setup tab\'s "Strategic plan" card, and More → Plan & Execution when the module is on',
};
