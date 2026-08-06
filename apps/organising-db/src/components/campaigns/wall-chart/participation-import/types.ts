import type { WallChartAssessmentOption } from "../types";
import type {
  ParticipationMappableField,
  ParticipationMatchCandidate,
  ParticipationMatchResultRow,
  ResponseValueMapping,
  ResponseValueTarget,
} from "@/lib/import/participation-import-shared";

export type WizardStep = "source" | "mapping" | "match" | "review" | "done";

export interface CsvData {
  fileName: string;
  headers: string[];
  rows: Record<string, string>[];
}

/** AN API participant (API sync source). */
export interface AnParticipantRow {
  an_person_id: string;
  emails: string[];
  phones: string[];
  given_name: string;
  family_name: string;
  responded_at: string | null;
  /** Worker already known via workers.action_network_id. */
  resolved_worker_id: number | null;
}

export interface AnActionSummary {
  resource_type: "form" | "survey" | "petition" | "event";
  id: string;
  title: string;
  browser_url: string | null;
  created_date: string | null;
  total_records: number | null;
  /** Assessment already linked to this action (enables re-sync). */
  linked_activity_id: number | null;
  linked_activity_title: string | null;
}

export type WizardSource =
  | { kind: "csv"; csv: CsvData }
  | { kind: "an"; action: AnActionSummary; participants: AnParticipantRow[] };

export type AssessmentChoice =
  | { mode: "existing"; option: WallChartAssessmentOption }
  | {
      mode: "new";
      title: string;
      isBinary: boolean;
      supporterOutcomeValue: string;
      /** Perception-of-others question — excluded from cumulative ratings. */
      isPerception: boolean;
      /** 1–5 scale: label the points with the mapped answer values. */
      useAnswerLabels: boolean;
    };

/**
 * One survey question (CSV column) mapped onto one assessment. AN sync
 * mode has a single question with column = null (bare participation).
 */
export interface QuestionMapping {
  id: string;
  column: string | null;
  assessment: AssessmentChoice | null;
  /** Per-distinct-value mapping (CSV mode with a column). */
  valueMappings: ResponseValueMapping[];
  /** Value recorded for every row when there is no column (AN mode). */
  fixedTarget: ResponseValueTarget;
  nonResponders: { enabled: boolean; target: ResponseValueTarget };
}

export type ColumnMap = Partial<Record<ParticipationMappableField, string>>;

export interface RowQuestionValue {
  questionId: string;
  raw: string | null;
  target: ResponseValueTarget;
  keepNote: boolean;
}

/** One import row after identity extraction + response resolution. */
export interface ImportRow {
  key: string;
  emails: string[];
  phones: string[];
  firstName: string;
  lastName: string;
  /** One entry per question whose target isn't "ignore". */
  values: RowQuestionValue[];
  /** AN sync mode: pre-resolved worker + AN person id. */
  resolvedWorkerId?: number | null;
  anPersonId?: string | null;
}

export interface RowDecision {
  action: "match" | "create" | "skip";
  workerId: number | null;
  addToCampaign: boolean;
}

export interface MatchState {
  results: ParticipationMatchResultRow[];
  decisions: Record<string, RowDecision>;
  /** Workers linked by hand via the search picker, keyed by row key. */
  manualCandidates: Record<string, ParticipationMatchCandidate>;
}

/** Transaction-report cleanup stats shown in the mapping step. */
export interface RowCleanupStats {
  duplicatesCollapsed: number;
  skippedNoIdentity: number;
}
