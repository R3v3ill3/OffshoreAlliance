/**
 * Shared session types consumed by BOTH the desktop call tracker
 * (`components/phone/CallSessionPage.tsx`) and the new mobile dialer
 * (`components/phone/mobile/`). The data-source contract is the seam
 * between UI and transport — staff and mobile-share callers fulfil it
 * differently but render the same conceptual session.
 */

import type {
  CallListItemWithWorker,
  CallListWithStats,
  CallOutcomeDefinition,
  CallScriptSection,
  RecordCallAttemptRequest,
} from "@/types/planner-types";
import type { CtaAmbitionWithAssessment } from "@/components/phone/CtaRatingsPanel";

export type LinkedScript = {
  script_id: number;
  is_current?: boolean;
  wave_label?: string | null;
  linked_at?: string;
  call_scripts?: {
    script_id: number;
    title: string;
    status: string;
    call_objective?: string | null;
    call_script_sections?: CallScriptSection[];
  } | null;
};

export interface ObjectionBankRow {
  objection_id: number;
  label: string;
  description: string | null;
  is_default: boolean;
}

export interface ExpectedIssueRow {
  index: number;
  label: string;
  heat: number;
  notes: string | null;
}

export interface SessionAssessmentRow {
  activity_id: number;
  title: string;
}

export interface CallSessionBootstrap {
  campaignId: number;
  list: CallListWithStats;
  linkedScripts: LinkedScript[];
  outcomeDefinitions: CallOutcomeDefinition[];
  ctaAmbitions: CtaAmbitionWithAssessment[];
  scriptContext: Record<string, string | undefined>;
  /** Objections bank (campaign-scoped + defaults). */
  objectionBank: ObjectionBankRow[];
  /** Expected issues from the latest current situation analysis. */
  expectedIssues: ExpectedIssueRow[];
  /** Assessments selected when the call action was created. */
  sessionAssessments: SessionAssessmentRow[];
  /** phone_call_actions.action_id for attempt attribution. */
  actionId: number | null;
}

export interface CallSessionCaller {
  label: string | null;
  worker_id: number | null;
}

export interface CallSessionDataSource {
  bootstrap: CallSessionBootstrap;
  caller: CallSessionCaller;
  canEditWorker: boolean;
  canCreateTaskList: boolean;
  onLogout?: () => void;

  fetchNext(): Promise<CallListItemWithWorker | null>;
  recordAttempt(req: RecordCallAttemptRequest): Promise<{ attempt_id: number }>;
  releaseClaim(itemId: number): Promise<void>;
  /**
   * Push the claim TTL forward. Returns the new `claimed_at` timestamp when
   * the renewal succeeds, or null when the claim has already been lost
   * (caller should treat as a lost claim).
   */
  renewClaim?(itemId: number): Promise<{ renewed: boolean; claimed_at: string | null }>;
}

/** Soft-claim TTL (matches `claim_next_call_list_item` default 15 min). */
export const CALL_CLAIM_TTL_SECONDS = 15 * 60;
