/**
 * Shapes shared by the resolve-names route (server) and the two import
 * wizards (client). No database imports here so the wizards can import it.
 * DA0.3 plan §2.4.2–2.4.3.
 */

import type { MembershipImportType } from "@/lib/import/membership-import-types";

export type NameEntity = "employer" | "worksite";

export type ResolutionStatus =
  | "exact"
  | "alias"
  | "auto"
  | "needs_review"
  | "unmatched"
  | "rejected";

export interface ResolutionProposal {
  id: number;
  name: string;
  score: number;
  is_principal: boolean;
}

export interface ResolutionOutcome {
  /** The string as first seen in the file (duplicates collapse on the fold). */
  rawName: string;
  /** foldName(rawName) */
  normalisedName: string;
  status: ResolutionStatus;
  /** Set for exact | alias | auto; null otherwise. Never a row outside the reference set. */
  resolvedId: number | null;
  /** Canonical name of resolvedId, for display. */
  resolvedName: string | null;
  /** auto | needs_review: the top proposal's score. */
  score: number | null;
  method: "exact" | "alias" | "fuzzy" | null;
  /** Top-3 (NAME_MATCH_THRESHOLDS.TOP_N), best first. */
  proposals: ResolutionProposal[];
  /** true only for auto when the raw string is not the canonical name itself. */
  writesAlias: boolean;
  /** Input strings that folded to this outcome. */
  occurrences: number;
}

/** A distinct name from the file with how often it occurs and its companion string. */
export interface ResolveNameInput {
  raw: string;
  occurrences: number;
  /** The worksite string that accompanied this employer string most often, or vice versa. */
  otherRaw?: string | null;
}

export type ResolveNamesImportType = "workers_wizard" | `membership_${MembershipImportType}`;

export interface ResolveNamesRequest {
  importType: ResolveNamesImportType;
  fileName: string;
  /** false: dry run (the wizards' matching steps). true: create the import_logs row, write auto aliases and queue rows. */
  persist: boolean;
  employerNames: ResolveNameInput[];
  worksiteNames: ResolveNameInput[];
  sourceContext?: { weeklyBatchId?: number | null; sourceKinds?: string[] };
}

export interface ResolveNamesResponse {
  success: boolean;
  /** The import_logs row created for a persist call; null on a dry run. */
  importId: number | null;
  employers: ResolutionOutcome[];
  worksites: ResolutionOutcome[];
  /** Rows now open in the queue for this call (needs_review + unmatched). */
  queued: number;
  aliasesWritten: number;
  error?: string;
}

/** Outcomes that leave the string in the queue for a reviewer. */
export function isQueuedOutcome(status: ResolutionStatus): boolean {
  return status === "needs_review" || status === "unmatched";
}

/**
 * @param persisted false for the wizards' dry run (nothing written yet),
 * true once the apply call has persisted the outcomes.
 */
export function resolutionStatusLabel(status: ResolutionStatus, persisted = false): string {
  switch (status) {
    case "exact":
      return "Exact match";
    case "alias":
      return "Known alias";
    case "auto":
      return persisted ? "Matched (alias saved)" : "Will match (alias to be saved on import)";
    case "needs_review":
      return "Queued — needs review";
    case "unmatched":
      return "Queued — no match";
    case "rejected":
      return "Rejected earlier (not an employer / worksite)";
  }
}
