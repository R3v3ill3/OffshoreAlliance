import type { WallChartAssessmentOption } from "../types";
import type {
  ParticipationMappableField,
  ParticipationMatchResultRow,
  ResponseValueTarget,
} from "@/lib/import/participation-import-shared";

export type WizardStep =
  | "source"
  | "assessment"
  | "mapping"
  | "match"
  | "review"
  | "done";

export interface CsvData {
  fileName: string;
  headers: string[];
  rows: Record<string, string>[];
}

/** AN API participant (Phase 2 source). */
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
  | { mode: "new"; title: string; isBinary: boolean; supporterOutcomeValue: string };

export type ColumnMap = Partial<Record<ParticipationMappableField, string>>;

/** One import row after identity extraction + response resolution. */
export interface ImportRow {
  key: string;
  emails: string[];
  phones: string[];
  firstName: string;
  lastName: string;
  rawResponse: string | null;
  target: ResponseValueTarget;
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
}
